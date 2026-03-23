/**
 * ─────────────────────────────────────────────────────────────
 * marketing-types.ts  —  마케팅 이메일 시스템 타입 정의
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-1] Subscriber
 *   이메일 수신 동의(옵트인)한 리드의 정보를 저장하는 핵심 모델.
 *   개인정보보호법 준수를 위해 optInAt(동의 일시)과
 *   unsubscribedAt(수신거부 일시) 필드를 반드시 관리한다.
 *
 * [NOTE-2] Tags (성향 태그)
 *   구독자를 세그먼트별로 분류하는 태그 시스템.
 *   예) "원장", "관리자", "100명이하", "500명이상", "수학", "영어"
 *   관리자 페이지에서 태그별 필터링 → 타겟 이메일 발송에 사용.
 *
 * [NOTE-3] EmailCampaign
 *   발송된 이메일 캠페인의 이력을 저장.
 *   향후 Resend/Brevo 등 외부 서비스 연동 시 externalId 필드로
 *   외부 서비스의 캠페인 ID를 맵핑한다.
 */

// ─── 구독자 모델 ─────────────────────────────────────────────
export interface Subscriber {
  id: number
  name: string                    // 이름
  email: string                   // 이메일 (고유값)
  org?: string                    // 학원명
  role?: string                   // 직책 (원장 / 관리자 / 강사)
  size?: string                   // 원생 규모
  phone?: string                  // 전화번호

  /** [NOTE-2] 성향/세그먼트 태그 배열 */
  tags: string[]

  /** [NOTE-1] 수신 동의 상태 관리 */
  status: "active" | "unsubscribed"
  optInAt: string                 // ISO 8601 - 최초 수신 동의 일시
  unsubscribedAt?: string         // ISO 8601 - 수신 거부 일시

  /** 유입 경로: 데모 신청, 문의 페이지, 뉴스레터 직접 구독 */
  source: "demo_modal" | "contact_page" | "newsletter" | "manual"

  createdAt: string               // ISO 8601
  updatedAt: string               // ISO 8601
}

// ─── 이메일 캠페인 모델 ──────────────────────────────────────
export interface EmailCampaign {
  id: number
  subject: string                 // 이메일 제목
  body: string                    // 본문 (HTML 지원)
  /** 발송 대상 필터: 태그 기반 세그먼트 */
  targetTags: string[]            // 빈 배열 = 전체 발송
  /** 발송 상태 */
  status: "draft" | "sent" | "failed"
  sentAt?: string                 // 발송 완료 일시
  recipientCount: number          // 실제 발송 수
  /** [NOTE-3] 외부 이메일 서비스 캠페인 ID (Resend, Brevo 등) */
  externalId?: string
  createdAt: string
}

// ─── API 요청/응답 타입 ──────────────────────────────────────

/** 뉴스레터 구독 요청 (프론트엔드 → /api/newsletter/subscribe) */
export interface NewsletterSubscribeRequest {
  email: string
  name?: string
  tags?: string[]
}

/** 뉴스레터 수신거부 요청 (프론트엔드 → /api/newsletter/unsubscribe) */
export interface NewsletterUnsubscribeRequest {
  email: string
}

/** 이메일 발송 요청 (관리자 → /api/admin/email/send) */
export interface SendEmailRequest {
  subject: string
  body: string
  targetTags: string[]  // 빈 배열 = 전체 active 구독자
}

/** 구독자 수동 추가/수정 요청 (관리자 → /api/admin/subscribers) */
export interface UpsertSubscriberRequest {
  name: string
  email: string
  org?: string
  role?: string
  size?: string
  phone?: string
  tags?: string[]
}

// ─── 사전 정의 태그 목록 ─────────────────────────────────────
/**
 * [NOTE-2] 자주 사용하는 태그 프리셋.
 * 관리자 UI에서 빠른 선택용으로 제공하되,
 * 커스텀 태그도 자유롭게 추가 가능하도록 설계.
 */
export const PRESET_TAGS = [
  "원장", "관리자", "강사",
  "100명이하", "100~300명", "300~500명", "500명이상",
  "수학", "영어", "과학", "코딩", "종합",
  "서울", "경기", "지방",
  "데모신청", "행사참여", "VIP",
] as const
