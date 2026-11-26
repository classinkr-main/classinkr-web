"use client"

// 홈 탭 본문 — HardwareInventoryClient(오케스트레이터)에서 그대로 잘라낸 구조 분해다.
// 감사(2026-09-07 #6): 5,481줄 중 4,793줄이 단일 컴포넌트 함수였다. 탭 경계를 파일로 나누고
// 부모가 next/dynamic으로 지연 로드하면, 다른 탭 상태 변경이 이 트리를 재조정하지 않는다.
// 순수 구조 분해 원칙 — state/handler는 전부 부모 소유 그대로 props로 받는다(동작 변경 없음).
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type Dispatch, type MouseEvent, type SetStateAction } from "react"
import { motion } from "framer-motion"
import { ChevronRight } from "lucide-react"

import AlertsOutboundSections from "./AlertsOutboundSections"
import CategoryCardsSection from "./CategoryCardsSection"
import CrmOrderBacklogSection from "./CrmOrderBacklogSection"
import HardwareSearchPanel from "./HardwareSearchPanel"
import HardwareTotalsBand from "./HardwareTotalsBand"
import HomeLedgerSection from "./HomeLedgerSection"
import HomeQuickRecord from "./HomeQuickRecord"
import { buildOfficeSamplePool } from "./office-sample-pool"
import OfficeSamplePoolSection from "./OfficeSamplePoolSection"
import OrderApprovalSection from "./OrderApprovalSection"
import PlannedOutboundPanel from "./PlannedOutboundPanel"
import SalesDashboardSection from "./SalesDashboardSection"
import SampleTrackerSection from "./SampleTrackerSection"
import SnapshotRestorePanel from "./SnapshotRestorePanel"
import StockLevelsSection from "./StockLevelsSection"
import { formatNumber, hardwareCardGroup, todayKey, type HardwareDashboard, type HardwareMovement, type HardwareSectionKey } from "./shared"

// 원장이 없을 때도 같은 참조 — 새 [] 를 넘기면 memo 된 원장이 매번 다시 그린다.
const EMPTY_MOVEMENTS: HardwareMovement[] = []

interface HomeTabPanelProps {
  activePanelId: string
  activeTabId: string
  reduceMotion: boolean | null
  data: HardwareDashboard | null
  /** 판매대시보드 재조회 신호 — data 객체가 아니라 부모가 올리는 원시 카운터. */
  salesReloadKey: number
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
  // 스냅샷 복원은 hardware.finalize 그대로(정의서 §권한 밖).
  canFinalize: ComponentProps<typeof SnapshotRestorePanel>["canFinalize"]
  movementButtonState: ComponentProps<typeof PlannedOutboundPanel>["movementButtonState"]
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
  salesReloadKey,
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
  movementButtonState,
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
  const moreRef = useRef<HTMLDetailsElement>(null)
  const openHistory = useCallback(() => setActiveTab("history"), [setActiveTab])
  // 배송 예정 일괄 선택 수 — 부모는 이 값이 0보다 크면 새 기록·헤더 버튼·FAB 를 잠근다.
  // 선택(과 선택 막대)이 접힌 "더 보기" 안에 숨지 않도록, 선택이 있는 동안은 접기를 막고 요약 줄에 알린다.
  const [plannedSelected, setPlannedSelected] = useState(0)
  const onSelectionCountChange = useCallback((count: number) => {
    setPlannedSelected(count)
    onPlannedSelectionCountChange?.(count)
  }, [onPlannedSelectionCountChange])
  const onSummaryClick = useCallback((event: MouseEvent<HTMLElement>) => {
    if (plannedSelected > 0 && moreRef.current?.open) event.preventDefault()
  }, [plannedSelected])

  // 카드 "샘플" 칸 — 나간 샘플 유닛 수(유닛 정본, 원장 위치 잔량 아님). 판촉형은 카드와 같이 뺀다.
  // 유닛을 아직 못 받았으면 칸을 숨긴다(null).
  const cards = useMemo(() => {
    if (!sampleUnits) return categoryCards.cards
    const loaned = new Map<string, number>()
    for (const row of buildOfficeSamplePool({ stockRows: data?.stock, sampleUnits, todayKey: todayKey() }).rows) {
      if (row.promoted) continue
      const group = hardwareCardGroup(row.product)
      loaned.set(group, (loaned.get(group) ?? 0) + row.loaned.count)
    }
    return categoryCards.cards.map((card) => ({ ...card, samples: loaned.get(card.key) ?? 0 }))
  }, [categoryCards.cards, data?.stock, sampleUnits])

