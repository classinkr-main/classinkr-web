// lib/marketing/insights/sanity-check.ts
// 숫자 환각 검증 — lib/branch/insights/sanity-check.ts 기법 미러(입력 숫자 집합 대조 + 근사 허용).
//
// 목적: LLM 이 "입력에 없는 숫자"를 말했는지 기계적으로 잡는다. 브리핑의 신뢰는 수치에서
// 나오므로, 검증을 통과하지 못한 브리핑은 표시하지 않는다(강등 판단은 runner 가 한다).
// 순수 함수라 유닛 테스트 대상이다 — tests/campaigns/marketing-sanity.test.ts.

import "server-only"
import type { MarketingInsightInput } from "./input-builder"
import type { MarketingInsightResult } from "./gemini-runner"

export interface NumericalWarning {
  field: string // "headline" | "highlights[i]" | "next_actions[i].title" | "next_actions[i].why"
  value: number // 출력에서 뽑은 의심 수치
  representation: string // 원문 토큰 (예: "17.9%", "1,234")
  reason: string
}

// 콤마 자릿수 표기(1,234)와 퍼센트 접미를 한 토큰으로 잡는다 — 정규화 후 숫자 비교.
//
// branch 원본은 `\d{1,3}(?:,\d{3})*...|\d+...` 형태였는데, 앞 분기가 먼저 매칭돼
// "9999" 를 "999"+"9" 로 쪼갠다. 쪼개진 999 가 입력의 다른 값(예: 980.2)과 우연히
// 오차범위 안에 들어가면 환각이 통과한다 — 검증기의 존재 이유를 무너뜨리는 구멍이라
// 숫자 런을 통째로 삼키는 형태로 고쳐서 미러했다.
const NUMBER_TOKEN_RE = /[-+]?\d[\d,]*(?:\.\d+)?\s*%?/g

function extractNumbers(text: string): Array<{ value: number; raw: string; isPct: boolean }> {
  const out: Array<{ value: number; raw: string; isPct: boolean }> = []
  for (const match of text.matchAll(NUMBER_TOKEN_RE)) {
    const raw = match[0]
    const cleaned = raw.replace(/[,\s%]/g, "")
    const n = Number(cleaned)
    if (!Number.isFinite(n)) continue
    out.push({ value: n, raw: raw.trim(), isPct: raw.includes("%") })
  }
  return out
}

/** collectInputNumbers 반환 봉투 — all 은 인용 가능한 숫자 전부, pcts 는 그중 "의미가 퍼센트인" 값만. */
interface CollectedInputNumbers {
  all: number[]
  pcts: number[]
}

// 퍼센트 출력 토큰을 "0~200 범위 근사"로 걸러내던 게 원래 로직이었다 — 그런데 리드 21→156 같은
// 정상 급증은 leads_delta_pct 가 643 이라 범위 밖으로 잘려나가 오탐이 되고, 반대로 광고비 USD·
// 리드 수 같은 무관한 큰 값이 우연히 0~200 안에 들어오면 통과해버린다(검증이 우연에 기댐).
// 옳은 방법은 범위가 아니라 "입력의 어느 필드가 의미상 퍼센트인가"를 코드가 직접 아는 것 —
// 그 필드 집합(pcts)하고만 대조한다.
//
// 이상(anomalies) 종류 중 current/baseline 이 퍼센트 의미인 것만 표시한다 — CTR 급락(비율)·
// 페이싱 초과(집행률/경과율). cpl_spike(금액)·leads_drop(건수)는 숫자지만 퍼센트가 아니다.
const PCT_ANOMALY_KINDS = new Set(["ctr_drop", "pacing_over"])

/**
 * 입력에서 인용 가능한 숫자를 전부 모은다(all) — 입력 계약이 평탄한 이유가 이것이다.
 * 그중 의미가 퍼센트인 값은 pcts 에도 넣는다 — 퍼센트 출력 토큰은 이 집합하고만 대조해
 * 광고비 USD·리드 수 같은 무관한 큰 값과 우연히 맞는 것을 막는다.
 * 새 숫자 필드를 input-builder 에 추가하면 여기에도 반드시 추가한다 — 퍼센트 필드면 pushPct 로
 * (all 에만 넣으면 "범위 근사" 시절의 오탐/누락이 그대로 되살아난다).
 */
