"use client"

import { memo } from "react"
import type { Dispatch, SetStateAction } from "react"

import type { AdminListPaginationResult } from "@/lib/admin-list-pagination"
import ExportActions from "./ExportActions"
import { buildStockExportRows } from "./hardware-export"
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
  const stockBasisFinishedAt =
    data?.importRun?.status === "success"
      ? data.importRun.finished_at
      : data?.importRunLastSuccess?.finished_at ?? null
  return (
    // id: 홈 요약 밴드(SummaryBand)의 "창고/가용/부족·주문 검토" 칸이 앵커 스크롤로 여기를
    // 가리킨다(감사 2026-09-14, 홈 가시성 개편).
    <section id="hardware-section-stock" className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <SectionHeader
        title="현재 재고"
        description="창고 = 실물 재고 · 가용 = 창고 − 예정. 최소재고와 최근 출고량을 같이 보고 주문 시점을 판단합니다."
        open={openSections.stock}
        onToggle={() => toggleSection("stock")}
        actions={
          // 품목별 창고·예정·가용·30일·로트 잔량을 가져간다(하드웨어 라운드 2 H-15). 페이지가 아니라 전 품목.
          (data?.stock.length ?? 0) > 0 ? (
            <ExportActions
              subject="현재 재고"
              fileBaseName="하드웨어_재고"
              rowCount={data?.stock.length ?? 0}
              buildRows={() => buildStockExportRows(data?.stock ?? [])}
              size="xs"
            />
          ) : null
        }
        meta={
          <div className="text-right text-[11px] text-[#615D59]">
            <p>
              {/* 진행 중·실패한 최신 이관이 아니라 숫자가 실제로 기준하는 마지막 성공 이관(H-11). */}
              마지막 이관{" "}
              {stockBasisFinishedAt ? (
                <span className={MONO_META_CLASS}>{formatDate(stockBasisFinishedAt)}</span>
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
                          // 라벨 프리픽스("로트")로 창고/가용 숫자 옆 이 칩들이 무엇인지 즉시
                          // 알 수 있게 한다(요청사항 ③.4 — H8·C1처럼 실물과 맞는 lot이 내려오기
                          // 시작한 지금, 라벨 없이 뜬 칩만으로는 처음 보는 사람이 의미를 추측해야 했다).
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#A39E98]">로트</span>
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
                      {/* 음수 = 원장 이상 신호 — 카테고리 카드와 같은 규칙으로 Danger 텍스트만 적용(값 소스 불변). */}
                      <td className={`px-4 py-3.5 text-right text-[14px] font-bold tabular-nums ${row.warehouseStock < 0 ? "text-[#B43E3E]" : "text-[#111110]"}`}>
                        {formatNumber(row.warehouseStock)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[13px] font-semibold tabular-nums text-[#7A520F]">
                        {formatNumber(row.plannedOut)}
                      </td>
                      <td className={`px-4 py-3.5 text-right text-[16px] font-bold tabular-nums tracking-[-0.02em] ${row.availableStock < 0 ? "text-[#B43E3E]" : "text-[#111110]"}`}>
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
