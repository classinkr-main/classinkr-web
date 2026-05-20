import { notFound } from "next/navigation"
import { headers } from "next/headers"

import { getSoftwareCheckoutOrder } from "@/lib/server/software-checkout"
import { formatKrw, formatUsd, getBillingCycleLabel } from "@/lib/billing/plans"
import { formatCny } from "@/lib/billing/recharge"
import { ReceiptView } from "@/components/billing/ReceiptView"

function formatDate(iso: string) {
  const date = new Date(iso)
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatPaymentMethod(
  easyPayProvider: string | null,
  paymentMethod: string | null
) {
  if (easyPayProvider) return easyPayProvider
  if (paymentMethod) return paymentMethod
  return "확인 필요"
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = await params
  const order = await getSoftwareCheckoutOrder(orderId)

  if (!order || order.status !== "paid") {
    notFound()
  }

  const headersList = await headers()
  const host = headersList.get("host") ?? "localhost:3000"
  const protocol = headersList.get("x-forwarded-proto") ?? "https"
  const receiptUrl = `${protocol}://${host}/receipt/${orderId}`

  const raw = (order.rawPrepare ?? {}) as Record<string, unknown>

  return (
    <>
      {/* Print styles */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .print\\:hidden { display: none !important; }
              .receipt-page { padding: 0 !important; min-height: auto !important; }
              .receipt-card { box-shadow: none !important; border: none !important; max-width: 100% !important; }
            }
          `,
        }}
      />

      <div className="receipt-page min-h-screen bg-[#FAFAF8] px-4 py-12 font-sans md:py-20">
        <div className="receipt-card mx-auto max-w-2xl rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-6 shadow-[rgba(0,0,0,0.04)_0px_4px_18px,rgba(0,0,0,0.027)_0px_2px_7.8px,rgba(0,0,0,0.02)_0px_0.8px_2.9px,rgba(0,0,0,0.01)_0px_0.175px_1px] md:p-10">
          {/* Header */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-[28px] font-bold tracking-[-0.625px] text-[#084734]">
                Classin
              </h1>
              <p className="mt-1 text-sm text-[#615D59]">결제 영수증</p>
            </div>
            <div className="text-right text-sm text-[#A39E98]">
              <p>주문번호</p>
              <p className="mt-0.5 font-medium text-[#111110]">{order.orderId}</p>
            </div>
          </div>

          <div className="h-px bg-[rgba(0,0,0,0.08)]" />

          {/* Order details */}
          <div className="mt-6 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.125px] text-[#A39E98]">
              주문 정보
            </h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              <dt className="text-[#615D59]">상품명</dt>
              <dd className="font-medium text-[#111110]">{order.orderName}</dd>

              <dt className="text-[#615D59]">결제일시</dt>
              <dd className="font-medium text-[#111110]">
                {order.approvedAt ? formatDate(order.approvedAt) : "-"}
              </dd>

              <dt className="text-[#615D59]">결제수단</dt>
              <dd className="font-medium text-[#111110]">
                {formatPaymentMethod(order.easyPayProvider, order.paymentMethod)}
              </dd>

              <dt className="text-[#615D59]">기관명</dt>
              <dd className="font-medium text-[#111110]">
                {order.organizationName}
              </dd>

              <dt className="text-[#615D59]">담당자</dt>
              <dd className="font-medium text-[#111110]">{order.buyerName}</dd>
            </dl>
          </div>

          <div className="mt-6 h-px bg-[rgba(0,0,0,0.08)]" />

          {/* Amount section */}
          <div className="mt-6 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.125px] text-[#A39E98]">
              결제 금액
            </h2>

            {order.mode === "subscription" && (
              <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="space-y-1 text-sm text-[#615D59]">
                    <p>
                      {raw.planTitle ? String(raw.planTitle) : order.planId ?? ""}{" "}
                      {order.billingCycle
                        ? getBillingCycleLabel(order.billingCycle)
                        : ""}
                    </p>
                    {typeof raw.accountCount === "number" && (
                      <p>{raw.accountCount}계정</p>
                    )}
                  </div>
                  {typeof raw.amountUsd === "number" && (
                    <p className="text-lg font-semibold text-[#111110]">
                      {formatUsd(raw.amountUsd)}
                    </p>
                  )}
                </div>
                {typeof raw.fxRate === "number" && (
                  <p className="mt-2 text-xs text-[#A39E98]">
                    적용 환율: 1 USD = {Number(raw.fxRate).toLocaleString("ko-KR")}원
                  </p>
                )}
              </div>
            )}

            {order.mode === "business" && (
              <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm text-[#615D59]">Business 충전</p>
                  {typeof raw.amountCny === "number" && (
                    <p className="text-lg font-semibold text-[#111110]">
                      {formatCny(raw.amountCny)}
                    </p>
                  )}
                </div>
                {typeof raw.amountCnyBeforeDiscount === "number" &&
                  typeof raw.amountCny === "number" &&
                  raw.amountCnyBeforeDiscount !== raw.amountCny && (
                    <div className="mt-2 space-y-1 text-xs text-[#615D59]">
                      <p>
                        할인 전: {formatCny(Number(raw.amountCnyBeforeDiscount))}
                      </p>
                      {typeof raw.discountAmountCny === "number" &&
                        Number(raw.discountAmountCny) > 0 && (
                          <p>
                            할인: -{formatCny(Number(raw.discountAmountCny))}
                          </p>
                        )}
                    </div>
                  )}
                {typeof raw.fxRate === "number" && (
                  <p className="mt-2 text-xs text-[#A39E98]">
                    적용 환율: 1 CNY = {Number(raw.fxRate).toLocaleString("ko-KR")}원
                  </p>
                )}
              </div>
            )}

            {/* KRW approved amount */}
            <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#ECFDF5] p-4">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-medium text-[#084734]">
                  KRW 승인 금액
                </p>
                <p className="text-2xl font-bold tracking-[-0.625px] text-[#084734]">
                  {formatKrw(order.amount)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 h-px bg-[rgba(0,0,0,0.08)]" />

          {/* Footer actions */}
          <div className="mt-6">
            <ReceiptView
              receiptUrl={receiptUrl}
              tossReceiptUrl={order.receiptUrl}
            />
          </div>

          {/* Legal footer */}
          <p className="mt-8 text-center text-xs text-[#A39E98]">
            본 영수증은 결제 확인 목적으로 발행되며, 세금계산서를 대체하지 않습니다.
          </p>
        </div>
      </div>
    </>
  )
}
