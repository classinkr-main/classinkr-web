import "server-only"

import {
  evaluateChatbotQuery,
  type ChatbotSource,
} from "@/lib/chatbot/service"
import {
  searchConsultationEvidence,
  type ConsultationEvidence,
} from "@/lib/internal-cs-chat/consultation-search"
import type { InternalCsSourceRef } from "@/lib/internal-cs-chat/gemini"
import {
  formatIncidentEvidence,
  incidentSourceRefs,
  maskOrgNames,
  searchIncidentEvidence,
  type IncidentEvidence,
} from "@/lib/internal-cs-chat/incident-search"
import {
  curatedSourceRefsFor,
  selectInternalCsKnowledge,
  type InternalCsCuratedKnowledgeEntry,
  type InternalCsExternalUse,
  type InternalCsKnowledgeStatus,
} from "@/lib/internal-cs-chat/knowledge"

export interface InternalCsCopilotContext {
  internalContext: string
  sourceRefs: InternalCsSourceRef[]
  deterministicFallback: string
  publicEvidence: {
    /** 고객에게 그대로 보내도 되는 공개 위젯 답. 첫 출처가 내부 문서이거나 상담 연결·거절·자기소개 답이면 null 이다. */
    answer: string | null
    /** 첫 출처가 내부 문서일 때 위젯 답을 여기로 옮긴다. 내부 전용이라 고객 초안·결정형 초안에는 싣지 않는다. */
    internalDraft?: string | null
    /** answer 를 버린 이유(상담 연결·정책 거절·자기소개·위젯 문구). 버린 답은 어디에도 싣지 않는다. */
    discardedAnswer?: DiscardedWidgetAnswer
    sources: ChatbotSource[]
    warning?: string
  }
  curatedEvidence: {
    entries: Array<{
      id: string
      title: string
      status: InternalCsKnowledgeStatus
      externalUse: InternalCsExternalUse
      summary: string
    }>
    recommendedTags: string[]
    reviewRequired: boolean
    reviewReasons: string[]
  }
  incidentEvidence?: IncidentEvidence[]
}

export type DiscardedWidgetAnswer = "handoff" | "policy_refusal" | "self_intro"

export interface BuildInternalCsCopilotContextOptions {
  queueTags?: readonly string[]
  /**
   * 공개 리트리버가 internal 가시성 문서(brand-canon 원문 등)까지 포함하도록 스레딩한다.
   * 내부 CS 경로에서만 true. 공개 챗봇 경로는 절대 넘기지 않는다(계약 6).
   */
  includeInternalDocs?: boolean
}

const DEFAULT_PUBLIC_CONTEXT_TIMEOUT_MS = 3_500

const INTERNAL_OPERATING_GUIDE = [
  "[내부 CS 운영 원칙]",
  "- 내부 답변은 질문에 대한 직접 답을 먼저 쓰고, 필요한 정보는 임의로 축약하지 않는다. 비교·절차·주의 사항은 Markdown으로 구조화한다.",
  "- 최종 판단, 고객 전달, 본사 전달, 승인 권한은 CS 담당자에게 있다.",
  "- AI 결과는 검토 전 초안이다. 담당자가 승인하거나 수정하기 전에는 외부로 전송하지 않는다.",
  "- 공개 가이드와 내부 정보가 충돌하면 임의로 결론 내리지 않고 적용 모델·세대·앱 버전·시장·출처일을 확인한다.",
  "- 가격·계약·환불·보증·개인정보·장애 원인·설치 가능 여부는 계정/계약/현장 조건을 확인하기 전 확정하지 않는다.",
  "- 상담 기록에는 질문/현상, 환경과 재현 절차, 안내 내용, 미확정 항목, 다음 액션, 담당자, 기한을 남긴다.",
  "- 고객 속성 태그와 사건 분류/심각도/처리 상태를 섞지 않는다.",
].join("\n")

