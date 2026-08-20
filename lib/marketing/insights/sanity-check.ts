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

/**
 * 입력에서 인용 가능한 숫자를 전부 모은다 — 입력 계약이 평탄한 이유가 이것이다.
 * 새 숫자 필드를 input-builder 에 추가하면 여기에도 반드시 추가한다(빠지면 오탐이 된다).
 */
function collectInputNumbers(input: MarketingInsightInput): number[] {
  const nums: number[] = []
  const push = (n: number | null | undefined) => {
    if (typeof n === "number" && Number.isFinite(n)) nums.push(n)
  }

  push(input.kpis.spend_usd)
  push(input.kpis.spend_usd_prev)
  push(input.kpis.leads)
  push(input.kpis.leads_prev)
  push(input.kpis.cpl_usd)
  push(input.kpis.cpl_usd_prev)
  push(input.kpis.lead_conversion_rate_pct)
  push(input.kpis.budget_execution_pct_krw)

  for (const w of input.weekly) {
    push(w.spend_usd)
    push(w.leads)
    push(w.cpl_usd)
  }

  push(input.funnel.impressions)
  push(input.funnel.clicks)
  push(input.funnel.ctr_pct)
  push(input.funnel.ad_leads)
  push(input.funnel.contacted)
  push(input.funnel.converted_leads)

  for (const row of input.scoreboard) {
    push(row.elapsed_pct)
    push(row.execution_pct)
    push(row.leads)
    push(row.cpl_usd)
  }

  for (const a of input.anomalies) {
    push(a.current)
    push(a.baseline)
    // detail 문자열에도 코드가 계산한 수치가 들어 있다(예: "30일 평균의 2.1배").
    for (const tok of extractNumbers(a.detail)) push(tok.value)
  }

  return nums
}

const TOLERANCE = 0.1 // 상대 오차 10% — LLM 의 반올림 인용을 환각으로 몰지 않기 위한 여유.

function isWithinTolerance(value: number, candidates: number[]): boolean {
  if (candidates.length === 0) return false
  for (const c of candidates) {
    if (c === 0) {
      if (Math.abs(value) < 1) return true // 둘 다 ~0
      continue
    }
    if (Math.abs(value - c) / Math.abs(c) <= TOLERANCE) return true
  }
  return false
}

export function checkMarketingSanity(
  input: MarketingInsightInput,
  output: MarketingInsightResult
): NumericalWarning[] {
  const inputNums = collectInputNumbers(input)
  const warnings: NumericalWarning[] = []

  function inspect(field: string, text: string) {
    if (!text) return
    for (const tok of extractNumbers(text)) {
      // 12 이하 토큰은 건너뛴다 — 주차·월·"3개" 같은 서술 숫자가 대부분이라 오탐 공장이 된다.
      if (Math.abs(tok.value) <= 12) continue
      // 퍼센트는 퍼센트 모양 입력(0~200)하고만 대조한다 — 광고비 USD 값과 우연히 맞는 것을 막는다.
      const candidates = tok.isPct ? inputNums.filter((n) => n >= 0 && n <= 200) : inputNums
      if (!isWithinTolerance(tok.value, candidates)) {
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
