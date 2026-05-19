"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ANONYMOUS, loadTossPayments, type TossPaymentsWidgets } from "@tosspayments/tosspayments-sdk"
import { AlertCircle, ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AccountCountStepper } from "@/components/billing/AccountCountStepper"
import { KrwConversionNote } from "@/components/billing/KrwConversionNote"
import {
  DEFAULT_ACCOUNT_COUNT,
  SOFTWARE_PLANS,
  clampAccountCount,
  computeSubscriptionAmountUsd,
  formatUsd,
  getSelfServePlans,
  type BillingCycle,
  type SelfServePlanId,
} from "@/lib/billing/plans"
import {
  getTossWidgetClientKey,
  hasTossWidgetClientKey,
  isSoftwareCheckoutEnabled,
} from "@/lib/billing/public-env"
import { trackEvent } from "@/lib/analytics"
import { collectLeadAttribution } from "@/lib/submitLead"

type CheckoutFormState = {
  organizationName: string
  buyerName: string
  buyerEmail: string
  buyerPhone: string
}

type FxState = {
  rate: number | null
  fetchedAt: string | null
  source: string | null
  isStale: boolean
  loading: boolean
  error: string | null
}

const SELF_SERVE_PLANS = getSelfServePlans()
const ENTERPRISE_PLAN = SOFTWARE_PLANS.find((plan) => plan.id === "enterprise") ?? null
const DEFAULT_PLAN_ID: SelfServePlanId = "standard"
const DEFAULT_BILLING_CYCLE: BillingCycle = "monthly"

const EMPTY_FORM: CheckoutFormState = {
  organizationName: "",
  buyerName: "",
  buyerEmail: "",
  buyerPhone: "",
}

function approxKrw(amountUsd: number, rate: number | null) {
  if (!rate || rate <= 0) return null
  return Math.round(amountUsd * rate)
}

