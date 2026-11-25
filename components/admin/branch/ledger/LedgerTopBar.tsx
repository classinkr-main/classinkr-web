"use client"

// 장부 머리 두 줄(2026-11-23, 기획 L2·L5·L8) — 표 위에 놓이는 것은 이 두 줄이 전부다.
//
//  1줄: 제목 · 렌즈 탭(DSH | 장부 …) · [내 담당 | 전체 담당자] · 월 이동 · [지난달 고정] · 동기화 · 매출 입력
//  2줄(결과 줄): 보기(건별 | 기관별 | 매니저별) · 고객 검색 · 결과(35 / 70행 · 11월 계 ¥…) · 걸린 필터 칩(각각 ×) ·
//       [모두 풀기] · "내 화면에만 걸립니다" · 범례 · [요약·필터 펼치기]
// (시안은 범위 전환을 2줄에 뒀지만, 1440px 에서 걸린 필터 목록이 잘리지 않게 1줄로 올렸다.)
//
// 2026-11-25 필터 기획 F-2: 숨은 필터 0 — 열 필터뿐 아니라 접힌 패널의 제품·계약·경로 칩, 팀, 상품군, 지역, 검색어,
// 버튼으로 못 나타내는 담당자 선택까지 결과 줄 칩으로 보인다. 1줄의 "필터 전부 풀기 N"은 결과 줄의 [모두 풀기]로 옮겼고,
// 열 필터 칩 묶음(선택 열 + 공백 제외/확정/고확도/예정)은 열 머리 메뉴(LedgerSheet)로 옮겼다.
//
// 상태 줄·요약 띠·묶기·칩·설명·브레드크럼은 지우지 않고 "요약·필터 펼치기" 뒤로 접는다(부모가 그 패널을 그린다).
// 이 파일은 표시와 클릭 전달만 한다 — 필터·렌즈 판정은 ledger-sheet-logic.ts · ledger-lens-tabs.ts 의 순수 함수다.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, Plus, RefreshCw, X } from "lucide-react"

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import type { LensTabId } from "./ledger-lens-tabs"
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

/** 확도 범례 — 칸과 같은 글자색 + 옅은 바탕(토큰 값 그대로). 1440 에서도 보이게 작게(F7). */
export function SheetConfidenceLegend({ className = "" }: { className?: string }) {
  return (
    <span className={`items-center gap-1 ${className}`} role="group" aria-label="확도 범례">
      {LEGEND.map((kind) => (
        <span
          key={kind}
          className={`inline-block h-5 rounded px-1.5 text-center text-[11.5px] leading-5 ${kind === "confirmed" ? "font-bold" : kind === "high-confidence" ? "font-semibold" : "font-medium"} ${CONFIDENCE_TOKENS[kind].textStrongClass}`}
          style={{ backgroundColor: CONFIDENCE_TOKENS[kind].tintBg }}
        >
          {CONFIDENCE_TOKENS[kind].label}
        </span>
      ))}
    </span>
  )
}

