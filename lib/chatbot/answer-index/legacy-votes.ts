/**
 * 옛 정규식 표(사양 §3.1 legacy-votes.ts, §3.4 vote 성분).
 *
 * 옛 정해 둔 답 판별식은 답을 정하지 않고 '표'만 낸다. 걸린 옛 답 id(inventory id 꼴)를 legacy-alias.json 으로
 * 카드 id 로 바꾼다. 대응이 null(DROP·LEGACY_ONLY)이거나 alias 에 없는 id 는 버린다.
 *
 * 보는 판별식(옛 흐름이 쓰는 함수 그대로):
 *   field:<id>    findFieldQuickAnswer(소문자 질문)
 *   basics:<id>   findBasicQuickAnswers(소문자 질문) — 두 가지를 물으면 둘 다
 *   self:<id>     findChatbotSelfKnowledgeEntry(질문) — 같은 key 의 n번째는 key-n(inventory 와 같은 규칙)
 *   symptom:<id>  resolveSymptomTriage(라우팅 풀이 글) — vague-error 포함
 *   guide:<slug>  findCsFigmaGuideForQuestion(라우팅 풀이 글)
 *   그 밖         옛 흐름이 붙인 출처 이름(quick.gateOriginal: policy:academy-payment 등)
 * svc·template 은 옛 흐름에서 이름 없는 조건 갈래라 표를 내지 않는다.
 *
 * alias 가 비어 있으면(자료를 만들기 전) 아무것도 계산하지 않는다. 네트워크·모델 호출 없음.
 */
import { findCsFigmaGuideForQuestion } from "@/lib/cs-figma-guides"
import { findBasicQuickAnswers } from "@/lib/chatbot/quick-answers-basics"
import { findFieldQuickAnswer } from "@/lib/chatbot/quick-answers-field"
import { findChatbotSelfKnowledgeEntry } from "@/lib/chatbot/self-knowledge"
import { resolveSymptomTriage } from "@/lib/chatbot/symptom-triage"
import { glossForRouting } from "@/lib/chatbot/tone"
import { selfKnowledgeSourceId } from "./curated"
import type { LegacyAliasFile } from "./types"

export interface LegacyVoteSignal {
  /** 옛 흐름이 붙인 출처 이름(buildServiceQuickAnswer·buildPolicyGuardResponse 의 gateOriginal). */
  gateOriginal?: string | null
}

/** 질문에 걸리는 옛 답 id(inventory id 꼴, 중복 없음, 판별 순서). */
export function legacyAnswerIds(question: string, quick: LegacyVoteSignal | readonly LegacyVoteSignal[] | null = null): string[] {
  const ids: string[] = []
  const add = (id: string | null | undefined) => {
    if (id && !ids.includes(id)) ids.push(id)
  }
  const signals = quick === null ? [] : Array.isArray(quick) ? (quick as readonly LegacyVoteSignal[]) : [quick as LegacyVoteSignal]
  for (const signal of signals) add(signal?.gateOriginal ?? null)

  const lower = question.toLowerCase()
  const field = findFieldQuickAnswer(lower)
  if (field) add(`field:${field.id}`)
  for (const entry of findBasicQuickAnswers(lower)) add(`basics:${entry.id}`)
  const self = findChatbotSelfKnowledgeEntry(question)
  const selfId = self ? selfKnowledgeSourceId(self) : null
  if (selfId) add(`self:${selfId}`)

  const routingText = glossForRouting(question)
  const triage = resolveSymptomTriage(routingText)
  if (triage) add(`symptom:${triage.topicId}`)
  const guide = findCsFigmaGuideForQuestion(routingText)
  if (guide) add(`guide:${guide.slug}`)
  return ids
}

/**
 * 표: 옛 판별식이 고른 답을 카드 id 로 바꾼 목록(중복 없음). question 은 가린 글(question.redacted).
 * quick 은 옛 흐름이 이미 만든 정해 둔 답(있으면 그 출처 이름도 표로 센다).
 */
export function collectLegacyVotes(
  question: string,
  quick: LegacyVoteSignal | readonly LegacyVoteSignal[] | null,
  alias: LegacyAliasFile
): string[] {
  if (Object.keys(alias).length === 0) return []
  const votes: string[] = []
  for (const id of legacyAnswerIds(question, quick)) {
    const card = alias[id]
    if (typeof card === "string" && card && !votes.includes(card)) votes.push(card)
  }
  return votes
}

/**
 * 표 카드마다 그 표를 낸 옛 판별식 이름(inventory id 꼴, 판별 순서). collectLegacyVotes 와 같은 대응을 쓴다.
 * 정해 둔 답 승격의 증상 판별 가드(decide.ts)가 '증상 판별에서만 나온 표'를 가린다.
 */
export function legacyVoteSources(
  question: string,
  quick: LegacyVoteSignal | readonly LegacyVoteSignal[] | null,
  alias: LegacyAliasFile
): Map<string, string[]> {
  const sources = new Map<string, string[]>()
  if (Object.keys(alias).length === 0) return sources
  for (const id of legacyAnswerIds(question, quick)) {
    const card = alias[id]
    if (typeof card !== "string" || !card) continue
    const list = sources.get(card) ?? []
    if (!list.includes(id)) list.push(id)
    sources.set(card, list)
  }
  return sources
}
