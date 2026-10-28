"use client"

import { memo, useMemo, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import dynamic from "next/dynamic"
import { Download, Filter, Scale, Settings2 } from "lucide-react"

import { paginateAdminList, type AdminListPaginationResult } from "@/lib/admin-list-pagination"
import StockAvailabilityGauge from "./StockAvailabilityGauge"

// 입고관리 권한자만 여는 시트 — 첫 화면 번들에서 뺀다.
const AdjustmentSheet = dynamic(() => import("./AdjustmentSheet"), { loading: () => null })
const ItemSettingsSheet = dynamic(() => import("./ItemSettingsSheet"), { loading: () => null })

const LOT_CHIP_LIMIT = 5
import { buildHardwareStockCsv, filterHomeStock } from "./home-record-model"
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
  todayKey,
  type HardwareDashboard,
  type HardwareSectionKey,
  type HardwareStockRow,
} from "./shared"

interface StockLevelsSectionProps {
  compact?: boolean
  selectedItemId?: string
  onSelectItem?: (itemId: string) => void
  openSections: Record<HardwareSectionKey, boolean>
  toggleSection: (section: HardwareSectionKey) => void
  data: HardwareDashboard | null
  stockPagination: AdminListPaginationResult<HardwareStockRow>
  setStockPage: Dispatch<SetStateAction<number>>
  prepareQuickEntry: (itemId: string, presetKey: string) => void
  // 재고 조정·품목 설정을 저장한 뒤 대시보드를 다시 받는다. 없으면 두 진입점을 숨긴다.
  onStockChanged?: () => void | Promise<void>
}

