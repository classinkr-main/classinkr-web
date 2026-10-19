"use client"

// 현황 "오늘 연락"(C안 ①) 목록의 행 하나. 정보 순서는 DESIGN.md 어드민 라벨 단순화(대상·제목 → 근거·담당·기한 →
// 상태·보조 행동)를 따르고, 원천은 채움 배지 대신 작은 점 + 글자로 표시한다.
//
// 주 행동(A안 원칙 — lib/crm/today-contact-types.ts TodayContactPrimaryAction):
//  - open_compass: "Compass에서 열기" 새 탭(CompassOpenLink primary). 연락 기록 버튼은 두지 않는다(이중 연락 방지).
//    단 이 행에 Home 할 일이 묶여 있으면(openTaskIds — 세그먼트 "오늘 연락에 넣기"·360 할 일) 보조 "할 일 완료"·
//    "할 일 내일로"를 단다. 둘 다 기존 할 일 PATCH(Home crm_tasks)라 교차 쓰기 0 이고, Compass 에서 통화해도 Home 할
//    일은 닫히지 않으므로 이 길이 없으면 행이 매일 "지남"으로 되살아난다. 할 일만 걷고 다른 사유(Compass 다음 액션
//    등)가 남으면 행은 열린 채로 "할 일 미룸 → …" 확인 문구와 되돌리기를 단다(패널 planTodayContactTaskAction).
//    처리됨으로 접혀도 "Compass에서 열기"는 남긴다.
// 처리됨으로 접힌 행에 Home 할 일이 남아 있으면(Compass 에서 연락했거나 결과 기록 때 함께 닫지 않음) 접힌 줄에
// "Home 할 일 N건 남음"과 "할 일 완료"를 단다 — 이 행이 그 할 일을 닫을 곳이다(주간 패널은 지난·오늘을 숨긴다).
//  - record_outcome · record_outcome_lead: "결과 기록"(행 아래 폼) + "내일로"(기록 없이 다음 일정만).
//  - complete_task: "완료" + "내일로"(기존 할 일 PATCH).
// Home 이 정본인 행(NEO 계정·등록 확정 리드 등)에 같은 전화의 Compass 리드가 있으면(row.compass) 보조 "Compass 기록 ↗"
// 링크를 사유 줄에 둔다(360·리드 보드와 같은 규칙 — lib/crm/write-surface.ts COMPASS_RECORD_LABEL).
// 처리된 행은 제자리에서 "처리됨 · 콜 · 부재 → 다음 09/28" 한 줄로 접히고, 이번 세션에서 저장한 행만 8초 동안
// "되돌리기"를 단다. 제목은 고객 360 상세 페이지(리드·NEO 계정 — customerDetailHref ?tab=activity, 10월 줄기 f989a812 가
// 드로어를 전용 페이지로 바꿨다 · 큐 패널 priorityCustomerHref 와 같은 규칙), 아이콘 보조 링크도 같은 고객 링크
// (todayContactHomeHref — 리드·NEO 계정은 360 상세, 그 밖은 row.href: 전환 고객 검색·딜·할 일)다. 호출부가
// onOpenCustomer 를 넘기면(드로어를 쓰는 화면) 제목만 그 버튼으로 연다. Compass 매칭 리드 행의 주 행동
// "Compass에서 열기"는 그대로다(A안).

import type { ReactNode } from "react"
import Link from "next/link"
import { CheckCircle2, Clock3, ExternalLink } from "lucide-react"

import CompassOpenLink, { resolveCompassOpenHref } from "@/components/admin/compass/CompassOpenLink"
import { customerDetailHref } from "@/lib/crm/customer-navigation"
import { lastContactCalendarDays, relativeDaysLabel } from "@/lib/crm/last-contact"
import { STATUS_TONE_TEXT_CLASS, STATUS_TONE_TEXT_STRONG_CLASS } from "@/lib/crm/status-tone"
import { COMPASS_RECORD_LABEL } from "@/lib/crm/write-surface"
import type {
  TodayContactHandled,
  TodayContactHandledKind,
  TodayContactReasonKind,
  TodayContactRow,
} from "@/lib/crm/today-contact-types"
import { INTERACTIVE_TEXT_CLASS, SECONDARY_TEXT_CLASS } from "./shared"
import { formatKstMonthDay, OUTCOME_CLOSE_TASK_LIMIT } from "./TodayContactOutcomeForm"

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
/** 마지막 연락이 이만큼 오래되면 경고색 — lib/crm/customer-contact-summary.ts LAST_CONTACT_WARNING_DAYS 와 같은 값. */
const LAST_CONTACT_WARNING_DAYS = 14

