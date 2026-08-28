"use client"

import { useState } from "react"
import { Clock, Flame } from "lucide-react"

import { CompassLeadChip } from "@/components/admin/compass/CompassLeadChip"
import { normalizePhoneKey } from "@/lib/compass/normalize"
import type { CompassOverlayEntry, CompassOverlayMap } from "@/lib/compass/overlay"
import type { LeadRecord } from "@/lib/repositories/leads"
import {
  BOARD_COLUMN_LABEL,
  daysBetween,
  hoursBetween,
  isUnrespondedLead,
  type BoardColumnKey,
} from "@/lib/crm/leads-board-state"
import {
  SOURCE_GROUP_DOT,
  SOURCE_GROUP_LABEL,
  STATUS_DOT,
  calcScore,
  formatResponseAge,
  getLeadOwner,
  getLeadSourceGroup,
  toLocalDateKey,
} from "./shared"

// 보드 뷰 — 콘솔(목록)과 같은 모집단을 단계 컬럼으로 눕힌 화면.
// 설계 정본: docs/active/crm-lead-console-board-design-2026-08-21.md §3
//
// 이 컴포넌트는 필터를 스스로 해석하지 않는다. 상위(LeadsBoardClient)가
// lib/crm/leads-board-state 의 규칙으로 컬럼을 나눠 넘겨주고, 여기서는 그리기만 한다.

const COLUMN_ORDER: BoardColumnKey[] = ["unconfirmed", "new", "contacted", "converted", "closed"]
const COLUMN_DOT: Record<BoardColumnKey, string> = {
  unconfirmed: "#A8741A",
  new: STATUS_DOT.new,
  contacted: STATUS_DOT.contacted,
  converted: STATUS_DOT.converted,
  closed: STATUS_DOT.closed,
}
// 한 컬럼에 그리는 카드 상한. 넘치는 건수는 각주로 드러낸다 — 조용히 자르지 않는다.
const COLUMN_CARD_CAP = 20

