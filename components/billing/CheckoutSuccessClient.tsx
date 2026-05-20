"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Copy, Check, FileText, Loader2, ReceiptText, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { trackEvent } from "@/lib/analytics"
import { formatKrw } from "@/lib/billing/plans"

type ConfirmState =
  | { kind: "loading" }
  | {
      kind: "success"
      orderId: string
      orderName: string
      amount: number
      paymentMethod: string | null
      easyPayProvider: string | null
      receiptUrl: string | null
    }
  | { kind: "error"; message: string }

export function CheckoutSuccessClient() {
  const searchParams = useSearchParams()
  const [state, setState] = useState<ConfirmState>({ kind: "loading" })
  const [linkCopied, setLinkCopied] = useState(false)
  const trackedOrderRef = useRef<string | null>(null)

  const paymentKey = searchParams.get("paymentKey") ?? ""
  const orderId = searchParams.get("orderId") ?? ""
  const amount = searchParams.get("amount") ?? ""
  const checkoutToken = searchParams.get("checkoutToken") ?? ""

  const headline = useMemo(() => {
    if (state.kind === "success") return "결제가 정상 승인되었습니다"
    if (state.kind === "error") return "결제 승인 확인에 실패했습니다"
    return "결제 승인 확인 중입니다"
  }, [state.kind])

  useEffect(() => {
    if (!paymentKey || !orderId || !amount) {
      setState({ kind: "error", message: "결제 승인 파라미터가 누락되었습니다." })
      return
    }

    let cancelled = false

    async function confirmPayment() {
      try {
        const response = await fetch("/api/billing/checkout/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paymentKey,
            orderId,
            amount: Number(amount),
            checkoutToken,
          }),
        })

        const payload = (await response.json().catch(() => null)) as
          | {
              order: {
                orderId: string
                orderName: string
                amount: number
                paymentMethod: string | null
                easyPayProvider: string | null
                receiptUrl: string | null
              }
            }
          | {
              error?: string
            }
          | null

        if (!response.ok || !payload || !("order" in payload)) {
          throw new Error(payload && "error" in payload ? payload.error : "결제 승인 검증에 실패했습니다.")
        }

        if (!cancelled) {
          setState({
            kind: "success",
            orderId: payload.order.orderId,
            orderName: payload.order.orderName,
            amount: payload.order.amount,
            paymentMethod: payload.order.paymentMethod,
            easyPayProvider: payload.order.easyPayProvider,
            receiptUrl: payload.order.receiptUrl,
          })
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "결제 승인 검증에 실패했습니다.",
          })
        }
      }
    }

    void confirmPayment()
    return () => {
      cancelled = true
    }
  }, [amount, checkoutToken, orderId, paymentKey])

  useEffect(() => {
    if (state.kind !== "success") return
    if (trackedOrderRef.current === state.orderId) return

    trackedOrderRef.current = state.orderId
    trackEvent("purchase", {
      value: state.amount,
      currency: "KRW",
    })
  }, [state])

  return (
    <div className="bg-[#FAFAF8] px-4 py-16 font-sans md:py-24">
      <div className="mx-auto max-w-2xl">
        <Card className="overflow-hidden rounded-[32px] border-[rgba(8,71,52,0.08)] shadow-[0_18px_50px_rgba(23,72,52,0.08)]">
          <div className="relative border-b border-[rgba(8,71,52,0.08)] bg-[#FAFAF8] px-6 py-10">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 rounded-full bg-[#ECFDF5] blur-3xl" />
            </div>
          <CardHeader className="items-center text-center">
            {state.kind === "loading" ? (
              <Loader2 className="h-12 w-12 animate-spin text-[#084734]" />
            ) : (
              <CheckCircle2 className="h-14 w-14 text-[#1e8b58]" />
            )}
            <CardTitle className="text-[30px] font-semibold tracking-tight">{headline}</CardTitle>
            <CardDescription className="max-w-xl text-base">
              redirect 완료 후 서버 confirm API로 다시 검증한 결과입니다.
            </CardDescription>
          </CardHeader>
          </div>
          <CardContent className="space-y-6 px-6 pb-8">
            {state.kind === "loading" && (
              <div className="rounded-3xl border border-[rgba(8,71,52,0.08)] bg-[#F8FBF9] px-5 py-6 text-center text-sm text-slate-500">
                결제 상태를 확인하고 있습니다. 이 화면을 닫지 말아주세요.
              </div>
            )}

            {state.kind === "error" && (
              <div className="rounded-3xl border border-[#ead7b2] bg-[#fff9eb] px-5 py-6 text-sm text-[#8d6c1f]">
                {state.message}
              </div>
            )}

            {state.kind === "success" && (
              <>
                <div className="rounded-[28px] bg-[linear-gradient(135deg,#031A12_0%,#052E1E_48%,#084734_100%)] p-6 text-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.18em] text-white/40">Order</p>
                      <h2 className="mt-2 text-2xl font-semibold">{state.orderName}</h2>
                      <p className="mt-2 text-sm text-white/55">주문번호 {state.orderId}</p>
                    </div>
                    <ShieldCheck className="h-5 w-5 text-[#9fe7ca]" />
                  </div>
                  <p className="mt-8 text-4xl font-semibold tracking-tight">
                    {formatKrw(state.amount)}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl border border-[rgba(8,71,52,0.08)] bg-[#F8FBF9] p-5">
                    <p className="text-sm text-slate-400">결제수단</p>
                    <p className="mt-2 text-lg font-semibold text-[#1a1a19]">
                      {state.easyPayProvider ?? state.paymentMethod ?? "확인 필요"}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-[rgba(8,71,52,0.08)] bg-[#F8FBF9] p-5">
                    <p className="text-sm text-slate-400">영수증</p>
                    {state.receiptUrl ? (
                      <a
                        href={state.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-2 text-lg font-semibold text-[#084734] hover:underline"
                      >
                        <ReceiptText className="h-4 w-4" />
                        매출전표 보기
                      </a>
                    ) : (
                      <p className="mt-2 text-lg font-semibold text-[#1a1a19]">승인 완료</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button asChild size="default" variant="green-surface" className="rounded-full px-5">
                    <Link href={`/receipt/${state.orderId}`}>
                      <FileText className="h-4 w-4" />
                      영수증 보기
                    </Link>
                  </Button>
                  <Button
                    size="default"
                    variant="outline"
                    className="rounded-full px-5"
                    onClick={async () => {
                      const url = `${window.location.origin}/receipt/${state.orderId}`
                      try {
                        await navigator.clipboard.writeText(url)
                      } catch {
                        const ta = document.createElement("textarea")
                        ta.value = url
                        ta.style.position = "fixed"
                        ta.style.opacity = "0"
                        document.body.appendChild(ta)
                        ta.select()
                        document.execCommand("copy")
                        document.body.removeChild(ta)
                      }
                      setLinkCopied(true)
                      setTimeout(() => setLinkCopied(false), 2000)
                    }}
                  >
                    {linkCopied ? (
                      <>
                        <Check className="h-4 w-4" />
                        복사 완료
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        영수증 링크 복사
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full bg-[#084734] px-7 shadow-[0_14px_36px_rgba(8,71,52,0.18)]">
                <Link href="/product/sw">소프트웨어 페이지로 돌아가기</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full px-7">
                <Link href="/checkout">다른 플랜 보기</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
