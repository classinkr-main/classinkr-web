"use client"

// 홈 탭 본문 — HardwareInventoryClient(오케스트레이터)에서 그대로 잘라낸 구조 분해다.
// 감사(2026-09-07 #6): 5,481줄 중 4,793줄이 단일 컴포넌트 함수였다. 탭 경계를 파일로 나누고
// 부모가 next/dynamic으로 지연 로드하면, 다른 탭 상태 변경이 이 트리를 재조정하지 않는다.
// 순수 구조 분해 원칙 — state/handler는 전부 부모 소유 그대로 props로 받는다(동작 변경 없음).
import type { ComponentProps, Dispatch, SetStateAction } from "react"
import { motion } from "framer-motion"

import AlertsOutboundSections from "./AlertsOutboundSections"
import CategoryCardsSection from "./CategoryCardsSection"
import HardwareSearchPanel from "./HardwareSearchPanel"
import ImportFreshnessStrip from "./ImportFreshnessStrip"
import LocationMapSection from "./LocationMapSection"
import PlannedOutboundPanel from "./PlannedOutboundPanel"
import SalesPeriodSummary from "./SalesPeriodSummary"
import SampleTrackerSection from "./SampleTrackerSection"
import SnapshotRestorePanel from "./SnapshotRestorePanel"
import StockLevelsSection from "./StockLevelsSection"
import type { HardwareDashboard, HardwareSectionKey } from "./shared"

