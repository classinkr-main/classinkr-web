/**
 * showroom/bookings — 목동 쇼룸 상담 예약 접수 파이프라인.
 *
 * 흐름(불변식) — `lib/checkout-requests.ts` 와 같은 규약이다:
 *  ① 예약 행(showroom_bookings) 저장이 1순위 — 이게 실패해야만 500 이다.
 *  ② ops 알림은 접수당 정확히 1건(showroom.booking_requested). 리드 미러링이 만드는
 *     lead.created 알림은 suppressLeadCreatedNotification 으로 끈다.
 *  ③ 같은 접수를 leads 로 미러링해 어드민 리드 큐(기존 동선)에서 발견되게 한다.
 *     sourceDetail 이 'showroom_booking' 이라 쇼룸 의향이 처음으로 분리 집계된다 —
 *     지금까지 쇼룸 CTA 는 `?topic=하드웨어/설치/AS` 로 들어와 AS 문의와 뭉개졌다.
 *  ④ 리드 미러링·알림은 전부 best-effort — 실패해도 예약 저장은 성공으로 남는다.
 *
 * 저장 이후 작업은 deferTask(after())로 응답 뒤에 돌린다.
 *
 * 1차는 요청형이다. 저장 시점에 슬롯을 잠그지 않는다(마이그레이션 주석 참조) —
 * 같은 슬롯에 요청이 둘 들어오면 담당자가 조정한다.
 */

import "server-only"

import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import type { NotificationChannel } from "@/lib/notifications/types"
import {
  EMAIL_REGEX,
  MAX_EMAIL_LENGTH,
  MAX_MEMO_LENGTH,
  MAX_NAME_LENGTH,
  MAX_ORG_LENGTH,
  MAX_PHONE_LENGTH,
  MAX_SOURCE_PAGE_LENGTH,
  asRecord,
  isPlausibleKoreanPhone,
  isRealCalendarDate,
  normalizeMultilineText,
  normalizeText,
} from "@/lib/server/contact-field-validation"
import { submitLeadCapture } from "@/lib/server/lead-capture"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  SHOWROOM_SLOT_DURATION_MINUTES,
  isShowroomSlotTime,
  isValidIsoDate,
  type ShowroomSlotTime,
} from "@/lib/showroom/slots"

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const MAX_ROLE_LENGTH = 100
const MAX_ACADEMY_SIZE_LENGTH = 60
const MAX_VISITOR_COUNT = 20
const MAX_INTERESTS = 8

/** 접수 1건 = ops 방 알림 1건. in_app 은 emitNotificationEvent 가 항상 만든다. */
const NOTIFICATION_CHANNELS: NotificationChannel[] = ["wecom_webhook"]

/**
 * 같은 접수의 더블 클릭/재시도를 흡수하는 인스턴스 메모리 창(서버리스 인스턴스별 독립).
 * checkout-requests 와 같은 한계를 수용한다 — 최악의 결과가 "위컴 알림 1건 중복"이다.
 */
const DUPLICATE_WINDOW_MS = 60_000
const recentBookings = new Map<string, { bookingId: string; at: number }>()

/** 방문 목적 — 화면 체크박스와 같은 값이어야 집계가 갈라지지 않는다. */
export const SHOWROOM_INTERESTS = [
  "전자칠판 직접 써보기",
  "수업 녹화·복습 흐름",
  "EDB 교안·수업 도구",
  "LMS·학생 관리",
  "설치·교실 구성",
  "견적·도입 범위",
] as const

export type ShowroomInterest = (typeof SHOWROOM_INTERESTS)[number]

export interface NormalizedShowroomBooking {
  visitDate: string
  visitTime: ShowroomSlotTime
  org: string
  name: string
  phone: string
  email: string | null
  role: string | null
  visitorCount: number
  academySize: string | null
  interests: string[]
  memo: string | null
  sourcePage: string | null
}

export type ShowroomBookingValidation =
  | { ok: true; value: NormalizedShowroomBooking }
  | { ok: false; field?: string }

