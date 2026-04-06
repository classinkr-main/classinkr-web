"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { InsertActivityLog } from "@/lib/supabase/database.types.v2";

export async function writeActivityLog(input: InsertActivityLog) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("activity_logs").insert(input);

  if (error) {
    throw error;
  }
}
