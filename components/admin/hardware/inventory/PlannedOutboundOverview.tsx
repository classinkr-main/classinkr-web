"use client"

import type { ComponentProps } from "react"
import { ArrowRight } from "lucide-react"
import type PlannedOutboundPanel from "./PlannedOutboundPanel"
import { formatDate, formatNumber } from "./shared"

type Props = Pick<ComponentProps<typeof PlannedOutboundPanel>, "plannedPagination" | "startPlannedEntry" | "plannedConfirmLocked">

/** A read-only preview of the existing queue; finalization stays in the full panel. */
export default function PlannedOutboundOverview({ plannedPagination, startPlannedEntry, plannedConfirmLocked }: Props) {
  const groups = plannedPagination.pageItems.slice(0, 5)
  return (
    <section className="min-w-0 border border-[rgba(0,0,0,0.08)] bg-white" aria-label="출고 예정 요약">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-4 py-4">
        <h2 className="text-[16px] font-bold text-[#111110]">출고 예정</h2>
        <span className="text-[12px] text-[#615D59]">{formatNumber(plannedPagination.totalItems)}묶음</span>
      </div>
      <div className="divide-y divide-[rgba(0,0,0,0.08)] px-4">
        {groups.length ? groups.map((group) => (
          <a key={group.key} href="#hardware-section-planned" className="block py-4 focus-visible:outline-2 focus-visible:outline-[#084734] hover:bg-[#F6F5F4]">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-[13px] font-semibold text-[#111110]">{group.customer}</p>
              <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#A8741A]">{formatNumber(group.totalQty)}대</span>
            </div>
            <p className="mt-1 truncate text-[12px] text-[#615D59]">{group.items.map((item) => item.product_name).join(" · ")}</p>
            <p className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-[#615D59]"><span>{group.date ? formatDate(group.date) : "예정일 미지정"}</span><span>{group.owner ?? "담당 미지정"}</span></p>
          </a>
        )) : <p className="py-8 text-center text-[13px] text-[#615D59]">출고 예정 내역이 없습니다.</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(0,0,0,0.08)] px-4 py-3">
        <button type="button" onClick={startPlannedEntry} disabled={plannedConfirmLocked} className="min-h-11 text-[12px] font-semibold text-[#084734] disabled:opacity-50">예정 등록</button>
        <a href="#hardware-section-planned" className="inline-flex min-h-11 items-center gap-1 text-[12px] font-semibold text-[#084734]">전체 확인 <ArrowRight className="h-3.5 w-3.5" /></a>
      </div>
      <p className="px-4 pb-3 text-[11px] text-[#615D59]">현재 페이지 최대 5묶음 · 예정은 확정 출고와 구분됩니다.</p>
    </section>
  )
}
