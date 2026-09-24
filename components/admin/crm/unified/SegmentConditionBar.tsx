"use client"

// 세그먼트 조건 칩 줄(SG4) — 통합 목록 상단. 저장 뷰·라벨·검색·담당과 AND로 묶이는 추가 조건이다.
//  - 숫자 조건은 프리셋 칩(만료 14·30·60일 등)으로만 켠다. 같은 칩을 다시 누르면 끈다.
//  - 칩마다 "이 칩 하나만 켜면 몇 명"(현재 베이스 기준 단독 건수, 서버 segment.optionCounts)을 붙인다.
//  - 담당·지역·라벨은 값 공간이 열려 있어 접힌 목록(details)에서 고른다(서버 segment.facets 건수). 서버가
//    상위 일부만 싣고 숨긴 개수(segment.facetHiddenCounts)를 주면 목록 아래에 "외 N개"로 알린다.
//  - 금액 조건은 통화별 축만 — 잔액(¥)은 외부 CRM 고객에게만 걸린다.
// 상태는 부모(CrmUnifiedCustomersClient)가 URL(?expDays= 등)과 함께 소유하고, 여기는 표시·콜백만 한다.
// 라벨 방식(모두/하나)도 스펙(=URL)에서 파생한다(segmentTagMode) — 고른 라벨이 없을 때의 선호만 로컬에 둔다.

import { useState, type ReactNode } from "react"
import { ChevronDown, SlidersHorizontal } from "lucide-react"

import {
  SEGMENT_BILLING_LABELS,
  SEGMENT_BILLING_VALUES,
  SEGMENT_KIND_LABELS,
  SEGMENT_KIND_VALUES,
  SEGMENT_NONE_TOKEN,
  SEGMENT_NUMBER_PRESETS,
  SEGMENT_RISK_LABELS,
  SEGMENT_RISK_VALUES,
  activeSegmentConditionKeys,
  describeSegmentSpec,
  segmentNumberLabel,
  segmentOptionKey,
  segmentTagMode,
  switchSegmentTagMode,
  toggleSegmentListValue,
  toggleSegmentNumber,
  type CustomerSegmentSpec,
  type SegmentConditionKey,
  type SegmentTagMode,
} from "@/lib/crm/customer-segment-spec"
import type { CrmUnifiedSegmentFacet, CrmUnifiedSegmentSummary } from "@/lib/repositories/crm-unified-customers"

type NumberKey = "expDays" | "depDays" | "noContactDays" | "minBalanceCny"

const NUMBER_GROUPS: Array<{ key: NumberKey; label: string; chip: (value: number) => string; hint: string }> = [
  { key: "expDays", label: "만료", chip: (value) => `${value}일 이내`, hint: "만료까지 N일 이내(지난 만료 제외)" },
  { key: "depDays", label: "소진", chip: (value) => `${value}일 이내`, hint: "잔액 소진 예상 N일 이내(예상일이 있는 고객만)" },
  {
    key: "noContactDays",
    label: "무연락",
    chip: (value) => `${value}일+`,
    hint: "마지막 연락 N일 이상 전 — 연락 기록이 없는 고객도 포함, 종료 고객 제외('미접촉' 저장 뷰와 같은 기준)",
  },
  {
    key: "minBalanceCny",
    label: "잔액(¥)",
    chip: (value) => segmentNumberLabel("minBalanceCny", value).replace("잔액 ", ""),
    hint: "외부 CRM 잔액(위안화) 이상 — 다른 통화와 합산하지 않습니다",
  },
]

function chipClass(active: boolean, empty: boolean) {
  if (active) return "border-[#084734] bg-[#ECFDF5] text-[#084734]"
  if (empty) return "border-[#e8e8e4] bg-white text-[#1a1a1a]/30 hover:text-[#1a1a1a]/55"
  return "border-[#e8e8e4] bg-white text-[#1a1a1a]/60 hover:border-[#c8c8c4] hover:text-[#111110]"
}