// ─── 원천 묶음(필터 칩·행 표시 공용) ─────────────────────────────────────

export type TodayContactSourceGroupKey =
  | "compass"
  | "follow_up"
  | "first_response"
  | "task"
  | "account"
  | "reinflow"
  | "signal"

export interface TodayContactSourceGroup {
  key: TodayContactSourceGroupKey
  label: string
  kinds: readonly TodayContactReasonKind[]
  /** 점 모양 — 채움 배지 대신 8px 점(속이 빈 점은 ring). 파랑·보라 금지. */
  dotClass: string
}

export const TODAY_CONTACT_SOURCE_GROUPS: readonly TodayContactSourceGroup[] = [
  { key: "compass", label: "Compass 다음 액션", kinds: ["compass_next_action"], dotClass: "bg-[#31302E]" },
  { key: "follow_up", label: "Home 팔로업", kinds: ["follow_up"], dotClass: "bg-[#084734]" },
  { key: "first_response", label: "신규 첫 응답", kinds: ["first_response"], dotClass: "ring-2 ring-inset ring-[#084734]" },
  { key: "task", label: "할 일", kinds: ["task"], dotClass: "bg-[#A39E98]" },
  { key: "account", label: "계정 만료·소진", kinds: ["account_expiry", "account_balance"], dotClass: "bg-[#A8741A]" },
  { key: "reinflow", label: "재문의", kinds: ["reinflow"], dotClass: "ring-2 ring-inset ring-[#31302E]" },
  { key: "signal", label: "데모·재방문", kinds: ["demo", "revisit"], dotClass: "ring-2 ring-inset ring-[#A39E98]" },
]

const GROUP_BY_KIND = new Map<TodayContactReasonKind, TodayContactSourceGroup>(
  TODAY_CONTACT_SOURCE_GROUPS.flatMap((group) => group.kinds.map((kind) => [kind, group] as const))
)

export function sourceGroupOf(kind: TodayContactReasonKind): TodayContactSourceGroup {
  return GROUP_BY_KIND.get(kind) ?? TODAY_CONTACT_SOURCE_GROUPS[0]
}

/** 행의 사유가 걸친 원천 묶음 — 대표 사유(reasons[0]) 순서를 따른다. 중복 없음. */
export function rowSourceGroups(row: Pick<TodayContactRow, "reasons">): TodayContactSourceGroup[] {
  const seen = new Set<TodayContactSourceGroupKey>()
  const groups: TodayContactSourceGroup[] = []
  for (const reason of row.reasons) {
    const group = sourceGroupOf(reason.kind)
    if (seen.has(group.key)) continue
    seen.add(group.key)
    groups.push(group)
  }
  return groups
}

