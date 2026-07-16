import "server-only"
import { readDshPreferDb, readKpiBlocksPreferDb } from "@/lib/branch/read-dsh-kpi"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { listPublicEvents } from "@/lib/repositories/public-events"
import { summarizeCampaigns } from "@/lib/branch/computations/campaigns"
import { buildInsightInput, digestInput, type TeamScope } from "./input-builder"
import { callGemini, type GeminiMode } from "./gemini-runner"
import { checkNumericalSanity, type NumericalWarning } from "./sanity-check"
import { findInsightByDigest, getLatestInsight, insertInsight, type BranchInsight } from "@/lib/repositories/branch-insights"
import { fyOf } from "@/lib/branch/fiscal"

// DB-우선 사다리(액티브 임포트 → 시트 미러 → 라이브 시트 초기 폴백) — summary/kpi와 동일 규약.
// 시트 장애 시에도 마지막 스냅샷으로 인사이트 입력을 만들 수 있다(기존엔 stale 인사이트로만 강등).
const readDsh = () => readDshPreferDb(fyOf(new Date()))
const readKpi = async () => (await readKpiBlocksPreferDb(fyOf(new Date()))).fy

export interface RunInsightsResult {
  from: "cache" | "fresh" | "stale" | "error"
  insight?: BranchInsight
  error?: string
  numerical_warnings?: NumericalWarning[]
  retried?: boolean
}

export async function runInsights(team: TeamScope, force: boolean): Promise<RunInsightsResult> {
  const now = new Date()
  try {
    if (force) {
      const latest = await getLatestInsight(team)
      if (latest) {
        const ageMs = Date.now() - new Date(latest.generated_at).getTime()
        if (ageMs < 60_000) {
          return { from: "cache", insight: latest }
        }
      }
    }
    const [dsh, kpi, deals, events, campaigns] = await Promise.all([
      readDsh(), readKpi(), listBranchRevDeals(), listPublicEvents(), summarizeCampaigns(now),
    ])
    const input = buildInsightInput({
      team, scope: "Q", now, dsh, kpi,
      deals: team === "ALL" ? deals : deals.filter((d) => d.team === team),
      events: events.map((e) => ({ title: e.title, startsAt: e.startsAt, location: e.location })),
      campaigns: campaigns.recent.map((c) => ({ subject: c.subject, sentAt: c.sentAt, openPct: c.openPct })),
      hwAlerts: [],
    })
    const digest = digestInput(input)
    if (!force) {
      const cached = await findInsightByDigest(team, digest)
      if (cached) return { from: "cache", insight: cached }
    }
    const mode: GeminiMode = force ? "fast" : "quality"
    let { result, raw, model: usedModel } = await callGemini(input, mode)
    let warnings = checkNumericalSanity(input, result)
    let retried = false
    if (warnings.length >= 3) {
      retried = true
      const retry = await callGemini(input, mode)
      const retryWarnings = checkNumericalSanity(input, retry.result)
      if (retryWarnings.length < warnings.length) {
        result = retry.result; raw = retry.raw; usedModel = retry.model; warnings = retryWarnings
      }
    }
    const saved = await insertInsight({
      team, fiscal_period: input.fiscalPeriod,
      one_liner: result.one_liner, next_actions: result.next_actions,
      raw_response: { ...((raw as object) ?? {}), _model: usedModel, _mode: mode, _retried: retried, _warnings: warnings },
      input_digest: digest,
    })
    return { from: "fresh", insight: saved, numerical_warnings: warnings.length > 0 ? warnings : undefined, retried }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const fallback = await getLatestInsight(team)
    if (fallback) return { from: "stale", insight: fallback, error: msg }
    return { from: "error", error: msg }
  }
}
