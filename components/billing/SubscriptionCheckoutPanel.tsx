"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ANONYMOUS, loadTossPayments, type TossPaymentsWidgets } from "@tosspayments/tosspayments-sdk"
import { AlertCircle, ArrowRight, Wallet } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AccountCountStepper } from "@/components/billing/AccountCountStepper"
import { KrwConversionNote } from "@/components/billing/KrwConversionNote"
import {
  DEFAULT_ACCOUNT_COUNT,
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
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | {
            orderId: string
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

      await widgetsRef.current.requestPayment({
        orderId: payload.orderId,
        orderName: payload.orderName,
        successUrl: `${window.location.origin}/checkout/success`,
        failUrl: `${window.location.origin}/checkout/fail`,
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
    <div className="grid gap-6 lg:min-h-[calc(100vh-8rem)] lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,420px)]">
      <Card className="overflow-hidden rounded-[32px] border-[rgba(8,71,52,0.08)] bg-white/90 shadow-[0_24px_70px_rgba(8,71,52,0.08)] backdrop-blur lg:max-h-[calc(100vh-8rem)]">
        <div className="flex h-full flex-col lg:overflow-y-auto">
          <CardContent className="grid gap-4 px-5 py-5 md:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="inline-flex w-fit gap-2 rounded-full bg-[#F1F5F2] p-1">
                {(["monthly", "yearly"] as BillingCycle[]).map((cycle) => {
                  const active = cycle === billingCycle

                  return (
                    <button
                      key={cycle}
                      type="button"
                      onClick={() => setBillingCycle(cycle)}
                      className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all ${
                        active
                          ? "bg-[#084734] text-white shadow-[0_8px_20px_rgba(8,71,52,0.18)]"
                          : "text-[#66726B] hover:bg-white hover:text-[#084734]"
                      }`}
                    >
                      {cycle === "monthly" ? "월간 결제" : "연간 결제"}
                    </button>
                  )
                })}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-[#44514A]">계정 수</span>
                <AccountCountStepper value={accountCount} onChange={setAccountCount} />
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              {SELF_SERVE_PLANS.map((plan) => {
                const active = plan.id === planId
                const activePrice = billingCycle === "monthly" ? plan.monthly : plan.yearly

                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setPlanId(plan.id)}
                    className={`rounded-[24px] border p-4 text-left transition-all ${
                      active
                        ? "border-[#084734]/20 bg-[#ECFDF5] shadow-[0_18px_30px_rgba(8,71,52,0.09)]"
                        : "border-[rgba(0,0,0,0.07)] bg-white hover:border-[#084734]/15 hover:bg-[#F8FBF9]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="inline-flex rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#084734]">
                          {plan.eyebrow}
                        </span>
                        <h2 className="mt-2.5 text-[24px] font-semibold leading-none tracking-tight text-[#111110]">
                          {plan.title}
                        </h2>
                      </div>
                      {active ? (
                        <span className="rounded-full bg-[#084734] px-2.5 py-1 text-[11px] font-semibold text-white">
                          선택됨
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-3 text-[13px] leading-5 text-[#615D59]">{plan.summary}</p>

                    <div className="mt-4 flex items-end gap-2">
                      <p className="text-[26px] font-semibold tracking-tight text-[#111110]">
                        {formatUsd(activePrice.amount)}
                      </p>
                      <p className="pb-0.5 text-xs font-medium text-[#7D7871]">
                        {activePrice.unitSuffix}
                      </p>
                    </div>

                    {activePrice.badge ? (
                      <div className="mt-2.5 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#084734]">
                        {activePrice.badge}
                      </div>
                    ) : null}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#0E1814] px-4 py-3">
              <p className="text-sm text-white/80">
                <span className="font-semibold text-white">Enterprise</span>
                <span className="mx-1.5 text-white/30">·</span>
                맞춤 계약이 필요하면
              </p>
              <Link
                href="/contact#contact-form"
                className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[#9DE3C8] hover:text-[#C7F3E1]"
              >
                상담 요청
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardContent>
        </div>
      </Card>

      <Card className="overflow-hidden rounded-[32px] border-[rgba(8,71,52,0.08)] bg-white/95 shadow-[0_24px_70px_rgba(8,71,52,0.09)] backdrop-blur lg:max-h-[calc(100vh-8rem)]">
        <div className="flex h-full flex-col lg:overflow-y-auto">
          <div className="flex items-center justify-between gap-3 border-b border-[rgba(8,71,52,0.08)] bg-white/95 px-6 py-3.5">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#084734]">
              <Wallet className="h-4 w-4" />
              결제 정보
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <span className="font-semibold text-[#111110]">{selectedPlan.title} · {accountCount}계정</span>
              <span className="font-bold text-[#084734]">{formatUsd(amountUsd)}</span>
            </div>
          </div>

          <CardContent className="space-y-3 px-6 py-4">
            {!checkoutEnabled && (
              <div className="rounded-2xl border border-[#EAD7B2] bg-[#FFF9EB] px-4 py-3 text-sm text-[#8D6C1F]">
                `NEXT_PUBLIC_SW_CHECKOUT_ENABLED=true` 설정 전까지 공개 CTA는 기존 문의 흐름을 유지합니다.
              </div>
            )}
            {!hasWidgetKey && (
              <div className="rounded-2xl border border-[#EAD7B2] bg-[#FFF9EB] px-4 py-3 text-sm text-[#8D6C1F]">
                토스 위젯 키가 없어 결제위젯은 아직 비활성 상태입니다. `.env.local`에
                `NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY`를 넣어주세요.
              </div>
            )}

            <div className="rounded-[28px] border border-[rgba(8,71,52,0.08)] bg-[#F8FBF9] p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#084734]">주문자 정보</p>
                  <p className="mt-1 text-xs text-[#66726B]">기관명, 담당자명, 이메일만 필수입니다.</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#084734]">
                  {isFormComplete ? "입력 완료" : "필수 3개"}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="organizationName">기관명 / 학원명</Label>
                  <Input
                    id="organizationName"
                    value={form.organizationName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, organizationName: event.target.value }))
                    }
                    placeholder="예: 무궁화학원"
                    className="h-11 rounded-2xl border-[rgba(8,71,52,0.08)] bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyerName">담당자명</Label>
                  <Input
                    id="buyerName"
                    value={form.buyerName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, buyerName: event.target.value }))
                    }
                    placeholder="홍길동"
                    className="h-11 rounded-2xl border-[rgba(8,71,52,0.08)] bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyerPhone">연락처 (선택)</Label>
                  <Input
                    id="buyerPhone"
                    value={form.buyerPhone}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, buyerPhone: event.target.value }))
                    }
                    placeholder="01012345678"
                    className="h-11 rounded-2xl border-[rgba(8,71,52,0.08)] bg-white"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="buyerEmail">이메일</Label>
                  <Input
                    id="buyerEmail"
                    type="email"
                    value={form.buyerEmail}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, buyerEmail: event.target.value }))
                    }
                    placeholder="ops@classin.co.kr"
                    className="h-11 rounded-2xl border-[rgba(8,71,52,0.08)] bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[rgba(8,71,52,0.08)] bg-white p-3">
              <div
                id="toss-payment-methods"
                className="min-h-[140px] rounded-xl border border-dashed border-[#DBE7E1] bg-[#FAFAF8]"
              />
              <div
                id="toss-agreement"
                className="mt-2 min-h-[50px] rounded-xl border border-dashed border-[#DBE7E1] bg-[#FAFAF8]"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-2xl border border-[#EAD7B2] bg-[#FFF9EB] px-4 py-3 text-sm text-[#8D6C1F]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <KrwConversionNote
              amountKrw={approxAmountKrw}
              fxRate={fx.rate}
              isStale={fx.isStale}
              loading={fx.loading}
            />

            <Button
              type="button"
              size="xl"
              className="h-14 w-full rounded-full bg-[#084734] text-base font-bold text-white shadow-[0_14px_36px_rgba(8,71,52,0.18)] hover:bg-[#065C41]"
              disabled={!hasWidgetKey || !isWidgetReady || isPreparing || !isFormComplete}
              onClick={() => {
                void handleCheckout()
              }}
            >
              {isPreparing ? "결제 준비 중..." : `${formatUsd(amountUsd)} 결제하기`}
            </Button>
          </CardContent>
        </div>
      </Card>
    </div>
  )
}