const HQ_COMMUNICATION_GUIDE = [
  "[본사 확인·소통 기준]",
  "- 제목: [KR-CS][우선순위][제품 영역][케이스 ID] 한 줄 요약",
  "- Case: 발생 시각(KST), 한국 담당자, 기관/계정 식별자, 제품·모델·세대·버전",
  "- Impact: 영향 사용자·수업·기기 수, 수업 차단 여부, 고객 요구 시한",
  "- Reproduction: 재현 절차, 기대 결과와 실제 결과, 발생 빈도",
  "- Korea checks: 이미 확인한 항목, 시도한 조치와 결과, 임시 우회 방법",
  "- Evidence: 개인정보를 제거한 로그·이미지·영상과 내부 케이스 링크",
  "- Request: 본사가 답해야 할 질문 1~3개, 원인/조치/버그/ETA 중 필요한 항목, 요청 회신 시각",
  "- 회신에는 적용 모델·시장·효력 발생일·근거 문서 버전을 요청하고 원문과 한국어 요약을 함께 보존한다.",
].join("\n")

function boundedTimeoutMs() {
  const parsed = Number(process.env.INTERNAL_CS_PUBLIC_CONTEXT_TIMEOUT_MS)
  if (!Number.isFinite(parsed)) return DEFAULT_PUBLIC_CONTEXT_TIMEOUT_MS
  return Math.min(5_000, Math.max(1_000, Math.trunc(parsed)))
}

function compact(value: string, limit: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit)
}

function statusLabel(status: InternalCsKnowledgeStatus) {
  switch (status) {
    case "confirmed":
      return "확정"
    case "conditional":
      return "조건부"
    case "conflicting_sources":
      return "자료 충돌"
    default:
      return "본사 확인 필요"
  }
}

export function isInternalDocSource(source: Pick<ChatbotSource, "visibility">) {
  return source.visibility === "internal"
}

function sourceRef(source: ChatbotSource): InternalCsSourceRef {
  const anchor = source.heading ? `#${compact(source.heading, 100)}` : ""
  const id = source.articleId || `${source.urlPath}${anchor}`
  const label = compact([source.title, source.heading].filter(Boolean).join(" · "), 200)
  // 내부 전용 문서(cs-knowledge·internal-canon)는 공개 문서와 같은 RPC 로 들어오지만 외부 사용 경계가 다르다.
  // kind 와 externalUse 를 따로 찍어야 지시문의 사용 범위 규칙이 적용되고, 검토 UI 가 잠금으로 보여 준다.
  if (isInternalDocSource(source)) {
    return { id, label: `[내부] ${label}`.slice(0, 200), kind: "internal_doc", externalUse: "internal_only" }
  }
  return { id, label, kind: "public_doc" }
}

interface KeyedSourceRef {
  /** 중복 제거 키. 같은 문서의 서로 다른 선례(D-18, D-19)가 한 줄로 합쳐지지 않게 id 와 caseId 를 함께 쓴다. */
  key: string
  ref: InternalCsSourceRef
}

function keyed(ref: InternalCsSourceRef, caseId?: string): KeyedSourceRef {
  return { key: `${ref.id}|${caseId ?? ""}`, ref }
}

