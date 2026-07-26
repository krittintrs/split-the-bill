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
}
