"use client"

import { memo } from "react"
import type { Dispatch, SetStateAction } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import {
  formatCurrency,
  formatNumber,
  ledgerHref,
  SALE_TYPE_META,
  UNSPECIFIED_CUSTOMER,
  type OutboundSaleType,
  type PeriodGranularity,
} from "./shared"

interface OutboundBucket {
  key: string
  label: string
  total: number
  revenue: number
  hasRevenue: boolean
  pct: string
  chips: Array<{ product: string; qty: number }>
  typeChips: Array<{ type: OutboundSaleType; label: string; qty: number }>
  customers: Array<{ name: string; qty: number; revenue: number; hasRevenue: boolean; dateLabel: string }>
}

interface OutboundPeriodSectionProps {
  outboundBuckets: OutboundBucket[]
  outPeriod: PeriodGranularity
  setOutPeriod: Dispatch<SetStateAction<PeriodGranularity>>
  openPeriods: Record<string, boolean>
  setOpenPeriods: Dispatch<SetStateAction<Record<string, boolean>>>
  setCustomerDetail: Dispatch<SetStateAction<string | null>>
}

function OutboundPeriodSection({
  outboundBuckets,
  outPeriod,
  setOutPeriod,
  openPeriods,
  setOpenPeriods,
  setCustomerDetail,
}: OutboundPeriodSectionProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
        <div>
          <p className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">기간별 출고 집계</p>
          <p className="mt-1 text-[12px] text-[#615D59]">확정 출고(샘플·수리 제외) 기준 기간 집계. 행을 열면 고객사별 출고·매출이 펼쳐지고, 고객사를 누르면 거래이력이 열립니다. 매출은 실판매(Sales) 기준이며 시트 재가져오기 후 반영됩니다. 분기·연은 회계연도(4월 시작~3월 종료) 기준입니다.</p>
        </div>
        <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-0.5">
          {([["month", "월"], ["quarter", "분기"], ["year", "연"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setOutPeriod(key)}
              className={`cursor-pointer rounded-md px-3.5 py-1.5 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 ${
                outPeriod === key ? "bg-white text-[#084734] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#615D59] hover:text-[#111110]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        {outboundBuckets.map((bucket) => {
          const open = Boolean(openPeriods[bucket.key])
          return (
            <div key={bucket.key} className="border-t border-[rgba(0,0,0,0.06)] first:border-t-0">
              <button
                type="button"
                onClick={() => setOpenPeriods((current) => ({ ...current, [bucket.key]: !current[bucket.key] }))}
                className="block w-full cursor-pointer px-5 py-4 text-left transition hover:bg-[#FAFAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-[#A39E98] transition-transform ${open ? "rotate-90" : ""}`} />
                    <p className="text-[13px] font-bold text-[#111110]">{bucket.label}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-[12px] font-semibold tabular-nums text-[#615D59]">{formatNumber(bucket.total)}대</span>
                    <span className="min-w-[64px] text-right text-[13px] font-bold tabular-nums text-[#084734]">{bucket.hasRevenue ? formatCurrency(bucket.revenue, "USD") : "-"}</span>
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F6F5F4]">
                  <div className="h-full rounded-full bg-[#B43E3E]" style={{ width: bucket.pct }} />
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {bucket.chips.map((chip) => (
                    <span key={chip.product} className="inline-flex items-center gap-1.5 rounded-full bg-[#F6F5F4] px-2.5 py-1 text-[11px] font-semibold text-[#31302E]">
                      {chip.product}
                      <span className="font-bold tabular-nums text-[#111110]">{formatNumber(chip.qty)}</span>
                    </span>
                  ))}
                </div>
                {bucket.typeChips.length > 1 || (bucket.typeChips[0] && bucket.typeChips[0].type !== "sales") ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {bucket.typeChips.map((entry) => (
                      <span key={entry.type} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${SALE_TYPE_META[entry.type].tone}`}>
                        {entry.label}
                        <span className="tabular-nums">{formatNumber(entry.qty)}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </button>
              {open && (
                <div className="px-5 pb-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#615D59]">고객사별 모음</p>
                  <div className="overflow-hidden rounded-lg border border-[rgba(0,0,0,0.06)]">
                    <div className="grid grid-cols-[minmax(0,1fr)_58px_40px_88px_40px] gap-2.5 bg-[#F6F5F4] px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#615D59]">
                      <span>고객사</span>
                      <span>날짜</span>
                      <span className="text-right">수량</span>
                      <span className="text-right">매출</span>
                      <span aria-hidden />
                    </div>
                    {bucket.customers.map((customer) => (
                      <div
                        key={customer.name}
                        className="grid grid-cols-[minmax(0,1fr)_58px_40px_88px_40px] items-center gap-2.5 border-t border-[rgba(0,0,0,0.05)] px-3.5 transition hover:bg-[#FAFAF8]"
                      >
                        <button
                          type="button"
                          onClick={() => setCustomerDetail(customer.name)}
                          className="col-span-4 grid cursor-pointer grid-cols-subgrid items-center gap-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40"
                        >
                          <span title={customer.name} className="truncate text-[12.5px] font-semibold text-[#111110]">{customer.name}</span>
                          <span className="truncate text-[12px] tabular-nums text-[#615D59]">{customer.dateLabel}</span>
                          <span className="text-right text-[13px] font-bold tabular-nums text-[#111110]">{formatNumber(customer.qty)}대</span>
                          <span className="text-right text-[12.5px] font-bold tabular-nums text-[#084734]">{customer.hasRevenue ? formatCurrency(customer.revenue, "USD") : "-"}</span>
                        </button>
                        {customer.name !== UNSPECIFIED_CUSTOMER ? (
                          <Link
                            href={ledgerHref(customer.name)}
                            title={`${customer.name} — 매출 장부(REV)에서 보기`}
                            className="justify-self-end whitespace-nowrap py-2 text-[11px] font-bold text-[#084734] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                          >
                            장부 ↗
                          </Link>
                        ) : (
                          <span aria-hidden />
                        )}
                      </div>
                    ))}
                    <div className="grid grid-cols-[minmax(0,1fr)_58px_40px_88px_40px] items-center gap-2.5 border-t border-[rgba(0,0,0,0.1)] bg-[#FAFAF8] px-3.5 py-2.5">
                      <span className="text-[12px] font-bold text-[#111110]">전체 합계</span>
                      <span aria-hidden />
                      <span className="text-right text-[13px] font-bold tabular-nums text-[#111110]">{formatNumber(bucket.total)}대</span>
                      <span className="text-right text-[12.5px] font-bold tabular-nums text-[#084734]">{bucket.hasRevenue ? formatCurrency(bucket.revenue, "USD") : "-"}</span>
                      <span aria-hidden />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {outboundBuckets.length === 0 && (
          <p className="px-5 py-10 text-center text-[13px] text-[#615D59]">해당 기간 확정 출고 집계가 없습니다.</p>
        )}
      </div>
    </section>
  )
}

export default memo(OutboundPeriodSection)
