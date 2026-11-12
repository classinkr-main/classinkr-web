/**
 * 사이트 챗봇 Claude 제공자 설정 — env 만 읽는 순수 모듈(단위 테스트 대상).
 *
 * 기본값은 전부 "끔"이다. CHATBOT_PROVIDER 를 claude 로 바꾸지 않으면 운영 동작(Gemini)은 그대로다.
 *
 *   CHATBOT_PROVIDER              gemini(기본) | claude
 *   CHATBOT_CLAUDE_CANARY_PCT     claude 일 때 Claude 로 보낼 요청 비율 0–100 (기본 100)
 *   ANTHROPIC_API_KEY             서버 키. 없으면 ANTHROPIC_API_KEY_1 → _2 → _3 순서로 찾는다
 *   CHATBOT_CLAUDE_MODEL          답변 모델 (기본 claude-sonnet-5-5)
 *   CHATBOT_CLAUDE_LABEL_MODEL    라벨링 모델 (기본 claude-haiku-5-5 — 싼 모델)
 *   CHATBOT_LABELING_ENABLED      1/0 — 라벨링 on/off (기본: provider 가 claude 일 때만 on)
 *   CHATBOT_MONTHLY_BUDGET_USD    월 상한 (기본 30) — 넘으면 Gemini 로 되돌린다
 *   CHATBOT_DAILY_BUDGET_USD      일 상한 (기본 3)
 *   CHATBOT_CLAUDE_MAX_PER_MINUTE 전체 분당 Claude 호출 상한 (기본 30, Upstash 있으면 분산)
 *   CHATBOT_CLAUDE_MAX_OUTPUT_TOKENS 답변 1회 출력 상한 (기본 700)
 */

export type ChatbotProviderName = "gemini" | "claude"

export interface ChatbotClaudeConfig {
  provider: ChatbotProviderName
  canaryPct: number
  apiKeys: string[]
  answerModel: string
  labelModel: string
  labelingEnabled: boolean
  monthlyBudgetUsd: number
  dailyBudgetUsd: number
  maxCallsPerMinute: number
  maxOutputTokens: number
}

type Env = Record<string, string | undefined>

export const DEFAULT_CLAUDE_ANSWER_MODEL = "claude-sonnet-5-5"
export const DEFAULT_CLAUDE_LABEL_MODEL = "claude-haiku-5-5"

function num(value: string | undefined, fallback: number, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  if (value === undefined || value.trim() === "") return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function bool(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === "") return fallback
  return /^(1|true|on|yes)$/i.test(value.trim())
}

/** 키 값은 반환 객체 밖으로 내보내지 않는다(로그·응답에 넣지 않는다). */
export function resolveAnthropicKeys(env: Env = process.env): string[] {
  const keys = [env.ANTHROPIC_API_KEY, env.ANTHROPIC_API_KEY_1, env.ANTHROPIC_API_KEY_2, env.ANTHROPIC_API_KEY_3]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
  return [...new Set(keys)]
}

export function readChatbotClaudeConfig(env: Env = process.env): ChatbotClaudeConfig {
  const provider: ChatbotProviderName = env.CHATBOT_PROVIDER?.trim().toLowerCase() === "claude" ? "claude" : "gemini"
  return {
    provider,
    canaryPct: num(env.CHATBOT_CLAUDE_CANARY_PCT, 100, { min: 0, max: 100 }),
    apiKeys: resolveAnthropicKeys(env),
    answerModel: env.CHATBOT_CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_ANSWER_MODEL,
    labelModel: env.CHATBOT_CLAUDE_LABEL_MODEL?.trim() || DEFAULT_CLAUDE_LABEL_MODEL,
    labelingEnabled: bool(env.CHATBOT_LABELING_ENABLED, provider === "claude"),
    monthlyBudgetUsd: num(env.CHATBOT_MONTHLY_BUDGET_USD, 30),
    dailyBudgetUsd: num(env.CHATBOT_DAILY_BUDGET_USD, 3),
    maxCallsPerMinute: Math.floor(num(env.CHATBOT_CLAUDE_MAX_PER_MINUTE, 30, { min: 0 })),
    maxOutputTokens: Math.floor(num(env.CHATBOT_CLAUDE_MAX_OUTPUT_TOKENS, 700, { min: 64, max: 4000 })),
  }
}

/** 이 요청을 Claude 로 보낼지 — provider·키·카나리 비율. 예산·분당 상한은 budget.ts 가 따로 본다. */
export function shouldUseClaudeForAnswer(config: ChatbotClaudeConfig, random: () => number = Math.random): boolean {
  if (config.provider !== "claude") return false
  if (config.apiKeys.length === 0) return false
  if (config.canaryPct <= 0) return false
  if (config.canaryPct >= 100) return true
  return random() * 100 < config.canaryPct
}

/**
 * 모델별 "확장 사고 끄기" 파라미터(2026-11-12 실측). 기본 adaptive 사고는 출력 토큰·지연을 먹는다.
 *  - Haiku 5.5: { type: "disabled" }
 *  - Sonnet 5.5: { type: "between_tools" } (disabled 는 400 — API 가 이 값을 안내한다)
 *  - Opus 5.5·알 수 없는 모델: 끌 수 없음 → 보내지 않는다(effort low 만)
 */
export function thinkingOffParam(model: string): { type: "disabled" } | { type: "between_tools" } | undefined {
  if (model.includes("haiku")) return { type: "disabled" }
  if (model.includes("sonnet")) return { type: "between_tools" }
  return undefined
}
