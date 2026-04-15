"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ANONYMOUS, loadTossPayments, type TossPaymentsWidgets } from "@tosspayments/tosspayments-sdk"
import { AlertCircle, ArrowRight, CheckCircle2, CreditCard, Shield, Wallet } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  formatKrw,
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

const SELF_SERVE_PLANS = getSelfServePlans()
const DEFAULT_PLAN_ID: SelfServePlanId = "standard"
const DEFAULT_BILLING_CYCLE: BillingCycle = "monthly"

const EMPTY_FORM: CheckoutFormState = {
  organizationName: "",
  buyerName: "",
  buyerEmail: "",
  buyerPhone: "",
}

export function SoftwareCheckoutClient() {
  const [planId, setPlanId] = useState<SelfServePlanId>(DEFAULT_PLAN_ID)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(DEFAULT_BILLING_CYCLE)
  const [form, setForm] = useState<CheckoutFormState>(EMPTY_FORM)
  const [isWidgetReady, setIsWidgetReady] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const widgetsRef = useRef<TossPaymentsWidgets | null>(null)
  const paymentMethodWidgetRef = useRef<{ destroy: () => Promise<void> } | null>(null)
  const agreementWidgetRef = useRef<{ destroy: () => Promise<void> } | null>(null)

  const checkoutEnabled = isSoftwareCheckoutEnabled()
  const hasWidgetKey = hasTossWidgetClientKey()
  const selectedPlan = useMemo(
    () => SELF_SERVE_PLANS.find((plan) => plan.id === planId) ?? SELF_SERVE_PLANS[0],
    [planId]
  )
  const selectedPrice =
    billingCycle === "monthly" ? selectedPlan.monthly : selectedPlan.yearly

  useEffect(() => {
    if (!hasWidgetKey) return

    let cancelled = false

    async function mountWidget() {
      try {
        const tossPayments = await loadTossPayments(getTossWidgetClientKey())
        const widgets = tossPayments.widgets({ customerKey: ANONYMOUS })

        await widgets.setAmount({
          currency: "KRW",
          value: SELF_SERVE_PLANS[0].monthly.amount,
        })

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
        console.error("[checkout] widget mount error:", mountError)
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

  useEffect(() => {
    if (!widgetsRef.current) return

    void widgetsRef.current
      .setAmount({
        currency: "KRW",
        value: selectedPrice.amount,
      })
      .catch((amountError) => {
        console.error("[checkout] setAmount error:", amountError)
        setError("결제 금액을 갱신하지 못했습니다. 다시 시도해주세요.")
      })
  }, [selectedPrice.amount])

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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId,
          billingCycle,
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
          }
        | {
            error?: string
          }
        | null

      if (!response.ok || !payload || !("orderId" in payload)) {
        throw new Error(payload && "error" in payload ? payload.error : "주문 준비에 실패했습니다.")
      }

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
        },
      })
    } catch (requestError) {
      console.error("[checkout] requestPayment error:", requestError)
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
    <div className="bg-[#FDFCF8] text-slate-900">
      <section className="relative overflow-hidden border-b border-[#eadfd5] bg-[radial-gradient(circle_at_top,_rgba(224,80,36,0.12),_transparent_38%),linear-gradient(180deg,#fff8f2_0%,#fdfcf8_74%)]">
        <div className="container mx-auto px-4 py-16 md:px-8 md:py-24">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#f0d8ca] bg-white/90 px-4 py-1.5 text-sm font-semibold text-[#E05024]">
              <Wallet className="h-4 w-4" />
              Phase 1 Checkout
            </div>
            <h1 className="text-4xl font-serif leading-tight tracking-tight text-[#1a1a19] md:text-6xl">
              카드와 네이버페이로
              <br />
              바로 시작하는 소프트웨어 결제
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-500">
              토스 결제위젯 기반 1차 공개 결제 흐름입니다. 표준 카드결제와 네이버페이를
              같은 위젯 안에서 제공하고, 하드웨어/엔터프라이즈는 계속 상담형으로 분리합니다.
            </p>
          </div>
        </div>
      </section>

      <section className="container mx-auto grid gap-8 px-4 py-12 md:px-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-8">
          <Card className="overflow-hidden rounded-[28px] border-[#efe4da] shadow-[0_20px_50px_rgba(116,78,46,0.08)]">
            <CardHeader className="border-b border-[#f2e7de] bg-white/90">
              <CardTitle className="font-serif text-[30px]">플랜 선택</CardTitle>
              <CardDescription>
                self-serve 결제는 Standard / Plus만 열고, Enterprise는 계속 상담으로 보냅니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                {SELF_SERVE_PLANS.map((plan) => {
                  const active = plan.id === planId
                  const activePrice = billingCycle === "monthly" ? plan.monthly : plan.yearly

                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setPlanId(plan.id)}
                      className={`rounded-[24px] border p-5 text-left transition-all ${
                        active
                          ? "border-[#E05024] bg-[#fff7f2] shadow-[0_14px_30px_rgba(224,80,36,0.12)]"
                          : "border-[#eee5dd] bg-white hover:border-[#e8cbb8] hover:bg-[#fffaf7]"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#E05024]">
                          {plan.eyebrow}
                        </span>
                        {active && (
                          <span className="rounded-full bg-[#E05024] px-2.5 py-1 text-[11px] font-semibold text-white">
                            선택됨
                          </span>
                        )}
                      </div>
                      <h2 className="font-serif text-3xl text-[#1a1a19]">{plan.title}</h2>
                      <p className="mt-2 text-sm leading-relaxed text-slate-500">{plan.summary}</p>
                      <div className="mt-5 text-2xl font-bold text-[#1a1a19]">
                        {formatKrw(activePrice.amount)}
                        <span className="ml-2 text-sm font-medium text-slate-400">
                          / {billingCycle === "monthly" ? "월" : "년"}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="flex flex-wrap gap-3">
                {(["monthly", "yearly"] as BillingCycle[]).map((cycle) => {
                  const active = cycle === billingCycle

                  return (
                    <button
                      key={cycle}
                      type="button"
                      onClick={() => setBillingCycle(cycle)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                        active
                          ? "bg-[#084734] text-white"
                          : "bg-[#f5f0ea] text-[#5f5a54] hover:bg-[#ece3da]"
                      }`}
                    >
                      {cycle === "monthly" ? "월간 결제" : "연간 결제"}
                    </button>
                  )
                })}
              </div>

              <div className="rounded-[24px] border border-dashed border-[#eadfd5] bg-[#fffdfa] p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#084734]">
                  <CheckCircle2 className="h-4 w-4" />
                  현재 선택
                </div>
                <p className="text-lg font-semibold text-[#1a1a19]">
                  {selectedPlan.title} · {billingCycle === "monthly" ? "월간" : "연간"}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  결제수단은 카드와 네이버페이가 토스 결제위젯 안에서 함께 노출됩니다.
                </p>
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  {selectedPlan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#E05024]" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-[#efe4da] bg-[#fffaf6] shadow-none">
            <CardHeader>
              <CardTitle className="font-serif text-[28px]">Enterprise / 하드웨어</CardTitle>
              <CardDescription>
                맞춤 계약, 설치, 하드웨어 결합 고객은 기존 상담 흐름을 유지합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              <Link
                href="/contact#contact-form"
                className="inline-flex items-center gap-2 font-semibold text-[#E05024] hover:text-[#c9431a]"
              >
                맞춤 도입 상담으로 이동
                <ArrowRight className="h-4 w-4" />
              </Link>
              <span className="text-sm text-slate-400">하드웨어 파트너 연계는 별도 계약 흐름</span>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="rounded-[28px] border-[#efe4da] shadow-[0_20px_50px_rgba(116,78,46,0.08)]">
            <CardHeader className="border-b border-[#f2e7de] bg-white/90">
              <CardTitle className="font-serif text-[30px]">결제 정보</CardTitle>
              <CardDescription>
                결제 승인 전 최소 주문 정보만 받고, 결제 결과는 서버 confirm 단계에서 검증합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              {!checkoutEnabled && (
                <div className="rounded-2xl border border-[#f6d7c6] bg-[#fff4ee] px-4 py-3 text-sm text-[#b85c33]">
                  `NEXT_PUBLIC_SW_CHECKOUT_ENABLED=true` 설정 전까지 공개 CTA는 기존 문의 흐름을 유지합니다.
                </div>
              )}
              {!hasWidgetKey && (
                <div className="rounded-2xl border border-[#f6d7c6] bg-[#fff4ee] px-4 py-3 text-sm text-[#b85c33]">
                  토스 위젯 키가 없어 결제위젯은 아직 비활성 상태입니다. `.env.local`에
                  `NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY`를 넣어주세요.
                </div>
              )}

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="organizationName">기관명 / 학원명</Label>
                  <Input
                    id="organizationName"
                    value={form.organizationName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, organizationName: event.target.value }))
                    }
                    placeholder="예: 무궁화학원"
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyerPhone">연락처</Label>
                  <Input
                    id="buyerPhone"
                    value={form.buyerPhone}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, buyerPhone: event.target.value }))
                    }
                    placeholder="01012345678"
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
                  />
                </div>
              </div>

              <div className="rounded-[24px] border border-[#efe4da] bg-[#fcfbf8] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#084734]">토스 결제위젯</p>
                    <p className="mt-1 text-sm text-slate-500">
                      카드와 네이버페이가 같은 결제 UI에서 노출됩니다.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-[#eef7f3] px-3 py-1 text-xs font-semibold text-[#084734]">
                    <Shield className="h-3.5 w-3.5" />
                    서버 confirm 검증
                  </div>
                </div>
                <div
                  id="toss-payment-methods"
                  className="min-h-[260px] rounded-[20px] border border-dashed border-[#eadfd5] bg-white"
                />
                <div
                  id="toss-agreement"
                  className="mt-4 min-h-[120px] rounded-[20px] border border-dashed border-[#eadfd5] bg-white"
                />
              </div>

              <div className="rounded-[24px] bg-[#1b1b19] p-5 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.18em] text-white/45">Order Summary</p>
                    <h3 className="mt-2 text-2xl font-semibold">{selectedPlan.title}</h3>
                    <p className="mt-1 text-sm text-white/55">
                      {billingCycle === "monthly" ? "월간 청구" : "연간 선결제"}
                    </p>
                  </div>
                  <CreditCard className="mt-1 h-5 w-5 text-[#6EE7B7]" />
                </div>
                <div className="mt-6 flex items-end justify-between">
                  <div>
                    <p className="text-sm text-white/45">이번 결제 금액</p>
                    <p className="mt-1 text-4xl font-semibold tracking-tight">
                      {formatKrw(selectedPrice.amount)}
                    </p>
                  </div>
                  {selectedPrice.badge && (
                    <span className="rounded-full bg-[#26463b] px-3 py-1 text-xs font-semibold text-[#9de3c8]">
                      {selectedPrice.badge}
                    </span>
                  )}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-2xl border border-[#f6d7c6] bg-[#fff4ee] px-4 py-3 text-sm text-[#b85c33]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="button"
                size="xl"
                className="h-14 w-full rounded-full bg-[#E05024] text-base font-bold hover:bg-[#c9431a]"
                disabled={!hasWidgetKey || !isWidgetReady || isPreparing}
                onClick={() => {
                  void handleCheckout()
                }}
              >
                {isPreparing ? "결제 준비 중..." : `${formatKrw(selectedPrice.amount)} 결제하기`}
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
