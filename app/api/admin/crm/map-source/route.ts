import { NextRequest, NextResponse } from "next/server"

import {
  CRM_STAFF_ADMIN_API_ROLES,
  STAFF_ADMIN_API_ROLES,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import { parseNaverMapFolderId, type NaverMapPlaceInput } from "@/lib/crm/naver-map-source"
import {
  importCrmNaverMapSource,
  listCrmNaverMapSource,
} from "@/lib/repositories/crm-naver-map"

export const dynamic = "force-dynamic"

function parsePlace(value: unknown): NaverMapPlaceInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.name !== "string" || !row.name.trim()) return null
  if (typeof row.address !== "string" || !row.address.trim()) return null
  if (row.category != null && typeof row.category !== "string") return null
  return {
    name: row.name.trim(),
    category: typeof row.category === "string" ? row.category.trim() || null : null,
    address: row.address.trim(),
  }
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    return NextResponse.json(
      await listCrmNaverMapSource({ bypassCache: req.nextUrl.searchParams.get("fresh") === "1" })
    )
  } catch (error) {
    console.error("[GET /api/admin/crm/map-source]", error)
    return NextResponse.json({ error: "네이버 지도 원천을 불러오지 못했습니다." }, { status: 500 })
  }
}

// 공유지도 "가져오기"는 외부 원천 적재다 — external_crm_sync_runs 실행을 기록하고
// external_crm_records를 폴더 단위로 upsert하며, fullSnapshot이면 이전 스냅샷 전체를
// stale로 되돌린다. 장소 하나를 CRM 레코드에 잇는 형제 라우트(map-source/link,
// CRM_STAFF)와 달리 원천 테이블 전체를 바꾸는 동작이라 external-sync POST와 같은
// 관리자 전용(STAFF_ADMIN_API_ROLES)으로 둔다. 종전에도 POST 기본 역할이 STAFF였으므로
// 동작은 그대로이고, 기본값 의존을 없애 역할 매트릭스 테스트에 고정하기 위해 명시한다.
export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || Array.isArray(body)) {
    return NextResponse.json({ error: "요청 본문은 JSON 객체여야 합니다." }, { status: 400 })
  }

  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : ""
  const sourceLabel = typeof body.sourceLabel === "string" ? body.sourceLabel.trim() : null
  const expectedCount = Number(body.expectedCount)
  const fullSnapshot = body.fullSnapshot === true
  const places = Array.isArray(body.places) ? body.places.map(parsePlace) : []

  if (!parseNaverMapFolderId(sourceUrl)) {
    return NextResponse.json({ error: "올바른 네이버 공유지도 폴더 URL이 필요합니다." }, { status: 400 })
  }
  if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > 1_000) {
    return NextResponse.json({ error: "예상 장소 수는 1~1000 사이의 정수여야 합니다." }, { status: 400 })
  }
  if (places.length === 0 || places.some((place) => place == null)) {
    return NextResponse.json({ error: "모든 장소에 이름과 주소가 필요합니다." }, { status: 400 })
  }
  if (places.length !== expectedCount) {
    return NextResponse.json(
      { error: `예상 ${expectedCount}개와 입력 ${places.length}개가 일치하지 않습니다.` },
      { status: 400 }
    )
  }

  try {
    const result = await importCrmNaverMapSource({
      sourceUrl,
      sourceLabel,
      expectedCount,
      fullSnapshot,
      places: places as NaverMapPlaceInput[],
      actor: admin.name?.trim() || admin.userId || admin.role,
    })
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    console.error("[POST /api/admin/crm/map-source]", error)
    const message = error instanceof Error ? error.message : "네이버 지도 원천을 가져오지 못했습니다."
    const status = /필요|일치|중복|정수|URL/.test(message) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
