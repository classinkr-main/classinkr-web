"use client"

// 콘솔 전용 운영 패널 — 단계별/담당자 현황 · 미확인 수신함 · 파이프라인 리스크.
// 집계·핸들러는 부모(LeadsBoardClient)가 소유하고 여기는 표시·콜백만 담당한다.
// LeadsBoardClient.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { Check, Loader2 } from "lucide-react"
import type { LeadRecord, LeadStatus } from "@/lib/repositories/leads"
import {
  STATUS_DOT,
  STATUS_LABEL,
  StatusPill,
  SOURCE_LABEL,
  calcScore,
  ScoreBadge,
  toLocalDateKey,
  daysBetween,
  getLeadOwner,
  getLeadSourceDetail,
} from "../shared"
import { OWNER_ROW_CAP } from "./shared"

export interface LeadStageSummary {
  status: LeadStatus
  count: number
  stageOverdue: number
  highScore: number
}

export interface LeadOwnerSummary {
  owner: string
  total: number
  newCount: number
  contactedCount: number
  unrespondedCount: number
  overdueCount: number
  highScoreCount: number
}

/* 파이프라인 단계 + 담당자 — 숫자·필터 진입은 필터 카운트 카드가 단일 창구.
   여기는 카드에 없는 부가 정보(단계별 고득점·지연, 오늘 예정, 담당자 분포)만 남긴다. */