function dedupeSourceRefs(sourceRefs: KeyedSourceRef[]) {
  const seen = new Set<string>()
  return sourceRefs.filter(({ key }) => {
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).map(({ ref }) => ref)
}

function consultationSourceRefs(evidence: ConsultationEvidence[]): InternalCsSourceRef[] {
  // href 는 InternalCsSourceRef 필드가 아니다. UI 가 "channel:" 접두어로 href=null(잠금 아이콘)을 유도한다(계약 8).
  return evidence.map((entry) => ({
    id: `channel:${entry.conversationId}`,
    label: compact(`[상담] ${maskOrgNames(entry.excerpt)}`, 200),
  }))
}

function formatConsultationEvidence(evidence: ConsultationEvidence[]) {
  if (evidence.length === 0) return ""

  const lines = evidence.slice(0, 4).map((entry, index) => {
    const meta = [
      entry.tags.length ? `태그 ${entry.tags.slice(0, 6).join(", ")}` : "",
      `유사도 ${entry.similarity.toFixed(2)}`,
    ].filter(Boolean).join(" / ")
    return [
      `${index + 1}. ${compact(maskOrgNames(entry.excerpt), 700)}`,
      `   맥락: ${meta}`,
    ].join("\n")
  })

  return [
    "[과거 상담 사례]",
    "담당자 확인용 참고이며, 최신 정책·계약·사양과 다를 수 있어 그대로 인용하지 않는다.",
    ...lines,
  ].join("\n")
}

function formatPublicEvidence(answer: string | null, sources: ChatbotSource[], warning?: string) {
  const publicSources = sources.filter((source) => !isInternalDocSource(source))
  const sections = publicSources.slice(0, 4).map((source, index) => [
    `${index + 1}. ${compact(source.title, 160)}${source.heading ? ` / ${compact(source.heading, 120)}` : ""}`,
    `   공개 경로: ${source.urlPath}`,
    `   근거: ${compact(source.excerpt, 900)}`,
  ].join("\n"))

  return [
    "[공개 가이드 검색 결과]",
    answer ? `공개 고객 응대 안전 초안: ${compact(answer, 1_500)}` : "공개 고객 응대 안전 초안: 없음",
    sections.length > 0 ? sections.join("\n") : "일치하는 공개 문서 근거 없음",
    warning ? `검색 경고: ${compact(warning, 300)}` : "",
  ].filter(Boolean).join("\n")
}

// 내부 전용 문서 근거는 공개 가이드와 다른 블록으로 싣는다. 같은 블록에 섞이면 모델이 "공개 경로"로 읽어
// 고객 초안에 그대로 옮길 수 있다(externalUse 규칙이 적용되지 않는 경로였다).
function formatInternalDocEvidence(sources: ChatbotSource[], internalDraft: string | null = null) {
  const internalSources = sources.filter(isInternalDocSource)
  if (internalSources.length === 0 && !internalDraft) return ""
  const sections = internalSources.slice(0, 4).map((source, index) => [
    `${index + 1}. ${compact(source.title, 160)}${source.heading ? ` / ${compact(source.heading, 120)}` : ""}`,
    "   사용 범위: 내부 전용 — 고객 초안에는 요지만 옮기고 원문·내부 경로·식별 정보는 싣지 않는다",
    `   근거: ${compact(source.excerpt, 900)}`,
  ].join("\n"))

  return [
    "[내부 전용 문서 근거]",
    "내부 담당자 답변에만 사용한다. 고객 전달 초안에서는 외부 사용 경계에 따라 제외하거나 '확인 필요'로 표시한다.",
    internalDraft ? `내부 전용 초안(고객 전달 금지, 첫 출처가 내부 문서): ${compact(internalDraft, 1_500)}` : "",
    ...sections,
  ].filter(Boolean).join("\n")
}

function requestedBoardModel(question: string) {
  const model = question.match(/\bS\s*(65|75|86|98|110)\b/i)?.[1]
  if (model) return `S${model}`
  const inches = question.match(/\b(65|75|86|98|110)\s*인치/i)?.[1]
  return inches ? `S${inches}` : null
}

function relevantWeightEvidence(question: string, publicEvidence: InternalCsCopilotContext["publicEvidence"]) {
  if (!/(?:무게|중량|weight)/i.test(question)) return null
  const model = requestedBoardModel(question)
  if (!model) return null

  const evidenceText = [
    publicEvidence.answer ?? "",
    // 내부 전용 문서 발췌는 "바로 답변"이 되지 않도록 공개 출처만 쓴다.
    ...publicEvidence.sources.filter((source) => !isInternalDocSource(source)).map((source) => `${source.title} ${source.heading ?? ""} ${source.excerpt}`),
  ].join("\n")
  const modelPattern = new RegExp(`${model.replace("S", "S\\s*")}(?:(?!S\\s*(?:65|75|86|98|110)).){0,180}?(\\d+(?:\\.\\d+)?)\\s*kg`, "is")
  const weight = evidenceText.match(modelPattern)?.[1]
  const asksPackagingWeight = /박스|포장|총중량|gross|package|packaging/i.test(question)
  const hasPackagingEvidence = new RegExp(
    `${model.replace("S", "S\\s*")}(?:(?!S\\s*(?:65|75|86|98|110)).){0,180}?(?:박스|포장|총중량|gross|package|packaging)(?:(?!S\\s*(?:65|75|86|98|110)).){0,80}?(\\d+(?:\\.\\d+)?)\\s*kg`,
    "is"
  ).exec(evidenceText)?.[1]

  if (asksPackagingWeight) {
    if (hasPackagingEvidence) {
      return [
        "## 바로 답변",
        `- **확인됨:** ${model} 박스 포함 포장 총중량은 **${hasPackagingEvidence}kg**입니다.`,
      ].join("\n\n")
    }
    return [
      "## 바로 답변",
      `- **미확인:** ${model}의 박스·완충재 포함 **포장 총중량은 현재 검색 근거에서 확인되지 않습니다.**`,
      weight ? `- **확인된 인접 값:** ${model} 본체 순중량은 **${weight}kg**입니다.` : "",
      "- 본체 순중량을 박스 포함 중량으로 안내하면 안 됩니다.",
      "",
      "## 다음 확인",
      "최신 출고 포장 규격서 또는 물류 담당자에게 `Gross weight / 포장 총중량` 항목을 확인하세요.",
    ].filter(Boolean).join("\n")
  }

  if (!weight) return null
  return [
    "## 바로 답변",
    `${model} 본체 **순중량은 ${weight}kg**입니다.`,
    "",
    "박스·완충재·스탠드를 포함한 중량은 별도 값이므로, 포장 또는 설치 중량을 묻는 경우 다시 구분해 확인해야 합니다.",
  ].join("\n")
}

const EXTERNAL_USE_TAGS: Record<InternalCsExternalUse, string> = {
  internal_only: "[내부 전용]",
  confirmation_required: "[확인 전 외부 단정 금지]",
  reviewed_summary_allowed: "[담당자 검토 후 안내 가능]",
}

function buildDeterministicFallback({
  question,
  publicEvidence,
  selectedFacts,
  consultationCount,
  incidentEvidence = [],
}: {
  question: string
  publicEvidence: InternalCsCopilotContext["publicEvidence"]
  selectedFacts: InternalCsCuratedKnowledgeEntry[]
  consultationCount: number
  incidentEvidence?: IncidentEvidence[]
}) {
  // 이 글은 모델이 실패했을 때 상담원이 받는 "고객 응대 안전 초안"이다. 내부 문서 발췌(internalDraft)와
  // 위젯의 상담 연결·거절·자기소개 답은 들어오지 못하고, 공개 근거(answer)와 정리 지식·선례로만 짠다.
  const hasEvidence = selectedFacts.length > 0 || incidentEvidence.length > 0
  const focusedWeightAnswer = relevantWeightEvidence(question, publicEvidence)
  const directAnswer = focusedWeightAnswer
    || (publicEvidence.answer ? ["## 바로 답변", publicEvidence.answer.trim()].join("\n\n") : "")
    || (hasEvidence
      ? ""
      : [
          "## 바로 답변",
          "현재 질문과 직접 일치하는 근거를 찾지 못했습니다. 확인되지 않은 사실은 만들지 않습니다.",
        ].join("\n\n"))

  const evidenceSummary = selectedFacts.length > 0
    ? [
        "## 확인 상태",
        ...selectedFacts.map((entry) => {
          const summary = entry.hideSummaryInFallback
            ? "수치는 내부 컨텍스트에서만 확인합니다. 고객 안내에는 쓰지 않습니다."
            : entry.summary
          return `- **${statusLabel(entry.status)} · ${entry.title}** ${EXTERNAL_USE_TAGS[entry.externalUse]}: ${summary}`
        }),
      ].join("\n")
    : ""
  const incidentSummary = incidentEvidence.length > 0
    ? [
        "## 선례 오류 케이스 및 점검 흐름",
        ...incidentEvidence.slice(0, 3).map((entry) => `- **${entry.title}:** ${entry.summary}`),
      ].join("\n")
    : ""
  const consultationSummary = consultationCount > 0
    ? `## 참고 사례\n과거 유사 상담 ${consultationCount}건이 검색됐습니다. 최신 정책·계약·사양과 대조한 뒤 사용하세요.`
    : ""

  return [directAnswer, evidenceSummary, incidentSummary, consultationSummary].filter(Boolean).join("\n\n")
}

// 공개 챗봇 위젯이 고객에게 하는 말(상담 연결 버튼·정책 거절·자기소개)은 내부 근거가 아니다.
// 답 모드·의도로 먼저 거르고, 문구로 한 번 더 거른다(가짜 응답이나 모드가 비어 있는 응답 대비).
const WIDGET_HANDOFF_TEXT_RE =
  /\[실시간 상담 연결\]|(?:담당자|상담원|상담사)(?:\s*상담)?(?:으로|에게|와|께)\s*(?:바로\s*)?연결|상담(?:원|사|\s*채널)?\s*연결/
const WIDGET_REFUSAL_TEXT_RE = /도와드리지\s*(?:않습니다|못합니다|못해요)|답변\s*(?:드릴|해\s*드릴)\s*수\s*없|안내해\s*드릴\s*수\s*없/
const WIDGET_SELF_INTRO_TEXT_RE = /저는\s*(?:클래스인\s*|Classin\s*)?(?:AI|인공지능)/

function classifyWidgetAnswer(result: {
  answer?: string | null
  answerMode?: string
  detectedIntent?: string
  sources: ChatbotSource[]
}): Pick<InternalCsCopilotContext["publicEvidence"], "answer" | "internalDraft" | "discardedAnswer"> {
  const answer = result.answer?.trim() || null
  if (!answer) return { answer: null }
  if (result.answerMode === "handoff" || WIDGET_HANDOFF_TEXT_RE.test(answer)) return { answer: null, discardedAnswer: "handoff" }
  if (WIDGET_REFUSAL_TEXT_RE.test(answer)) return { answer: null, discardedAnswer: "policy_refusal" }
  if (result.detectedIntent === "self_knowledge" || WIDGET_SELF_INTRO_TEXT_RE.test(answer)) {
    return { answer: null, discardedAnswer: "self_intro" }
  }
  // 출처 중 하나라도 내부 문서면 이 답에는 내부 발췌가 섞였을 수 있다(출처별 기여를 알 수 없다).
  // 공개 안전 초안이 아니라 내부 전용 초안으로 옮긴다.
  if (result.sources.some(isInternalDocSource)) return { answer: null, internalDraft: answer }
  return { answer }
}

async function getPublicEvidence(
  question: string,
  options: { includeInternalDocs?: boolean } = {}
): Promise<InternalCsCopilotContext["publicEvidence"]> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const fallback: InternalCsCopilotContext["publicEvidence"] = {
    answer: null,
    sources: [],
    warning: "공개 문서 검색이 지연되어 내부 운영 원칙만 사용합니다.",
  }

  // includeInternalDocs 가 꺼져 있으면 기존과 동일하게 { generateAnswer: false } 만 넘긴다(공개 경로 무회귀).
  const queryOptions: { generateAnswer: boolean; includeInternalDocs?: boolean } = {
    generateAnswer: false,
    ...(options.includeInternalDocs ? { includeInternalDocs: true } : {}),
  }

  try {
    const timeout = new Promise<InternalCsCopilotContext["publicEvidence"]>((resolve) => {
      timeoutId = setTimeout(() => resolve(fallback), boundedTimeoutMs())
    })
    return await Promise.race([
      evaluateChatbotQuery(question, queryOptions).then((result) => ({
        ...classifyWidgetAnswer({
          answer: result.answer,
          answerMode: result.answerMode,
          detectedIntent: (result as { detectedIntent?: string }).detectedIntent,
          sources: result.sources,
        }),
        sources: result.sources.slice(0, 4),
        ...(result.warning ? { warning: result.warning } : {}),
      })),
      timeout,
    ])
  } catch {
    return {
      ...fallback,
      warning: "공개 문서 검색에 실패하여 내부 운영 원칙만 사용합니다.",
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

interface CollectedEvidence {
  curated: ReturnType<typeof selectInternalCsKnowledge>
  publicEvidence: InternalCsCopilotContext["publicEvidence"]
  consultationEvidence: ConsultationEvidence[]
  incidentEvidence: IncidentEvidence[]
}

// 공개 근거, 과거 상담 사례, 오류 선례/확인 흐름을 병렬 조회한다. 모두 never-throw 지만 방어적으로 빈 배열 폴백을 둔다.
async function collectEvidence(
  question: string,
  options: BuildInternalCsCopilotContextOptions & { withConsultation: boolean }
): Promise<CollectedEvidence> {
  const curated = selectInternalCsKnowledge(question, options.queueTags)
  const [publicEvidence, consultationEvidence, incidentEvidence] = await Promise.all([
    getPublicEvidence(question, { includeInternalDocs: options.includeInternalDocs }),
    options.withConsultation
      ? searchConsultationEvidence(question).catch(() => [] as ConsultationEvidence[])
      : Promise.resolve([] as ConsultationEvidence[]),
    Promise.resolve(searchIncidentEvidence(question)).catch(() => [] as IncidentEvidence[]),
  ])
  return { curated, publicEvidence, consultationEvidence, incidentEvidence }
}

// 컨텍스트에 실제로 실린 근거만 출처로 붙인다. 늘 넣는 지식(정본 우선순위·응대 톤)은 모든 답에 들어가는 규칙일 뿐
// 이 질문의 근거가 아니므로 세지 않고, 문자열로 나가지 않는 항목(공개 4건·내부 4건·상담 4건 밖)도 뺀다.
function loadedSourceRefs({ curated, publicEvidence, consultationEvidence, incidentEvidence }: CollectedEvidence) {
  const matchedEntries = curated.entries.filter((entry) => !entry.alwaysInclude)
  const publicSources = publicEvidence.sources.filter((source) => !isInternalDocSource(source)).slice(0, 4)
  const internalSources = publicEvidence.sources.filter(isInternalDocSource).slice(0, 4)
  return dedupeSourceRefs([
    ...curatedSourceRefsFor(matchedEntries).map((ref) => keyed(ref)),
    ...incidentSourceRefs(incidentEvidence.slice(0, 4)).map((ref, index) => keyed(ref, incidentEvidence[index]?.caseId ?? incidentEvidence[index]?.id)),
    ...publicSources.map((source) => keyed(sourceRef(source))),
    ...internalSources.map((source) => keyed(sourceRef(source))),
    ...consultationSourceRefs(consultationEvidence.slice(0, 4)).map((ref) => keyed(ref)),
  ])
}

export async function buildInternalCsCopilotContext(
  question: string,
  options: BuildInternalCsCopilotContextOptions = {}
): Promise<InternalCsCopilotContext> {
  const collected = await collectEvidence(question, { ...options, withConsultation: true })
  const { curated, publicEvidence, consultationEvidence, incidentEvidence } = collected
  const consultationBlock = formatConsultationEvidence(consultationEvidence)
  const incidentBlock = formatIncidentEvidence(incidentEvidence)
  const sourceRefs = loadedSourceRefs(collected)
  const selectedFacts = curated.entries.filter((entry) => !entry.alwaysInclude)
  const reviewReasons = selectedFacts
    .filter((entry) =>
      entry.status === "conflicting_sources" ||
      entry.status === "hq_confirmation_required"
    )
    .map((entry) => `${entry.title}: ${statusLabel(entry.status)}`)

  const deterministicFallback = buildDeterministicFallback({
    question,
    publicEvidence,
    selectedFacts,
    consultationCount: consultationEvidence.length,
    incidentEvidence,
  })

  return {
    internalContext: [
      formatPublicEvidence(publicEvidence.answer, publicEvidence.sources, publicEvidence.warning),
      formatInternalDocEvidence(publicEvidence.sources, publicEvidence.internalDraft ?? null),
      curated.internalContext,
      incidentBlock,
      consultationBlock,
      INTERNAL_OPERATING_GUIDE,
      HQ_COMMUNICATION_GUIDE,
    ].filter(Boolean).join("\n\n"),
    sourceRefs,
    deterministicFallback,
    publicEvidence,
    curatedEvidence: {
      entries: curated.entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        status: entry.status,
        externalUse: entry.externalUse,
        summary: entry.summary,
      })),
      recommendedTags: curated.recommendedTags,
      reviewRequired: reviewReasons.length > 0,
      reviewReasons,
    },
    incidentEvidence,
  }
}

