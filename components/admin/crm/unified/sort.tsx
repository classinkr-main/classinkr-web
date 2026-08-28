"use client"

// 통합 고객 목록 클라이언트 정렬 — 이 화면은 탐색 전용이라 서버 추천 정렬(버킷→점수→시각)을 기본으로 두고,
// 헤더 클릭 시 현재 페이지에 로드된 rows(≤200)만 브라우저에서 재정렬한다(서버 재요청 없음).
// Array.prototype.sort는 안정 정렬이므로 동률 행은 서버 추천 순서를 그대로 유지한다.
// CrmUnifiedCustomersClient.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import type { CrmUnifiedCustomerRow } from "@/lib/repositories/crm-unified-customers"

export type SortKey = "name" | "status" | "updated" | "owner" | "score"
export type SortDirection = "asc" | "desc"
export interface SortState {
  key: SortKey
  direction: SortDirection
}

export const SORT_LABELS: Record<SortKey, string> = {
  name: "고객명",
  status: "상태",
  updated: "최근 업데이트",
  owner: "담당",
  score: "점수",
}

// 컬럼 성격별 첫 클릭 방향 — 이름·상태·담당은 가나다, 시각·점수는 최신·높은 순이 자연스럽다.
export const SORT_DEFAULT_DIRECTION: Record<SortKey, SortDirection> = {
  name: "asc",
  status: "asc",
  updated: "desc",
  owner: "asc",
  score: "desc",
}

function updatedAtMs(row: CrmUnifiedCustomerRow): number | null {
  if (!row.updatedAt) return null
  const ms = new Date(row.updatedAt).getTime()
  return Number.isNaN(ms) ? null : ms
}

// 담당 미배정·업데이트 시각 없음은 방향과 무관하게 항상 마지막 — 방향을 토글할 때마다
// 빈 값이 맨 위로 튀어 오르면 탐색 스캔이 끊긴다.
function sortValueMissing(row: CrmUnifiedCustomerRow, key: SortKey) {
  if (key === "owner") return !row.ownerName
  if (key === "updated") return updatedAtMs(row) == null
  return false
}

function compareRows(a: CrmUnifiedCustomerRow, b: CrmUnifiedCustomerRow, key: SortKey) {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, "ko")
    case "status":
      return a.statusLabel.localeCompare(b.statusLabel, "ko")
    case "updated":
      return (updatedAtMs(a) ?? 0) - (updatedAtMs(b) ?? 0)
    case "owner":
      return (a.ownerName ?? "").localeCompare(b.ownerName ?? "", "ko")
    case "score":
      return a.score - b.score
  }
}

export function sortRows(rows: CrmUnifiedCustomerRow[], sort: SortState) {
  const sign = sort.direction === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const aMissing = sortValueMissing(a, sort.key)
    const bMissing = sortValueMissing(b, sort.key)
    if (aMissing !== bMissing) return aMissing ? 1 : -1
    return sign * compareRows(a, b, sort.key)
  })
}

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
        title={`${label} 기준 정렬`}
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