export function StageOwnerPanels({
  stageSummaries,
  stageTotal,
  activeCount,
  ownerSummaries,
  todayFollowUpCount,
  onSelectStage,
}: {
  stageSummaries: LeadStageSummary[]
  stageTotal: number
  activeCount: number
  ownerSummaries: LeadOwnerSummary[]
  todayFollowUpCount: number
  onSelectStage: (status: LeadStatus) => void
}) {
  return (
    <div id="lead-queue" className="mb-4 grid gap-3 lg:grid-cols-2 scroll-mt-24">
      <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Pipeline</p>
            <h2 className="mt-1 text-[17px] font-bold text-[#111110]">단계별 현황</h2>
          </div>
          <div className="flex items-center gap-2">
            {todayFollowUpCount > 0 && (
              <span className="rounded-full border border-[#D7EBDD] px-3 py-1 text-[12px] font-medium text-[#084734]">
                오늘 예정 {todayFollowUpCount}
              </span>
            )}
            <span
              title="아래 비율 바의 분모 — 확인 완료 리드를 네 단계가 남김없이 나눈 수입니다. '활성'은 여기서 전환·종료를 뺀 수입니다."
              className="rounded-full bg-[#f0f0ec] px-3 py-1 text-[12px] font-medium text-[#1a1a1a]/55"
            >
              활성 {activeCount} / 전체 {stageTotal.toLocaleString("ko-KR")}건
            </span>
          </div>
        </div>
        <div className="divide-y divide-[#f0f0ec]">
          {stageSummaries.map((stage) => {
            // 네 단계는 확인 완료 리드를 남김없이 나눈다 — 그래서 비율의 합이 정확히 100%다.
            // (필터 카드는 게이트 면제 때문에 분모가 갈려 바를 못 그린다. 여기만 성립한다.)
            const share = stageTotal > 0 ? (stage.count / stageTotal) * 100 : 0
            return (
              <button
                key={stage.status}
                type="button"
                onClick={() => onSelectStage(stage.status)}
                title={`${STATUS_LABEL[stage.status]} ${stage.count.toLocaleString("ko-KR")}건 · 전체의 ${share.toFixed(1)}%`}
                className="block w-full px-1 py-2.5 text-left transition-colors hover:bg-[#fafaf8]"
              >
                <span className="flex items-center justify-between gap-3">
                  <StatusPill status={stage.status} />
                  <span className="flex items-center gap-3 text-[11px] text-[#1a1a1a]/40">
                    <span>고득점 {stage.highScore}</span>
                    {stage.stageOverdue > 0 && <span className="font-medium text-[#B85C33]">지연 {stage.stageOverdue}</span>}
                    <span className="min-w-[3rem] text-right text-[19px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[#111110]">
                      {stage.count.toLocaleString("ko-KR")}
                    </span>
                  </span>
                </span>
                {/* 비중 — 색축은 상태점(STATUS_DOT)과 같은 것을 쓴다. 새 색을 들이지 않는다. */}
                <span aria-hidden className="mt-2 block h-[3px] w-full overflow-hidden rounded-full bg-[#f0f0ec]">
                  <span
                    className="block h-full rounded-full transition-[width]"
                    style={{ width: `${share}%`, backgroundColor: STATUS_DOT[stage.status] }}
                  />
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Owners</p>
            <h2 className="mt-1 text-[17px] font-bold text-[#111110]">담당자별 보유 리드</h2>
          </div>
          <span
            title="아래 비율 바의 분모 — 활성 리드를 담당자가 남김없이 나눈 수입니다(미배정 포함)."
            className="text-[12px] font-medium text-[#1a1a1a]/40"
          >
            {ownerSummaries.length}명 · 활성 {activeCount.toLocaleString("ko-KR")}건
          </span>
        </div>
        {ownerSummaries.length === 0 ? (
          <p className="rounded-xl bg-[#fafaf8] px-3 py-8 text-center text-[13px] text-[#1a1a1a]/30">활성 리드가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {ownerSummaries.slice(0, OWNER_ROW_CAP).map((owner) => {
              // 담당자는 활성 리드를 남김없이 나눈다(미배정도 한 칸) — 그래서 비율의 합이 100%다.
              const share = activeCount > 0 ? (owner.total / activeCount) * 100 : 0
              const unassigned = owner.owner === "미배정"
              return (
              <div
                key={owner.owner}
                title={`${owner.owner} ${owner.total.toLocaleString("ko-KR")}건 · 활성의 ${share.toFixed(1)}%`}
                className="rounded-xl border border-[#f0f0ec] px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className={`truncate text-[13px] font-semibold ${unassigned ? "text-[#B85C33]" : "text-[#111110]"}`}>
                    {owner.owner}
                  </p>
                  <p className={`text-[19px] font-bold leading-none tracking-[-0.02em] tabular-nums ${unassigned ? "text-[#B85C33]" : "text-[#111110]"}`}>
                    {owner.total.toLocaleString("ko-KR")}
                  </p>
                </div>
                {/* 비중 — 담당자는 상태 축이 아니라 중립색을 쓰고, 배분 공백(미배정)만 위험색으로 든다. */}
                <span aria-hidden className="mt-2 block h-[3px] w-full overflow-hidden rounded-full bg-[#f0f0ec]">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${share}%`, backgroundColor: unassigned ? "#B85C33" : "#111110" }}
                  />
                </span>
                <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-[#1a1a1a]/40">
                  <span>신규 {owner.newCount}</span>
                  {owner.unrespondedCount > 0 && <span className="font-medium text-[#B85C33]">응대 전 {owner.unrespondedCount}</span>}
                  <span>연락중 {owner.contactedCount}</span>
                  <span>고득점 {owner.highScoreCount}</span>
                  {owner.overdueCount > 0 && <span className="font-medium text-[#B85C33]">지연 {owner.overdueCount}</span>}
                </div>
              </div>
              )
            })}
            {/* 가려진 담당자를 각주로 드러낸다 — 보이는 바의 합이 100%가 아닌 이유다. */}
            {ownerSummaries.length > OWNER_ROW_CAP ? (
              <p className="pt-0.5 text-center text-[11px] text-[#1a1a1a]/40">
                +{(ownerSummaries.length - OWNER_ROW_CAP).toLocaleString("ko-KR")}명 ·{" "}
                {ownerSummaries
                  .slice(OWNER_ROW_CAP)
                  .reduce((sum, owner) => sum + owner.total, 0)
                  .toLocaleString("ko-KR")}
                건 숨김
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

/* 미확인 수신함 — 공개 폼(문의·데모·뉴스레터 등) 원본 유입. 확인해야 아래 리드 목록에 반영된다. */
export function UnconfirmedInbox({
  unconfirmedLeads,
  confirmingIds,
  onShowAll,
  onConfirmMany,
  onSelect,
}: {
  unconfirmedLeads: LeadRecord[]
  confirmingIds: Set<string>
  onShowAll: () => void
  onConfirmMany: (ids: string[]) => void
  onSelect: (lead: LeadRecord) => void
}) {
  return (
    <div id="unconfirmed-inbox" className="mb-6 scroll-mt-24 rounded-2xl border-[1.15px] border-[#ECD29C] bg-transparent p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7A520F]/80">Unconfirmed Inbox</p>
          <h2 className="text-[16px] font-bold text-[#111110]">새 유입 · 미확인 {unconfirmedLeads.length}건</h2>
          <p className="mt-0.5 text-[12px] text-[#1a1a1a]/45">
            공개 폼(문의·데모·뉴스레터 등)으로 들어온 리드 — 확인하면 아래 리드 목록·집계에 반영됩니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onShowAll}
            className="text-[12px] font-medium text-[#7A520F] hover:underline"
          >
            전체 보기
          </button>
          <button
            type="button"
            onClick={() => onConfirmMany(unconfirmedLeads.map((lead) => lead.id))}
            disabled={confirmingIds.size > 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#7A520F] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {confirmingIds.size > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            전체 확인
          </button>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {unconfirmedLeads.slice(0, 5).map((lead) => (
          <div key={lead.id} className="rounded-xl border border-[#ECD29C] bg-white px-3 py-3">
            <button type="button" onClick={() => onSelect(lead)} className="block w-full text-left">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[13px] font-semibold text-[#111110]">{lead.name ?? lead.org ?? "이름 없음"}</p>
                <ScoreBadge score={calcScore(lead)} />
              </div>
              {/* 세부 유입(메타는 광고명)이 있으면 그쪽이 더 정보값 — 없을 때만 소스 라벨 */}
              <p className="mt-1 truncate text-[12px] text-[#1a1a1a]/45">
                {getLeadSourceDetail(lead) || (SOURCE_LABEL[lead.source] ?? lead.source)}
              </p>
            </button>
            <button
              type="button"
              onClick={() => onConfirmMany([lead.id])}
              disabled={confirmingIds.has(lead.id)}
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-[#FBF1E0] px-2 py-1 text-[11px] font-semibold text-[#7A520F] transition-colors hover:bg-[#ECD29C] disabled:opacity-40"
            >
              {confirmingIds.has(lead.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              확인
            </button>
          </div>
        ))}
      </div>
      {unconfirmedLeads.length > 5 && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-3 text-[12px] font-medium text-[#7A520F] hover:underline"
        >
          +{unconfirmedLeads.length - 5}건 더 보기
        </button>
      )}
    </div>
  )
}

/* 파이프라인 리스크 — 오래 멈춘 리드 / 팔로업 지연 리드 상위 5건. */
export function PipelineRiskPanel({
  pipelineRiskLeads,
  overdueCount,
  stalledCount,
  today,
  onFilterContacted,
  onSelect,
}: {
  pipelineRiskLeads: LeadRecord[]
  overdueCount: number
  stalledCount: number
  today: string
  onFilterContacted: () => void
  onSelect: (lead: LeadRecord) => void
}) {
  return (
    <div id="pipeline-risk" className="mb-6 scroll-mt-24 rounded-2xl border-[1.15px] border-[#F6D5C5] bg-transparent p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#B85C33]/70">Pipeline Risk</p>
          <h2 className="text-[16px] font-bold text-[#111110]">오래 멈춘 리드 / 지연 리드</h2>
        </div>
        <button
          onClick={onFilterContacted}
          className="text-left text-[12px] font-medium text-[#B85C33] hover:text-[#9A4A27]"
        >
          지연 {overdueCount}건 · 7일 이상 정체 {stalledCount}건
        </button>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {pipelineRiskLeads.map((lead) => {
          const followUpKey = lead.follow_up_at ? toLocalDateKey(lead.follow_up_at) : null
          const overdueDays = followUpKey && followUpKey < today ? daysBetween(lead.follow_up_at!) : 0
          const ageDays = daysBetween(lead.timestamp)
          return (
            <button
              key={lead.id}
              type="button"
              onClick={() => onSelect(lead)}
              className="rounded-xl border border-[#F6D5C5] bg-white px-3 py-3 text-left transition-colors hover:bg-[#fffaf7]"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[13px] font-semibold text-[#111110]">{lead.name ?? lead.org ?? "이름 없음"}</p>
                <ScoreBadge score={calcScore(lead)} />
              </div>
              <p className="mt-1 truncate text-[12px] text-[#1a1a1a]/45">{lead.org ?? getLeadOwner(lead)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-md bg-[#FEF3EE] px-2 py-0.5 font-medium text-[#B85C33]">
                  {overdueDays > 0 ? `${overdueDays}일 지연` : `${ageDays}일 정체`}
                </span>
                <span className="rounded-md bg-[#f0f0ec] px-2 py-0.5 text-[#1a1a1a]/45">{getLeadOwner(lead)}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
