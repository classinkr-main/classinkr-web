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
//
// 2026-11-25 시트 고정(D5 · lib/branch/rev-sheet-lock.ts) — 새 props 는 전부 선택이고, 없으면 지금 화면 그대로다.
//  - sync: 동기화 버튼 글자·title(고정 뒤 "DSH·HW 동기화"). null 이면 숨긴다.
//  - sheetLock: 시트 고정 뒤에만 1줄 아래 조용한 한 줄("시트는 12월 1일 기준으로 고정 — 이후 원본은 장부"). 경고가 아닌 중립 톤.
//  - snapshotReread: 관리자에게만 그 줄 끝의 "12/1 스냅샷 다시 읽기" — 한 번 더 확인한 뒤에 onClick.
//  - loading: 첫 불러오기 중에는 결과 줄의 행 수·합계 대신 "불러오는 중"(F-13 — 일부만 온 값을 끝난 값처럼 보이지 않게).
// 무엇을 넘길지는 ledgerTopBarLockView(아래 순수 함수)가 GET ledger-drafts 의 sheetWrite.lock 으로 정한다.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, Lock, Plus, RefreshCw, X } from "lucide-react"

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { formatMoney, formatMoneyExact } from "@/lib/branch/ledger-format"
import { formatLockDayLabel, formatLockDayShort, revSheetLockNotice, revSnapshotRereadLabel } from "@/lib/branch/rev-sheet-lock"
import type { LensTabId } from "./ledger-lens-tabs"
import { SHEET_FILTER_CONFIDENCES } from "./ledger-sheet-logic"
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

// 범례 글자 굵기 — 확도가 높을수록 굵게(칸 글자와 같다). Record 라 확도 단계가 늘면 여기서 타입 오류가 난다(F-52).
const LEGEND_WEIGHT: Record<DraftConfidence, string> = {
  confirmed: "font-bold",
  "high-confidence": "font-semibold",
  expected: "font-medium",
}

/**
 * 확도 범례 — 칸과 같은 글자색 + 옅은 바탕(토큰 값 그대로). 1440 에서도 보이게 작게(F7).
 * 단계·순서는 열 머리 메뉴와 같은 SHEET_FILTER_CONFIDENCES(= CONFIDENCE_TOKENS 키 순서)에서 만든다 — 손으로 적은
 * 목록을 두지 않는다(F-52: 확도 단계가 바뀌면 메뉴만 바뀌고 범례는 3단으로 남던 문제).
 */
