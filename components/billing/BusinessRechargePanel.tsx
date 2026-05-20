"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ANONYMOUS, loadTossPayments, type TossPaymentsWidgets } from "@tosspayments/tosspayments-sdk"
import { AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CodeInputField, type CodeFieldStatus } from "@/components/billing/CodeInputField"
import { KrwConversionNote } from "@/components/billing/KrwConversionNote"
import {
  BUSINESS_RECHARGE,
  buildRechargeOrderName,
  formatCny,
  validateRechargeAmount,
} from "@/lib/billing/recharge"
import { formatKrw } from "@/lib/billing/plans"
import {
  getTossWidgetClientKey,
  hasTossWidgetClientKey,
  isSoftwareCheckoutEnabled,
} from "@/lib/billing/public-env"
import { trackEvent } from "@/lib/analytics"
import { collectLeadAttribution } from "@/lib/submitLead"

type FormState = {
  organizationName: string
  buyerName: string
  buyerEmail: string
  buyerPhone: string
}

type FxState = {
  cnyKrw: number | null
  fetchedAt: string | null
  isStale: boolean
  loading: boolean
}

type QuoteCodeApplied = {
  id: string
  code: string
  amountCny: number
  organizationName: string | null
  notes: string | null
}

type PromoApplied = {
  id: string
  code: string
  label: string | null
  discountType: "percent" | "flat_cny" | "flat_usd" | "flat_krw"
  discountValue: number
  amountAfter: number
  discountAmount: number
}

const EMPTY_FORM: FormState = {
  organizationName: "",
  buyerName: "",
  buyerEmail: "",
  buyerPhone: "",
}

const TOSS_METHODS_ID = "toss-business-payment-methods"
const TOSS_AGREEMENT_ID = "toss-business-agreement"

const RATE_TABLE_ROWS: Array<{ label: string; price: string }> = [
  { label: "1v0 기본", price: "1 CNY / 1명 / 1시간" },
  { label: "1v1", price: "2 CNY / 1명 / 1시간" },
  { label: "1v2~12 소그룹", price: "4 CNY / 1명 / 1시간" },
  { label: "1v1 듀얼 카메라", price: "8 CNY" },
  { label: "HD (1v1 / 1v6)", price: "4 / 12 CNY" },
  { label: "FHD (1v1 / 1v6)", price: "8 / 20 CNY" },
  { label: "조교 (기본/HD/FHD)", price: "6 / 10 / 20 CNY" },
  { label: "녹화 (단일/듀얼)", price: "2 / 4 CNY" },
]

function approxKrw(amountCny: number | null, rate: number | null) {
  if (amountCny == null || !rate || rate <= 0) return null
  return Math.round(amountCny * rate)
}

interface Props {
  initialQuoteCode?: string
}

