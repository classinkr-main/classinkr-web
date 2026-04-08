/**
 * Unified Portal Context
 *
 * Admin과 Partner 모두 /api/portal/* 라우트를 사용할 수 있도록
 * 단일 컨텍스트로 통합. Partner 인증 → Admin 인증 순서로 시도.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getVerifiedAdminContext } from "@/lib/admin-auth";
import {
  resolvePartnerAccountContext,
  type PartnerAccountContext,
} from "@/lib/partner-portal/context";

/* ─── Types ─────────────────────────────────────────────── */

export interface PortalContextAdmin {
  type: "admin";
  scope: "all";
  userId: string | undefined;
  name: string | undefined;
  role: string;
}

export interface PortalContextPartner {
  type: "partner";
  scope: "account";
  partnerAccountId: string;
  legacyPartnerId: string | null;
  userId: string;
  role: string;
}

export type PortalUserContext = PortalContextAdmin | PortalContextPartner;

/* ─── Resolver ──────────────────────────────────────────── */

export async function resolvePortalContext(
  req: NextRequest
): Promise<PortalUserContext | null> {
  // 1) Partner 인증 시도 (Supabase cookie 기반)
  const partner = await resolvePartnerAccountContext(req);
  if (partner) {
    return partnerToPortal(partner);
  }

  // 2) Admin 인증 시도 (cookie session / Supabase admin_profiles)
  const admin = await getVerifiedAdminContext(req);
  if (admin) {
    return {
      type: "admin",
      scope: "all",
      userId: admin.userId,
      name: admin.name,
      role: admin.role,
    };
  }

  return null;
}

function partnerToPortal(ctx: PartnerAccountContext): PortalContextPartner {
  return {
    type: "partner",
    scope: "account",
    partnerAccountId: ctx.partnerAccountId ?? ctx.legacyPartnerId ?? "",
    legacyPartnerId: ctx.legacyPartnerId,
    userId: ctx.userId,
    role: ctx.role,
  };
}

/* ─── Helpers ───────────────────────────────────────────── */

/** 인증 실패 시 401 응답 반환 */
export async function requirePortalContext(
  req: NextRequest
): Promise<PortalUserContext | NextResponse> {
  const ctx = await resolvePortalContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return ctx;
}

/** context에서 partner_account_id 필터 값 추출. admin이면 null (전체) */
export function getPartnerAccountFilter(
  ctx: PortalUserContext
): string | null {
  return ctx.type === "partner" ? ctx.partnerAccountId : null;
}

/** context가 NextResponse(에러)인지 확인 */
export function isErrorResponse(
  result: PortalUserContext | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
