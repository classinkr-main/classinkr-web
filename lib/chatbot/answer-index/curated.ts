/**
 * 옛 정해 둔 답(curatedRef)을 id 로 찾기(사양 §3.6 fixed(KEEP), §4.2 curatedRef).
 *
 * KEEP 카드는 옛 답을 만드는 자료를 그대로 쓴다. 이 파일은 모듈별로 id → 옛 답 자료를 찾고, 그 글 해시(answerTextHash)를 낸다.
 * 해시는 inventory(scripts/answer-index/lib/inventory.ts)가 적는 textHash 와 같은 글로 만든다:
 *   field·basics: answer 문단을 빈 줄로 이음 / self: 같은 key 의 n번째(sourceId key 또는 key-n) / symptom: 질문 없이 만든 주제 답
 *   (vague-error 는 긴 되묻기) / guide: formatCsFigmaGuideAnswer.
 * svc·template 은 service.ts 안의 조건 갈래라 id 로 부를 함수가 없다. 런타임에서는 '없음'(null)이라 그 KEEP 카드는 load 때 빠진다.
 * 그런 답은 D4 가 FIX(text) 카드로 만든다(글이 같으면 textHash 도 같다).
 *
 * 네트워크·모델 호출 없음. service.ts 를 import 하지 않는다(service 가 이 파일을 쓴다).
 */
import { CS_FIGMA_GUIDES, formatCsFigmaGuideAnswer, INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS, type CsFigmaGuide } from "@/lib/cs-figma-guides"
import { BASIC_QUICK_ANSWERS, type BasicQuickAnswer } from "@/lib/chatbot/quick-answers-basics"
import { FIELD_QUICK_ANSWERS, type FieldQuickAnswer } from "@/lib/chatbot/quick-answers-field"
import { CHATBOT_SELF_KNOWLEDGE_ENTRIES, type ChatbotSelfKnowledgeEntry } from "@/lib/chatbot/self-knowledge"
import { buildSymptomTopicAnswer, buildVagueErrorAnswer, SYMPTOM_TOPICS, type SymptomTopic } from "@/lib/chatbot/symptom-triage"
import { answerTextHash } from "./hash"
import type { CuratedRef } from "./types"

export const VAGUE_ERROR_TOPIC_ID = "vague-error"

export type CuratedEntry =
  | { module: "field"; entry: FieldQuickAnswer }
  | { module: "basics"; entry: BasicQuickAnswer }
  | { module: "self"; entry: ChatbotSelfKnowledgeEntry }
  | { module: "symptom"; topic: SymptomTopic | null }
  | { module: "guide"; guide: CsFigmaGuide }

let selfById: Map<string, ChatbotSelfKnowledgeEntry> | null = null

/** self:<sourceId>. 같은 key 가 여러 번 나오면 두 번째부터 key-2, key-3 …(inventory 와 같은 규칙). */
function selfEntries() {
  if (selfById) return selfById
  const map = new Map<string, ChatbotSelfKnowledgeEntry>()
  const seen = new Map<string, number>()
  for (const entry of CHATBOT_SELF_KNOWLEDGE_ENTRIES) {
    const count = (seen.get(entry.key) ?? 0) + 1
    seen.set(entry.key, count)
    map.set(count === 1 ? entry.key : `${entry.key}-${count}`, entry)
  }
  selfById = map
  return map
}

/** 자기소개 답의 inventory id(self:<sourceId>). */
export function selfKnowledgeSourceId(entry: ChatbotSelfKnowledgeEntry): string | null {
  for (const [id, candidate] of selfEntries()) if (candidate === entry) return id
  return null
}

function publicGuide(slug: string) {
  return CS_FIGMA_GUIDES.find((guide) => guide.slug === slug && !INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS.has(guide.docSlug)) ?? null
}

/** curatedRef 가 가리키는 옛 답 자료. 없거나 런타임에서 부를 수 없는 모듈(svc·template)이면 null. */
export function findCuratedEntry(ref: Pick<CuratedRef, "module" | "id">): CuratedEntry | null {
  switch (ref.module) {
    case "field": {
      const entry = FIELD_QUICK_ANSWERS.find((candidate) => candidate.id === ref.id)
      return entry ? { module: "field", entry } : null
    }
    case "basics": {
      const entry = BASIC_QUICK_ANSWERS.find((candidate) => candidate.id === ref.id)
      return entry ? { module: "basics", entry } : null
    }
    case "self": {
      const entry = selfEntries().get(ref.id)
      return entry ? { module: "self", entry } : null
    }
    case "symptom": {
      if (ref.id === VAGUE_ERROR_TOPIC_ID) return { module: "symptom", topic: null }
      const topic = SYMPTOM_TOPICS.find((candidate) => candidate.id === ref.id)
      return topic ? { module: "symptom", topic } : null
    }
    case "guide": {
      const guide = publicGuide(ref.id)
      return guide ? { module: "guide", guide } : null
    }
    default:
      return null
  }
}

/** 옛 답 글(inventory text 와 같은 글). 없으면 null. */
export function curatedLegacyText(ref: Pick<CuratedRef, "module" | "id">): string | null {
  const found = findCuratedEntry(ref)
  if (!found) return null
  switch (found.module) {
    case "field":
    case "basics":
    case "self":
      return found.entry.answer.join("\n\n")
    case "symptom":
      return found.topic ? (buildSymptomTopicAnswer(found.topic, { question: "" })?.answer ?? null) : buildVagueErrorAnswer().answer
    case "guide":
      return formatCsFigmaGuideAnswer(found.guide)
  }
}

/** load.ts 의 curatedTextHash 훅: 지금 옛 답 글 해시. 없으면 null(그 KEEP 카드는 색인에서 빠진다). */
export function curatedTextHash(ref: CuratedRef): string | null {
  const text = curatedLegacyText(ref)
  return text ? answerTextHash(text) : null
}

/** howto 카드의 증상 주제·가이드가 지금 있는지(load.ts 의 symptomTopics·guides 와 같은 기준). */
export function symptomTopicById(id: string): SymptomTopic | null {
  return SYMPTOM_TOPICS.find((topic) => topic.id === id) ?? null
}

export function findPublicGuide(slug: string): CsFigmaGuide | null {
  return publicGuide(slug)
}
