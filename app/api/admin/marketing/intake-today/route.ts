// GET /api/admin/marketing/intake-today[?fresh=1]
// "오늘 유입" 라이브 인테이크 — 어드민 public.leads + Compass 리드를 전화 키로 접어 센다.
// 조회·격리·메모는 lib/marketing/intake-today(서버 프리페치와 공유), 창 계산·중복 접기는
// 순수 모듈(lib/marketing/intake-feed)에 있다. 이 라우트는 인증과 응답 포장만 한다.

import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getIntakeToday } from "@/lib/marketing/intake-today"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const fresh = req.nextUrl.searchParams.get("fresh") === "1"
    return NextResponse.json(await getIntakeToday(fresh))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "오늘 유입 집계 실패" },
      { status: 500 }
    )
  }
}
