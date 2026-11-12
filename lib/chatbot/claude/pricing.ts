/**
 * Claude 토큰 → USD 추정(공식 정가, USD / 1M 토큰, 2026-11-12 확인). 예산 가드용 추정치이며
 * 청구서와 소수점까지 같지는 않다. 모르는 모델은 표에서 가장 비싼 단가로 셈한다(보수적으로).
 */
export interface ClaudeUsage {
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
}

// 캐시 쓰기는 입력 단가의 1.25배(5분 TTL), 캐시 읽기는 모델 표의 값(5.5 세대 0.05배, 그 밖 0.1배).
const price = (input: number, output: number, cacheRead = input * 0.1) => ({ input, output, cacheWrite: input * 1.25, cacheRead })

const PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-fable-5-2": price(8, 40, 0.2),
  "claude-fable-5-1": price(10, 50),
  "claude-fable-5": price(10, 50),
  "claude-opus-5-5": price(4, 20, 0.2),
  "claude-opus-5": price(5, 25),
  "claude-opus-4-8": price(5, 25),
  "claude-opus-4-7": price(5, 25),
  "claude-opus-4-6": price(5, 25),
  "claude-sonnet-5-5": price(2, 10, 0.1),
  "claude-sonnet-5": price(2, 10),
  "claude-sonnet-4-6": price(3, 15),
  // Haiku 5.5 는 프롬프트 100K 토큰까지의 단가 — 챗봇 프롬프트는 그보다 훨씬 짧다.
  "claude-haiku-5-5": price(0.1, 0.5),
  "claude-haiku-4-5": price(1, 5),
}

/**
 * 모르는 모델은 표에서 가장 비싼 단가로 셈한다 — 예산 가드가 덜 세서 상한을 넘는 쪽보다 일찍 Gemini 로
 * 돌아가는 쪽이 안전하다. (예전에는 "sonnet"·"haiku" 글자만 보고 5.5 단가를 써 sonnet-4-6 등을 싸게 셌다.)
 */
const MOST_EXPENSIVE = Object.values(PRICES).reduce((max, p) => (p.output > max.output ? p : max))

function priceFor(model: string) {
  return PRICES[model.trim()] ?? MOST_EXPENSIVE
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