/** 결과 줄의 걸린 필터 칩 하나 — 부모가 라벨·풀기 동작을 만든다(열 필터 · 속성 칩 · 팀 · 검색어 …). */
export interface LedgerFilterChip {
  key: string
  /** "11월 W2 확정·고확도", "제품 HW", "검색: 예시B" */
  label: string
  onRemove: () => void
  /** 걸려 있지만 지금은 거르지 않는다(그 자리에 달이 없는 열 필터) — 흐리게, title 에 이유. */
  inactive?: boolean
  title?: string
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
  /** 건별 시트일 때만 — 지난달 고정 · 결과 요약 · 범례. 없으면 그것들이 사라진다. */
  sheet: {
    pastPinned: boolean
    onTogglePastPinned: () => void
    /** 지난달이 없으면(회계연도 첫 달) 고정 버튼을 끈다. */
    hasPast: boolean
    /** 결과 요약 "35 / 70행 · 11월 계 ¥78,540,000" — shown = 보이는 행, total = 열 필터 전 행, sum = 보이는 행의 기준 달 계. */
    result: { shown: number; total: number; monthLabel: string; sum: number }
  } | null
  /** 장부 탭(건별 · 기관별 · 매니저별)일 때만 — 결과 줄의 걸린 필터 칩과 [모두 풀기]. 다른 렌즈는 null. */
  filterLine: {
    chips: LedgerFilterChip[]
    /** [모두 풀기] — 풀 것이 담당자 선택뿐이면(범위는 1줄 토글의 일) null 이라 숨긴다. */
    onClearAll: (() => void) | null
  } | null
  refreshing: boolean
  /** 동기화 — REV와 HW 시트를 함께 돌린다. */
  onRefresh: () => void
  /** 동기화 버튼 옆 HW 칩 "HW 출고 12 · 재고 34 · 예정 5"(최근 30일 출고 · 창고 재고 · 출고 예정). 없으면 숨긴다. */
  hw?: { label: string; title: string; low: boolean } | null
  /** 매출 입력 버튼 — 콕핏에서는 화면 안에 입력기가 있어 숨긴다. */
  onNewEntry: (() => void) | null
  scope: { mine: boolean; all: boolean; hint: string | null }
  onScopeMine: () => void
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
  filterLine,
  refreshing,
  onRefresh,
  hw = null,
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
  // 칩 줄이 넘치는가(한 줄을 다 써도 모자랄 만큼 칩이 많을 때) — 넘칠 때만 끝을 흐리게 하고 개수 배지를 붙인다(필터 기획 F-2 위험 대응).
  // 칩 묶음(안쪽 w-max)과 줄(바깥) 둘 다 지켜본다 — 칩이 늘거나 창이 줄면 다시 잰다.
  const chipStripRef = useRef<HTMLDivElement | null>(null)
  const [chipOverflow, setChipOverflow] = useState(false)
  const hasFilterLine = filterLine != null
  useEffect(() => {
    const strip = chipStripRef.current
    if (!hasFilterLine || !strip || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => setChipOverflow(strip.scrollWidth > strip.clientWidth + 1))
    observer.observe(strip)
    if (strip.firstElementChild) observer.observe(strip.firstElementChild)
    return () => observer.disconnect()
  }, [hasFilterLine])
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
          <button type="button" aria-pressed={scope.mine} onClick={onScopeMine} className={`${SEG_BUTTON} ${scope.mine ? "bg-[#F6F5F4] font-semibold text-[#111110]" : "text-[#615D59] hover:text-[#111110]"}`}>내 담당</button>
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
        ) : null}
        <span className="flex-1" />
        {hw ? (
          <a
            href="/admin/hardware"
            title={hw.title}
            className={`inline-flex h-8 shrink-0 items-center rounded-lg px-2 text-[12px] font-semibold tabular-nums transition hover:bg-[#F6F5F4] ${hw.low ? "text-[#7A520F]" : "text-[#615D59]"} ${FOCUS}`}
          >
            {hw.label}
          </a>
        ) : null}
        <button
          type="button"
          title="REV 장부와 HW 시트를 함께 동기화"
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
        {!filterLine && lensControls ? lensControls : null}
        {tableViews ? <SegmentedButtons label="장부 보기" value={tableView} options={tableViews} onChange={onTableViewChange} /> : null}
        <input
          type="search"
          aria-label="고객 검색"
          placeholder="고객 · 담당 · 시트 행 번호"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="h-8 w-[180px] shrink-0 rounded-lg border border-[#8A857F] bg-white px-2.5 text-[12.5px] text-[#111110] outline-none placeholder:text-[#78736D] focus:border-[#084734] focus-visible:ring-2 focus-visible:ring-[#084734]/25"
        />
        {sheet ? (
          // 결과 요약 — 순번 대신 이 숫자로 몇 행인지 본다(`#` 은 시트 행 번호). 합계 행까지 내려가지 않고 본다.
          <p
            className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap px-0.5"
            title={`열 필터 전 ${sheet.result.total.toLocaleString("ko-KR")}행 중 ${sheet.result.shown.toLocaleString("ko-KR")}행 · 보이는 행의 ${sheet.result.monthLabel} ¥${sheet.result.sum.toLocaleString("ko-KR")}`}
          >
            <span className="text-[14px] font-bold tabular-nums text-[#111110]">
              {sheet.result.shown.toLocaleString("ko-KR")}
              <span className="font-medium text-[#615D59]"> / {sheet.result.total.toLocaleString("ko-KR")}</span>
            </span>
            <span className="text-[12px] text-[#615D59]">행 ·</span>
            <span className="text-[12px] text-[#31302E]">{sheet.result.monthLabel}</span>
            <span className="text-[13px] font-bold tabular-nums text-[#111110]">¥{sheet.result.sum.toLocaleString("ko-KR")}</span>
          </p>
        ) : null}
        {filterLine ? (
          // 기본 폭은 칩을 다 펼친 폭(basis auto = 내용 폭)이다. 그 폭이 이 줄에 남은 자리보다 크면 줄바꿈이 먼저 일어나
          // 범례·접기 묶음이 다음 줄 오른쪽으로 내려가고 결과 줄(칩)이 비운 자리까지 다 쓴다. 예전 basis 260px 는 칩 수와
          // 상관없이 늘 "들어간다"로 잡혀 줄바꿈이 일어나지 않았다 — 1440 에서 칩 줄이 143px(칩 2개)로 눌려 둘째 칩부터
          // "11월 W…"처럼 잘렸다(최종 검증 라운드 2).
          // 최소 260px(꼬리 [개수 배지 · 모두 풀기 · 내 화면에만] 약 195px + 칩 한 개가 보일 자리) — 그보다 좁으면 줄어들지
          // 않고 다음 줄로 내려간다(C-9). 한 줄 폭(max-w-full)으로도 모자라면 칩 줄만 가로로 스크롤하고 끝을 흐리게 ·
          // 개수 배지를 붙인다. [모두 풀기]와 "내 화면에만"은 늘 보이게 스크롤 밖에 둔다.
          <div className="flex min-w-[260px] max-w-full flex-auto items-center gap-1.5 text-[12px]">
            <div
              ref={chipStripRef}
              role="group"
              aria-label={`걸린 필터 ${filterLine.chips.length}개`}
              className={`no-scrollbar min-w-0 overflow-x-auto ${chipOverflow ? "[mask-image:linear-gradient(to_right,#000_calc(100%-20px),transparent)]" : ""}`}
            >
              <div className="flex w-max items-center gap-1.5 pr-1">
                {filterLine.chips.length === 0 ? (
                  <span className="shrink-0 text-[#615D59]">걸린 필터 없음 — 열 머리를 눌러 거세요</span>
                ) : (
                  filterLine.chips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={chip.onRemove}
                      aria-label={`${chip.label} 필터 풀기`}
                      title={chip.title ?? `${chip.label} — 누르면 이 필터만 풉니다`}
                      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-md border pl-2 pr-1 transition ${FOCUS} ${
                        chip.inactive
                          ? "border-dashed border-[#BDEFD8] bg-white font-medium text-[#615D59] hover:bg-[#F6F5F4]"
                          : "border-[#BDEFD8] bg-[#ECFDF5] font-semibold text-[#084734] hover:bg-[#D1FAE5]"
                      }`}
                    >
                      {chip.label}
                      <X aria-hidden className="h-3 w-3" />
                    </button>
                  ))
                )}
              </div>
            </div>
            {chipOverflow && filterLine.chips.length > 0 ? (
              <span
                className="shrink-0 rounded-full bg-[#F6F5F4] px-1.5 text-[11px] font-semibold leading-5 tabular-nums text-[#31302E]"
                title={`걸린 필터 ${filterLine.chips.length}개 — ${filterLine.chips.map((chip) => chip.label).join(" · ")} (칩 줄을 옆으로 밀어 봅니다)`}
              >
                {filterLine.chips.length}개
              </span>
            ) : null}
            {filterLine.chips.length > 0 && filterLine.onClearAll ? (
              <button
                type="button"
                onClick={filterLine.onClearAll}
                title="걸린 필터를 전부 풉니다 — 내 담당 · 전체 담당자 범위는 그대로"
                className={`h-6 shrink-0 rounded-md px-1 font-semibold text-[#084734] underline underline-offset-2 hover:text-[#065c41] ${FOCUS}`}
              >
                모두 풀기
              </button>
            ) : null}
            <span
              className="shrink-0 whitespace-nowrap text-[11.5px] text-[#615D59]"
              title="필터는 주소(URL)에만 남습니다. 다른 사람 화면은 바뀌지 않습니다."
            >
              내 화면에만 걸립니다
            </span>
          </div>
        ) : (
          <span className="flex-1" />
        )}
        {/* 범례 · 접기 버튼은 한 묶음으로 오른쪽 끝에 둔다 — 줄이 모자라면 둘이 함께 다음 줄 오른쪽으로 내려가고
            결과 줄(칩)이 남은 폭을 다 쓴다(접기 버튼만 홀로 다음 줄 왼쪽에 떨어지지 않게). */}
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          {sheet ? <SheetConfidenceLegend className="inline-flex shrink-0" /> : null}
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
    </div>
  )
}
