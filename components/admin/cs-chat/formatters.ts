// 내부 CS 코파일럿 워크스페이스의 순수 헬퍼.
// 첨부/연동 이벤트 필드 정규화, 시각·지표 포맷, 근거 참조 정규화, 소통 초안 3종 템플릿.
//
// buildCustomerHoldingTemplate · buildInternalHandoffTemplate · buildHqTemplate 세 함수는
// 답변 카드의 "소통 초안 3종"과 본사 확인 화면이 함께 쓰는 고정 포맷이다.
// 출력 문자열은 회귀 대상이라 시험(tests/internal-cs-chat/formatters.test.ts)으로 고정한다. 바꿀 때는 시험과 함께,
// 이유를 커밋 글에 적는다(2026-11 B1: 사용자 글·제목 가림, "개인정보 최소화·제거" 라벨을 사실대로 고침).

import type { EscalationInput } from "@/lib/internal-cs-chat/escalation-types"
import { redactInternalCsDraft, redactInternalCsValue } from "@/lib/internal-cs-chat/redact"

import type {
  ConversationDetailResponse,
  InternalCsAsset,
  InternalCsIntegrationEvent,
  InternalCsSourceRef,
  IntegrationStatusResponse,
} from "./types"

export function assetFileName(asset: InternalCsAsset) {
  return asset.original_file_name ?? asset.file_name ?? asset.name ?? "첨부 이미지"
}

export function assetPreviewUrl(asset: InternalCsAsset) {
  return asset.signed_url ?? asset.thumbnail_url ?? asset.preview_url ?? asset.url ?? null
}

export function assetAnalysis(asset: InternalCsAsset) {
  if (asset.analysis_summary) return asset.analysis_summary
  if (asset.analysis_text) return asset.analysis_text
  if (asset.analysis) return asset.analysis
  if (asset.analysis_payload && typeof asset.analysis_payload === "object") {
    return JSON.stringify(asset.analysis_payload, null, 2)
  }
  if (asset.analysis_json && typeof asset.analysis_json === "object") {
    return JSON.stringify(asset.analysis_json, null, 2)
  }
  return "분석 결과가 아직 준비되지 않았습니다."
}

export function assetAnalysisStatus(asset: InternalCsAsset) {
  return asset.analysis_status ?? asset.status ?? "completed"
}

export function assetNeedsHumanReview(asset: InternalCsAsset) {
  if (asset.human_review_required != null) return asset.human_review_required
  return (asset.analysis_review_state ?? asset.review_state) !== "approved"
}

export function integrationState(response: IntegrationStatusResponse | null) {
  const bridge = response?.bridge ?? response
  const configured = bridge?.configured ?? response?.configured ?? false
  const status = bridge?.status ?? response?.status ?? (configured ? "ready" : "unconfigured")
  const ready = configured && ["ready", "connected", "ok", "healthy", "active"].includes(status.toLowerCase())
  return {
    configured,
    ready,
    status,
    label: bridge?.label ?? bridge?.provider ?? response?.label ?? response?.provider ?? "AI 브리지",
    message: bridge?.message ?? response?.message ?? (ready ? "현재 대화를 안전하게 전달할 수 있습니다." : "연동 설정과 상태를 확인해 주세요."),
    lastCheckedAt: bridge?.lastCheckedAt ?? response?.lastCheckedAt ?? null,
  }
}

export function integrationEventWhen(event: InternalCsIntegrationEvent) {
  return event.created_at ?? event.createdAt ?? null
}

export function integrationEventSummary(event: InternalCsIntegrationEvent) {
  if (event.summary) return event.summary
  if (typeof event.result === "string") return event.result
  if (event.error_message ?? event.errorMessage) return event.error_message ?? event.errorMessage ?? ""
  return event.event_type ?? "내부 분석 요청"
}

export function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

export function formatTime(value: string | null) {
  if (!value) return "방금"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

export function formatDay(value: string | null) {
  if (!value) return "오늘"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(date)
}

// 지표 카드 행(계약 1) 전용 포맷터 — 분모 0으로 rate가 null이면 "—"로 표시한다.
export function formatMetricRate(value: number | null | undefined) {
  if (value == null) return "—"
  return `${Math.round(value * 100)}%`
}

export function formatMetricHours(value: number | null | undefined) {
  if (value == null) return "—"
  return `${Number.isInteger(value) ? value : value.toFixed(1)}h`
}

export function normalizeSourceRefs(values: unknown[]): InternalCsSourceRef[] {
  return values.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return []
    const source = value as Record<string, unknown>
    if (typeof source.id !== "string" || !source.id.trim()) return []
    const kind = typeof source.kind === "string" ? source.kind : undefined
    const verificationStatus = typeof source.verificationStatus === "string"
      ? source.verificationStatus
      : undefined
    const externalUse = typeof source.externalUse === "string" ? source.externalUse : undefined
    const reviewState = typeof source.reviewState === "string" ? source.reviewState : undefined
    return [{
      id: source.id,
      label: typeof source.label === "string" ? source.label : undefined,
      kind: kind as InternalCsSourceRef["kind"],
      verificationStatus: verificationStatus as InternalCsSourceRef["verificationStatus"],
      externalUse: externalUse as InternalCsSourceRef["externalUse"],
      reviewState: reviewState as InternalCsSourceRef["reviewState"],
    }]
  })
}

