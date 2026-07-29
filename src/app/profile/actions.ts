"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveDisplayName } from "@/lib/bills/displayName";
import type { ProfileRow } from "@/lib/bills/types";

export interface SaveProfileResult {
  /** The self-peer kept its old name because another peer already has this one. */
  peerRenameConflict: boolean;
}

export async function saveProfile(
  patch: Partial<Omit<ProfileRow, "user_id">>,
): Promise<SaveProfileResult> {
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
  // Note `!== undefined`, not a truthiness check: clearing the field must rename
  // the peer back down the fallback chain, or every bill keeps a stale name with
  // no way to resync short of retyping the old value and then the new one.
  if (patch.display_name !== undefined) {
    const nextName = resolveDisplayName(patch.display_name, {
      fullName: user.user_metadata?.full_name,
      name: user.user_metadata?.name,
      email: user.email,
    });
    const { error: peerError } = await supabase
      .from("peers")
      .update({ name: nextName })
      .eq("organizer_id", user.id)
      .eq("linked_user_id", user.id);

    // A unique (organizer_id, name) clash must not fail the profile save, but it
    // must not be swallowed either: the bills would silently keep the old name
    // while the form flashed บันทึกแล้ว, which is a lie about the only thing this
    // field does. Report it so the form can say so.
    if (peerError) return { peerRenameConflict: peerError.code === "23505" };
  }

  return { peerRenameConflict: false };
}
