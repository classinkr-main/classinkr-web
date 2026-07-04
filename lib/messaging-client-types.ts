/**
 * ─────────────────────────────────────────────────────────────
 * messaging-client-types.ts  —  메시지 발송 허브 프론트 계약 타입
 * ─────────────────────────────────────────────────────────────
 *
 * 백엔드(app/api/admin/messaging/**)는 병렬 트랙에서 구현 중.
 * 이 파일은 프론트에서 fetch 응답을 파싱할 때 쓰는 클라이언트 뷰 타입만 담는다.
 * 백엔드 로직/DB 스키마는 여기서 정의하지 않는다.
 *
 * 계약(응답 래퍼는 lib/admin-api-response.ts 컨벤션 = { data } 또는 직접 필드):
 *  - GET  /api/admin/messaging/status
 *  - POST /api/admin/messaging/test-send
 *  - GET  /api/admin/messaging/logs
 */

export type MessagingChannel = "sms" | "kakao"
export type EmailProvider = "resend" | "webhook" | "none"

/** GET /api/admin/messaging/status → data */
export interface MessagingBalance {
  point: number
  balance: number
}

export interface MessagingKakaoChannel {
  channelId: string
  searchId: string
  phoneNumber: string
}

export type MessagingTemplateStatus = string

export interface MessagingTemplate {
  templateId: string
  name: string
  /** solapi 승인 상태 원문 (예: "APPROVED", "PENDING", "REJECTED") */
  status: MessagingTemplateStatus
}

export interface MessagingStatus {
  provider: "solapi"
  configured: boolean
  balance: MessagingBalance | null
  kakaoChannels: MessagingKakaoChannel[]
  templates: MessagingTemplate[]
  senderNumber: string | null
  emailProvider: EmailProvider
}

/** POST /api/admin/messaging/test-send → data */
export type MessagingSendStatus = "sent" | "failed" | "simulated"

export interface MessagingTestSendRequest {
  channel: MessagingChannel
  to: string
  text?: string
  templateId?: string
  variables?: Record<string, string>
}

export interface MessagingTestSendResult {
  status: MessagingSendStatus
  messageId?: string
  /** solapi 원문 에러 — 발신번호 미등록 등 진단용. UI에 그대로 노출한다. */
  error?: string
}

/** GET /api/admin/messaging/logs → data */
export interface MessagingLog {
  id: string
  channel: string
  provider: string
  /** 마스킹된 수신자 */
  recipient: string
  templateId: string | null
  status: MessagingSendStatus | string
  statusCode: string | null
  error: string | null
  /** JSONB 객체로 저장됨 (Record<string,unknown>). 표시할 땐 JSON.stringify. */
  context: Record<string, unknown> | null
  createdAt: string
}

export interface MessagingLogsResult {
  logs: MessagingLog[]
  total: number
}

/**
 * 응답 래퍼 파싱 헬퍼 — { data: T } 또는 T 직접(레거시)을 방어적으로 처리.
 * lib/admin-api-response.ts는 adminCachedJson(data)로 최상위에 data를 직렬화하므로
 * 백엔드 트랙이 { data } 래퍼를 쓰든 최상위를 쓰든 모두 흡수한다.
 */
export function unwrapMessagingData<T>(payload: unknown): T | null {
  if (payload == null || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  if ("data" in record && record.data != null) {
    return record.data as T
  }
  return payload as T
}