// ---------------------------------------------------------------------------
// 구조화 근거 부품. 코파일럿 컨텍스트(문자열)와 같은 검색 결과에서 만들며, 나중에 매니저용 답 조립기와
// 위컴 방 답이 채널과 무관하게 같이 쓴다. 고객사 이름·원가 수치처럼 내부 전용 값의 처리는 항목마다 customerUse 로 알린다.
// ---------------------------------------------------------------------------

/**
 * 이 근거를 고객에게 말해도 되는지.
 * - allowed: 공개 문서. 그대로 안내할 수 있다.
 * - review: 담당자가 검토한 뒤 요약해서 안내할 수 있다.
 * - confirm_first: 계약·본사·현장 확인 전에는 외부에 단정하지 않는다.
 * - internal_only: 고객에게 말하지 않는다(내부 판단 근거).
 */
export type InternalEvidenceCustomerUse = "allowed" | "review" | "confirm_first" | "internal_only"

export interface InternalEvidenceSourceRef {
  id: string
  label?: string
}

interface InternalEvidenceBase {
  id: string
  title: string
  summary: string
  /** 확정된 사실인가. null 이면 이 경로에서는 알 수 없다(내부 문서 청크의 확정 여부는 service.ts 가 아직 넘기지 않는다). */
  confirmed: boolean | null
  customerUse: InternalEvidenceCustomerUse
  /** 근거의 기준일(YYYY-MM-DD). 출처 문서 이름에 날짜가 있을 때만 채운다. */
  asOf: string | null
  sources: InternalEvidenceSourceRef[]
}

