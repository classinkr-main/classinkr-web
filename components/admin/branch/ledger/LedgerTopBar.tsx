"use client"

// 장부 머리 두 줄(2026-11-23, 기획 L2·L5·L8) — 표 위에 놓이는 것은 이 두 줄이 전부다.
//
//  1줄: 제목 · 렌즈 탭(DSH | 장부 …) · [내 담당 | 전체 담당자] · 월 이동 · [필터 전부 풀기 N] · [지난달 고정] · 동기화 · 매출 입력
//  2줄: 열 필터 칩 · 보기(건별 | 기관별 | 매니저별) · 고객 검색 · 걸린 필터 · 범례 · [요약·필터 펼치기]
// (시안은 범위 전환을 2줄에 뒀지만, 1440px 에서 걸린 필터 목록이 잘리지 않게 1줄로 올렸다.)
//
// 상태 줄·요약 띠·묶기·칩·범례·설명·브레드크럼은 지우지 않고 "요약·필터 펼치기" 뒤로 접는다(부모가 그 패널을 그린다).
// 이 파일은 표시와 클릭 전달만 한다 — 필터·렌즈 판정은 ledger-sheet-logic.ts · ledger-lens-tabs.ts 의 순수 함수다.
import { useRef, type KeyboardEvent, type ReactNode } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, Filter, Plus, RefreshCw, X } from "lucide-react"

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import type { LensTabId } from "./ledger-lens-tabs"
import { SHEET_FILTER_MODES, type SheetFilterMode } from "./ledger-sheet-logic"
import type { DraftConfidence } from "./shared"

const SEG_GROUP = "inline-flex shrink-0 overflow-hidden rounded-lg border border-[#E8E8E4] bg-white"
const SEG_BUTTON = "h-8 px-3 text-[12.5px] transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#084734]"
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#084734]"

