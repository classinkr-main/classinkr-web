import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import {
  CURRENT_ADMIN_OWNER_TOKEN,
  findAdminCrmOwner,
  listAdminUserDirectory,
} from "@/lib/repositories/admin-users"
import {
  getCrmUnifiedCustomers,
  type CrmUnifiedSavedView,
  type CrmUnifiedCustomerSource,
  type CrmUnifiedLifecycle,
} from "@/lib/repositories/crm-unified-customers"

function parseSource(value: string | null): CrmUnifiedCustomerSource | "all" {
  return value === "lead" || value === "neo_account" || value === "customer" ? value : "all"
}

function parseLifecycle(value: string | null): CrmUnifiedLifecycle | "all" {
  if (
    value === "new_lead" ||
    value === "active_lead" ||
    value === "account_risk" ||
    value === "active_account" ||
    value === "closed"
  ) {
    return value
  }
  return "all"
}

function parseSavedView(value: string | null): CrmUnifiedSavedView {
  if (
    value === "priority" ||
    value === "new_leads" ||
    value === "needs_care" ||
    value === "my_owner" ||
    value === "recent_contact" ||
    value === "active_deal" ||
    value === "expiring" ||
    value === "dormant" ||
    value === "hot_lead" ||
    value === "upsell" ||
    value === "site_leads" ||
    value === "unanswered" ||
    value === "meta_leads" ||
    value === "registered_leads"
  ) {
    return value
  }
  return "all"
}

// 리드 보드의 `unconfirmed=1`과 같은 의미 — 확인 게이트를 우회해 미확인 리드를 목록에 포함한다.
function parseIncludeUnconfirmed(value: string | null) {
  return value === "1" || value === "true"
}

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(Math.floor(parsed), max))
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const url = new URL(req.url)
    const ownerParam = url.searchParams.get("owner") ?? undefined
    const isMine = ownerParam === CURRENT_ADMIN_OWNER_TOKEN
    const currentOwner = isMine ? findAdminCrmOwner(await listAdminUserDirectory(), admin) : null
    const ownerKeys = isMine
      ? currentOwner?.ownerKeys.length
        ? currentOwner.ownerKeys
        : ["__no_current_admin_owner__"]
      : undefined
    // 새로고침(?force=1) — 홈 우선순위 큐 라우트와 같은 계약(파라미터 존재 여부로 판정).
    // 서버 소스 스냅샷 Data Cache(60초)를 우회해 방금 등록한 리드·동기화 결과를 즉시 반영하고,
    // 응답도 브라우저 프라이빗 캐시에 남기지 않는다(no-store).
    const force = url.searchParams.has("force")
    const customers = await getCrmUnifiedCustomers({
      q: url.searchParams.get("q") ?? undefined,
      source: parseSource(url.searchParams.get("source")),
      lifecycle: parseLifecycle(url.searchParams.get("lifecycle")),
      view: parseSavedView(url.searchParams.get("view")),
      owner: isMine ? undefined : ownerParam,
      ownerKeys,
      tag: url.searchParams.get("tag") ?? undefined,
      includeUnconfirmed: parseIncludeUnconfirmed(url.searchParams.get("includeUnconfirmed")),
      limit: parseBoundedInt(url.searchParams.get("limit"), 100, 1, 200),
      offset: parseBoundedInt(url.searchParams.get("offset"), 0, 0, 100_000),
      bypassCache: force,
    })
    const response = adminCachedJson(customers)
    if (force) response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    console.error("[GET /api/admin/crm/customers/unified]", error)
    // 클라이언트가 이 문자열을 배너에 그대로 띄운다 — 한국어 고정 문구.
    return NextResponse.json({ error: "통합 고객 목록을 불러오지 못했습니다." }, { status: 500 })
  }
}