export interface InternalCuratedEvidence extends InternalEvidenceBase {
  kind: "curated"
  status: InternalCsKnowledgeStatus
  externalUse: InternalCsExternalUse
  handling: string[]
  recommendedTags: string[]
}

export interface InternalIncidentEvidence extends InternalEvidenceBase {
  kind: "incident" | "workflow"
  caseId?: string
  causeStatus?: string
  resolution?: string
  steps: string[]
}

export interface InternalPublicDocEvidence extends InternalEvidenceBase {
  kind: "public_doc"
  heading?: string
  urlPath: string
  excerpt: string
}

export interface InternalDocEvidence extends InternalEvidenceBase {
  kind: "internal_doc"
  heading?: string
  excerpt: string
}

export interface InternalEvidenceParts {
  curated: InternalCuratedEvidence[]
  incidents: InternalIncidentEvidence[]
  publicDocs: InternalPublicDocEvidence[]
  internalDocs: InternalDocEvidence[]
  /** 고객에게 그대로 나가도 되는 공개 위젯 답. 없으면 null. 참고용이며 근거 항목이 아니다. */
  publicAnswer: string | null
  /** 첫 출처가 내부 문서라 내부 전용으로 옮긴 위젯 답. */
  internalDraft: string | null
  warning?: string
}

