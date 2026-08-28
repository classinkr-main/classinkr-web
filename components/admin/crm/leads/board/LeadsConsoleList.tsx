"use client"

// 콘솔 뷰 목록 — 모바일 카드 + 데스크톱 테이블 + 더보기 + 빈/장애 상태.
// 선택·삭제·전환 상태와 mutation은 부모(LeadsBoardClient)가 소유하고 여기는 표시·콜백만 담당한다.
// LeadsBoardClient.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { Check, Clock, Flame, Loader2, Mail, PhoneCall, RefreshCw, Trash2, UserPlus } from "lucide-react"
import ShowMore from "@/components/admin/ui/ShowMore"
import type { LeadRecord } from "@/lib/repositories/leads"
import type { ContactLogType } from "@/lib/repositories/contact-logs"
import type { LeadActivityBadge } from "@/lib/repositories/lead-activity"
import type { LeadPriority } from "@/lib/crm/lead-ranking"
import { isTestLead } from "@/lib/crm/lead-attribution"
import { CompassLeadChip } from "@/components/admin/compass/CompassLeadChip"
import type { useCompassOverlay } from "@/components/admin/compass/use-compass-overlay"
import {
  StatusPill,
  toLocalDateKey,
  daysBetween,
  isActiveLead,
  isResponseTargetLead,
  isUnrespondedLead,
  isUnconfirmedLead,
  hoursBetween,
  formatResponseAge,
  getLeadSourceDetail,
  getLeadMagnetLabel,
  getLeadDisplayName,
  getLeadSourceGroup,
  SOURCE_GROUP_LABEL,
  SourceGroupDot,
} from "../shared"
import {
  LEAD_BOARD_LIST_STEP,
  LeadActivityChip,
  PriorityCell,
  getLeadSourceSegment,
  priorityBreakdownTitle,
  priorityToneClass,
} from "./shared"