export type ShowroomBookingResult =
  | { status: 200; body: { ok: true; bookingId: string } }
  | { status: 400; body: { ok: false; error: "validation"; field?: string } }
  | { status: 409; body: { ok: false; error: "slot_unavailable" } }
  | { status: 500; body: { ok: false } }

export interface ShowroomBookingContext {
  deferTask?: (task: () => Promise<void>) => void
}

/* ─── 정규화 · 검증 (순수) ─── */

/**
 * 공개 요청 본문을 검증·정규화한다. 순수 함수다.
 *
 * 슬롯이 실제로 비어 있는지는 **여기서 보지 않는다** — 공휴일·기존 일정 조회가 필요해
 * I/O 가 섞이기 때문이다. 그 판정은 `submitShowroomBooking` 이 주입받은
 * `isSlotOpen` 으로 한다.
 */
export function normalizeShowroomBooking(raw: unknown): ShowroomBookingValidation {
  const body = asRecord(raw)
  if (!body) return { ok: false }

  if (body.consent !== true) return { ok: false, field: "consent" }

  const visitDate = typeof body.visitDate === "string" ? body.visitDate.trim() : ""
  if (!DATE_REGEX.test(visitDate) || !isRealCalendarDate(visitDate) || !isValidIsoDate(visitDate)) {
    return { ok: false, field: "visitDate" }
  }

  const visitTime = typeof body.visitTime === "string" ? body.visitTime.trim() : ""
  if (!isShowroomSlotTime(visitTime)) return { ok: false, field: "visitTime" }

  const org = normalizeText(body.org, MAX_ORG_LENGTH)
  if (!org) return { ok: false, field: "org" }

  const name = normalizeText(body.name, MAX_NAME_LENGTH)
  if (!name) return { ok: false, field: "name" }

  const phone = normalizeText(body.phone, MAX_PHONE_LENGTH)
  if (!phone || !isPlausibleKoreanPhone(phone)) return { ok: false, field: "phone" }

  // 이메일은 선택 — 값이 있을 때만 형식을 본다.
  let email: string | null = null
  if (body.email !== undefined && body.email !== null && body.email !== "") {
    const candidate = normalizeText(body.email, MAX_EMAIL_LENGTH)?.toLowerCase() ?? null
    if (!candidate || !EMAIL_REGEX.test(candidate)) return { ok: false, field: "email" }
    email = candidate
  }

  const visitorCount = normalizeVisitorCount(body.visitorCount)
  if (visitorCount === null) return { ok: false, field: "visitorCount" }

  return {
    ok: true,
    value: {
      visitDate,
      visitTime,
      org,
      name,
      phone,
      email,
      role: normalizeText(body.role, MAX_ROLE_LENGTH),
      visitorCount,
      academySize: normalizeText(body.academySize, MAX_ACADEMY_SIZE_LENGTH),
      interests: normalizeInterests(body.interests),
      memo: normalizeMultilineText(body.memo, MAX_MEMO_LENGTH),
      sourcePage: normalizeText(body.sourcePage, MAX_SOURCE_PAGE_LENGTH),
    },
  }
}

/** 미지정이면 1명. 정수 1~20 밖은 거부한다(오타를 조용히 삼키지 않는다). */
function normalizeVisitorCount(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 1

  const parsed = typeof value === "number" ? value : Number(String(value).trim())
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null
  if (parsed < 1 || parsed > MAX_VISITOR_COUNT) return null
  return parsed
}

/** 등록된 목적만 남긴다. 중복을 제거하고 화면 순서를 유지한다. */
function normalizeInterests(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const selected = new Set(
    value.filter((item): item is string => typeof item === "string").map((item) => item.trim())
  )

  return SHOWROOM_INTERESTS.filter((interest) => selected.has(interest)).slice(0, MAX_INTERESTS)
}

/* ─── 표기 ─── */

export function formatShowroomVisitLabel(booking: NormalizedShowroomBooking) {
  const [, month, day] = booking.visitDate.split("-")
  return `${Number(month)}월 ${Number(day)}일 ${booking.visitTime}`
}

