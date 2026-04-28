import "server-only"
import type { InsightInput } from "./input-builder"
import type { InsightResult } from "./gemini-runner"

export interface NumericalWarning {
  field: string           // "one_liner" | "next_actions[i].title" | "next_actions[i].why"
  value: number           // the suspicious number from output
  representation: string  // raw token from output (e.g., "17.9%", "₩4,000")
  reason: string          // why it's flagged
}

const NUMBER_TOKEN_RE = /[-+]?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*%?|[-+]?\d+(?:\.\d+)?\s*%?/g

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

function collectInputNumbers(input: InsightInput): number[] {
  const nums: number[] = []
  const push = (n: number | null | undefined) => { if (typeof n === "number" && Number.isFinite(n)) nums.push(n) }
  push(input.team_pacing.goal)
  push(input.team_pacing.status)
  push(input.team_pacing.pacing_pct)
  push(input.summary_metrics.total_goal)
  push(input.summary_metrics.total_confirmed_revenue)
  push(input.summary_metrics.total_pipeline_value)
  push(input.summary_metrics.gap_to_goal)
  push(input.summary_metrics.top_region?.revenue ?? null)
  push(input.summary_metrics.worst_region?.progress_pct ?? null)
  push(input.summary_metrics.best_manager?.achievement_pct ?? null)
  push(input.summary_metrics.worst_manager?.achievement_pct ?? null)
  for (const m of input.managers) {
    push(m.goal); push(m.status); push(m.pipeline); push(m.achievement_pct)
    push(m.deals_total); push(m.deals_confirmed)
    for (const [g, a] of Object.values(m.kpi)) { push(g); push(a) }
  }
  for (const r of input.regions) {
    push(r.target); push(r.revenue); push(r.progress_pct)
  }
  push(input.bottleneck_kpi.pct)
  for (const slice of [...input.deal_mix.by_category, ...input.deal_mix.by_status_type, ...input.deal_mix.by_channel]) {
    push(slice.goal); push(slice.actual); push(slice.pct)
  }
  return nums
}

const TOLERANCE = 0.10  // 10% relative tolerance

function isWithinTolerance(value: number, candidates: number[]): boolean {
  if (candidates.length === 0) return false
  for (const c of candidates) {
    if (c === 0) {
      if (Math.abs(value) < 1) return true   // both ~0
      continue
    }
    const ratio = Math.abs(value - c) / Math.abs(c)
    if (ratio <= TOLERANCE) return true
  }
  return false
}

export function checkNumericalSanity(input: InsightInput, output: InsightResult): NumericalWarning[] {
  const inputNums = collectInputNumbers(input)
  const warnings: NumericalWarning[] = []

  function inspect(field: string, text: string) {
    if (!text) return
    for (const tok of extractNumbers(text)) {
      // Filter trivial tokens: single digits 1-12 (months, days), 0, dates handled separately
      if (Math.abs(tok.value) <= 12) continue
      // For percentages, compare against percentage-shaped inputs only (0-100)
      const candidates = tok.isPct
        ? inputNums.filter((n) => n >= 0 && n <= 200)
        : inputNums
      if (!isWithinTolerance(tok.value, candidates)) {
        warnings.push({
          field, value: tok.value, representation: tok.raw,
          reason: `값 ${tok.raw} 가 입력 데이터의 어떤 수치와도 10% 이내로 일치하지 않음`,
        })
      }
    }
  }

  inspect("one_liner", output.one_liner)
  output.next_actions.forEach((a, i) => {
    inspect(`next_actions[${i}].title`, a.title)
    inspect(`next_actions[${i}].why`, a.why)
  })
  return warnings
}
