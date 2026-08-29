"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AlertCircle, CalendarCheck, Check, Loader2 } from "lucide-react"

import { DesiredDateCalendar } from "@/components/checkout/DesiredDateCalendar"
import { formatDesiredDateLabel } from "@/components/checkout/request-date"
import { SlotPicker } from "@/components/showroom/SlotPicker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { trackEvent } from "@/lib/analytics"
import {
  toDisabledIsoDates,
  type ShowroomDayAvailability,
  type ShowroomDayBlockedReason,
} from "@/lib/showroom/slots"

interface Props {
  /**
   * 방문 목적 선택지. 서버 계약(`SHOWROOM_INTERESTS`)을 페이지(서버 컴포넌트)가 읽어
   * 내려준다 — 그 모듈은 `server-only` 라 클라이언트에서 직접 import 할 수 없고,
   * 값을 여기 다시 적으면 화면과 집계가 갈라진다.
   */
  interests: readonly string[]
}

/**
 * 학원 규모 선택지. `app/resources/[slug]/ResourceDownloadForm.tsx` 의 size select 와
 * **같은 문자열**이어야 한다 — 리드 미러링이 두 경로의 값을 같은 `size` 필드에 쌓기
 * 때문에, 문구가 갈라지면 규모별 집계가 둘로 쪼개진다.
 */
const ACADEMY_SIZE_OPTIONS = ["100명 이하", "100~300명", "300~500명", "500명 이상"] as const

/* ── 가용성 ───────────────────────────────────────────────────────────────── */

interface Availability {
  todayIso: string
  minIso: string
  maxIso: string
  days: ShowroomDayAvailability[]
  slotDurationMinutes: number
}

const EMPTY_DAYS: ShowroomDayAvailability[] = []

/** 가용성 1회 조회. 상태를 건드리지 않아 최초 로드와 409 재조회가 같은 함수를 쓴다. */
async function fetchAvailability(signal?: AbortSignal): Promise<Availability | null> {
  try {
    const response = await fetch("/api/showroom/availability", {
      signal,
      headers: { Accept: "application/json" },
    })
    const payload = (await response.json().catch(() => null)) as
      | (Partial<Availability> & { ok?: boolean })
      | null

    if (!response.ok || !payload?.ok || !Array.isArray(payload.days)) return null

    return {
      todayIso: payload.todayIso ?? "",
      minIso: payload.minIso ?? "",
      maxIso: payload.maxIso ?? "",
      days: payload.days,
      slotDurationMinutes: payload.slotDurationMinutes ?? 60,
    }
  } catch {
    // abort 는 호출자가 signal 로 판단한다 — 여기서는 "못 읽었다"로만 돌려준다.
    return null
  }
}

/** 날짜가 예약을 못 받는 이유 → 화면 문구. 서버 판정과 1:1 로 맞춘다. */
const BLOCKED_REASON_MESSAGES: Record<ShowroomDayBlockedReason, string> = {
  weekend: "주말은 쇼룸을 운영하지 않습니다. 평일 날짜로 골라주세요.",
  holiday: "공휴일은 쇼룸을 운영하지 않습니다. 평일 날짜로 골라주세요.",
  too_soon: "담당자 배정과 자료 준비가 필요해 최소 2영업일 전까지 예약을 받습니다.",
  too_far: "예약 가능한 기간을 넘어선 날짜입니다. 더 가까운 날짜로 골라주세요.",
  full: "이 날짜는 모든 시간이 마감됐습니다. 다른 날짜를 골라주세요.",
}

/* ── 연락처(app/contact/page.tsx 와 동일 규칙) ─────────────────────────────── */

const PHONE_REQUIRED_MESSAGE = "연락처를 입력해주세요."

function getPhoneDigits(value: string) {
  return value.replace(/\D/g, "")
}

function formatPhoneNumber(value: string) {
  const digits = getPhoneDigits(value).slice(0, 11)
  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits
    if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`
    return `${digits.slice(0, 2)}-${digits.slice(2, -4)}-${digits.slice(-4)}`
  }

  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, -4)}-${digits.slice(-4)}`
}