export default function LeadsConsoleList({
  filtered,
  totalLeadCount,
  loading,
  loadError,
  visibleLeadCount,
  canMoreLeads,
  canCollapseLeads,
  onShowMore,
  onCollapse,
  selectedId,
  selectedLeadIds,
  deletingIds,
  convertingIds,
  activitySummary,
  priorityMap,
  today,
  now,
  compassLookup,
  allVisibleSelected,
  selectedVisibleCount,
  visibleIds,
  onSelect,
  onToggleLeadSelection,
  onToggleVisibleSelection,
  onDelete,
  onConvert,
  onContactAction,
  onRetry,
  onOpenLeadModal,
  onResetAllFilters,
}: {
  filtered: LeadRecord[]
  totalLeadCount: number
  loading: boolean
  loadError: string | null
  visibleLeadCount: number
  canMoreLeads: boolean
  canCollapseLeads: boolean
  onShowMore: () => void
  onCollapse: () => void
  selectedId: string | undefined
  selectedLeadIds: Set<string>
  deletingIds: Set<string>
  convertingIds: Set<string>
  activitySummary: Record<string, LeadActivityBadge>
  priorityMap: Map<string, LeadPriority>
  today: string
  now: Date
  compassLookup: ReturnType<typeof useCompassOverlay>["lookup"]
  allVisibleSelected: boolean
  selectedVisibleCount: number
  visibleIds: string[]
  onSelect: (lead: LeadRecord) => void
  onToggleLeadSelection: (id: string, checked: boolean) => void
  onToggleVisibleSelection: (checked: boolean) => void
  onDelete: (id: string) => void
  onConvert: (lead: LeadRecord) => void
  onContactAction: (lead: LeadRecord, type: ContactLogType) => void
  onRetry: () => void
  onOpenLeadModal: () => void
  onResetAllFilters: () => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden">
      {loading && totalLeadCount === 0 ? (
        // 콜드로드 스켈레톤 — 리스트 행 골격과 일치(텍스트 로더 대신).
        <div className="divide-y divide-[#f0f0ec] px-5" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`sk-${index}`} className="flex items-center gap-4 py-4">
              <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-[#f0f0ec]" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-4 w-1/3 animate-pulse rounded bg-[#f0f0ec]" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-[#f5f5f2]" />
              </div>
              <div className="hidden h-5 w-16 shrink-0 animate-pulse rounded-full bg-[#f0f0ec] sm:block" />
              <div className="hidden h-5 w-14 shrink-0 animate-pulse rounded-full bg-[#f5f5f2] sm:block" />
            </div>
          ))}
        </div>
      ) : loadError && totalLeadCount === 0 ? (
        // 장애 상태 — 빈 목록과 구분해 "등록된 리드가 없습니다"로 오인되지 않게 한다.
        <div role="alert" aria-live="assertive" className="px-6 py-14 text-center">
          <p className="text-[13px] font-semibold text-[#B85C33]">리드를 불러오지 못했습니다.</p>
          <p className="mt-1 text-[12px] text-[#1a1a1a]/45">{loadError}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#F6D5C5] bg-white px-3 text-[12px] font-semibold text-[#B85C33] transition-colors hover:bg-[#FEF3EE]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            다시 시도
          </button>
        </div>
      ) : filtered.length === 0 ? (
        // 빈 상태 — 다음 행동 안내(리드 등록 / 조건 초기화).
        <div className="px-6 py-14 text-center">
          <p className="text-[13px] font-semibold text-[#111110]">
            {totalLeadCount === 0 ? "등록된 리드가 없습니다." : "조건에 맞는 리드가 없습니다."}
          </p>
          <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
            {totalLeadCount === 0
              ? "리드를 등록하면 응대 큐와 파이프라인 집계가 시작됩니다."
              : "필터를 조정하거나 전체 리드에서 다시 확인하세요."}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {totalLeadCount > 0 ? (
              <button
                type="button"
                onClick={onResetAllFilters}
                className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
              >
                전체 리드 보기
              </button>
            ) : null}
            <button
              type="button"
              onClick={onOpenLeadModal}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <UserPlus className="h-3.5 w-3.5" />
              리드 등록
            </button>
          </div>
        </div>
      ) : (
        <>
        <div className="divide-y divide-[#f0f0ec] sm:hidden">
          {filtered.slice(0, visibleLeadCount).map((lead) => {
            const followUpDateKey = lead.follow_up_at ? toLocalDateKey(lead.follow_up_at) : null
            const isOverdue = Boolean(followUpDateKey && followUpDateKey < today && lead.status !== "converted" && lead.status !== "closed")
            const isTodayFollowUp = followUpDateKey === today
            const ageDays = daysBetween(lead.timestamp)
            const unrespondedHours = isUnrespondedLead(lead) ? hoursBetween(lead.timestamp, now) : null
            const sourceDetail = getLeadSourceDetail(lead)
            const sourceSegment = getLeadSourceSegment(lead)
            const priority = priorityMap.get(lead.id)
            const compassEntry = compassLookup(lead)

            return (
              <div
                key={`mobile-${lead.id}`}
                className={`block w-full px-4 py-4 text-left transition-colors ${
                  selectedId === lead.id ? "bg-[#f0f0ec]" : "hover:bg-[#fafaf8]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <label
                    className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white sm:h-8 sm:w-8"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.has(lead.id)}
                      onChange={(event) => onToggleLeadSelection(lead.id, event.target.checked)}
                      aria-label={`${getLeadDisplayName(lead)} 선택`}
                      className="h-4 w-4 accent-[#084734]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onSelect(lead)}
                    aria-label={`${getLeadDisplayName(lead)} 상세 열기`}
                    className="min-w-0 flex-1 rounded-lg text-left"
                  >
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-semibold text-[#111110]">
                        {lead.name ?? "No name"}
                      </p>
                      {priority ? (
                        <span
                          title={priorityBreakdownTitle(priority)}
                          className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${priorityToneClass(priority.total)}`}
                        >
                          <Flame className="h-2.5 w-2.5" />
                          {priority.total}
                        </span>
                      ) : null}
                      <LeadActivityChip badge={activitySummary[lead.id]} />
                    </div>
                    <p className="mt-1 truncate text-[12px] text-[#1a1a1a]/50">
                      {lead.org ?? lead.phone ?? lead.email ?? "-"}
                    </p>
                    {priority && priority.reasons.length > 0 ? (
                      <p className="mt-0.5 truncate text-[11px] text-[#1a1a1a]/40">
                        {priority.reasons.join(" · ")}
                      </p>
                    ) : null}
                    {/* 조상이 <button>이라 링크가 아닌 표시형 칩으로 그린다(중첩 인터랙티브 금지). */}
                    {compassEntry ? (
                      <span className="mt-1 flex">
                        <CompassLeadChip entry={compassEntry} interactive={false} />
                      </span>
                    ) : null}
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    {isUnconfirmedLead(lead) && (
                      <span className="rounded-full bg-[#FBF1E0] px-2 py-0.5 text-[11px] font-medium text-[#7A520F]">
                        미확인
                      </span>
                    )}
                    <StatusPill status={lead.status} />
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDelete(lead.id)
                      }}
                      disabled={deletingIds.has(lead.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#F6D5C5] bg-white text-[#B85C33] transition-colors hover:bg-[#FEF3EE] disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`${getLeadDisplayName(lead)} 삭제`}
                      title="삭제"
                    >
                      {deletingIds.has(lead.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#1a1a1a]/45">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#f0f0ec] px-2 py-1">
                    <SourceGroupDot group={getLeadSourceGroup(lead)} size={6} />
                    {SOURCE_GROUP_LABEL[getLeadSourceGroup(lead)]}
                    {sourceSegment ? ` · ${sourceSegment}` : ""}
                  </span>
                  {sourceDetail ? (
                    <span className="rounded-md bg-[#ECFDF5] px-2 py-1 text-[#084734]">
                      {sourceDetail}
                    </span>
                  ) : null}
                  {lead.lead_magnet ? (
                    <span className="rounded-md bg-[#FBF1E0] px-2 py-1 text-[#7A520F]">
                      {getLeadMagnetLabel(lead.lead_magnet)}
                    </span>
                  ) : null}
                  {unrespondedHours !== null ? (
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium ${
                      unrespondedHours >= 48
                        ? "bg-[#FEF3EE] text-[#B85C33]"
                        : unrespondedHours >= 24
                          ? "bg-[#FBF1E0] text-[#7A520F]"
                          : "bg-[#f0f0ec] text-[#1a1a1a]/45"
                    }`}>
                      <Clock className="h-3 w-3" />
                      미응대 {formatResponseAge(unrespondedHours)}
                    </span>
                  ) : null}
                  <span>
                    {new Date(lead.timestamp).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                  </span>
                  {lead.follow_up_at ? (
                    <span className={isOverdue ? "font-medium text-[#B85C33]" : isTodayFollowUp ? "font-medium text-[#084734]" : ""}>
                      {isOverdue ? "지연 " : isTodayFollowUp ? "오늘 " : ""}
                      {new Date(lead.follow_up_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                    </span>
                  ) : null}
                  {lead.assigned_to ? <span>{lead.assigned_to}</span> : null}
                  {ageDays >= 7 && isActiveLead(lead.status) ? (
                    <span className="font-medium text-[#B85C33]">{ageDays}일 정체</span>
                  ) : null}
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSelect(lead)}
                    className="inline-flex items-center justify-center rounded-md border border-[#D7EBDD] bg-[#ECFDF5] px-3 text-[12px] font-medium text-[#084734]"
                  >
                    상세 보기
                  </button>
                  {lead.phone ? (
                    <a
                      href={`tel:${lead.phone}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onContactAction(lead, "call")
                      }}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-[#084734] px-3 text-[12px] font-medium text-white"
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                      Call
                    </a>
                  ) : null}
                  {lead.email ? (
                    <a
                      href={`mailto:${lead.email}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onContactAction(lead, "email")
                      }}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-3 text-[12px] font-medium text-[#111110]"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </a>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
        <div className="hidden overflow-x-auto sm:block">
        <table className="min-w-[1400px] w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#e8e8e4] bg-[#fafaf8]">
              <th scope="col" className="w-12 px-5 py-3.5">
                <input
                  type="checkbox"
                  // 일부만 선택된 상태를 "선택 안 됨"으로 그리면, 클릭이 전체 선택인지 전체 해제인지
                  // 예측할 수 없다. 부분 선택은 indeterminate로 드러낸다.
                  // 범위는 "화면에 그려진 행"만 — 더보기 밖 리드까지 조용히 선택되지 않는다.
                  ref={(node) => {
                    if (node) node.indeterminate = !allVisibleSelected && selectedVisibleCount > 0
                  }}
                  checked={allVisibleSelected}
                  disabled={visibleIds.length === 0}
                  onChange={(event) => onToggleVisibleSelection(event.target.checked)}
                  aria-label={
                    allVisibleSelected
                      ? "화면에 표시된 리드 전체 선택 해제"
                      : `화면에 표시된 ${visibleIds.length}건 전체 선택 (현재 ${selectedVisibleCount}건 선택됨)`
                  }
                  className="h-4 w-4 accent-[#084734] disabled:opacity-30"
                />
              </th>
              {["우선순위", "시간", "응대", "유입", "이름", "기관", "담당자", "연락처", "팔로업", "정체", "상태"].map((h) => (
                <th key={h} scope="col" className="text-left px-5 py-3.5 font-medium text-[#1a1a1a]/40 whitespace-nowrap text-[12px]">{h}</th>
              ))}
              <th scope="col" className="w-16 px-5 py-3.5 text-right text-[12px] font-medium text-[#1a1a1a]/40">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, visibleLeadCount).map((lead) => {
              const followUpDateKey = lead.follow_up_at ? toLocalDateKey(lead.follow_up_at) : null
              const isOverdue = Boolean(followUpDateKey && followUpDateKey < today && lead.status !== "converted" && lead.status !== "closed")
              const isTodayFollowUp = followUpDateKey === today
              const ageDays = daysBetween(lead.timestamp)
              const unrespondedHours = isUnrespondedLead(lead) ? hoursBetween(lead.timestamp, now) : null
              const sourceDetail = getLeadSourceDetail(lead)
              const sourceSegment = getLeadSourceSegment(lead)
              const priority = priorityMap.get(lead.id)
              const compassEntry = compassLookup(lead)
              return (
                <tr
                  key={lead.id}
                  onClick={() => onSelect(lead)}
                  // 행 자체가 상세 진입점이므로 키보드로도 열 수 있어야 한다(모바일 카드와 동일 규약).
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      onSelect(lead)
                    }
                  }}
                  aria-label={`${getLeadDisplayName(lead)} 상세 열기`}
                  className={`border-b border-[#e8e8e4] last:border-0 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-[#084734] focus-visible:-outline-offset-2 ${
                    selectedId === lead.id ? "bg-[#f0f0ec]" : "hover:bg-[#fafaf8]"
                  }`}
                >
                  <td className="px-5 py-4">
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.has(lead.id)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => onToggleLeadSelection(lead.id, event.target.checked)}
                      aria-label={`${getLeadDisplayName(lead)} 선택`}
                      className="h-4 w-4 accent-[#084734]"
                    />
                  </td>
                  <td className="px-5 py-4">
                    {priority ? <PriorityCell priority={priority} /> : <span className="text-[#1a1a1a]/30">—</span>}
                  </td>
                  <td className="px-5 py-4 text-[#1a1a1a]/40 whitespace-nowrap text-[12px] tabular-nums">
                    {new Date(lead.timestamp).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-[12px]">
                    {unrespondedHours !== null ? (
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium ${
                        unrespondedHours >= 48
                          ? "bg-[#FEF3EE] text-[#B85C33]"
                          : unrespondedHours >= 24
                            ? "bg-[#FBF1E0] text-[#7A520F]"
                            : "bg-[#f0f0ec] text-[#1a1a1a]/45"
                      }`}>
                        <Clock className="h-3 w-3" />
                        {formatResponseAge(unrespondedHours)}
                      </span>
                    ) : isResponseTargetLead(lead) ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#ECFDF5] px-2 py-0.5 font-medium text-[#084734]">
                        <Check className="h-3 w-3" />
                        완료
                      </span>
                    ) : (
                      <span className="text-[#1a1a1a]/30">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <div className="flex max-w-[240px] flex-col items-start gap-1">
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-[#111110]">
                        <SourceGroupDot group={getLeadSourceGroup(lead)} />
                        {SOURCE_GROUP_LABEL[getLeadSourceGroup(lead)]}
                        {sourceSegment ? (
                          <>
                            <span className="text-[#1a1a1a]/30">·</span>
                            <span className="max-w-[120px] truncate text-[#1a1a1a]/45">{sourceSegment}</span>
                          </>
                        ) : null}
                      </span>
                      {sourceDetail ? (
                        <span className="max-w-full truncate rounded-md bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-medium text-[#084734]">
                          {sourceDetail}
                        </span>
                      ) : null}
                      {lead.lead_magnet ? (
                        <span className="max-w-full truncate rounded-md bg-[#FBF1E0] px-2 py-0.5 text-[11px] font-medium text-[#7A520F]">
                          {getLeadMagnetLabel(lead.lead_magnet)}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-4 font-medium text-[#111110]">
                    <div className="flex items-center gap-1.5">
                      {lead.name ?? "—"}
                      <LeadActivityChip badge={activitySummary[lead.id]} />
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[#1a1a1a]/55">{lead.org ?? "—"}</td>
                  <td className="px-5 py-4 whitespace-nowrap text-[#1a1a1a]/55">
                    {lead.assigned_to ? (
                      <span className="rounded-md bg-[#f0f0ec] px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/55">
                        {lead.assigned_to}
                      </span>
                    ) : (
                      <span className="rounded-md bg-[#FEF3EE] px-2 py-0.5 text-[11px] font-medium text-[#B85C33]">미배정</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-[#1a1a1a]/55">{lead.phone ?? lead.email ?? "—"}</td>
                  <td className="px-5 py-4 whitespace-nowrap text-[12px]">
                    {lead.follow_up_at ? (
                      <span className={isOverdue ? "text-[#B85C33] font-medium" : isTodayFollowUp ? "text-[#084734] font-medium" : "text-[#1a1a1a]/40"}>
                        {isOverdue ? "지연 " : isTodayFollowUp ? "오늘 " : ""}
                        {new Date(lead.follow_up_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                      </span>
                    ) : (
                      <span className="text-[#1a1a1a]/30">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-[12px] tabular-nums">
                    {isActiveLead(lead.status) && ageDays >= 7 ? (
                      <span className="font-medium text-[#B85C33]">{ageDays}일</span>
                    ) : (
                      <span className="text-[#1a1a1a]/40">{ageDays}일</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isUnconfirmedLead(lead) && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-[#FBF1E0] text-[#7A520F]">
                          미확인
                        </span>
                      )}
                      <StatusPill status={lead.status} />
                      {/* 우리 상태 옆에 마케팅팀 상태를 병기 — 덮어쓰지 않는다. */}
                      {compassEntry ? <CompassLeadChip entry={compassEntry} /> : null}
                      {/*
                        상태 전환은 드로어를 열고 스크롤해야만 가능했다. 그래서 리드
                        115건이 전부 new 로 남아 있었고(2026-08-05 실측), 컨택 신호가
                        우선순위에서 아무 일도 하지 못했다. 목록에서 한 번에 넘긴다.
                      */}
                      {lead.status === "new" && !isTestLead(lead) && (
                        <button
                          type="button"
                           onClick={(event) => {
                             event.stopPropagation()
                             onContactAction(lead, "call")
                           }}
                          title="상세에서 연락 기록 남기기"
                          className="inline-flex items-center gap-1 rounded-full border border-[#D7EBDD] bg-white px-2 py-0.5 text-[11px] font-medium text-[#084734] transition-colors hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <PhoneCall className="h-3 w-3" />
                          연락 기록
                        </button>
                      )}
                      {lead.status === "converted" && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-[#ECFDF5] text-[#084734] border border-[#D7EBDD]">
                          CRM 전환
                        </span>
                      )}
                      {lead.notes && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a]/20 shrink-0" title="메모 있음" />
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {/* 전환도 삭제처럼 목록에서 바로 — 드로어를 열고 스크롤하는 3단계 동선을 없앤다.
                          고객·딜이 실제로 생성되므로 실행 전에 확인을 받는다. */}
                      {lead.status !== "converted" && !isUnconfirmedLead(lead) && !isTestLead(lead) && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            if (
                              confirm(
                                `"${getLeadDisplayName(lead)}" 리드를 고객·거래로 전환할까요? CRM에 고객사와 딜이 생성됩니다.`
                              )
                            )
                              onConvert(lead)
                          }}
                          disabled={convertingIds.has(lead.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#D7EBDD] bg-white text-[#084734] transition-colors hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`${getLeadDisplayName(lead)} 고객·거래로 전환`}
                          title="고객·거래 등록"
                        >
                          {convertingIds.has(lead.id) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserPlus className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onDelete(lead.id)
                        }}
                        disabled={deletingIds.has(lead.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#F6D5C5] bg-white text-[#B85C33] transition-colors hover:bg-[#FEF3EE] disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`${getLeadDisplayName(lead)} 삭제`}
                        title="삭제"
                      >
                        {deletingIds.has(lead.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        {(canMoreLeads || canCollapseLeads) && (
          <div className="flex flex-col items-center gap-2 border-t border-[#e8e8e4] bg-[#fafaf8] px-5 py-4">
            <p role="status" className="text-[11px] font-medium tabular-nums text-[#1a1a1a]/45">
              {visibleLeadCount.toLocaleString("ko-KR")} / 총{" "}
              {filtered.length.toLocaleString("ko-KR")}건 표시
            </p>
            <ShowMore
              visible={visibleLeadCount}
              total={filtered.length}
              step={LEAD_BOARD_LIST_STEP}
              onMore={onShowMore}
              onCollapse={canCollapseLeads ? onCollapse : undefined}
            />
          </div>
        )}
        </>
      )}
    </div>
  )
}