interface HomeTabPanelProps {
  activePanelId: string
  activeTabId: string
  reduceMotion: boolean | null
  data: HardwareDashboard | null
  categoryCards: {
    cards: ComponentProps<typeof CategoryCardsSection>["categoryCards"]
    etcSummary: ComponentProps<typeof CategoryCardsSection>["etcSummary"]
  }
  salesPeriodSummary: ComponentProps<typeof SalesPeriodSummary>["summary"]
  openOutboundDetail: ComponentProps<typeof SalesPeriodSummary>["onOpenDetail"]
  hardwareSearch: ComponentProps<typeof HardwareSearchPanel>["hardwareSearch"]
  setHardwareSearch: ComponentProps<typeof HardwareSearchPanel>["setHardwareSearch"]
  hardwareSearchResults: ComponentProps<typeof HardwareSearchPanel>["hardwareSearchResults"]
  prepareQuickEntry: ComponentProps<typeof HardwareSearchPanel>["prepareQuickEntry"]
  setActiveTab: ComponentProps<typeof HardwareSearchPanel>["setActiveTab"]
  setHistoryType: ComponentProps<typeof HardwareSearchPanel>["setHistoryType"]
  setProductFilter: ComponentProps<typeof HardwareSearchPanel>["setProductFilter"]
  setCustomerFilter: ComponentProps<typeof HardwareSearchPanel>["setCustomerFilter"]
  setSearch: ComponentProps<typeof HardwareSearchPanel>["setSearch"]
  setLotFilter: ComponentProps<typeof HardwareSearchPanel>["setLotFilter"]
  setMovementsPage: ComponentProps<typeof HardwareSearchPanel>["setMovementsPage"]
  confirmPlannedMovement: ComponentProps<typeof HardwareSearchPanel>["confirmPlannedMovement"]
  plannedConfirmLocked: ComponentProps<typeof HardwareSearchPanel>["plannedConfirmLocked"]
  canFinalize: ComponentProps<typeof HardwareSearchPanel>["canFinalize"]
  setCustomerDetail: ComponentProps<typeof HardwareSearchPanel>["setCustomerDetail"]
  plannedMovementQuantity: ComponentProps<typeof PlannedOutboundPanel>["plannedMovementQuantity"]
  plannedStaleGroupCount: ComponentProps<typeof PlannedOutboundPanel>["plannedStaleGroupCount"]
  startPlannedEntry: ComponentProps<typeof PlannedOutboundPanel>["startPlannedEntry"]
  plannedPagination: ComponentProps<typeof PlannedOutboundPanel>["plannedPagination"]
  setPlannedPage: ComponentProps<typeof PlannedOutboundPanel>["setPlannedPage"]
  confirmQtys: ComponentProps<typeof PlannedOutboundPanel>["confirmQtys"]
  setConfirmQtys: ComponentProps<typeof PlannedOutboundPanel>["setConfirmQtys"]
  plannedConfirmResults: ComponentProps<typeof PlannedOutboundPanel>["plannedConfirmResults"]
  confirmDates: ComponentProps<typeof PlannedOutboundPanel>["confirmDates"]
  setConfirmDates: ComponentProps<typeof PlannedOutboundPanel>["setConfirmDates"]
  editMovement: ComponentProps<typeof PlannedOutboundPanel>["editMovement"]
  confirmingId: ComponentProps<typeof PlannedOutboundPanel>["confirmingId"]
  confirmingGroupKey: ComponentProps<typeof PlannedOutboundPanel>["confirmingGroupKey"]
  confirmPlannedGroup: ComponentProps<typeof PlannedOutboundPanel>["confirmPlannedGroup"]
  locationMap: ComponentProps<typeof LocationMapSection>["locationMap"]
  locationMapExpanded: ComponentProps<typeof LocationMapSection>["locationMapExpanded"]
  setLocationMapExpanded: ComponentProps<typeof LocationMapSection>["setLocationMapExpanded"]
  openSections: Record<HardwareSectionKey, boolean>
  toggleSection: ComponentProps<typeof StockLevelsSection>["toggleSection"]
  stockPagination: ComponentProps<typeof StockLevelsSection>["stockPagination"]
  setStockPage: ComponentProps<typeof StockLevelsSection>["setStockPage"]
  sampleUnits: ComponentProps<typeof SampleTrackerSection>["units"]
  sampleLatestEvents: ComponentProps<typeof SampleTrackerSection>["latestEvents"]
  sampleUnitsLoading: ComponentProps<typeof SampleTrackerSection>["loading"]
  sampleUnitsError: ComponentProps<typeof SampleTrackerSection>["error"]
  setSampleUnitSheetId: Dispatch<SetStateAction<string | null>>
  loadSampleUnits: ComponentProps<typeof SampleTrackerSection>["onChanged"]
  alertsPagination: ComponentProps<typeof AlertsOutboundSections>["alertsPagination"]
  setAlertsPage: ComponentProps<typeof AlertsOutboundSections>["setAlertsPage"]
  mutedAlerts: ComponentProps<typeof AlertsOutboundSections>["mutedAlerts"]
  outboundPagination: ComponentProps<typeof AlertsOutboundSections>["outboundPagination"]
  setOutboundPage: ComponentProps<typeof AlertsOutboundSections>["setOutboundPage"]
  // 감사(2026-09-11) — "나간 기록" 행 클릭 시 상세 시트를 여는 데 쓴다(HistoryLogSection과 같은 상태).
  setDetailId: Dispatch<SetStateAction<string | null>>
  // 감사(2026-09-07 #4) — SnapshotRestorePanel이 복원 성공 후 대시보드를 다시 불러오는 데 쓴다.
  refresh: ComponentProps<typeof SnapshotRestorePanel>["onRestored"]
}