export interface BuildInternalEvidenceOptions {
  queueTags?: readonly string[]
  /** 기본 true. 내부 전용 문서 청크까지 검색한다. 공개 챗봇 경로는 이 함수를 쓰지 않는다. */
  includeInternalDocs?: boolean
}

const DATE_IN_PATH_RE = /(\d{4}-\d{2}-\d{2})/

function latestDate(ids: readonly string[]) {
  const dates = ids.map((id) => id.match(DATE_IN_PATH_RE)?.[1]).filter((value): value is string => Boolean(value))
  return dates.length > 0 ? dates.sort().at(-1) ?? null : null
}

function curatedCustomerUse(externalUse: InternalCsExternalUse): InternalEvidenceCustomerUse {
  switch (externalUse) {
    case "reviewed_summary_allowed":
      return "review"
    case "confirmation_required":
      return "confirm_first"
    default:
      return "internal_only"
  }
}

function toCuratedEvidence(entry: InternalCsCuratedKnowledgeEntry): InternalCuratedEvidence {
  return {
    kind: "curated",
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    status: entry.status,
    externalUse: entry.externalUse,
    handling: [...entry.handling],
    recommendedTags: [...entry.recommendedTags],
    confirmed: entry.status === "confirmed",
    customerUse: curatedCustomerUse(entry.externalUse),
    asOf: latestDate(entry.sourceRefs.map((ref) => ref.id)),
    sources: entry.sourceRefs.map((ref) => ({ id: ref.id, ...(ref.label ? { label: ref.label } : {}) })),
  }
}

