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
  // 금액은 보고 문장에서 '¥75.2만'처럼 만 단위로 쓰인다 — 1만 이상 값은 만 단위 표기도 함께 인정한다.
  const push = (n: number | null | undefined) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return
    nums.push(n)
    if (Math.abs(n) >= 10_000) nums.push(n / 10_000)
  }
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
  const pct = (part: number, whole: number) => { if (whole > 0) push((part / whole) * 100) }
  for (const row of input.performance?.rows ?? []) {
    push(row.month_goal); push(row.month_actual); push(row.quarter_goal); push(row.quarter_actual); push(row.year_goal); push(row.year_actual)
    pct(row.month_actual, row.month_goal); pct(row.quarter_actual, row.quarter_goal); pct(row.year_actual, row.year_goal)
    push(row.month_goal - row.month_actual); push(row.quarter_goal - row.quarter_actual); push(row.year_goal - row.year_actual)
  }
  const mc = input.month_collections
  if (mc) {
    push(mc.confirmed); push(mc.planned_not_confirmed); push(mc.confirmed + mc.planned_not_confirmed)
    for (const c of mc.customers) { push(c.confirmed); push(c.planned_not_confirmed); push(c.confirmed + c.planned_not_confirmed) }
  }
  const ka = input.ka_quarter
  if (ka) {
    push(ka.confirmed); push(ka.open); push(ka.confirmed + ka.open); push(ka.customer_count)
    if (input.team_pacing.status > 0) push((ka.confirmed / input.team_pacing.status) * 100)
    for (const c of ka.top_customers) { push(c.confirmed); push(c.open); push(c.confirmed + c.open) }
  }
  const c = input.compass_weekly
  if (c) {
    for (const pair of [c.inflow, c.lost]) if (pair) { push(pair[0]); push(pair[1]); push(pair[0] - pair[1]) }
    for (const s of c.stages) { push(s.this_week); push(s.prev_week); push(s.this_week - s.prev_week) }
    for (const r of c.top_lost_reasons) push(r.count)
    for (const o of c.owners) { push(o.inflow); push(o.demo); push(o.bd); push(o.won); push(o.lost) }
    push(c.unassigned_inflow)
    for (const e of c.evaluation) push(e.rate_pct)
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
  ;(output.report_notes ?? []).forEach((note, i) => inspect(`report_notes[${i}]`, note))
  const report = output.weekly_report
  if (report) {
    inspect("weekly_report.performance", report.performance)
    inspect("weekly_report.collections", report.collections)
    inspect("weekly_report.activities", report.activities)
    report.key_points.forEach((point, i) => inspect(`weekly_report.key_points[${i}]`, point))
    report.ka.forEach((row, i) => {
      inspect(`weekly_report.ka[${i}].change`, row.change)
      inspect(`weekly_report.ka[${i}].issue`, row.issue)
    })
  }
  return warnings
}
