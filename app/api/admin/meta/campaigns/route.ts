import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getMetaCampaignDashboard, MetaConfigError } from "@/lib/meta/marketing"

const ALLOWED_DATE_PRESETS = new Set([
  "today",
  "yesterday",
  "last_7d",
  "last_14d",
  "last_30d",
  "last_90d",
  "this_month",
  "last_month",
])

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const datePreset = req.nextUrl.searchParams.get("datePreset") ?? "last_30d"
  const limitValue = Number(req.nextUrl.searchParams.get("limit") ?? 50)
  const limit = Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 100) : 50
  // 명시 동기화·상태 변경 직후 재조회 — 서버 메모(45초)를 우회해 항상 Graph 를 새로 받는다.
  // 클라이언트는 헤더로 보낸다: 쿼리로 보내면 캐시 키(URL)가 갈라져 기본 키의 낡은 캐시가 남는다.
  const fresh =
    req.nextUrl.searchParams.get("fresh") === "1" || req.headers.get("x-meta-fresh") === "1"

  try {
    const dashboard = await getMetaCampaignDashboard({
      datePreset: ALLOWED_DATE_PRESETS.has(datePreset) ? datePreset : "last_30d",
      limit,
      fresh,
    })

    return NextResponse.json({ ok: true, ...dashboard })
  } catch (error) {
    if (error instanceof MetaConfigError) {
      console.warn(`[GET /api/admin/meta/campaigns] Meta 연동 미설정: ${error.message}`)
      return NextResponse.json(
        { ok: false, configured: false, error: "Meta 연동이 설정되지 않았습니다." },
        { status: 503 }
      )
    }

    console.error("[GET /api/admin/meta/campaigns]", error)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Meta campaign fetch failed.",
      },
      { status: 500 }
    )
  }
}