export function SegmentedButtons<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T | null
  options: Array<{ id: T; label: string; title?: string }>
  onChange: (next: T) => void
}) {
  return (
    <div role="group" aria-label={label} className={SEG_GROUP}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          title={option.title}
          onClick={() => onChange(option.id)}
          className={`${SEG_BUTTON} ${value === option.id ? "bg-[#F6F5F4] font-semibold text-[#111110]" : "text-[#615D59] hover:text-[#111110]"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

const LEGEND: DraftConfidence[] = ["confirmed", "high-confidence", "expected"]

/** 확도 범례 — 칸과 같은 글자색 + 옅은 바탕(토큰 값 그대로). */
export function SheetConfidenceLegend({ className = "" }: { className?: string }) {
  return (
    <span className={`items-center gap-1 ${className}`} role="group" aria-label="확도 범례">
      {LEGEND.map((kind) => (
        <span
          key={kind}
          className={`inline-block h-[22px] min-w-10 rounded px-1.5 text-center text-[12px] leading-[22px] ${kind === "confirmed" ? "font-bold" : kind === "high-confidence" ? "font-semibold" : "font-medium"} ${CONFIDENCE_TOKENS[kind].textStrongClass}`}
          style={{ backgroundColor: CONFIDENCE_TOKENS[kind].tintBg }}
        >
          {CONFIDENCE_TOKENS[kind].label}
        </span>
      ))}
    </span>
  )
}

export interface LedgerTopBarProps {
  // ── 1줄
  tabs: Array<{ id: LensTabId; label: string; title?: string }>
  activeTab: LensTabId
  onSelectTab: (id: LensTabId) => void
  /** 월 이동 — 건별 시트·주차 검수가 기준 달로 쓴다. */
  month: { value: string; label: string; options: Array<{ value: string; label: string; current?: boolean }>; canPrev: boolean; canNext: boolean }
  onMonthChange: (month: string) => void
  onMonthStep: (delta: -1 | 1) => void
  /** 건별 시트일 때만 — 열 필터·지난달 고정. 없으면 그 버튼들이 사라진다. */
  sheet: {
    filterCount: number
    onClearFilters: () => void
    pastPinned: boolean
    onTogglePastPinned: () => void
    /** 지난달이 없으면(회계연도 첫 달) 고정 버튼을 끈다. */
    hasPast: boolean
    /** 칩 줄이 다루는 열("11월 계")과 그 열에 걸린 필터. */
    filterColumnLabel: string
    filterMode: SheetFilterMode | null
    onPickFilterMode: (mode: SheetFilterMode | null) => void
    activeFilters: Array<{ key: string; label: string }>
    onRemoveFilter: (key: string) => void
  } | null
  refreshing: boolean
  onRefresh: () => void
  /** 매출 입력 버튼 — 콕핏에서는 화면 안에 입력기가 있어 숨긴다. */
  onNewEntry: (() => void) | null
  scope: { mine: boolean; all: boolean; hint: string | null }
  onScopeMine?: () => void
  onScopeAll: () => void
  // ── 2줄
  /** 장부 탭일 때만 — 건별 | 기관별 | 매니저별(주차 검수 보기 중이면 그 칸이 하나 더 붙는다). */
  tableViews: Array<{ id: string; label: string; title?: string }> | null
  tableView: string | null
  onTableViewChange: (view: string) => void
  query: string
  onQueryChange: (value: string) => void
  /** 장부 탭이 아닌 렌즈의 2줄 왼쪽(팀·기간 등). */
  lensControls?: ReactNode
  foldOpen: boolean
  onToggleFold: () => void
  foldPanelId: string
}

export default function LedgerTopBar({
  tabs,
  activeTab,
  onSelectTab,
  month,
  onMonthChange,
  onMonthStep,
  sheet,
  refreshing,
  onRefresh,
  onNewEntry,
  scope,
  onScopeMine,
  onScopeAll,
  tableViews,
  tableView,
  onTableViewChange,
  query,
  onQueryChange,
  lensControls,
  foldOpen,
  onToggleFold,
  foldPanelId,
}: LedgerTopBarProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1
    const next = event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
        : event.key === "Home" ? 0
          : event.key === "End" ? last
            : null
    if (next == null) return
    event.preventDefault()
    onSelectTab(tabs[next].id)
    tabRefs.current[next]?.focus()
  }
  const iconButton = `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E8E8E4] bg-white text-[#31302E] transition hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`

  return (
    <div className="flex shrink-0 flex-col gap-1.5 bg-[#FAFAF8] pb-1.5 pt-2 text-[13px] text-[#111110]">
      <div className="flex min-h-10 flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4">
        <h1 className="shrink-0 text-[18px] font-bold leading-none">매출 장부</h1>
        <div role="tablist" aria-label="장부 렌즈 전환" className={SEG_GROUP}>
          {tabs.map((tab, index) => {
            const selected = tab.id === activeTab
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`sales-ledger-lens-${tab.id}`}
                aria-selected={selected}
                aria-controls="sales-ledger-lens-panel"
                tabIndex={selected ? 0 : -1}
                title={tab.title}
                ref={(node) => { tabRefs.current[index] = node }}
                onClick={() => onSelectTab(tab.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={`${SEG_BUTTON} px-3.5 text-[13px] ${selected ? "bg-[#084734] font-semibold text-white focus-visible:outline-white" : "text-[#31302E] hover:bg-[#F6F5F4]"}`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        <div role="group" aria-label="장부 데이터 범위" className={SEG_GROUP}>
          {onScopeMine && <button type="button" aria-pressed={scope.mine} onClick={onScopeMine} className={`${SEG_BUTTON} ${scope.mine ? "bg-[#F6F5F4] font-semibold text-[#111110]" : "text-[#615D59] hover:text-[#111110]"}`}>내 담당</button>}
          <button type="button" aria-pressed={scope.all} onClick={onScopeAll} className={`${SEG_BUTTON} ${scope.all ? "bg-[#F6F5F4] font-semibold text-[#111110]" : "text-[#615D59] hover:text-[#111110]"}`}>전체 담당자</button>
        </div>
        <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="월 이동">
          <button type="button" aria-label="이전 달" title="이전 달 (회계연도 안에서만)" disabled={!month.canPrev} onClick={() => onMonthStep(-1)} className={iconButton}>
            <ChevronLeft aria-hidden className="h-3.5 w-3.5" />
          </button>
          <label className="relative">
            <span className="sr-only">회계월 선택</span>
            <select
              value={month.value}
              onChange={(event) => onMonthChange(event.target.value)}
              className={`h-8 min-w-[104px] cursor-pointer appearance-none rounded-lg bg-transparent px-2 text-center text-[13px] font-semibold text-[#111110] hover:bg-[#F6F5F4] ${FOCUS}`}
            >
              {/* 회계연도 밖의 달로 들어온 주소(?month=)도 선택값이 비지 않게 한 줄 넣는다. */}
              {month.options.some((option) => option.value === month.value) ? null : <option value={month.value}>{month.label}</option>}
              {month.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button type="button" aria-label="다음 달" title="다음 달 (회계연도 안에서만)" disabled={!month.canNext} onClick={() => onMonthStep(1)} className={iconButton}>
            <ChevronRight aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
        {sheet ? (
          <>
            <button
              type="button"
              onClick={sheet.onClearFilters}
              disabled={sheet.filterCount === 0}
              title={sheet.filterCount > 0 ? `걸린 열 필터 ${sheet.filterCount}개를 전부 풉니다` : "걸린 열 필터가 없습니다"}
              className={`h-8 shrink-0 rounded-lg border px-3 text-[13px] font-semibold transition ${FOCUS} ${sheet.filterCount > 0 ? "border-[#084734] bg-white text-[#084734] hover:bg-[#ECFDF5]" : "border-[#E8E8E4] bg-[#F6F5F4] text-[#615D59]"}`}
            >
              필터 전부 풀기{sheet.filterCount > 0 ? <span className="ml-1 tabular-nums">{sheet.filterCount}</span> : null}
            </button>
            <button
              type="button"
              aria-pressed={sheet.pastPinned}
              disabled={!sheet.hasPast}
              onClick={sheet.onTogglePastPinned}
              title={sheet.pastPinned ? "지난달을 회색 묶음 한 열로 고정했습니다 — 끄면 달마다 펼칩니다" : "지난달을 달마다 펼쳤습니다 — 켜면 한 열로 묶어 고정합니다"}
              className={`h-8 shrink-0 rounded-lg border px-3 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS} ${sheet.pastPinned ? "border-[#084734] bg-[#ECFDF5] font-semibold text-[#084734]" : "border-[#E8E8E4] bg-white text-[#31302E] hover:bg-[#F6F5F4]"}`}
            >
              지난달 고정
            </button>
          </>
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#E8E8E4] bg-white px-3 text-[13px] text-[#31302E] transition hover:bg-[#F6F5F4] disabled:opacity-60 ${FOCUS}`}
        >
          <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          동기화
        </button>
        {onNewEntry ? (
          <button
            type="button"
            onClick={onNewEntry}
            className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-[#084734] px-3.5 text-[13px] font-semibold text-white transition hover:bg-[#065c41] ${FOCUS}`}
          >
            <Plus aria-hidden className="h-4 w-4" />
            매출 입력
          </button>
        ) : null}
      </div>

      <div className="flex min-h-[34px] flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4">
        {scope.hint ? <span className="max-w-[240px] truncate text-[12px] text-[#615D59]" title={scope.hint}>{scope.hint}</span> : null}
        {sheet ? (
          <div role="group" aria-label={`${sheet.filterColumnLabel} 열 필터`} className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[#BDEFD8] bg-[#ECFDF5] pl-2.5 pr-1">
            <Filter aria-hidden className="h-3 w-3 shrink-0 text-[#084734]" strokeWidth={2.2} />
            <span className="pr-1 text-[12.5px] font-bold text-[#084734]">{sheet.filterColumnLabel}</span>
            {SHEET_FILTER_MODES.map((mode) => {
              const on = sheet.filterMode === mode.id
              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => sheet.onPickFilterMode(mode.id)}
                  className={`h-6 rounded-md border px-2 text-[12px] transition ${FOCUS} ${on ? "border-[#084734] bg-[#084734] font-bold text-white" : "border-[#BDEFD8] bg-white text-[#31302E] hover:border-[#084734]"}`}
                >
                  {mode.label}
                </button>
              )
            })}
            <button
              type="button"
              disabled={sheet.filterMode == null}
              onClick={() => sheet.onPickFilterMode(null)}
              title={`${sheet.filterColumnLabel} 열의 필터만 풉니다`}
              className={`h-6 rounded-md border border-[#BDEFD8] bg-white px-2 text-[12px] text-[#31302E] transition hover:border-[#084734] disabled:opacity-40 ${FOCUS}`}
            >
              해제
            </button>
          </div>
        ) : null}
        {!sheet && lensControls ? lensControls : null}
        {tableViews ? <SegmentedButtons label="장부 보기" value={tableView} options={tableViews} onChange={onTableViewChange} /> : null}
        <input
          type="search"
          aria-label="고객 검색"
          placeholder="고객 검색"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="h-8 w-[150px] shrink-0 rounded-lg border border-[#8A857F] bg-white px-2.5 text-[12.5px] text-[#111110] outline-none placeholder:text-[#78736D] focus:border-[#084734] focus-visible:ring-2 focus-visible:ring-[#084734]/25"
        />
        {sheet ? (
          <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto text-[12px]" role="group" aria-label="걸린 필터">
            {sheet.activeFilters.length === 0 ? (
              <span className="shrink-0 text-[#615D59]">걸린 필터 없음</span>
            ) : (
              <>
                <span className="shrink-0 text-[#31302E]">걸린 필터:</span>
                {sheet.activeFilters.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => sheet.onRemoveFilter(filter.key)}
                    aria-label={`${filter.label} 필터 풀기`}
                    title={`${filter.label} — 누르면 이 필터만 풉니다`}
                    className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-[#BDEFD8] bg-white pl-2 pr-1 font-semibold text-[#084734] transition hover:bg-[#ECFDF5] ${FOCUS}`}
                  >
                    {filter.label}
                    <X aria-hidden className="h-3 w-3" />
                  </button>
                ))}
              </>
            )}
          </div>
        ) : (
          <span className="flex-1" />
        )}
        {sheet ? <SheetConfidenceLegend className="hidden shrink-0 2xl:inline-flex" /> : null}
        <button
          type="button"
          aria-expanded={foldOpen}
          aria-controls={foldPanelId}
          onClick={onToggleFold}
          className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[#E8E8E4] bg-white px-2.5 text-[12.5px] text-[#31302E] transition hover:bg-[#F6F5F4] ${FOCUS}`}
        >
          {foldOpen ? "요약·필터 접기" : "요약·필터 펼치기"}
          <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${foldOpen ? "rotate-180" : ""}`} />
        </button>
      </div>
    </div>
  )
}