export function BusinessRechargePanel({ initialQuoteCode }: Props = {}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [customAmountInput, setCustomAmountInput] = useState<string>(
    BUSINESS_RECHARGE.presetsCny[0].toString()
  )
  const [selectedPresetCny, setSelectedPresetCny] = useState<number | null>(
    BUSINESS_RECHARGE.presetsCny[0]
  )
  const [amountError, setAmountError] = useState<string | null>(null)

  const [quoteCode, setQuoteCode] = useState<QuoteCodeApplied | null>(null)
  const [quoteStatus, setQuoteStatus] = useState<CodeFieldStatus>({ kind: "idle" })

  const [promo, setPromo] = useState<PromoApplied | null>(null)
  const [promoStatus, setPromoStatus] = useState<CodeFieldStatus>({ kind: "idle" })

  const [fx, setFx] = useState<FxState>({
    cnyKrw: null,
    fetchedAt: null,
    isStale: false,
    loading: true,
  })

  const [isWidgetReady, setIsWidgetReady] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const widgetsRef = useRef<TossPaymentsWidgets | null>(null)
  const paymentMethodWidgetRef = useRef<{ destroy: () => Promise<void> } | null>(null)
  const agreementWidgetRef = useRef<{ destroy: () => Promise<void> } | null>(null)

  const checkoutEnabled = isSoftwareCheckoutEnabled()
  const hasWidgetKey = hasTossWidgetClientKey()

  const effectiveBaseAmountCny = useMemo(() => {
    if (quoteCode) return quoteCode.amountCny
    const parsed = Number.parseInt(customAmountInput.replace(/[^0-9]/g, ""), 10)
    return Number.isFinite(parsed) ? parsed : 0
  }, [quoteCode, customAmountInput])

  const effectiveFinalAmountCny = promo ? promo.amountAfter : effectiveBaseAmountCny
  const approxAmountKrw = useMemo(
    () => approxKrw(effectiveFinalAmountCny, fx.cnyKrw),
    [effectiveFinalAmountCny, fx.cnyKrw]
  )
  const isFormComplete = Boolean(
    form.organizationName.trim() && form.buyerName.trim() && form.buyerEmail.trim()
  )

  // URL 쿼리에 quote 코드가 실려 들어온 경우 자동 적용
  useEffect(() => {
    if (!initialQuoteCode) return
    let cancelled = false

    async function apply() {
      try {
        const response = await fetch("/api/billing/quote-code/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: initialQuoteCode, kind: "business_recharge" }),
        })
        const payload = (await response.json().catch(() => null)) as
          | {
              ok: true
              code: {
                id: string
                code: string
                amountCny: number | null
                organizationName: string | null
                notes: string | null
              }
            }
          | { ok: false; message: string }
          | null

        if (cancelled) return
        if (!response.ok || !payload || !payload.ok || payload.code.amountCny == null) return

        setQuoteCode({
          id: payload.code.id,
          code: payload.code.code,
          amountCny: payload.code.amountCny,
          organizationName: payload.code.organizationName,
          notes: payload.code.notes,
        })
        setCustomAmountInput(payload.code.amountCny.toString())
        setSelectedPresetCny(null)
        setQuoteStatus({
          kind: "applied",
          summary: `${payload.code.code} · ${formatCny(payload.code.amountCny)} 적용`,
        })
      } catch {
        // URL 자동 적용 실패는 조용히 무시. 사용자가 수동 재입력 가능.
      }
    }

    void apply()
    return () => {
      cancelled = true
    }
  }, [initialQuoteCode])

  // FX 초기 로드
  useEffect(() => {
    let cancelled = false

    async function loadFx() {
      try {
        const response = await fetch("/api/billing/fx", { cache: "no-store" })
        if (!response.ok) throw new Error("환율 조회 실패")
        const payload = (await response.json()) as {
          cnyKrw: number
          fetchedAt: string
          isStale: boolean
        }
        if (cancelled) return
        setFx({
          cnyKrw: payload.cnyKrw,
          fetchedAt: payload.fetchedAt,
          isStale: Boolean(payload.isStale),
          loading: false,
        })
      } catch {
        if (cancelled) return
        setFx((prev) => ({ ...prev, loading: false }))
      }
    }

    void loadFx()
    return () => {
      cancelled = true
    }
  }, [])

  // 토스 위젯 mount
  useEffect(() => {
    if (!hasWidgetKey) return

    let cancelled = false

    async function mountWidget() {
      try {
        const tossPayments = await loadTossPayments(getTossWidgetClientKey())
        const widgets = tossPayments.widgets({ customerKey: ANONYMOUS })

        // 최소 충전 금액 × 대략 환율. mount 후 setAmount 로 재반영.
        await widgets.setAmount({
          currency: "KRW",
          value: Math.max(BUSINESS_RECHARGE.baseMinCny * 190, 1),
        })

        const paymentMethodWidget = await widgets.renderPaymentMethods({
          selector: `#${TOSS_METHODS_ID}`,
        })
        const agreementWidget = await widgets.renderAgreement({
          selector: `#${TOSS_AGREEMENT_ID}`,
        })

        if (cancelled) {
          await paymentMethodWidget.destroy().catch(() => null)
          await agreementWidget.destroy().catch(() => null)
          return
        }

        widgetsRef.current = widgets
        paymentMethodWidgetRef.current = paymentMethodWidget
        agreementWidgetRef.current = agreementWidget
        setIsWidgetReady(true)
      } catch (mountError) {
        console.error("[business-recharge] widget mount error:", mountError)
        if (!cancelled) {
          setError("토스 결제위젯을 불러오지 못했습니다. 키 설정을 확인해주세요.")
        }
      }
    }

    void mountWidget()

    return () => {
      cancelled = true
      setIsWidgetReady(false)
      void paymentMethodWidgetRef.current?.destroy().catch(() => null)
      void agreementWidgetRef.current?.destroy().catch(() => null)
      widgetsRef.current = null
      paymentMethodWidgetRef.current = null
      agreementWidgetRef.current = null
    }
  }, [hasWidgetKey])

  // 금액 변경 시 위젯 setAmount 갱신
  useEffect(() => {
    if (!widgetsRef.current) return
    if (!approxAmountKrw || approxAmountKrw <= 0) return

    void widgetsRef.current
      .setAmount({ currency: "KRW", value: approxAmountKrw })
      .catch((amountError) => {
        console.error("[business-recharge] setAmount error:", amountError)
      })
  }, [approxAmountKrw])

  function selectPreset(amount: number) {
    if (quoteCode) return
    setSelectedPresetCny(amount)
    setCustomAmountInput(amount.toString())
    setAmountError(null)
  }

  function handleCustomInput(value: string) {
    setCustomAmountInput(value)
    setSelectedPresetCny(null)
    setAmountError(null)
  }

  function blurValidateCustom() {
    if (quoteCode) return
    const parsed = Number.parseInt(customAmountInput.replace(/[^0-9]/g, ""), 10)
    if (!Number.isFinite(parsed)) {
      setAmountError("충전 금액을 입력해 주세요.")
      return
    }
    const validation = validateRechargeAmount(parsed)
    if (!validation.ok) {
      setAmountError(validation.reason + (validation.suggested ? ` (예: ${validation.suggested.toLocaleString()} CNY)` : ""))
    } else {
      setAmountError(null)
      setCustomAmountInput(parsed.toString())
    }
  }

  async function handleApplyQuoteCode(code: string) {
    setQuoteStatus({ kind: "loading" })
    try {
      const response = await fetch("/api/billing/quote-code/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, kind: "business_recharge" }),
      })
      const payload = (await response.json().catch(() => null)) as
        | {
            ok: true
            code: { id: string; code: string; amountCny: number | null; organizationName: string | null; notes: string | null }
          }
        | { ok: false; message: string }
        | null

      if (!response.ok || !payload) {
        throw new Error("코드 검증 요청이 실패했습니다.")
      }
      if (!payload.ok) {
        setQuoteStatus({ kind: "error", message: payload.message })
        return
      }
      if (payload.code.amountCny == null || payload.code.amountCny <= 0) {
        setQuoteStatus({ kind: "error", message: "이 코드에는 충전 금액이 지정되어 있지 않습니다." })
        return
      }

      setQuoteCode({
        id: payload.code.id,
        code: payload.code.code,
        amountCny: payload.code.amountCny,
        organizationName: payload.code.organizationName,
        notes: payload.code.notes,
      })
      setCustomAmountInput(payload.code.amountCny.toString())
      setSelectedPresetCny(null)
      setAmountError(null)
      // 프로모는 금액이 바뀌므로 해제
      setPromo(null)
      setPromoStatus({ kind: "idle" })
      setQuoteStatus({
        kind: "applied",
        summary: `${payload.code.code} · ${formatCny(payload.code.amountCny)} 적용`,
      })
    } catch (codeError) {
      setQuoteStatus({
        kind: "error",
        message: codeError instanceof Error ? codeError.message : "코드 검증에 실패했습니다.",
      })
    }
  }

  function handleRemoveQuoteCode() {
    setQuoteCode(null)
    setQuoteStatus({ kind: "idle" })
    setCustomAmountInput(BUSINESS_RECHARGE.presetsCny[0].toString())
    setSelectedPresetCny(BUSINESS_RECHARGE.presetsCny[0])
    setPromo(null)
    setPromoStatus({ kind: "idle" })
  }

  async function handleApplyPromo(code: string) {
    if (!effectiveBaseAmountCny || effectiveBaseAmountCny <= 0) {
      setPromoStatus({ kind: "error", message: "먼저 충전 금액을 입력해 주세요." })
      return
    }

    setPromoStatus({ kind: "loading" })
    try {
      const response = await fetch("/api/billing/promo-code/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          target: "business_recharge",
          baseAmount: effectiveBaseAmountCny,
          currency: "CNY",
        }),
      })
      const payload = (await response.json().catch(() => null)) as
        | {
            ok: true
            promo: {
              id: string
              code: string
              label: string | null
              discountType: "percent" | "flat_cny" | "flat_usd" | "flat_krw"
              discountValue: number
            }
            amountBefore: number
            amountAfter: number
            discountAmount: number
            currency: string
          }
        | { ok: false; message: string }
        | null

      if (!response.ok || !payload) {
        throw new Error("코드 검증 요청이 실패했습니다.")
      }
      if (!payload.ok) {
        setPromoStatus({ kind: "error", message: payload.message })
        return
      }

      setPromo({
        id: payload.promo.id,
        code: payload.promo.code,
        label: payload.promo.label,
        discountType: payload.promo.discountType,
        discountValue: payload.promo.discountValue,
        amountAfter: payload.amountAfter,
        discountAmount: payload.discountAmount,
      })
      setPromoStatus({
        kind: "applied",
        summary: `${payload.promo.code} · -${formatCny(payload.discountAmount)} 적용`,
      })
    } catch (codeError) {
      setPromoStatus({
        kind: "error",
        message: codeError instanceof Error ? codeError.message : "코드 검증에 실패했습니다.",
      })
    }
  }

  function handleRemovePromo() {
    setPromo(null)
    setPromoStatus({ kind: "idle" })
  }

  async function handleCheckout() {
    if (!checkoutEnabled) {
      setError("공개 결제는 아직 활성화되지 않았습니다. 환경 설정 후 다시 시도해주세요.")
      return
    }
    if (!widgetsRef.current) {
      setError("결제위젯 준비가 아직 끝나지 않았습니다.")
      return
    }
    if (!effectiveFinalAmountCny || effectiveFinalAmountCny <= 0) {
      setError("충전 금액을 먼저 설정해 주세요.")
      return
    }
    if (!quoteCode) {
      const validation = validateRechargeAmount(effectiveBaseAmountCny)
      if (!validation.ok) {
        setError(validation.reason)
        return
      }
    }

    setIsPreparing(true)
    setError(null)

    try {
      const response = await fetch("/api/billing/checkout/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "business",
          amountCny: effectiveBaseAmountCny,
          organizationName: form.organizationName,
          buyerName: form.buyerName,
          buyerEmail: form.buyerEmail,
          buyerPhone: form.buyerPhone,
          quoteCode: quoteCode?.code ?? "",
          promoCode: promo?.code ?? "",
          attribution: collectLeadAttribution(),
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | {
            orderId: string
            checkoutToken: string
            orderName: string
            amount: number
            amountKrw: number
            amountCny: number
            fxRate: number
          }
        | { error?: string }
        | null

      if (!response.ok || !payload || !("orderId" in payload)) {
        throw new Error(payload && "error" in payload ? payload.error : "주문 준비에 실패했습니다.")
      }

      await widgetsRef.current.setAmount({ currency: "KRW", value: payload.amountKrw })

      trackEvent("begin_checkout", {
        mode: "business",
        amount_cny: payload.amountCny,
        quote_code: quoteCode?.code,
        promo_code: promo?.code,
        value: payload.amountKrw,
        currency: "KRW",
      })

      const checkoutQuery = `checkoutToken=${encodeURIComponent(payload.checkoutToken)}`
      await widgetsRef.current.requestPayment({
        orderId: payload.orderId,
        orderName: payload.orderName,
        successUrl: `${window.location.origin}/checkout/success?${checkoutQuery}`,
        failUrl: `${window.location.origin}/checkout/fail?${checkoutQuery}`,
        customerEmail: form.buyerEmail,
        customerName: form.buyerName,
        customerMobilePhone: form.buyerPhone.replace(/\D/g, ""),
        metadata: {
          mode: "business",
          amountCny: String(payload.amountCny),
          quoteCode: quoteCode?.code ?? "",
          promoCode: promo?.code ?? "",
        },
      })
    } catch (requestError) {
      console.error("[business-recharge] requestPayment error:", requestError)
      setError(
        requestError instanceof Error
          ? requestError.message
          : "결제 요청에 실패했습니다. 다시 시도해주세요."
      )
    } finally {
      setIsPreparing(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,400px)]">
      {/* LEFT — Recharge builder */}
      <section className="space-y-6">
        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="flex items-baseline justify-between">
            <p className="text-[13px] font-semibold text-[#111110]">충전 금액</p>
            <p className="text-[11px] text-[#7C8A83]">
              최초 10,000 · 추가 2,000 CNY 단위
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {BUSINESS_RECHARGE.presetsCny.map((amount) => {
              const active = selectedPresetCny === amount && !quoteCode
              return (
                <button
                  key={amount}
                  type="button"
                  disabled={Boolean(quoteCode)}
                  onClick={() => selectPreset(amount)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? "border-[#084734] bg-[#ECFDF5]"
                      : "border-black/10 bg-white hover:border-black/20"
                  } ${quoteCode ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <p className="text-[13px] font-semibold text-[#111110]">{formatCny(amount)}</p>
                  <p className="mt-0.5 text-[11px] text-[#7C8A83]">
                    ≈ {approxKrw(amount, fx.cnyKrw) ? formatKrw(approxKrw(amount, fx.cnyKrw) as number) : "-"}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="custom-cny" className="text-[12px] text-[#44514A]">
              직접 입력 (CNY)
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[#7C8A83]">
                ¥
              </span>
              <Input
                id="custom-cny"
                type="text"
                inputMode="numeric"
                value={customAmountInput}
                disabled={Boolean(quoteCode)}
                onChange={(event) => handleCustomInput(event.target.value)}
                onBlur={blurValidateCustom}
                className="h-10 rounded-lg border-black/10 bg-white pl-7"
                placeholder="10000"
              />
            </div>
            {amountError ? (
              <p className="text-[11px] text-[#B85C33]">{amountError}</p>
            ) : null}
          </div>
        </div>

        <CodeInputField
          title="견적서 코드"
          description="어드민에서 발급된 코드를 넣으면 지정 금액으로 고정됩니다."
          placeholder="QB-2026-XXXX"
          status={quoteStatus}
          onApply={handleApplyQuoteCode}
          onRemove={handleRemoveQuoteCode}
        />

        <CodeInputField
          title="프로모션 코드"
          description="유효한 코드를 넣으면 위 금액에서 즉시 차감됩니다."
          placeholder="PROMO-2026"
          status={promoStatus}
          onApply={handleApplyPromo}
          onRemove={handleRemovePromo}
        />

        <details className="group rounded-2xl border border-black/10 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[13px] font-semibold text-[#111110]">
            <span>요금 안내</span>
            <span className="text-[11px] font-normal text-[#7C8A83] transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="border-t border-black/5 px-5 pb-5 pt-4">
            <ul className="grid gap-1.5 text-[12px] text-[#44514A] md:grid-cols-2">
              {RATE_TABLE_ROWS.map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-3">
                  <span className="text-[#111110]">{row.label}</span>
                  <span className="text-[#615D59]">{row.price}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] leading-relaxed text-[#7C8A83]">
              학생이 10분 이하로 교실에 머무르면 과금되지 않고, 30분 이하 수업은 30분 기준으로 계산됩니다.
              수업 알림 SMS · 웹라이브 · 스토리지 초과분은 별도 요율로 차감됩니다.
            </p>
          </div>
        </details>
      </section>

      {/* RIGHT — Summary + form + widget */}
      <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7C8A83]">
            Order summary
          </p>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <p className="text-[15px] font-semibold text-[#111110]">
                {buildRechargeOrderName(effectiveFinalAmountCny || BUSINESS_RECHARGE.baseMinCny)}
              </p>
              <p className="mt-0.5 text-[12px] text-[#615D59]">
                {quoteCode ? `견적 ${quoteCode.code}` : "선충전"}
                {promo ? ` · 프로모 ${promo.code}` : ""}
              </p>
            </div>
            <p className="text-[28px] font-semibold tracking-tight text-[#111110]">
              {formatCny(effectiveFinalAmountCny || 0)}
            </p>
          </div>

          {promo ? (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-[#ECFDF5] px-3 py-2 text-[12px]">
              <span className="text-[#44514A]">충전 {formatCny(effectiveBaseAmountCny)}</span>
              <span className="font-semibold text-[#084734]">
                -{formatCny(promo.discountAmount)}
              </span>
            </div>
          ) : null}

          <div className="mt-4 border-t border-black/5 pt-3">
            <KrwConversionNote
              amountKrw={approxAmountKrw}
              fxRate={fx.cnyKrw}
              isStale={fx.isStale}
              loading={fx.loading}
            />
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-black/10 bg-white p-6">
          <p className="text-[13px] font-semibold text-[#111110]">주문자 정보</p>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="biz-organizationName" className="text-[12px] text-[#44514A]">
                기관명 / 학원명
              </Label>
              <Input
                id="biz-organizationName"
                value={form.organizationName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, organizationName: event.target.value }))
                }
                placeholder="예: 무궁화학원"
                className="h-10 rounded-lg border-black/10 bg-white"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="biz-buyerName" className="text-[12px] text-[#44514A]">
                  담당자명
                </Label>
                <Input
                  id="biz-buyerName"
                  value={form.buyerName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, buyerName: event.target.value }))
                  }
                  placeholder="홍길동"
                  className="h-10 rounded-lg border-black/10 bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-buyerPhone" className="text-[12px] text-[#44514A]">
                  연락처 <span className="text-[#A39E98]">(선택)</span>
                </Label>
                <Input
                  id="biz-buyerPhone"
                  value={form.buyerPhone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, buyerPhone: event.target.value }))
                  }
                  placeholder="01012345678"
                  className="h-10 rounded-lg border-black/10 bg-white"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-buyerEmail" className="text-[12px] text-[#44514A]">
                이메일
              </Label>
              <Input
                id="biz-buyerEmail"
                type="email"
                value={form.buyerEmail}
                onChange={(event) =>
                  setForm((current) => ({ ...current, buyerEmail: event.target.value }))
                }
                placeholder="ops@classin.co.kr"
                className="h-10 rounded-lg border-black/10 bg-white"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <p className="text-[13px] font-semibold text-[#111110]">결제수단</p>
          <p className="mt-1 text-[12px] text-[#615D59]">카드 · 네이버페이</p>

          <div
            id={TOSS_METHODS_ID}
            className="mt-4 min-h-[200px] rounded-lg border border-black/5 bg-[#FAFAF8]"
          />
          <div
            id={TOSS_AGREEMENT_ID}
            className="mt-3 min-h-[88px] rounded-lg border border-black/5 bg-[#FAFAF8]"
          />
        </div>

        {!checkoutEnabled || !hasWidgetKey ? (
          <div className="rounded-lg border border-[#EAD7B2] bg-[#FFF9EB] px-4 py-3 text-[12px] leading-relaxed text-[#8D6C1F]">
            {!checkoutEnabled
              ? "`NEXT_PUBLIC_SW_CHECKOUT_ENABLED=true` 설정 전까지 공개 결제는 비활성 상태입니다."
              : "토스 위젯 키가 없습니다. `.env.local`에 `NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY`를 설정해 주세요."}
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-[#EAD7B2] bg-[#FFF9EB] px-4 py-3 text-[13px] text-[#8D6C1F]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <Button
          type="button"
          size="lg"
          className="h-12 w-full rounded-lg bg-[#084734] text-[14px] font-semibold text-white hover:bg-[#065C41]"
          disabled={
            !hasWidgetKey ||
            !isWidgetReady ||
            isPreparing ||
            !isFormComplete ||
            !effectiveFinalAmountCny
          }
          onClick={() => {
            void handleCheckout()
          }}
        >
          {isPreparing
            ? "결제 준비 중..."
            : `${formatCny(effectiveFinalAmountCny || 0)} 충전하기`}
        </Button>
      </aside>
    </div>
  )
}
