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
import ImportFreshnessStrip from "./ImportFreshnessStrip"
import OfficeSamplePoolSection from "./OfficeSamplePoolSection"
import PlannedOutboundPanel from "./PlannedOutboundPanel"
import SalesPeriodSummary from "./SalesPeriodSummary"
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
  // 가져오기·업로드 진행 중 — 스냅샷 복원을 막는다(하드웨어 라운드 2 S-4).
  importBusy: boolean
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
  importBusy,
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
    {/* 위계(개편 2026-09-14, 홈 가시성 — 요청사항 ③.3): 요약 밴드 → 이관 신선도(경고) →
        예정 출고(오늘 할 일) → 재고 현황(카드+표, 품목·로트) → 판매 요약 → 검색 → 위치 → 샘플 →
        알림·로그 → 스냅샷 복원.
        예전 순서(검색 → 예정 출고 → 위치 → 재고표)에서 예정 출고를 맨 위로, 재고 카드/표를
        판매 요약보다 위로, 검색을 아래로 옮겼다 — "할 일(확정 대기)"과 "지금 재고"를 화면
        상단에서 먼저 보여주고, 검색·위치·샘플처럼 필요할 때 찾아 쓰는 도구성 섹션은 아래로
        내린다는 원칙(요청사항 본문)을 그대로 따른 것이다. CategoryCardsSection(4축 카드)은
        지시문에 명시된 8단계에는 없지만 "재고 현황(품목·로트)"의 요약판이라 StockLevelsSection
        (표)과 한 묶음으로 바로 위에 둔다.
        이 순서를 소스 문자열로 고정한 기존 테스트는 없다(2026-09-14 확인, tests/hardware·
        tests/admin 전수 검색 — HomeTabPanel·PlannedOutboundPanel을 참조하는 테스트 자체가
        없었다) — 그래서 별도 테스트 갱신 없이 순서만 바꿨다. 되돌리기는 사고 대응용 안전망이라
        기존처럼 맨 끝에 접어 둔다(#4). */}
    <SummaryBand data={data} plannedMovementQuantity={plannedMovementQuantity} plannedStaleGroupCount={plannedStaleGroupCount} />

    <ImportFreshnessStrip
      importRun={data?.importRun ?? null}
      importRunLastSuccess={data?.importRunLastSuccess ?? null}
      mirror={data?.mirror ?? null}
      importCosting={data?.importCosting}
    />

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

    <CategoryCardsSection categoryCards={categoryCards.cards} etcSummary={categoryCards.etcSummary} />

    <StockLevelsSection
      openSections={openSections}
      toggleSection={toggleSection}
      data={data}
      stockPagination={stockPagination}
      setStockPage={setStockPage}
      prepareQuickEntry={prepareQuickEntry}
    />

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
    <SnapshotRestorePanel
      canFinalize={canFinalize}
      onRestored={refresh}
      disabled={importBusy}
      importRunId={data?.importRun?.id ?? null}
    />
    </motion.div>
  )
}
