import { NextRequest, NextResponse } from "next/server"

import {
  CRM_STAFF_ADMIN_API_ROLES,
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

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req)
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
