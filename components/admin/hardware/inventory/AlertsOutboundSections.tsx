"use client"

import { memo, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { ChevronDown } from "lucide-react"

import type { AdminListPaginationResult } from "@/lib/admin-list-pagination"
import {
  ALERT_TONE,
  formatDate,
  formatNumber,
  PaginationControls,
  QuickMoveButton,
  SectionHeader,
  type HardwareAlert,
  type HardwareMovement,
  type HardwareSectionKey,
} from "./shared"

interface AlertsOutboundSectionsProps {
  openSections: Record<HardwareSectionKey, boolean>
  toggleSection: (section: HardwareSectionKey) => void
  alertsPagination: AdminListPaginationResult<HardwareAlert>
  setAlertsPage: Dispatch<SetStateAction<number>>
  // 미가동 품목(창고 0·예정 0·최근 출고 0)의 상시 부족 알림 — 접힌 그룹으로 강등해
  // 실신호(음수 재고·재고 있는 부족)가 소음에 묻히지 않게 한다.
  mutedAlerts: HardwareAlert[]
  outboundPagination: AdminListPaginationResult<HardwareMovement>
  setOutboundPage: Dispatch<SetStateAction<number>>
  // 감사(2026-09-11) — 알림 카드에 판매/예정/입고 원탭 액션을 붙이는 데 쓴다(StockLevelsSection과
  // 동일한 QuickMoveButton 재사용). alert.itemId를 그대로 넘긴다.
  prepareQuickEntry: (itemId: string, presetKey: string) => void
  // "나간 기록" 행 클릭 → 상세 시트(MovementDetailSheet)를 연다. 내역 탭 HistoryLogSection과
  // 같은 role="button"+onClick+onKeyDown 패턴(이 파일 하단).
  setDetailId: Dispatch<SetStateAction<string | null>>
}

function AlertsOutboundSections({
  openSections,
  toggleSection,
  alertsPagination,
  setAlertsPage,
  mutedAlerts,
  outboundPagination,
  setOutboundPage,
  prepareQuickEntry,
  setDetailId,
}: AlertsOutboundSectionsProps) {
  const [mutedOpen, setMutedOpen] = useState(false)
  return (
    // id: 홈 요약 밴드(SummaryBand)의 "부족·주문 검토" 칸은 표(재고 상세)로 스크롤하지만,
    // 알림 카드 쪽 소비처를 위해 이 묶음에도 앵커를 심어 둔다(감사 2026-09-14, 홈 가시성 개편).
    <div id="hardware-section-alerts" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <SectionHeader
          title="알림"
          description="부족, 주문 검토, 배송 예정 항목입니다."
          open={openSections.alerts}
          onToggle={() => toggleSection("alerts")}
          meta={<span className="text-[11px] font-semibold text-[#615D59]">{formatNumber(alertsPagination.totalItems)}건</span>}
        />
        {openSections.alerts && (
          <>
            <div className="space-y-2 p-4">
              {alertsPagination.totalItems === 0 ? (
                <div className="rounded-lg bg-[#ECFDF5] px-4 py-3 text-[12px] font-semibold text-[#084734]">
                  {mutedAlerts.length > 0 ? "실행이 필요한 알림이 없습니다." : "현재 알림이 없습니다."}
                </div>
              ) : (
                alertsPagination.pageItems.map((alert) => (
                  <div key={alert.id} className={`rounded-lg border px-3 py-2.5 ${ALERT_TONE[alert.severity]}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold">{alert.product} · {alert.title}</p>
                        <p className="mt-1 text-[11px] opacity-95">{alert.detail}</p>
                      </div>
                      {/* 원탭 조치 — StockLevelsSection 재고행과 같은 QuickMoveButton 재사용. bg-white로
                          알림 톤 배경(빨강/주황/그린 옅은 배경) 위에서도 버튼 hover 색이 또렷하게 남는다. */}
                      <div className="inline-flex shrink-0 rounded-md border border-[rgba(0,0,0,0.08)] bg-white p-0.5">
                        <QuickMoveButton kind="sale" bare product={alert.product} onClick={() => prepareQuickEntry(alert.itemId, "sale")} />
                        <QuickMoveButton kind="planned" bare product={alert.product} onClick={() => prepareQuickEntry(alert.itemId, "planned")} />
                        <QuickMoveButton kind="inbound" bare product={alert.product} onClick={() => prepareQuickEntry(alert.itemId, "inbound")} />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <PaginationControls pagination={alertsPagination} label="건" onPageChange={setAlertsPage} />
            {mutedAlerts.length > 0 && (
              <div className="border-t border-[rgba(0,0,0,0.06)] px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => setMutedOpen((value) => !value)}
                  aria-expanded={mutedOpen}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-[11.5px] font-semibold text-[#A39E98] transition hover:text-[#615D59] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                  title="창고 0 · 예정 0 · 최근 30일 출고 0인 미가동 품목의 상시 부족 알림"
                >
                  비활성 품목 알림 {formatNumber(mutedAlerts.length)}건
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mutedOpen ? "rotate-180" : ""}`} />
                </button>
                {mutedOpen && (
                  <div className="mt-2 space-y-1.5">
                    {mutedAlerts.map((alert) => (
                      <div key={alert.id} className="rounded-lg border border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-3 py-2">
                        <p className="text-[11.5px] font-semibold text-[#615D59]">
                          {alert.product} · {alert.title}
                          <span className="ml-2 font-normal text-[#A39E98]">{alert.detail}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <section className="min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <SectionHeader
          title="나간 기록"
          description="고객사 기준으로 최근 출고·배송 예정 물량이 어디로 갔는지 확인합니다."
          open={openSections.outbound}
          onToggle={() => toggleSection("outbound")}
          meta={<span className="text-[11px] font-semibold text-[#615D59]">{formatNumber(outboundPagination.totalItems)}건</span>}
        />
        {openSections.outbound && (
          <>
            {outboundPagination.totalItems > 0 && (
              <div className="hidden grid-cols-[1.1fr_1fr_120px] gap-3 border-b border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-[#615D59] md:grid">
                <span>고객사</span>
                <span>제품</span>
                <span className="text-right">수량</span>
              </div>
            )}
            <div className="divide-y divide-[rgba(0,0,0,0.06)]">
              {outboundPagination.totalItems === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-[#615D59]">출고 기록이 없습니다.</p>
              ) : (
                outboundPagination.pageItems.map((movement) => (
                  <div
                    key={movement.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailId(movement.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        setDetailId(movement.id)
                      }
                    }}
                    className="grid cursor-pointer gap-3 px-5 py-3 transition hover:bg-[#FAFAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 md:grid-cols-[1.1fr_1fr_120px] md:items-center"
                  >
                    <div className="min-w-0">
                      <p title={movement.to_location ?? "도착지 미정"} className="truncate text-[13px] font-bold text-[#111110]">{movement.to_location ?? "도착지 미정"}</p>
                      <p className="mt-1 text-[11px] text-[#615D59]">
                        {formatDate(movement.occurred_at)} · {movement.owner ?? "담당자 미정"}
                      </p>
                    </div>
                    <p className="text-[12px] font-semibold text-[#31302E]">
                      {movement.product_name}
                      {movement.status ? <span className="ml-2 text-[#7A520F]">{movement.status}</span> : null}
                    </p>
                    <p className="text-right text-[14px] font-bold text-[#111110]">{formatNumber(movement.quantity)}대</p>
                  </div>
                ))
              )}
            </div>
            <PaginationControls pagination={outboundPagination} label="건" onPageChange={setOutboundPage} />
          </>
        )}
      </section>
    </div>
  )
}

export default memo(AlertsOutboundSections)
