/**
 * ─────────────────────────────────────────────────────────────
 * messaging/types.ts  —  발송 레이어 공용 타입
 * ─────────────────────────────────────────────────────────────
 *
 * solapi(SMS/LMS/알림톡) 발송 요청·결과·로그 타입.
 * 여기서 정의하는 채널/상태 문자열은 message_logs 테이블의
 * CHECK 제약(20260703_message_logs.sql)과 반드시 일치해야 한다.
 */

/** message_logs.channel 값. DB CHECK 제약과 동기화. */
export type MessageChannel =
  | "sms"
  | "lms"
  | "kakao_alimtalk"
  | "kakao_friendtalk"
  | "email"

/** message_logs.status 값. DB CHECK 제약과 동기화. */
export type MessageLogStatus = "requested" | "sent" | "failed" | "simulated"

/** 발송 프로바이더 식별자. */
export type MessageProvider = "solapi" | "resend" | "webhook"

/**
 * 발송 컨텍스트 — message_logs.context(jsonb)에 그대로 저장된다.
 * 어떤 화면/자동화에서 발송했는지 추적용. PII를 넣지 말 것(전화번호는 recipient 컬럼에 별도 저장·마스킹).
 */
export interface MessageContext {
  /** 발송 출처 식별자. 예: "test-send", "sms-campaign", "automation" */
  source?: string
  /** 관련 캠페인/규칙 ID 등 */
  refId?: string
  [key: string]: unknown
}

/** 단건 SMS/LMS 발송 요청 항목. */
export interface SmsMessageInput {
  to: string
  text: string
}

export interface SendSmsParams {
  messages: SmsMessageInput[]
  /** 발신번호. 미지정 시 env SOLAPI_SENDER_NUMBER → 확정 폴백. */
  from?: string
  context?: MessageContext
}

export interface SendAlimtalkParams {
  to: string
  templateId: string
  variables?: Record<string, string>
  /** 알림톡 실패 시 SMS 대체발송 차단 여부. 기본 true(대체발송 안 함). */
  disableSms?: boolean
  /** 발신번호(대체 SMS 발송 시 사용). 미지정 시 SMS 기본값. */
  from?: string
  context?: MessageContext
}

/** 단건 발송 결과 요약 (per-recipient). */
export interface RecipientSendResult {
  to: string
  status: MessageLogStatus
  messageId?: string
  statusCode?: string
  error?: string
}

/**
 * 발송 집계 결과.
 * solapi 응답(groupInfo/failedMessageList)을 해석한 정직한 카운트.
 * dry-run/미설정 시에는 requested === simulated, sent === 0.
 */
export interface SendResult {
  provider: MessageProvider
  channel: MessageChannel
  /** 접수 요청한 총 건수 */
  requested: number
  /** 실제 발송 접수 성공 건수 */
  sent: number
  /** 발송 접수 실패 건수 */
  failed: number
  /** dry-run/미설정으로 시뮬레이션 처리된 건수 */
  simulated: number
  /** solapi 그룹 ID (실발송 시) */
  groupId?: string
  /** per-recipient 상세 */
  results: RecipientSendResult[]
  /** 그룹 전체 실패 등 상위 레벨 에러 메시지 */
  error?: string
}

/** message_logs 한 행(응답용). recipient는 이 타입 단계에서는 원본, API 응답 시 마스킹. */
export interface MessageLogRow {
  id: string
  channel: MessageChannel
  provider: MessageProvider | string
  recipient: string
  templateId: string | null
  groupId: string | null
  status: MessageLogStatus
  statusCode: string | null
  error: string | null
  context: Record<string, unknown>
  createdAt: string
}
