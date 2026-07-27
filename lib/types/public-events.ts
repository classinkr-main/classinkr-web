// lib/types/public-events.ts
export type EventCategory = "웨비나" | "오프라인 행사" | "프로모션" | "얼리버드" | "파트너십"
export type EventStatus = "진행 중" | "예정" | "마감"
export type EventPublicationStatus = "draft" | "published"

export interface PublicEvent {
  id: string
  title: string
  description: string | null
  category: EventCategory
  tag: string | null
  startsAt: string       // ISO datetime string. 회차 행사면 첫 회차 시작(봉투 시작)
  endsAt: string | null  // 회차 행사면 마지막 회차 종료(봉투 끝)
  sessionDates: string[] | null  // "YYYY-MM-DD"[] — 띄엄띄엄 열리는 회차 날짜. NULL이면 단일 기간
  location: string | null
  ctaLabel: string
  ctaHref: string | null
  imagePath: string | null
  imageUrl: string | null  // Supabase Storage public URL (computed)
  highlight: boolean
  statusOverride: EventStatus | null
  status: EventStatus    // computed from dates or statusOverride
  publicationStatus: EventPublicationStatus
  slug: string | null
  contentMarkdown: string | null
  createdAt: string
  updatedAt: string
}

export type PublicEventInsert = {
  title: string
  description?: string | null
  category: EventCategory
  tag?: string | null
  startsAt: string
  endsAt?: string | null
  sessionDates?: string[] | null
  location?: string | null
  ctaLabel?: string
  ctaHref?: string | null
  imagePath?: string | null
  highlight?: boolean
  statusOverride?: EventStatus | null
  publicationStatus?: EventPublicationStatus
  slug?: string | null
  contentMarkdown?: string | null
}

export type PublicEventUpdate = Partial<PublicEventInsert>

export const EVENT_CATEGORIES: EventCategory[] = [
  "웨비나", "오프라인 행사", "프로모션", "얼리버드", "파트너십"
]