export function SheetConfidenceLegend({ className = "" }: { className?: string }) {
  return (
    <span className={`items-center gap-1 ${className}`} role="group" aria-label="확도 범례">
      {SHEET_FILTER_CONFIDENCES.map((kind) => (
        <span
          key={kind}
          className={`inline-block h-5 rounded px-1.5 text-center text-[11.5px] leading-5 ${LEGEND_WEIGHT[kind]} ${CONFIDENCE_TOKENS[kind].textStrongClass}`}
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

/** 동기화 버튼의 글자·title. */
export interface LedgerTopBarSync {
  label: string
  title?: string
}

/** 시트 고정 뒤 1줄 아래 조용한 한 줄. */
export interface LedgerTopBarSheetLock {
  text: string
  title?: string
}

/** 관리자의 "12/1 스냅샷 다시 읽기" — 누르면 확인을 한 번 더 묻고, 확인해야 onClick 을 부른다. */
export interface LedgerSnapshotReread {
  label: string
  onClick: () => void
  /** 다시 읽는 중 — 버튼을 잠그고 "다시 읽는 중…". */
  busy: boolean
  title?: string
  /** 확인 단계의 한 줄. 없으면 SNAPSHOT_REREAD_CONFIRM_DEFAULT. */
  confirm?: string
}

/** sync 를 넘기지 않았을 때의 동기화 버튼 — 지금 화면 그대로(REV·HW 함께). */
export const DEFAULT_LEDGER_SYNC: Readonly<LedgerTopBarSync> = {
  label: "동기화",
  title: "REV 장부와 HW 시트를 함께 동기화",
}

export const SNAPSHOT_REREAD_CONFIRM_DEFAULT = "지금 시트 값이 장부 기준값이 됩니다"

/** GET /api/admin/branch/ledger-drafts 의 sheetWrite.lock 모양(sheet-write-view.ts SheetWriteState.lock 과 같다). */
export interface LedgerTopBarLockInput {
  lockedAt: string
  active: boolean
}

export interface LedgerTopBarLockView {
  sync: LedgerTopBarSync
  sheetLock: LedgerTopBarSheetLock | null
  /** 관리자에게만 — 부모가 onClick·busy 를 붙여 snapshotReread 로 넘긴다. */
  snapshotReread: Pick<LedgerSnapshotReread, "label" | "title" | "confirm"> | null
}

const LOCK_DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 시트 고정 상태 → 머리 줄에 넘길 값(순수). 고정 전(null·scheduled·형식이 틀린 날짜)이면 지금 화면 그대로
 * (동기화 버튼 "동기화", 고정 줄·스냅샷 버튼 없음). active 면:
 *  - 동기화 버튼 "DSH·HW 동기화" — 서버가 REV 를 건너뛰고 DSH·KPI·하드웨어만 읽는다(sync-parts.ts).
 *  - 고정 줄 "시트는 12월 1일 기준으로 고정 — 이후 원본은 장부"(title 에 마지막으로 시트를 읽은 시각).
 *  - canRereadSnapshot(ADMIN·SUPER_ADMIN — 진짜 게이트는 서버 verifyAdmin)이면 "12/1 스냅샷 다시 읽기".
 */
export function ledgerTopBarLockView(
  lock: LedgerTopBarLockInput | null | undefined,
  options: { canRereadSnapshot: boolean; lastRevReadLabel?: string | null },
): LedgerTopBarLockView {
  if (!lock?.active || typeof lock.lockedAt !== "string" || !LOCK_DAY_RE.test(lock.lockedAt)) {
    return { sync: { ...DEFAULT_LEDGER_SYNC }, sheetLock: null, snapshotReread: null }
  }
  const day = formatLockDayLabel(lock.lockedAt)
  const lastRead = options.lastRevReadLabel?.trim() || "확인 불가"
  return {
    sync: {
      label: "DSH·HW 동기화",
      title: `DSH 목표·KPI와 HW 시트를 동기화 — REV 시트는 ${day} 기준으로 고정돼 다시 읽지 않습니다`,
    },
    sheetLock: {
      text: revSheetLockNotice(lock.lockedAt),
      title: `'2. REV' 시트는 ${day}부터 다시 읽지 않습니다. 이후 매출은 장부에 넣은 값이 원본입니다 · 마지막으로 시트를 읽은 시각 ${lastRead} · DSH 목표·하드웨어는 계속 동기화됩니다`,
    },
    snapshotReread: options.canRereadSnapshot
      ? {
          label: revSnapshotRereadLabel(lock.lockedAt),
          title: "잠근 시트(2. REV)를 다시 읽어 장부의 기준값을 바꿉니다 — 시트를 잠근 직후 한 번, 또는 시트를 고친 뒤에만 누릅니다",
          confirm: `지금 시트 값이 장부 기준값(${formatLockDayShort(lock.lockedAt)} 스냅샷)이 됩니다`,
        }
      : null,
  }
}

const QUIET_LINK = `inline-flex h-6 shrink-0 items-center rounded px-1 underline underline-offset-2 transition aria-disabled:cursor-not-allowed aria-disabled:opacity-60 ${FOCUS}`

/**
 * "12/1 스냅샷 다시 읽기" — 조용한 글자 버튼. 누르면 그 자리에 확인 한 줄([다시 읽기] [취소])이 뜨고, 확인해야 onClick 을
 * 부른다(잘못 누르면 장부 기준값이 바뀐다). 진행 중(busy)·다른 동기화 중(blocked)이면 aria-disabled 로 잠그고(포커스 유지 —
 * disabled 면 확인 뒤 돌아온 포커스가 body 로 떨어진다) 누름을 무시한다. Esc·취소는 버튼으로 포커스를 돌려준다.
 */
export function SnapshotRereadControl({
  label,
  onClick,
  busy,
  title,
  confirm,
  blocked = false,
}: LedgerSnapshotReread & { blocked?: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusRef = useRef(false)
  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus()
      return
    }
    if (returnFocusRef.current) {
      returnFocusRef.current = false
      triggerRef.current?.focus()
    }
  }, [confirming])
  const unavailable = busy || blocked
  const close = () => {
    returnFocusRef.current = true
    setConfirming(false)
  }

  if (confirming) {
    return (
      <span
        role="group"
        aria-label={`${label} 확인`}
        // 좁은 폭(390)에서는 확인 글자만 줄어든다(두 버튼은 shrink-0) — 잘린 글자는 title 로 본다.
        className="flex min-w-0 items-center gap-1"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return
          event.preventDefault()
          close()
        }}
      >
        <span className="min-w-0 truncate text-[#31302E]" title={confirm ?? SNAPSHOT_REREAD_CONFIRM_DEFAULT}>
          {confirm ?? SNAPSHOT_REREAD_CONFIRM_DEFAULT}
        </span>
        <button
          ref={confirmRef}
          type="button"
          aria-disabled={unavailable || undefined}
          onClick={() => {
            close()
            if (!unavailable) onClick()
          }}
          className={`${QUIET_LINK} font-semibold text-[#111110]`}
        >
          다시 읽기
        </button>
        <button type="button" onClick={close} className={`${QUIET_LINK} font-medium text-[#615D59] hover:text-[#111110]`}>
          취소
        </button>
      </span>
    )
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      aria-disabled={unavailable || undefined}
      title={busy ? "시트를 다시 읽는 중입니다" : blocked ? "다른 동기화가 끝난 뒤 누를 수 있습니다" : title}
      onClick={() => {
        if (unavailable) return
        setConfirming(true)
      }}
      className={`${QUIET_LINK} font-semibold text-[#31302E] hover:text-[#111110]`}
    >
      {busy ? "다시 읽는 중…" : label}
    </button>
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
  /** 건별 시트일 때만 — 지난달 고정 · 결과 요약 · 범례. 없으면 그것들이 사라진다. */
  sheet: {
    pastPinned: boolean
    onTogglePastPinned: () => void
    /** 지난달이 없으면(회계연도 첫 달) 고정 버튼을 끈다. */
    hasPast: boolean
    /** 결과 요약 "35 / 70행 · 11월 계 ¥78,540,000" — shown = 보이는 행, total = 열 필터 전 행, sum = 보이는 행의 기준 달 계. */
    /** partial: 시트 행을 못 불러와 장부 입력분만 왔다(F-13) — 합계를 숨기고 행 수만 보인다. */
    result: { shown: number; total: number; monthLabel: string; sum: number; partial?: boolean }
  } | null
  /** 장부 탭(건별 · 기관별 · 매니저별)일 때만 — 결과 줄의 걸린 필터 칩과 [모두 풀기]. 다른 렌즈는 null. */
  filterLine: {
    chips: LedgerFilterChip[]
    /** [모두 풀기] — 풀 것이 담당자 선택뿐이면(범위는 1줄 토글의 일) null 이라 숨긴다. */
    onClearAll: (() => void) | null
  } | null
  refreshing: boolean
  /** 동기화 — REV와 HW 시트를 함께 돌린다(시트 고정 뒤에는 서버가 DSH·KPI·HW 만 돌린다). */
  onRefresh: () => void
  /** 동기화 버튼 글자·title. 넘기지 않으면 DEFAULT_LEDGER_SYNC("동기화"), null 이면 버튼을 숨긴다. */
  sync?: LedgerTopBarSync | null
  /** 시트 고정 뒤에만 — 1줄 아래 조용한 한 줄. 없으면 그 줄이 없다. */
  sheetLock?: LedgerTopBarSheetLock | null
  /** 관리자에게만 — 고정 줄 끝의 "12/1 스냅샷 다시 읽기"(확인 한 번 뒤 onClick). 없으면 숨긴다. */
  snapshotReread?: LedgerSnapshotReread | null
  /** 첫 불러오기 중(시트 행·장부 입력분이 아직 다 오지 않음) — 결과 줄의 행 수·합계 대신 "불러오는 중"(F-13). */
  loading?: boolean
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
  sync,
  sheetLock = null,
  snapshotReread = null,
  loading = false,
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
  // sync 를 안 넘기면(undefined) 지금 버튼 그대로, null 이면 숨김.
  const syncButton = sync === undefined ? DEFAULT_LEDGER_SYNC : sync
  // 동기화와 스냅샷 다시 읽기는 같은 POST(/api/admin/branch/sync)라 한쪽이 도는 동안 다른 쪽을 잠근다(서버는 겹치면 running).
  const rereadBusy = snapshotReread?.busy === true

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
        {syncButton ? (
          <button
            type="button"
            title={syncButton.title}
            onClick={onRefresh}
            disabled={refreshing || rereadBusy}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#E8E8E4] bg-white px-3 text-[13px] text-[#31302E] transition hover:bg-[#F6F5F4] disabled:opacity-60 ${FOCUS}`}
          >
            <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {syncButton.label}
          </button>
        ) : null}
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

      {sheetLock || snapshotReread ? (
        // 시트 고정 뒤에만 — 1줄 아래 조용한 한 줄(알림 중립 톤: 틴트·초록 표지 없음, 글자 #615D59). 1줄 높이(40px)는 그대로
        // 두고 이 줄만큼(약 26px) 늘어난다. 접힌 패널 안이 아니라 여기 두는 것은 펼치지 않아도 늘 보여야 해서다(design-1 F1).
        <div className="flex min-w-0 items-center gap-2 px-4 text-[12px] leading-5 text-[#615D59]">
          {sheetLock ? (
            <p role="note" data-rev-sheet-lock="" title={sheetLock.title} className="flex min-w-0 items-center gap-1.5">
              <Lock aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate">{sheetLock.text}</span>
            </p>
          ) : null}
          {snapshotReread ? <SnapshotRereadControl {...snapshotReread} blocked={refreshing} /> : null}
        </div>
      ) : null}

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
        {sheet && loading ? (
          // F-13: 첫 불러오기 중에는 행 수·합계를 보이지 않는다 — 장부 입력분만 먼저 온 "1 / 2행 · ¥…"를 끝난 값으로 읽지 않게.
          <p
            aria-busy="true"
            className="flex shrink-0 items-baseline whitespace-nowrap px-0.5 text-[12px] text-[#615D59]"
            title="시트 행과 장부 입력분을 불러오는 중입니다 — 다 불러온 뒤 행 수와 합계를 보입니다"
          >
            불러오는 중
          </p>
        ) : sheet ? (
          // 결과 요약 — 순번 대신 이 숫자로 몇 행인지 본다(`#` 은 시트 행 번호). 합계 행까지 내려가지 않고 본다.
          // 금액은 장부 공용 formatMoney(만 단위, 부호는 ¥ 앞 — F-44), 정확한 금액은 title 에.
          <p
            className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap px-0.5"
            title={
              sheet.result.partial
                ? `열 필터 전 ${sheet.result.total.toLocaleString("ko-KR")}행 중 ${sheet.result.shown.toLocaleString("ko-KR")}행 · 시트 행을 못 불러와 합계는 보이지 않습니다`
                : `열 필터 전 ${sheet.result.total.toLocaleString("ko-KR")}행 중 ${sheet.result.shown.toLocaleString("ko-KR")}행 · 보이는 행의 ${sheet.result.monthLabel} ${formatMoneyExact(sheet.result.sum)}`
            }
          >
            <span className="text-[14px] font-bold tabular-nums text-[#111110]">
              {sheet.result.shown.toLocaleString("ko-KR")}
              <span className="font-medium text-[#615D59]"> / {sheet.result.total.toLocaleString("ko-KR")}</span>
            </span>
            {sheet.result.partial ? (
              <span className="text-[12px] text-[#615D59]">행 · 일부만</span>
            ) : (
              <>
                <span className="text-[12px] text-[#615D59]">행 ·</span>
                <span className="text-[12px] text-[#31302E]">{sheet.result.monthLabel}</span>
                <span className="text-[13px] font-bold tabular-nums text-[#111110]">{formatMoney(sheet.result.sum)}</span>
              </>
            )}
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