export default function HomeTabPanel({
  activePanelId,
  activeTabId,
  reduceMotion,
  data,
  categoryCards,
  salesPeriodSummary,
  openOutboundDetail,
  hardwareSearch,
  setHardwareSearch,
  hardwareSearchResults,
  prepareQuickEntry,
  setActiveTab,
  setHistoryType,
  setProductFilter,
  setCustomerFilter,
  setSearch,
  setLotFilter,
  setMovementsPage,
  confirmPlannedMovement,
  plannedConfirmLocked,
  canFinalize,
  setCustomerDetail,
  plannedMovementQuantity,
  plannedStaleGroupCount,
  startPlannedEntry,
  plannedPagination,
  setPlannedPage,
  confirmQtys,
  setConfirmQtys,
  plannedConfirmResults,
  confirmDates,
  setConfirmDates,
  editMovement,
  confirmingId,
  confirmingGroupKey,
  confirmPlannedGroup,
  locationMap,
  locationMapExpanded,
  setLocationMapExpanded,
  openSections,
  toggleSection,
  stockPagination,
  setStockPage,
  sampleUnits,
  sampleLatestEvents,
  sampleUnitsLoading,
  sampleUnitsError,
  setSampleUnitSheetId,
  loadSampleUnits,
  alertsPagination,
  setAlertsPage,
  mutedAlerts,
  outboundPagination,
  setOutboundPage,
  setDetailId,
  refresh,
}: HomeTabPanelProps) {
  return (
    <motion.div
      id={activePanelId}
      role="tabpanel"
      aria-labelledby={activeTabId}
      className="space-y-5"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
    >
    {/* 위계: 이관 신선도 → 현황 요약(카드·판매) → 검색 → 대기 작업(예상 출고) → 재고 상세(위치·표) → 샘플 → 알림·로그.
        예상 출고는 확정을 기다리는 할 일이라 재고 상세보다 위, 샘플 트래커는 참조 성격이라 아래에 둔다. */}
    <ImportFreshnessStrip importRun={data?.importRun ?? null} importCosting={data?.importCosting} />

    <CategoryCardsSection categoryCards={categoryCards.cards} etcSummary={categoryCards.etcSummary} />

    <SalesPeriodSummary summary={salesPeriodSummary} onOpenDetail={openOutboundDetail} />

    <HardwareSearchPanel
      hardwareSearch={hardwareSearch}
      setHardwareSearch={setHardwareSearch}
      hardwareSearchResults={hardwareSearchResults}
      prepareQuickEntry={prepareQuickEntry}
      setActiveTab={setActiveTab}
      setHistoryType={setHistoryType}
      setProductFilter={setProductFilter}
      setCustomerFilter={setCustomerFilter}
      setSearch={setSearch}
      setLotFilter={setLotFilter}
      setMovementsPage={setMovementsPage}
      confirmPlannedMovement={confirmPlannedMovement}
      plannedConfirmLocked={plannedConfirmLocked}
      canFinalize={canFinalize}
      setCustomerDetail={setCustomerDetail}
    />

    <PlannedOutboundPanel
      data={data}
      plannedMovementQuantity={plannedMovementQuantity}
      plannedStaleGroupCount={plannedStaleGroupCount}
      canFinalize={canFinalize}
      startPlannedEntry={startPlannedEntry}
      plannedConfirmLocked={plannedConfirmLocked}
      plannedPagination={plannedPagination}
      setPlannedPage={setPlannedPage}
      confirmQtys={confirmQtys}
      setConfirmQtys={setConfirmQtys}
      plannedConfirmResults={plannedConfirmResults}
      confirmDates={confirmDates}
      setConfirmDates={setConfirmDates}
      editMovement={editMovement}
      confirmingId={confirmingId}
      confirmingGroupKey={confirmingGroupKey}
      confirmPlannedGroup={confirmPlannedGroup}
      confirmPlannedMovement={confirmPlannedMovement}
    />

    <LocationMapSection
      locationMap={locationMap}
      locationMapExpanded={locationMapExpanded}
      setLocationMapExpanded={setLocationMapExpanded}
      prepareQuickEntry={prepareQuickEntry}
    />

    <StockLevelsSection
      openSections={openSections}
      toggleSection={toggleSection}
      data={data}
      stockPagination={stockPagination}
      setStockPage={setStockPage}
      prepareQuickEntry={prepareQuickEntry}
    />

    <SampleTrackerSection
      units={sampleUnits}
      latestEvents={sampleLatestEvents}
      loading={sampleUnitsLoading}
      error={sampleUnitsError}
      stock={data?.stock ?? null}
      onOpenUnit={setSampleUnitSheetId}
      onChanged={loadSampleUnits}
    />

    <AlertsOutboundSections
      openSections={openSections}
      toggleSection={toggleSection}
      alertsPagination={alertsPagination}
      setAlertsPage={setAlertsPage}
      mutedAlerts={mutedAlerts}
      outboundPagination={outboundPagination}
      setOutboundPage={setOutboundPage}
      prepareQuickEntry={prepareQuickEntry}
      setDetailId={setDetailId}
    />

    {/* 되돌리기는 사고 대응용 안전망이라 일상 확인 흐름(요약·검색·대기 작업) 아래, 맨 끝에 접어 둔다(#4). */}
    <SnapshotRestorePanel canFinalize={canFinalize} onRestored={refresh} />
    </motion.div>
  )
}
