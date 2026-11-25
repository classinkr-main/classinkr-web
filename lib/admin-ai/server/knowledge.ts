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
// 1순위 근거와 결론 문장은 질문 낱말과 겹치는 정도로 고른다(정리 지식을 무조건 앞세우지 않는다, 검토 동작-1).
// 근거가 없거나 질문과 거의 겹치지 않으면 지어내지 않는다 — "근거를 찾지 못했습니다" + 담당자 카드 + CS 코파일럿 열기.
// 자료는 deps 로 받는다(서버 연결은 deps.ts, 시험은 가짜). 이 파일은 I/O 를 하지 않는다.
import type {
  InternalCuratedEvidence,
  InternalDocEvidence,
  InternalEvidenceParts,
  InternalIncidentEvidence,
  InternalPublicDocEvidence,
} from "@/lib/internal-cs-chat/context"

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

type AnyEvidence = InternalCuratedEvidence | InternalPublicDocEvidence | InternalIncidentEvidence | InternalDocEvidence

// ── 질문과 맞는 정도(검토 동작-1) ─────────────────────────────────────────────────────────
// 근거 검색은 낱말 하나(마이크·설치·결제·녹화)로도 정리 지식을 건다. 그래서 결론 줄과 1순위 근거를 "질문 낱말이 얼마나 겹치나"로
// 다시 고른다. 모델 없이 도는 결정형 점수다 — 같은 질문·같은 근거면 늘 같은 결론이다.

/** 낱말이 아니라 묻는 꼴인 말 — 겹침에 세지 않는다. */
const STOP_TOKENS = new Set([
  "어떻게", "뭐", "뭐야", "뭐임", "무엇", "무슨", "방법", "알려", "알려줘", "줘", "주세요", "가능", "가능해", "수", "있어", "있나", "있을까",
  "돼", "되나", "해", "좀", "그리고", "이거", "그거", "이건", "그건", "한", "번에", "못", "안", "뭐부터", "봐야", "나면", "때", "경우", "있는지",
  "되는지", "하는", "하려면", "하면", "거", "것", "왜", "언제", "어디", "어디서", "누구", "누가", "정도", "다", "또", "더", "같이", "따로",
  "얼마", "며칠", "몇", "써", "쓸", "할", "그럼", "근데", "혹시", "지금", "이제",
])
/** 거의 모든 근거에 나오는 일반어 — 반만 센다. */
const GENERIC_TOKENS = new Set([
  "클래스인", "classin", "수업", "교실", "학생", "교사", "선생님", "기능", "화면", "고객", "사용", "설정", "지원", "계정", "앱", "관리자",
])
/** 같은 뜻으로 보는 말(근거 문서가 다른 낱말로 적은 경우). 한 묶음의 어느 말이든 맞으면 겹친 것이다. */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["규정", "정책", "원칙", "규칙", "약관"],
  ["오류", "에러", "실패"],
  ["삭제", "지우"],
  ["가격", "요금", "단가"],
  ["다운로드", "내려받"],
  ["환불", "반환"],
]
const TOKEN_ENDING = /(?:하려면|려면|으면|하면|해요|했어|해야|해|돼요|돼|되나요|되나|되는|된|할|하는|어요|아요|나요|요|니|냐|까|지)$/
const TOKEN_PARTICLE = /(?:에서는|에서|에게|한테|으로|로|은|는|이|가|을|를|의|도|만|부터|까지|이랑|랑|하고|과|와|에)$/

export interface QuestionToken {
  /** 찾을 꼴 — 낱말과, 세 글자 이상이면 끝 글자를 뗀 줄기("견적서" → "견적"). */
  variants: string[]
  weight: number
}