export function SubscriptionCheckoutPanel() {
  const [planId, setPlanId] = useState<SelfServePlanId>(DEFAULT_PLAN_ID)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(DEFAULT_BILLING_CYCLE)
  const [accountCount, setAccountCount] = useState<number>(DEFAULT_ACCOUNT_COUNT)
  const [form, setForm] = useState<CheckoutFormState>(EMPTY_FORM)
  const [isWidgetReady, setIsWidgetReady] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fx, setFx] = useState<FxState>({
    rate: null,
    fetchedAt: null,
    source: null,
    isStale: false,
    loading: true,
    error: null,
  })

  const widgetsRef = useRef<TossPaymentsWidgets | null>(null)
  const paymentMethodWidgetRef = useRef<{ destroy: () => Promise<void> } | null>(null)
  const agreementWidgetRef = useRef<{ destroy: () => Promise<void> } | null>(null)

  const checkoutEnabled = isSoftwareCheckoutEnabled()
  const hasWidgetKey = hasTossWidgetClientKey()

  const selectedPlan = useMemo(
    () => SELF_SERVE_PLANS.find((plan) => plan.id === planId) ?? SELF_SERVE_PLANS[0],
    [planId]
  )
  const selectedPrice = billingCycle === "monthly" ? selectedPlan.monthly : selectedPlan.yearly
  const amountUsd = useMemo(
    () => computeSubscriptionAmountUsd(selectedPlan.id, billingCycle, accountCount),
    [selectedPlan.id, billingCycle, accountCount]
  )
  const approxAmountKrw = useMemo(() => approxKrw(amountUsd, fx.rate), [amountUsd, fx.rate])
  const isFormComplete = Boolean(
    form.organizationName.trim() && form.buyerName.trim() && form.buyerEmail.trim()
  )

  // FX 초기 로드
  useEffect(() => {
    let cancelled = false

    async function loadFx() {
      try {
        const response = await fetch("/api/billing/fx", { cache: "no-store" })
        if (!response.ok) throw new Error("환율 조회 실패")
        const payload = (await response.json()) as {
          rate: number
          fetchedAt: string
          source: string
          isStale: boolean
        }
        if (cancelled) return
        setFx({
          rate: payload.rate,
          fetchedAt: payload.fetchedAt,
          source: payload.source,
          isStale: Boolean(payload.isStale),
          loading: false,
          error: null,
        })
      } catch (fxError) {
        if (cancelled) return
        setFx((prev) => ({
          ...prev,
          loading: false,
          error:
            fxError instanceof Error
              ? fxError.message
              : "환율을 가져오지 못했습니다.",
        }))
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

        // 초기 amount 는 임시로 최소 플랜의 대략 환산값. mount 후 setAmount 로 재반영.
        const initialUsd = SELF_SERVE_PLANS[0].monthly.amount
        await widgets.setAmount({ currency: "KRW", value: Math.max(initialUsd * 1400, 1) })

        const paymentMethodWidget = await widgets.renderPaymentMethods({
          selector: "#toss-payment-methods",
        })
        const agreementWidget = await widgets.renderAgreement({
          selector: "#toss-agreement",
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
        console.error("[subscription-checkout] widget mount error:", mountError)
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

  // 금액 변경 시 위젯 setAmount 갱신 (미리보기용 KRW)
  useEffect(() => {
    if (!widgetsRef.current) return
    if (!approxAmountKrw) return

    void widgetsRef.current
      .setAmount({ currency: "KRW", value: approxAmountKrw })
      .catch((amountError) => {
        console.error("[subscription-checkout] setAmount error:", amountError)
      })
  }, [approxAmountKrw])

  async function handleCheckout() {
    if (!checkoutEnabled) {
      setError("공개 결제는 아직 활성화되지 않았습니다. 환경 설정 후 다시 시도해주세요.")
      return
    }

    if (!widgetsRef.current) {
      setError("결제위젯 준비가 아직 끝나지 않았습니다.")
      return
    }

    setIsPreparing(true)
    setError(null)

    try {
      const response = await fetch("/api/billing/checkout/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "subscription",
          planId,
          billingCycle,
          accountCount: clampAccountCount(accountCount),
          organizationName: form.organizationName,
          buyerName: form.buyerName,
          buyerEmail: form.buyerEmail,
          buyerPhone: form.buyerPhone,
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
            amountUsd: number
            fxRate: number
            fxFetchedAt: string
          }
        | { error?: string }
        | null

      if (!response.ok || !payload || !("orderId" in payload)) {
        throw new Error(payload && "error" in payload ? payload.error : "주문 준비에 실패했습니다.")
      }

      // 서버가 확정한 KRW 금액을 위젯에 재반영 (환율 불일치 방지)
      await widgetsRef.current.setAmount({ currency: "KRW", value: payload.amountKrw })

      trackEvent("begin_checkout", {
        mode: "subscription",
        plan_id: planId,
        billing_cycle: billingCycle,
        account_count: clampAccountCount(accountCount),
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
          planId,
          billingCycle,
          accountCount: String(accountCount),
          amountUsd: String(payload.amountUsd),
        },
      })
    } catch (requestError) {
      console.error("[subscription-checkout] requestPayment error:", requestError)
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
      {/* LEFT — Plan builder */}
      <section className="space-y-6">
        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div role="tablist" aria-label="결제 주기" className="inline-flex rounded-lg bg-[#F6F5F4] p-1">
              {(["monthly", "yearly"] as BillingCycle[]).map((cycle) => {
                const active = cycle === billingCycle
                return (
                  <button
                    key={cycle}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setBillingCycle(cycle)}
                    className={`rounded-md px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                      active
                        ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                        : "text-[#7C8A83] hover:text-[#44514A]"
                    }`}
                  >
                    {cycle === "monthly" ? "월간" : "연간"}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[13px] font-medium text-[#44514A]">계정 수</span>
              <AccountCountStepper value={accountCount} onChange={setAccountCount} />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {SELF_SERVE_PLANS.map((plan) => {
            const active = plan.id === planId
            const activePrice = billingCycle === "monthly" ? plan.monthly : plan.yearly

            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setPlanId(plan.id)}
                className={`rounded-2xl border p-5 text-left transition-colors ${
                  active
                    ? "border-[#084734] bg-white ring-1 ring-[#084734]"
                    : "border-black/10 bg-white hover:border-black/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7C8A83]">
                    {plan.eyebrow}
                  </p>
                  {active ? (
                    <span className="rounded-full bg-[#084734] px-2 py-0.5 text-[10px] font-semibold text-white">
                      선택됨
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-2 text-[22px] font-semibold tracking-tight text-[#111110]">
                  {plan.title}
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-[#615D59]">{plan.summary}</p>
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-[26px] font-semibold tracking-tight text-[#111110]">
                    {formatUsd(activePrice.amount)}
                  </span>
                  <span className="text-[12px] text-[#7C8A83]">{activePrice.unitSuffix}</span>
                </div>
                {activePrice.badge ? (
                  <p className="mt-2 text-[11px] font-medium text-[#084734]">{activePrice.badge}</p>
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-5">
          <p className="text-[13px] font-semibold text-[#111110]">포함 기능</p>
          <ul className="mt-3 grid gap-1.5 text-[13px] text-[#44514A] sm:grid-cols-2">
            {selectedPlan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#084734]" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {ENTERPRISE_PLAN ? (
          <Link
            href="/contact#contact-form"
            className="group flex items-center justify-between rounded-2xl border border-black/10 bg-white px-5 py-4 transition-colors hover:border-black/20"
          >
            <div>
              <p className="text-[13px] font-semibold text-[#111110]">{ENTERPRISE_PLAN.title}</p>
              <p className="mt-0.5 text-[12px] text-[#615D59]">맞춤 계약 · 설치 · 하드웨어 연동</p>
            </div>
            <ArrowRight className="h-4 w-4 text-[#084734] transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : null}
      </section>

      {/* RIGHT — Summary + form + widget */}
      <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7C8A83]">
            Order summary
          </p>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <p className="text-[15px] font-semibold text-[#111110]">{selectedPlan.title}</p>
              <p className="mt-0.5 text-[12px] text-[#615D59]">
                {billingCycle === "monthly" ? "월간" : "연간"} · {accountCount}계정
              </p>
            </div>
            <div className="text-right">
              <p className="text-[28px] font-semibold tracking-tight text-[#111110]">
                {formatUsd(amountUsd)}
              </p>
              {selectedPrice.badge ? (
                <p className="mt-0.5 text-[11px] font-medium text-[#084734]">
                  {selectedPrice.badge}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-4 border-t border-black/5 pt-3">
            <KrwConversionNote
              amountKrw={approxAmountKrw}
              fxRate={fx.rate}
              isStale={fx.isStale}
              loading={fx.loading}
            />
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-black/10 bg-white p-6">
          <p className="text-[13px] font-semibold text-[#111110]">주문자 정보</p>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="organizationName" className="text-[12px] text-[#44514A]">
                기관명 / 학원명
              </Label>
              <Input
                id="organizationName"
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
                <Label htmlFor="buyerName" className="text-[12px] text-[#44514A]">
                  담당자명
                </Label>
                <Input
                  id="buyerName"
                  value={form.buyerName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, buyerName: event.target.value }))
                  }
                  placeholder="홍길동"
                  className="h-10 rounded-lg border-black/10 bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="buyerPhone" className="text-[12px] text-[#44514A]">
                  연락처 <span className="text-[#A39E98]">(선택)</span>
                </Label>
                <Input
                  id="buyerPhone"
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
              <Label htmlFor="buyerEmail" className="text-[12px] text-[#44514A]">
                이메일
              </Label>
              <Input
                id="buyerEmail"
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
            id="toss-payment-methods"
            className="mt-4 min-h-[200px] rounded-lg border border-black/5 bg-[#FAFAF8]"
          />
          <div
            id="toss-agreement"
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
          disabled={!hasWidgetKey || !isWidgetReady || isPreparing || !isFormComplete}
          onClick={() => {
            void handleCheckout()
          }}
        >
          {isPreparing ? "결제 준비 중..." : `${formatUsd(amountUsd)} 결제하기`}
        </Button>
      </aside>
    </div>
  )
}
