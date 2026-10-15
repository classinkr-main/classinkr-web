"use client"

import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import { formatCNY, formatUSD } from "@/lib/crm/money-format"
import { classifySalesLedgerProductCategory } from "@/lib/branch/product-category"

export default function Customer360PurchaseSummary({ data }: { data: Customer360 }) {
  const summary = data.productSummary
  const software = (data.money.lineItems ?? []).filter(item => item.category === "software" && item.source === "deal_line_items")
  const hardwareOrders = (data.money.lineItems ?? []).filter(item => ["board", "camera", "stand"].includes(item.category) && item.source === "deal_line_items")
  const hwValue = summary.hwQuantity ?? summary.hwBoardCount
  const hardwareOrdersNeo = (data.money.orders ?? []).filter(order => classifySalesLedgerProductCategory({ product: order.title }) === "hardware")
  const softwareOrdersNeo = (data.money.orders ?? []).filter(order => classifySalesLedgerProductCategory({ product: order.title }) === "software")
  const sumOrders = (orders: typeof softwareOrdersNeo) => {
    const amounts = orders.flatMap(order => order.amount != null && Number.isFinite(order.amount) ? [order.amount] : [])
    return amounts.length ? amounts.reduce((sum, amount) => sum + amount, 0) : null
  }
  const softwareUsd = sumOrders(softwareOrdersNeo)
  const hardwareUsd = sumOrders(hardwareOrdersNeo)
  return (
    <section aria-label="누적 구매 현황" className="mb-3 grid grid-cols-2 gap-x-5 gap-y-2 border-y border-black/[0.08] py-3">
      <div className="min-w-0">
        <h2 className="text-[12px] font-semibold text-[#615D59]">누적 하드웨어 구매량</h2>
        <p className="mt-1 text-[24px] font-semibold tabular-nums tracking-tight text-[#084734]">{hwValue == null ? "—" : hwValue.toLocaleString("ko-KR")}<span className="ml-1 text-[12px] font-normal text-[#615D59]">{hwValue == null ? "수량 미확인" : summary.hwQuantity == null ? "대 · 전자칠판" : "개 · 실출고"}</span></p>
        <details className="mt-1"><summary className="min-h-8 cursor-pointer py-1 text-[12px] text-[#615D59]">품목·원천 자세히</summary>
        <p className="mt-2 text-[13px] text-[#615D59]">원장 누적 금액 {summary.hwCumulativeCNY == null ? "미확인" : formatCNY(summary.hwCumulativeCNY)}</p>
        {hardwareOrdersNeo.length ? <p className="mt-1 text-[13px] text-[#615D59]">NEO 오더 {hardwareUsd == null ? "금액 미확인" : formatUSD(hardwareUsd)} · {hardwareOrdersNeo.length}건</p> : null}
        {summary.hwProducts?.length ? <ul className="mt-3 space-y-1 border-t border-black/[0.08] pt-3 text-[13px] text-[#111110]">{summary.hwProducts.map(item => <li key={item.product} className="flex justify-between gap-3"><span className="min-w-0 break-words">{item.product}</span><span className="shrink-0 tabular-nums">{item.quantity.toLocaleString("ko-KR")}개</span></li>)}</ul> : null}
        {hardwareOrders.length ? <p className="mt-3 text-[12px] text-[#615D59]">주문 품목: {hardwareOrders.map(item => `${item.product} ${item.quantity}개`).join(" · ")} · 출고 수량과 별도</p> : null}
        <p className="mt-3 text-[12px] text-[#615D59]">판매 실출고 · 고객명 일치 기준 · 샘플·프로모션·A/S·예정 제외</p>
        </details>
      </div>
      <div className="min-w-0">
        <h2 className="text-[12px] font-semibold text-[#615D59]">누적 소프트웨어 구매량</h2>
        <p className="mt-1 text-[24px] font-semibold tabular-nums tracking-tight text-[#084734]">{summary.swCumulativeCNY == null ? softwareUsd == null ? "—" : formatUSD(softwareUsd) : formatCNY(summary.swCumulativeCNY)}</p>
        <details className="mt-1"><summary className="min-h-8 cursor-pointer py-1 text-[12px] text-[#615D59]">품목·원천 자세히</summary>
        <p className="mt-2 text-[13px] text-[#615D59]">{summary.swCumulativeCNY == null && softwareUsd != null ? "NEO 오더 금액 · USD" : "REV 원장 누적 금액 · CNY"}</p>
        {softwareOrdersNeo.length ? <p className="mt-1 text-[13px] text-[#615D59]">NEO 오더 {softwareUsd == null ? "금액 미확인" : formatUSD(softwareUsd)} · {softwareOrdersNeo.length}건 · REV와 별도</p> : null}
        {software.length ? <ul className="mt-3 space-y-1 border-t border-black/[0.08] pt-3 text-[13px] text-[#111110]">{software.map(item => <li key={item.key} className="flex justify-between gap-3"><span className="min-w-0 break-words">{item.product}</span><span className="shrink-0 tabular-nums">{item.quantity.toLocaleString("ko-KR")}개 · 주문 수량</span></li>)}</ul> : <p className="mt-3 text-[12px] text-[#615D59]">라이선스·좌석 수량은 등록된 주문 품목이 있을 때 표시합니다.</p>}
        <p className="mt-3 text-[12px] text-[#615D59]">상품별 단위가 달라 품목 수량은 서로 더하지 않습니다.</p>
        </details>
      </div>
      {data.money.lineItemsMeta?.truncated || data.money.lineItemsMeta?.note ? <p className="col-span-2 text-[12px] text-[#7A520F]">{data.money.lineItemsMeta.truncated ? "주문 품목은 일부 조회 결과입니다. 전체 구매 수량으로 해석하지 마세요. " : ""}{data.money.lineItemsMeta.note}</p> : null}
    </section>
  )
}
