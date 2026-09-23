"use client"

import { memo, useCallback, useMemo, useState, useEffect } from "react"
import type { Dispatch, SetStateAction } from "react"
import { CheckCheck, Clock3 } from "lucide-react"

import DeleteConfirmDialog from "@/components/admin/DeleteConfirmDialog"
import type { AdminListPaginationResult } from "@/lib/admin-list-pagination"
import ExportActions from "./ExportActions"
import { buildPlannedExportRows } from "./hardware-export"
import {
  collectStalePlannedMovementIds,
  elapsedDaysSince,
  formatDate,
  formatLotLabel,
  formatNumber,
  PaginationControls,
  resolveConfirmQuantity,
  resolvePlannedFifoPreview,
  shiftSelectRange,
  todayKey,
  type HardwareDashboard,
  type HardwareMovement,
  type PlannedFifoPreview,
  type PlannedSelectionConfirmProgress,
  type PlannedSelectionConfirmResult,
} from "./shared"

// 예정 방치 신호 임계 — 예정일로부터 14일이면 주의, 30일이면 확정·정리가 밀린 것으로 본다.
const PLANNED_AGING_WARN_DAYS = 14
const PLANNED_AGING_DANGER_DAYS = 30

interface PlannedGroup {
  key: string
  customer: string
  owner: string | null
  date: string | null
  lot: string | null
  totalQty: number
  items: HardwareMovement[]
}

interface PlannedOutboundPanelProps {
  data: HardwareDashboard | null
  plannedMovementQuantity: number
  plannedStaleGroupCount: number
  // hardware.finalize 표시용 — 없으면 확정 버튼을 비활성+사유 툴팁으로 내린다(강제는 서버 게이트).
  canFinalize: boolean
  startPlannedEntry: () => void
  plannedConfirmLocked: boolean
  plannedPagination: AdminListPaginationResult<PlannedGroup>
  setPlannedPage: Dispatch<SetStateAction<number>>
  confirmQtys: Record<string, string>
  setConfirmQtys: Dispatch<SetStateAction<Record<string, string>>>
  plannedConfirmResults: Record<string, { ok: boolean; message: string }>
  confirmDates: Record<string, string>
  setConfirmDates: Dispatch<SetStateAction<Record<string, string>>>
  editMovement: (movement: HardwareMovement) => void
  confirmingId: string | null
  confirmingGroupKey: string | null
  confirmPlannedGroup: (group: { key: string; customer: string; items: HardwareMovement[] }) => Promise<void>
  confirmPlannedMovement: (movement: HardwareMovement, override?: { quantity?: number; occurredAt?: string }) => Promise<void>
  // 일괄 체크(감사 2026-09-14) — 부모(HardwareInventoryClient)가 기존 confirmPlannedMovementRequest를
  // 순차 재사용해 실행하고, 진행률·결과(plannedConfirmResults 재사용)·알림·refresh까지 책임진다.
  // 이 패널은 선택 UI(체크박스·퀵 액션·확인 다이얼로그)만 소유한다 — 네트워크 호출은 만들지 않는다.
  confirmPlannedSelection: (
    entries: Array<{ movement: HardwareMovement; quantity: number }>,
    occurredAt: string
  ) => Promise<PlannedSelectionConfirmResult>
  selectionConfirmProgress: PlannedSelectionConfirmProgress | null
  // 선택 개수를 부모에 알린다 — 부모의 "빠른 기록" 떠 있는 버튼(fixed bottom-6 right-6)이 하단 일괄
  // 작업 바의 "선택 확정" 버튼을 가린다(1440px 폭 실측: 두 버튼 영역이 겹침). 선택 중에는 일괄 작업
  // 바가 이 화면의 주 작업면이므로 부모가 그 버튼을 내린다.
  onSelectionCountChange?: (count: number) => void
  // 기록 생성·수정 권한(표시용, 하드웨어 라운드 2 H-14) — 읽기 역할은 등록·수정을 누를 수 없다(강제는 서버).
  canWrite?: boolean
}