function toIncidentEvidence(entry: IncidentEvidence): InternalIncidentEvidence {
  const isCase = Boolean(entry.caseId)
  const confirmed = isCase ? entry.causeStatus === "확정" : true
  return {
    kind: isCase ? "incident" : "workflow",
    id: entry.id,
    ...(entry.caseId ? { caseId: entry.caseId } : {}),
    title: entry.title,
    summary: entry.summary,
    ...(entry.causeStatus ? { causeStatus: entry.causeStatus } : {}),
    ...(entry.resolution ? { resolution: entry.resolution } : {}),
    steps: entry.workflowSteps ?? [],
    confirmed,
    customerUse: confirmed ? "review" : "confirm_first",
    asOf: latestDate([entry.sourceFile]),
    sources: [{ id: entry.sourceFile, label: `[선례] ${entry.title}` }],
  }
}

function toSourceEvidence(source: ChatbotSource, kind: "public_doc" | "internal_doc") {
  const id = source.articleId || source.urlPath
  const base = {
    id,
    title: compact(source.title, 160),
    summary: compact(source.excerpt, 400),
    ...(source.heading ? { heading: compact(source.heading, 120) } : {}),
    excerpt: compact(source.excerpt, 900),
    asOf: null,
    sources: [{ id, label: compact([source.title, source.heading].filter(Boolean).join(" · "), 200) }],
  }
  if (kind === "public_doc") {
    return { ...base, kind, urlPath: source.urlPath, confirmed: true, customerUse: "allowed" } as InternalPublicDocEvidence
  }
  return { ...base, kind, confirmed: null, customerUse: "internal_only" } as InternalDocEvidence
}

