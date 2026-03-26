/**
 * ─────────────────────────────────────────────────────────────
 * automation-types.ts  —  마케팅 자동화 시스템 타입 정의
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-A1] 세그먼트 기반 자동 발송 시스템
 *   leads + newsletter_subscribers 두 테이블을 통합 조회하여
 *   SegmentConfig 조건에 맞는 수신자를 추출하고 이메일을 자동 발송.
 *
 * [NOTE-A2] 트리거 타입
 *   - on_submit: 폼 제출 즉시 매칭 시 발송 (웰컴/팔로업 메일)
 *   - scheduled: 지정 스케줄에 전체 세그먼트에 발송
 *   - delay: 제출 N시간 후 발송 (Supabase cron 또는 외부 큐 필요)
 *
 * [NOTE-A3] 이메일 템플릿
 *   EmailComposer와 별개로 재사용 가능한 템플릿 저장소.
 *   변수 {name}, {org}, {role} 를 수신자 데이터로 치환.
 */

// ─── 세그먼트 설정 ───────────────────────────────────────────
export interface SegmentConfig {
  /** 유입 경로 필터 (빈 배열 = 전체) */
  sources?: Array<"demo_modal" | "contact_page" | "newsletter" | "manual">
  /** 리드 상태 필터 — leads 테이블에만 적용 */
  leadStatuses?: Array<"new" | "contacted" | "converted" | "closed">
  /** 태그 필터 — newsletter_subscribers에 적용 (OR 조건) */
  tags?: string[]
  /** 이메일 있는 대상만 */
  hasEmail?: boolean
  /** 최근 N일 이내 제출된 건만 (null = 전체 기간) */
  daysSinceSubmit?: number | null
  /** 소스 테이블: leads, subscribers, both */
  targetTable?: "leads" | "subscribers" | "both"
}

// ─── 트리거 설정 ─────────────────────────────────────────────
export interface OnSubmitTriggerConfig {
  type: "on_submit"
}

export interface ScheduledTriggerConfig {
  type: "scheduled"
  /** cron 표현식 (예: "0 9 * * 1" = 매주 월요일 오전 9시) */
  cron: string
  /** 한국어 설명 (예: "매주 월요일 오전 9시") */
  cronLabel?: string
}

export interface DelayTriggerConfig {
  type: "delay"
  /** 제출 후 N시간 후 발송 */
  hours: number
}

export type TriggerConfig =
  | OnSubmitTriggerConfig
  | ScheduledTriggerConfig
  | DelayTriggerConfig

// ─── 이메일 템플릿 ───────────────────────────────────────────
/** [NOTE-A3] 재사용 가능한 이메일 템플릿 */
export interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string          // HTML
  /** 사용 가능한 변수 목록 (예: ["name", "org", "role"]) */
  variables: string[]
  createdAt: string
  updatedAt: string
}

// ─── 자동화 규칙 ─────────────────────────────────────────────
export type AutomationStatus = "draft" | "active" | "paused"
export type TriggerType = "on_submit" | "scheduled" | "delay"

export interface AutomationRule {
  id: string
  name: string
  status: AutomationStatus
  triggerType: TriggerType
  triggerConfig: TriggerConfig
  segmentConfig: SegmentConfig
  templateId: string
  /** 조인된 템플릿 (읽기 전용) */
  template?: EmailTemplate
  createdAt: string
  updatedAt: string
}

// ─── 실행 로그 ───────────────────────────────────────────────
export type AutomationLogStatus = "pending" | "sent" | "failed"

export interface AutomationLog {
  id: string
  ruleId: string
  /** 조인된 규칙 이름 (읽기 전용) */
  ruleName?: string
  triggeredAt: string
  recipientCount: number
  status: AutomationLogStatus
  errorMessage?: string
  /** 실제 발송된 이메일 목록 (디버깅용) */
  recipientEmails?: string[]
  createdAt: string
}

// ─── 세그먼트 수신자 (내부용) ────────────────────────────────
export interface AutomationRecipient {
  email: string
  name?: string
  org?: string
  role?: string
  phone?: string
  size?: string   // academy_size (학원 규모)
  source: string
}

// ─── API 요청/응답 타입 ──────────────────────────────────────
export interface CreateTemplateRequest {
  name: string
  subject: string
  body: string
  variables?: string[]
}

export interface UpdateTemplateRequest extends Partial<CreateTemplateRequest> {}

export interface CreateRuleRequest {
  name: string
  triggerType: TriggerType
  triggerConfig: TriggerConfig
  segmentConfig: SegmentConfig
  templateId: string
  status?: AutomationStatus
}

export interface UpdateRuleRequest extends Partial<CreateRuleRequest> {}

export interface TriggerRuleResponse {
  ok: boolean
  logId: string
  recipientCount: number
  status: AutomationLogStatus
  error?: string
}

// ─── PRESET CRON 옵션 ────────────────────────────────────────
export const PRESET_CRON_OPTIONS = [
  { label: "매일 오전 9시", cron: "0 9 * * *" },
  { label: "매주 월요일 오전 9시", cron: "0 9 * * 1" },
  { label: "매주 금요일 오전 10시", cron: "0 10 * * 5" },
  { label: "매월 1일 오전 9시", cron: "0 9 1 * *" },
] as const

// ─── 세그먼트 미리보기 응답 ──────────────────────────────────
export interface SegmentPreviewResponse {
  estimatedCount: number
  breakdown: { leads: number; subscribers: number }
}

// ─── PRESET DELAY 옵션 ───────────────────────────────────────
export const PRESET_DELAY_OPTIONS = [
  { label: "1시간 후", hours: 1 },
  { label: "3시간 후", hours: 3 },
  { label: "24시간 후 (1일)", hours: 24 },
  { label: "48시간 후 (2일)", hours: 48 },
  { label: "72시간 후 (3일)", hours: 72 },
] as const