function getPhoneValidationMessage(value: string) {
  const digits = getPhoneDigits(value)
  if (!digits) return PHONE_REQUIRED_MESSAGE
  if (digits.startsWith("02")) {
    return digits.length === 9 || digits.length === 10
      ? ""
      : "전화번호는 02-000-0000 또는 02-0000-0000 형식으로 입력해주세요."
  }

  return /^0\d{9,10}$/.test(digits)
    ? ""
    : "연락처는 0으로 시작하는 10~11자리 숫자로 입력해주세요."
}

/* ── 폼 ───────────────────────────────────────────────────────────────────── */

type FieldKey =
  | "visitDate"
  | "visitTime"
  | "org"
  | "name"
  | "phone"
  | "email"
  | "role"
  | "visitorCount"
  | "academySize"
  | "consent"

interface FormState {
  visitDate: string
  visitTime: string
  org: string
  name: string
  phone: string
  email: string
  role: string
  visitorCount: string
  academySize: string
  interests: string[]
  memo: string
  consent: boolean
  /** honeypot — 사람은 볼 수 없는 필드다. */
  website: string
}

const EMPTY_FORM: FormState = {
  visitDate: "",
  visitTime: "",
  org: "",
  name: "",
  phone: "",
  email: "",
  role: "",
  visitorCount: "1",
  academySize: "",
  interests: [],
  memo: "",
  consent: false,
  website: "",
}

const RETRY_MESSAGE = "지금은 예약을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요."
const SLOT_TAKEN_MESSAGE =
  "방금 다른 분이 같은 시간을 예약했습니다. 남은 시간을 다시 불러왔으니 다른 시간으로 골라주세요."

const CONTRACT_FIELDS = new Set<FieldKey>([
  "visitDate",
  "visitTime",
  "org",
  "name",
  "phone",
  "email",
  "role",
  "visitorCount",
  "academySize",
  "consent",
])

function isFieldKey(value: unknown): value is FieldKey {
  return typeof value === "string" && CONTRACT_FIELDS.has(value as FieldKey)
}

function validate(form: FormState, selectedDay: ShowroomDayAvailability | null) {
  const errors: Partial<Record<FieldKey, string>> = {}

  if (!form.visitDate) errors.visitDate = "방문 날짜를 선택해 주세요."
  else if (!selectedDay || !selectedDay.bookable)
    errors.visitDate = "선택할 수 없는 날짜입니다. 다른 날짜를 골라주세요."

  if (!form.visitTime) errors.visitTime = "방문 시간을 선택해 주세요."
  else if (
    selectedDay &&
    !selectedDay.slots.some((slot) => slot.time === form.visitTime && slot.state === "open")
  ) {
    errors.visitTime = "이미 마감된 시간입니다. 다른 시간을 골라주세요."
  }

  if (!form.org.trim()) errors.org = "기관명을 입력해 주세요."
  if (!form.name.trim()) errors.name = "담당자 성함을 입력해 주세요."

  const phoneMessage = getPhoneValidationMessage(form.phone)
  if (phoneMessage) errors.phone = phoneMessage

  const email = form.email.trim()
  // 서버(lib/server/contact-field-validation.ts EMAIL_REGEX)와 같은 기준.
  if (email && !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email))
    errors.email = "이메일 형식을 확인해 주세요."

  const visitorCount = Number(form.visitorCount.trim())
  if (
    !form.visitorCount.trim() ||
    !Number.isInteger(visitorCount) ||
    visitorCount < 1 ||
    visitorCount > 20
  ) {
    errors.visitorCount = "방문 인원은 1~20명 사이로 입력해 주세요."
  }

  if (!form.consent) errors.consent = "개인정보 수집·이용에 동의해 주세요."

  return errors
}

const selectClassName =
  "h-11 w-full rounded-[6px] border border-[#E5E5E0] bg-white px-4 text-[14px] text-[#111110] transition-colors hover:border-[#D8D8D2] focus-visible:outline-none focus-visible:border-[#084734] focus-visible:ring-2 focus-visible:ring-[#084734]"

