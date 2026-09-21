import { NextRequest, NextResponse } from "next/server"
import { fetchGoogleAdsDaily, GoogleAdsConfigError } from "@/lib/google/ads"
import { kstToday } from "@/lib/marketing/perf-assemble"
import { upsertGoogleAdsDaily } from "@/lib/repositories/google-ads-daily"

export const maxDuration = 60

/**
 * Google Ads 일자별 성과 동기화 (Vercel Cron 매일 1회).
 *
 * trailing 재적재 **7일** — Meta(3일)보다 긴 이유는 metrics.conversions 가 전환 시각이 아니라
 * **클릭 시각에 귀속**되기 때문이다. 오늘 일어난 전환이 사흘 전 클릭 일자에 붙어 과거 행이
 * 계속 바뀐다. 3일만 다시 읽으면 그보다 오래된 전환이 영영 누락된다.
 *
 * 인증은 CRON_SECRET Bearer 하나뿐이다 — Vercel 이 크론에 붙이는 건 그 헤더이지
 * x-vercel-cron 이 아니다(sync-meta-insights 와 같은 규약).
 */
export const dynamic = "force-dynamic"

const TRAILING_DAYS = 7

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const since = kstToday(-TRAILING_DAYS)
  const until = kstToday(0)

  try {
    const { rows, currency, truncated } = await fetchGoogleAdsDaily({ since, until })
    const upserted = await upsertGoogleAdsDaily(rows, currency)
    // 절단을 ok:true 안에 숨기지 않는다 — 잘린 동기화는 "집행이 줄었다"로 오독된다.
    return NextResponse.json({
      ok: !truncated,
      since,
      until,
      currency,
      fetched: rows.length,
      upserted,
      truncated,
    })
  } catch (error) {
    if (error instanceof GoogleAdsConfigError) {
      // 미설정은 실패가 아니라 "아직 안 붙임" — 기존 스냅샷을 건드리지 않고 503 으로 알린다.
      return NextResponse.json(
        { ok: false, configured: false, error: "Google Ads 연동이 설정되지 않았습니다." },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { ok: false, since, until, error: error instanceof Error ? error.message : "sync failed" },
      { status: 500 }
    )
  }
}
