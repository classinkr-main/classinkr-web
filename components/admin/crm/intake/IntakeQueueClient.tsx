"use client"

/**
 * 접수 큐 — 쇼룸 예약과 도입 신청을 한 화면에서 확정한다.
 *
 * 두 접수 모두 테이블·API 는 있는데 호출하는 화면이 없어, 접수가 `requested`/`new` 에
 * 머물렀다. 공개 화면은 "담당자가 1영업일 내에 연락드립니다"라고 약속하는데 그 확정을
 * 수행할 자리가 없던 상태다.
 *
 * 캘린더가 아니라 고객 섹션에 두는 이유: 캘린더는 **확정된 일정**을 보는 곳이고 접수는
 * **처리할 큐**다. 알림의 딥링크도 리드 큐를 가리킨다.
 */

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarClock, ExternalLink, Loader2, RefreshCw, ShoppingCart } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import type {
  CheckoutRequestRecord,
  CheckoutRequestStatus,
} from "@/lib/repositories/checkout-requests-admin"
import type {
  ShowroomBookingRecord,
  ShowroomBookingStatus,
} from "@/lib/repositories/showroom-bookings"

const LEADS_HREF = "/admin/crm/customers/leads"

/** 접수 직후의 상태. "대기만 보기"가 거르는 기준이자 이 화면이 존재하는 이유다. */
const SHOWROOM_PENDING: ShowroomBookingStatus = "requested"
const CHECKOUT_PENDING: CheckoutRequestStatus = "new"

type Tone = "pending" | "active" | "done" | "dropped"

/** DESIGN.md §2 운영 상태 스케일(어드민 전용). 화면마다 새 색을 만들지 않는다. */
const TONE_CLASS: Record<Tone, string> = {
  pending: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]",
  active: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]",
  done: "border-[#E8E8E4] bg-[#F6F5F4] text-[#615D59]",
  dropped: "border-[#F2B8B8] bg-[#FCE9E9] text-[#8F2C2C]",
}

const SHOWROOM_STATUS_META: Record<ShowroomBookingStatus, { label: string; tone: Tone }> = {
  requested: { label: "접수", tone: "pending" },
  confirmed: { label: "확정", tone: "active" },
  completed: { label: "방문 완료", tone: "done" },
  no_show: { label: "노쇼", tone: "dropped" },
  canceled: { label: "취소", tone: "dropped" },
}

const CHECKOUT_STATUS_META: Record<CheckoutRequestStatus, { label: string; tone: Tone }> = {
  new: { label: "신규", tone: "pending" },
  contacted: { label: "연락함", tone: "active" },
  scheduled: { label: "일정 확정", tone: "active" },
  done: { label: "완료", tone: "done" },
  canceled: { label: "취소", tone: "dropped" },
}

const KIND_LABEL: Record<CheckoutRequestRecord["kind"], string> = {
  hardware: "하드웨어",
  software: "소프트웨어",
}

const INSTALL_LABEL: Record<"stand" | "wall", string> = {
  stand: "스탠드",
  wall: "벽걸이",
}

function formatAmount(amount: number, currency: string) {
  if (currency === "KRW") return `₩${amount.toLocaleString("ko-KR")}`
  if (currency === "USD") return `$${amount.toLocaleString("en-US")}`
  return `${amount.toLocaleString("ko-KR")} ${currency}`
}

/** `2026-09-24` → `9/24(목)`. 큐는 한 줄에 여러 값이 붙어 짧게 쓴다. */
function formatShortDate(iso: string) {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!parsed) return iso
  const [, year, month, day] = parsed
  const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay()
  return `${Number(month)}/${Number(day)}(${"일월화수목금토"[weekday]})`
}

