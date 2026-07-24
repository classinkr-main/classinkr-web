"use client"

import { memo } from "react"
import type { Dispatch, SetStateAction } from "react"

import type { AdminListPaginationResult } from "@/lib/admin-list-pagination"
import {
  formatAvg,
  formatDate,
  formatLotLabel,
  formatNumber,
  MONO_META_CLASS,
  PaginationControls,
  QuickMoveButton,
  SectionHeader,
  statusClass,
  statusCopy,
  type HardwareDashboard,
  type HardwareSectionKey,
  type HardwareStockRow,
} from "./shared"

interface StockLevelsSectionProps {
  openSections: Record<HardwareSectionKey, boolean>
  toggleSection: (section: HardwareSectionKey) => void
  data: HardwareDashboard | null
  stockPagination: AdminListPaginationResult<HardwareStockRow>
  setStockPage: Dispatch<SetStateAction<number>>
  prepareQuickEntry: (itemId: string, presetKey: string) => void
}

function StockLevelsSection({
  openSections,
  toggleSection,
  data,
  stockPagination,
  setStockPage,
  prepareQuickEntry,
}: StockLevelsSectionProps) {
  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <SectionHeader
        title="현재 재고"
        description="창고 = 실물 재고 · 가용 = 창고 − 예정. 최소재고와 최근 출고량을 같이 보고 주문 시점을 판단합니다."
        open={openSections.stock}
        onToggle={() => toggleSection("stock")}
        meta={
          <div className="text-right text-[11px] text-[#615D59]">
            <p>
              마지막 이관{" "}
              {data?.importRun?.finished_at ? (
                <span className={MONO_META_CLASS}>{formatDate(data.importRun.finished_at)}</span>
              ) : (
                "없음"
              )}
            </p>
            <p className="mt-0.5 font-semibold">{formatNumber(stockPagination.totalItems)}개 품목</p>
          </div>
        }
      />
      {openSections.stock && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full border-collapse text-left">
              <thead className="bg-[#F6F5F4] text-[11px] font-bold uppercase tracking-[0.05em] text-[#615D59]">
                <tr>
                  {/* 지표 1개=라벨 1개 — 카테고리 카드·위치 맵과 같은 어휘(창고/예정/가용)로 고정한다. 값 소스 불변. */}
                  <th scope="col" className="px-5 py-3">품목</th>
                  <th scope="col" className="px-4 py-3 text-right">창고</th>
                  <th scope="col" className="px-4 py-3 text-right">예정</th>
                  <th scope="col" className="px-4 py-3 text-right">가용</th>
                  <th scope="col" className="px-4 py-3 text-right">30일</th>
                  <th scope="col" className="px-4 py-3 text-right">빠른 처리</th>
                  <th scope="col" className="px-5 py-3 text-right">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,0,0,0.06)]">
                {stockPagination.totalItems === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-[13px] text-[#615D59]">
                      아직 하드웨어 원장 데이터가 없습니다. 시트 가져오기를 먼저 실행하세요.
                    </td>
                  </tr>
                ) : (
                  stockPagination.pageItems.map((row) => (
                    <tr key={row.itemId} className="align-top transition-colors hover:bg-[#FAFAF8]">
                      <td className="px-5 py-3.5">
                        <p className="text-[13px] font-bold text-[#111110]">{row.product}</p>
                        <p className="mt-1 text-[11px] text-[#615D59]">
                          {row.category ?? "미분류"} · 최소 {row.reorderPoint}대 · 리드타임 {row.leadTimeDays}일
                        </p>
                        {row.lotBalances.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {row.lotBalances.slice(0, 5).map((lot) => (
                              <span key={lot.lot} className={`rounded bg-[#F6F5F4] px-1.5 py-0.5 text-[11px] font-semibold text-[#31302E] ${MONO_META_CLASS}`}>
                                {formatLotLabel(lot.lot) ?? lot.lot} {formatNumber(lot.quantity)}
                              </span>
                            ))}
                            {row.lotBalances.length > 5 && (
                              <span className="rounded bg-[#ECFDF5] px-1.5 py-0.5 text-[11px] font-semibold text-[#084734]">
                                +{row.lotBalances.length - 5}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[14px] font-bold tabular-nums text-[#111110]">
                        {formatNumber(row.warehouseStock)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[13px] font-semibold tabular-nums text-[#7A520F]">
                        {formatNumber(row.plannedOut)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[16px] font-bold tabular-nums tracking-[-0.02em] text-[#111110]">
                        {formatNumber(row.availableStock)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <p className="text-[13px] font-semibold tabular-nums text-[#111110]">{formatNumber(row.outbound30d)}</p>
                        <p className="mt-1 text-[11px] tabular-nums text-[#615D59]">주 {formatAvg(row.weeklyOutboundAvg)}대</p>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-0.5">
                          <QuickMoveButton kind="sale" bare product={row.product} onClick={() => prepareQuickEntry(row.itemId, "sale")} />
                          <QuickMoveButton kind="planned" bare product={row.product} onClick={() => prepareQuickEntry(row.itemId, "planned")} />
                          <QuickMoveButton kind="inbound" bare product={row.product} onClick={() => prepareQuickEntry(row.itemId, "inbound")} />
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass(row)}`}>
                          {statusCopy(row)}
                        </span>
                        {row.daysUntilStockout != null && (
                          <p className="mt-1.5 text-[11px] text-[#615D59]">소진 예상 {row.daysUntilStockout}일</p>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls pagination={stockPagination} label="품목" onPageChange={setStockPage} />
        </>
      )}
    </section>
  )
}

export default memo(StockLevelsSection)
