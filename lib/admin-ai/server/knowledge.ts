// 갈매봇 "묻기(클래스인 정보)" 답 조립 — 화면과 무관한 함수 answerKnowledge(question, deps).
//
// 매니저에게 주는 답이다(고객 답 초안이 아니다, 점검 R13). 두괄식:
//  ① answer — 결론 한 문장(가능/불가/위치/첫 단계)
//  ② steps — 방법(한 단계 한 줄)
//  ③ cautions — 조건·주의(있을 때만)
//  배지: 확정 / 확인 필요(confidence), 고객 전달 가능 여부는 화면이 sources 에서 다시 계산한다(lib/admin-ai/answers.ts).
//  근거: 정리 지식·사고 선례·공개 문서·내부 문서(buildInternalEvidence 부품). 링크는 링크 목록 id 만.
//  고객용 문안: 공개 챗봇 답 색인 카드가 근거면 그 말투 그대로 따로 둔다(R18). 정책 결정 대기 카드는 "확인 필요".
//  상담 사례: 건수만(기관 이름·원문 없음, R17).
// 근거가 없으면 지어내지 않는다 — "근거를 찾지 못했습니다" + 담당자 카드 + CS 코파일럿 열기.
// 자료는 deps 로 받는다(서버 연결은 deps.ts, 시험은 가짜). 이 파일은 I/O 를 하지 않는다.
import type { InternalEvidenceParts } from "@/lib/internal-cs-chat/context"

import { ADMIN_AI_LINKS, getLinkById } from "../links"
import type { AiBlock, AnswerCard, AnswerConfidence, AnswerSource, ContactCard } from "../types"

export interface CustomerPhrasing {
  /** 답 색인 카드 id. */
  cardId: string
  kind: "fixed" | "policy"
  /** 고객에게 지금 나가는 답 글(고객 말투). */
  text: string
  conf: number
  /** 정책 카드의 사람 결정 대기 번호(HQ-xx). */
  policyRef?: string
}

export interface KnowledgeDeps {
  evidence: (question: string) => Promise<InternalEvidenceParts>
  /** 공개 챗봇 답 색인의 상위 카드(읽기 전용). 없거나 실패하면 고객용 문안 칸이 없다. */
  customerPhrasing?: (question: string) => Promise<CustomerPhrasing | null>
  /** 비슷한 상담 사례 건수(원문 없음). 없으면 상담 근거를 싣지 않는다. */
  consultationCount?: (question: string) => Promise<number | null>
  /** 근거가 없을 때 붙일 담당자 카드. */
  contact: (question: string) => Promise<ContactCard>
}

export const NO_EVIDENCE_ANSWER = "근거를 찾지 못했습니다."
export const CS_COPILOT_LINK_ID = "admin:cs-chatbot"

const MAX_STEPS = 5
const MAX_SOURCES = 4
const STEP_MAX_CHARS = 90
const CONCLUSION_MAX_CHARS = 120
/** 답 색인 카드를 고객용 문안으로 쓰는 최소 확신도(R18). */
export const CUSTOMER_PHRASING_MIN_CONF = 0.7
/** 정책을 묻는 말 — 이때는 정책 카드만 고객용 문안으로 쓴다(R18: "환불 규정"에 결제 절차 카드가 골라지던 일). */
const POLICY_QUESTION = /규정|정책|약관|환불|위약|해지|기준|규칙/

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim()

function clip(value: string, max: number) {
  const line = oneLine(value)
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/** 글의 첫 문장. 마침표·물음표·느낌표 또는 "다/요" 뒤 공백에서 끊는다. */
export function firstSentence(text: string): string {
  const line = oneLine(text).replace(/^[-•*·\d.)\s]+/, "")
  const match = line.match(/^(.+?(?:[.!?。]|(?:다|요|함|음)(?=\s)))(?:\s|$)/)
  return (match ? match[1] : line).trim()
}

