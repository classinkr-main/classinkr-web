"use client"

// 세그먼트 허브 OR 그룹 편집기 — "기본 조건(AND) ∧ (그룹 1 또는 그룹 2 …)" 한 단계만(그룹 안은 AND, 최대 5개).
// 그룹마다 통합 목록과 같은 조건 칩 막대(SegmentConditionBar)를 다시 쓴다. 칩 숫자는 기본 조건 기준(통합 목록
// 요약 optionCounts — "그 칩 하나만 켰을 때")이고, 그룹 머리 줄의 인원은 "기본 조건 ∧ 이 그룹"(anyOfCounts)이다.
// 빈 그룹은 저장할 수 없다(미완성 그룹을 '참'으로 보지 않는다 — 서버 정규화와 같은 규칙). 상태는 부모가 소유한다.

import { Plus, X } from "lucide-react"

import { SEGMENT_OR_MAX_GROUPS } from "@/lib/crm/saved-segment-api"
import type { CustomerSegmentSpec } from "@/lib/crm/customer-segment-spec"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import type { CrmUnifiedSegmentSummary } from "@/lib/repositories/crm-unified-customers"

import SegmentConditionBar from "../unified/SegmentConditionBar"
import { emptyGroupIndexes } from "./segment-hub-api"

export const OR_GROUPS_RULE_CAPTION = "그룹 안은 모두(AND), 그룹끼리는 하나라도(OR) — 기본 조건과는 AND로 묶입니다."
export const OR_GROUP_EMPTY_HINT = "조건을 하나 이상 고르세요 — 빈 그룹은 저장할 수 없습니다"

export function addOrGroup(groups: readonly CustomerSegmentSpec[]): CustomerSegmentSpec[] {
  if (groups.length >= SEGMENT_OR_MAX_GROUPS) return [...groups]
  return [...groups, {}]
}

export function removeOrGroup(groups: readonly CustomerSegmentSpec[], index: number): CustomerSegmentSpec[] {
  return groups.filter((_, position) => position !== index)
}

export function replaceOrGroup(
  groups: readonly CustomerSegmentSpec[],
  index: number,
  next: CustomerSegmentSpec
): CustomerSegmentSpec[] {
  return groups.map((group, position) => (position === index ? next : group))
}

const GROUP_BAR_CLASS = "rounded-xl border border-dashed border-[#d9d9d4] bg-[#FAFAF8] px-3 py-2.5"

export default function SegmentOrGroupsEditor({
  groups,
  onChange,
  segment,
  groupCounts,
  loading,
  readOnly = false,
}: {
  groups: readonly CustomerSegmentSpec[]
  onChange: (next: CustomerSegmentSpec[]) => void
  /** 통합 목록 요약(칩 단독 건수·facets) — 기본 조건 미리보기 응답의 segment. */
  segment: CrmUnifiedSegmentSummary | undefined
  /** 그룹별 "기본 ∧ 그룹 i" 건수 — 서버가 아직 싣지 않으면 null. */
  groupCounts: ReadonlyArray<number | null>
  loading: boolean
  readOnly?: boolean
}) {
  const empty = new Set(emptyGroupIndexes(groups))
  const full = groups.length >= SEGMENT_OR_MAX_GROUPS
  return (
    <section aria-label="OR 그룹" className="grid gap-2" data-testid="segment-or-groups">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12px] font-semibold text-[#111110]">
          OR 그룹
          <span className="ml-1.5 font-medium text-[#1a1a1a]/45">
            {groups.length ? OR_GROUPS_RULE_CAPTION : "없으면 기본 조건만 씁니다 — 예: (위험 긴급) 또는 (무연락 60일+)"}
          </span>
        </p>
      </div>
      {groups.map((group, index) => (
        <div key={index} className="grid gap-1">
          {index > 0 ? (
            <p className="pl-1 text-[11px] font-bold tracking-[0.04em] text-[#1a1a1a]/40" aria-hidden>
              또는
            </p>
          ) : null}
          <SegmentConditionBar
            spec={group}
            onChange={(next) => onChange(replaceOrGroup(groups, index, next))}
            segment={segment}
            total={groupCounts[index] ?? null}
            loading={loading}
            title={`그룹 ${index + 1}`}
            ariaLabel={`OR 그룹 ${index + 1} 조건`}
            idleHint={OR_GROUP_EMPTY_HINT}
            className={GROUP_BAR_CLASS}
            readOnly={readOnly}
            testId={`segment-or-group-${index + 1}`}
            headerExtra={
              readOnly ? null : (
                <button
                  type="button"
                  onClick={() => onChange(removeOrGroup(groups, index))}
                  aria-label={`그룹 ${index + 1} 지우기`}
                  className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-[#1a1a1a]/50 transition-colors hover:text-[#B43E3E] sm:min-h-7"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  그룹 지우기
                </button>
              )
            }
          />
          {empty.has(index) ? (
            <p className={`pl-1 text-[11px] font-medium ${STATUS_TONE_TEXT_CLASS.warning}`} role="status">
              빈 그룹 — 조건을 고르거나 지우세요.
            </p>
          ) : null}
        </div>
      ))}
      {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(addOrGroup(groups))}
            disabled={full}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#084734] transition-colors hover:border-[#c8c8c4] disabled:cursor-not-allowed disabled:text-[#1a1a1a]/35 sm:min-h-8"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            OR 그룹 추가
          </button>
          <span className="text-[11px] text-[#1a1a1a]/40">
            {full ? `최대 ${SEGMENT_OR_MAX_GROUPS}개까지입니다.` : `최대 ${SEGMENT_OR_MAX_GROUPS}개 · 한 단계만(그룹 안에 그룹 없음)`}
          </span>
        </div>
      )}
    </section>
  )
}