export function sourceStatus(source: InternalCsSourceRef) {
  if (source.kind === "internal_asset") {
    if (source.reviewState === "approved") return { label: "담당자 확인", tone: "confirmed" as const }
    return { label: "이미지 미검토", tone: "pending" as const }
  }
  // 선례(incident-search)·과거 상담(channel:)·내부 문서는 고객에게 그대로 옮기면 안 되는 근거다(IC-21).
  if (source.label?.startsWith("[선례]")) return { label: "선례 · 내부 전용", tone: "pending" as const }
  if (source.id.startsWith("channel:")) return { label: "과거 상담 · 내부 전용", tone: "pending" as const }
  if (source.externalUse === "internal_only" || (source.kind as string | undefined) === "internal_doc") {
    return { label: "내부 전용", tone: "pending" as const }
  }
  if (source.verificationStatus === "confirmed") {
    return { label: "확정", tone: "confirmed" as const }
  }
  if (source.verificationStatus === "conditional") {
    return { label: "조건부", tone: "conditional" as const }
  }
  if (source.verificationStatus === "conflicting_sources") {
    return { label: "자료 충돌", tone: "pending" as const }
  }
  if (source.verificationStatus === "hq_confirmation_required") {
    return { label: "본사 확인", tone: "pending" as const }
  }
  return null
}

export function sourceHref(source: InternalCsSourceRef) {
  if (source.id.startsWith("/")) return source.id.split("#")[0]
  if (source.id.startsWith("docs/")) return null
  return null
}

/**
 * 새 탭으로 여는 근거 링크. sourceHref 는 같은 탭 링크(공개 문서)용이라 그대로 두고, 작업면을 떠나면 안 되는
 * 내부 근거는 이 함수로 따로 만든다. channel: 근거는 상담 Inbox(/admin/channel-talk)로 간다 — Inbox 가 상담 id
 * 깊은 링크를 받는 형식은 아직 정하지 않았으므로(결정 14) 목록으로 연다.
 */
export function sourceLink(source: InternalCsSourceRef): { href: string; newTab: boolean } | null {
  if (source.id.startsWith("channel:")) return { href: "/admin/channel-talk", newTab: true }
  const href = sourceHref(source)
  return href ? { href, newTab: true } : null
}

/** 이미지 분석이 남긴 민감정보 경고(analysis_payload.sensitiveDataWarnings). 없으면 빈 배열. */
export function assetSensitiveWarnings(asset: InternalCsAsset): string[] {
  const payload = [asset.analysis_payload, asset.analysis_json].find(
    (value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)
  )
  const raw = payload?.sensitiveDataWarnings
  if (!Array.isArray(raw)) return []
  return raw
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => redactInternalCsValue(value.trim()))
}

/**
 * 화면에 보일 첨부 파일명. 이름에 전화·이메일·계좌 같은 값이 있으면 확장자만 남긴 "첨부 이미지"로 바꾼다
 * (이름 칸에 사람 이름이 함께 들어 있는 경우가 많아 부분 가림 대신 통째로 숨긴다).
 */
export function maskAssetFileName(name: string | null | undefined) {
  const value = name?.trim()
  if (!value) return "첨부 이미지"
  // 파일명은 "_" 로 낱말을 잇는 경우가 많다. 경계(\b)가 잡히도록 구분자를 공백으로 바꿔 검사한다.
  const { count } = redactInternalCsDraft(value.replace(/[_+]/g, " "))
  if (count === 0) return value
  const extension = value.match(/\.[A-Za-z0-9]{2,5}$/)?.[0] ?? ""
  return `첨부 이미지${extension}`
}

/** 초안 생성기 입력. AI 답 글은 넣지 않는다(IC-02) — 사용자 글·customer_context·대화 메타만. */
export function escalationInputFromDetail(detail: ConversationDetailResponse): EscalationInput {
  return {
    userMessages: detail.messages.filter((message) => message.role === "user").map((message) => message.content),
    customerContext: detail.conversation.customer_context,
    title: detail.conversation.title,
    tags: detail.conversation.tags,
    priority: detail.conversation.priority,
    assigneeName: detail.conversation.assignee_name,
  }
}

/**
 * 본사(WeCom)·사내 초안 복사 규칙 — HqPanel 과 CommunicationTabs 가 같은 함수를 쓴다.
 * 사내용이라 승인 잠금은 없고, 복사 직전에 한 번 더 가린다(담당자가 고쳐 쓴 글에 연락처가 들어가도 걸러진다).
 */
export function prepareInternalDraftCopy(text: string) {
  return redactInternalCsDraft(text)
}

/** "[확인 후 입력]"·"[확인된 내용 입력]"·"[회신 예정 시각]" 같은 채울 자리가 남아 있는지. */
export function hasDraftPlaceholder(text: string) {
  return /\[[^\]\n]*(?:입력|예정 시각)[^\]\n]*\]/.test(text)
}

