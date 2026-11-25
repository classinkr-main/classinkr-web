// 내부 CS 에스컬레이션의 형(型)과 상수 — 브라우저와 서버가 함께 쓴다.
//
// 이 파일에는 담당자 이름·위컴 멘션·고객 기관 같은 값을 두지 않는다(2026-11 B2, R2).
// 값이 든 표와 분류·초안 생성은 lib/internal-cs-chat/escalation-routing.ts(server-only)에 있고,
// 화면은 POST /api/admin/cs-chat/escalation 결과(EscalationResult)만 받는다.

export interface HqContactInfo {
  domain: string
  domainLabel: string
  primaryContact: string
  secondaryContact?: string
  firstLineContact: string
  remoteTool?: string
  wecomMention: string
  recommendedTag: string
  guidanceTip: string
  /** 위컴 대신 쓰는 경로가 있으면 그 안내(예: 메일 요청 창구). */
  channelNote?: string
  /** 근거 문서 위치(파일:줄). 여러 곳이면 " · " 로 잇는다. */
  source: string
  /** 근거 문서의 기준일(YYYY-MM-DD). 담당 교체를 확인한 날이 아니다. */
  verifiedAt: string
}

export type EscalationIssueTypeTag = "【缺陷】" | "【需求】" | "【疑似缺陷】"

export type EscalationConfidence = "high" | "low" | "none"

export interface EscalationCandidate {
  domain: string
  domainLabel: string
  score: number
}

export interface EscalationContext {
  domain: string
  contact: HqContactInfo
  /** 분류 점수 판단. low 면 candidates 에 후보 2개, none 이면 맞는 규칙이 없어 general 로 떨어졌다. */
  confidence: EscalationConfidence
  candidates: EscalationCandidate[]
  /** 한국 지사 업무(견적·입금·세금계산서·출고 등) 문맥으로 보였는지. 본사보다 한국 담당 확인이 먼저다. */
  krTopic: boolean
  /** customer_context 에서만 가져온 기관명(가림 적용). 사용자 글·AI 답에서는 추측하지 않는다. */
  institution: string | null
  /** 사용자 글에 계정 ID·UID 가 있었는지. 값은 초안에 싣지 않는다(본사 공유 전 담당자가 직접 넣는다). */
  hasAccountId: boolean
  lessonId: string | null
  lessonName: string | null
  errorCode: string | null
  deviceModel: string | null
  appVersion: string | null
  kstTime: string | null
  beijingTime: string | null
  issueType: "bug" | "requirement" | "suspected_bug"
  issueTypeTag: EscalationIssueTypeTag
  /** 사용자 글 첫 줄(가림 적용, 200자). */
  symptomSummary: string
  /** 대화의 우선순위(conversation.priority). 없으면 null — 초안은 "[확인 후 입력]" 자리를 둔다. */
  priority: string | null
  assigneeName: string | null
  /** 입력(사용자 글·customer_context 값)에서 가린 개인정보 개수. */
  redactionCount: number
}

/**
 * 초안 입력. AI 답 글은 받지 않는다 — 모델 답에 인용된 다른 고객의 이름·시각·"점검 완료" 같은 문장이
 * 기관·발생 시각·확인 사실 칸으로 새어 들어가지 않게 하려는 것이다(IC-02).
 */
export interface EscalationInput {
  /** 상담원·고객이 쓴 글(role=user)만. */
  userMessages: string[]
  customerContext?: Record<string, unknown> | null
  title?: string | null
  tags?: string[]
  priority?: string | null
  assigneeName?: string | null
}

/** POST /api/admin/cs-chat/escalation 응답. 화면은 이것만 그린다. */
export interface EscalationResult {
  context: EscalationContext
  hqDraft: string
  handoffDraft: string
}

/** 사실을 확인하기 전에는 채우지 않는 자리. 고객 안내 복사는 이 자리가 남아 있으면 막힌다. */
export const DRAFT_PLACEHOLDER = "[확인 후 입력]"
