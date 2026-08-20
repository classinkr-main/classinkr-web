// GET /api/admin/marketing/insights[?force=1]
// 주간 AI 브리핑 조회 — 대시보드 브리핑 카드의 단일 소스.
//   기본:      저장된 최신 브리핑을 그대로 읽는다(LLM 호출 없음).
//   ?force=1:  "다시 생성" 버튼 — runner 로 새로 만든다(Gemini 왕복, 수십 초 걸릴 수 있음).
//
// ── 계약 ──────────────────────────────────────────────────────
// anomalies 는 브리핑의 신선도와 무관하게 "항상 현재값"이다. 브리핑이 지난주 것(stale)이어도
// 배지는 오늘 수치로 계산한다 — 저장된 payload.anomalies 를 그대로 되쓰면 화면이 지난주
// 이상을 오늘의 이상으로 보여주게 된다.
//
// ── 강등 규칙 ─────────────────────────────────────────────────
// 생성 실패(Gemini 장애·숫자 검증 실패)는 500 이 아니라 { insight: 최신 or null, from, error } 로
// 강등한다. 브리핑 하나 때문에 대시보드 카드가 통째로 죽으면 안 된다(화면은 규칙 기반으로 폴백).

import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import type { AnomalyFlag } from "@/lib/marketing/anomaly"
import { buildMarketingInsight } from "@/lib/marketing/insights/input-builder"
import { runMarketingInsights } from "@/lib/marketing/insights/runner"
import { getLatestInsight, type MarketingInsight } from "@/lib/repositories/marketing-insights"

// ?force=1 은 Gemini 왕복(실측 23.6초)이라 기본 실행 상한으로는 배포 후 504 가 난다.
// 로컬 dev 는 상한이 없어 이 누락이 게이트에 걸리지 않는다 — 다른 Gemini 라우트와 같은 60초.
export const maxDuration = 60

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const force = req.nextUrl.searchParams.get("force") === "1"

  // 이상 감지를 먼저 착수한다 — force 경로의 runner 가 같은 조립 promise 를 재사용하도록
  // (input-builder 의 45초 메모). 실패는 여기서 흡수해 브리핑 경로를 죽이지 않는다.
  const anomaliesPromise: Promise<{ flags: AnomalyFlag[]; error: string | null }> =
    buildMarketingInsight().then(
      (build) => ({ flags: build.flags, error: null }),
      (e) => ({ flags: [], error: `이상 감지 계산 실패: ${messageOf(e)}` })
    )

  try {
    let insight: MarketingInsight | null = null
    let from: string
    let warnings: number | undefined
    const errors: string[] = []

    if (force) {
      // mode=fast — "다시 생성"은 사용자가 화면에서 응답을 기다리는 경로라 품질보다 지연이 먼저다.
      // runner 는 자체 try/catch 로 실패를 stale/error 로 강등한다(throw 하지 않는다).
      const result = await runMarketingInsights({ force: true, mode: "fast" })
      insight = result.insight ?? null
      from = result.from
      warnings = result.numerical_warnings?.length
      if (result.error) errors.push(result.error)
    } else {
      insight = await getLatestInsight("weekly")
      // "empty" = 아직 한 번도 생성되지 않음(크론 미실행·신규 배포) — 실패와 구분한다.
      from = insight ? "stored" : "empty"
    }

    const anomalies = await anomaliesPromise
    if (anomalies.error) errors.push(anomalies.error)

    return NextResponse.json({
      insight,
      anomalies: anomalies.flags,
      from,
      warnings,
      error: errors.length > 0 ? errors.join(" / ") : undefined,
    })
  } catch (error) {
    return NextResponse.json({ error: messageOf(error) }, { status: 500 })
  }
}
