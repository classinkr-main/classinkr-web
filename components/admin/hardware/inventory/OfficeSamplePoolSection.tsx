"use client"

import { memo, useId, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import {
  buildOfficeSamplePool,
  isOfficePoolDueSoon,
  isOfficePoolLongLoan,
  OFFICE_POOL_BULK_ACTION_FROM,
  OFFICE_POOL_STATUS_ORDER,
  officePoolDaysBetween,
  officePoolGapTotal,
  officePoolLoanElapsedDays,
  type OfficePoolCounts,
  type OfficeSamplePoolRow,
} from "./office-sample-pool"
import {
  formatNumber,
  MONO_META_CLASS,
  SAMPLE_EVENT_META,
  SAMPLE_STATUS_META,
  type HardwareSampleUnit,
  type HardwareStockRow,
  type SampleUnitStatus,
} from "./shared"

// 사무실·샘플 재고 풀(운영자 결정 2026-09-15) — 유닛(관리번호) 기준으로 사무실 가용을 보여 준다.
// 숫자 판정은 전부 순수 모델(office-sample-pool.ts)이 하고, 이 파일은 표시·선택·일괄 액션만 맡는다.
// 샘플 유닛 데이터는 부모(HardwareInventoryClient)가 한 번 받아 샘플 트래커·빠른 기록 시트와 나눠 쓴다 —
// 이 섹션은 직접 조회하지 않는다. 쓰기 후에는 onUnitsChanged 로 부모가 다시 받게 한다.

export interface OfficeSamplePoolSectionProps {
  stockRows: HardwareStockRow[] | null
  // null = 아직 받지 않음. 부모의 샘플 유닛 상태(sampleUnits)를 그대로 넘긴다.
  sampleUnits: HardwareSampleUnit[] | null
  sampleUnitsLoading?: boolean
  sampleUnitsError?: string | null
  canWrite: boolean
  // 로컬 날짜 YYYY-MM-DD — 90일+·회수 예정 경계와 일괄 액션 처리일에 쓴다.
  todayKey: string
  // itemId 는 이 행의 품목 id(재고 행 기준). 부모가 prepareQuickEntry(itemId, "sample")로 바로 넘길 수 있다.
  onLoan: (productName: string, availableUnitIds: string[], itemId: string | null) => void
  onReturn: (productName: string, itemId: string | null) => void
  onOpenUnit: (unitId: string) => void
  onUnitsChanged: () => Promise<void> | void
}

type FeedbackTone = "error" | "info" | "success"

interface RowFeedback {
  tone: FeedbackTone
  text: string
  // 사무실 가용이 0 일 때 안내와 함께 빠른 기록(창고 반출 경로)을 열 수 있게 한다.
  offerLoanAnyway?: boolean
}

interface CorrectionDraft {
  rowKey: string
  target: SampleUnitStatus | ""
  memo: string
  customer: string
}

const SAMPLES_API = "/api/admin/hardware/samples"

// 정정 성공 문구의 "…(으)로" — 라벨마다 받침이 달라 조사를 붙인 형태로 따로 둔다.
const STATUS_TARGET_PHRASE: Record<SampleUnitStatus, string> = {
  office: "사무실 보관으로",
  showroom: "전시·사내 사용으로",
  loaned: "대여로",
  repair: "수리로",
  converted: "판매 전환으로",
  retired: "폐기로",
}

const OUTLINE_BUTTON_CLASS =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-[rgba(0,0,0,0.1)] bg-white px-2.5 py-1.5 text-[11.5px] font-bold text-[#31302E] transition hover:border-[#084734]/45 hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50"

const INPUT_CLASS =
  "h-9 w-full rounded-md border border-[rgba(0,0,0,0.1)] bg-white px-2.5 text-[12.5px] font-semibold text-[#111110] outline-none transition focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/20"

const CHECKBOX_CLASS =
  "h-4 w-4 shrink-0 cursor-pointer rounded border-[rgba(0,0,0,0.25)] text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:cursor-not-allowed disabled:opacity-50"

// 표 5칸 — 품목 | 창고·가용 | 사무실·가용·전시 | 샘플·90일+ | 액션. 768px 미만은 카드형으로 쌓는다.
// display(grid/hidden)는 쓰는 곳에서 붙인다 — 같은 요소에 hidden 과 grid 가 함께 붙으면 CSS 순서에 따라 갈린다.
const ROW_GRID_COLUMNS =
  "grid-cols-3 gap-x-3 gap-y-2 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_132px] md:items-center md:gap-x-4"

function unitCodes(units: HardwareSampleUnit[], limit = 3): string {
  const codes = units.slice(0, limit).map((unit) => unit.asset_code).join(", ")
  return units.length > limit ? `${codes} 외 ${formatNumber(units.length - limit)}대` : codes
}

function gapDetail(row: OfficePoolCounts): string {
  const parts: string[] = []
  if (row.gaps.office !== 0) {
    parts.push(
      `원장 사무실 잔량 ${formatNumber(row.ledger.office)} · 사무실 유닛 ${formatNumber(row.office.held)}(보관 ${formatNumber(row.office.available)} + 전시 ${formatNumber(row.office.showroom)})`
    )
  }
  if (row.gaps.sample !== 0) {
    parts.push(`원장 샘플 잔량 ${formatNumber(row.ledger.sample)} · 대여 유닛 ${formatNumber(row.loaned.count)}`)
  }
  return parts.join(" / ")
}

function Num({ value, ready = true, accent = false }: { value: number; ready?: boolean; accent?: boolean }) {
  if (!ready) return <span className="font-bold text-[#A39E98]">–</span>
  const tone =
    value < 0 ? "text-[#B43E3E]" : value === 0 ? "text-[#A39E98]" : accent ? "text-[#084734]" : "text-[#111110]"
  return <span className={`font-bold tabular-nums ${tone}`}>{formatNumber(value)}</span>
}

function Dot() {
  return (
    <span aria-hidden className="text-[#A39E98]">
      ·
    </span>
  )
}

function PoolTile({
  label,
  value,
  unit,
  ready = true,
  emphasis = false,
  children,
}: {
  label: string
  value: number
  unit: string
  ready?: boolean
  emphasis?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={`flex min-w-0 flex-col rounded-xl border bg-white p-4 ${
        emphasis ? "border-[#084734]/55" : "border-[rgba(0,0,0,0.08)]"
      }`}
    >
      <p className={`text-[11px] font-bold tracking-[0.04em] ${emphasis ? "text-[#084734]" : "text-[#615D59]"}`}>{label}</p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span
          className={`text-[26px] font-bold leading-none tracking-[-0.03em] tabular-nums ${
            !ready ? "text-[#A39E98]" : value < 0 ? "text-[#B43E3E]" : "text-[#111110]"
          }`}
        >
          {ready ? formatNumber(value) : "–"}
        </span>
        <span className="text-[12px] font-semibold text-[#615D59]">{unit}</span>
      </p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[11.5px] font-semibold text-[#615D59]">
        {children}
      </p>
    </div>
  )
}

function PoolCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10.5px] font-semibold text-[#A39E98] md:sr-only">{label}</span>
      <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1 text-[13px] md:mt-0">{children}</span>
    </div>
  )
}

function OfficeSamplePoolSection({
  stockRows,
  sampleUnits,
  sampleUnitsLoading = false,
  sampleUnitsError = null,
  canWrite,
  todayKey,
  onLoan,
  onReturn,
  onOpenUnit,
  onUnitsChanged,
}: OfficeSamplePoolSectionProps) {
  const baseId = useId()
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set())
  const [showWarehouseOnly, setShowWarehouseOnly] = useState(false)
  const [selection, setSelection] = useState<Record<string, string[]>>({})
  const [correction, setCorrection] = useState<CorrectionDraft | null>(null)
  const [busyRowKey, setBusyRowKey] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Record<string, RowFeedback | undefined>>({})

  const unitsReady = sampleUnits != null
  const pool = useMemo(
    () => buildOfficeSamplePool({ stockRows, sampleUnits, todayKey }),
    [stockRows, sampleUnits, todayKey]
  )
  const activityRows = useMemo(() => pool.rows.filter((row) => row.hasPoolActivity), [pool.rows])
  const warehouseOnlyRows = useMemo(() => pool.rows.filter((row) => !row.hasPoolActivity), [pool.rows])
  const visibleRows = showWarehouseOnly ? [...activityRows, ...warehouseOnlyRows] : activityRows
  const promoted = pool.promotedTotals
  const promotedHasUnits = Boolean(
    promoted && (promoted.office.held !== 0 || promoted.loaned.count !== 0 || promoted.warehouse.stock !== 0)
  )

  const setRowFeedback = (rowKey: string, next: RowFeedback | null) => {
    setFeedback((current) => ({ ...current, [rowKey]: next ?? undefined }))
  }

  const toggleExpanded = (rowKey: string, force?: boolean) => {
    setExpandedKeys((current) => {
      const next = new Set(current)
      const open = force ?? !next.has(rowKey)
      if (open) next.add(rowKey)
      else next.delete(rowKey)
      return next
    })
  }

  const selectedUnitsOf = (row: OfficeSamplePoolRow): HardwareSampleUnit[] => {
    const ids = selection[row.key]
    if (!ids || ids.length === 0) return []
    // 다시 받은 목록에 없는 id(다른 화면에서 바뀐 유닛)는 조용히 빼고 보낸다.
    return row.units.filter((unit) => ids.includes(unit.id))
  }

  const toggleUnit = (rowKey: string, unitId: string) => {
    setSelection((current) => {
      const ids = current[rowKey] ?? []
      const next = ids.includes(unitId) ? ids.filter((id) => id !== unitId) : [...ids, unitId]
      return { ...current, [rowKey]: next }
    })
  }

  const toggleGroup = (rowKey: string, groupIds: string[]) => {
    setSelection((current) => {
      const ids = current[rowKey] ?? []
      const allSelected = groupIds.every((id) => ids.includes(id))
      const next = allSelected ? ids.filter((id) => !groupIds.includes(id)) : Array.from(new Set([...ids, ...groupIds]))
      return { ...current, [rowKey]: next }
    })
  }

  const clearSelection = (rowKey: string) => {
    setSelection((current) => ({ ...current, [rowKey]: [] }))
  }

  const postBulkEvent = async (
    row: OfficeSamplePoolRow,
    units: HardwareSampleUnit[],
    payload: Record<string, unknown>,
    successText: string
  ) => {
    setBusyRowKey(row.key)
    setRowFeedback(row.key, null)
    try {
      await adminFetchJson(SAMPLES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "event",
          unitIds: units.map((unit) => unit.id),
          occurredAt: todayKey,
          ...payload,
        }),
      })
      clearSelection(row.key)
      setCorrection((current) => (current?.rowKey === row.key ? null : current))
      await onUnitsChanged()
      setRowFeedback(row.key, { tone: "success", text: successText })
    } catch (err) {
      setRowFeedback(row.key, { tone: "error", text: err instanceof Error ? err.message : "저장에 실패했습니다." })
    } finally {
      setBusyRowKey(null)
    }
  }

  const runMove = (row: OfficeSamplePoolRow, eventType: "showcase" | "store") => {
    const units = selectedUnitsOf(row)
    const actionLabel = SAMPLE_EVENT_META[eventType].label
    if (units.length === 0) {
      setRowFeedback(row.key, { tone: "info", text: `${actionLabel} 옮길 유닛을 먼저 선택하세요.` })
      return
    }
    const allowed = OFFICE_POOL_BULK_ACTION_FROM[eventType]
    const blocked = units.filter((unit) => !allowed.includes(unit.status))
    if (blocked.length > 0) {
      const fromLabel = allowed.map((status) => SAMPLE_STATUS_META[status].label).join("·")
      setRowFeedback(row.key, {
        tone: "error",
        text: `${actionLabel}는 ${fromLabel} 유닛만 옮길 수 있습니다. ${unitCodes(blocked)}은(는) 선택에서 빼거나 '상태 정정'을 쓰세요.`,
      })
      return
    }
    const successText =
      eventType === "showcase"
        ? `${formatNumber(units.length)}대를 전시·사내 사용으로 옮겼습니다.`
        : `${formatNumber(units.length)}대를 사무실 보관으로 옮겼습니다.`
    void postBulkEvent(row, units, { eventType }, successText)
  }

  const openCorrection = (row: OfficeSamplePoolRow) => {
    if (selectedUnitsOf(row).length === 0) {
      setRowFeedback(row.key, { tone: "info", text: "상태를 정정할 유닛을 먼저 선택하세요." })
      return
    }
    setRowFeedback(row.key, null)
    setCorrection((current) =>
      current?.rowKey === row.key ? null : { rowKey: row.key, target: "", memo: "", customer: "" }
    )
  }

  const submitCorrection = (row: OfficeSamplePoolRow) => {
    if (!correction || correction.rowKey !== row.key) return
    const units = selectedUnitsOf(row)
    if (units.length === 0) {
      setRowFeedback(row.key, { tone: "info", text: "상태를 정정할 유닛을 먼저 선택하세요." })
      return
    }
    if (!correction.target) {
      setRowFeedback(row.key, { tone: "error", text: "정정할 상태를 고르세요." })
      return
    }
    const memoText = correction.memo.trim()
    if (!memoText) {
      setRowFeedback(row.key, { tone: "error", text: "상태 정정에는 사유 메모가 필요합니다." })
      return
    }
    const target = correction.target
    const customer = target === "loaned" ? correction.customer.trim() : ""
    void postBulkEvent(
      row,
      units,
      { eventType: "adjust", nextStatus: target, memo: memoText, ...(customer ? { customer } : {}) },
      `${formatNumber(units.length)}대를 ${STATUS_TARGET_PHRASE[target]} 정정했습니다.`
    )
  }

  const handleLoan = (row: OfficeSamplePoolRow) => {
    if (!unitsReady) {
      setRowFeedback(row.key, { tone: "info", text: "샘플 유닛 목록을 불러온 뒤 대여할 수 있습니다." })
      return
    }
    if (row.office.available === 0) {
      if (row.office.showroom > 0) {
        toggleExpanded(row.key, true)
        setRowFeedback(row.key, {
          tone: "info",
          text: `사무실 가용 유닛이 없습니다. 전시·사내 사용 ${formatNumber(row.office.showroom)}대 중 대여할 유닛을 선택해 '사무실 보관으로' 옮긴 뒤 대여하세요.`,
          offerLoanAnyway: true,
        })
      } else {
        setRowFeedback(row.key, {
          tone: "info",
          text: "사무실 가용 유닛이 없습니다. 창고 재고에서 바로 내보내려면 빠른 기록의 샘플 대여에서 출처를 창고로 바꾸세요.",
          offerLoanAnyway: true,
        })
      }
      return
    }
    setRowFeedback(row.key, null)
    onLoan(row.product, row.availableUnitIds, row.itemId)
  }

  if (!stockRows) {
    return (
      <section
        id="hardware-section-office-pool"
        aria-busy="true"
        className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-5 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
      >
        <p className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">사무실 · 샘플 재고</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3" aria-hidden>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-[104px] animate-pulse rounded-xl bg-[#F0F0EC]" />
          ))}
        </div>
      </section>
    )
  }

  const totals = pool.totals

  return (
    <section
      id="hardware-section-office-pool"
      aria-labelledby={`${baseId}-title`}
      className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
        <div className="min-w-0">
          <p id={`${baseId}-title`} className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">
            사무실 · 샘플 재고
          </p>
          <p className="mt-1 text-[12px] text-[#615D59]">
            유닛(관리번호) 기준입니다. 사무실 보관 = 가용, 대여 = 나간 샘플. 원장 수량은 교차 확인에만 씁니다.
          </p>
        </div>
        {unitsReady && pool.gapRowCount > 0 && (
          <span
            className="shrink-0 rounded-full border border-[#ECD29C] px-2.5 py-1 text-[11px] font-bold tabular-nums text-[#7A520F]"
            title="원장 위치 잔량(사무실·샘플)과 유닛 수가 다른 품목 — 시트는 샘플 반출·회수를 늘 기록하지 않으므로 참고용입니다"
          >
            원장 차이 {formatNumber(pool.gapRowCount)}개 품목
          </span>
        )}
      </div>

      <div className="grid gap-3 px-5 pt-4 md:grid-cols-3">
        <PoolTile label="판매 재고 · 창고" value={totals.warehouse.stock} unit="대 보유">
          <span>가용</span>
          <Num value={totals.warehouse.available} />
          <Dot />
          <span>배송 예정</span>
          <Num value={totals.warehouse.planned} />
        </PoolTile>
        <PoolTile label="클래스인 사무실" value={totals.office.held} unit="대 보유" ready={unitsReady} emphasis>
          <span>가용</span>
          <Num value={totals.office.available} ready={unitsReady} accent />
          <Dot />
          <span>전시·사내 사용</span>
          <Num value={totals.office.showroom} ready={unitsReady} />
        </PoolTile>
        <PoolTile label="나간 샘플" value={totals.loaned.count} unit="대 대여" ready={unitsReady}>
          <span>90일+</span>
          <Num value={totals.loaned.long90} ready={unitsReady} />
          <Dot />
          <span>회수 예정</span>
          <Num value={totals.loaned.dueSoon} ready={unitsReady} />
        </PoolTile>
      </div>
      <p className="px-5 pb-3 pt-2 text-[11px] font-semibold text-[#A39E98]">
        합계는 판촉형 제외
        {promoted && promotedHasUnits && unitsReady ? (
          <span className="tabular-nums">
            {" "}
            · 판촉형 별도: 창고 {formatNumber(promoted.warehouse.stock)} · 사무실 {formatNumber(promoted.office.held)} · 대여{" "}
            {formatNumber(promoted.loaned.count)}
          </span>
        ) : null}
      </p>

      {sampleUnitsError && (
        <p className="border-y border-[rgba(0,0,0,0.06)] bg-[#FCE9E9] px-5 py-2.5 text-[12px] font-semibold text-[#8F2C2C]">
          샘플 유닛을 불러오지 못했습니다: {sampleUnitsError}
        </p>
      )}
      {!unitsReady && !sampleUnitsError && (
        <p className="border-t border-[rgba(0,0,0,0.06)] px-5 py-2 text-[11.5px] font-semibold text-[#A39E98]" aria-live="polite">
          {sampleUnitsLoading ? "샘플 유닛을 불러오는 중…" : "샘플 유닛 목록을 기다리는 중…"}
        </p>
      )}

      {pool.rows.length === 0 ? (
        <p className="border-t border-[rgba(0,0,0,0.06)] px-5 py-8 text-center text-[13px] text-[#615D59]">
          창고 재고와 사무실·샘플 유닛이 없습니다.
        </p>
      ) : (
        <>
          <div
            aria-hidden
            className={`hidden border-y border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-5 py-2 text-[11px] font-bold text-[#615D59] md:grid ${ROW_GRID_COLUMNS}`}
          >
            <span>품목</span>
            <span>창고 · 가용</span>
            <span>사무실 · 가용 · 전시</span>
            <span>샘플 · 90일+</span>
            <span className="text-right">액션</span>
          </div>
          {activityRows.length === 0 && (
            <p className="border-t border-[rgba(0,0,0,0.06)] px-5 py-6 text-center text-[12.5px] text-[#615D59] md:border-t-0">
              사무실·샘플 유닛이나 원장 사무실·샘플 잔량이 있는 품목이 없습니다.
            </p>
          )}
          <ul className="border-t border-[rgba(0,0,0,0.06)] md:border-t-0">
            {visibleRows.map((row, index) => {
              const panelId = `${baseId}-panel-${index}`
              const expanded = expandedKeys.has(row.key)
              const gapTotal = unitsReady ? officePoolGapTotal(row) : 0
              const rowFeedback = feedback[row.key]
              const busy = busyRowKey === row.key
              const selectedUnits = selectedUnitsOf(row)
              const correctionOpen = correction?.rowKey === row.key
              return (
                <li key={row.key} className="border-b border-[rgba(0,0,0,0.06)] last:border-b-0">
                  <div className={`grid px-5 py-3 ${ROW_GRID_COLUMNS}`}>
                    <div className="col-span-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:col-span-1">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(row.key)}
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        aria-label={`${row.product} 유닛 목록`}
                        className="group flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                      >
                        <ChevronRight
                          aria-hidden
                          className={`h-4 w-4 shrink-0 text-[#A39E98] transition-transform group-hover:text-[#111110] ${expanded ? "rotate-90" : ""}`}
                        />
                        <span title={row.product} className="truncate text-[13px] font-bold text-[#111110]">
                          {row.product}
                        </span>
                        {row.promoted && <span className="shrink-0 text-[11px] font-semibold text-[#A39E98]">판촉형</span>}
                      </button>
                      {gapTotal > 0 && (
                        <span
                          title={gapDetail(row)}
                          className="shrink-0 rounded-full border border-[#ECD29C] px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-[#7A520F]"
                        >
                          원장과 {formatNumber(gapTotal)}대 차이
                        </span>
                      )}
                    </div>

                    <PoolCell label="창고 · 가용">
                      <Num value={row.warehouse.stock} />
                      <Dot />
                      <Num value={row.warehouse.available} />
                    </PoolCell>
                    <PoolCell label="사무실 · 가용 · 전시">
                      <Num value={row.office.held} ready={unitsReady} />
                      <Dot />
                      <Num value={row.office.available} ready={unitsReady} accent />
                      <Dot />
                      <Num value={row.office.showroom} ready={unitsReady} />
                    </PoolCell>
                    <PoolCell label="샘플 · 90일+">
                      <Num value={row.loaned.count} ready={unitsReady} />
                      <Dot />
                      <Num value={row.loaned.long90} ready={unitsReady} />
                    </PoolCell>

                    {/* 보기 전용이면 액션 칸을 만들지 않는다 — 카드형에서 빈 줄 간격이 생기지 않게. */}
                    {canWrite && (
                      <div className="col-span-3 flex items-center justify-start gap-1.5 md:col-span-1 md:justify-end">
                        <button
                          type="button"
                          onClick={() => handleLoan(row)}
                          aria-label={`${row.product} 샘플 대여 기록`}
                          className={OUTLINE_BUTTON_CLASS}
                        >
                          대여
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRowFeedback(row.key, null)
                            onReturn(row.product, row.itemId)
                          }}
                          aria-label={`${row.product} 샘플 반납 기록`}
                          className={OUTLINE_BUTTON_CLASS}
                        >
                          반납
                        </button>
                      </div>
                    )}
                  </div>

                  {rowFeedback && (
                    <div
                      role={rowFeedback.tone === "error" ? "alert" : "status"}
                      className={`mx-5 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 pl-3 text-[12px] font-semibold ${
                        rowFeedback.tone === "error"
                          ? "border-[#B43E3E] text-[#8F2C2C]"
                          : rowFeedback.tone === "success"
                            ? "border-[#084734] text-[#084734]"
                            : "border-[#A39E98] text-[#31302E]"
                      }`}
                    >
                      <span className="min-w-0">{rowFeedback.text}</span>
                      {rowFeedback.offerLoanAnyway && canWrite && (
                        <button
                          type="button"
                          onClick={() => {
                            setRowFeedback(row.key, null)
                            onLoan(row.product, [], row.itemId)
                          }}
                          className="cursor-pointer text-[12px] font-bold text-[#084734] underline underline-offset-2 hover:text-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                        >
                          빠른 기록 열기
                        </button>
                      )}
                    </div>
                  )}

                  {expanded && (
                    <div id={panelId} className="border-t border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-5 py-3">
                      {gapTotal > 0 && (
                        <p className="mb-2 text-[11.5px] font-semibold text-[#7A520F]">
                          원장 교차 확인 — {gapDetail(row)}. 시트는 샘플 반출·회수를 늘 기록하지 않아 참고용입니다.
                        </p>
                      )}
                      {!unitsReady ? (
                        <div className="space-y-2" aria-hidden>
                          {Array.from({ length: 2 }).map((_, skeletonIndex) => (
                            <div key={skeletonIndex} className="h-9 animate-pulse rounded-lg bg-[#F0F0EC]" />
                          ))}
                        </div>
                      ) : row.units.length === 0 ? (
                        <p className="text-[12px] text-[#615D59]">
                          등록된 유닛이 없습니다. 샘플 트래커에서 유닛을 등록하면 여기서 상태를 관리합니다.
                        </p>
                      ) : (
                        <UnitPanel
                          row={row}
                          todayKey={todayKey}
                          canWrite={canWrite}
                          busy={busy}
                          selectedIds={selection[row.key] ?? []}
                          selectedUnits={selectedUnits}
                          correction={correctionOpen ? correction : null}
                          onToggleUnit={(unitId) => toggleUnit(row.key, unitId)}
                          onToggleGroup={(groupIds) => toggleGroup(row.key, groupIds)}
                          onClearSelection={() => clearSelection(row.key)}
                          onMove={(eventType) => runMove(row, eventType)}
                          onOpenCorrection={() => openCorrection(row)}
                          onCorrectionChange={(patch) =>
                            setCorrection((current) => (current?.rowKey === row.key ? { ...current, ...patch } : current))
                          }
                          onSubmitCorrection={() => submitCorrection(row)}
                          onCancelCorrection={() => setCorrection(null)}
                          onOpenUnit={onOpenUnit}
                        />
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {warehouseOnlyRows.length > 0 && (
            <div className="border-t border-[rgba(0,0,0,0.06)] px-5 py-2.5">
              <button
                type="button"
                onClick={() => setShowWarehouseOnly((value) => !value)}
                aria-expanded={showWarehouseOnly}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-[#615D59] transition hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
              >
                {showWarehouseOnly ? "창고 재고만 있는 품목 접기" : `창고 재고만 있는 품목 ${formatNumber(warehouseOnlyRows.length)}개 보기`}
                <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${showWarehouseOnly ? "rotate-180" : ""}`} />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

interface UnitPanelProps {
  row: OfficeSamplePoolRow
  todayKey: string
  canWrite: boolean
  busy: boolean
  selectedIds: string[]
  selectedUnits: HardwareSampleUnit[]
  correction: CorrectionDraft | null
  onToggleUnit: (unitId: string) => void
  onToggleGroup: (groupIds: string[]) => void
  onClearSelection: () => void
  onMove: (eventType: "showcase" | "store") => void
  onOpenCorrection: () => void
  onCorrectionChange: (patch: Partial<Omit<CorrectionDraft, "rowKey">>) => void
  onSubmitCorrection: () => void
  onCancelCorrection: () => void
  onOpenUnit: (unitId: string) => void
}

function unitCustomerText(unit: HardwareSampleUnit): string {
  if (unit.status === "loaned" || unit.status === "converted") return unit.current_customer ?? "고객 미상"
  return "-"
}

function UnitPanel({
  row,
  todayKey,
  canWrite,
  busy,
  selectedIds,
  selectedUnits,
  correction,
  onToggleUnit,
  onToggleGroup,
  onClearSelection,
  onMove,
  onOpenCorrection,
  onCorrectionChange,
  onSubmitCorrection,
  onCancelCorrection,
  onOpenUnit,
}: UnitPanelProps) {
  const groups = OFFICE_POOL_STATUS_ORDER.map((status) => ({
    status,
    units: row.units.filter((unit) => unit.status === status),
  })).filter((group) => group.units.length > 0)
  const correctionTarget = correction?.target ?? ""

  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11.5px] font-bold tabular-nums text-[#31302E]">
              {formatNumber(selectedUnits.length)}대 선택
            </span>
            <button type="button" onClick={() => onMove("showcase")} disabled={busy} className={OUTLINE_BUTTON_CLASS}>
              {SAMPLE_EVENT_META.showcase.label}
            </button>
            <button type="button" onClick={() => onMove("store")} disabled={busy} className={OUTLINE_BUTTON_CLASS}>
              {SAMPLE_EVENT_META.store.label}
            </button>
            <button
              type="button"
              onClick={onOpenCorrection}
              disabled={busy}
              aria-expanded={correction != null}
              className={OUTLINE_BUTTON_CLASS}
            >
              상태 정정
            </button>
            {selectedUnits.length > 0 && (
              <button
                type="button"
                onClick={onClearSelection}
                disabled={busy}
                className="cursor-pointer rounded-md px-2 py-1.5 text-[11.5px] font-semibold text-[#615D59] transition hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
              >
                선택 해제
              </button>
            )}
            {busy && <span className="text-[11.5px] font-semibold text-[#A39E98]">저장 중…</span>}
          </div>

          {correction && (
            <div className="grid gap-2 border-l-2 border-[#084734] bg-white py-2.5 pl-3 pr-3 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-end">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-[#615D59]">바꿀 상태</span>
                <select
                  value={correctionTarget}
                  onChange={(event) => onCorrectionChange({ target: event.target.value as SampleUnitStatus | "" })}
                  className={INPUT_CLASS}
                >
                  <option value="">상태 선택</option>
                  {OFFICE_POOL_STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {SAMPLE_STATUS_META[status].label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
                <label className={`block ${correctionTarget === "loaned" ? "" : "md:col-span-2"}`}>
                  <span className="mb-1 block text-[11px] font-bold text-[#615D59]">사유 메모 (필수)</span>
                  <input
                    value={correction.memo}
                    onChange={(event) => onCorrectionChange({ memo: event.target.value })}
                    placeholder="예: 9/15 실사 — 사무실 보관 확인"
                    className={INPUT_CLASS}
                  />
                </label>
                {correctionTarget === "loaned" && (
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold text-[#615D59]">고객사 (선택)</span>
                    <input
                      value={correction.customer}
                      onChange={(event) => onCorrectionChange({ customer: event.target.value })}
                      placeholder="비우면 기존 고객 유지"
                      className={INPUT_CLASS}
                    />
                  </label>
                )}
              </div>
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={onCancelCorrection}
                  className="cursor-pointer rounded-md px-3 py-1.5 text-[12px] font-bold text-[#615D59] transition hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={onSubmitCorrection}
                  disabled={busy}
                  className="cursor-pointer rounded-md bg-[#084734] px-3.5 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-60"
                >
                  {busy ? "저장 중" : `${formatNumber(selectedUnits.length)}대 정정 저장`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {groups.map((group) => {
        const groupIds = group.units.map((unit) => unit.id)
        const selectedInGroup = groupIds.filter((id) => selectedIds.includes(id)).length
        const unknownCustomers =
          group.status === "loaned"
            ? group.units.filter((unit) => !unit.current_customer || unit.current_customer === "고객 미상").length
            : 0
        const meta = SAMPLE_STATUS_META[group.status]
        return (
          <div key={group.status}>
            <div className="mb-1.5 flex items-center gap-2">
              {canWrite && (
                <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center md:min-h-0 md:min-w-0">
                  <input
                    type="checkbox"
                    ref={(el: HTMLInputElement | null) => {
                      if (el) el.indeterminate = selectedInGroup > 0 && selectedInGroup < groupIds.length
                    }}
                    checked={selectedInGroup === groupIds.length}
                    onChange={() => onToggleGroup(groupIds)}
                    disabled={busy}
                    aria-label={`${row.product} ${meta.label} ${groupIds.length}대 모두 선택`}
                    className={CHECKBOX_CLASS}
                  />
                </label>
              )}
              <p className="text-[11.5px] font-bold text-[#31302E]">
                {meta.label} <span className="tabular-nums text-[#615D59]">{formatNumber(group.units.length)}</span>
                {unknownCustomers > 0 && (
                  <span className="ml-1.5 font-semibold tabular-nums text-[#A39E98]">· 고객 미상 {formatNumber(unknownCustomers)}</span>
                )}
              </p>
            </div>
            <ul className="divide-y divide-[rgba(0,0,0,0.05)] overflow-hidden rounded-lg border border-[rgba(0,0,0,0.06)] bg-white">
              {group.units.map((unit) => {
                const checked = selectedIds.includes(unit.id)
                const elapsed = officePoolLoanElapsedDays(unit, todayKey)
                const long = isOfficePoolLongLoan(unit, todayKey)
                const dueSoon = isOfficePoolDueSoon(unit, todayKey)
                const remaining = dueSoon ? officePoolDaysBetween(todayKey, unit.expected_return_at) : null
                const showsCustomer = unit.status === "loaned" || unit.status === "converted"
                const showsTiming = elapsed != null || remaining != null
                return (
                  <li
                    key={unit.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 px-3 py-1.5 md:grid-cols-[auto_112px_104px_minmax(0,1fr)_minmax(0,150px)]"
                  >
                    {canWrite ? (
                      <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center md:min-h-0 md:min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleUnit(unit.id)}
                          disabled={busy}
                          aria-label={`${unit.asset_code} 선택`}
                          className={CHECKBOX_CLASS}
                        />
                      </label>
                    ) : (
                      <span aria-hidden />
                    )}
                    {/* 768px 미만은 한 칸 안에서 줄바꿈, 이상은 md:contents 로 자식이 표의 칸이 된다. */}
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 md:contents">
                      <button
                        type="button"
                        onClick={() => onOpenUnit(unit.id)}
                        aria-label={`${unit.asset_code} 상세·타임라인 열기`}
                        className={`w-fit cursor-pointer rounded-sm text-left text-[12px] font-bold text-[#111110] underline-offset-2 hover:text-[#084734] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 ${MONO_META_CLASS}`}
                      >
                        {unit.asset_code}
                      </button>
                      <span className="hidden text-[12px] font-semibold text-[#615D59] md:block">{meta.label}</span>
                      {/* 사무실·전시 유닛의 빈 칸("-")은 표 정렬용이라 카드형(768px 미만)에서는 숨긴다. */}
                      <span
                        className={`min-w-0 truncate text-[12px] font-semibold text-[#31302E] ${showsCustomer ? "" : "hidden md:block"}`}
                        title={unit.current_customer ?? undefined}
                      >
                        {unitCustomerText(unit)}
                      </span>
                      <span
                        className={`basis-full text-[11.5px] font-semibold tabular-nums text-[#615D59] md:text-right ${showsTiming ? "" : "hidden md:block"}`}
                      >
                        {elapsed != null ? (
                          <span className={long ? "text-[#7A520F]" : undefined}>{formatNumber(elapsed)}일째</span>
                        ) : (
                          <span className="text-[#A39E98]">-</span>
                        )}
                        {remaining != null && (
                          <span className={`ml-1.5 ${remaining < 0 ? "text-[#B43E3E]" : "text-[#A8741A]"}`}>
                            {remaining < 0 ? `회수 ${formatNumber(-remaining)}일 지남` : `회수 D-${formatNumber(remaining)}`}
                          </span>
                        )}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

export default memo(OfficeSamplePoolSection)