/** 가장 최근에 승인된 답의 교정본(고객에게 보낼 최종본). 없으면 null. */
export function latestApprovedAnswer(detail: ConversationDetailResponse | null) {
  if (!detail) return null
  const approved = [...detail.messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.review_state === "approved" && message.corrected_content?.trim())
  return approved?.corrected_content?.trim() ?? null
}

/**
 * 고객 안내 초안의 기준. 승인된 교정본이 있으면 그것을(가림 적용), 없으면 대기 안내 틀을 쓴다.
 * 대기 안내 틀은 채울 자리가 있어 그대로는 복사되지 않는다(hasDraftPlaceholder).
 */
export function buildCustomerDraftBase(detail: ConversationDetailResponse | null) {
  const approved = latestApprovedAnswer(detail)
  if (approved) {
    const redacted = redactInternalCsDraft(approved)
    return { text: redacted.text, redactionCount: redacted.count, source: "approved" as const }
  }
  return { text: buildCustomerHoldingTemplate(detail), redactionCount: 0, source: "holding" as const }
}

export function getLastQuestion(detail: ConversationDetailResponse) {
  return [...detail.messages].reverse().find((message) => message.role === "user")?.content
}

export function buildCustomerHoldingTemplate(detail: ConversationDetailResponse | null) {
  if (!detail) return ""
  return [
    "안녕하세요.",
    "현재 확인된 범위: [확인된 내용 입력]",
    "추가 확인 중인 항목: [모델·세대·버전·계약 등 입력]",
    "확정 전 안내하지 않는 항목: [가격·환불·보증·원인 등 해당 시 입력]",
    `다음 안내: ${detail.conversation.assignee_name ?? "담당자 지정 필요"} · [회신 예정 시각]`,
  ].join("\n")
}

export function buildInternalHandoffTemplate(detail: ConversationDetailResponse | null) {
  if (!detail) return ""
  return [
    `[CS-${detail.conversation.id}] ${redactInternalCsValue(detail.conversation.title)}`,
    `우선순위 / 상태: ${detail.conversation.priority} / ${detail.conversation.status}`,
    `담당자: ${detail.conversation.assignee_name ?? "지정 필요"}`,
    `분류 태그: ${detail.conversation.tags.join(", ") || "분류 필요"}`,
    "제품·모델·세대·앱 버전: 확인 필요",
    `문의 / 현상: ${redactInternalCsValue(getLastQuestion(detail)) || "입력 필요"}`,
    "영향·긴급도: 입력 필요",
    "확인한 내용 / 시도 결과: 입력 필요",
    "고객에게 안내한 내용: 입력 필요",
    "미확정·충돌·리스크: 입력 필요",
    "다음 액션 / 담당자 / 기한: 입력 필요",
    `관련 근거·첨부: 이미지 ${detail.assets?.length ?? 0}건 / 근거 링크 입력 필요`,
  ].join("\n")
}

export function buildHqTemplate(detail: ConversationDetailResponse | null) {
  if (!detail) return ""
  const area = detail.conversation.tags
    .find((tag) => tag.startsWith("area:"))
    ?.slice("area:".length) || "AREA"
  const lastQuestion = redactInternalCsValue(getLastQuestion(detail))
  return [
    `[KR-CS][${detail.conversation.priority.toUpperCase()}][${area}][${detail.conversation.id}] ${redactInternalCsValue(detail.conversation.title)}`,
    "",
    "1. Case",
    `- 내부 케이스 ID: ${detail.conversation.id}`,
    `- 한국 담당자: ${detail.conversation.assignee_name ?? "지정 필요"}`,
    "- 발생 시각(KST) / 기관·계정 식별자: 입력 필요 (전화·이메일·계좌·이름은 적지 않음)",
    "- 제품·모델·세대·앱 버전: 확인 필요",
    "",
    "2. Impact",
    "- 영향 사용자·수업·기기 수: 확인 필요",
    "- 수업 차단 여부 / 고객 요구 시한: 확인 필요",
    "",
    "3. Question / Reproduction",
    `- 현상: ${lastQuestion || "질문과 현상을 입력해 주세요."}`,
    "- 재현 절차 / Expected / Actual / Frequency: 입력 필요",
    "",
    "4. Korea checks",
    "- 이미 확인한 항목 / 시도한 조치 / 임시 우회 결과: 입력 필요",
    "",
    "5. Evidence",
    `- 첨부 이미지 ${detail.assets?.length ?? 0}건(원본 — 개인정보 포함 여부 직접 확인) / 내부 근거 링크: 입력 필요`,
    "",
    "6. Request to HQ",
    "- 답변이 필요한 질문 1~3개: 입력 필요",
    "- 원인 / 조치 / 버그 여부 / ETA 중 필요한 항목: 입력 필요",
    "- Reply needed by (KST): 입력 필요",
    "- Please include applicable market/models, generation, effective date, and source document/version.",
  ].join("\n")
}