export function buildShowroomBookingLeadMessage(
  booking: NormalizedShowroomBooking,
  bookingId: string
) {
  return [
    "문의 유형: 목동 쇼룸 방문 예약",
    `희망 일시: ${booking.visitDate} ${booking.visitTime} (${SHOWROOM_SLOT_DURATION_MINUTES}분)`,
    `방문 인원: ${booking.visitorCount}명`,
    booking.role ? `직책: ${booking.role}` : undefined,
    booking.academySize ? `학원 규모: ${booking.academySize}` : undefined,
    booking.interests.length ? `보고 싶은 것: ${booking.interests.join(", ")}` : undefined,
    booking.memo ? `메모: ${booking.memo}` : undefined,
    `접수번호: ${bookingId}`,
  ]
    .filter(Boolean)
    .join("\n")
}

export function buildShowroomBookingNotification({
  booking,
  bookingId,
  leadId,
}: {
  booking: NormalizedShowroomBooking
  bookingId: string
  leadId: string | null
}) {
  return {
    eventType: "showroom.booking_requested" as const,
    notificationType: "action_required" as const,
    categoryTag: "lead" as const,
    severity: "info" as const,
    scopeTag: "org_admin" as const,
    title: `쇼룸 방문 예약: ${booking.org}`,
    message: [booking.name, booking.phone, formatShowroomVisitLabel(booking)].join(" / "),
    // 리드가 만들어졌으면 그 리드로 바로 열고, 아니면 미확인 큐로 보낸다.
    routeUrl: leadId
      ? `/admin/crm/customers/leads?lead=${leadId}`
      : "/admin/crm/customers/leads?filter=unconfirmed",
    source: "showroom_booking",
    sourceId: bookingId,
    // WeCom 문구(lib/notifications/emit-event.ts)가 이 payload 를 펼쳐 쓴다.
    payload: {
      bookingId,
      leadId,
      visitDate: booking.visitDate,
      visitTime: booking.visitTime,
      visitLabel: formatShowroomVisitLabel(booking),
      org: booking.org,
      name: booking.name,
      role: booking.role,
      phone: booking.phone,
      email: booking.email,
      visitorCount: booking.visitorCount,
      academySize: booking.academySize,
      interests: booking.interests.join(", "),
      memo: booking.memo,
      sourcePage: booking.sourcePage,
    },
    channels: NOTIFICATION_CHANNELS,
  }
}

/* ─── 저장 · 후속 ─── */

function getDedupeKey(booking: NormalizedShowroomBooking) {
  return [booking.visitDate, booking.visitTime, booking.phone.replace(/\D/g, "")].join(":")
}

function getRecentBookingId(key: string): string | null {
  const hit = recentBookings.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > DUPLICATE_WINDOW_MS) {
    recentBookings.delete(key)
    return null
  }
  return hit.bookingId
}

function rememberBooking(key: string, bookingId: string) {
  recentBookings.set(key, { bookingId, at: Date.now() })
  // 창이 지난 항목을 함께 정리한다 — 인스턴스가 오래 살아도 Map 이 무한정 자라지 않는다.
  const cutoff = Date.now() - DUPLICATE_WINDOW_MS
  for (const [candidate, entry] of recentBookings) {
    if (entry.at < cutoff) recentBookings.delete(candidate)
  }
}

async function insertShowroomBooking(booking: NormalizedShowroomBooking): Promise<string> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("showroom_bookings")
    .insert({
      visit_date: booking.visitDate,
      visit_time: booking.visitTime,
      duration_minutes: SHOWROOM_SLOT_DURATION_MINUTES,
      org: booking.org,
      name: booking.name,
      phone: booking.phone,
      email: booking.email,
      role: booking.role,
      visitor_count: booking.visitorCount,
      academy_size: booking.academySize,
      interests: booking.interests,
      memo: booking.memo,
      source_page: booking.sourcePage,
      status: "requested",
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)
  if (!data?.id) throw new Error("showroom_bookings insert returned no id")
  return data.id as string
}

