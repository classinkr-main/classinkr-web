import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { invitePartnerUser } from "@/lib/partner-auth";

/**
 * POST /api/admin/partners/[id]/invite
 * 파트너사에 사용자 초대 — Supabase Auth 초대 이메일 발송 + partner_users 레코드 생성
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req);
  if (err) return err;
  const { id: partnerId } = await params;

  try {
    const { email, role = "member", display_name, invited_by } = await req.json();
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const result = await invitePartnerUser(email, partnerId, role, invited_by ?? "", display_name);
    return NextResponse.json({ userId: result.userId }, { status: 201 });
  } catch (e: unknown) {
    console.error("[POST /api/admin/partners/[id]/invite]", e);
    const msg = e instanceof Error ? e.message : "Failed to invite user";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
