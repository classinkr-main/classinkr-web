// lib/marketing/insights/runner.ts
// 주간 브리핑 오케스트레이션 — lib/branch/insights/runner.ts 패턴 미러.
//
// 흐름: 입력 조립 → digest → (force 아니면) 캐시 히트 확인 → Gemini → 숫자 검증
//       → 저장 → fresh. 실패는 마지막 브리핑(stale)으로 강등, 그것도 없으면 error.

import "server-only"

import { buildMarketingInsightInput, digestInput } from "./input-builder"
import { callMarketingGemini, type GeminiMode } from "./gemini-runner"
import { checkMarketingSanity, type NumericalWarning } from "./sanity-check"
import {
  findInsightByDigest,
  getLatestInsight,
  insertInsight,
  type MarketingInsight,
} from "@/lib/repositories/marketing-insights"

const SCOPE = "weekly" as const

/** 이 이상이면 "입력에 없는 숫자를 말하는 브리핑"으로 보고 재시도 → 그래도 넘으면 폐기. */
const MAX_NUMERICAL_WARNINGS = 3

export interface RunMarketingInsightsResult {
  from: "cache" | "fresh" | "stale" | "error"
  insight?: MarketingInsight
  error?: string
  numerical_warnings?: NumericalWarning[]
  retried?: boolean
}

export interface RunMarketingInsightsOptions {
  /** digest 캐시를 건너뛰고 새로 생성한다. */
  force?: boolean
  /**
   * 모델 모드 — force 에서 파생하지 않고 호출자가 명시한다. 마케팅의 실호출자는 둘 다
   * force=true 라(크론 + UI 재생성) force 로 갈랐을 때는 quality 가 영영 실행되지 않았다.
   * 지연을 사람이 기다리는 경로인지(fast) 아닌지(quality)는 호출자만 안다.
   */
  mode?: GeminiMode
}

export async function runMarketingInsights({
  force = false,
  mode = "quality",
}: RunMarketingInsightsOptions = {}): Promise<RunMarketingInsightsResult> {
  try {
    const input = await buildMarketingInsightInput()
    const digest = digestInput(input)

    // 같은 입력이면 다시 부르지 않는다(force 는 이 캐시를 건너뛴다).
    //
    // 알려진 한계: 이 조회→insert 는 원자적이지 않다. 크론과 수동 재생성이 겹치면 둘 다
    // 캐시 미스로 판정해 Gemini 를 두 번 부르고 같은 digest 행이 두 개 생길 수 있다.
    // 현재 스케줄(주 1회 크론 + 사람이 누르는 재생성)에서 충돌 확률이 낮아 감수한다.
    // 정답은 (scope, digest) unique 제약 + upsert 다 — 발생 빈도가 올라가면 그때 마이그레이션.
    if (!force) {
      const cached = await findInsightByDigest(SCOPE, digest)
      if (cached) return { from: "cache", insight: cached }
    }

    let { result, raw, model } = await callMarketingGemini(input, mode)
    let warnings = checkMarketingSanity(input, result)
    let retried = false

    // 경고가 임계 이상이면 1회 재시도하고, 재시도가 더 나을 때만 채택한다(더 나쁘면 원본 유지).
    if (warnings.length >= MAX_NUMERICAL_WARNINGS) {
      retried = true
      const retry = await callMarketingGemini(input, mode)
      const retryWarnings = checkMarketingSanity(input, retry.result)
      if (retryWarnings.length < warnings.length) {
        result = retry.result
        raw = retry.raw
        model = retry.model
        warnings = retryWarnings
      }
    }

    // ── 정직 가드 ──────────────────────────────────────────────
    // 재시도 후에도 경고가 임계 이상이면 저장하지 않는다. 입력에 없는 숫자를 말하는
    // 브리핑은 틀린 브리핑이고, 틀린 브리핑을 보여주는 것보다 지난 브리핑(stale)을
    // 보여주거나 아무것도 보여주지 않는 편이 낫다. 저장까지 막는 이유는, 한 번 저장되면
    // 이후 stale 폴백이 이 오염된 건을 계속 되살리기 때문이다.
    if (warnings.length >= MAX_NUMERICAL_WARNINGS) {
      const reason = `숫자 검증 실패 — 입력에 없는 수치 ${warnings.length}건 (재시도 후에도 임계 초과)`
      const fallback = await getLatestInsight(SCOPE)
      if (fallback) {
        return { from: "stale", insight: fallback, error: reason, numerical_warnings: warnings, retried }
      }
      return { from: "error", error: reason, numerical_warnings: warnings, retried }
    }

    const saved = await insertInsight({
      scope: SCOPE,
      digest,
      headline: result.headline,
      payload: {
        highlights: result.highlights,
        next_actions: result.next_actions,
        // 감지는 코드가 한 것 — 브리핑 본문과 함께 근거를 남긴다(LLM 이 지어낸 목록이 아니다).
        anomalies: input.anomalies,
        period: input.period,
        data_caveats: input.data_caveats,
        _mode: mode,
        _retried: retried,
        _warnings: warnings,
      },
      model,
    })
    // raw 응답은 저장하지 않는다(용량·PII 표면) — 재현에 필요한 건 digest + model + mode 다.
    void raw

    return {
      from: "fresh",
      insight: saved,
      numerical_warnings: warnings.length > 0 ? warnings : undefined,
      retried,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // 생성 경로가 죽어도 마지막 브리핑은 보여준다 — 단, stale 임을 호출자가 알 수 있게 표시한다.
    try {
      const fallback = await getLatestInsight(SCOPE)
      if (fallback) return { from: "stale", insight: fallback, error: msg }
    } catch {
      // 폴백 조회까지 실패하면 원래 에러를 그대로 보고한다.
    }
    return { from: "error", error: msg }
  }
}
