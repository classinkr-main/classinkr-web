"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { InsertActivityLog } from "@/lib/supabase/database.types.v2";
import type { ActivityLog } from "@/lib/partner-portal/types";

export async function logActivity(
  input: InsertActivityLog
): Promise<ActivityLog> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("activity_logs")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data as ActivityLog;
}
