/**
 * Claude 토큰 → USD 추정(공식 정가, USD / 1M 토큰, 2026-11-12 확인). 예산 가드용 추정치이며
 * 청구서와 소수점까지 같지는 않다. 모르는 모델은 가장 비싼 Opus 단가로 셈한다(보수적으로).
 */
export interface ClaudeUsage {
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
}

const PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
}

function priceFor(model: string) {
  if (PRICES[model]) return PRICES[model]
  if (model.includes("haiku")) return PRICES["claude-haiku-5-5"]
  if (model.includes("sonnet")) return PRICES["claude-sonnet-5-5"]
  return PRICES["claude-opus-5-5"]
}

export function estimateClaudeCostUsd(usage: ClaudeUsage): number {
  const p = priceFor(usage.model)
  return (
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      (usage.cacheCreationInputTokens ?? 0) * p.cacheWrite +
      (usage.cacheReadInputTokens ?? 0) * p.cacheRead) /
    1_000_000
  )
}
