"use client"

// 통합 고객 목록 정렬 헤더 — 정렬 자체는 서버가 한다(C1, 2026-09-25). 헤더를 누르면 sort/dir 파라미터로
// 서버에 다시 요청하고, 서버가 현재 조건 전체를 정렬한 뒤 페이지를 자른다(예전엔 현재 페이지 ≤50건만
// 브라우저에서 재정렬해 페이지를 넘기면 순서가 리셋됐다). 비교 규칙의 정본은
// lib/crm/unified-view-rules.ts(sortUnifiedRows) — 여기서는 타입·라벨·헤더 셀만 둔다.

import {
  UNIFIED_SORT_DEFAULT_DIRECTION,
  sortUnifiedRows,
  type UnifiedSortDirection,
  type UnifiedSortKey,
  type UnifiedSortState,
} from "@/lib/crm/unified-view-rules"

export type SortKey = UnifiedSortKey
export type SortDirection = UnifiedSortDirection
export type SortState = UnifiedSortState

export const SORT_LABELS: Record<SortKey, string> = {
  name: "고객명",
  status: "상태",
  updated: "최근 업데이트",
  owner: "담당",
  score: "점수",
  last_contact: "마지막 연락",
}

// 컬럼 성격별 첫 클릭 방향 — 서버 기본 방향과 같은 표(lib/crm/unified-view-rules.ts).
export const SORT_DEFAULT_DIRECTION: Record<SortKey, SortDirection> = UNIFIED_SORT_DEFAULT_DIRECTION

/** 같은 키 재클릭=방향 토글, 다른 키=성격별 기본 방향으로 진입. */
export function nextSortState(current: SortState | null, key: SortKey): SortState {
  return current?.key === key
    ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
    : { key, direction: SORT_DEFAULT_DIRECTION[key] }
}

/** 서버와 같은 비교 규칙 — 테스트·로컬 미리보기용(목록 정렬은 서버 응답 순서를 그대로 쓴다). */
export const sortRows = sortUnifiedRows

// 정렬 헤더 셀 — 활성 컬럼에만 ▲▼·aria-sort를 노출한다. 기본(추천순)에서는 어느 헤더에도
// 활성 표시가 없어 "서버 추천 순서 그대로"임이 드러난다.
export function SortableHeaderCell({
  label,
  sortKey,
  sort,
  onToggle,
  align = "left",
}: {
  label: string
  sortKey: SortKey
  sort: SortState | null
  onToggle: (key: SortKey) => void
  align?: "left" | "right"
}) {
  const active = sort?.key === sortKey
  return (
    <th
      className={`px-4 py-3 ${align === "right" ? "text-right" : ""}`}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        title={`${label} 기준 정렬 (전체 결과)`}
        className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors hover:text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] ${
          active ? "text-[#111110]" : "text-[#1a1a1a]/35"
        }`}
      >
        {label}
        {active ? <span aria-hidden>{sort.direction === "asc" ? "▲" : "▼"}</span> : null}
      </button>
    </th>
  )
}