/**
 * 목동 쇼룸 방문 예약 폼.
 *
 * 계약: GET /api/showroom/availability 로 날짜·슬롯 상태를 받고
 *       POST /api/showroom/bookings 로 접수한다.
 *
 * 1차는 **요청형**이다 — 저장 시점에 슬롯을 잠그지 않으므로 성공 화면에서
 * "확정"이라고 읽히면 안 된다. 같은 이유로 409(먼저 접수된 요청)는 오류가 아니라
 * 정상 경로다: 가용성을 다시 읽어 남은 시간을 그 자리에서 보여준다.
 */
export function ShowroomBookingForm({ interests }: Props) {
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [availabilityStatus, setAvailabilityStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  )
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [formNotice, setFormNotice] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  /** 성공 화면. bookingId 가 null 이면 honeypot 이 걸린 제출(서버로 보내지 않았다). */
  const [submitted, setSubmitted] = useState<{ bookingId: string | null } | null>(null)
  // 더블 클릭·엔터 연타가 두 건으로 나가지 않게 상태 갱신 전에 잠근다.
  const submitLock = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      const next = await fetchAvailability(controller.signal)
      if (controller.signal.aborted) return
      if (!next) {
        setAvailabilityStatus("error")
        return
      }
      setAvailability(next)
      setAvailabilityStatus("ready")
    })()

    return () => controller.abort()
  }, [])

  // 언마운트 중 진행 중인 제출을 끊는다 — 늦게 온 응답이 사라진 폼을 갱신하지 않게.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  const days = availability?.days ?? EMPTY_DAYS
  // 렌더마다 새 Set 을 만들면 캘린더의 range 메모가 매번 깨진다 — days 가 바뀔 때만 만든다.
  const disabledIsoDates = useMemo(() => toDisabledIsoDates(days), [days])
  const dayByDate = useMemo(
    () => new Map(days.map((day) => [day.date, day] as const)),
    [days]
  )

  const selectedDay = form.visitDate ? dayByDate.get(form.visitDate) ?? null : null
  // 캘린더 범위는 "실제로 받아온 날짜"로 좁힌다. 응답 상한(62일)에 잘려 days 에 없는
  // 날짜까지 열어두면 상태를 모르는 날을 고를 수 있게 된다.
  const calendarMinIso = days[0]?.date ?? ""
  const calendarMaxIso = days[days.length - 1]?.date ?? ""
  const slotDurationMinutes = availability?.slotDurationMinutes ?? 60

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    if (key in errors) {
      setErrors((current) => {
        const next = { ...current }
        delete next[key as FieldKey]
        return next
      })
    }
  }

  function toggleInterest(interest: string) {
    setForm((current) => ({
      ...current,
      interests: current.interests.includes(interest)
        ? current.interests.filter((item) => item !== interest)
        : [...current.interests, interest],
    }))
  }

  function selectDate(iso: string) {
    // 날짜가 바뀌면 이전 날짜의 시각은 의미가 없다 — 함께 비운다.
    setForm((current) => ({ ...current, visitDate: iso, visitTime: "" }))
    setErrors((current) => {
      const next = { ...current }
      delete next.visitDate
      delete next.visitTime
      return next
    })
    setFormNotice(null)
  }

  /** 409 처리 — 먼저 접수된 요청이 있다. 가용성을 다시 읽고 시각만 비운다. */
  async function handleSlotTaken() {
    setForm((current) => ({ ...current, visitTime: "" }))
    setFormError(null)
    setFormNotice(SLOT_TAKEN_MESSAGE)

    const next = await fetchAvailability()
    if (next) {
      setAvailability(next)
      setAvailabilityStatus("ready")
    }
  }

  async function handleSubmit() {
    if (submitLock.current) return

    // honeypot — 서버가 보지 않는 필드라 여기서 끊는다. 봇에게는 성공처럼 보여
    // 재시도를 유도하지 않는다.
    if (form.website.trim()) {
      setSubmitted({ bookingId: null })
      return
    }

    const nextErrors = validate(form, selectedDay)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setFormError("입력값을 확인한 뒤 다시 시도해 주세요.")
      return
    }

    submitLock.current = true
    setIsSubmitting(true)
    setErrors({})
    setFormError(null)
    setFormNotice(null)

    const email = form.email.trim()
    const role = form.role.trim()
    const memo = form.memo.trim()
    const visitorCount = Number(form.visitorCount.trim())

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller

    try {
      const response = await fetch("/api/showroom/bookings", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitDate: form.visitDate,
          visitTime: form.visitTime,
          org: form.org.trim(),
          name: form.name.trim(),
          phone: form.phone.trim(),
          ...(email ? { email } : {}),
          ...(role ? { role } : {}),
          visitorCount,
          ...(form.academySize ? { academySize: form.academySize } : {}),
          interests: form.interests,
          ...(memo ? { memo } : {}),
          sourcePage: "/showroom",
          consent: true,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | { ok: true; bookingId: string }
        | { ok: false; error?: string; field?: string }
        | null

      if (controller.signal.aborted) return

      if (response.ok && payload && payload.ok) {
        setSubmitted({ bookingId: payload.bookingId })
        trackEvent("submit_demo_request", {
          source: "showroom_booking",
          page: "/showroom",
          visit_date: form.visitDate,
          visit_time: form.visitTime,
          visitor_count: visitorCount,
          interest_count: form.interests.length,
          academy_size: form.academySize || undefined,
        })
        return
      }

      // 409 — 요청형 예약의 정상 경로. 마지막에 본 가용성이 이미 낡았다는 뜻이다.
      if (response.status === 409) {
        await handleSlotTaken()
        return
      }

      if (response.status === 400 && payload && !payload.ok) {
        if (isFieldKey(payload.field)) {
          setErrors({ [payload.field]: "입력값을 다시 확인해 주세요." })
        }
        setFormError("입력값을 확인한 뒤 다시 시도해 주세요.")
        return
      }

      if (response.status === 429) {
        setFormError("요청이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.")
        return
      }

      setFormError(RETRY_MESSAGE)
    } catch {
      if (controller.signal.aborted) return
      setFormError(RETRY_MESSAGE)
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        submitLock.current = false
        setIsSubmitting(false)
      }
    }
  }

  const dateLabel = form.visitDate ? formatDesiredDateLabel(form.visitDate) : "미선택"

  /* ── 성공 화면 ── */
  if (submitted) {
    return (
      <div className="rounded-xl border border-black/[0.08] bg-white p-6 shadow-[rgba(0,0,0,0.04)_0px_4px_18px,rgba(0,0,0,0.027)_0px_2px_7.8px,rgba(0,0,0,0.02)_0px_0.8px_2.9px,rgba(0,0,0,0.01)_0px_0.175px_1px] sm:p-8">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ECFDF5]">
          <Check className="h-5 w-5 text-[#084734]" strokeWidth={2.4} />
        </div>

        <h3 className="mt-4 text-[22px] font-bold leading-snug tracking-[-0.25px] text-[#111110]">
          방문 요청이 접수되었습니다
        </h3>
        <p className="mt-2 text-[14px] leading-relaxed text-[#615D59]">
          요청이 접수되었고 담당자가 확인 후 확정 연락을 드립니다. 아직 방문이 확정된 것은
          아니며, 남겨주신 연락처로 일정을 확인한 뒤 확정해 드립니다.
        </p>

        <dl className="mt-5 space-y-2 rounded-xl border border-black/[0.08] bg-[#F6F5F4] px-4 py-3 text-[13px]">
          {submitted.bookingId ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[#615D59]">접수번호</dt>
              <dd className="font-semibold tabular-nums text-[#111110]">{submitted.bookingId}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[#615D59]">희망 일시</dt>
            <dd className="font-medium text-[#111110]">
              {dateLabel} {form.visitTime}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[#615D59]">방문 인원</dt>
            <dd className="font-medium text-[#111110]">{form.visitorCount}명</dd>
          </div>
        </dl>

        <p className="mt-5 text-[13px] leading-relaxed text-[#615D59]">
          방문 전에 우리 학원 대표 수업 자료 한 개를 준비해 두시면, 그 자료로 EDB·판서·녹화
          흐름을 그대로 시연해 드립니다.
        </p>

        <Link
          href="/resources/showroom-demo-readiness-kit"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-[6px] border border-black/[0.08] bg-white px-5 text-[14px] font-semibold text-[#084734] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
        >
          데모 준비 킷 먼저 보기
        </Link>
      </div>
    )
  }

  /* ── 예약 폼 ── */
  return (
    <div className="rounded-xl border border-black/[0.08] bg-white p-6 shadow-[rgba(0,0,0,0.04)_0px_4px_18px,rgba(0,0,0,0.027)_0px_2px_7.8px,rgba(0,0,0,0.02)_0px_0.8px_2.9px,rgba(0,0,0,0.01)_0px_0.175px_1px] sm:p-8">
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSubmit()
        }}
      >
        {/* honeypot — 사람에게는 보이지 않는다. */}
        <div
          aria-hidden="true"
          className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden"
        >
          <label htmlFor="showroom-website">웹사이트</label>
          <input
            id="showroom-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(event) => update("website", event.target.value)}
          />
        </div>

        {/* 1. 날짜 */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span id="showroom-date-label" className="text-[12px] font-medium text-[#44514A]">
              방문 날짜
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#084734]">
              <CalendarCheck className="h-3.5 w-3.5" />
              {dateLabel}
            </span>
          </div>

          {availabilityStatus === "loading" ? (
            <div className="flex h-[292px] items-center justify-center rounded-xl border border-black/[0.08] bg-[#F6F5F4]">
              <span className="inline-flex items-center gap-2 text-[13px] text-[#615D59]">
                <Loader2 className="h-4 w-4 animate-spin" />
                예약 가능한 날짜를 불러오는 중입니다
              </span>
            </div>
          ) : availabilityStatus === "error" || !calendarMinIso || !calendarMaxIso ? (
            <div className="rounded-xl border border-black/[0.08] bg-[#F6F5F4] px-4 py-6 text-center">
              <p className="text-[13px] leading-relaxed text-[#615D59]">
                예약 가능한 날짜를 불러오지 못했습니다. 잠시 후 새로고침하거나{" "}
                <Link
                  href="/contact"
                  className="font-medium text-[#084734] underline underline-offset-2"
                >
                  문의하기
                </Link>
                로 남겨주시면 담당자가 일정을 잡아드립니다.
              </p>
            </div>
          ) : (
            <>
              <DesiredDateCalendar
                value={form.visitDate}
                onChange={selectDate}
                todayIso={availability?.todayIso ?? ""}
                minIso={calendarMinIso}
                maxIso={calendarMaxIso}
                disabledIsoDates={disabledIsoDates}
                invalid={Boolean(errors.visitDate)}
                labelledById="showroom-date-label"
                describedById="showroom-date-hint"
              />
              <p id="showroom-date-hint" className="text-[11px] text-[#A39E98]">
                평일만 운영하며, 담당자 배정과 자료 준비를 위해 최소 2영업일 전부터 예약을
                받습니다. 회색 날짜는 휴무이거나 이미 마감된 날입니다.
              </p>
            </>
          )}

          {errors.visitDate ? (
            <p className="text-[11px] text-[#B43E3E]">{errors.visitDate}</p>
          ) : null}
        </div>

        {/* 2. 시간 */}
        {availabilityStatus === "ready" && form.visitDate ? (
          <div className="space-y-2">
            <span id="showroom-time-label" className="block text-[12px] font-medium text-[#44514A]">
              방문 시간
            </span>

            {selectedDay && selectedDay.bookable ? (
              <>
                <SlotPicker
                  slots={selectedDay.slots}
                  value={form.visitTime}
                  onChange={(time) => update("visitTime", time)}
                  durationMinutes={slotDurationMinutes}
                  invalid={Boolean(errors.visitTime)}
                  labelledById="showroom-time-label"
                  describedById="showroom-time-hint"
                />
                <p id="showroom-time-hint" className="text-[11px] text-[#A39E98]">
                  상담 1회는 {slotDurationMinutes}분입니다. 대표 수업 한 편을 처음부터 끝까지
                  돌려보는 데 필요한 시간입니다.
                </p>
              </>
            ) : (
              <div className="rounded-xl border border-black/[0.08] bg-[#F6F5F4] px-4 py-4">
                <p className="text-[13px] leading-relaxed text-[#615D59]">
                  {selectedDay?.blockedReason
                    ? BLOCKED_REASON_MESSAGES[selectedDay.blockedReason]
                    : BLOCKED_REASON_MESSAGES.full}
                </p>
              </div>
            )}

            {errors.visitTime ? (
              <p className="text-[11px] text-[#B43E3E]">{errors.visitTime}</p>
            ) : null}
          </div>
        ) : null}

        <div className="h-px bg-black/[0.08]" />

        {/* 3. 방문자 정보 */}
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="showroom-org" className="text-[12px] text-[#44514A]">
                기관명 / 학원명
              </Label>
              <Input
                id="showroom-org"
                value={form.org}
                onChange={(event) => update("org", event.target.value)}
                placeholder="예: 무궁화학원"
                autoComplete="organization"
                aria-invalid={Boolean(errors.org)}
                aria-describedby={errors.org ? "showroom-org-error" : undefined}
                className={errors.org ? "border-[#B43E3E]" : ""}
              />
              {errors.org ? (
                <p id="showroom-org-error" className="text-[11px] text-[#B43E3E]">
                  {errors.org}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="showroom-name" className="text-[12px] text-[#44514A]">
                담당자 성함
              </Label>
              <Input
                id="showroom-name"
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="홍길동"
                autoComplete="name"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "showroom-name-error" : undefined}
                className={errors.name ? "border-[#B43E3E]" : ""}
              />
              {errors.name ? (
                <p id="showroom-name-error" className="text-[11px] text-[#B43E3E]">
                  {errors.name}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="showroom-phone" className="text-[12px] text-[#44514A]">
                연락처
              </Label>
              <Input
                id="showroom-phone"
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(event) => update("phone", formatPhoneNumber(event.target.value))}
                placeholder="010-0000-0000"
                autoComplete="tel"
                maxLength={13}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? "showroom-phone-error" : undefined}
                className={errors.phone ? "border-[#B43E3E]" : ""}
              />
              {errors.phone ? (
                <p id="showroom-phone-error" className="text-[11px] text-[#B43E3E]">
                  {errors.phone}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="showroom-email" className="text-[12px] text-[#44514A]">
                이메일 <span className="text-[#A39E98]">(선택)</span>
              </Label>
              <Input
                id="showroom-email"
                type="email"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                placeholder="ops@classin.co.kr"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "showroom-email-error" : undefined}
                className={errors.email ? "border-[#B43E3E]" : ""}
              />
              {errors.email ? (
                <p id="showroom-email-error" className="text-[11px] text-[#B43E3E]">
                  {errors.email}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="showroom-role" className="text-[12px] text-[#44514A]">
                직책 <span className="text-[#A39E98]">(선택)</span>
              </Label>
              <Input
                id="showroom-role"
                value={form.role}
                onChange={(event) => update("role", event.target.value)}
                placeholder="원장 / 실장 / 강사"
                className={errors.role ? "border-[#B43E3E]" : ""}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="showroom-visitor-count" className="text-[12px] text-[#44514A]">
                방문 인원
              </Label>
              <Input
                id="showroom-visitor-count"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                value={form.visitorCount}
                onChange={(event) => update("visitorCount", event.target.value)}
                aria-invalid={Boolean(errors.visitorCount)}
                aria-describedby={errors.visitorCount ? "showroom-visitor-count-error" : undefined}
                className={errors.visitorCount ? "border-[#B43E3E]" : ""}
              />
              {errors.visitorCount ? (
                <p id="showroom-visitor-count-error" className="text-[11px] text-[#B43E3E]">
                  {errors.visitorCount}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="showroom-academy-size" className="text-[12px] text-[#44514A]">
                학원 규모 <span className="text-[#A39E98]">(선택)</span>
              </Label>
              <select
                id="showroom-academy-size"
                value={form.academySize}
                onChange={(event) => update("academySize", event.target.value)}
                className={`${selectClassName} ${errors.academySize ? "border-[#B43E3E]" : ""}`}
              >
                <option value="">선택</option>
                {ACADEMY_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-[12px] font-medium text-[#44514A]">
              방문 목적 <span className="text-[#A39E98]">(선택 · 복수 선택 가능)</span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {interests.map((interest) => {
                const checked = form.interests.includes(interest)
                return (
                  <label
                    key={interest}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                      checked
                        ? "border-[#084734]/60 bg-[#ECFDF5]/60"
                        : "border-black/[0.08] bg-white hover:bg-[#F6F5F4]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="interests"
                      value={interest}
                      checked={checked}
                      onChange={() => toggleInterest(interest)}
                      className="h-4 w-4 shrink-0 accent-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                    />
                    <span
                      className={`text-[13px] ${checked ? "font-medium text-[#084734]" : "text-[#111110]"}`}
                    >
                      {interest}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="showroom-memo" className="text-[12px] text-[#44514A]">
              메모 <span className="text-[#A39E98]">(선택)</span>
            </Label>
            <Textarea
              id="showroom-memo"
              value={form.memo}
              onChange={(event) => update("memo", event.target.value)}
              placeholder="가져오실 수업 자료 형식, 지금 쓰는 장비, 특히 확인하고 싶은 장면을 적어주시면 그 흐름 위주로 준비합니다."
              maxLength={2000}
              className="min-h-[88px] rounded-lg border-[#E5E5E0] px-3 py-2.5 text-[14px]"
            />
          </div>
        </div>

        {/* 4. 동의 */}
        <div className="space-y-1.5">
          <label
            htmlFor="showroom-consent"
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-3 transition-colors ${
              errors.consent ? "border-[#B43E3E]" : "border-black/[0.08] hover:bg-[#F6F5F4]"
            }`}
          >
            <input
              id="showroom-consent"
              type="checkbox"
              checked={form.consent}
              onChange={(event) => update("consent", event.target.checked)}
              aria-invalid={Boolean(errors.consent)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            />
            <span className="text-[12px] leading-relaxed text-[#44514A]">
              방문 일정 확인 연락을 위한 개인정보(기관명 · 성함 · 연락처 · 이메일)
              수집·이용에 동의합니다.{" "}
              <Link
                href="/privacy"
                target="_blank"
                className="font-medium text-[#084734] underline underline-offset-2"
              >
                개인정보처리방침
              </Link>
            </span>
          </label>
          {errors.consent ? (
            <p className="text-[11px] text-[#B43E3E]">{errors.consent}</p>
          ) : null}
        </div>

        {formNotice ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-[#BDEFD8] bg-[#ECFDF5] px-3.5 py-3 text-[12px] leading-relaxed text-[#084734]"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formNotice}</span>
          </div>
        ) : null}

        {formError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-[#EAD7B2] bg-[#FFF9EB] px-3.5 py-3 text-[12px] leading-relaxed text-[#8D6C1F]"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        ) : null}

        <div className="space-y-2">
          <Button
            type="submit"
            className="h-12 w-full rounded-lg bg-[#084734] text-[14px] font-semibold text-white hover:bg-[#065c41]"
            disabled={isSubmitting || availabilityStatus !== "ready"}
          >
            {isSubmitting ? "접수 중..." : "방문 예약 요청하기"}
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-[#615D59]">
            보내신 요청은 담당자 확인 후 확정됩니다. 확정 전까지는 방문이 확정된 것이
            아닙니다.
          </p>
        </div>
      </form>
    </div>
  )
}
