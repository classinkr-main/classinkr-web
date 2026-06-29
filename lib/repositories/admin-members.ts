/**
 * Admin Members — 배정 가능한 영업담당자(=활성 admin_profiles) 목록.
 * deals.owner_id는 auth.users를 참조하고, admin_profiles.user_id가 그 id다.
 */

import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export interface AdminMember {
  userId: string
  name: string
  role: string
}

export async function listAdminMembers(): Promise<AdminMember[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("admin_profiles")
    .select("user_id, display_name, role, status")
    .eq("status", "ACTIVE")
    .order("display_name", { ascending: true })

  if (error) throw error

  return (
    (data as { user_id: string; display_name: string | null; role: string }[] | null) ?? []
  ).map((row) => ({
    userId: row.user_id,
    name: row.display_name?.trim() || "(이름 없음)",
    role: row.role,
  }))
}
