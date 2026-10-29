"use client"

// components/admin/campaigns/manage/manage-ui.tsx
// 캠페인 관리(캠페인·프로젝트 통합 화면) 두 탭이 함께 쓰는 툴바 부품 — 갤러리형 1b 시안의 문법.
// 상태 탭(밑줄 = 선택, 건수) · 보기 토글(갤러리/리스트) · 갤러리 그리드 · 목록 오류 카드.
// 두 탭이 같은 부품을 써야 탭을 오갈 때 화면 문법이 갈리지 않는다(로컬 재구현 금지).
// DESIGN.md 팔레트만 사용.

import { useCallback, useSyncExternalStore, type ReactNode } from "react"
import { AlertCircle, LayoutGrid, List, RefreshCw } from "lucide-react"

import { CAMPAIGN_STATUS_LABEL, type CampaignStatus } from "@/lib/types/marketing-campaign"

import { PROJECT_STATUS_ORDER } from "../projects/ProjectCard"

export type StatusFilter = CampaignStatus | "all"
export type ViewMode = "gallery" | "list"

// 탭 순서는 묶음 순서와 같다 — 지금 도는 것 → 멈춘 것 → 앞으로 할 것 → 지난 것.
export const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "전체" },
  ...PROJECT_STATUS_ORDER.map((status) => ({ id: status, label: CAMPAIGN_STATUS_LABEL[status] })),
]

// 카드 최소 폭 360px — 좁은 화면에선 100% 로 줄어 가로 스크롤이 생기지 않는다.
export const GALLERY_GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(360px,100%),1fr))] gap-3"

/** 상태 탭 — 밑줄이 선택, 옆 숫자가 건수. 기준선은 부모 툴바의 inset 섀도가 그린다. */
export function StatusFilterTabs({
  value,
  onChange,
  countOf,
}: {
  value: StatusFilter
  onChange: (next: StatusFilter) => void
  countOf: (filter: StatusFilter) => number
}) {
  return (
    <div
      role="group"
      aria-label="상태 필터"
      className="flex gap-5 overflow-x-auto shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)] lg:shadow-none"
    >
      {STATUS_TABS.map((tab) => {
        const active = value === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-pressed={active}
            className={`flex shrink-0 items-baseline gap-[5px] border-b-2 pb-2.5 text-[13px] transition-colors hover:text-[#111110] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] ${
              active
                ? "border-[#111110] font-bold text-[#111110]"
                : "border-transparent font-medium text-[#615D59]"
            }`}
          >
            <span>{tab.label}</span>
            <span className="text-[11.5px] tabular-nums text-[#A39E98]">{countOf(tab.id)}</span>
          </button>
        )
      })}
    </div>
  )
}

const VIEW_OPTIONS: { id: ViewMode; label: string; Icon: typeof List }[] = [
  { id: "list", label: "리스트 보기", Icon: List },
  { id: "gallery", label: "갤러리 보기", Icon: LayoutGrid },
]

export function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode
  onChange: (next: ViewMode) => void
}) {
  return (
    <div
      role="group"
      aria-label="보기 방식"
      className="flex shrink-0 rounded-md border border-[rgba(0,0,0,0.08)] bg-white p-0.5"
    >
      {VIEW_OPTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          aria-label={label}
          title={label}
          className={`flex rounded px-1.5 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] ${
            value === id ? "bg-[#F6F5F4] text-[#111110]" : "text-[#A39E98] hover:text-[#615D59]"
          }`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </button>
      ))}
    </div>
  )
}

/**
 * 툴바 — 상태 탭 | 보조 컨트롤(캐비앗·필터·검색·보기 토글).
 * 기준선은 inset 섀도라 탭의 2px 밑줄이 그 위를 덮는다. 좁은 화면에선 탭 줄만
 * 기준선을 갖고(가로 스크롤), 보조 컨트롤은 그 아래 줄로 내려간다.
 */
export function ManageToolbar({ tabs, children }: { tabs: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-2 leading-tight lg:flex lg:items-end lg:justify-between lg:gap-4 lg:shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]">
      {tabs}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 lg:flex-nowrap lg:justify-end lg:pb-2 lg:pt-0">
        {children}
      </div>
    </div>
  )
}

/** 첫 로딩 스켈레톤 — 보기 방식에 맞는 모양(카드 3장 / 행 3줄). */
export function ManageListSkeleton({ view }: { view: ViewMode }) {
  return (
    <div className="pt-5" aria-busy="true">
      <div className="mb-2.5 h-4 w-20 animate-pulse rounded bg-[#f0f0ec]" />
      <div className={view === "gallery" ? GALLERY_GRID : "space-y-1.5"}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`animate-pulse rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#f0f0ec] ${
              view === "gallery" ? "h-48" : "h-[76px]"
            }`}
          />
        ))}
      </div>
    </div>
  )
}

/** 목록 오류 — 크래시/화이트스크린 대신 원인 + 재시도로 그레이스풀 강등. */
export function ManageListError({
  title,
  message,
  hint,
  onRetry,
}: {
  title: string
  message: string
  hint: string
  onRetry: () => void
}) {
  return (
    <div className="mt-5 rounded-2xl border border-[#F2B8B8] bg-[#FCE9E9] px-5 py-6">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B43E3E]" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#8F2C2C]">{title}</p>
          <p className="mt-1 break-words text-[12px] text-[#B43E3E]">{message}</p>
          <p className="mt-1.5 text-[11px] text-[#B43E3E]/80">{hint}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#F2B8B8] bg-white px-3 py-1.5 text-[12px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            다시 시도
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 보기 방식(갤러리/리스트) — 사람마다 손에 맞는 쪽이 달라 브라우저에 기억한다(뷰어별 편의).
 * 저장소가 막힌 환경(사생활 모드 등)·서버 렌더에서는 기본값으로 동작한다.
 * 같은 탭 안의 변경은 VIEW_MODE_EVENT 로, 다른 탭의 변경은 storage 이벤트로 받는다.
 */
const VIEW_MODE_EVENT = "admin:campaign-manage-view-mode"
// 저장소가 막힌 환경에서도 토글은 동작해야 한다 — 이번 페이지 수명 동안의 메모리 사본.
const memoryViewModes = new Map<string, ViewMode>()

function readStoredViewMode(storageKey: string): ViewMode | null {
  try {
    const stored = window.localStorage.getItem(storageKey)
    return stored === "gallery" || stored === "list" ? stored : null
  } catch {
    return null
  }
}

function subscribeViewMode(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(VIEW_MODE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(VIEW_MODE_EVENT, onChange)
  }
}

export function useStoredViewMode(storageKey: string, fallback: ViewMode = "gallery") {
  const view = useSyncExternalStore(
    subscribeViewMode,
    () => readStoredViewMode(storageKey) ?? memoryViewModes.get(storageKey) ?? fallback,
    () => fallback,
  )

  const setView = useCallback(
    (next: ViewMode) => {
      memoryViewModes.set(storageKey, next)
      try {
        window.localStorage.setItem(storageKey, next)
      } catch {
        // 저장이 막혀도 메모리 사본으로 이번 화면은 바뀐다(다음 방문엔 기본 보기).
      }
      window.dispatchEvent(new Event(VIEW_MODE_EVENT))
    },
    [storageKey],
  )

  return [view, setView] as const
}
