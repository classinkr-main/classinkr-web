"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PartnerUser } from "@/lib/supabase/database.types";

export interface PartnerSession {
  userId: string;
  partnerId: string;
  role: PartnerUser["role"];
  displayName: string | null;
}

/**
 * Supabase user_id로 partner_users 조회.
 * 미들웨어 또는 서버 컴포넌트에서 파트너 세션 확인에 사용.
 */
export async function getPartnerSession(userId: string): Promise<PartnerSession | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("partner_users")
    .select("user_id, partner_id, role, display_name, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (error || !data) return null;

  return {
    userId: data.user_id,
    partnerId: data.partner_id,
    role: data.role as PartnerUser["role"],
    displayName: data.display_name,
  };
}

/**
 * 파트너 초대: Supabase Auth에 사용자 생성 + partner_users 레코드 삽입.
 * 어드민이 호출. 초대 이메일은 Supabase Auth inviteUserByEmail이 발송.
 */
export async function invitePartnerUser(
  email: string,
  partnerId: string,
  role: PartnerUser["role"],
  invitedBy: string,
  displayName?: string
): Promise<{ userId: string }> {
  const supabase = createSupabaseAdminClient();

  const { data: invite, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/partner/login`,
  });
  if (inviteErr) throw inviteErr;

  const userId = invite.user.id;
  const { error: insertErr } = await supabase.from("partner_users").insert({
    user_id: userId,
    partner_id: partnerId,
    role,
    display_name: displayName ?? null,
    status: "invited",
    invited_by: invitedBy,
  });
  if (insertErr) throw insertErr;

  // 초대 수락 후 last_login_at 갱신은 /partner/login 에서 처리
  return { userId };
}

/**
 * 파트너 로그인 직후 status → active, last_login_at 갱신.
 */
export async function activatePartnerSession(userId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("partner_users")
    .update({ status: "active", last_login_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("status", ["invited", "active"]);
}