async function linkLeadId(bookingId: string, leadId: string) {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from("showroom_bookings")
    .update({ lead_id: leadId })
    .eq("id", bookingId)

  if (error) throw new Error(error.message)
}

/**
 * 어드민 리드 큐 미러링. lead-capture 를 재사용해 구글시트·채널톡·CRM 타임라인·
 * 서버 전환까지 기존 리드와 동일하게 흐르게 하고, lead.created 알림만 끈다
 * (알림은 showroom.booking_requested 1건으로 통일 — 불변식 ②).
 */
async function mirrorToLeadQueue(
  booking: NormalizedShowroomBooking,
  bookingId: string
): Promise<string | null> {
  const { body } = await submitLeadCapture(
    {
      source: "contact_page",
      org: booking.org,
      name: booking.name,
      phone: booking.phone,
      email: booking.email ?? undefined,
      role: booking.role ?? undefined,
      size: booking.academySize ?? undefined,
      message: buildShowroomBookingLeadMessage(booking, bookingId),
      // 방문 예약 동의는 연락 목적 — 마케팅 수신 동의로 승격하지 않는다.
      marketingConsent: false,
      sourceDetail: "showroom_booking",
      currentPage: booking.sourcePage ?? undefined,
    },
    { suppressLeadCreatedNotification: true }
  )

  return body.ok ? body.leadId ?? null : null
}

async function runSafely<T>(label: string, task: () => Promise<T>): Promise<T | null> {
  try {
    return await task()
  } catch (error) {
    // 후속 처리 실패는 로그만 — 예약 저장은 이미 성공했다(불변식 ④).
    console.error(`[showroom-booking] ${label} failed:`, error)
    return null
  }
}

export interface SubmitShowroomBookingOptions extends ShowroomBookingContext {
  /**
   * 슬롯이 실제로 열려 있는지 확인한다. 공휴일·기존 일정 조회가 I/O 라 주입받는다.
   * 라우트가 가용성 소스와 함께 넘긴다.
   */
  isSlotOpen?: (date: string, time: string) => Promise<boolean>
}

export async function submitShowroomBooking(
  raw: unknown,
  options: SubmitShowroomBookingOptions = {}
): Promise<ShowroomBookingResult> {
  const validation = normalizeShowroomBooking(raw)
  if (!validation.ok) {
    return {
      status: 400,
      body: {
        ok: false,
        error: "validation",
        ...(validation.field ? { field: validation.field } : {}),
      },
    }
  }

  const booking = validation.value
  const dedupeKey = getDedupeKey(booking)

  // 더블 클릭/재시도는 같은 bookingId 를 그대로 돌려준다 — 행도 알림도 늘지 않는다.
  const duplicated = getRecentBookingId(dedupeKey)
  if (duplicated) {
    return { status: 200, body: { ok: true, bookingId: duplicated } }
  }

  if (options.isSlotOpen) {
    // 화면이 캐시된 가용성을 들고 있었을 수 있다 — 저장 직전에 다시 본다.
    const open = await options.isSlotOpen(booking.visitDate, booking.visitTime)
    if (!open) {
      return { status: 409, body: { ok: false, error: "slot_unavailable" } }
    }
  }

  let bookingId: string
  try {
    bookingId = await insertShowroomBooking(booking)
  } catch (error) {
    console.error("[showroom-booking] insert failed:", error)
    return { status: 500, body: { ok: false } }
  }

  rememberBooking(dedupeKey, bookingId)

  const followUp = async () => {
    const leadId = await runSafely("lead mirror", () => mirrorToLeadQueue(booking, bookingId))

    if (leadId) {
      await runSafely("lead link", () => linkLeadId(bookingId, leadId))
    }

    // 접수당 정확히 1건 — 리드 미러가 실패해도(leadId null) 알림은 그대로 나간다.
    await runSafely("ops notification", () =>
      emitNotificationEvent(buildShowroomBookingNotification({ booking, bookingId, leadId }))
    )
  }

  if (options.deferTask) {
    options.deferTask(followUp)
  } else {
    void followUp()
  }

  return { status: 200, body: { ok: true, bookingId } }
}
