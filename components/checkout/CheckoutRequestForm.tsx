"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AlertCircle, CalendarCheck, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DesiredDateCalendar } from "@/components/checkout/DesiredDateCalendar"
import {
  formatDesiredDateLabel,
  getKstToday,
  getMaxDesiredDate,
  getMinDesiredDate,
  isDesiredDateSelectable,
} from "@/components/checkout/request-date"
import type { CheckoutRequestItem } from "@/lib/billing/hardware-catalog"
import { trackEvent } from "@/lib/analytics"

export type CheckoutRequestKind = "hardware" | "software"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: CheckoutRequestKind
  /** 신청에 실릴 주문 라인 스냅샷. 비어 있으면 제출을 막는다. */
  items: CheckoutRequestItem[]
  /** 어디서 남긴 신청인지 — 백엔드 알림에 실린다. */
  sourcePage: string
  /** 폼 상단 요약 한 줄(선택 구성 · 합계). */
  summaryTitle: string
  summaryValue: string
  summaryNote?: string
}

type FieldKey = "org" | "name" | "phone" | "email" | "address" | "desiredDate" | "consent"

type FormState = {
  org: string
  name: string
  phone: string
  email: string
  address: string
  memo: string
  desiredDate: string
  consent: boolean
}

const EMPTY_FORM: FormState = {
  org: "",
  name: "",
  phone: "",
  email: "",
  address: "",
  memo: "",
  desiredDate: "",
  consent: false,
}

const RETRY_MESSAGE = "지금은 신청을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요."

const CONTRACT_FIELDS = new Set<FieldKey>([
  "org",
  "name",
  "phone",
  "email",
  "address",
  "desiredDate",
  "consent",
])

function isFieldKey(value: unknown): value is FieldKey {
  return typeof value === "string" && CONTRACT_FIELDS.has(value as FieldKey)
}

function validate(
  form: FormState,
  range: { minIso: string; maxIso: string },
  requireAddress: boolean
) {
  const errors: Partial<Record<FieldKey, string>> = {}

  if (!form.org.trim()) errors.org = "기관명을 입력해 주세요."
  if (!form.name.trim()) errors.name = "성함을 입력해 주세요."
  // 하드웨어는 장비가 실제로 배송·설치되는 곳이라 주소가 필수다(서버 계약 field:'address').
  if (requireAddress && !form.address.trim())
    errors.address = "설치/배송 주소를 입력해 주세요."

  const phoneDigits = form.phone.replace(/\D/g, "")
  if (!phoneDigits) errors.phone = "연락처를 입력해 주세요."
  else if (phoneDigits.length < 9 || phoneDigits.length > 11)
    errors.phone = "연락처 형식을 확인해 주세요."

  const email = form.email.trim()
  // 서버(lib/checkout-requests.ts EMAIL_REGEX)와 같은 기준 — TLD 는 영문 2자 이상.
  if (email && !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email))
    errors.email = "이메일 형식을 확인해 주세요."

  if (!form.desiredDate) errors.desiredDate = "희망 날짜를 선택해 주세요."
  else if (!isDesiredDateSelectable(form.desiredDate, range))
    errors.desiredDate = "선택할 수 없는 날짜입니다."

  if (!form.consent) errors.consent = "개인정보 수집·이용에 동의해 주세요."

  return errors
}

/**
 * 결제 없이 도입을 접수하는 공용 신청 폼(SW/HW 공용).
 * 계약: POST /api/checkout/request — 백엔드(위컴 알림)는 별도로 구축 중이라
 * 404/501 이 돌아오면 "잠시 후 다시 시도"로 흡수하고 입력값은 남겨둔다.
 */
