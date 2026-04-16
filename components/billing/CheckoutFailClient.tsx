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
        code,
        message,
      }),
    }).catch((error) => {
      console.error("[checkout] fail callback error:", error)
    })
  }, [code, message, orderId])

  return (
    <div className="bg-[#FDFCF8] px-4 py-16 md:py-24">
      <div className="mx-auto max-w-2xl">
        <Card className="rounded-[32px] border-[#f0e0d5] shadow-[0_18px_50px_rgba(116,78,46,0.08)]">
          <CardHeader className="items-center text-center">
            <AlertCircle className="h-14 w-14 text-[#d66a3b]" />
            <CardTitle className="font-serif text-[34px]">결제가 완료되지 않았습니다</CardTitle>
            <CardDescription className="max-w-xl text-base">
              결제창 취소, 인증 실패, 또는 결제수단 오류로 인해 주문이 마무리되지 않았습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-6 pb-8">
            <div className="rounded-3xl border border-[#f3d8c8] bg-[#fff4ee] px-5 py-6 text-sm text-[#b85c33]">
              {message}
              {code ? <div className="mt-2 text-xs text-[#c06d47]">오류 코드: {code}</div> : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full bg-[#E05024] px-7 hover:bg-[#c9431a]">
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
