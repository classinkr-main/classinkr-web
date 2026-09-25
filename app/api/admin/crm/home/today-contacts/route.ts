import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { isTodayContactsCacheable, parseTodayContactsLimit } from "@/lib/crm/today-contacts-request"
import {
  CURRENT_ADMIN_OWNER_TOKEN,
  findAdminCrmOwner,
  listAdminUserDirectory,
} from "@/lib/repositories/admin-users"
import { getCrmTodayContacts } from "@/lib/repositories/crm-today-contacts"

// 현황 "오늘 연락"(C안 ①) 목록 — 여섯 원천을 한 목록으로(lib/repositories/crm-today-contacts.ts).
// 쿼리: owner(''=담당 전체 · '__me'=요청자 · 이름), limit(기본 60 · 최대 150), includeHandled(기본 1), force(있으면 새로고침).
// 응답은 평평한 CrmTodayContacts JSON(lib/crm/today-contact-types.ts). 읽기 전용 — 쓰기는 ./outcome 라우트.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const url = new URL(req.url)
    const ownerParam = url.searchParams.get("owner")?.trim() ?? ""
    const isMine = ownerParam === CURRENT_ADMIN_OWNER_TOKEN
    // '__me' — 우선순위 큐 라우트와 같은 해석. 담당 매핑이 없으면 아무 행과도 겹치지 않는 키로 빈 목록을 낸다
    // (담당 전체로 새지 않게).
    let resolvedOwnerKeys: string[] | null = null
    if (isMine) {
      const current = findAdminCrmOwner(await listAdminUserDirectory(), admin)
      resolvedOwnerKeys = current.ownerKeys.length ? current.ownerKeys : ["__no_current_admin_owner__"]
    }
    const includeHandledParam = url.searchParams.get("includeHandled")
    // 새로고침(?force=1) — overview·priority-queue 라우트와 같은 계약(파라미터 존재 여부로 판정).
    const force = url.searchParams.has("force")

    const data = await getCrmTodayContacts({
      limit: parseTodayContactsLimit(url.searchParams.get("limit")),
      owner: isMine ? null : ownerParam || null,
      ownerKeys: resolvedOwnerKeys,
      includeHandled: includeHandledParam !== "0" && includeHandledParam !== "false",
      force,
    })

    // 새로고침과 강등 응답(필수 원천 중 하나라도 못 읽음)은 브라우저 캐시에 두지 않는다 — 원천이 돌아와도 캐시 수명
    // 동안 빠진 목록이 남지 않게(isTodayContactsCacheable — 화면 캐시도 같은 판정으로 지운다).
    const response = adminCachedJson(data)
    if (force || !isTodayContactsCacheable(data)) response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    console.error("[GET /api/admin/crm/home/today-contacts]", error)
    return NextResponse.json({ error: "Failed to load today contacts" }, { status: 500 })
  }
}
