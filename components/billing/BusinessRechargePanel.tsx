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
  formatCny,
  validateRechargeAmount,
} from "@/lib/billing/recharge"
import { formatKrw } from "@/lib/billing/plans"
import {
  getTossWidgetClientKey,
  hasTossWidgetClientKey,
  isSoftwareCheckoutEnabled,
} from "@/lib/billing/public-env"

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

const RATE_TABLE_ROWS: Array<{ label: string; detail: string; price: string }> = [
  { label: "1v0", detail: "기본 1:다", price: "1 CNY / 1명 / 1시간" },
  { label: "1v1", detail: "1:1 강의", price: "2 CNY / 1명 / 1시간" },
  { label: "1v2 ~ 1v12", detail: "소그룹", price: "4 CNY / 1명 / 1시간" },
  { label: "1v1 듀얼 카메라", detail: "수업 + 카메라 동시", price: "8 CNY / 1명 / 1시간" },
  { label: "1v1 HD / 1v6 HD", detail: "HD 화질", price: "4 / 12 CNY" },
  { label: "1v1 FHD / 1v6 FHD", detail: "FHD 화질", price: "8 / 20 CNY" },
  { label: "조교 (기본/HD/FHD)", detail: "회당/인당", price: "6 / 10 / 20 CNY" },
  { label: "녹화 (단일/듀얼)", detail: "1시간 기준", price: "2 / 4 CNY" },
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
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | {
            orderId: string
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

      await widgetsRef.current.requestPayment({
        orderId: payload.orderId,
        orderName: payload.orderName,
        successUrl: `${window.location.origin}/checkout/success`,
        failUrl: `${window.location.origin}/checkout/fail`,
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
    <div className="grid gap-4 lg:min-h-[calc(100vh-8rem)] lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,400px)]">
      {/* ── 왼쪽: 충전 설정 ── */}
      <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white lg:max-h-[calc(100vh-8rem)]">
        <div className="flex h-full flex-col lg:overflow-y-auto">
          <div className="grid gap-4 p-5">
            <div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {BUSINESS_RECHARGE.presetsCny.map((amount) => {
                  const active = selectedPresetCny === amount && !quoteCode
                  return (
                    <button
                      key={amount}
                      type="button"
                      disabled={Boolean(quoteCode)}
                      onClick={() => selectPreset(amount)}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? "border-2 border-[#084734] bg-white"
                          : "border border-[rgba(0,0,0,0.08)] bg-white hover:border-[#084734]/30"
                      } ${quoteCode ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <p className="text-sm font-semibold text-[#111110]">{formatCny(amount)}</p>
                      <p className="mt-0.5 text-[11px] text-[#7C8A83]">
                        ≈ {approxKrw(amount, fx.cnyKrw) ? formatKrw(approxKrw(amount, fx.cnyKrw) as number) : "-"}
                      </p>
                    </button>
                  )
                })}
              </div>

              <div className="mt-3">
                <Label htmlFor="custom-cny" className="text-xs text-[#44514A]">직접 입력 (CNY)</Label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#7C8A83]">¥</span>
                  <Input
                    id="custom-cny"
                    type="text"
                    inputMode="numeric"
                    value={customAmountInput}
                    disabled={Boolean(quoteCode)}
                    onChange={(event) => handleCustomInput(event.target.value)}
                    onBlur={blurValidateCustom}
                    className="h-10 rounded-lg border-[rgba(0,0,0,0.08)] pl-7 text-sm"
                    placeholder="10000"
                  />
                </div>
                {amountError ? <p className="mt-1 text-[11px] text-[#B85C33]">{amountError}</p> : null}
              </div>
            </div>

            <CodeInputField
              title="견적서 코드"
              description=""
              placeholder="QB-2026-XXXX"
              status={quoteStatus}
              onApply={handleApplyQuoteCode}
              onRemove={handleRemoveQuoteCode}
            />

            <CodeInputField
              title="프로모션 코드"
              description=""
              placeholder="PROMO-2026"
              status={promoStatus}
              onApply={handleApplyPromo}
              onRemove={handleRemovePromo}
            />

            <div className="rounded-xl border border-[rgba(0,0,0,0.08)] p-4">
              <p className="text-xs font-semibold text-[#111110]">과금 기준</p>
              <ul className="mt-2 grid gap-1 text-[11px] text-[#44514A] md:grid-cols-2">
                {RATE_TABLE_ROWS.map((row) => (
                  <li key={row.label} className="flex justify-between gap-2 border-b border-[rgba(0,0,0,0.04)] py-1.5 last:border-0">
                    <span className="font-medium text-[#111110]">{row.label}</span>
                    <span className="text-[#084734]">{row.price}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── 오른쪽: 결제 ── */}
      <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white lg:max-h-[calc(100vh-8rem)]">
        <div className="flex h-full flex-col lg:overflow-y-auto">
          <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3">
            <span className="text-sm font-semibold text-[#111110]">결제 정보</span>
            <span className="text-sm font-bold text-[#084734]">{formatCny(effectiveFinalAmountCny || 0)}</span>
          </div>

          <div className="space-y-3 p-5">
            {!checkoutEnabled && (
              <div className="rounded-lg border border-[#EAD7B2] px-3 py-2 text-xs text-[#8D6C1F]">
                NEXT_PUBLIC_SW_CHECKOUT_ENABLED=true 설정 필요
              </div>
            )}
            {!hasWidgetKey && (
              <div className="rounded-lg border border-[#EAD7B2] px-3 py-2 text-xs text-[#8D6C1F]">
                TOSS_WIDGET_CLIENT_KEY 설정 필요
              </div>
            )}

            <div className="rounded-xl border border-[rgba(0,0,0,0.08)] p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="biz-organizationName" className="text-xs">기관명 / 학원명</Label>
                  <Input
                    id="biz-organizationName"
                    value={form.organizationName}
                    onChange={(event) => setForm((c) => ({ ...c, organizationName: event.target.value }))}
                    placeholder="무궁화학원"
                    className="h-10 rounded-lg border-[rgba(0,0,0,0.08)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="biz-buyerName" className="text-xs">담당자명</Label>
                  <Input
                    id="biz-buyerName"
                    value={form.buyerName}
                    onChange={(event) => setForm((c) => ({ ...c, buyerName: event.target.value }))}
                    placeholder="홍길동"
                    className="h-10 rounded-lg border-[rgba(0,0,0,0.08)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="biz-buyerPhone" className="text-xs">연락처 (선택)</Label>
                  <Input
                    id="biz-buyerPhone"
                    value={form.buyerPhone}
                    onChange={(event) => setForm((c) => ({ ...c, buyerPhone: event.target.value }))}
                    placeholder="01012345678"
                    className="h-10 rounded-lg border-[rgba(0,0,0,0.08)]"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="biz-buyerEmail" className="text-xs">이메일</Label>
                  <Input
                    id="biz-buyerEmail"
                    type="email"
                    value={form.buyerEmail}
                    onChange={(event) => setForm((c) => ({ ...c, buyerEmail: event.target.value }))}
                    placeholder="ops@classin.co.kr"
                    className="h-10 rounded-lg border-[rgba(0,0,0,0.08)]"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[rgba(0,0,0,0.08)] p-3">
              <div
                id={TOSS_METHODS_ID}
                className="min-h-[140px] rounded-lg border border-dashed border-[rgba(0,0,0,0.08)]"
              />
              <div
                id={TOSS_AGREEMENT_ID}
                className="mt-2 min-h-[50px] rounded-lg border border-dashed border-[rgba(0,0,0,0.08)]"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-[#EAD7B2] px-3 py-2 text-sm text-[#8D6C1F]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {promo ? (
              <div className="flex items-center justify-between rounded-lg border border-[#084734]/20 px-3 py-2 text-sm">
                <span className="text-[#44514A]">{formatCny(effectiveBaseAmountCny)} → -{formatCny(promo.discountAmount)}</span>
                <span className="font-bold text-[#084734]">{formatCny(effectiveFinalAmountCny || 0)}</span>
              </div>
            ) : null}

            <KrwConversionNote
              amountKrw={approxAmountKrw}
              fxRate={fx.cnyKrw}
              isStale={fx.isStale}
              loading={fx.loading}
            />

            <Button
              type="button"
              className="h-12 w-full rounded-lg border-2 border-[#084734] bg-[#084734] text-sm font-bold text-white hover:bg-[#065C41]"
              disabled={!hasWidgetKey || !isWidgetReady || isPreparing || !isFormComplete || !effectiveFinalAmountCny}
              onClick={() => { void handleCheckout() }}
            >
              {isPreparing ? "결제 준비 중..." : `${formatCny(effectiveFinalAmountCny || 0)} 충전하기`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