function ConditionChip({
  label,
  count,
  active,
  onClick,
  title,
}: {
  label: string
  count: number | undefined
  active: boolean
  onClick: () => void
  title?: string
}) {
  const empty = count === 0
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition-colors ${chipClass(active, empty)}`}
    >
      {label}
      {count != null ? <span className="tabular-nums opacity-70">{count.toLocaleString("ko-KR")}</span> : null}
    </button>
  )
}

function GroupLabel({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="mr-0.5 inline-flex h-7 shrink-0 items-center text-[11px] font-semibold text-[#1a1a1a]/40" title={title}>
      {children}
    </span>
  )
}

/** 서버가 상한 때문에 싣지 않은 선택지 수 안내 — 0 이면 null(문구 없음). */
export function facetHiddenCaption(hiddenCount: number | null | undefined): string | null {
  if (!hiddenCount || hiddenCount <= 0) return null
  return `외 ${hiddenCount.toLocaleString("ko-KR")}개 — 검색으로 좁히세요`
}

function FacetPicker({
  label,
  facets,
  selected,
  onToggle,
  emptyText,
  hiddenCount,
  footer,
}: {
  label: string
  facets: CrmUnifiedSegmentFacet[]
  selected: readonly string[]
  onToggle: (value: string) => void
  emptyText: string
  /** 상한 때문에 싣지 않은 선택지 수(segment.facetHiddenCounts) — 옛 응답이면 undefined. */
  hiddenCount?: number
  footer?: ReactNode
}) {
  const hiddenCaption = facetHiddenCaption(hiddenCount)
  const selectedSet = new Set(selected.map((value) => value.toLowerCase()))
  // 선택됐지만 현재 베이스 facets 에 없는 값(딥링크 등)도 해제할 수 있게 목록 앞에 붙인다.
  const extra = selected
    .filter((value) => !facets.some((facet) => facet.value.toLowerCase() === value.toLowerCase()))
    .map((value) => ({ value, label: value === SEGMENT_NONE_TOKEN ? "없음" : value, count: 0 }))
  const options = [...extra, ...facets]
  const activeCount = selected.length
  return (
    <details className="group relative shrink-0">
      <summary
        className={`flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] lg:h-7 lg:min-h-0 ${chipClass(activeCount > 0, false)}`}
      >
        {label}
        {activeCount > 0 ? <span className="tabular-nums">{activeCount}</span> : null}
        <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="absolute left-0 top-9 z-30 w-[min(280px,calc(100vw-3rem))] rounded-xl border border-[#e8e8e4] bg-white p-2 shadow-xl">
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-[12px] text-[#1a1a1a]/45">{emptyText}</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto" role="list">
            {options.map((option) => {
              const checked = selectedSet.has(option.value.toLowerCase())
              return (
                <li key={option.value}>
                  <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-[12px] text-[#111110] hover:bg-[#fafaf8]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(option.value)}
                      className="h-3.5 w-3.5 accent-[#084734]"
                    />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    <span className="tabular-nums text-[11px] text-[#1a1a1a]/40">{option.count.toLocaleString("ko-KR")}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {hiddenCaption ? (
          <p className="px-2 pt-1.5 text-[11px] font-medium text-[#1a1a1a]/45" data-testid="facet-hidden-caption">
            {hiddenCaption}
          </p>
        ) : null}
        {footer}
      </div>
    </details>
  )
}

export default function SegmentConditionBar({
  spec,
  onChange,
  segment,
  total,
  loading,
}: {
  spec: CustomerSegmentSpec
  onChange: (next: CustomerSegmentSpec) => void
  segment: CrmUnifiedSegmentSummary | undefined
  total: number | null
  loading: boolean
}) {
  const optionCounts = segment?.optionCounts ?? {}
  const activeKeys = activeSegmentConditionKeys(spec)
  const active = activeKeys.length > 0
  const labels = describeSegmentSpec(spec)
  // 라벨 방식은 스펙(=URL)에서 파생한다 — 뒤로 가기·딥링크로 tagsAll/tagsAny 가 바뀌면 토글도 따라간다.
  // 고른 라벨이 없을 때만 마지막으로 쓴 방식(preferredTagMode)을 보인다. 이펙트로 동기화하지 않는다.
  const [preferredTagMode, setPreferredTagMode] = useState<SegmentTagMode>(() => segmentTagMode(spec, "any"))
  const tagMode = segmentTagMode(spec, preferredTagMode)
  const tagKey: SegmentConditionKey = tagMode === "all" ? "tagsAll" : "tagsAny"
  const selectedTags = [...(spec.tagsAll ?? []), ...(spec.tagsAny ?? [])]

  const count = (key: SegmentConditionKey, value: string | number) => optionCounts[segmentOptionKey(key, value)]

  const switchTagMode = (mode: SegmentTagMode) => {
    if (mode === tagMode) return
    setPreferredTagMode(mode)
    // 이미 고른 라벨은 새 모드로 옮긴다(모두↔하나 전환이 선택을 잃지 않게).
    if (selectedTags.length) onChange(switchSegmentTagMode(spec, mode))
  }

  const toggleTag = (value: string) => {
    // 마지막 라벨을 해제해도 방식이 URL 에서 온 쪽으로 남게 지금 방식을 기억한다.
    setPreferredTagMode(tagMode)
    onChange(toggleSegmentListValue(spec, tagKey, value))
  }

  return (
    <section
      className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3"
      aria-label="고객 조건"
      aria-busy={loading}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#111110]">
          <SlidersHorizontal className="h-3.5 w-3.5 text-[#1a1a1a]/45" aria-hidden />
          조건
          <span className="font-medium text-[#1a1a1a]/45">
            {active
              ? `${activeKeys.length}개 적용 · ${total == null ? "…" : `${total.toLocaleString("ko-KR")}명`}${
                  segment ? ` / 조건 전 ${segment.baseTotal.toLocaleString("ko-KR")}명` : ""
                }`
              : "모두 AND로 묶입니다 · 칩 숫자는 그 조건 하나만 켰을 때 인원"}
          </span>
        </p>
        {active ? (
          <button
            type="button"
            onClick={() => onChange({})}
            className="h-7 rounded-md px-2 text-[11px] font-semibold text-[#1a1a1a]/50 transition-colors hover:text-[#111110]"
          >
            조건 초기화
          </button>
        ) : null}
      </div>
      {active && labels.length ? (
        <p className="mb-2 text-[11px] font-medium text-[#1a1a1a]/45">{labels.join(" · ")}</p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {NUMBER_GROUPS.map((group) => {
            const presets = [...SEGMENT_NUMBER_PRESETS[group.key]]
            const current = spec[group.key]
            if (current != null && !presets.includes(current)) presets.push(current)
            return (
              <div key={group.key} className="flex flex-wrap items-center gap-1" role="group" aria-label={`${group.label} 조건`}>
                <GroupLabel title={group.hint}>{group.label}</GroupLabel>
                {presets.map((value) => (
                  <ConditionChip
                    key={value}
                    label={group.chip(value)}
                    count={count(group.key, value)}
                    active={current === value}
                    title={group.hint}
                    onClick={() => onChange(toggleSegmentNumber(spec, group.key, value))}
                  />
                ))}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="고객 종류 조건">
            <GroupLabel>종류</GroupLabel>
            {SEGMENT_KIND_VALUES.map((value) => (
              <ConditionChip
                key={value}
                label={SEGMENT_KIND_LABELS[value]}
                count={count("kinds", value)}
                active={Boolean(spec.kinds?.includes(value))}
                onClick={() => onChange(toggleSegmentListValue(spec, "kinds", value))}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="위험 등급 조건">
            <GroupLabel title="외부 CRM 서비스 위험 등급(스냅샷)">위험</GroupLabel>
            {SEGMENT_RISK_VALUES.map((value) => (
              <ConditionChip
                key={value}
                label={SEGMENT_RISK_LABELS[value]}
                count={count("risk", value)}
                active={Boolean(spec.risk?.includes(value))}
                onClick={() => onChange(toggleSegmentListValue(spec, "risk", value))}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="과금 방식 조건">
            <GroupLabel title="매출시트 과금 유형">과금</GroupLabel>
            {SEGMENT_BILLING_VALUES.map((value) => (
              <ConditionChip
                key={value}
                label={SEGMENT_BILLING_LABELS[value]}
                count={count("billing", value)}
                active={Boolean(spec.billing?.includes(value))}
                onClick={() => onChange(toggleSegmentListValue(spec, "billing", value))}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <FacetPicker
              label="담당"
              facets={segment?.facets.owners ?? []}
              selected={spec.owners ?? []}
              onToggle={(value) => onChange(toggleSegmentListValue(spec, "owners", value))}
              emptyText="담당 정보가 없습니다."
              hiddenCount={segment?.facetHiddenCounts?.owners}
            />
            <FacetPicker
              label="지역"
              facets={segment?.facets.regions ?? []}
              selected={spec.regions ?? []}
              onToggle={(value) => onChange(toggleSegmentListValue(spec, "regions", value))}
              emptyText="지역 정보가 없습니다."
              hiddenCount={segment?.facetHiddenCounts?.regions}
            />
            <FacetPicker
              label="라벨"
              facets={segment?.facets.tags ?? []}
              selected={selectedTags}
              onToggle={toggleTag}
              emptyText="붙은 라벨이 없습니다."
              hiddenCount={segment?.facetHiddenCounts?.tags}
              footer={
                <div className="mt-1 flex items-center gap-1 border-t border-[#f0f0ec] px-2 pt-2" role="group" aria-label="라벨 조건 방식">
                  <span className="text-[11px] font-semibold text-[#1a1a1a]/40">고른 라벨을</span>
                  {(["any", "all"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => switchTagMode(mode)}
                      aria-pressed={tagMode === mode}
                      className={`h-7 rounded-md border px-2 text-[11px] font-semibold ${chipClass(tagMode === mode, false)}`}
                    >
                      {mode === "all" ? "모두 가진" : "하나라도 가진"}
                    </button>
                  ))}
                </div>
              }
            />
          </div>
        </div>
      </div>
    </section>
  )
}