function LeadCard({
  lead,
  selected,
  onSelect,
  today,
  now,
  compassEntry,
}: {
  lead: LeadRecord
  selected: boolean
  onSelect: (lead: LeadRecord) => void
  today: string
  now: Date
  /** Compass 매칭이 있을 때만 전달된다 — 없으면 칩 자체가 그려지지 않는다. */
  compassEntry?: CompassOverlayEntry
}) {
  const score = calcScore(lead)
  const unrespondedHours = isUnrespondedLead(lead) ? hoursBetween(lead.timestamp, now) : null
  const followUpKey = lead.follow_up_at ? toLocalDateKey(lead.follow_up_at) : null
  const overdueDays = followUpKey && followUpKey < today ? daysBetween(lead.follow_up_at!) : 0
  const group = getLeadSourceGroup(lead)
  const owner = getLeadOwner(lead)

  return (
    <button
      type="button"
      onClick={() => onSelect(lead)}
      aria-pressed={selected}
      className={`mb-2 block w-full rounded-xl border bg-white px-3 py-2.5 text-left transition-colors ${
        selected ? "border-[#111110]" : "border-[#e8e8e4] hover:border-[#c8c8c4]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#111110]">
          {lead.name ?? lead.org ?? "이름 없음"}
        </span>
        <span
          className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
            score >= 70 ? "bg-[#ECFDF5] text-[#084734]" : "bg-[#f0f0ec] text-[#1a1a1a]/60"
          }`}
        >
          <Flame className="h-2.5 w-2.5" />
          {score}
        </span>
      </div>
      {lead.org && lead.name ? (
        <p className="mt-1 truncate text-[12px] text-[#1a1a1a]/50">{lead.org}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-[#f0f0ec] px-2 py-0.5 text-[11px] text-[#1a1a1a]/55">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: SOURCE_GROUP_DOT[group] }}
          />
          {SOURCE_GROUP_LABEL[group]}
        </span>
        {unrespondedHours !== null ? (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
              unrespondedHours >= 48
                ? "bg-[#FEF3EE] text-[#B85C33]"
                : unrespondedHours >= 24
                  ? "bg-[#FBF1E0] text-[#7A520F]"
                  : "bg-[#f0f0ec] text-[#1a1a1a]/45"
            }`}
          >
            <Clock className="h-2.5 w-2.5" />
            {formatResponseAge(unrespondedHours)}
          </span>
        ) : null}
        {overdueDays > 0 ? (
          <span className="rounded-md bg-[#FEF3EE] px-2 py-0.5 text-[11px] font-medium text-[#B85C33]">
            {overdueDays}일 지연
          </span>
        ) : null}
      </div>
      {/* Compass 병기 — 카드가 <button>이라 표시형(비인터랙티브) 칩으로만 그린다. */}
      {compassEntry ? (
        <div className="mt-1.5 flex">
          <CompassLeadChip entry={compassEntry} interactive={false} />
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-2 border-t border-[#f0f0ec] pt-2">
        <span
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
            owner === "미배정" ? "bg-[#FEF3EE] text-[#B85C33]" : "bg-[#f0f0ec] text-[#1a1a1a]/60"
          }`}
          aria-hidden
        >
          {owner === "미배정" ? "?" : owner.slice(0, 1)}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-[11px] ${owner === "미배정" ? "text-[#B85C33]" : "text-[#1a1a1a]/50"}`}
        >
          {owner}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-[#1a1a1a]/40">
          {new Date(lead.timestamp).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
        </span>
      </div>
    </button>
  )
}

export default function LeadsBoardView({
  columns,
  totals,
  focus,
  crossColumnFilter,
  selectedId,
  onSelect,
  onFocusColumn,
  now,
  compassOverlay,
}: {
  /** 그릴 카드 — 상위에서 정렬·필터를 마친 결과 */
  columns: Record<BoardColumnKey, LeadRecord[]>
  /** 컬럼별 전체 건수(필터 전) */
  totals: Record<BoardColumnKey, number>
  /** 상태 축 필터가 강등된 포커스 컬럼 */
  focus: BoardColumnKey | null
  /** 직교 필터가 걸려 있는가 — 헤더가 `n / N` 두 숫자를 쓰는 조건 */
  crossColumnFilter: boolean
  selectedId?: string
  onSelect: (lead: LeadRecord) => void
  /** 컬럼 헤더 클릭 — 이미 포커스된 컬럼을 다시 누르면 해제된다 */
  onFocusColumn: (key: BoardColumnKey | null) => void
  now: Date
  /** Compass 콜 상태 병기 맵(phone_key 키). 없으면 칩 없이 그대로 그린다. */
  compassOverlay?: CompassOverlayMap
}) {
  // 종료는 기본으로 접는다 — 폭 예산에서 활성 컬럼 하나와 맞바꾸는 값이라 항상 펼쳐 둘 자리가 없다.
  const [closedOpen, setClosedOpen] = useState(false)
  const today = toLocalDateKey(now)

  return (
    <div className="flex gap-4 overflow-x-auto pb-2" role="group" aria-label="리드 파이프라인 보드">
      {COLUMN_ORDER.map((key) => {
        const cards = columns[key]
        const total = totals[key]
        const collapsed = key === "closed" && !closedOpen
        const dimmed = focus !== null && focus !== key

        if (collapsed) {
          return (
            <button
              key={key}
              type="button"
              onClick={() => setClosedOpen(true)}
              aria-expanded={false}
              title={`종료 ${total.toLocaleString("ko-KR")}건 펼치기`}
              className="group flex w-16 shrink-0 flex-col items-stretch text-[#1a1a1a]/45"
            >
              <span className="mb-2.5 flex h-11 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white text-[17px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[#111110] transition-colors group-hover:border-[#c8c8c4]">
                {total}
              </span>
              <span className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] py-4 transition-colors group-hover:border-[#c8c8c4]">
                <span className="text-[12px] font-semibold [writing-mode:vertical-rl]">
                  {BOARD_COLUMN_LABEL.closed} · 펼치기
                </span>
              </span>
            </button>
          )
        }

        return (
          <div
            key={key}
            className={`flex w-[272px] shrink-0 flex-col transition-opacity ${dimmed ? "opacity-60" : ""}`}
          >
            {/* 헤더가 곧 포커스 컨트롤 — 상태 축 필터 카드를 내린 자리를 직접 조작이 대신한다. */}
            <button
              type="button"
              onClick={() => onFocusColumn(focus === key ? null : key)}
              aria-pressed={focus === key}
              title={focus === key ? `${BOARD_COLUMN_LABEL[key]} 포커스 해제` : `${BOARD_COLUMN_LABEL[key]}만 강조`}
              className={`mb-2.5 flex h-11 w-full items-center gap-2 rounded-lg border px-3 text-left transition-colors ${
                focus === key
                  ? "border-[#111110] bg-white"
                  : key === "unconfirmed"
                    ? "border-[#ECD29C] bg-white hover:border-[#d9b76f]"
                    : "border-[#e8e8e4] bg-white hover:border-[#c8c8c4]"
              }`}
            >
              <span
                aria-hidden
                className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ backgroundColor: COLUMN_DOT[key] }}
              />
              <span
                className={`flex-1 text-[13px] font-semibold ${key === "unconfirmed" ? "text-[#7A520F]" : "text-[#111110]"}`}
              >
                {BOARD_COLUMN_LABEL[key]}
              </span>
              {key === "unconfirmed" ? (
                // 콘솔 기본 목록은 확인 게이트로 이 리드들을 숨긴다 — 숫자가 달라지는 이유를 배지로 드러낸다.
                <span
                  title="콘솔 기본 목록의 확인 게이트 밖에 있는 리드입니다."
                  className="rounded border border-[#ECD29C] bg-[#FBF1E0] px-1.5 py-0.5 text-[11px] font-semibold text-[#7A520F]"
                >
                  게이트 밖
                </span>
              ) : null}
              {/* 두 숫자는 직교 필터가 걸려 있을 때만 — 필터가 없으면 n과 N이 같아 군더더기다. */}
              <span
                className={`text-[19px] font-bold leading-none tracking-[-0.02em] tabular-nums ${
                  key === "unconfirmed" ? "text-[#7A520F]" : "text-[#111110]"
                }`}
              >
                {(crossColumnFilter ? cards.length : total).toLocaleString("ko-KR")}
              </span>
              {crossColumnFilter ? (
                <span className="text-[11px] leading-none tabular-nums text-[#1a1a1a]/35">
                  /{total.toLocaleString("ko-KR")}
                </span>
              ) : null}
              {key === "closed" ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation()
                    setClosedOpen(false)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    event.stopPropagation()
                    setClosedOpen(false)
                  }}
                  className="rounded px-1 text-[11px] text-[#1a1a1a]/40 transition-colors hover:text-[#111110]"
                >
                  접기
                </span>
              ) : null}
            </button>

            {/* 컬럼별 독립 스크롤 — 보드 전체가 페이지를 늘려 컬럼 헤더가 사라지는 것을 막는다.
                가로 스크롤 컨테이너 안에서는 sticky 헤더가 뷰포트에 붙지 않으므로(overflow-x가
                overflow-y를 auto로 끌어올린다) 높이를 묶는 쪽이 유일하게 성립하는 방법이다. */}
            <div className="max-h-[52vh] min-h-0 flex-1 overflow-y-auto pr-0.5">
              {cards.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-3 py-6 text-center">
                  <p className="text-[12px] font-semibold text-[#1a1a1a]/45">
                    {total === 0 ? "리드가 없습니다" : "이 필터엔 0건"}
                  </p>
                  {total > 0 ? (
                    <p className="mt-1 text-[11px] leading-relaxed text-[#1a1a1a]/35">
                      필터 밖 {total.toLocaleString("ko-KR")}건이 이 컬럼에 있습니다
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  {cards.slice(0, COLUMN_CARD_CAP).map((lead) => {
                    const phoneKey = normalizePhoneKey(lead.phone)
                    return (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        selected={lead.id === selectedId}
                        onSelect={onSelect}
                        today={today}
                        now={now}
                        compassEntry={phoneKey ? compassOverlay?.[phoneKey] : undefined}
                      />
                    )
                  })}
                  {cards.length > COLUMN_CARD_CAP ? (
                    <p className="py-1 text-center text-[11px] text-[#1a1a1a]/40">
                      +{(cards.length - COLUMN_CARD_CAP).toLocaleString("ko-KR")}건 · 컬럼 스크롤 밖
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
