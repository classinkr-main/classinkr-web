import { NextRequest, NextResponse } from "next/server"
import { kstToday } from "@/lib/marketing/perf-assemble"
import { fetchNaverAdsDaily, NaverAdConfigError } from "@/lib/naver/searchad"
import { upsertNaverAdsDaily } from "@/lib/repositories/naver-ads-daily"

// /stats 를 (일수 × 캠페인 청크) 만큼 부른다 — trailing 3일이면 수 회지만, 계정이 커지면
// 늘어난다. 플랫폼 기본값(짧음)이면 페이징 도중 잘리므로 명시한다.
export const maxDuration = 60

/**
 * 네이버 검색광고 일자별 성과 동기화 (Vercel Cron 매일 1회).
 *
 * trailing 재적재 3일 — 네이버는 Google 만큼 소급 정정이 크지 않지만 당일 마감 전 수치가
 * 흔들린다. Google(7일)보다 짧게 잡는 이유는 여기 재적재 비용이 일수에 비례해서다
 * (/stats 는 하루씩 조회한다).
 *
 * 인증은 CRON_SECRET Bearer 하나뿐이다 — Vercel 이 크론에 붙이는 건 그 헤더이지
 * x-vercel-cron 이 아니다(sync-meta-insights 와 같은 규약).
 */
export const dynamic = "force-dynamic"

const TRAILING_DAYS = 3

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const since = kstToday(-TRAILING_DAYS)
  const until = kstToday(0)

  try {
    const { rows, failedDates, campaignCount, truncated } = await fetchNaverAdsDaily({
      since,
      until,
    })
    const upserted = await upsertNaverAdsDaily(rows)
    // 부분 실패·절단을 ok:true 안에 숨기지 않는다 — 둘 다 없어야 완전 동기화다.
    return NextResponse.json({
      ok: failedDates.length === 0 && !truncated,
      since,
      until,
      campaignCount,
      fetched: rows.length,
      upserted,
      failedDates,
      truncated,
    })
  } catch (error) {
    if (error instanceof NaverAdConfigError) {
      // 미설정은 실패가 아니라 "아직 안 붙임" — 기존 스냅샷을 건드리지 않고 503 으로 알린다.
      return NextResponse.json(
        { ok: false, configured: false, error: "네이버 검색광고 연동이 설정되지 않았습니다." },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { ok: false, since, until, error: error instanceof Error ? error.message : "sync failed" },
      { status: 500 }
    )
  }
}
