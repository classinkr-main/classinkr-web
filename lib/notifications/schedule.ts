/**
 * 알림 발송 스케줄 — 운영자가 배포 없이 바꾸는 값.
 *
 * Vercel Hobby 는 cron 경로당 하루 1회, 트리거 정확도 ±59분이다. 그래서 "분"은
 * 예약할 수 없고 "시"만 고를 수 있다. `/api/cron/dispatch/[slot]` 이 시간대별로
 * 하루 한 번씩 깨어나 이 설정과 맞는 잡만 실행하는 구조다.
 *
 * 시각이 둘인 이유: 지금 집계 창은 10:10 KST 에 닫히는데 카드는 11시대에 나간다.
 * 하나로 합치면 둘 중 하나가 조용히 어긋나므로 각각 노출한다.
 */

export const NOTIFICATION_SCHEDULE_JOB_KEYS = ["leadDaily"] as const
export type NotificationScheduleJobKey = (typeof NOTIFICATION_SCHEDULE_JOB_KEYS)[number]

export interface LeadDailySchedule {
  /** 디스패처가 이 KST 시(0-23)에 깨어나면 아침 카드를 보낸다. */
  deliveryHourKst: number
  /** 집계 창이 닫히는 KST 시각. 카드가 세는 구간의 끝이다. */
  windowEndHourKst: number
  windowEndMinuteKst: number
  /** 토·일에는 보내지 않는다. */
  weekdaysOnly: boolean
}

export interface NotificationSchedule {
  leadDaily: LeadDailySchedule
}

/**
 * 2026-09-07 이전의 고정 동작과 동일한 값이다. 기본값을 바꾸면 그날 하루
 * 집계 창이 어긋나므로, 기존 상수(10:10 KST, 크론 11:10 KST)를 그대로 옮겨 적는다.
 */
export const DEFAULT_NOTIFICATION_SCHEDULE: NotificationSchedule = {
  leadDaily: {
    deliveryHourKst: 11,
    windowEndHourKst: 10,
    windowEndMinuteKst: 10,
    weekdaysOnly: true,
  },
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.trunc(parsed)
  if (rounded < min || rounded > max) return fallback
  return rounded
}

export function mergeNotificationSchedule(raw: unknown): NotificationSchedule {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const leadDailyRaw =
    source.leadDaily && typeof source.leadDaily === "object"
      ? (source.leadDaily as Record<string, unknown>)
      : {}
  const fallback = DEFAULT_NOTIFICATION_SCHEDULE.leadDaily

  return {
    leadDaily: {
      deliveryHourKst: clampInt(
        leadDailyRaw.deliveryHourKst,
        0,
        23,
        fallback.deliveryHourKst
      ),
      windowEndHourKst: clampInt(
        leadDailyRaw.windowEndHourKst,
        0,
        23,
        fallback.windowEndHourKst
      ),
      windowEndMinuteKst: clampInt(
        leadDailyRaw.windowEndMinuteKst,
        0,
        59,
        fallback.windowEndMinuteKst
      ),
      weekdaysOnly: leadDailyRaw.weekdaysOnly !== false,
    },
  }
}

const KST_OFFSET_HOURS = 9

/** KST 시(0-23) → UTC 시(0-23). 디스패처 슬롯은 UTC 시로 등록된다. */
export function kstHourToUtcSlot(kstHour: number) {
  return (((kstHour - KST_OFFSET_HOURS) % 24) + 24) % 24
}

/** UTC 슬롯(0-23) → KST 시(0-23). */
export function utcSlotToKstHour(utcSlot: number) {
  return (utcSlot + KST_OFFSET_HOURS) % 24
}

export function formatKstHourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}시`
}

export function formatKstTimeLabel(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}
