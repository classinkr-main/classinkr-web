/**
 * Claude 비용 가드 + 분당 상한.
 *
 * - 분당 상한: checkRateLimitDistributed("global", "chatbot-claude") — Upstash env 가 있으면 인스턴스
 *   공통, 없으면 인스턴스별 메모리(fail-open). 상한을 넘으면 그 요청은 Gemini 로 간다.
 * - 예산: 호출마다 추정 USD 를 누적한다. 인스턴스 메모리 합계와, chatbot_llm_usage 테이블이 있으면
 *   그 테이블의 KST 기준 오늘·이번 달 합계(60초 캐시) 중 큰 값을 본다. 일·월 상한을 넘으면 Gemini 로
 *   되돌리고 경고를 한 번 남긴다.
 * - chatbot_llm_usage 는 20261112_chatbot_claude_labels.sql(미적용) 이 만든다. 테이블이 없으면 메모리
 *   합계만으로 동작하고, 10분 동안 DB 를 다시 두드리지 않는다.
 */
import type { ChatbotClaudeConfig } from "./config"
import { estimateClaudeCostUsd, type ClaudeUsage } from "./pricing"
import { isMissingTableError } from "./table-missing"

export interface ClaudeBudgetDecision {
  allowed: boolean
  reason?: "rate_limited" | "daily_budget" | "monthly_budget" | "disabled"
  dayUsd: number
  monthUsd: number
}

export interface ClaudeUsageStore {
  /** since(포함) 이후 usd 합계. 테이블이 없거나 실패하면 null. */
  sumUsdSince(sinceIso: string): Promise<number | null>
  insert(row: ClaudeUsageRow): Promise<void>
}

export interface ClaudeUsageRow {
  kind: "answer" | "label" | "eval"
  model: string
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  usd: number
  session_id: string | null
}

type RateLimiter = (ip: string, key: string, opts: { windowMs: number; max: number }) => Promise<{ allowed: boolean }>

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DB_CACHE_MS = 60_000
const DB_DISABLE_MS = 10 * 60_000

/** KST 기준 오늘 0시·이번 달 1일 0시(UTC ISO) */
export function kstWindowStarts(now: Date): { dayStartIso: string; monthStartIso: string; dayKey: string; monthKey: string } {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  const y = kst.getUTCFullYear()
  const m = kst.getUTCMonth()
  const d = kst.getUTCDate()
  const dayStart = new Date(Date.UTC(y, m, d) - KST_OFFSET_MS)
  const monthStart = new Date(Date.UTC(y, m, 1) - KST_OFFSET_MS)
  return {
    dayStartIso: dayStart.toISOString(),
    monthStartIso: monthStart.toISOString(),
    dayKey: dayStart.toISOString(),
    monthKey: monthStart.toISOString(),
  }
}

const memory = { dayKey: "", dayUsd: 0, monthKey: "", monthUsd: 0 }
const dbCache = { at: 0, dayKey: "", dayUsd: 0, monthUsd: 0 }
let dbDisabledUntil = 0
let lastWarnKey = ""
// 최근 호출 기록(모델·토큰·USD만, 본문·키 없음) — 평가 스크립트·디버깅용. 인스턴스 메모리, 50건 순환.
const recentUsage: Array<ClaudeUsage & { kind: ClaudeUsageRow["kind"]; usd: number }> = []

export function getRecentClaudeUsage() {
  return [...recentUsage]
}

function rollMemory(now: Date) {
  const { dayKey, monthKey } = kstWindowStarts(now)
  if (memory.dayKey !== dayKey) {
    memory.dayKey = dayKey
    memory.dayUsd = 0
  }
  if (memory.monthKey !== monthKey) {
    memory.monthKey = monthKey
    memory.monthUsd = 0
  }
}

export function resetClaudeBudgetStateForTests() {
  Object.assign(memory, { dayKey: "", dayUsd: 0, monthKey: "", monthUsd: 0 })
  Object.assign(dbCache, { at: 0, dayKey: "", dayUsd: 0, monthUsd: 0 })
  dbDisabledUntil = 0
  lastWarnKey = ""
  recentUsage.length = 0
}

