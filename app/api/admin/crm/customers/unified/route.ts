import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import {
  CURRENT_ADMIN_OWNER_TOKEN,
  findAdminCrmOwner,
  listAdminUserDirectory,
} from "@/lib/repositories/admin-users"
import { getCrmUnifiedCustomers } from "@/lib/repositories/crm-unified-customers"
import { parseSegmentSpec } from "@/lib/crm/customer-segment-spec"
import {
  parseIncludeUnconfirmedParam,
  parseUnifiedLifecycle,
  parseUnifiedSavedView,
  parseUnifiedSort,
  parseUnifiedSource,
} from "@/lib/crm/unified-view-rules"

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
      source: parseUnifiedSource(url.searchParams.get("source")),
      lifecycle: parseUnifiedLifecycle(url.searchParams.get("lifecycle")),
      view: parseUnifiedSavedView(url.searchParams.get("view")),
      owner: isMine ? undefined : ownerParam,
      ownerKeys,
      tag: url.searchParams.get("tag") ?? undefined,
      includeUnconfirmed: parseIncludeUnconfirmedParam(url.searchParams.get("includeUnconfirmed")),
      // 세그먼트 조건(SG4) — 알 수 없는 값은 파서가 버린다(lib/crm/customer-segment-spec.ts).
      segment: parseSegmentSpec(url.searchParams),
      // 서버 정렬(C1) — 전체를 정렬한 뒤 페이지를 자른다. 없거나 모르는 키면 추천순.
      sort: parseUnifiedSort(url.searchParams.get("sort"), url.searchParams.get("dir")),
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
