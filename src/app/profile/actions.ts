"use server";

import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/bills/types";

export async function saveProfile(
  patch: Partial<Omit<ProfileRow, "user_id">>,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not signed in");
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, ...patch });
  if (error) throw new Error(`saveProfile: ${error.message}`);

  // ADR-0010: the self-peer's name IS the display name, so keep them in step.
  // A unique (organizer_id, name) collision with a hand-made peer is ignored on
  // purpose: the profile save already succeeded, and failing here would strand
  // the user on a save error they cannot act on.
  const displayName = patch.display_name?.trim();
  if (displayName) {
    await supabase
      .from("peers")
      .update({ name: displayName })
      .eq("organizer_id", user.id)
      .eq("linked_user_id", user.id);
  }
}
