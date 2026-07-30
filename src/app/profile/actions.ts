"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveDisplayName } from "@/lib/bills/displayName";
import type { ProfileRow } from "@/lib/bills/types";

export interface SaveProfileResult {
  /**
   * Whether the display name reached the bills. "conflict" = another peer holds
   * that name; "failed" = anything else, including the missing-column error you
   * get if this runs before the migration. The user's move is the same either
   * way, but silence is not an option: the profile row saved while every bill
   * kept the old name, and naming the bills is all this field does.
   */
  peerRename: "ok" | "conflict" | "failed";
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

    // A failure here must not fail the profile save, but it must not be
    // swallowed either: the bills would keep the old name while the form flashed
    // บันทึกแล้ว, which is a lie about the only thing this field does.
    if (peerError) {
      console.error("saveProfile: self-peer rename failed", peerError.message);
      return { peerRename: peerError.code === "23505" ? "conflict" : "failed" };
    }
  }

  return { peerRename: "ok" };
}