export function CheckoutRequestForm({
  open,
  onOpenChange,
  kind,
  items,
  sourcePage,
  summaryTitle,
  summaryValue,
  summaryNote,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [requestId, setRequestId] = useState<string | null>(null)
  // 더블클릭·엔터 연타로 두 번 나가지 않게 상태 갱신 전에 잠근다.
  const submitLock = useRef(false)
  // 제출 중 다이얼로그를 닫으면 요청 자체를 끊는다 — 늦게 온 응답이 새로 연 폼에
  // 과거 성공 화면(접수번호)을 그리지 못하게 한다.
  const abortRef = useRef<AbortController | null>(null)

  // 그리드용 "오늘"은 마운트 시 한 번만 잡는다. 자정을 넘겨 열어둔 탭 대비는
  // 제출 시점에 KST 오늘을 다시 계산해 검증하는 쪽(handleSubmit)에서 처리한다.
  const todayIso = useMemo(() => getKstToday(), [])
  const range = useMemo(
    () => ({ minIso: getMinDesiredDate(todayIso), maxIso: getMaxDesiredDate(todayIso) }),
    [todayIso]
  )

  // 닫았다 다시 열면 깨끗한 상태에서 시작한다. 진행 중인 제출은 함께 끊는다.
  useEffect(() => {
    if (open) return
    abortRef.current?.abort()
    abortRef.current = null
    submitLock.current = false
    setForm(EMPTY_FORM)
    setErrors({})
    setFormError(null)
    setIsSubmitting(false)
    setRequestId(null)
  }, [open])

  // 언마운트(페이지 이동·상품군 전환)에서도 진행 중인 제출을 끊는다.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

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

  async function handleSubmit() {
    if (submitLock.current) return

    if (items.length === 0) {
      setFormError("신청할 구성을 먼저 선택해 주세요.")
      return
    }

    // 제출 순간의 KST 오늘로 다시 판정한다 — 자정을 넘겨 열어둔 탭의 낡은 범위가
    // 서버(내일 이상) 400 으로 새어나가지 않게 한다.
    const submitToday = getKstToday()
    const submitRange = {
      minIso: getMinDesiredDate(submitToday),
      maxIso: getMaxDesiredDate(submitToday),
    }

    const nextErrors = validate(form, submitRange, kind === "hardware")
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setFormError(null)
      return
    }

    submitLock.current = true
    setIsSubmitting(true)
    setErrors({})
    setFormError(null)

    const email = form.email.trim()
    const memo = form.memo.trim()

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller

    try {
      const response = await fetch("/api/checkout/request", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          items,
          org: form.org.trim(),
          name: form.name.trim(),
          phone: form.phone.trim(),
          ...(email ? { email } : {}),
          ...(kind === "hardware" ? { address: form.address.trim() } : {}),
          desiredDate: form.desiredDate,
          ...(memo ? { memo } : {}),
          sourcePage,
          consent: true,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | { ok: true; requestId: string }
        | { ok: false; error?: string; field?: string }
        | null

      // 응답 파싱 도중 닫혔으면 어떤 화면도 그리지 않는다(새로 연 폼 오염 방지).
      if (controller.signal.aborted) return

      if (response.ok && payload && payload.ok) {
        setRequestId(payload.requestId)
        trackEvent("submit_demo_request", {
          source: "checkout_request",
          request_kind: kind,
          page: sourcePage,
          item_count: items.length,
          value: items.reduce((sum, item) => sum + item.qty * item.unitAmount, 0),
          currency: items[0]?.currency ?? "KRW",
        })
        return
      }

      if (response.status === 400 && payload && !payload.ok) {
        if (isFieldKey(payload.field)) {
          setErrors({ [payload.field]: "입력값을 다시 확인해 주세요." })
          setFormError("입력값을 확인한 뒤 다시 시도해 주세요.")
        } else {
          setFormError("입력값을 확인한 뒤 다시 시도해 주세요.")
        }
        return
      }

      if (response.status === 429) {
        setFormError("요청이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.")
        return
      }

      // 404/501(백엔드 미배포) · 5xx · 응답 파싱 실패는 모두 재시도 안내로 흡수한다.
      setFormError(RETRY_MESSAGE)
    } catch {
      // abort 는 사용자가 닫은 것 — 오류로 알리지 않는다.
      if (controller.signal.aborted) return
      setFormError(RETRY_MESSAGE)
    } finally {
      // 이미 닫혔거나(abortRef=null) 더 새 제출이 자리를 가져갔으면 상태를 되돌리지 않는다.
      if (abortRef.current === controller) {
        abortRef.current = null
        submitLock.current = false
        setIsSubmitting(false)
      }
    }
  }

  const dateLabel = form.desiredDate ? formatDesiredDateLabel(form.desiredDate) : "미선택"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        {requestId ? (
          <div className="py-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ECFDF5]">
              <Check className="h-5 w-5 text-[#084734]" strokeWidth={2.4} />
            </div>
            <DialogHeader className="mt-4">
              <DialogTitle>도입 신청이 접수되었습니다</DialogTitle>
              <DialogDescription>
                담당자가 1영업일 내에 연락드려 결제·설치 일정을 함께 잡아드립니다.
              </DialogDescription>
            </DialogHeader>

            <dl className="mt-5 space-y-2 rounded-xl border border-black/[0.08] bg-[#F6F5F4] px-4 py-3 text-[13px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[#615D59]">접수번호</dt>
                <dd className="font-semibold tabular-nums text-[#111110]">{requestId}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[#615D59]">희망 날짜</dt>
                <dd className="font-medium text-[#111110]">{dateLabel}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[#615D59]">{summaryTitle}</dt>
                <dd className="font-medium text-[#111110]">{summaryValue}</dd>
              </div>
            </dl>

            <Button
              type="button"
              className="mt-5 h-11 w-full rounded-lg bg-[#084734] text-[14px] font-semibold text-white hover:bg-[#065C41]"
              onClick={() => onOpenChange(false)}
            >
              확인
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader className="pr-8">
              <DialogTitle>도입 신청</DialogTitle>
              <DialogDescription>
                결제 없이 접수됩니다. 남겨주신 연락처로 담당자가 1영업일 내에 연락드려 결제와 설치
                일정을 안내드립니다.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-baseline justify-between gap-3 rounded-xl border border-black/[0.08] bg-[#F6F5F4] px-4 py-3">
              <div>
                <p className="text-[12px] text-[#615D59]">{summaryTitle}</p>
                {summaryNote ? (
                  <p className="mt-0.5 text-[11px] text-[#A39E98]">{summaryNote}</p>
                ) : null}
              </div>
              <p className="text-right text-[15px] font-semibold tabular-nums text-[#111110]">
                {summaryValue}
              </p>
            </div>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSubmit()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="request-org" className="text-[12px] text-[#44514A]">
                  기관명 / 학원명
                </Label>
                <Input
                  id="request-org"
                  value={form.org}
                  onChange={(event) => update("org", event.target.value)}
                  placeholder="예: 무궁화학원"
                  autoComplete="organization"
                  aria-invalid={Boolean(errors.org)}
                  aria-describedby={errors.org ? "request-org-error" : undefined}
                  className={errors.org ? "border-[#B43E3E]" : ""}
                />
                {errors.org ? (
                  <p id="request-org-error" className="text-[11px] text-[#B43E3E]">
                    {errors.org}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="request-name" className="text-[12px] text-[#44514A]">
                    성함
                  </Label>
                  <Input
                    id="request-name"
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                    placeholder="홍길동"
                    autoComplete="name"
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? "request-name-error" : undefined}
                    className={errors.name ? "border-[#B43E3E]" : ""}
                  />
                  {errors.name ? (
                    <p id="request-name-error" className="text-[11px] text-[#B43E3E]">
                      {errors.name}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="request-phone" className="text-[12px] text-[#44514A]">
                    연락처
                  </Label>
                  <Input
                    id="request-phone"
                    type="tel"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(event) => update("phone", event.target.value)}
                    placeholder="010-0000-0000"
                    autoComplete="tel"
                    aria-invalid={Boolean(errors.phone)}
                    aria-describedby={errors.phone ? "request-phone-error" : undefined}
                    className={errors.phone ? "border-[#B43E3E]" : ""}
                  />
                  {errors.phone ? (
                    <p id="request-phone-error" className="text-[11px] text-[#B43E3E]">
                      {errors.phone}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="request-email" className="text-[12px] text-[#44514A]">
                  이메일 <span className="text-[#A39E98]">(선택)</span>
                </Label>
                <Input
                  id="request-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => update("email", event.target.value)}
                  placeholder="ops@classin.co.kr"
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "request-email-error" : undefined}
                  className={errors.email ? "border-[#B43E3E]" : ""}
                />
                {errors.email ? (
                  <p id="request-email-error" className="text-[11px] text-[#B43E3E]">
                    {errors.email}
                  </p>
                ) : null}
              </div>

              {kind === "hardware" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="request-address" className="text-[12px] text-[#44514A]">
                    설치/배송 주소
                  </Label>
                  <Input
                    id="request-address"
                    value={form.address}
                    onChange={(event) => update("address", event.target.value)}
                    placeholder="예: 서울시 강남구 테헤란로 123, 4층 무궁화학원"
                    autoComplete="street-address"
                    aria-invalid={Boolean(errors.address)}
                    aria-describedby={errors.address ? "request-address-error" : undefined}
                    className={errors.address ? "border-[#B43E3E]" : ""}
                  />
                  {errors.address ? (
                    <p id="request-address-error" className="text-[11px] text-[#B43E3E]">
                      {errors.address}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span id="request-date-label" className="text-[12px] font-medium text-[#44514A]">
                    희망 날짜
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#084734]">
                    <CalendarCheck className="h-3.5 w-3.5" />
                    {dateLabel}
                  </span>
                </div>
                <DesiredDateCalendar
                  value={form.desiredDate}
                  onChange={(iso) => update("desiredDate", iso)}
                  todayIso={todayIso}
                  minIso={range.minIso}
                  maxIso={range.maxIso}
                  invalid={Boolean(errors.desiredDate)}
                  labelledById="request-date-label"
                  describedById="request-date-hint"
                />
                <p id="request-date-hint" className="text-[11px] text-[#A39E98]">
                  설치·상담 희망일을 내일 이후로 골라주세요. 실제 일정은 담당자와 조율합니다.
                </p>
                {errors.desiredDate ? (
                  <p className="text-[11px] text-[#B43E3E]">{errors.desiredDate}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="request-memo" className="text-[12px] text-[#44514A]">
                  메모 <span className="text-[#A39E98]">(선택)</span>
                </Label>
                <Textarea
                  id="request-memo"
                  value={form.memo}
                  onChange={(event) => update("memo", event.target.value)}
                  placeholder="설치 공간, 교실 수, 기존 장비 등 알려주시면 상담이 빨라집니다."
                  maxLength={1000}
                  className="min-h-[88px] rounded-lg border-[#E5E5E0] px-3 py-2.5 text-[14px]"
                />
              </div>

              <label
                htmlFor="request-consent"
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-3 transition-colors ${
                  errors.consent ? "border-[#B43E3E]" : "border-black/[0.08] hover:bg-[#F6F5F4]"
                }`}
              >
                <input
                  id="request-consent"
                  type="checkbox"
                  checked={form.consent}
                  onChange={(event) => update("consent", event.target.checked)}
                  aria-invalid={Boolean(errors.consent)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                />
                <span className="text-[12px] leading-relaxed text-[#44514A]">
                  도입 상담 연락을 위한 개인정보(기관명 · 성함 · 연락처 · 이메일) 수집·이용에
                  동의합니다.{" "}
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
                <p className="-mt-2 text-[11px] text-[#B43E3E]">{errors.consent}</p>
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

              <Button
                type="submit"
                className="h-12 w-full rounded-lg bg-[#084734] text-[14px] font-semibold text-white hover:bg-[#065C41]"
                disabled={isSubmitting}
              >
                {isSubmitting ? "접수 중..." : "도입 신청 보내기"}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