function PlannedOutboundPanel({
  data,
  plannedMovementQuantity,
  plannedStaleGroupCount,
  canFinalize,
  startPlannedEntry,
  plannedConfirmLocked,
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
  confirmPlannedMovement,
  confirmPlannedSelection,
  selectionConfirmProgress,
  onSelectionCountChange,
  canWrite = true,
}: PlannedOutboundPanelProps) {
  // 일괄 체크 선택 상태 — 패널 로컬 state. plannedPagination은 부모 plannedPage state가 바뀔 때
  // 값만 갱신될 뿐 이 컴포넌트 인스턴스를 언마운트하지 않으므로, 페이지를 넘겨도 선택이 그대로
  // 유지된다(요청사항 ①.2 "선택 상태는 페이지를 넘어도 유지"). 홈 탭을 벗어나면 초기화되는데
  // 이는 페이지네이션과 무관한 별개 동작이라 요구사항 범위 밖으로 둔다.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())


  // 홈 탭을 벗어나 이 패널이 사라지면 선택도 사라진다 — 부모가 옛 개수를 들고 있으면 다른 탭에서
  // 빠른 기록 버튼이 계속 숨는다. 언마운트 때 0 으로 되돌린다.
  useEffect(() => () => onSelectionCountChange?.(0), [onSelectionCountChange])
  // Shift+클릭 범위 선택의 기준점(anchor) — 마지막으로 클릭한 행 id. 일반 클릭·Shift 클릭 모두 갱신한다.
  const [lastCheckedId, setLastCheckedId] = useState<string | null>(null)
  const [bulkConfirmDate, setBulkConfirmDate] = useState(() => todayKey())
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)

  // useMemo로 감싸 참조를 안정시킨다 — 감싸지 않으면 매 렌더 새 배열(??의 폴백 [])이 만들어져
  // 아래 staleIds·selectedMovements useMemo의 의존성이 매번 바뀐 것으로 잡힌다(eslint
  // react-hooks/exhaustive-deps 경고).
  const allPlanned = useMemo(() => data?.plannedMovements ?? [], [data?.plannedMovements])
  // 현재 페이지에 "보이는 순서" 그대로 — Shift+클릭 범위 선택은 이 순서를 기준으로 한다
  // (요청사항 ①.8: "현재 페이지의 표시 순서 기준").
  const pageOrderedIds = useMemo(
    () => plannedPagination.pageItems.flatMap((group) => group.items.map((item) => item.id)),
    [plannedPagination.pageItems]
  )
  // "30일+ 미확정 선택" 대상 — 페이지가 아니라 대기 중인 전체 예정 출고 기준(패널 헤더의
  // plannedStaleGroupCount 배지와 동일 임계값·동일 범위).
  const staleIds = useMemo(() => collectStalePlannedMovementIds(allPlanned, PLANNED_AGING_DANGER_DAYS), [allPlanned])
  const selectedMovements = useMemo(() => allPlanned.filter((movement) => selectedIds.has(movement.id)), [allPlanned, selectedIds])
  // 선택 개수는 지금 큐에 있는 행만 센다(하드웨어 라운드 2 H-6) — 행·그룹 확정으로 큐에서 사라진 id 가 선택에 남아
  // "선택 N건"과 대수가 어긋나고, 부모의 빠른 기록 버튼·단축키가 계속 꺼져 있었다.
  const selectedCount = selectedMovements.length
  useEffect(() => {
    onSelectionCountChange?.(selectedCount)
  }, [selectedCount, onSelectionCountChange])
  // 큐에서 사라진 id 는 selectedMovements·selectedCount 에서 이미 빠진다 — 확인창·일괄 확정도 selectedMovements 만 쓴다.
  // 행별 수량 입력을 그대로 존중한다(요청사항 ①.3) — 사용자가 건드린 값이 있으면 그 값, 없으면 전량.
  const selectedQuantityTotal = useMemo(
    () => selectedMovements.reduce((total, movement) => total + resolveConfirmQuantity(movement, confirmQtys), 0),
    [selectedMovements, confirmQtys]
  )

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectRange = useCallback(
    (anchorId: string, targetId: string) => {
      setSelectedIds((current) => {
        const next = new Set(current)
        for (const id of shiftSelectRange(pageOrderedIds, anchorId, targetId)) next.add(id)
        return next
      })
    },
    [pageOrderedIds]
  )

  const selectGroup = useCallback((groupIds: string[]) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      const allSelected = groupIds.length > 0 && groupIds.every((id) => next.has(id))
      for (const id of groupIds) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setLastCheckedId(null)
  }, [])

  const runConfirmSelection = useCallback(async () => {
    setBulkConfirmOpen(false)
    const entries = selectedMovements.map((movement) => ({
      movement,
      quantity: resolveConfirmQuantity(movement, confirmQtys),
    }))
    const { failedIds } = await confirmPlannedSelection(entries, bulkConfirmDate)
    // 끝나면 성공한 행은 선택에서 빼고 실패한 행만 선택으로 남겨 재시도가 쉽게 한다(요청사항 ①.5).
    setSelectedIds(new Set(failedIds))
    setLastCheckedId(null)
  }, [selectedMovements, confirmQtys, confirmPlannedSelection, bulkConfirmDate])

  const hasPlanned = (data?.plannedMovements.length ?? 0) > 0

  return (
    <section
      // id: 홈 요약 밴드(SummaryBand)의 "예정 출고 대기" 칸이 앵커 스크롤로 여기를 가리킨다
      // (감사 2026-09-14, 홈 가시성 개편).
      id="hardware-section-planned"
      data-testid="hardware-planned-info-panel"
      className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#FBF1E0] text-[#A8741A]">
            <Clock3 className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-bold tracking-[-0.01em] text-[#111110]">예상 출고</span>
            <span className="mt-1 block text-[12px] text-[#615D59]">배송 예정 물량을 확정하면 현재 lot 재고를 기준으로 FIFO 배정 후 실제 출고로 전환됩니다.</span>
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {/* 방치 요약 — 큐 전체가 한 달 넘게 미확정으로 쌓이는 상황(판매 요약이 0으로 보이는 원인)을
              헤더에서 바로 드러낸다. */}
          {plannedStaleGroupCount > 0 && (
            <span
              className="rounded-full bg-[#FCE9E9] px-2.5 py-1 text-[11px] font-bold tabular-nums text-[#8F2C2C]"
              title={`예정일로부터 ${PLANNED_AGING_DANGER_DAYS}일 이상 미확정인 딜 수 — 확정하거나 정리하세요`}
            >
              30일+ 미확정 {formatNumber(plannedStaleGroupCount)}딜
            </span>
          )}
          <span className="text-[11px] font-semibold tabular-nums text-[#615D59]">
            {formatNumber(data?.plannedMovements.length ?? 0)}건 · {formatNumber(plannedMovementQuantity)}대
          </span>
          {/* 연락·배차용 목록 — 선택이 있으면 선택분, 없으면 전체(하드웨어 라운드 2 H-15). */}
          {hasPlanned && (
            <ExportActions
              subject={selectedCount > 0 ? `선택한 예정 출고 ${selectedCount}건` : "예정 출고"}
              fileBaseName="하드웨어_예정출고"
              rowCount={selectedCount > 0 ? selectedCount : allPlanned.length}
              buildRows={() => buildPlannedExportRows(selectedCount > 0 ? selectedMovements : allPlanned, todayKey())}
              size="xs"
            />
          )}
          <button
            type="button"
            onClick={startPlannedEntry}
            disabled={plannedConfirmLocked || !canWrite}
            title={canWrite ? undefined : "읽기 권한 계정은 예상 출고를 등록할 수 없습니다"}
            className="inline-flex items-center gap-1.5 cursor-pointer rounded-md bg-[#084734] px-3 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Clock3 className="h-3.5 w-3.5" />
            예상 출고 등록
          </button>
        </div>
      </div>
      {hasPlanned && (
        // 일괄 체크 퀵 액션 — 딜 여러 개를 가로질러 골라 한 번에 확정하기 위한 진입점(요청사항 ①.2).
        // 항상 노출하고 대상이 없을 때만 개별적으로 비활성화한다(레이아웃이 선택 여부에 따라
        // 들쭉날쭉하지 않게).
        <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-5 py-2">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#A39E98]">빠른 선택</span>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set(allPlanned.map((movement) => movement.id)))}
            disabled={plannedConfirmLocked}
            title="현재 페이지가 아니라 대기 중인 예정 출고 전체를 선택합니다"
            className="cursor-pointer rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1 text-[11px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            전체 선택 (전체 {formatNumber(allPlanned.length)}건)
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set(staleIds))}
            disabled={plannedConfirmLocked || staleIds.length === 0}
            title="예정일로부터 30일 이상 미확정인 건만 선택합니다"
            className="cursor-pointer rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1 text-[11px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            30일+ 미확정 선택{staleIds.length > 0 ? ` (${formatNumber(staleIds.length)}건)` : ""}
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={plannedConfirmLocked || selectedCount === 0}
            className="cursor-pointer rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1 text-[11px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            선택 해제
          </button>
        </div>
      )}
      {(data?.plannedMovements.length ?? 0) === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-[#615D59]">
          현재 배송 예정 기록이 없습니다. 예상 출고 등록으로 미리 차감할 물량을 잡아두세요.
        </p>
      ) : (
        <>
          <div className="divide-y divide-[rgba(0,0,0,0.06)]">
            {plannedPagination.pageItems.map((group) => {
              const elapsed = elapsedDaysSince(group.date)
              const groupIds = group.items.map((item) => item.id)
              const selectedInGroup = groupIds.filter((id) => selectedIds.has(id)).length
              return (
              <div key={group.key} data-testid="hardware-planned-info-group" className="px-5 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2.5">
                    {/* 그룹(딜) 전체 선택 — 부분 선택이면 indeterminate(요청사항 ①.1). indeterminate는
                        JSX 속성이 없어 콜백 ref로 DOM 프로퍼티를 직접 설정한다. */}
                    {/* 누름 영역을 넓힌다(하드웨어 라운드 2 H-18) — 체크박스 16px 은 모바일 44px·웹 24px 기준에 못 미쳤다. */}
                    <label className="-m-3.5 inline-flex shrink-0 cursor-pointer p-3.5 md:-m-1 md:p-1">
                    <input
                      type="checkbox"
                      ref={(el: HTMLInputElement | null) => {
                        if (el) el.indeterminate = selectedInGroup > 0 && selectedInGroup < groupIds.length
                      }}
                      checked={groupIds.length > 0 && selectedInGroup === groupIds.length}
                      onChange={() => selectGroup(groupIds)}
                      disabled={plannedConfirmLocked}
                      aria-label={`${group.customer} 전체 선택`}
                      title="이 딜의 품목을 모두 선택"
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-[rgba(0,0,0,0.25)] text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    </label>
                    <div className="min-w-0">
                      <p title={group.customer} className="truncate text-[13.5px] font-bold text-[#111110]">{group.customer}</p>
                      <p className="mt-0.5 text-[11px] text-[#615D59]">
                        {group.date ? formatDate(group.date) : "일자 미정"} · {group.owner ?? "담당자 미정"}
                        {group.lot ? ` · ${formatLotLabel(group.lot) ?? group.lot}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {elapsed != null && elapsed >= PLANNED_AGING_WARN_DAYS && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold tabular-nums ${
                          elapsed >= PLANNED_AGING_DANGER_DAYS ? "bg-[#FCE9E9] text-[#8F2C2C]" : "bg-[#FBF1E0] text-[#7A520F]"
                        }`}
                        title="예정일로부터 경과한 일수 — 오래 방치된 예정은 확정하거나 정리하세요"
                      >
                        {formatNumber(elapsed)}일 경과
                      </span>
                    )}
                    <span className="rounded-full bg-[#FBF1E0] px-2.5 py-1 text-[11px] font-bold tabular-nums text-[#7A520F]">
                      {formatNumber(group.totalQty)}대 · {formatNumber(group.items.length)}품목
                    </span>
                    <button
                      type="button"
                      onClick={() => void confirmPlannedGroup(group)}
                      disabled={plannedConfirmLocked || !canFinalize}
                      title={canFinalize ? undefined : "출고 확정에는 확정 권한(hardware.finalize)이 필요합니다"}
                      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md bg-[#084734] px-2.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      {confirmingGroupKey === group.key ? "확정 중" : "전체 확정"}
                    </button>
                  </div>
                </div>
                <div className="mt-2 divide-y divide-[rgba(0,0,0,0.05)] overflow-hidden rounded-lg border border-[rgba(0,0,0,0.06)] bg-[#FAFAF8]">
                  {group.items.map((movement) => {
                    const confirmQty = resolveConfirmQuantity(movement, confirmQtys)
                    const stockRow = data?.stock.find((row) => row.itemId === movement.item_id || row.product === movement.product_name)
                    const fifoPreview = resolvePlannedFifoPreview(movement, stockRow, confirmQty)
                    const confirmResult = plannedConfirmResults[movement.id]
                    const checked = selectedIds.has(movement.id)
                    return (
                      <div
                        key={movement.id}
                        data-testid="hardware-planned-info-row"
                        data-movement-id={movement.id}
                        className="grid gap-2 px-3 py-2 md:grid-cols-[auto_1fr_auto] md:items-center"
                      >
                        <div className="flex items-center">
                          {/* 행 체크박스 — 네이티브 input이라 스페이스 토글·포커스 링이 기본 제공된다
                              (요청사항 ①.8). Shift+클릭 범위 선택은 onClick에서 shiftKey를 읽어
                              기본 토글(change)을 preventDefault로 막고 직접 범위를 적용한다. */}
                          <label className="-m-3.5 inline-flex shrink-0 cursor-pointer p-3.5 md:-m-1 md:p-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onClick={(event) => {
                              if (!event.shiftKey) return
                              event.preventDefault()
                              if (lastCheckedId) selectRange(lastCheckedId, movement.id)
                              else toggleSelected(movement.id)
                              setLastCheckedId(movement.id)
                            }}
                            onChange={() => {
                              toggleSelected(movement.id)
                              setLastCheckedId(movement.id)
                            }}
                            disabled={plannedConfirmLocked}
                            aria-label={`${movement.product_name} 선택`}
                            title="Shift+클릭으로 범위 선택"
                            className="h-4 w-4 shrink-0 cursor-pointer rounded border-[rgba(0,0,0,0.25)] text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          </label>
                        </div>
                        <div className="min-w-0">
                          <p title={movement.product_name} className="truncate text-[12.5px] font-semibold text-[#111110]">
                            {movement.product_name} <span className="tabular-nums text-[#7A520F]">· {formatNumber(movement.quantity)}대</span>
                          </p>
                          <p className="mt-1 truncate text-[11px] font-bold">
                            <PlannedFifoPreviewText preview={fifoPreview} />
                          </p>
                          {confirmResult && (
                            // 실패 사유는 자르지 않는다(H-7) — 서버가 돌려준 원인이 잘리면 고칠 수가 없다.
                            <p
                              role={confirmResult.ok ? "status" : "alert"}
                              title={confirmResult.message}
                              className={`mt-1 text-[11px] font-bold ${confirmResult.ok ? "truncate text-[#084734]" : "break-words text-[#8F2C2C]"}`}
                            >
                              {confirmResult.message}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {/* 라벨 없는 인풋 2개(수량·날짜)가 나란히 있으면 용도를 추측해야 한다 — 마이크로 라벨로 명시. */}
                          <label className="flex cursor-pointer items-center gap-1" title="확정 수량 (부분 확정 가능)">
                            <span className="text-[10.5px] font-bold text-[#A39E98]">수량</span>
                            <input
                              type="number"
                              min={1}
                              max={movement.quantity}
                              value={confirmQtys[movement.id] ?? String(movement.quantity)}
                              onChange={(event) => setConfirmQtys((current) => ({ ...current, [movement.id]: event.target.value }))}
                              disabled={plannedConfirmLocked}
                              className="h-8 w-14 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-center text-[11px] font-bold text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 disabled:cursor-not-allowed disabled:bg-[#F6F5F4] disabled:text-[#A39E98]"
                            />
                          </label>
                          <label className="flex cursor-pointer items-center gap-1" title="출고 확정일">
                            <span className="text-[10.5px] font-bold text-[#A39E98]">확정일</span>
                            <input
                              type="date"
                              value={confirmDates[movement.id] ?? todayKey()}
                              onChange={(event) => setConfirmDates((current) => ({ ...current, [movement.id]: event.target.value }))}
                              disabled={plannedConfirmLocked}
                              className="h-8 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[11px] font-semibold text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 disabled:cursor-not-allowed disabled:bg-[#F6F5F4] disabled:text-[#A39E98]"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => editMovement(movement)}
                            disabled={plannedConfirmLocked || !canWrite}
                            title={canWrite ? undefined : "읽기 권한 계정은 수정할 수 없습니다"}
                            className="cursor-pointer rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            수정
                          </button>
                          {/* 행 확정은 아웃라인 — solid green이 행마다 반복되면 그룹의 "전체 확정"(주 CTA)과 경쟁한다. */}
                          <button
                            type="button"
                            onClick={() => void confirmPlannedMovement(movement)}
                            disabled={plannedConfirmLocked || !canFinalize}
                            title={canFinalize ? undefined : "출고 확정에는 확정 권한(hardware.finalize)이 필요합니다"}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#084734] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            {confirmingId === movement.id ? "확정 중" : "출고 확정"}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              )
            })}
          </div>
          <PaginationControls pagination={plannedPagination} label="딜" onPageChange={setPlannedPage} />
          {selectedCount > 0 && (
            // 하단 고정(sticky) 일괄 작업 바(요청사항 ①.3) — fixed(뷰포트 전체 폭)가 아니라
            // sticky로 이 섹션(<section>) 안에서만 바닥에 붙인다. 이유: fixed는 사이드바 폭·
            // 1616px 콘텐츠 캡을 이 파일이 모르는 상위 레이아웃과 직접 좌표를 맞춰야 해서
            // 다른 팀 소유 레이아웃과 어긋날 위험이 있다. sticky는 이 섹션의 실제 폭을 그대로
            // 물려받아 좌우 정렬이 항상 맞고, 모바일에서도 별도 처리 없이 화면 폭에 맞게
            // flex-wrap으로 접힌다(요청사항 ①.6 모바일 가림 방지).
            <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(0,0,0,0.08)] bg-white px-5 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[12.5px] font-bold tabular-nums text-[#111110]">
                  선택 {formatNumber(selectedCount)}건 · {formatNumber(selectedQuantityTotal)}대
                </span>
                {selectionConfirmProgress ? (
                  <span className="text-[11.5px] font-semibold tabular-nums text-[#7A520F]">
                    {formatNumber(selectionConfirmProgress.index)} / {formatNumber(selectionConfirmProgress.total)} 확정 중…
                  </span>
                ) : (
                  <label className="flex cursor-pointer items-center gap-1.5" title="선택한 건에 공통 적용할 확정일">
                    <span className="text-[10.5px] font-bold text-[#A39E98]">확정일</span>
                    <input
                      type="date"
                      value={bulkConfirmDate}
                      onChange={(event) => setBulkConfirmDate(event.target.value)}
                      disabled={plannedConfirmLocked}
                      className="h-8 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[11px] font-semibold text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 disabled:cursor-not-allowed disabled:bg-[#F6F5F4] disabled:text-[#A39E98]"
                    />
                  </label>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={plannedConfirmLocked}
                  className="cursor-pointer rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[11.5px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  선택 해제
                </button>
                {/* 선택 확정은 그룹 "전체 확정"과 같은 solid green 주 CTA — 여러 딜을 가로지르는
                    이 화면의 유일한 기본 액션이라 경쟁하는 CTA가 없다. */}
                <button
                  type="button"
                  onClick={() => setBulkConfirmOpen(true)}
                  disabled={plannedConfirmLocked || !canFinalize}
                  title={canFinalize ? undefined : "출고 확정에는 확정 권한(hardware.finalize)이 필요합니다"}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-[#084734] px-3.5 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {selectionConfirmProgress ? "확정 중" : "선택 확정"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {/* 되돌리기 어려운 동작 확인 — window.confirm 대신 저장소 공용 다이얼로그(일반화된
          DeleteConfirmDialog)를 쓴다(요청사항 ①.6). destructive=false: 삭제가 아니라 정상
          업무 흐름(출고 확정)이라 Danger 빨강이 아니라 Classin Green 주 버튼으로 그린다. */}
      <DeleteConfirmDialog
        open={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={() => void runConfirmSelection()}
        loading={selectionConfirmProgress != null}
        destructive={false}
        title="선택한 예정 출고 확정"
        description={`${formatNumber(selectedCount)}건 ${formatNumber(selectedQuantityTotal)}대를 확정일 ${bulkConfirmDate}로 확정합니다.${bulkConfirmDate !== todayKey() ? " 오늘이 아닌 날짜입니다 — 확인하세요." : ""} 로트가 모자란 수량은 로트 미지정으로 기록됩니다.`}
        confirmLabel="확정"
        confirmLoadingLabel="확정 중…"
        cancelLabel="취소"
        irreversibleNote="출고 확정은 되돌릴 수 없습니다."
      />
    </section>
  )
}

// FIFO 미리보기 문구 렌더링 — resolvePlannedFifoPreview(shared.tsx, 순수 판정)의 결과를
// kind별로 다른 색으로 그린다. 매칭된 배정분(matched)은 기존 그대로 Success(그린), 로트
// 미지정분(unassigned)은 Danger가 아니라 Warning(주황) 톤으로 낮춰 "확정이 막힌다"가 아니라
// "참고하되 진행된다"는 신호로 읽히게 한다(요청사항 ② — 신정책: 로트가 모자라도 확정은
// 막히지 않고 나머지가 로트 미지정으로 기록된다).
function PlannedFifoPreviewText({ preview }: { preview: PlannedFifoPreview }) {
  if (preview.kind === "assigned") return <span className="text-[#084734]">지정 lot {preview.label}</span>
  if (preview.kind === "unavailable") return <span className="text-[#084734]">FIFO 예상 없음</span>
  if (preview.kind === "no-lot-records") {
    // 로트 잔량 기록 자체가 없는 품목(OPS·케이블 등) — "부족"이 아니라 애초에 lot 추적 대상이
    // 아니라는 뜻이라 문구로 명확히 구분한다(요청사항 ②).
    return <span className="text-[#A8741A]">로트 기록 없음 — 로트 미지정으로 출고</span>
  }
  return (
    <>
      <span className="text-[#084734]">{preview.matchedText ? `FIFO 예상 ${preview.matchedText}` : "FIFO 예상"}</span>
      {preview.unassignedQty > 0 && (
        <span className="ml-1 text-[#A8741A]">· 로트 미지정 {formatNumber(preview.unassignedQty)}대</span>
      )}
    </>
  )
}

export default memo(PlannedOutboundPanel)