function collectInputNumbers(input: MarketingInsightInput): CollectedInputNumbers {
  const all: number[] = []
  const pcts: number[] = []
  const pushAll = (n: number | null | undefined) => {
    if (typeof n === "number" && Number.isFinite(n)) all.push(n)
  }
  const pushPct = (n: number | null | undefined) => {
    if (typeof n === "number" && Number.isFinite(n)) {
      all.push(n)
      pcts.push(n)
    }
  }

  pushAll(input.kpis.spend_usd)
  pushAll(input.kpis.spend_usd_prev)
  pushPct(input.kpis.spend_usd_delta_pct)
  pushAll(input.kpis.leads)
  pushAll(input.kpis.leads_prev)
  pushPct(input.kpis.leads_delta_pct)
  pushAll(input.kpis.cpl_usd)
  pushAll(input.kpis.cpl_usd_prev)
  pushPct(input.kpis.cpl_usd_delta_pct)
  pushPct(input.kpis.lead_conversion_rate_pct)
  pushPct(input.kpis.budget_execution_pct_krw)

  for (const w of input.weekly) {
    pushAll(w.spend_usd)
    pushAll(w.leads)
    pushAll(w.cpl_usd)
  }

  pushAll(input.funnel.impressions)
  pushAll(input.funnel.clicks)
  pushPct(input.funnel.ctr_pct)
  pushAll(input.funnel.ad_leads)
  pushAll(input.funnel.contacted)
  pushAll(input.funnel.converted_leads)

  for (const row of input.scoreboard) {
    pushPct(row.elapsed_pct)
    pushPct(row.execution_pct)
    pushAll(row.leads)
    pushAll(row.cpl_usd)
  }

  for (const a of input.anomalies) {
    const push = PCT_ANOMALY_KINDS.has(a.kind) ? pushPct : pushAll
    push(a.current)
    push(a.baseline)
    // detail 문자열에도 코드가 계산한 수치가 들어 있다(예: "30일 평균의 2.1배", "집행 62% vs
    // 경과 45%"). 이 문자열은 JSON.stringify(input) 그대로 프롬프트에 실리므로 LLM 이 여기서
    // 숫자를 인용할 수 있다 — "%" 가 붙은 토큰이면 pcts 에도 넣어야 그 인용이 오탐 나지 않는다.
    for (const tok of extractNumbers(a.detail)) {
      if (tok.isPct) pushPct(tok.value)
      else pushAll(tok.value)
    }
  }

  return { all, pcts }
}

const TOLERANCE = 0.1 // 상대 오차 10% — LLM 의 반올림 인용을 환각으로 몰지 않기 위한 여유.

// useAbs 는 퍼센트 대조 전용이다: 모델은 "89% 감소"처럼 부호를 말로 쓰고 숫자는 양수로 적는 게
// 보통이라, 입력의 음수 델타(cpl_usd_delta_pct: -89)와 출력의 양수 토큰("89%")은 부호만 다르고
// 크기는 같은 정상 케이스다 — 양쪽을 Math.abs 해서 대조한다. 비-퍼센트 경로(useAbs=false)는
// 기존 동작 그대로 부호를 살려 비교한다("-50 리드"가 입력의 "50 리드"와 맞아서는 안 된다).
function isWithinTolerance(value: number, candidates: number[], useAbs: boolean): boolean {
  if (candidates.length === 0) return false
  for (const c of candidates) {
    if (c === 0) {
      if (Math.abs(value) < 1) return true // 둘 다 ~0
      continue
    }
    const v = useAbs ? Math.abs(value) : value
    const cc = useAbs ? Math.abs(c) : c
    if (Math.abs(v - cc) / Math.abs(cc) <= TOLERANCE) return true
  }
  return false
}

export function checkMarketingSanity(
  input: MarketingInsightInput,
  output: MarketingInsightResult
): NumericalWarning[] {
  const { all, pcts } = collectInputNumbers(input)
  const warnings: NumericalWarning[] = []

  function inspect(field: string, text: string) {
    if (!text) return
    for (const tok of extractNumbers(text)) {
      // 12 이하 토큰은 건너뛴다 — 주차·월·"3개" 같은 서술 숫자가 대부분이라 오탐 공장이 된다.
      if (Math.abs(tok.value) <= 12) continue
      // 퍼센트는 "의미가 퍼센트인 입력 필드" 집합하고만 대조한다(범위 근사 아님) — 광고비 USD·
      // 리드 수 같은 무관한 큰 값과 우연히 맞는 것을 막는다.
      const candidates = tok.isPct ? pcts : all
      if (!isWithinTolerance(tok.value, candidates, tok.isPct)) {
        warnings.push({
          field,
          value: tok.value,
          representation: tok.raw,
          reason: `값 ${tok.raw} 가 입력 데이터의 어떤 수치와도 10% 이내로 일치하지 않음`,
        })
      }
    }
  }

  inspect("headline", output.headline)
  output.highlights.forEach((h, i) => inspect(`highlights[${i}]`, h))
  output.next_actions.forEach((a, i) => {
    inspect(`next_actions[${i}].title`, a.title)
    inspect(`next_actions[${i}].why`, a.why)
  })
  return warnings
}