/**
 * 질문에 맞는 근거를 부품으로 돌려준다(정리 지식·선례·공개 문서·내부 문서).
 * 코파일럿 컨텍스트와 같은 검색을 쓰지만 문자열을 만들지 않는다. 상담 내역 검색(DB)은 하지 않는다.
 */
export async function buildInternalEvidence(
  question: string,
  options: BuildInternalEvidenceOptions = {}
): Promise<InternalEvidenceParts> {
  const { curated, publicEvidence, incidentEvidence } = await collectEvidence(question, {
    queueTags: options.queueTags,
    includeInternalDocs: options.includeInternalDocs ?? true,
    withConsultation: false,
  })
  return {
    curated: curated.entries.filter((entry) => !entry.alwaysInclude).map(toCuratedEvidence),
    incidents: incidentEvidence.map(toIncidentEvidence),
    publicDocs: publicEvidence.sources
      .filter((source) => !isInternalDocSource(source))
      .map((source) => toSourceEvidence(source, "public_doc") as InternalPublicDocEvidence),
    internalDocs: publicEvidence.sources
      .filter(isInternalDocSource)
      .map((source) => toSourceEvidence(source, "internal_doc") as InternalDocEvidence),
    publicAnswer: publicEvidence.answer,
    internalDraft: publicEvidence.internalDraft ?? null,
    ...(publicEvidence.warning ? { warning: publicEvidence.warning } : {}),
  }
}
