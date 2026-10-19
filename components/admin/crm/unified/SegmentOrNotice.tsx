"use client"

// "OR 조건 포함 — 세그먼트 허브에서 편집" 안내(2026-09-25, 세그먼트 허브 C안 ②).
//
// 조건 편집은 두 곳으로 나뉜다: 이 통합 목록의 조건 칩 줄(SegmentConditionBar)은 AND 만, OR 한 단계(그룹 ≤5)는
// 세그먼트 허브(/admin/crm/customers/segments) 전용. 화면 URL 에 `or=` 가 실려 오면(허브·공유 링크) 목록은 그
// 조건 그대로 서버에 보내 결과를 보여 주되, 여기서는 고칠 수 없다는 것과 어디서 고치는지를 목록 위에 알린다.
// "OR 조건 빼기"는 URL 의 `or=` 만 지우는 탈출구다(AND 조건·다른 필터는 그대로).
//
// 표시 전용 — 상태는 부모(CrmUnifiedCustomersClient)가 URL 과 함께 소유한다. 톤은 어드민 밀집 화면 규약:
// 채움 배지 없이 점·글자색·얇은 선.

import Link from "next/link"

import { SEGMENT_HUB_PATH } from "../segments/segment-hub-api"
import { describeSegmentSpec, segmentSpecQueryString, type CustomerSegmentSpec } from "@/lib/crm/customer-segment-spec"
import type { CrmUnifiedSegmentSummary } from "@/lib/repositories/crm-unified-customers"

export const SEGMENT_OR_NOTICE_TITLE = "OR 조건 포함 — 세그먼트 허브에서 편집"

export interface OrGroupNoticeRow {
  key: string
  label: string
  /** 그룹 i 건수(현재 베이스 ∧ AND 조건 ∧ 그룹 i) — 서버 요약이 같은 그룹을 셌을 때만. 모르면 null. */
  count: number | null
}

/**
 * 화면의 OR 그룹(URL) → 안내 줄. 건수는 서버 요약(segment.anyOf/anyOfCounts)이 **같은 그룹**을 셌을 때만 붙인다 —
 * 조건을 막 바꿔 응답이 아직 이전 조건일 때 다른 그룹의 숫자를 붙이지 않는다(그룹 정규형 쿼리로 대조).
 */
export function describeOrGroupsForNotice(
  groups: readonly CustomerSegmentSpec[],
  summary?: Pick<CrmUnifiedSegmentSummary, "anyOf" | "anyOfCounts"> | null
): OrGroupNoticeRow[] {
  const countByQuery = new Map<string, number>()
  const summaryGroups = summary?.anyOf ?? []
  const summaryCounts = summary?.anyOfCounts ?? []
  if (summaryGroups.length === summaryCounts.length) {
    summaryGroups.forEach((group, index) => {
      const count = summaryCounts[index]
      if (typeof count === "number" && Number.isFinite(count)) countByQuery.set(segmentSpecQueryString(group), count)
    })
  }
  return groups
    .map((group) => ({ group, query: segmentSpecQueryString(group) }))
    .filter(({ query }) => query !== "")
    .map(({ group, query }) => ({
      key: query,
      label: describeSegmentSpec(group).join(" · "),
      count: countByQuery.get(query) ?? null,
    }))
}

export default function SegmentOrNotice({
  groups,
  summary,
  total,
  onRemove,
  hubHref = SEGMENT_HUB_PATH,
}: {
  groups: readonly CustomerSegmentSpec[]
  summary?: Pick<CrmUnifiedSegmentSummary, "anyOf" | "anyOfCounts"> | null
  /** 지금 목록 건수(AND ∧ OR) — 모르면 null. */
  total: number | null
  /** URL 의 OR 그룹만 지운다(AND 조건은 그대로). */
  onRemove: () => void
  hubHref?: string
}) {
  const rows = describeOrGroupsForNotice(groups, summary)
  if (rows.length === 0) return null
  return (
    <section
      className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3"
      aria-label="OR 조건"
      data-testid="unified-or-notice"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#111110]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#A8741A]" aria-hidden />
          {SEGMENT_OR_NOTICE_TITLE}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href={hubHref}
            className="inline-flex h-7 items-center rounded-md px-2 text-[11px] font-semibold text-[#084734] underline-offset-2 hover:underline"
          >
            세그먼트 허브 열기
          </Link>
          <button
            type="button"
            onClick={onRemove}
            className="h-7 rounded-md px-2 text-[11px] font-semibold text-[#1a1a1a]/50 transition-colors hover:text-[#111110]"
          >
            OR 조건 빼기
          </button>
        </div>
      </div>
      <ul className="mt-1.5 space-y-0.5 border-t border-[#f0f0ec] pt-1.5">
        {rows.map((row, index) => (
          <li key={row.key} className="text-[11px] font-medium text-[#1a1a1a]/55">
            <span className="font-semibold text-[#31302E]">{index === 0 ? "그룹" : "또는 그룹"} {index + 1}</span> · {row.label}
            {row.count != null ? (
              <span className="tabular-nums text-[#1a1a1a]/45"> · {row.count.toLocaleString("ko-KR")}명</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-[#1a1a1a]/45">
        {total == null ? "결과는" : `결과 ${total.toLocaleString("ko-KR")}명은`} 위 조건(AND)과 이 그룹 중 하나 이상에 맞는
        고객입니다. 여기 조건 칩은 AND 만 바꿉니다.
      </p>
    </section>
  )
}
