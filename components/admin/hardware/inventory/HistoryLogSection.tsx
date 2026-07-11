"use client"

import type { Dispatch, ReactNode, SetStateAction } from "react"
import { ChevronDown, ChevronRight, Clock3 } from "lucide-react"

import type { AdminListPaginationResult } from "@/lib/admin-list-pagination"
import {
  formatDate,
  formatNumber,
  MONO_META_CLASS,
  MOVEMENT_LABEL,
  MOVEMENT_TONE,
  PaginationControls,
  type HardwareMovement,
  type HardwareMovementType,
} from "./shared"

interface HistoryLogGroup {
  key: string
  customer: string
  date: string | null
  owners: string[]
  products: string[]
  movements: HardwareMovement[]
  totalQty: number
  plannedQty: number
  types: Set<HardwareMovementType>
  lots: Set<string>
  hasMissingLot: boolean
  anyVoided: boolean
}

interface HistoryLogSectionProps {
  filteredMovements: HardwareMovement[]
  logGroups: HistoryLogGroup[]
  pageLogGroupKeys: string[]
  toggleAllPageLogGroups: () => void
  allPageGroupsExpanded: boolean
  logGroupsPagination: AdminListPaginationResult<HistoryLogGroup>
  expandedLogGroups: Set<string>
  setDetailId: Dispatch<SetStateAction<string | null>>
  toggleLogGroup: (key: string) => void
  renderMovementRow: (movement: HardwareMovement, nested?: boolean) => ReactNode
  setMovementsPage: Dispatch<SetStateAction<number>>
}

export default function HistoryLogSection({
  filteredMovements,
  logGroups,
  pageLogGroupKeys,
  toggleAllPageLogGroups,
  allPageGroupsExpanded,
  logGroupsPagination,
  expandedLogGroups,
  setDetailId,
  toggleLogGroup,
  renderMovementRow,
  setMovementsPage,
}: HistoryLogSectionProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
        <div className="min-w-0">
          <p className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">상세 내역 (로그)</p>
          <p className="mt-1 text-[12px] text-[#615D59]">고객사·날짜(배송 건)로 묶었습니다. 여러 건은 헤더를 클릭하면 하위 품목이 펼쳐지고, 단일 건·하위 행은 클릭하면 상세와 CRM 연계가 열립니다.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] font-semibold text-[#615D59]">{formatNumber(filteredMovements.length)}건 · {formatNumber(logGroups.length)}묶음</span>
          {pageLogGroupKeys.length > 0 ? (
            <button
              type="button"
              onClick={toggleAllPageLogGroups}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${allPageGroupsExpanded ? "rotate-180" : ""}`} />
              {allPageGroupsExpanded ? "모두 접기" : "모두 펼치기"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[940px]">
          <div className="grid grid-cols-[84px_1.5fr_1.2fr_96px_84px_1.4fr_92px_22px] items-center gap-3 bg-[#F6F5F4] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#615D59]">
            <span>물량번호</span>
            <span>고객사</span>
            <span>품목 · 수량</span>
            <span>날짜</span>
            <span>담당자</span>
            <span>특이사항</span>
            <span className="text-right">유형</span>
            <span />
          </div>
          {logGroupsPagination.pageItems.map((group) => {
            const isSingle = group.movements.length === 1
            const expanded = !isSingle && expandedLogGroups.has(group.key)
            const typeList = Array.from(group.types)
            // 물량번호 배지: 모든 건이 같은 단일 lot이면 그 lot(예: H8), 섞였거나 미지정 포함이면 "N건".
            const soleLot = !group.hasMissingLot && group.lots.size === 1 ? Array.from(group.lots)[0] : null
            const singleMovement = group.movements[0]
            return (
              <div key={group.key} className="border-t border-[rgba(0,0,0,0.06)]">
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isSingle ? undefined : expanded}
                  onClick={() => (isSingle ? setDetailId(singleMovement.id) : toggleLogGroup(group.key))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      if (isSingle) setDetailId(singleMovement.id)
                      else toggleLogGroup(group.key)
                    }
                  }}
                  className={`grid cursor-pointer grid-cols-[84px_1.5fr_1.2fr_96px_84px_1.4fr_92px_22px] items-center gap-3 px-5 py-3 transition hover:bg-[#F1F0EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 ${
                    expanded ? "bg-[#F6F5F4]" : "bg-white"
                  }`}
                >
                  <span>
                    {soleLot ? (
                      <span className={`inline-flex items-center rounded bg-[#ECFDF5] px-1.5 py-0.5 text-[11px] font-bold text-[#084734] ${MONO_META_CLASS}`}>{soleLot}</span>
                    ) : (
                      <span className="inline-flex items-center rounded bg-[#EDECEA] px-1.5 py-0.5 text-[11px] font-bold text-[#615D59]">{formatNumber(group.movements.length)}건</span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span title={group.customer} className="block truncate text-[12.5px] font-bold text-[#111110]">{group.customer}</span>
                    <span title={group.products.join(" · ")} className="mt-0.5 block truncate text-[11px] text-[#615D59]">{group.products.join(" · ")}</span>
                  </span>
                  <span className="min-w-0 text-[11px] tabular-nums text-[#615D59]">
                    {formatNumber(group.products.length)}품목 · 총 {formatNumber(group.totalQty)}대
                  </span>
                  <span className={`text-[11.5px] text-[#31302E] ${MONO_META_CLASS}`}>{formatDate(group.date)}</span>
                  <span title={group.owners.join(", ")} className="truncate text-[11.5px] text-[#31302E]">{group.owners.join(", ") || "-"}</span>
                  <span className="flex flex-wrap items-center gap-1">
                    {group.plannedQty > 0 ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-[#FBF1E0] px-1.5 py-0.5 text-[10px] font-bold text-[#A8741A]">
                        <Clock3 className="h-2.5 w-2.5" />
                        예정 {formatNumber(group.plannedQty)}
                      </span>
                    ) : null}
                    {group.hasMissingLot ? (
                      <span className="inline-flex rounded-full border border-dashed border-[rgba(0,0,0,0.12)] bg-[#F6F5F4] px-1.5 py-0.5 text-[10px] font-bold text-[#A39E98]">
                        {isSingle ? "물량번호 미지정" : "미지정 포함"}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap items-center justify-end gap-1">
                    {typeList.map((type) => (
                      <span key={type} className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${MOVEMENT_TONE[type]}`}>
                        {MOVEMENT_LABEL[type]}
                      </span>
                    ))}
                  </span>
                  <span className="text-[#615D59]">
                    {isSingle ? (
                      <ChevronRight className="h-3.5 w-3.5 text-[#A39E98]" />
                    ) : (
                      <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    )}
                  </span>
                </div>
                {expanded ? group.movements.map((movement) => renderMovementRow(movement, true)) : null}
              </div>
            )
          })}
          {logGroupsPagination.totalItems === 0 && (
            <p className="px-5 py-10 text-center text-[13px] text-[#615D59]">입출고 기록이 없습니다.</p>
          )}
        </div>
      </div>
      <PaginationControls pagination={logGroupsPagination} label="묶음" onPageChange={setMovementsPage} />
    </section>
  )
}
