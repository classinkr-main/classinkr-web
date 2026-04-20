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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,380px)]">
      {/* ── 왼쪽: 플랜 선택 (세로 배치) ── */}
      <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-5 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex gap-2">
            {(["monthly", "yearly"] as BillingCycle[]).map((cycle) => {
              const active = cycle === billingCycle
              return (
                <button
                  key={cycle}
                  type="button"
                  onClick={() => setBillingCycle(cycle)}
                  className={`rounded-lg border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                    active
                      ? "border-[#084734] text-[#084734]"
                      : "border-[rgba(0,0,0,0.08)] text-[#66726B] hover:border-[#084734]/30"
                  }`}
                >
                  {cycle === "monthly" ? "월간" : "연간"}
                </button>
              )
            })}
          </div>
          <AccountCountStepper value={accountCount} onChange={setAccountCount} />
        </div>

        <div className="mt-4 grid gap-3">
          {SELF_SERVE_PLANS.map((plan) => {
            const active = plan.id === planId
            const activePrice = billingCycle === "monthly" ? plan.monthly : plan.yearly
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setPlanId(plan.id)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? "border-2 border-[#084734] bg-white"
                    : "border border-[rgba(0,0,0,0.08)] bg-white hover:border-[#084734]/30"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-[#111110]">{plan.title}</h2>
                  {active ? (
                    <span className="rounded-md border border-[#084734] px-2 py-0.5 text-[11px] font-semibold text-[#084734]">
                      선택됨
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <p className="text-2xl font-semibold tracking-tight text-[#111110]">
                    {formatUsd(activePrice.amount)}
                  </p>
                  <p className="pb-0.5 text-xs text-[#7D7871]">{activePrice.unitSuffix}</p>
                </div>
                {activePrice.badge ? (
                  <span className="mt-1.5 inline-block rounded-md border border-[#084734]/20 px-2 py-0.5 text-[11px] font-semibold text-[#084734]">
                    {activePrice.badge}
                  </span>
                ) : null}
                {plan.limits || plan.features ? (
                  <div className="mt-3 grid gap-x-6 gap-y-1 border-t border-[rgba(0,0,0,0.06)] pt-3 sm:grid-cols-2">
                    {plan.limits?.map((item) => (
                      <div key={item} className="flex items-start gap-2 text-[12px] text-[#44514A]">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#084734]/40" />
                        {item}
                      </div>
                    ))}
                    {plan.features?.map((item) => (
                      <div key={item} className="flex items-start gap-2 text-[12px] text-[#7C8A83]">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[rgba(0,0,0,0.1)]" />
                        {item}
                      </div>
                    ))}
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="mt-3 rounded-xl border border-[rgba(0,0,0,0.08)] p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#111110]">Enterprise</h2>
            <Link
              href="/contact#contact-form"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#084734] px-2 py-0.5 text-[11px] font-semibold text-[#084734] hover:underline"
            >
              상담 요청
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-2 flex items-end gap-2">
            <p className="text-2xl font-semibold tracking-tight text-[#111110]">맞춤 견적</p>
            <p className="pb-0.5 text-xs text-[#7D7871]">/ 계정 / 월</p>
          </div>
          <p className="mt-3 border-t border-[rgba(0,0,0,0.06)] pt-3 text-[12px] font-semibold text-[#111110]">Plus의 모든 기능 포함, 추가로:</p>
          <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {[
              "1회 수업 최대 24시간",
              "수업당 최대 2,000명 참여",
              "웹 스트리밍",
              "API 연동",
              "클라우드 스토리지 1,024GB",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2 text-[12px] text-[#44514A]">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#084734]/40" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 오른쪽: 결제 정보 ── */}
      <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3">
          <span className="text-sm font-semibold text-[#111110]">결제 정보</span>
          <span className="text-sm font-bold text-[#084734]">{selectedPlan.title} · {accountCount}계정 · {formatUsd(amountUsd)}</span>
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
                <Label htmlFor="organizationName" className="text-xs">기관명 / 학원명</Label>
                <Input
                  id="organizationName"
                  value={form.organizationName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, organizationName: event.target.value }))
                  }
                  placeholder="무궁화학원"
                  className="h-10 rounded-lg border-[rgba(0,0,0,0.08)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="buyerName" className="text-xs">담당자명</Label>
                <Input
                  id="buyerName"
                  value={form.buyerName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, buyerName: event.target.value }))
                  }
                  placeholder="홍길동"
                  className="h-10 rounded-lg border-[rgba(0,0,0,0.08)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="buyerPhone" className="text-xs">연락처 (선택)</Label>
                <Input
                  id="buyerPhone"
                  value={form.buyerPhone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, buyerPhone: event.target.value }))
                  }
                  placeholder="01012345678"
                  className="h-10 rounded-lg border-[rgba(0,0,0,0.08)]"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="buyerEmail" className="text-xs">이메일</Label>
                <Input
                  id="buyerEmail"
                  type="email"
                  value={form.buyerEmail}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, buyerEmail: event.target.value }))
                  }
                  placeholder="ops@classin.co.kr"
                  className="h-10 rounded-lg border-[rgba(0,0,0,0.08)]"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[rgba(0,0,0,0.08)] p-3">
            <div
              id="toss-payment-methods"
              className="min-h-[140px] rounded-lg border border-dashed border-[rgba(0,0,0,0.08)]"
            />
            <div
              id="toss-agreement"
              className="mt-2 min-h-[50px] rounded-lg border border-dashed border-[rgba(0,0,0,0.08)]"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-[#EAD7B2] px-3 py-2 text-sm text-[#8D6C1F]">
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
            className="h-12 w-full rounded-lg border-2 border-[#084734] bg-[#084734] text-sm font-bold text-white hover:bg-[#065C41]"
            disabled={!hasWidgetKey || !isWidgetReady || isPreparing || !isFormComplete}
            onClick={() => {
              void handleCheckout()
            }}
          >
            {isPreparing ? "결제 준비 중..." : `${formatUsd(amountUsd)} 결제하기`}
          </Button>
        </div>
      </div>
    </div>
  )
}
