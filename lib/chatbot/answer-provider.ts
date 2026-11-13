/**
 * 최종 답변 제공자 선택 — CHATBOT_PROVIDER=claude 이고 키·카나리·예산·분당 상한을 모두 통과하면
 * Claude, 아니면(또는 Claude 가 아무것도 못 내면) 기존 Gemini. 기본값은 gemini 라 운영 동작은 그대로다.
 *
 * 스트리밍 계약(NDJSON delta → replace → meta)은 service.ts 가 그대로 쥐고, 여기서는 텍스트 델타만 낸다.
 */
import "server-only"

import { generateGeminiFinalAnswer, streamGeminiFinalAnswer, type FinalGenerateArgs } from "@/lib/chatbot/llm"
import { checkClaudeBudget, createSupabaseClaudeUsageStore, recordClaudeUsage, type ClaudeUsageStore } from "@/lib/chatbot/claude/budget"
import { readChatbotClaudeConfig, shouldUseClaudeForAnswer } from "@/lib/chatbot/claude/config"
import type { ClaudeUsage } from "@/lib/chatbot/claude/pricing"
import { generateClaudeFinalAnswer, streamClaudeFinalAnswer, type ClaudeAnswerExtras } from "@/lib/chatbot/claude/provider"
import { checkRateLimitDistributed } from "@/lib/server/rate-limit"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export interface ChatbotAnswerUsage extends ClaudeUsage {
  provider: "claude"
}

export type ChatbotAnswerArgs = FinalGenerateArgs & {
  handoffIntent?: "demo" | "support"
  sessionId?: string | null
  /** Claude 로 답했을 때만 불린다 — chatbot_answer_events.model_name·토큰 칸을 채우는 데 쓴다. */
  onUsage?: (usage: ChatbotAnswerUsage) => void
}

function hasSupabaseServerEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      (process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  )
}

let usageStore: ClaudeUsageStore | null | undefined
export function getClaudeUsageStore(): ClaudeUsageStore | null {
  if (usageStore !== undefined) return usageStore
  usageStore = hasSupabaseServerEnv()
    ? createSupabaseClaudeUsageStore(() => createSupabaseAdminClient() as never)
    : null
  return usageStore
}

async function pickClaude() {
  const config = readChatbotClaudeConfig()
  if (!shouldUseClaudeForAnswer(config)) return null
  const decision = await checkClaudeBudget(config, { store: getClaudeUsageStore(), rateLimit: checkRateLimitDistributed })
  return decision.allowed ? config : null
}

function toClaudeArgs(args: ChatbotAnswerArgs): FinalGenerateArgs & ClaudeAnswerExtras {
  const { onUsage, sessionId, ...base } = args
  return {
    ...base,
    onUsage: (usage) => {
      recordClaudeUsage(usage, { kind: "answer", sessionId: sessionId ?? null, store: getClaudeUsageStore() })
      onUsage?.({ ...usage, provider: "claude" })
    },
  }
}

export async function generateChatbotFinalAnswer(args: ChatbotAnswerArgs): Promise<string | null> {
  const config = await pickClaude()
  if (config) {
    const text = await generateClaudeFinalAnswer(toClaudeArgs(args), config)
    if (text) return text
  }
  return generateGeminiFinalAnswer(args)
}

export async function* streamChatbotFinalAnswer(args: ChatbotAnswerArgs): AsyncGenerator<string> {
  const config = await pickClaude()
  if (config) {
    let emitted = false
    for await (const chunk of streamClaudeFinalAnswer(toClaudeArgs(args), config)) {
      emitted = true
      yield chunk
    }
    if (emitted) return
  }
  yield* streamGeminiFinalAnswer(args)
}