export function SourceDot({ group }: { group: TodayContactSourceGroup }) {
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-[2px] ${group.dotClass}`} />
}

// ─── 표기 헬퍼(순수 — tests/crm/today-contacts-panel.test.tsx) ──────────────

function kstDayIndex(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS)
}

function kstHourMinute(ms: number): string {
  const shifted = new Date(ms + KST_OFFSET_MS)
  return `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}`
}

export type DueTone = "danger" | "warning" | null

/**
 * 기한 문구 — 기준 시각(응답 generatedAt)과의 KST 달력일 차이로 만든다(렌더 중 Date.now() 를 부르지 않는다).
 * 지난 것: "3일 지남"(3일 이상 danger, 그 밖 warning) · "5시간 지남" · 오늘: "오늘 14:00" · 내일: "내일 10:00" · 그 뒤: "09/28 10:00".
 */
export function formatTodayContactDue(dueAt: string | null, basisMs: number): { text: string; tone: DueTone } | null {
  if (!dueAt) return null
  const ms = Date.parse(dueAt)
  if (!Number.isFinite(ms)) return null
  if (ms < basisMs) {
    const days = kstDayIndex(basisMs) - kstDayIndex(ms)
    if (days >= 1) return { text: `${days.toLocaleString("ko-KR")}일 지남`, tone: days >= 3 ? "danger" : "warning" }
    const hours = Math.floor((basisMs - ms) / 3_600_000)
    return { text: hours >= 1 ? `${hours}시간 지남` : "방금 지남", tone: "warning" }
  }
  const dayDiff = kstDayIndex(ms) - kstDayIndex(basisMs)
  if (dayDiff === 0) return { text: `오늘 ${kstHourMinute(ms)}`, tone: null }
  if (dayDiff === 1) return { text: `내일 ${kstHourMinute(ms)}`, tone: null }
  return { text: `${formatKstMonthDay(dueAt)} ${kstHourMinute(ms)}`, tone: null }
}

export const HANDLED_KIND_LABEL: Record<TodayContactHandledKind, string> = {
  contact_logged: "연락 기록",
  compass_activity: "Compass 활동",
  task_done: "할 일 완료",
  task_snoozed: "할 일 미룸",
  rescheduled: "일정 옮김",
}

/**
 * 처리됨 접힘 문구 — 이번 세션에서 저장한 행은 폼 요약("콜 · 부재 → 다음 09/28")을, 서버가 흔적으로 판정한 행은
 * 종류 라벨을 쓴다. meta 는 "09:14 · 김담당 · Compass · 추정" 같은 보조 줄.
 */
export function describeTodayContactHandled(
  handled: TodayContactHandled,
  summary: string | null
): { text: string; meta: string } {
  const text = summary
    ? summary
    : `${HANDLED_KIND_LABEL[handled.kind]}${handled.nextAt ? ` → 다음 ${formatKstMonthDay(handled.nextAt)}` : ""}`
  const atMs = Date.parse(handled.at)
  const metaParts = [
    Number.isFinite(atMs) ? kstHourMinute(atMs) : null,
    handled.by?.trim() || null,
    handled.source === "compass" ? "Compass" : "Home",
    handled.approximate ? "추정" : null,
  ].filter((part): part is string => Boolean(part))
  return { text, meta: metaParts.join(" · ") }
}

/** 마지막 연락 셀 — "3일 전 · Compass 콜 · 김담당". 14일 이상이면 경고색. 기록 없음은 null. */
export function describeTodayContactLast(
  last: TodayContactRow["lastContact"],
  basisMs: number
): { when: string; detail: string; stale: boolean } | null {
  if (!last) return null
  const days = lastContactCalendarDays(last.at, basisMs)
  if (days == null) return null
  const detail = [last.channelLabel, last.actor?.trim() || null].filter(Boolean).join(" · ")
  return { when: relativeDaysLabel(days), detail, stale: days >= LAST_CONTACT_WARNING_DAYS }
}

/** 고객 360(상세 페이지·드로어)으로 열 수 있는 행 — 360 이 받는 키는 lead:·neo: 뿐. */
export function canOpenCustomerDrawer(row: Pick<TodayContactRow, "key">): boolean {
  return row.key.startsWith("lead:") || row.key.startsWith("neo:")
}

/**
 * 행의 Home 고객 링크 — 리드·NEO 계정(lead:·neo: 키)은 고객 360 상세(?tab=activity)로, 그 밖(전환 고객 검색 착지·딜·
 * 할 일·Compass 전용 외부 URL)은 빌더가 만든 row.href 그대로(lib/crm/customer-navigation priorityCustomerHref 와 같은 규칙 —
 * 10월 줄기가 큐 패널에 넣은 고객 링크를 "오늘 연락"으로 옮겼다).
 */
export function todayContactHomeHref(row: Pick<TodayContactRow, "key" | "href">): string {
  return canOpenCustomerDrawer(row) ? customerDetailHref(row.key) : row.href
}

/** Home 안 경로인가 — Compass 전용 행의 href 가 외부 URL 이면 next/link 로 같은 탭 이동시키지 않는다. */
export function isInternalHref(href: string | null | undefined): href is string {
  return typeof href === "string" && href.startsWith("/") && !href.startsWith("//")
}

/**
 * Compass 매칭 리드 행(open_compass)에 묶인 Home 할 일 수 — 행이 "할 일 완료"·"내일로"를 보조로 달아야 하는가.
 * Compass 에서 통화해도 Home 할 일은 닫히지 않는다(교차 쓰기 0) — 0 이 아니면 홈에서 닫을 길을 남긴다.
 */
export function compassRowOpenTaskCount(row: Pick<TodayContactRow, "primaryAction" | "openTaskIds">): number {
  return row.primaryAction === "open_compass" ? row.openTaskIds.length : 0
}

/**
 * 처리됨으로 접힌 행에 남은 Home 할 일 수 — 접힌 줄에 "Home 할 일 N건 남음"·"할 일 완료"를 단다(Compass 에서 연락해
 * 처리됐거나 결과 기록 때 함께 닫지 않은 할 일). 안 닫으면 내일 "지남"으로 다시 오른다. 주 행동과 무관하다.
 */
export function handledRowOpenTaskCount(row: Pick<TodayContactRow, "handled" | "openTaskIds">): number {
  return row.handled ? row.openTaskIds.length : 0
}

/** 버튼 한 번이 닫는 할 일 수 — 결과 폼과 같은 상한(OUTCOME_CLOSE_TASK_LIMIT). 넘치면 남은 수로 다시 뜬다. */
function tasksPerClick(count: number): number {
  return Math.min(count, OUTCOME_CLOSE_TASK_LIMIT)
}

/** "할 일 완료" · 여러 건이면 "할 일 2건 완료"(행의 열린 할 일을 한 번에 최대 10건까지 닫는다). */
export function todayContactTaskCompleteLabel(count: number): string {
  const n = tasksPerClick(count)
  return n > 1 ? `할 일 ${n.toLocaleString("ko-KR")}건 완료` : "할 일 완료"
}

/**
 * Compass 행의 보조 미루기 — "할 일 내일로"(여러 건이면 "할 일 2건 내일로"). 리드 follow_up_at 이나 Compass 다음 액션이
 * 아니라 Home 할 일만 옮긴다는 것을 라벨에서 밝힌다.
 */
export function todayContactTaskSnoozeLabel(count: number): string {
  const n = tasksPerClick(count)
  return n > 1 ? `할 일 ${n.toLocaleString("ko-KR")}건 내일로` : "할 일 내일로"
}

/**
 * Home 이 정본인 행(주 행동이 Compass 링크가 아닌 행 — NEO 계정·등록 확정 리드·전환 고객)의 보조 "Compass 기록 ↗" URL.
 * 같은 전화의 Compass 리드가 있을 때만(row.compass). open_compass 행은 주 행동이 이미 같은 링크라 null.
 */
export function secondaryCompassRecordHref(row: Pick<TodayContactRow, "primaryAction" | "compass">): string | null {
  if (row.primaryAction === "open_compass" || !row.compass) return null
  return resolveCompassOpenHref({ href: row.compass.url, compassLeadId: row.compass.leadId })
}

/** "NEO 값 08/28 기준" — 계정 행에만. */
export function neoAsOfCaption(row: Pick<TodayContactRow, "entityType" | "neoAsOf">): string | null {
  if (row.entityType !== "neo_account" || !row.neoAsOf) return null
  return `NEO 값 ${formatKstMonthDay(row.neoAsOf)} 기준`
}

// 좌측 2px 선 — 긴급은 Danger 텍스트색, 높음은 Classin Green, 그 밖은 선 없음.
function severityBorderClass(row: Pick<TodayContactRow, "severity">) {
  if (row.severity === "critical") return "border-l-[#B43E3E]"
  if (row.severity === "high") return "border-l-[#084734]"
  return "border-l-transparent"
}

function dueToneClass(tone: DueTone) {
  if (tone === "danger") return STATUS_TONE_TEXT_STRONG_CLASS.danger
  if (tone === "warning") return STATUS_TONE_TEXT_STRONG_CLASS.warning
  return INTERACTIVE_TEXT_CLASS
}

const SECONDARY_BUTTON_CLASS = `inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-[#E5E5E0] bg-white px-2.5 text-[12px] font-semibold transition-colors hover:border-[#A39E98] hover:text-[#111110] disabled:opacity-45 ${INTERACTIVE_TEXT_CLASS}`
const PRIMARY_BUTTON_CLASS =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-[#084734] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-45"

export type TodayContactRowBusy = "outcome" | "snooze" | "complete" | "undo" | null

export interface TodayContactRowProps {
  row: TodayContactRow
  /** 표기 기준 시각(응답 generatedAt) */
  basisMs: number
  /** NEO 동기화가 멈췄는가 — 계정 행 캡션을 경고색으로 */
  neoStale: boolean
  /** 이번 세션에서 저장한 처리 요약(없으면 서버 흔적 라벨) */
  handledSummary?: string | null
  /** 8초 되돌리기 창 안이면 값이 있다 */
  undo?: { pending: boolean; onUndo: () => void } | null
  busy?: TodayContactRowBusy
  formOpen?: boolean
  formId?: string
  onToggleForm?: () => void
  onSnooze?: () => void
  onCompleteTask?: () => void
  onOpenCustomer?: (target: { key: string; name: string }) => void
  /** formOpen 일 때 행 아래에 그릴 폼 */
  form?: ReactNode
  rowRef?: (node: HTMLLIElement | null) => void
}

function RowTitle({
  row,
  onOpenCustomer,
}: {
  row: TodayContactRow
  onOpenCustomer?: (target: { key: string; name: string }) => void
}) {
  const className = "min-w-0 truncate text-left text-[14px] font-semibold text-[#111110]"
  if (onOpenCustomer && canOpenCustomerDrawer(row)) {
    return (
      <button
        type="button"
        onClick={() => onOpenCustomer({ key: row.key, name: row.title })}
        className={`${className} underline-offset-2 hover:underline`}
        title={`${row.title} 고객 360 열기`}
      >
        {row.title}
      </button>
    )
  }
  const href = todayContactHomeHref(row)
  if (row.entityType === "compass_lead" || !isInternalHref(href)) return <span className={className}>{row.title}</span>
  return (
    <Link
      href={href}
      className={`${className} underline-offset-2 hover:underline`}
      title={canOpenCustomerDrawer(row) ? `${row.title} 고객 360 열기` : undefined}
    >
      {row.title}
    </Link>
  )
}

export default function TodayContactRowView({
  row,
  basisMs,
  neoStale,
  handledSummary = null,
  undo = null,
  busy = null,
  formOpen = false,
  formId,
  onToggleForm,
  onSnooze,
  onCompleteTask,
  onOpenCustomer,
  form,
  rowRef,
}: TodayContactRowProps) {
  const groups = rowSourceGroups(row)
  const primaryGroup = groups[0] ?? null
  const acting = busy != null
  const compassTaskCount = compassRowOpenTaskCount(row)
  const compassHref =
    row.primaryAction === "open_compass" ? resolveCompassOpenHref({ href: row.compass?.url, compassLeadId: row.compass?.leadId }) : null
  // Home 안 고객 링크(리드·NEO 계정은 360 상세) — 대체 "열기"·아이콘 보조 링크가 같은 값을 쓴다.
  const homeHref = todayContactHomeHref(row)

  // ── 처리됨: 제자리에서 한 줄로 접힌다 ──
  if (row.handled) {
    const handled = describeTodayContactHandled(row.handled, handledSummary)
    // 처리됨이어도 Home 할 일이 열린 채일 수 있다(Compass 에서 연락·결과 기록 때 함께 닫지 않음) — 접힌 줄에서도 남은
    // 할 일과 닫을 길을 보인다(안 닫으면 내일 "할 일 · 1일 지남"으로 다시 올라온다).
    const leftoverTaskCount = handledRowOpenTaskCount(row)
    const showLeftoverTasks = leftoverTaskCount > 0
    const showTaskClose = showLeftoverTasks && Boolean(onCompleteTask)
    const taskCloseTitle =
      row.primaryAction === "open_compass" ? "Home 할 일만 닫습니다 — Compass 기록은 그대로입니다" : "남은 Home 할 일을 닫습니다"
    return (
      <li
        ref={rowRef}
        data-today-contact-row={row.key}
        data-handled="true"
        className="rounded-xl border border-[#e8e8e4] bg-[#FAFAF8] sm:rounded-none sm:border-0"
      >
        <div className="grid gap-x-4 gap-y-1.5 px-3 py-2 lg:grid-cols-[136px_minmax(0,1fr)_auto] lg:items-center">
          <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${SECONDARY_TEXT_CLASS}`}>
            {primaryGroup ? <SourceDot group={primaryGroup} /> : null}
            <span className="truncate">{primaryGroup?.label ?? "오늘 연락"}</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px]">
            <span className="inline-flex items-center gap-1 font-bold text-[#084734]">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              처리됨
            </span>
            <span className={`min-w-0 truncate font-semibold ${INTERACTIVE_TEXT_CLASS}`}>{row.title}</span>
            <span className={INTERACTIVE_TEXT_CLASS}>{handled.text}</span>
            {handled.meta ? <span className={SECONDARY_TEXT_CLASS}>{handled.meta}</span> : null}
            {showLeftoverTasks ? (
              <span
                className={`font-semibold ${STATUS_TONE_TEXT_STRONG_CLASS.warning}`}
                data-today-contact-open-tasks={leftoverTaskCount}
              >
                Home 할 일 {leftoverTaskCount.toLocaleString("ko-KR")}건 남음
              </span>
            ) : null}
          </div>
          {undo || showTaskClose || compassHref ? (
            <div className="flex flex-wrap items-center gap-2 lg:justify-self-end">
              {/* Compass 매칭 리드 행은 접혀도 Compass 링크를 남긴다 — Compass 다음 액션이 남았을 수 있다(A안 주 행동). */}
              {compassHref ? (
                <CompassOpenLink
                  href={compassHref}
                  name={row.title}
                  variant="inline"
                  className="min-h-9"
                  testId="today-contact-handled-compass"
                />
              ) : null}
              {showTaskClose ? (
                <button
                  type="button"
                  onClick={onCompleteTask}
                  disabled={acting}
                  aria-busy={busy === "complete" || undefined}
                  className={SECONDARY_BUTTON_CLASS}
                  title={taskCloseTitle}
                  data-today-contact-task-action="complete"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  {busy === "complete" ? "완료 중" : todayContactTaskCompleteLabel(leftoverTaskCount)}
                </button>
              ) : null}
              {undo ? (
                <button
                  type="button"
                  onClick={undo.onUndo}
                  disabled={undo.pending}
                  aria-busy={undo.pending || undefined}
                  className="inline-flex min-h-9 items-center px-1 text-[12px] font-semibold text-[#084734] underline underline-offset-2 disabled:opacity-45"
                >
                  {undo.pending ? "되돌리는 중" : "되돌리기"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </li>
    )
  }

  const reason = row.reasons[0] ?? null
  const otherReasons = row.reasons.slice(1).map((item) => item.label)
  const due = formatTodayContactDue(row.dueAt, basisMs)
  const last = describeTodayContactLast(row.lastContact, basisMs)
  const neoCaption = neoAsOfCaption(row)
  const compassRecordHref = secondaryCompassRecordHref(row)
  const ownerLabel = row.ownerName?.trim() || "미배정"

  return (
    <li
      ref={rowRef}
      data-today-contact-row={row.key}
      className={`rounded-xl border border-[#e8e8e4] bg-white sm:rounded-none sm:border-0 ${formOpen ? "sm:bg-[#FCFCFA]" : ""}`}
    >
      <div
        // 좌측 심각도 선은 목록형(sm+)에서만 — 모바일 카드는 테두리가 이미 있어 선을 겹치지 않는다.
        className={`grid gap-x-4 gap-y-2 p-3 sm:border-l-2 lg:grid-cols-[136px_minmax(0,1fr)_128px_76px_auto] lg:items-center ${severityBorderClass(row)}`}
      >
        {/* 원천·레인 — 모바일에서는 담당을 같은 줄 오른쪽에 둔다 */}
        <div className="flex items-start justify-between gap-2 lg:block">
          <div className="grid gap-0.5">
            {groups.slice(0, 2).map((group) => (
              <span key={group.key} className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold ${INTERACTIVE_TEXT_CLASS}`}>
                <SourceDot group={group} />
                {group.label}
              </span>
            ))}
            {groups.length > 2 ? <span className={`text-[11px] ${SECONDARY_TEXT_CLASS}`}>외 {groups.length - 2}곳</span> : null}
            <span className={`text-[11px] font-semibold ${SECONDARY_TEXT_CLASS}`}>{row.laneLabel}</span>
          </div>
          <span className={`text-[12px] lg:hidden ${INTERACTIVE_TEXT_CLASS}`}>{ownerLabel}</span>
        </div>

        {/* 고객·사유 */}
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <RowTitle row={row} onOpenCustomer={onOpenCustomer} />
            {row.subtitle ? <span className={`min-w-0 truncate text-[12px] ${SECONDARY_TEXT_CLASS}`}>{row.subtitle}</span> : null}
          </div>
          {reason ? (
            <p className="mt-0.5 text-[13px] text-[#111110]">
              {reason.label}
              {reason.detail ? <span className={`ml-1.5 text-[12px] ${SECONDARY_TEXT_CLASS}`}>{reason.detail}</span> : null}
            </p>
          ) : null}
          <p className={`mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] ${SECONDARY_TEXT_CLASS}`}>
            {due ? <span className={`font-semibold ${dueToneClass(due.tone)}`}>{due.text}</span> : null}
            {otherReasons.length > 0 ? <span>{otherReasons.join(" · ")}</span> : null}
            {row.groupedCount > 1 ? <span>같은 기관 +{(row.groupedCount - 1).toLocaleString("ko-KR")}건</span> : null}
            {row.compass?.stageLabel ? (
              <span>
                Compass · {row.compass.stageLabel}
                {row.compass.owner ? ` · ${row.compass.owner}` : ""}
              </span>
            ) : null}
            {/* Home 정본 행의 같은 전화 Compass 리드 — 보조 "Compass 기록 ↗"(주 행동은 Home 결과 기록 그대로). */}
            {compassRecordHref ? (
              <CompassOpenLink
                href={compassRecordHref}
                name={row.title}
                variant="inline"
                label={COMPASS_RECORD_LABEL}
                testId="today-contact-compass-record"
              />
            ) : null}
            {neoCaption ? (
              <span className={neoStale ? `font-semibold ${STATUS_TONE_TEXT_CLASS.warning}` : undefined}>{neoCaption}</span>
            ) : null}
            {/* 열린 채로 둔 행의 이번 세션 처리(예: Compass 행의 Home 할 일만 미룸) — 행은 접지 않고 한 일만 밝힌다. */}
            {handledSummary ? (
              <span className="inline-flex items-center gap-1 font-semibold text-[#084734]" data-today-contact-open-summary="">
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                {handledSummary}
              </span>
            ) : null}
          </p>
        </div>

        {/* 마지막 연락 */}
        <div className="text-[12px]">
          {last ? (
            <p className={INTERACTIVE_TEXT_CLASS}>
              <span className={`font-semibold ${last.stale ? STATUS_TONE_TEXT_STRONG_CLASS.warning : ""}`}>{last.when}</span>
              {last.detail ? <span className={`ml-1.5 lg:ml-0 lg:block ${SECONDARY_TEXT_CLASS}`}>{last.detail}</span> : null}
            </p>
          ) : (
            <p className={SECONDARY_TEXT_CLASS}>연락 기록 없음</p>
          )}
        </div>

        {/* 담당(데스크톱) */}
        <div className={`hidden truncate text-[12px] lg:block ${INTERACTIVE_TEXT_CLASS}`}>{ownerLabel}</div>

        {/* 행동 */}
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {row.primaryAction === "open_compass" ? (
            compassHref ? (
              <CompassOpenLink href={compassHref} name={row.title} variant="primary" className="max-sm:flex-1" />
            ) : isInternalHref(homeHref) ? (
              <Link href={homeHref} className={`${SECONDARY_BUTTON_CLASS} max-sm:flex-1`}>
                열기
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : null
          ) : null}

          {/* Compass 행에 묶인 Home 할 일 — 연락 기록이 아니라 Home crm_tasks 닫기·미루기(기존 PATCH, 교차 쓰기 0). */}
          {compassTaskCount > 0 ? (
            <>
              <button
                type="button"
                onClick={onCompleteTask}
                disabled={acting}
                aria-busy={busy === "complete" || undefined}
                className={`${SECONDARY_BUTTON_CLASS} max-sm:flex-1`}
                title="Home 할 일만 닫습니다 — Compass 다음 액션은 Compass 에서"
                data-today-contact-task-action="complete"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                {busy === "complete" ? "완료 중" : todayContactTaskCompleteLabel(compassTaskCount)}
              </button>
              <button
                type="button"
                onClick={onSnooze}
                disabled={acting}
                aria-busy={busy === "snooze" || undefined}
                className={`${SECONDARY_BUTTON_CLASS} max-sm:flex-1`}
                title="Home 할 일만 내일 09:00 로 — Compass 다음 액션은 Compass 에서"
                data-today-contact-task-action="snooze"
              >
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                {busy === "snooze" ? "옮기는 중" : todayContactTaskSnoozeLabel(compassTaskCount)}
              </button>
            </>
          ) : null}

          {/* 연 채로 둔 행의 되돌리기(8초) — Compass 행의 Home 할 일만 닫거나 미룬 경우. */}
          {undo ? (
            <button
              type="button"
              onClick={undo.onUndo}
              disabled={undo.pending}
              aria-busy={undo.pending || undefined}
              className="inline-flex min-h-9 items-center px-1 text-[12px] font-semibold text-[#084734] underline underline-offset-2 disabled:opacity-45"
            >
              {undo.pending ? "되돌리는 중" : "되돌리기"}
            </button>
          ) : null}

          {row.primaryAction === "record_outcome" || row.primaryAction === "record_outcome_lead" ? (
            <>
              <button
                type="button"
                onClick={onToggleForm}
                aria-expanded={formOpen}
                aria-controls={formOpen ? formId : undefined}
                disabled={acting}
                aria-busy={busy === "outcome" || undefined}
                className={`${PRIMARY_BUTTON_CLASS} max-sm:flex-1`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                {busy === "outcome" ? "저장 중" : "결과 기록"}
              </button>
              <button
                type="button"
                onClick={onSnooze}
                disabled={acting}
                aria-busy={busy === "snooze" || undefined}
                className={`${SECONDARY_BUTTON_CLASS} max-sm:flex-1`}
                title="연락 기록 없이 다음 일정만 내일 09:00 로"
              >
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                {busy === "snooze" ? "옮기는 중" : "내일로"}
              </button>
            </>
          ) : null}

          {row.primaryAction === "complete_task" ? (
            <>
              <button
                type="button"
                onClick={onCompleteTask}
                disabled={acting}
                aria-busy={busy === "complete" || undefined}
                className={`${PRIMARY_BUTTON_CLASS} max-sm:flex-1`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                {busy === "complete" ? "완료 중" : "완료"}
              </button>
              <button
                type="button"
                onClick={onSnooze}
                disabled={acting}
                aria-busy={busy === "snooze" || undefined}
                className={`${SECONDARY_BUTTON_CLASS} max-sm:flex-1`}
              >
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                {busy === "snooze" ? "옮기는 중" : "내일로"}
              </button>
            </>
          ) : null}

          {/* 보조 링크 — 고객 360 상세(리드·NEO 계정)·전환 고객·할 일(Home 안 경로만). 주 행동이 이미 같은 경로로 가는 대체 링크면 생략. */}
          {isInternalHref(homeHref) && !(row.primaryAction === "open_compass" && !compassHref) ? (
            <Link
              href={homeHref}
              aria-label={`${row.title} Home 에서 보기`}
              title="Home 에서 보기"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-black/[0.05] hover:text-[#111110] ${INTERACTIVE_TEXT_CLASS}`}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
      {formOpen && form ? <div className="px-3 pb-3 lg:pl-[155px]">{form}</div> : null}
    </li>
  )
}