  // "더 보기" 안 섹션(#hardware-section-*)을 가리키는 앵커·해시 — 접힌 채면 스크롤할 자리가 없어 먼저 연다.
  const revealInMore = useCallback((id: string): HTMLElement | null => {
    const more = moreRef.current
    const target = id.startsWith("hardware-section-") ? document.getElementById(id) : null
    if (!more || !target || !more.contains(target)) return null
    more.open = true
    return target
  }, [])
  // 같은 화면 앵커(예: 오더 승인의 "배송 예정 보기") — 브라우저 기본 스크롤 전에 연다.
  const onClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const href = (event.target as Element).closest?.('a[href^="#hardware-section-"]')?.getAttribute("href")
    if (href) revealInMore(href.slice(1))
  }, [revealInMore])
  // 다른 화면 딥링크(/admin/hardware#hardware-section-planned)·뒤로 가기 — 열고 직접 스크롤한다.
  // 처리한 해시는 URL 에서 지운다 — 남겨 두면 홈 탭에 돌아올 때(재마운트)마다 다시 열고 내려간다.
  useEffect(() => {
    const onHash = () => {
      const target = revealInMore(window.location.hash.slice(1))
      if (!target) return
      target.scrollIntoView({ block: "start" })
      // null 상태 = Next 라우터가 새 URL 을 받아 들인다(부모 URL 동기화 effect 와 같은 방식).
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
    }
    onHash()
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [revealInMore])
  // ?hq= 로 되살아난 통합검색 — 검색 패널이 "더 보기" 안이라 결과가 보이게 연다(빈 값 → 값이 생길 때만).
  const hasHardwareSearch = hardwareSearch.trim() !== ""
  useEffect(() => {
    if (hasHardwareSearch && moreRef.current) moreRef.current.open = true
  }, [hasHardwareSearch])

  // 예전 요약 밴드의 경고 두 가지 — 묵은 배송 예정(판매 요약이 0으로 보이는 원인)과 부족·주문 검토 품목.
  // 근거 섹션은 "더 보기" 안이라 앵커 클릭 시 onClickCapture 가 먼저 연다.
  const shortageCount = useMemo(() => data?.stock.filter(row => row.low || row.orderRecommended).length ?? 0, [data?.stock])

  return (
    <motion.div
      id={activePanelId}
      role="tabpanel"
      aria-labelledby={activeTabId}
      className="space-y-5"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
      onClickCapture={onClickCapture}
    >
    {/* 위에서부터: 전자칠판 합계 → 제품 카드 → 새 기록 → 입출고 원장 → 처리 큐. 나머지는 맨 아래 "더 보기". */}
    <HardwareTotalsBand cards={categoryCards.cards} />

    {plannedStaleGroupCount > 0 || shortageCount > 0 ? (
      <div className="flex flex-wrap gap-2">
        {plannedStaleGroupCount > 0 ? (
          <a href="#hardware-section-planned" className="inline-flex min-h-11 items-center md:min-h-8 rounded-md border border-[#C9973F] bg-white px-2.5 text-[12px] font-bold tabular-nums text-[#8A5A0E] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40">
            30일+ 미확정 {formatNumber(plannedStaleGroupCount)}딜 →
          </a>
        ) : null}
        {shortageCount > 0 ? (
          <a href="#hardware-section-stock" className="inline-flex min-h-11 items-center md:min-h-8 rounded-md border border-[#C9973F] bg-white px-2.5 text-[12px] font-bold tabular-nums text-[#8A5A0E] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40">
            부족 · 주문 검토 {formatNumber(shortageCount)}품목 →
          </a>
        ) : null}
      </div>
    ) : null}

    <CategoryCardsSection categoryCards={cards} etcSummary={categoryCards.etcSummary} />

    <HomeQuickRecord {...homeQuickRecord} />

    <HomeLedgerSection
      movements={data?.movements ?? EMPTY_MOVEMENTS}
      setDetailId={setDetailId}
      confirmPlannedMovement={confirmPlannedMovement}
      plannedConfirmLocked={plannedConfirmLocked}
      movementButtonState={movementButtonState}
      onOpenHistory={openHistory}
    />

    {/* 견적이 승인된 하드웨어 오더 — 승인하면 오더번호와 배송 예정이 생긴다(2026-10-22 연결 로직 S3). */}
    <OrderApprovalSection onChanged={refresh} stockRows={data?.stock} />

    {/* 등록할 CRM 오더 — 처리 큐라 접지 않고 원장 바로 아래에 둔다(입력 가속 P2-1). */}
    <CrmOrderBacklogSection canWrite={canWriteHardware} onRegistered={refresh} />

    {/* 접어 둔 나머지 — 닫혀 있어도 마운트는 그대로(일괄 확정 선택·검색 상태가 유지된다).
        그룹 이름(more)을 붙여야 안쪽 섹션의 group-hover·group-open 이 이 details 에 엮이지 않는다. */}
    <details ref={moreRef} className="group/more rounded-xl border border-[rgba(0,0,0,0.08)] bg-white">
      <summary onClick={onSummaryClick} className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#615D59] transition-transform group-open/more:rotate-90 motion-reduce:transition-none" />
        <span className="text-[14px] font-bold text-[#111110]">더 보기</span>
        <span className="min-w-0 text-[12px] text-[#615D59]">재고 표 · 배송 예정 일괄 확정 · 판매 집계 · 검색 · 사무실·샘플 · 알림 · 복원</span>
        {plannedSelected > 0 ? (
          <span className="text-[12px] font-semibold tabular-nums text-[#8A5A0E]">
            배송 예정 {formatNumber(plannedSelected)}건 선택 중 · 확정하거나 선택 해제해야 접히고 새 기록이 열립니다
          </span>
        ) : null}
      </summary>
      <div className="space-y-5 border-t border-[rgba(0,0,0,0.08)] p-3 sm:p-4">
        <StockLevelsSection
          compact
          openSections={openSections}
          toggleSection={toggleSection}
          data={data}
          stockPagination={stockPagination}
          setStockPage={setStockPage}
          prepareQuickEntry={prepareQuickEntry}
          onStockChanged={refresh}
          selectedItemId={homeQuickRecord.draft.itemId}
          onSelectItem={itemId => homeQuickRecord.setDraft(current => ({ ...current, itemId }))}
        />

        <PlannedOutboundPanel
          data={data}
          plannedMovementQuantity={plannedMovementQuantity}
          plannedStaleGroupCount={plannedStaleGroupCount}
          movementButtonState={movementButtonState}
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
          onSelectionCountChange={onSelectionCountChange}
        />

        {/* 판매대시보드(정의서) — 서버 집계. 원장을 새로 받았거나 기록을 저장했을 때만(salesReloadKey) 다시 받는다. */}
        <SalesDashboardSection reloadKey={salesReloadKey} onOpenDetail={openOutboundDetail} />

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
          movementButtonState={movementButtonState}
          setCustomerDetail={setCustomerDetail}
          canWrite={canWriteHardware}
          canInbound={data?.viewer?.canManageInventory !== false}
        />

        {/* 사무실·샘플 재고 풀(2026-09-15) — 예전 "재고 위치 맵" 자리. 위치 맵의 남은/나간 샘플은 원장 위치 잔량이었는데,
            사무실·샘플은 유닛(관리번호)이 정본이라는 운영자 결정에 따라 창고·가용과 함께 유닛 기준 사무실 가용·전시·대여를
            한 표로 보여 준다. 대여·반납은 기존 빠른 기록의 샘플 프리셋으로 연다(원장 기록 + 유닛 선택). */}
        <OfficeSamplePoolSection
          stockRows={data?.stock ?? null}
          sampleUnits={sampleUnits}
          sampleUnitsLoading={sampleUnitsLoading}
          sampleUnitsError={sampleUnitsError}
          canWrite={canWriteHardware}
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
          canManageInventory={data?.viewer?.canManageInventory}
        />

        {/* 되돌리기는 사고 대응용 안전망이라 일상 확인 흐름(요약·예정 출고·재고) 아래, 맨 끝에 접어 둔다(#4). */}
        <SnapshotRestorePanel canFinalize={canFinalize} onRestored={refresh} />
      </div>
    </details>
    </motion.div>
  )
}
