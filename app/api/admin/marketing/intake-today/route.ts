// GET /api/admin/marketing/intake-today[?fresh=1]
// "오늘 유입" 라이브 인테이크 — 어드민 public.leads + Compass 리드를 전화 키로 접어 센다.
// 조회·격리·캐시는 lib/marketing/intake-today(서버 프리페치와 공유), 창 계산·중복 접기는
// 순수 모듈(lib/marketing/intake-feed)에 있다. 이 라우트는 인증·fresh 만료·응답 포장만 한다.

import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"

import { verifyAdmin } from "@/lib/admin-auth"
import { getCachedIntakeToday, INTAKE_TODAY_CACHE_TAG } from "@/lib/marketing/intake-today"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const fresh = req.nextUrl.searchParams.get("fresh") === "1"
    // fresh=1: 태그를 먼저 하드 만료시킨 뒤(perf/compass-ads 라우트와 동일 패턴) 캐시된
    // 함수를 불러 재계산 + 재적재한다.
    if (fresh) revalidateTag(INTAKE_TODAY_CACHE_TAG, { expire: 0 })
    // JSON 안전성 검사는 shareInFlight 내부에서 이미 수행한다(중복 검사 불필요).
    return NextResponse.json(await getCachedIntakeToday())
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "오늘 유입 집계 실패" },
      { status: 500 }
    )
  }
}
