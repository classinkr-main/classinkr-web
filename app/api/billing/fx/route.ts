import { NextResponse } from "next/server"

import { getFxRates } from "@/lib/billing/fx"

export async function GET() {
  try {
    const { usdKrw, cnyKrw, fetchedAt, source, isStale } = await getFxRates()
    return NextResponse.json(
      {
        // 구 필드 (Phase 1 클라이언트 호환)
        rate: usdKrw,
        // 명시적 필드
        usdKrw,
        cnyKrw,
        fetchedAt,
        source,
        isStale,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=1800",
        },
      }
    )
  } catch (error) {
    console.error("[billing/fx] GET error:", error)
    return NextResponse.json({ error: "환율 조회에 실패했습니다." }, { status: 500 })
  }
}
