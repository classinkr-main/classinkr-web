"use client"

// 홈 탭 본문 — HardwareInventoryClient(오케스트레이터)에서 그대로 잘라낸 구조 분해다.
// 감사(2026-09-07 #6): 5,481줄 중 4,793줄이 단일 컴포넌트 함수였다. 탭 경계를 파일로 나누고
// 부모가 next/dynamic으로 지연 로드하면, 다른 탭 상태 변경이 이 트리를 재조정하지 않는다.
// 순수 구조 분해 원칙 — state/handler는 전부 부모 소유 그대로 props로 받는다(동작 변경 없음).
import type { ComponentProps, Dispatch, SetStateAction } from "react"
import { motion } from "framer-motion"

import AlertsOutboundSections from "./AlertsOutboundSections"
import CategoryCardsSection from "./CategoryCardsSection"
import CrmOrderBacklogSection from "./CrmOrderBacklogSection"
import HardwareSearchPanel from "./HardwareSearchPanel"
import HomeQuickRecord from "./HomeQuickRecord"
import OfficeSamplePoolSection from "./OfficeSamplePoolSection"
import OrderApprovalSection from "./OrderApprovalSection"
import PlannedOutboundPanel from "./PlannedOutboundPanel"
import PlannedOutboundOverview from "./PlannedOutboundOverview"
import SalesDashboardSection from "./SalesDashboardSection"
import SampleTrackerSection from "./SampleTrackerSection"
import SnapshotRestorePanel from "./SnapshotRestorePanel"
import StockLevelsSection from "./StockLevelsSection"
import SummaryBand from "./SummaryBand"
import { todayKey, type HardwareDashboard, type HardwareSectionKey } from "./shared"

interface HomeTabPanelProps {
  activePanelId: string
  activeTabId: string
  reduceMotion: boolean | null
  data: HardwareDashboard | null
  categoryCards: {
    cards: ComponentProps<typeof CategoryCardsSection>["categoryCards"]
    etcSummary: ComponentProps<typeof CategoryCardsSection>["etcSummary"]
  }
  openOutboundDetail: NonNullable<ComponentProps<typeof SalesDashboardSection>["onOpenDetail"]>
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
  // 일괄 체크(감사 2026-09-14) — PlannedOutboundPanel의 선택 확정 실행기·진행률. 부모
  // (HardwareInventoryClient)가 소유하고 이 파일은 그대로 통과시키기만 한다(다른 prop과 동일 원칙).
  confirmPlannedSelection: ComponentProps<typeof PlannedOutboundPanel>["confirmPlannedSelection"]
  selectionConfirmProgress: ComponentProps<typeof PlannedOutboundPanel>["selectionConfirmProgress"]
  onPlannedSelectionCountChange: ComponentProps<typeof PlannedOutboundPanel>["onSelectionCountChange"]
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
  canWriteHardware: ComponentProps<typeof CrmOrderBacklogSection>["canWrite"]
  homeQuickRecord: ComponentProps<typeof HomeQuickRecord>
}

export default function HomeTabPanel({
  activePanelId,
  activeTabId,
  reduceMotion,
  data,
  categoryCards,
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
  confirmPlannedSelection,
  selectionConfirmProgress,
  onPlannedSelectionCountChange,
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
  canWriteHardware,
  homeQuickRecord,
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
    {/* 숫자 요약과 제품군별 게이지를 먼저 보고, 표·출고 작업으로 이어진다. */}
    <SummaryBand data={data} plannedMovementQuantity={plannedMovementQuantity} plannedStaleGroupCount={plannedStaleGroupCount} />

    <CategoryCardsSection categoryCards={categoryCards.cards} etcSummary={categoryCards.etcSummary} />

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <StockLevelsSection
        compact
        openSections={openSections}
        toggleSection={toggleSection}
        data={data}
        stockPagination={stockPagination}
        setStockPage={setStockPage}
        prepareQuickEntry={prepareQuickEntry}
        selectedItemId={homeQuickRecord.draft.itemId}
        onSelectItem={itemId => homeQuickRecord.setDraft(current => ({ ...current, itemId }))}
      />
      <HomeQuickRecord {...homeQuickRecord} />
    </div>

    <details className="border-t border-[rgba(0,0,0,0.08)] pt-3"><summary className="cursor-pointer text-[13px] font-semibold text-[#615D59]">출고 예정 요약 · {plannedPagination.totalItems}묶음</summary><div className="mt-3 max-w-xl"><PlannedOutboundOverview plannedPagination={plannedPagination} startPlannedEntry={startPlannedEntry} plannedConfirmLocked={plannedConfirmLocked} /></div></details>

    {/* 견적이 승인된 하드웨어 오더 — 승인하면 오더번호와 배송 예정이 생긴다(2026-10-22 연결 로직 S3). */}
    <OrderApprovalSection onChanged={refresh} stockRows={data?.stock} />

    {/* 예정 큐 바로 위 — 등록할 것을 먼저 보고, 그 아래에서 확정한다(입력 가속 P2-1). */}
    <CrmOrderBacklogSection canWrite={canWriteHardware} onRegistered={refresh} />

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
      confirmPlannedSelection={confirmPlannedSelection}
      selectionConfirmProgress={selectionConfirmProgress}
      onSelectionCountChange={onPlannedSelectionCountChange}
    />

    {/* 판매대시보드(정의서) — 서버 집계. 원장 응답(data)이 바뀌면 같이 다시 받는다. */}
    <SalesDashboardSection reloadKey={data} onOpenDetail={openOutboundDetail} />

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

    {/* 사무실·샘플 재고 풀(2026-09-15) — 예전 "재고 위치 맵" 자리. 위치 맵의 남은/나간 샘플은 원장 위치 잔량이었는데,
        사무실·샘플은 유닛(관리번호)이 정본이라는 운영자 결정에 따라 창고·가용과 함께 유닛 기준 사무실 가용·전시·대여를
        한 표로 보여 준다. 대여·반납은 기존 빠른 기록의 샘플 프리셋으로 연다(원장 기록 + 유닛 선택). */}
    <OfficeSamplePoolSection
      stockRows={data?.stock ?? null}
      sampleUnits={sampleUnits}
      sampleUnitsLoading={sampleUnitsLoading}
      sampleUnitsError={sampleUnitsError}
      canWrite
      todayKey={todayKey()}
      onLoan={(_productName, _availableUnitIds, itemId) => prepareQuickEntry(itemId ?? "", "sample")}
      onReturn={(_productName, itemId) => prepareQuickEntry(itemId ?? "", "sampleReturn")}
      onOpenUnit={setSampleUnitSheetId}
      onUnitsChanged={loadSampleUnits}
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

    {/* 되돌리기는 사고 대응용 안전망이라 일상 확인 흐름(요약·예정 출고·재고) 아래, 맨 끝에 접어 둔다(#4). */}
    <SnapshotRestorePanel canFinalize={canFinalize} onRestored={refresh} />
    </motion.div>
  )
}
