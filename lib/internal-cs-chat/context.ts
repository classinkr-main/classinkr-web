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
  selectInternalCsKnowledge,
  type InternalCsExternalUse,
  type InternalCsKnowledgeStatus,
} from "@/lib/internal-cs-chat/knowledge"

export interface InternalCsCopilotContext {
  internalContext: string
  sourceRefs: InternalCsSourceRef[]
  deterministicFallback: string
  publicEvidence: {
    answer: string | null
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
}

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
  "- 내부 답변은 결론·사실 우선으로 짧게 쓰고, 인사·공감 같은 감정 표현은 고객 전달 문안에만 쓴다.",
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

const INTERNAL_GUIDE_REFS: InternalCsSourceRef[] = [
  {
    id: "docs/active/classin-operating-canon-2026-07-02.md",
    label: "Classin 운영 정본",
    kind: "internal_guide",
  },
  {
    id: "docs/active/internal-crm-backend-operating-plan-2026-06-26.md",
    label: "내부 CRM 운영 계획",
    kind: "internal_guide",
  },
  {
    id: "docs/active/classin-pre-adoption-question-matrix-2026-06-18.md",
    label: "도입 전 질문·확인 단계",
    kind: "internal_guide",
  },
]

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

function sourceRef(source: ChatbotSource): InternalCsSourceRef {
  const anchor = source.heading ? `#${compact(source.heading, 100)}` : ""
  return {
    id: source.articleId || `${source.urlPath}${anchor}`,
    label: compact([source.title, source.heading].filter(Boolean).join(" · "), 200),
    kind: "public_doc",
  }
}

function dedupeSourceRefs(sourceRefs: InternalCsSourceRef[]) {
  const seen = new Set<string>()
  return sourceRefs.filter((source) => {
    if (seen.has(source.id)) return false
    seen.add(source.id)
    return true
  })
}

function consultationSourceRefs(evidence: ConsultationEvidence[]): InternalCsSourceRef[] {
  // href 는 InternalCsSourceRef 필드가 아니다. UI 가 "channel:" 접두어로 href=null(잠금 아이콘)을 유도한다(계약 8).
  return evidence.map((entry) => ({
    id: `channel:${entry.conversationId}`,
    label: compact(`[상담] ${entry.excerpt}`, 200),
  }))
}

function formatConsultationEvidence(evidence: ConsultationEvidence[]) {
  if (evidence.length === 0) return ""

  const lines = evidence.slice(0, 4).map((entry, index) => {
    const meta = [
      entry.tags.length ? `태그 ${entry.tags.slice(0, 6).join(", ")}` : "",
      entry.matchedOrg ? `기관 ${compact(entry.matchedOrg, 60)}` : "",
      `유사도 ${entry.similarity.toFixed(2)}`,
    ].filter(Boolean).join(" / ")
    return [
      `${index + 1}. ${compact(entry.excerpt, 700)}`,
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
  const sections = sources.slice(0, 4).map((source, index) => [
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
        answer: result.answer?.trim() || null,
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

export async function buildInternalCsCopilotContext(
  question: string,
  options: BuildInternalCsCopilotContextOptions = {}
): Promise<InternalCsCopilotContext> {
  const curated = selectInternalCsKnowledge(question, options.queueTags)
  // 공개 근거와 과거 상담 사례를 병렬 조회한다. 둘 다 never-throw 지만 방어적으로 빈 배열 폴백을 둔다.
  const [publicEvidence, consultationEvidence] = await Promise.all([
    getPublicEvidence(question, { includeInternalDocs: options.includeInternalDocs }),
    searchConsultationEvidence(question).catch(() => [] as ConsultationEvidence[]),
  ])
  const publicSourceRefs = publicEvidence.sources.map(sourceRef)
  const consultationBlock = formatConsultationEvidence(consultationEvidence)
  const sourceRefs = dedupeSourceRefs([
    ...INTERNAL_GUIDE_REFS,
    ...curated.sourceRefs,
    ...publicSourceRefs,
    ...consultationSourceRefs(consultationEvidence),
  ])
  const selectedFacts = curated.entries.filter((entry) => !entry.alwaysInclude)
  const reviewReasons = selectedFacts
    .filter((entry) =>
      entry.status === "conflicting_sources" ||
      entry.status === "hq_confirmation_required"
    )
    .map((entry) => `${entry.title}: ${statusLabel(entry.status)}`)

  const deterministicFallback = [
    "검토 전 내부 초안",
    publicEvidence.answer
      ? `확인된 공개 가이드 기준으로는 다음과 같이 안내할 수 있습니다.\n${compact(publicEvidence.answer, 1_500)}`
      : "현재 질문과 직접 일치하는 공개 가이드 근거를 찾지 못했습니다.",
    selectedFacts.length > 0
      ? [
          "정리된 내부 기준:",
          ...selectedFacts.slice(0, 3).map((entry) => `- [${statusLabel(entry.status)}] ${entry.summary}`),
        ].join("\n")
      : "정리된 내부 기준과 직접 일치하는 항목이 없어 담당자 확인이 필요합니다.",
    consultationEvidence.length > 0
      ? `과거 유사 상담 사례 ${consultationEvidence.length}건이 검색되었습니다. 최신 정책·계약·사양과 다를 수 있어 인용 전 담당자 확인이 필요합니다.`
      : "과거 유사 상담 사례는 찾지 못했습니다.",
    "내부 정보 또는 본사 회신과 충돌하는 항목은 적용 모델·세대·버전과 출처일을 확인한 뒤 답변해야 합니다.",
    "외부 전달 전 CS 담당자의 검토와 승인이 필요합니다.",
  ].join("\n\n")

  return {
    internalContext: [
      formatPublicEvidence(publicEvidence.answer, publicEvidence.sources, publicEvidence.warning),
      curated.internalContext,
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
  }
}
