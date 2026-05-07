"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { AlertCircle, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function CheckoutFailClient() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get("orderId") ?? ""
  const checkoutToken = searchParams.get("checkoutToken") ?? ""
  const code = searchParams.get("code") ?? ""
  const message = searchParams.get("message") ?? "결제가 취소되었거나 승인에 실패했습니다."

  useEffect(() => {
    if (!orderId) return

    void fetch("/api/billing/checkout/fail", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        orderId,
        checkoutToken,
        code,
        message,
      }),
    }).catch((error) => {
      console.error("[checkout] fail callback error:", error)
    })
  }, [checkoutToken, code, message, orderId])

  return (
    <div className="bg-[#FAFAF8] px-4 py-16 font-sans md:py-24">
      <div className="mx-auto max-w-2xl">
        <Card className="overflow-hidden rounded-[32px] border-[rgba(8,71,52,0.08)] shadow-[0_18px_50px_rgba(23,72,52,0.08)]">
          <div className="relative border-b border-[rgba(8,71,52,0.08)] bg-[#FAFAF8] px-6 py-10">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute left-1/2 top-2 h-48 w-48 -translate-x-1/2 rounded-full bg-[#ECFDF5] blur-3xl" />
            </div>
          <CardHeader className="items-center text-center">
            <AlertCircle className="h-14 w-14 text-[#084734]" />
            <CardTitle className="text-[30px] font-semibold tracking-tight">결제가 완료되지 않았습니다</CardTitle>
            <CardDescription className="max-w-xl text-base">
              결제창 취소, 인증 실패, 또는 결제수단 오류로 인해 주문이 마무리되지 않았습니다.
            </CardDescription>
          </CardHeader>
          </div>
          <CardContent className="space-y-6 px-6 pb-8">
            <div className="rounded-3xl border border-[#ead7b2] bg-[#fff9eb] px-5 py-6 text-sm text-[#8d6c1f]">
              {message}
              {code ? <div className="mt-2 text-xs text-[#a8842f]">오류 코드: {code}</div> : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full bg-[#084734] px-7 shadow-[0_14px_36px_rgba(8,71,52,0.18)] hover:bg-[#065c41]">
                <Link href="/checkout">
                  <RotateCcw className="h-4 w-4" />
                  다시 결제하기
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full px-7">
                <Link href="/contact#contact-form">도입 상담으로 이동</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