async function readDbTotals(store: ClaudeUsageStore | null, now: Date): Promise<{ dayUsd: number; monthUsd: number } | null> {
  if (!store || now.getTime() < dbDisabledUntil) return null
  const { dayStartIso, monthStartIso, dayKey } = kstWindowStarts(now)
  if (dbCache.at && now.getTime() - dbCache.at < DB_CACHE_MS && dbCache.dayKey === dayKey) {
    return { dayUsd: dbCache.dayUsd, monthUsd: dbCache.monthUsd }
  }
  const [day, month] = await Promise.all([store.sumUsdSince(dayStartIso), store.sumUsdSince(monthStartIso)])
  if (day === null || month === null) {
    dbDisabledUntil = now.getTime() + DB_DISABLE_MS
    return null
  }
  Object.assign(dbCache, { at: now.getTime(), dayKey, dayUsd: day, monthUsd: month })
  return { dayUsd: day, monthUsd: month }
}

export async function checkClaudeBudget(
  config: ChatbotClaudeConfig,
  deps: { now?: Date; store?: ClaudeUsageStore | null; rateLimit?: RateLimiter } = {}
): Promise<ClaudeBudgetDecision> {
  const now = deps.now ?? new Date()
  rollMemory(now)
  const db = await readDbTotals(deps.store ?? null, now).catch(() => null)
  const dayUsd = Math.max(memory.dayUsd, db?.dayUsd ?? 0)
  const monthUsd = Math.max(memory.monthUsd, db?.monthUsd ?? 0)

  const deny = (reason: ClaudeBudgetDecision["reason"]): ClaudeBudgetDecision => {
    const warnKey = `${reason}:${reason === "monthly_budget" ? memory.monthKey : memory.dayKey}`
    if (reason !== "rate_limited" && warnKey !== lastWarnKey) {
      lastWarnKey = warnKey
      console.warn(`[chatbot-claude] ${reason} reached (day $${dayUsd.toFixed(4)}, month $${monthUsd.toFixed(4)}); falling back to Gemini.`)
    }
    return { allowed: false, reason, dayUsd, monthUsd }
  }

  if (config.maxCallsPerMinute <= 0) return deny("disabled")
  if (monthUsd >= config.monthlyBudgetUsd) return deny("monthly_budget")
  if (dayUsd >= config.dailyBudgetUsd) return deny("daily_budget")

  if (deps.rateLimit) {
    const { allowed } = await deps.rateLimit("global", "chatbot-claude", {
      windowMs: 60_000,
      max: config.maxCallsPerMinute,
    }).catch(() => ({ allowed: true }))
    if (!allowed) return deny("rate_limited")
  }

  return { allowed: true, dayUsd, monthUsd }
}

export function recordClaudeUsage(
  usage: ClaudeUsage,
  meta: { kind: ClaudeUsageRow["kind"]; sessionId?: string | null; now?: Date; store?: ClaudeUsageStore | null }
): number {
  const now = meta.now ?? new Date()
  rollMemory(now)
  const usd = estimateClaudeCostUsd(usage)
  memory.dayUsd += usd
  memory.monthUsd += usd
  recentUsage.push({ ...usage, kind: meta.kind, usd })
  if (recentUsage.length > 50) recentUsage.shift()
  if (dbCache.at) {
    dbCache.dayUsd += usd
    dbCache.monthUsd += usd
  }
  const store = meta.store
  if (store && now.getTime() >= dbDisabledUntil) {
    void store
      .insert({
        kind: meta.kind,
        model: usage.model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_creation_input_tokens: usage.cacheCreationInputTokens ?? 0,
        cache_read_input_tokens: usage.cacheReadInputTokens ?? 0,
        usd: Number(usd.toFixed(6)),
        session_id: meta.sessionId ?? null,
      })
      .catch(() => {
        dbDisabledUntil = Date.now() + DB_DISABLE_MS
      })
  }
  return usd
}

/** Supabase 기반 저장소. 테이블·함수가 없으면 null/무시 — 마이그레이션 미적용 상태를 견딘다. */
export function createSupabaseClaudeUsageStore(
  getClient: () => {
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>
    from: (table: string) => {
      insert: (row: unknown) => PromiseLike<{ error: { code?: string; message?: string } | null }>
    }
  }
): ClaudeUsageStore {
  return {
    async sumUsdSince(sinceIso) {
      try {
        const { data, error } = await getClient().rpc("chatbot_llm_usage_sum", { p_since: sinceIso })
        if (error) {
          if (!isMissingTableError(error) && error.code !== "PGRST202" && error.code !== "42883") {
            console.warn("[chatbot-claude] usage sum failed:", error.code ?? "unknown")
          }
          return null
        }
        const value = Number(data ?? 0)
        return Number.isFinite(value) ? value : null
      } catch {
        return null
      }
    },
    async insert(row) {
      const { error } = await getClient().from("chatbot_llm_usage").insert(row)
      if (error) throw Object.assign(new Error("usage insert failed"), { code: error.code })
    },
  }
}
