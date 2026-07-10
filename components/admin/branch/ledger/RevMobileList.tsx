"use client"

import { AlertTriangle, ChevronRight, RotateCcw } from "lucide-react"
import {
  ProductCategoryPill,
  WeekNumbersCell,
  WeeklySourceBadge,
  formatMoney,
  formatWeekAmount,
  type LedgerRevenueRow,
  type RevCustomerGroup,
  type RevRowView,
} from "./shared"

interface RevMobileListProps {
  filteredRows: LedgerRevenueRow[]
  revControlsDirty: boolean
  resetRevFilters: () => void
  visibleGroups: RevCustomerGroup[]
  expandedRevGroups: Set<string>
  toggleRevGroup: (key: string) => void
  revRowViews: Map<string, RevRowView>
  selectedRow: LedgerRevenueRow | null
  loadDealDetail: (row: LedgerRevenueRow) => void | Promise<void>
}

export function RevMobileList({
  filteredRows,
  revControlsDirty,
  resetRevFilters,
  visibleGroups,
  expandedRevGroups,
  toggleRevGroup,
  revRowViews,
  selectedRow,
  loadDealDetail,
}: RevMobileListProps) {
  return (
    <div className="space-y-2 p-3 md:hidden">
                  {filteredRows.length === 0 && (
                    <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-6 text-center text-[12px] text-[#615D59]">
                      <p>조건에 맞는 REV 행이 없습니다 · 필터/검색을 초기화해 보세요</p>
                      {revControlsDirty && (
                        <button
                          type="button"
                          onClick={resetRevFilters}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110]"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          초기화
                        </button>
                      )}
                    </div>
                  )}
                  {visibleGroups.map((group) => {
                    const grouped = group.rows.length > 1
                    const expanded = !grouped || expandedRevGroups.has(group.key)
                    return (
                      <article key={group.key} className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
                        {grouped && (
                          <button
                            type="button"
                            onClick={() => toggleRevGroup(group.key)}
                            aria-expanded={expanded}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-bold text-[#111110]">{group.customer}</span>
                              <span className="mt-0.5 block text-[10.5px] font-semibold text-[#615D59]">
                                {group.rows.length}건 · SW {formatMoney(group.categoryTotals.software)} · HW {formatMoney(group.categoryTotals.hardware)}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="text-[14px] font-bold tabular-nums text-[#111110]">{formatMoney(group.monthTotal || group.revenueTotal)}</span>
                              <ChevronRight className={`h-4 w-4 text-[#615D59] transition-transform ${expanded ? "rotate-90" : ""}`} />
                            </span>
                          </button>
                        )}
                        {expanded &&
                          group.rows.map((row) => {
                            const view = revRowViews.get(row.id)
                            if (!view) return null
                            const { draftRow, productCategory, weeklySplit, monthAmount, mismatch } = view
                            const active = selectedRow?.id === row.id
                            return (
                              <div
                                key={row.id}
                                className={`px-3 py-2.5 ${grouped ? "border-t border-[#F0F0EC]" : ""} ${
                                  active ? "bg-[#ECFDF5]" : draftRow ? "bg-[#FFFCF5]" : ""
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    {!grouped && (
                                      <button
                                        type="button"
                                        onClick={() => void loadDealDetail(row)}
                                        className="max-w-full truncate text-left text-[13px] font-bold text-[#111110] underline-offset-2 hover:text-[#084734] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
                                        aria-label={`${row.customer} 상세 열기`}
                                      >
                                        {row.customer}
                                      </button>
                                    )}
                                    <div className={`flex flex-wrap items-center gap-1.5 ${grouped ? "" : "mt-1"}`}>
                                      <ProductCategoryPill category={productCategory} compact />
                                      <WeeklySourceBadge source={weeklySplit.source} />
                                      {draftRow && (
                                        <span className="rounded-full bg-[#FBF1E0] px-2 py-0.5 text-[10px] font-bold text-[#7A520F]">장부 입력</span>
                                      )}
                                    </div>
                                    <p className="mt-1 truncate text-[10.5px] font-semibold text-[#615D59]">
                                      {[row.manager, row.team, row.region, row.status, row.dealType, row.productVersion].filter(Boolean).join(" · ") || "-"}
                                    </p>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <p className="text-[13px] font-bold tabular-nums text-[#111110]">
                                      {formatMoney(monthAmount || row.revenue)}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => void loadDealDetail(row)}
                                      className="mt-1 inline-flex items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 py-1 text-[11px] font-bold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
                                      aria-label={`${row.customer} 상세 열기`}
                                    >
                                      상세
                                      <ChevronRight className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                                <div className="mt-1.5">
                                  <WeekNumbersCell
                                    weeks={weeklySplit.source === "explicit" || weeklySplit.source === "inferred" ? weeklySplit.weeks : [0, 0, 0, 0, 0]}
                                    inferred={weeklySplit.source === "inferred"}
                                    monthOnlyAmount={weeklySplit.source === "month-only" ? weeklySplit.total : 0}
                                  />
                                  {mismatch && (
                                    <p className="mt-0.5 flex items-center justify-end gap-0.5 text-[9.5px] font-bold text-[#B43E3E]">
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                      주차합 {formatWeekAmount(mismatch.weekly)} ≠ 월 {formatWeekAmount(mismatch.monthly)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                      </article>
                    )
                  })}
                </div>
  )
}
