/**
 * Portal Authorization
 *
 * Partner는 자기 partner_account_id 소속 데이터만 접근 가능.
 * Admin은 모든 데이터 접근 가능.
 */

import { NextResponse } from "next/server";
import type { PortalUserContext } from "./portal-context";

/**
 * 리소스의 partner_account_id가 현재 사용자 권한 범위 내인지 확인.
 * - admin: 항상 통과
 * - partner: 자기 partnerAccountId와 일치해야 함
 */
export function authorizeForAccount(
  ctx: PortalUserContext,
  resourcePartnerAccountId: string
): NextResponse | null {
  if (ctx.type === "admin") return null;

  if (ctx.partnerAccountId !== resourcePartnerAccountId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * partner가 write 시 partner_account_id를 강제 주입.
 * admin은 body에서 받은 값을 사용하되 필수.
 */
export function resolvePartnerAccountId(
  ctx: PortalUserContext,
  bodyPartnerAccountId?: string
): string | null {
  if (ctx.type === "partner") {
    return ctx.partnerAccountId;
  }
  // admin은 body에서 명시적으로 지정
  return bodyPartnerAccountId ?? null;
}

/**
 * actor 정보를 activity log에 기록할 때 사용
 */
export function getActorInfo(ctx: PortalUserContext) {
  return {
    actor_user_id: ctx.userId ?? null,
    actor_role: ctx.type,
  };
}