/** 결론 문장 꼴로 맞춘다 — 한 줄, 목록 표시 없음, 끝에 마침표. */
export function asConclusion(text: string): string {
  let sentence = clip(firstSentence(text), CONCLUSION_MAX_CHARS)
  if (!sentence) return NO_EVIDENCE_ANSWER
  if (!/[.!?。…]$/.test(sentence)) sentence = `${sentence}.`
  return sentence
}

function restSentences(text: string): string[] {
  const line = oneLine(text)
  return line
    .split(/(?<=[.!?。])\s+|(?<=(?:다|요))\s+(?=[가-힣A-Z0-9])/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(1)
}

const STATUS_CAUTION: Record<string, string> = {
  conditional: "조건부 내용입니다 — 계약·환경에 따라 다를 수 있습니다.",
  conflicting_sources: "근거 문서끼리 내용이 다릅니다 — 확정 전에는 고객에게 단정하지 마세요.",
  hq_confirmation_required: "본사 확인이 필요한 내용입니다 — 확인 전에는 고객에게 단정하지 마세요.",
}

function publicLinkIdFor(urlPath: string): string | undefined {
  const entry = ADMIN_AI_LINKS.find((link) => link.audience === "customer" && link.href === urlPath)
  return entry?.id
}

interface Picked {
  conclusion: string
  steps: string[]
  cautions: string[]
  confidence: AnswerConfidence
  sources: AnswerSource[]
}

function assemble(parts: InternalEvidenceParts): Picked | null {
  const curated = [...parts.curated].sort((a, b) => Number(b.confirmed === true) - Number(a.confirmed === true))
  const primaryCurated = curated[0]
  const primaryPublic = parts.publicDocs[0]
  const primaryIncident = parts.incidents[0]
  const primaryInternal = parts.internalDocs[0]
  const primary = primaryCurated ?? primaryPublic ?? primaryIncident ?? primaryInternal
  if (!primary) return null

  const steps: string[] = []
  const cautions: string[] = []
  if (primaryCurated) {
    steps.push(...primaryCurated.handling)
    const statusCaution = STATUS_CAUTION[primaryCurated.status]
    if (statusCaution) cautions.push(statusCaution)
    if (primaryCurated.customerUse === "internal_only") cautions.push("사내 판단 근거입니다 — 고객에게 그대로 말하지 마세요.")
  }
  if (steps.length === 0 && primaryIncident && primary === primaryIncident) steps.push(...primaryIncident.steps)
  if (steps.length === 0 && primary === primaryPublic) steps.push(...restSentences(primaryPublic.excerpt || primaryPublic.summary))
  if (steps.length === 0 && primary === primaryInternal) steps.push(...restSentences(primaryInternal.excerpt || primaryInternal.summary))
  if (primary === primaryIncident && primaryIncident.confirmed === false) cautions.push("원인이 확정되지 않은 선례입니다.")
  if (primary.customerUse === "confirm_first") cautions.push("계약·본사·현장 확인 전에는 고객에게 단정하지 마세요.")

  const sources: AnswerSource[] = []
  for (const entry of curated.slice(0, 2)) {
    sources.push({
      title: entry.title,
      where: entry.sources[0]?.label,
      kind: "internal",
      status: entry.confirmed ? "confirmed" : "needs-check",
      externalUse: false,
    })
  }
  for (const doc of parts.publicDocs.slice(0, 2)) {
    const linkId = publicLinkIdFor(doc.urlPath)
    sources.push({ title: doc.title, where: doc.heading, kind: "public", status: "confirmed", externalUse: true, ...(linkId ? { linkId } : {}) })
  }
  for (const incident of parts.incidents.slice(0, 1)) {
    sources.push({ title: incident.title, kind: "internal", status: incident.confirmed ? "confirmed" : "needs-check", externalUse: false })
  }
  for (const doc of parts.internalDocs.slice(0, 1)) {
    sources.push({ title: doc.title, where: doc.heading, kind: "internal", status: "needs-check", externalUse: false })
  }

  const confirmed =
    primary === primaryPublic ? true : primary.confirmed === true && !cautions.some((c) => c.includes("확인") || c.includes("다릅니다"))
  return {
    conclusion: asConclusion(primary.summary || primary.title),
    steps: Array.from(new Set(steps.map((step) => clip(step.replace(/^[-•*·\d.)\s]+/, ""), STEP_MAX_CHARS)).filter(Boolean))).slice(0, MAX_STEPS),
    cautions: Array.from(new Set(cautions)).slice(0, 3),
    confidence: confirmed ? "confirmed" : "needs-check",
    sources: sources.slice(0, MAX_SOURCES),
  }
}