/** 질문의 겹침 낱말 — 묻는 꼴·조사·어미를 덜고, 일반어는 0.5 로 센다. */
export function questionTokens(question: string): QuestionToken[] {
  const seen = new Set<string>()
  const out: QuestionToken[] = []
  for (const raw of question.toLowerCase().replace(/[?？!.,~·…"'()]/g, " ").split(/\s+/)) {
    let token = raw.trim()
    if (!token || STOP_TOKENS.has(token)) continue
    token = token.replace(TOKEN_ENDING, "")
    if (STOP_TOKENS.has(token)) continue
    token = token.replace(TOKEN_PARTICLE, "")
    if (token.length < 2 || STOP_TOKENS.has(token) || seen.has(token)) continue
    seen.add(token)
    const variants = token.length >= 3 && /[가-힣]$/.test(token) ? [token, token.slice(0, -1)] : [token]
    const group = SYNONYM_GROUPS.find((words) => words.some((word) => variants.includes(word)))
    if (group) variants.push(...group.filter((word) => !variants.includes(word)))
    out.push({ variants, weight: GENERIC_TOKENS.has(token) ? 0.5 : 1 })
  }
  return out
}

function overlap(tokens: readonly QuestionToken[], text: string): number {
  const haystack = text.toLowerCase()
  return tokens.reduce((sum, token) => sum + (token.variants.some((variant) => haystack.includes(variant)) ? token.weight : 0), 0)
}

/** 근거가 질문에 답한다고 볼 최소 겹침 — 질문 낱말 무게의 60% 이상, 그리고 1 이상(낱말 둘이면 둘 다). */
export function relevanceFloor(tokens: readonly QuestionToken[]): number {
  const total = tokens.reduce((sum, token) => sum + token.weight, 0)
  return Math.max(1, total * 0.6)
}

function sentencesOf(text: string): string[] {
  return oneLine(text)
    .split(/(?<=[.!?。])\s+|(?<=(?:다|요))\s+(?=[가-힣A-Z0-9])/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/** 근거 하나의 결론 후보 문장 — 요약 문장이 앞, 그다음 처리·단계·발췌. */
function candidateSentences(evidence: AnyEvidence): string[] {
  const out = sentencesOf(evidence.summary || evidence.title)
  if (evidence.kind === "curated") out.push(...evidence.handling.map(oneLine))
  else if (evidence.kind === "public_doc" || evidence.kind === "internal_doc") out.push(...sentencesOf(evidence.excerpt))
  else out.push(...evidence.steps.map(oneLine))
  return out.map((line) => line.replace(/^[-•*·\d.)\s]+/, "").trim()).filter(Boolean)
}

function evidenceText(evidence: AnyEvidence): string {
  return [evidence.title, ...candidateSentences(evidence)].join(" ")
}

interface Ranked {
  evidence: AnyEvidence
  score: number
  priority: number
}

/** 질문과 맞는 근거 순서. 겹침이 같으면 확정 정리 지식 → 정리 지식 → 공개 문서 → 선례 → 내부 문서. 기준 미달은 뺀다. */
function rankEvidence(parts: InternalEvidenceParts, tokens: readonly QuestionToken[]): Ranked[] {
  const all: Array<{ evidence: AnyEvidence; priority: number }> = [
    ...parts.curated.map((evidence) => ({ evidence, priority: evidence.confirmed === true ? 0 : 1 })),
    ...parts.publicDocs.map((evidence) => ({ evidence, priority: 2 })),
    ...parts.incidents.map((evidence) => ({ evidence, priority: 3 })),
    ...parts.internalDocs.map((evidence) => ({ evidence, priority: 4 })),
  ]
  const floor = relevanceFloor(tokens)
  return all
    .map((item, index) => ({ ...item, score: overlap(tokens, evidenceText(item.evidence)), index }))
    .filter((item) => tokens.length > 0 && item.score >= floor)
    .sort((a, b) => b.score - a.score || a.priority - b.priority || a.index - b.index)
}

/** 결론 문장 — 질문과 가장 많이 겹치는 문장(같으면 요약 문장·앞 문장). 겹치는 문장이 없으면 요약 첫 문장. */
function pickConclusion(evidence: AnyEvidence, tokens: readonly QuestionToken[]): string {
  const sentences = candidateSentences(evidence)
  let best = sentences[0] ?? evidence.title
  let bestScore = 0
  for (const sentence of sentences) {
    const score = overlap(tokens, sentence)
    if (score > bestScore) {
      best = sentence
      bestScore = score
    }
  }
  return best
}

interface Picked {
  conclusion: string
  steps: string[]
  cautions: string[]
  confidence: AnswerConfidence
  sources: AnswerSource[]
}

function sourceOf(evidence: AnyEvidence): AnswerSource {
  switch (evidence.kind) {
    case "curated":
      return { title: evidence.title, where: evidence.sources[0]?.label, kind: "internal", status: evidence.confirmed ? "confirmed" : "needs-check", externalUse: false }
    case "public_doc": {
      const linkId = publicLinkIdFor(evidence.urlPath)
      return { title: evidence.title, where: evidence.heading, kind: "public", status: "confirmed", externalUse: true, ...(linkId ? { linkId } : {}) }
    }
    case "internal_doc":
      return { title: evidence.title, where: evidence.heading, kind: "internal", status: "needs-check", externalUse: false }
    default:
      return { title: evidence.title, kind: "internal", status: evidence.confirmed ? "confirmed" : "needs-check", externalUse: false }
  }
}

function assemble(parts: InternalEvidenceParts, question: string): Picked | null {
  const tokens = questionTokens(question)
  const ranked = rankEvidence(parts, tokens)
  const primary: AnyEvidence | undefined = ranked.at(0)?.evidence
  if (!primary) return null

  const conclusionSentence = pickConclusion(primary, tokens)
  const steps: string[] = []
  const cautions: string[] = []
  if (primary.kind === "curated") {
    steps.push(...primary.handling)
    const statusCaution = STATUS_CAUTION[primary.status]
    if (statusCaution) cautions.push(statusCaution)
    if (primary.customerUse === "internal_only") cautions.push("사내 판단 근거입니다 — 고객에게 그대로 말하지 마세요.")
  } else if (primary.kind === "public_doc" || primary.kind === "internal_doc") {
    steps.push(...restSentences(primary.excerpt || primary.summary))
  } else {
    steps.push(...primary.steps)
    if (primary.confirmed === false) cautions.push("원인이 확정되지 않은 선례입니다.")
  }
  // 상태 주의(본사 확인 필요 등)가 이미 있으면 같은 뜻의 고객 전달 주의를 겹쳐 싣지 않는다.
  if (primary.customerUse === "confirm_first" && cautions.length === 0) cautions.push("계약·본사·현장 확인 전에는 고객에게 단정하지 마세요.")

  // 출처는 질문과 맞는 근거만, 맞는 순서대로(1순위가 맨 앞).
  const sources: AnswerSource[] = []
  const counts = { curated: 0, public_doc: 0, incident: 0, internal_doc: 0 }
  const cap = { curated: 2, public_doc: 2, incident: 1, internal_doc: 1 }
  for (const { evidence } of ranked) {
    const kind = evidence.kind === "workflow" ? "incident" : evidence.kind
    if (counts[kind] >= cap[kind]) continue
    counts[kind] += 1
    sources.push(sourceOf(evidence))
  }

  const conclusion = asConclusion(conclusionSentence)
  const conclusionKey = oneLine(conclusionSentence).replace(/[.。]$/, "")
  const confirmed =
    primary.kind === "public_doc" ? true : primary.confirmed === true && !cautions.some((c) => c.includes("확인") || c.includes("다릅니다"))
  return {
    conclusion,
    steps: Array.from(
      new Set(
        steps
          .map((step) => clip(step.replace(/^[-•*·\d.)\s]+/, ""), STEP_MAX_CHARS))
          .filter((step) => step && step.replace(/[.。]$/, "") !== conclusionKey)
      )
    ).slice(0, MAX_STEPS),
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
  const picked = assemble(parts, question)
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