function formatReceivedAt(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function StatusChip({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  )
}

interface SectionShellProps {
  title: string
  icon: React.ReactNode
  pendingCount: number
  totalCount: number
  pendingOnly: boolean
  onPendingOnlyChange: (next: boolean) => void
  loading: boolean
  error: string | null
  onRetry: () => void
  emptyLabel: string
  children: React.ReactNode
  rowCount: number
}

function SectionShell({
  title,
  icon,
  pendingCount,
  totalCount,
  pendingOnly,
  onPendingOnlyChange,
  loading,
  error,
  onRetry,
  emptyLabel,
  children,
  rowCount,
}: SectionShellProps) {
  return (
    <section className="rounded-[12px] border border-[#e8e8e4] bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e8e4] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="text-[#615D59]">{icon}</span>
          <h2 className="text-[14px] font-semibold text-[#111110]">{title}</h2>
          {pendingCount > 0 ? (
            <StatusChip label={`대기 ${pendingCount}`} tone="pending" />
          ) : (
            <span className="text-[12px] text-[#A39E98]">대기 없음</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div
            role="group"
            aria-label={`${title} 범위`}
            className="inline-flex overflow-hidden rounded-[6px] border border-[#e8e8e4]"
          >
            {[
              { key: true, label: "대기" },
              { key: false, label: `전체 ${totalCount}` },
            ].map((option) => (
              <button
                key={String(option.key)}
                type="button"
                aria-pressed={pendingOnly === option.key}
                onClick={() => onPendingOnlyChange(option.key)}
                className={`min-h-9 px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] ${
                  pendingOnly === option.key
                    ? "bg-[#111110] text-white"
                    : "bg-white text-[#1a1a1a]/55 hover:bg-[#f5f5f2]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onRetry}
            disabled={loading}
            aria-label={`${title} 새로고침`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-[#e8e8e4] text-[#615D59] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      {error ? (
        <div className="px-4 py-4 sm:px-5">
          <p role="alert" className="text-[13px] text-[#B43E3E]">
            {error}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex min-h-9 items-center rounded-[6px] border border-[#e8e8e4] px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
          >
            다시 불러오기
          </button>
        </div>
      ) : rowCount === 0 && !loading ? (
        <p className="px-4 py-6 text-[13px] text-[#A39E98] sm:px-5">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-[#f0f0ec]">{children}</ul>
      )}
    </section>
  )
}

function ContactLine({
  org,
  name,
  phone,
  email,
}: {
  org: string
  name: string
  phone: string
  email: string | null
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[13.5px] font-semibold text-[#111110]">{org}</p>
      <p className="mt-0.5 truncate text-[12px] text-[#615D59]">
        {name} · {phone}
        {email ? ` · ${email}` : ""}
      </p>
    </div>
  )
}

function StatusSelect<T extends string>({
  value,
  options,
  disabled,
  label,
  onChange,
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  disabled: boolean
  label: string
  onChange: (next: T) => void
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as T)}
      className="min-h-9 shrink-0 rounded-[6px] border border-[#E5E5E0] bg-white px-2 text-[12px] font-medium text-[#111110] transition-colors focus:outline-none focus:ring-2 focus:ring-[#084734] disabled:opacity-50"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

const SHOWROOM_OPTIONS = (
  Object.keys(SHOWROOM_STATUS_META) as ShowroomBookingStatus[]
).map((value) => ({ value, label: SHOWROOM_STATUS_META[value].label }))

const CHECKOUT_OPTIONS = (
  Object.keys(CHECKOUT_STATUS_META) as CheckoutRequestStatus[]
).map((value) => ({ value, label: CHECKOUT_STATUS_META[value].label }))

export default function IntakeQueueClient() {
  const [bookings, setBookings] = useState<ShowroomBookingRecord[]>([])
  const [requests, setRequests] = useState<CheckoutRequestRecord[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(true)
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [bookingsError, setBookingsError] = useState<string | null>(null)
  const [requestsError, setRequestsError] = useState<string | null>(null)
  const [bookingsPendingOnly, setBookingsPendingOnly] = useState(true)
  const [requestsPendingOnly, setRequestsPendingOnly] = useState(true)
  /** 전이 중인 행 id. 같은 행을 두 번 누르는 것만 막고 다른 행은 계속 쓸 수 있게 둔다. */
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const loadBookings = useCallback(async () => {
    setBookingsLoading(true)
    setBookingsError(null)
    try {
      const data = await adminFetchJson<ShowroomBookingRecord[]>("/api/admin/showroom-bookings", {
        cache: "no-cache",
      })
      setBookings(Array.isArray(data) ? data : [])
    } catch (error) {
      setBookingsError(error instanceof Error ? error.message : "쇼룸 예약을 불러오지 못했습니다.")
    } finally {
      setBookingsLoading(false)
    }
  }, [])

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true)
    setRequestsError(null)
    try {
      const data = await adminFetchJson<CheckoutRequestRecord[]>("/api/admin/checkout-requests", {
        cache: "no-cache",
      })
      setRequests(Array.isArray(data) ? data : [])
    } catch (error) {
      setRequestsError(error instanceof Error ? error.message : "도입 신청을 불러오지 못했습니다.")
    } finally {
      setRequestsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBookings()
    void loadRequests()
  }, [loadBookings, loadRequests])

  const changeBookingStatus = useCallback(
    async (id: string, status: ShowroomBookingStatus) => {
      setSavingId(id)
      setSaveError(null)
      try {
        const updated = await adminFetchJson<ShowroomBookingRecord>(
          `/api/admin/showroom-bookings/${id}`,
          { method: "PATCH", body: JSON.stringify({ status }) }
        )
        setBookings((current) => current.map((row) => (row.id === id ? updated : row)))
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "상태를 바꾸지 못했습니다.")
      } finally {
        setSavingId(null)
      }
    },
    []
  )

  const changeRequestStatus = useCallback(
    async (id: string, status: CheckoutRequestStatus) => {
      setSavingId(id)
      setSaveError(null)
      try {
        const updated = await adminFetchJson<CheckoutRequestRecord>(
          `/api/admin/checkout-requests/${id}`,
          { method: "PATCH", body: JSON.stringify({ status }) }
        )
        setRequests((current) => current.map((row) => (row.id === id ? updated : row)))
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "상태를 바꾸지 못했습니다.")
      } finally {
        setSavingId(null)
      }
    },
    []
  )

  const bookingPendingCount = useMemo(
    () => bookings.filter((row) => row.status === SHOWROOM_PENDING).length,
    [bookings]
  )
  const requestPendingCount = useMemo(
    () => requests.filter((row) => row.status === CHECKOUT_PENDING).length,
    [requests]
  )

  const visibleBookings = bookingsPendingOnly
    ? bookings.filter((row) => row.status === SHOWROOM_PENDING)
    : bookings
  const visibleRequests = requestsPendingOnly
    ? requests.filter((row) => row.status === CHECKOUT_PENDING)
    : requests

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[17px] font-semibold text-[#111110]">접수</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-[#615D59]">
          공개 화면에서 들어온 쇼룸 방문 예약과 도입 신청을 확정하는 큐입니다. 상태를 바꾸면
          고객에게 약속한 &ldquo;담당자 확인 후 연락&rdquo;이 실제로 기록됩니다.
        </p>
      </header>

      {saveError ? (
        <p role="alert" className="rounded-[8px] border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[13px] text-[#8F2C2C]">
          {saveError}
        </p>
      ) : null}

      <SectionShell
        title="쇼룸 방문 예약"
        icon={<CalendarClock className="h-4 w-4" aria-hidden />}
        pendingCount={bookingPendingCount}
        totalCount={bookings.length}
        pendingOnly={bookingsPendingOnly}
        onPendingOnlyChange={setBookingsPendingOnly}
        loading={bookingsLoading}
        error={bookingsError}
        onRetry={() => void loadBookings()}
        emptyLabel={
          bookingsPendingOnly ? "확정을 기다리는 예약이 없습니다." : "접수된 예약이 없습니다."
        }
        rowCount={visibleBookings.length}
      >
        {visibleBookings.map((row) => {
          const meta = SHOWROOM_STATUS_META[row.status]
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
              <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
                <StatusChip label={meta.label} tone={meta.tone} />
                <ContactLine org={row.org} name={row.name} phone={row.phone} email={row.email} />
              </div>

              <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#615D59]">
                <div className="flex items-center gap-1">
                  <dt className="sr-only">방문 일시</dt>
                  <dd className="font-medium text-[#111110]">
                    {formatShortDate(row.visitDate)} {row.visitTime}
                  </dd>
                </div>
                <div className="flex items-center gap-1">
                  <dt className="sr-only">방문 인원</dt>
                  <dd>{row.visitorCount}명</dd>
                </div>
                {row.interests.length > 0 ? (
                  <div className="flex items-center gap-1">
                    <dt className="sr-only">관심사</dt>
                    <dd className="truncate">{row.interests.join(" · ")}</dd>
                  </div>
                ) : null}
                <div className="flex items-center gap-1">
                  <dt className="sr-only">접수 시각</dt>
                  <dd className="text-[#A39E98]">{formatReceivedAt(row.createdAt)} 접수</dd>
                </div>
              </dl>

              <div className="ml-auto flex items-center gap-2">
                {row.leadId ? (
                  <Link
                    href={`${LEADS_HREF}?lead=${row.leadId}`}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#084734] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                  >
                    리드
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                ) : null}
                <StatusSelect
                  label={`${row.org} 예약 상태`}
                  value={row.status}
                  options={SHOWROOM_OPTIONS}
                  disabled={savingId === row.id}
                  onChange={(next) => void changeBookingStatus(row.id, next)}
                />
              </div>
            </li>
          )
        })}
      </SectionShell>

      <SectionShell
        title="도입 신청"
        icon={<ShoppingCart className="h-4 w-4" aria-hidden />}
        pendingCount={requestPendingCount}
        totalCount={requests.length}
        pendingOnly={requestsPendingOnly}
        onPendingOnlyChange={setRequestsPendingOnly}
        loading={requestsLoading}
        error={requestsError}
        onRetry={() => void loadRequests()}
        emptyLabel={
          requestsPendingOnly ? "응대를 기다리는 신청이 없습니다." : "접수된 신청이 없습니다."
        }
        rowCount={visibleRequests.length}
      >
        {visibleRequests.map((row) => {
          const meta = CHECKOUT_STATUS_META[row.status]
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
              <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
                <StatusChip label={meta.label} tone={meta.tone} />
                <ContactLine org={row.org} name={row.name} phone={row.phone} email={row.email} />
              </div>

              <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#615D59]">
                <div className="flex items-center gap-1">
                  <dt className="sr-only">종류</dt>
                  <dd>{KIND_LABEL[row.kind]}</dd>
                </div>
                <div className="flex items-center gap-1">
                  <dt className="sr-only">합계</dt>
                  <dd className="font-medium tabular-nums text-[#111110]">
                    {formatAmount(row.totalAmount, row.currency)}
                  </dd>
                </div>
                <div className="flex items-center gap-1">
                  <dt className="sr-only">희망일</dt>
                  <dd>희망 {formatShortDate(row.desiredDate)}</dd>
                </div>
                {row.installType ? (
                  <div className="flex items-center gap-1">
                    <dt className="sr-only">설치 방식</dt>
                    <dd>{INSTALL_LABEL[row.installType]}</dd>
                  </div>
                ) : null}
                {row.academySize ? (
                  <div className="flex items-center gap-1">
                    <dt className="sr-only">학원 규모</dt>
                    <dd>{row.academySize}</dd>
                  </div>
                ) : null}
                <div className="flex items-center gap-1">
                  <dt className="sr-only">접수 시각</dt>
                  <dd className="text-[#A39E98]">{formatReceivedAt(row.createdAt)} 접수</dd>
                </div>
              </dl>

              <div className="ml-auto flex items-center gap-2">
                {row.leadId ? (
                  <Link
                    href={`${LEADS_HREF}?lead=${row.leadId}`}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#084734] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                  >
                    리드
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                ) : null}
                <StatusSelect
                  label={`${row.org} 신청 상태`}
                  value={row.status}
                  options={CHECKOUT_OPTIONS}
                  disabled={savingId === row.id}
                  onChange={(next) => void changeRequestStatus(row.id, next)}
                />
              </div>
            </li>
          )
        })}
      </SectionShell>
    </div>
  )
}