function customerDraftOf(question: string, phrasing: CustomerPhrasing | null): AnswerCard["customerDraft"] {
  if (!phrasing || phrasing.conf < CUSTOMER_PHRASING_MIN_CONF || !phrasing.text.trim()) return undefined
  if (POLICY_QUESTION.test(question) && phrasing.kind !== "policy") return undefined
  if (phrasing.kind === "policy") {
    return {
      text: phrasing.text.trim(),
      status: "needs-check",
      note: phrasing.policyRef ? `${phrasing.policyRef} 결정 대기 — 확인 뒤에 보내세요.` : "정책 결정 대기 — 확인 뒤에 보내세요.",
    }
  }
  return { text: phrasing.text.trim(), status: "confirmed", note: "공개 챗봇이 지금 고객에게 내는 답입니다." }
}

async function safely<T>(task: (() => Promise<T>) | undefined, fallback: T): Promise<T> {
  if (!task) return fallback
  try {
    return await task()
  } catch {
    return fallback
  }
}

const EMPTY_PARTS: InternalEvidenceParts = { curated: [], incidents: [], publicDocs: [], internalDocs: [], publicAnswer: null, internalDraft: null }

/** 정보 질문 하나의 답 블록. 근거가 있으면 [answer], 없으면 [answer(못 찾음), contact, links(코파일럿)]. */
export async function answerKnowledge(question: string, deps: KnowledgeDeps): Promise<AiBlock[]> {
  const [parts, phrasing, consultations] = await Promise.all([
    safely(() => deps.evidence(question), EMPTY_PARTS),
    safely(deps.customerPhrasing ? () => deps.customerPhrasing!(question) : undefined, null),
    safely(deps.consultationCount ? () => deps.consultationCount!(question) : undefined, null),
  ])
  const picked = assemble(parts)
  const title = clip(question, 40)

  if (!picked) {
    const card: AnswerCard = {
      title: "클래스인 정보",
      target: { label: title, meta: "근거 없음" },
      answer: NO_EVIDENCE_ANSWER,
      confidence: "needs-check",
      sources: [],
      note: "추측해서 답하지 않았습니다. 아래 담당자에게 확인하거나 CS 코파일럿에서 찾아보세요.",
    }
    const contact = await safely(() => deps.contact(question), null)
    const blocks: AiBlock[] = [{ kind: "answer", card }]
    if (contact) blocks.push({ kind: "contact", card: contact })
    if (getLinkById(CS_COPILOT_LINK_ID)) {
      blocks.push({
        kind: "links",
        card: { title: "더 찾아보기", target: { label: "CS 코파일럿", meta: "내부 문서·상담 사례 검색" }, items: [{ linkId: CS_COPILOT_LINK_ID }] },
      })
    }
    return blocks
  }

  const sources = [...picked.sources]
  if (typeof consultations === "number" && consultations > 0) {
    sources.push({
      title: `비슷한 상담 사례 ${consultations}건`,
      where: "원문은 CS 코파일럿에서",
      kind: "consultation",
      status: "needs-check",
      externalUse: false,
      linkId: CS_COPILOT_LINK_ID,
    })
  }
  const customerDraft = customerDraftOf(question, phrasing)
  const card: AnswerCard = {
    title: "클래스인 정보",
    target: { label: title, meta: picked.confidence === "confirmed" ? "근거 확정" : "확인 필요" },
    answer: picked.conclusion,
    ...(picked.steps.length ? { steps: picked.steps } : {}),
    ...(picked.cautions.length ? { cautions: picked.cautions } : {}),
    confidence: picked.confidence,
    sources,
    ...(customerDraft ? { customerDraft } : {}),
  }
  return [{ kind: "answer", card }]
}