function StockLevelsSection({
  compact = false,
  selectedItemId,
  onSelectItem,
  openSections,
  toggleSection,
  data,
  stockPagination: basePagination,
  setStockPage,
  prepareQuickEntry,
  onStockChanged,
}: StockLevelsSectionProps) {
  // 입고·재고 조정·품목 설정은 입고관리 권한자만(§7-2). 구응답(undefined)은 입고 버튼만 열어 두고 서버 게이트를 믿는다.
  const canManageInventory = data?.viewer?.canManageInventory
  const canAdminister = canManageInventory === true && Boolean(onStockChanged)
  const showInbound = canManageInventory !== false
  const [adjustTarget, setAdjustTarget] = useState<{ itemId: string | null } | null>(null)
  const [settingsItemId, setSettingsItemId] = useState<string | null>(null)
  const [expandedLots, setExpandedLots] = useState<ReadonlySet<string>>(() => new Set())
  const [adminNotice, setAdminNotice] = useState<string | null>(null)
  const activeItems = useMemo(() => {
    const active = new Set((data?.stock ?? []).map((row) => row.itemId))
    return (data?.items ?? []).filter((item) => active.has(item.id))
  }, [data?.items, data?.stock])
  const settingsItem = settingsItemId ? (data?.items ?? []).find((item) => item.id === settingsItemId) ?? null : null
  const afterAdminSave = (message: string) => {
    setAdminNotice(message)
    void onStockChanged?.()
  }
  const [query, setQuery] = useState("")
  const [needsAttention, setNeedsAttention] = useState(false)
  const [plannedOnly, setPlannedOnly] = useState(false)
  const filteredRows = useMemo(() => filterHomeStock(data?.stock ?? [], query, needsAttention, plannedOnly), [data?.stock, query, needsAttention, plannedOnly])
  const stockPagination = compact ? paginateAdminList(filteredRows, { currentPage: basePagination.currentPage, pageSize: basePagination.pageSize }) : basePagination
  const filterCount = Number(needsAttention) + Number(plannedOnly)
  const lotTrackedById = useMemo(() => new Map((data?.items ?? []).map((item) => [item.id, item.lot_tracked !== false])), [data?.items])
  const exportStock = () => {
    const url = URL.createObjectURL(new Blob([buildHardwareStockCsv(filteredRows)], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `hardware-stock-${todayKey()}.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    // id: 홈 요약 밴드(SummaryBand)의 "창고/가용/부족·주문 검토" 칸이 앵커 스크롤로 여기를
    // 가리킨다(감사 2026-09-14, 홈 가시성 개편).
    <section id="hardware-section-stock" className="min-w-0 border border-[rgba(0,0,0,0.08)] bg-white">
      <SectionHeader
        title="제품별 재고"
        description={compact ? undefined : "창고 = 실물 재고 · 가용 = 창고 − 예정. 최소재고와 최근 출고량을 같이 보고 주문 시점을 판단합니다."}
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
      {compact ? <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
        <input aria-label="재고 제품 검색" placeholder="제품명 검색" value={query} onChange={event => { setQuery(event.target.value); setStockPage(1) }} className="h-9 min-w-0 flex-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px]" />
        <details className="relative">
          <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] px-3 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-[#084734]"><Filter className="h-3.5 w-3.5" />필터{filterCount ? ` (${filterCount})` : ""}</summary>
          <div className="absolute right-0 top-full z-20 mt-2 w-52 space-y-3 rounded-md border border-[rgba(0,0,0,0.08)] bg-white p-4 text-[12px] shadow-lg">
            <label className="flex items-center gap-2"><input type="checkbox" checked={needsAttention} onChange={event => { setNeedsAttention(event.target.checked); setStockPage(1) }} />부족·주문 검토만</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={plannedOnly} onChange={event => { setPlannedOnly(event.target.checked); setStockPage(1) }} />예정 출고 있는 품목</label>
            <button type="button" onClick={() => { setNeedsAttention(false); setPlannedOnly(false); setStockPage(1) }} className="text-[#084734]">필터 초기화</button>
          </div>
        </details>
        <button type="button" onClick={exportStock} disabled={!filteredRows.length} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] px-3 text-[12px] font-semibold disabled:opacity-40"><Download className="h-3.5 w-3.5" />CSV 내보내기</button>
        {canAdminister ? <button type="button" onClick={() => setAdjustTarget({ itemId: null })} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] px-3 text-[12px] font-semibold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"><Scale className="h-3.5 w-3.5" />재고 조정</button> : null}
      </div> : canAdminister ? <div className="flex justify-end border-b border-[rgba(0,0,0,0.08)] px-4 py-2.5">
        <button type="button" onClick={() => setAdjustTarget({ itemId: null })} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] px-3 text-[12px] font-semibold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"><Scale className="h-3.5 w-3.5" />재고 조정</button>
      </div> : null}
      {adminNotice ? <p role="status" className="border-b border-[rgba(0,0,0,0.08)] bg-[#ECFDF5] px-4 py-2 text-[12px] font-semibold text-[#084734]">{adminNotice}</p> : null}
      {openSections.stock && (
        <>
          <div className="overflow-x-auto">
            <table className={`w-full border-collapse text-left ${compact ? "min-w-[560px]" : "min-w-[860px]"}`}>
              <thead className="bg-[#F6F5F4] text-[11px] font-bold uppercase tracking-[0.05em] text-[#615D59]">
                <tr>
                  {/* 지표 1개=라벨 1개 — 카테고리 카드·위치 맵과 같은 어휘(창고/예정/가용)로 고정한다. 값 소스 불변. */}
                  <th scope="col" className="px-5 py-3">품목</th>
                  <th scope="col" className="px-4 py-3 text-right">창고</th>
                  <th scope="col" className="px-4 py-3 text-right">예정</th>
                  <th scope="col" className="px-4 py-3 text-right">가용</th>
                  {!compact ? <th scope="col" className="px-4 py-3 text-right">30일</th> : null}
                  {!compact ? <th scope="col" className="px-4 py-3 text-right">빠른 처리</th> : null}
                  <th scope="col" className="px-5 py-3 text-right">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,0,0,0.06)]">
                {stockPagination.totalItems === 0 ? (
                  <tr>
                    <td colSpan={compact ? 5 : 7} className="px-5 py-10 text-center text-[13px] text-[#615D59]">
                      {compact && (query || filterCount) ? "검색·필터 조건에 맞는 재고가 없습니다." : "아직 하드웨어 원본 데이터가 없습니다. 시트 가져오기를 먼저 실행하세요."}
                    </td>
                  </tr>
                ) : (
                  stockPagination.pageItems.map((row) => (
                    <tr key={row.itemId} className={`align-top transition-colors ${selectedItemId === row.itemId ? "bg-[#ECFDF5]" : "hover:bg-[#FAFAF8]"}`}>
                      <td className="px-5 py-3.5">
                        <p className="text-[13px] font-bold text-[#111110]">{onSelectItem ? <button type="button" onClick={() => onSelectItem(row.itemId)} aria-pressed={selectedItemId === row.itemId} className="text-left hover:text-[#084734]">{row.product}</button> : row.product}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-1 text-[11px] text-[#615D59]">
                          <span>{row.category ?? "미분류"} · 최소 {row.reorderPoint}대 · 리드타임 {row.leadTimeDays}일</span>
                          {lotTrackedById.get(row.itemId) === false ? <span>· 수량만 관리</span> : null}
                          {canAdminister ? (
                            <button
                              type="button"
                              onClick={() => setSettingsItemId(row.itemId)}
                              aria-label={`${row.product} 품목 설정(최소재고·물류번호 관리)`}
                              title="품목 설정 — 최소재고·리드타임·물류번호 관리·보고 묶음·정렬"
                              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#A39E98] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                            >
                              <Settings2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          ) : null}
                        </p>
                        {row.lotBalances.length > 0 && (
                          // 물류번호별 잔여 — 서버 resolveHardwareLotBalances(출고·확정이 쓰는 같은 해석기)가 낸 값이다.
                          // 화면에서 따로 합산하지 않는다. 합이 창고와 다를 수 있다(로트 없는 증가분은 귀속되지 않는다).
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <span className="text-[10px] font-bold tracking-[0.05em] text-[#A39E98]">물류번호 잔여</span>
                            {(expandedLots.has(row.itemId) ? row.lotBalances : row.lotBalances.slice(0, LOT_CHIP_LIMIT)).map((lot) => (
                              <span
                                key={lot.lot}
                                title={`${lot.lot} 잔여 ${formatNumber(lot.quantity)}대`}
                                className={`rounded bg-[#F6F5F4] px-1.5 py-0.5 text-[11px] font-semibold text-[#31302E] ${MONO_META_CLASS}`}
                              >
                                {formatLotLabel(lot.lot) ?? lot.lot} <span className="tabular-nums">{formatNumber(lot.quantity)}대</span>
                              </span>
                            ))}
                            {row.lotBalances.length > LOT_CHIP_LIMIT && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedLots((current) => {
                                    const next = new Set(current)
                                    if (next.has(row.itemId)) next.delete(row.itemId)
                                    else next.add(row.itemId)
                                    return next
                                  })
                                }
                                aria-expanded={expandedLots.has(row.itemId)}
                                className="cursor-pointer rounded bg-[#ECFDF5] px-1.5 py-0.5 text-[11px] font-semibold text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                              >
                                {expandedLots.has(row.itemId) ? "접기" : `+${row.lotBalances.length - LOT_CHIP_LIMIT}`}
                              </button>
                            )}
                            {(() => {
                              const lotTotal = row.lotBalances.reduce((total, lot) => total + lot.quantity, 0)
                              return lotTotal !== row.availableStock ? (
                                <span className="text-[10.5px] text-[#A39E98]" title="물류번호 잔여 합계는 배송 예정까지 뺀 값입니다. 물류번호 없이 기록된 증가분은 어느 번호에도 들어가지 않습니다.">
                                  합 {formatNumber(lotTotal)}대
                                </span>
                              ) : null
                            })()}
                          </div>
                        )}
                        {compact ? <details className="mt-2 text-[11px] text-[#615D59]"><summary className="cursor-pointer">최근 출고·빠른 처리</summary><p className="mt-2">30일 {formatNumber(row.outbound30d)}대 · 주 {formatAvg(row.weeklyOutboundAvg)}대</p><div className="mt-2 flex gap-2"><QuickMoveButton kind="sale" bare product={row.product} onClick={() => prepareQuickEntry(row.itemId, "sale")} /><QuickMoveButton kind="planned" bare product={row.product} onClick={() => prepareQuickEntry(row.itemId, "planned")} />{showInbound ? <QuickMoveButton kind="inbound" bare product={row.product} onClick={() => prepareQuickEntry(row.itemId, "inbound")} /> : null}{canAdminister ? <button type="button" onClick={() => setAdjustTarget({ itemId: row.itemId })} className="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 text-[11px] font-semibold text-[#615D59] hover:text-[#111110]"><Scale className="h-3 w-3" aria-hidden />조정</button> : null}</div></details> : null}
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
                        {compact ? <div className="ml-auto w-16"><StockAvailabilityGauge warehouse={row.warehouseStock} available={row.availableStock} planned={row.plannedOut} caption={false} /></div> : null}
                      </td>
                      {!compact ? <td className="px-4 py-3.5 text-right">
                        <p className="text-[13px] font-semibold tabular-nums text-[#111110]">{formatNumber(row.outbound30d)}</p>
                        <p className="mt-1 text-[11px] tabular-nums text-[#615D59]">주 {formatAvg(row.weeklyOutboundAvg)}대</p>
                      </td> : null}
                      {!compact ? <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-0.5">
                          <QuickMoveButton kind="sale" bare product={row.product} onClick={() => prepareQuickEntry(row.itemId, "sale")} />
                          <QuickMoveButton kind="planned" bare product={row.product} onClick={() => prepareQuickEntry(row.itemId, "planned")} />
                          {showInbound ? <QuickMoveButton kind="inbound" bare product={row.product} onClick={() => prepareQuickEntry(row.itemId, "inbound")} /> : null}
                          {canAdminister ? (
                            <button
                              type="button"
                              onClick={() => setAdjustTarget({ itemId: row.itemId })}
                              aria-label={`${row.product} 재고 조정`}
                              title="재고 조정"
                              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-[#615D59] transition hover:bg-white hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                            >
                              <Scale className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </td> : null}
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
      {adjustTarget ? (
        <AdjustmentSheet
          initialItemId={adjustTarget.itemId}
          items={activeItems}
          stock={data?.stock ?? []}
          owner={data?.viewer?.name ?? null}
          onClose={() => setAdjustTarget(null)}
          onSaved={afterAdminSave}
        />
      ) : null}
      {settingsItem ? <ItemSettingsSheet item={settingsItem} onClose={() => setSettingsItemId(null)} onSaved={afterAdminSave} /> : null}
    </section>
  )
}

export default memo(StockLevelsSection)
