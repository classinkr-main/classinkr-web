"use client"

// 현황 "오늘 연락"(C안 ①, 2026-09-25) — 옛 "오늘 전화할 N건"(CrmPriorityQueuePanel) 자리를 대체한다.
//
// 여러 원천(우선순위 엔진 추천·Home 팔로업·할 일·Compass 다음 액션·NEO 만료/소진·재문의)을 서버가 한 목록으로
// 합쳐 준다(GET /api/admin/crm/home/today-contacts — 계약 lib/crm/today-contact-types.ts, 병합·정렬 규칙은
// lib/crm/today-contact-queue.ts). 이 화면은 그 결과를 그릴 뿐이고 판단을 다시 하지 않는다 — 예외 하나:
// Compass 매칭 리드 행(open_compass)이 Home 할 일 흔적(완료·미룸·일정 옮김)만으로 "처리됨"이 돼 오면 다시 연다
// (reopenCompassRowsHandledByHomeTasks). Home 할 일을 닫아도 Compass 다음 액션·첫 응답 같은 다른 사유는 그대로라,
// 접으면 Compass 에서 아무것도 하지 않은 행이 "처리됨"으로 보이고 "Compass에서 열기"가 사라진다. 서버 판정이 같은
// 규칙으로 맞춰지면 이 보정은 아무것도 바꾸지 않는다.
//
// A안 원칙: Compass 에 매칭된 리드·Compass 전용 행은 "Compass에서 열기"만(교차 쓰기 0). NEO 계정·전환 고객·딜과
// Compass 에 없는 Home 리드만 행 안에서 결과 → 다음 일정을 기록한다(POST …/today-contacts/outcome). Compass 행에
// 묶인 Home 할 일은 보조 "할 일 완료"·"할 일 내일로"(할 일 PATCH)로 닫는다 — 그 행에 다른 사유가 남으면 행은 열린
// 채로 두고 할 일만 걷는다(planTodayContactTaskAction).
//
// 데이터 흐름은 옛 패널과 같다 — 서버 프리페치 레인(lib/admin/crm/today-contacts-prefetch.ts)을 React use()로
// 직접 풀고(호출부 CrmHomeClient 가 <Suspense fallback={<CrmTodayContactsPanelSkeleton />}>로 감싼다), 요청
// 캐시에 심은 뒤 adminFetchJsonCached(TTL 90초·SWR·onRevalidated)로 따라간다. refreshKey = 강제 새로고침,
// softRefreshKey = 홈의 60초 백그라운드 틱(force 없음). Home 필수 원천 일부를 못 읽은 강등 응답
// (isTodayContactsCacheable false — 서버는 no-store)은 화면에는 그대로 보이되 요청 캐시에 심지도 남기지도 않는다
// (dropDegradedTodayContacts — adminFetchJsonCached 는 응답 헤더를 보지 않고 저장한다).
//
// 낙관 갱신은 행 제거가 아니라 "처리됨" 오버레이다(120초 — 서버 스냅샷 캐시가 방금 처리한 행을 옛 상태로
// 한 번 더 돌려줄 수 있다). 저장 뒤 8초 동안 행 안 "되돌리기"(DELETE …/outcome)를 둔다. force 새로고침도
// 살아 있는 오버레이를 지우지 않는다. 서버는 할 일 쓰기 때 오늘 연락 태그를 즉시 만료하고 force 조회는 할 일
// 캐시를 우회하지만(2026-09-26), 다른 인스턴스·브라우저 캐시가 옛 값을 한 번 더 줄 수 있어 오버레이는 안전망으로
// 남긴다 — 만료(120초)로만 걷힌다.
//
// 결과 저장이 실패하면 그 행·모드의 requestId 를 기억해 두고, 다시 저장할 때(배너 "다시 시도"든 폼 "저장"이든)
// 같은 id 를 쓴다 — 응답만 유실되고 서버에는 저장된 경우 서버 멱등(계정·고객·딜 sourceId 'today-contact:<requestId>',
// 리드 로그 id todayContactLeadLogId)이 duplicate 로 돌려줘 기록·다음 할 일이 두 번 생기지 않는다. 실패 기록은
// 같은 행의 저장·미루기가 성공하면, 초안을 버리면(취소·버리고 닫기), 10분이 지나거나 KST 날짜가 바뀌면 버린다 —
// 켜 둔 탭의 어제 실패 기록이 오늘 새 저장을 "재전송"으로 만들지 않게.
//
// 진행률은 추정이다(아침 목록을 저장하지 않는다 — progress.approximate). 화면이 그 사실을 캡션으로 밝힌다.
//
// 서버는 기본 60행에서 자른다(truncated.rows). 잘린 목록에서 "더 보기"·원천 칩을 누르면 최대 상한(150)으로 다시
// 받고, 칩 건수는 서버 전체 집계(counts.bySource)를 쓴다. 이 목록이 지난·오늘 할 일을 다 담지 못하면(잘림·할 일
// 원천 실패·담당 필터·목록 실패) onCoverageChange(false)로 홈에 알려 주간 할 일 패널이 숨긴 버킷을 다시 보이게
// 한다. 목록에 담긴 할 일은 모두 행에서 닫을 수 있다(할 일 행 "완료", Compass 행 보조 "할 일 완료", 처리됨으로 접힌
// 행의 "남은 할 일" — "처리됨 숨기기"도 남은 할 일이 있는 행은 숨기지 않는다). 오늘·지난 Compass 다음 액션을 다
// 담지 못하면(담당 필터·Compass 끊김/일부 실패·잘림·목록 실패) onCompassCoverageChange(false)로 알려 Compass 밴드가
// 오늘 액션을 다시 보이게 한다(도달성 불변).

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Filter, RefreshCw } from "lucide-react"

import CompassOpenLink from "@/components/admin/compass/CompassOpenLink"
import CrmNoticeBanner from "@/components/admin/crm/CrmNoticeBanner"
import { buildOwnerSelectOptions, useCrmOwners } from "@/components/admin/crm/useCrmOwners"
import {
  adminFetch,
  adminFetchJson,
  adminFetchJsonCached,
  clearAdminRequestCache,
  getCachedAdminJson,
  seedAdminRequestCache,
} from "@/lib/admin-client"
import type { DeferredPrefetch } from "@/lib/admin/prefetch-budget"
import { CRM_CACHE_SWR_MS } from "@/lib/crm/client-cache"
import { runOptimistic } from "@/lib/crm/optimistic-update"
import { STATUS_TONE_CLASS, STATUS_TONE_TEXT_STRONG_CLASS } from "@/lib/crm/status-tone"
import { TODAY_CALL_SLOTS, type TodayCallSlotKey } from "@/lib/crm/today-calls"
import type {
  CrmTodayContacts,
  TodayContactHandled,
  TodayContactHandledKind,
  TodayContactOutcomeRequest,
  TodayContactOutcomeResponse,
  TodayContactOutcomeUndoRequest,
  TodayContactOutcomeUndoResponse,
  TodayContactRow,
} from "@/lib/crm/today-contact-types"
import {
  isTodayContactsCacheable,
  TODAY_CONTACTS_DEFAULT_OWNER,
  TODAY_CONTACTS_MAX_LIMIT,
  TODAY_CONTACTS_OUTCOME_API_PATH,
  todayContactsUrl,
} from "@/lib/crm/today-contacts-request"
import { INTERACTIVE_TEXT_CLASS, SECONDARY_TEXT_CLASS } from "./shared"
import TodayContactOutcomeForm, {
  buildTodayContactOutcomeRequest,
  buildTodayContactSnoozeRequest,
  createOutcomeDraft,
  formatKstMonthDay,
  formatKstMonthDayTime,
  formatOutcomeSummary,
  isOutcomeDraftDirty,
  isOutcomeDraftReady,
  kstDateKey,
  OUTCOME_CLOSE_TASK_LIMIT,
  outcomeDateProblem,
  outcomeNextAt,
  resolveNextPresetAt,
  type TodayContactOutcomeDraft,
} from "./TodayContactOutcomeForm"
import TodayContactRowView, {
  describeTodayContactHandled,
  handledRowOpenTaskCount,
  SourceDot,
  TODAY_CONTACT_SOURCE_GROUPS,
  todayContactHomeHref,
  type TodayContactRowBusy,
  type TodayContactSourceGroupKey,
} from "./TodayContactRow"

const TODAY_CONTACTS_TTL_MS = 90_000
/** 첫 화면에 그리는 행 수 — 나머지는 "남은 N건 더 보기"(잘린 항목은 남은 건수로 — 플레이북 04). */
export const TODAY_CONTACTS_PREVIEW_ROWS = 10
/** 저장 성공 뒤 행 안 "되돌리기"가 살아 있는 시간(UX 규약 1). */
export const TODAY_CONTACTS_UNDO_WINDOW_MS = 8_000
/**
 * 낙관 "처리됨" 오버레이를 서버 응답 위에 덧씌우는 시간. 서버 스냅샷(unstable_cache 60초)이 쓰기 직후
 * force 없는 재검증에서 처리 전 행을 한 번 더 돌려줄 수 있다(CrmWeekAheadPanel OVERRIDE_MS 와 같은 문제).
 */
export const TODAY_CONTACTS_OVERLAY_MS = 120_000
/**
 * 실패한 저장·미루기의 requestId 를 다시 쓰는 기간 — 서버가 되돌리기로 건드릴 수 있는 쓰기의 나이 상한
 * (lib/crm/account-contact-record.ts TODAY_CONTACT_UNDO_MAX_AGE_MS 10분)과 같다. 이보다 오래됐거나 KST 날짜가
 * 바뀌었으면 새 저장으로 본다(어제 응답만 유실된 기록이 오늘 같은 내용의 저장을 duplicate 로 삼키지 않게).
 */
export const TODAY_CONTACTS_PENDING_REQUEST_MAX_AGE_MS = 10 * 60_000
// 기본 담당 = 로그인 사용자(10월 줄기 3f5f0a21·38b62a7d 가 큐 패널에 넣은 규칙을 "오늘 연락"으로 옮겼다). ?owner 가 없으면
// 이 값이고, "담당 전체"는 owner="" 를 URL 에 명시한다(서버도 생략 = 개인, 빈 값 = 전체로 읽는다).
const CURRENT_OWNER_VALUE = TODAY_CONTACTS_DEFAULT_OWNER

// 담당 필터가 기본(내 담당)이 아니라 서버 프리페치(접속자 개인 기준)를 쓸 수 없을 때 use()에 넘기는 안정된 싱글턴 —
// 매 렌더 새 promise 를 주면 무한 서스펜스로 보일 수 있다.
const RESOLVED_NULL_PROMISE: Promise<CrmTodayContacts | null> = Promise.resolve(null)

type SourceFilter = TodayContactSourceGroupKey | "all"

// ─── 순수 헬퍼(export — tests/crm/today-contacts-panel.test.tsx) ─────────────

export interface TodayContactOverlay {
  /** 오버레이를 만든 담당 범위(기본 상한 조회 URL — 상한만 올린 재조회도 같은 범위) — 다른 범위의 목록에는 덧씌우지 않는다 */
  scope: string
  /** 처리 직전 행(서버가 행을 빼 버렸으면 이 행을 제자리에 되살린다) */
  row: TodayContactRow
  /** 처리 직전 서버 목록 안 위치 */
  index: number
  /** null = 되돌리기 뒤 "다시 열림"을 강제 */
  handled: TodayContactHandled | null
  /** 이번 세션에서 저장한 요약("콜 · 부재 → 다음 09/28") */
  summary: string | null
  until: number
  /**
   * 있으면 행의 열린 할 일 id 를 이 값으로 덮는다 — 이번 세션이 닫은(미룬) 할 일이 낡은 서버 응답에서 "남은 할 일"로
   * 다시 보이지 않게, 되돌리기 뒤에는 처리 직전 목록으로 되살리게. 없으면 서버 값 그대로.
   */
  openTaskIds?: string[]
}

function clampCount(value: number) {
  return value < 0 ? 0 : value
}

function cloneProgress(progress: CrmTodayContacts["progress"]): CrmTodayContacts["progress"] {
  const byLane = {} as CrmTodayContacts["progress"]["byLane"]
  for (const slot of TODAY_CALL_SLOTS) {
    const lane = progress.byLane[slot.key]
    byLane[slot.key] = { total: lane?.total ?? 0, handled: lane?.handled ?? 0 }
  }
  return { ...progress, byLane }
}

function laneOf(progress: CrmTodayContacts["progress"], lane: TodayCallSlotKey) {
  const current = progress.byLane[lane] ?? { total: 0, handled: 0 }
  progress.byLane[lane] = current
  return current
}

/** 만료된 오버레이를 걷어낸다 — 바뀐 게 없으면 같은 참조(불필요한 리렌더 방지). */
export function pruneTodayContactOverlays(
  overlays: ReadonlyMap<string, TodayContactOverlay>,
  nowMs: number
): Map<string, TodayContactOverlay> {
  let expired = false
  for (const overlay of overlays.values()) {
    if (overlay.until <= nowMs) {
      expired = true
      break
    }
  }
  if (!expired) return overlays as Map<string, TodayContactOverlay>
  const next = new Map<string, TodayContactOverlay>()
  for (const [key, overlay] of overlays) if (overlay.until > nowMs) next.set(key, overlay)
  return next
}

/**
 * 열린 할 일이 하나도 남지 않은(오버레이가 openTaskIds 를 비운) 열린 행에서 할 일 사유를 뺀다 — 이 세션에서 닫은·
 * 미룬 할 일이 낡은 응답에서 "할 일 · 오늘 18:00"으로 계속 보이지 않게. 대표 기한·기한 지남도 남은 사유로 다시
 * 맞춘다. 할 일 사유뿐이면(빼면 사유가 없다) 그대로 둔다.
 */
export function dropClosedTaskReasons(row: TodayContactRow): TodayContactRow {
  if (row.openTaskIds.length > 0) return row
  const reasons = row.reasons.filter((reason) => reason.kind !== "task")
  if (reasons.length === row.reasons.length || reasons.length === 0) return row
  return { ...row, reasons, dueAt: reasons[0]?.dueAt ?? null, overdue: reasons.some((reason) => reason.overdue) }
}

/**
 * 서버 응답 위에 낙관 "처리됨"(또는 되돌리기 뒤 "다시 열림")을 덧씌운다. 진행률(처리·남음·레인·기한 지남)도
 * 같이 맞춘다 — 헤더 숫자와 목록이 어긋나지 않게. 서버가 행을 빼 버렸으면 처리 직전 위치에 되살린다.
 */
export function applyTodayContactOverlays(
  data: CrmTodayContacts | null,
  overlays: ReadonlyMap<string, TodayContactOverlay>,
  scope: string
): CrmTodayContacts | null {
  if (!data || overlays.size === 0) return data
  const applicable = [...overlays.values()].filter((overlay) => overlay.scope === scope).sort((a, b) => a.index - b.index)
  if (applicable.length === 0) return data

  const rows = data.rows.slice()
  const progress = cloneProgress(data.progress)
  let changed = false
  const shape = (row: TodayContactRow, overlay: TodayContactOverlay): TodayContactRow => {
    const next: TodayContactRow = { ...row, handled: overlay.handled }
    if (overlay.openTaskIds) next.openTaskIds = [...overlay.openTaskIds]
    // 열린 채로 둔 행(Compass 행의 Home 할 일만 닫음·되돌리기)의 닫힌 할 일 사유를 걷는다.
    return overlay.handled == null && overlay.openTaskIds ? dropClosedTaskReasons(next) : next
  }

  for (const overlay of applicable) {
    const at = rows.findIndex((row) => row.key === overlay.row.key)
    const nowHandled = overlay.handled != null
    if (at >= 0) {
      const current = rows[at]
      const wasHandled = current.handled != null
      if (!wasHandled && !nowHandled && !overlay.openTaskIds) continue
      const next = shape(current, overlay)
      rows[at] = next
      changed = true
      // 기한 지남은 미처리 행만 센다 — 처리 여부나 (할 일 사유를 걷어) 대표 기한이 바뀌면 맞춘다.
      const overdueBefore = !wasHandled && current.overdue
      const overdueAfter = !nowHandled && next.overdue
      if (overdueBefore !== overdueAfter) progress.overdue = clampCount(progress.overdue + (overdueAfter ? 1 : -1))
      if (wasHandled === nowHandled) continue
      const delta = nowHandled ? 1 : -1
      progress.handled = clampCount(progress.handled + delta)
      progress.remaining = clampCount(progress.remaining - delta)
      const lane = laneOf(progress, current.lane)
      lane.handled = clampCount(lane.handled + delta)
      continue
    }
    const inserted = shape(overlay.row, overlay)
    rows.splice(Math.max(0, Math.min(overlay.index, rows.length)), 0, inserted)
    changed = true
    progress.total += 1
    const lane = laneOf(progress, inserted.lane)
    lane.total += 1
    if (nowHandled) {
      progress.handled += 1
      lane.handled += 1
    } else {
      progress.remaining += 1
      if (inserted.overdue) progress.overdue += 1
    }
  }

  return changed ? { ...data, rows, progress } : data
}

/** Home 할 일에서만 나오는 처리 흔적 — 할 일 완료·미룸·오늘 만든 미래 할 일(일정 옮김). */
const HOME_TASK_HANDLED_KINDS: ReadonlySet<TodayContactHandledKind> = new Set(["task_done", "task_snoozed", "rescheduled"])

/**
 * Compass 매칭 리드 행(open_compass)이 Home 할 일 흔적만으로 "처리됨"이 됐는데 할 일 밖의 사유(Compass 다음 액션·
 * 첫 응답·재문의·팔로업 등)가 남았는가. A안에서 그 사유의 연락은 Compass 에서 한다 — Home 할 일을 닫거나 미룬 것은
 * 연락이 아니다. 처리 흔적 행의 사유는 흔적의 사유(할 일)로만 서므로, 할 일 밖 사유가 있으면 곧 미처리 사유다.
 */
export function isCompassRowHandledByHomeTaskOnly(row: Pick<TodayContactRow, "primaryAction" | "handled" | "reasons">): boolean {
  if (row.primaryAction !== "open_compass" || !row.handled) return false
  if (row.handled.source !== "home" || !HOME_TASK_HANDLED_KINDS.has(row.handled.kind)) return false
  return row.reasons.some((reason) => reason.kind !== "task")
}

/**
 * 서버 응답에서 isCompassRowHandledByHomeTaskOnly 행을 다시 연다(handled → null) — 진행률(처리·남음·레인·기한
 * 지남)을 같이 맞추고, 다시 연 행은 미처리 행 끝(처리됨 행 앞)으로 옮긴다(서버는 미처리 → 처리됨 순서로 준다).
 * 바뀐 게 없으면 같은 참조. 서버 판정(lib/crm/today-contact-queue.ts F 단계)이 같은 규칙이면 아무것도 하지 않는다.
 */
export function reopenCompassRowsHandledByHomeTasks(data: CrmTodayContacts | null): CrmTodayContacts | null {
  if (!data || !data.rows.some(isCompassRowHandledByHomeTaskOnly)) return data
  const progress = cloneProgress(data.progress)
  const pending: TodayContactRow[] = []
  const handled: TodayContactRow[] = []
  for (const row of data.rows) {
    if (!isCompassRowHandledByHomeTaskOnly(row)) {
      ;(row.handled ? handled : pending).push(row)
      continue
    }
    pending.push({ ...row, handled: null })
    progress.handled = clampCount(progress.handled - 1)
    progress.remaining += 1
    const lane = laneOf(progress, row.lane)
    lane.handled = clampCount(lane.handled - 1)
    if (row.overdue) progress.overdue += 1
  }
  return { ...data, rows: [...pending, ...handled], progress }
}

/**
 * 원천 칩·처리됨 숨기기. keepKeys(되돌리기 창·열린 폼)는 처리됨 숨기기에서도 남긴다(되돌리기 버튼을 잃지 않게).
 * 남은 Home 할 일이 있는 처리됨 행도 남긴다 — 그 할 일을 닫을 곳이 이 행뿐이다(주간 패널은 지난·오늘 버킷을 숨긴다).
 */
export function filterTodayContactRows(
  rows: readonly TodayContactRow[],
  options: { source: SourceFilter; hideHandled: boolean; keepKeys?: ReadonlySet<string> }
): TodayContactRow[] {
  const group = options.source === "all" ? null : TODAY_CONTACT_SOURCE_GROUPS.find((item) => item.key === options.source) ?? null
  return rows.filter((row) => {
    if (group && !row.reasons.some((reason) => group.kinds.includes(reason.kind))) return false
    if (options.hideHandled && row.handled && !options.keepKeys?.has(row.key) && handledRowOpenTaskCount(row) === 0) return false
    return true
  })
}

/** 원천 칩 건수 — 불러온 행 기준(칩을 누르면 보이는 행 수와 같다). 한 행이 여러 원천에 걸리면 각각 센다. */
export function countTodayContactSources(rows: readonly TodayContactRow[]): Record<TodayContactSourceGroupKey, number> {
  const counts = Object.fromEntries(TODAY_CONTACT_SOURCE_GROUPS.map((group) => [group.key, 0])) as Record<
    TodayContactSourceGroupKey,
    number
  >
  for (const row of rows) {
    for (const group of TODAY_CONTACT_SOURCE_GROUPS) {
      if (row.reasons.some((reason) => group.kinds.includes(reason.kind))) counts[group.key] += 1
    }
  }
  return counts
}

export interface TodayContactSourceChipCount {
  count: number
  /** 서버가 목록을 잘라 이 수보다 더 있을 수 있다("N+") */
  more: boolean
}

/**
 * 원천 칩 건수. 목록이 잘리지 않았으면 불러온 행 기준(칩을 누르면 보이는 행 수와 같다). 잘렸으면(truncated.rows)
 * 서버 전체 집계(counts.bySource — 자르기 전 사유 종류별 행 수)를 쓴다 — 받은 행만 세면 과소 표시된다.
 * 한 칩이 사유 두 종류를 묶으면(계정 만료·소진, 데모·재방문) 두 종류를 모두 가진 행이 겹쳐 셀 수 있어
 * 확실한 하한(종류별 최댓값)을 보이고 합이 더 크면 "+"를 붙인다.
 */
export function todayContactSourceChipCounts(
  rows: readonly TodayContactRow[],
  server: { bySource: CrmTodayContacts["counts"]["bySource"]; truncated: boolean } | null
): Record<TodayContactSourceGroupKey, TodayContactSourceChipCount> {
  const loaded = countTodayContactSources(rows)
  const result = {} as Record<TodayContactSourceGroupKey, TodayContactSourceChipCount>
  for (const group of TODAY_CONTACT_SOURCE_GROUPS) {
    if (!server?.truncated) {
      result[group.key] = { count: loaded[group.key], more: false }
      continue
    }
    const byKind = group.kinds.map((kind) => server.bySource[kind] ?? 0)
    const lower = Math.max(loaded[group.key], ...byKind)
    const upper = Math.max(lower, byKind.reduce((sum, value) => sum + value, 0))
    result[group.key] = { count: lower, more: upper > lower }
  }
  return result
}

/**
 * 이 목록이 홈의 지난·오늘 할 일을 빠짐없이 담았는가 — 주간 할 일 패널이 그 버킷을 숨겨도 되는지(도달성 불변,
 * admin-guidance-map §2). 담당 전체 범위·잘리지 않음·할 일 원천 정상일 때만 true. 못 불러왔으면 false.
 * 담긴 할 일은 모두 행에서 닫을 수 있어 행 모양은 보지 않는다 — 할 일 행 "완료"·"내일로", Compass 매칭 리드 행의
 * 보조 "할 일 완료"·"할 일 내일로", 처리됨으로 접힌 행의 "할 일 완료"(처리됨 숨기기도 이 행은 남긴다). 같은 할 일을
 * 주간 패널에 한 번 더 두지 않는다(플레이북 04 §3 중복 배치 금지).
 * 기본 담당(내 담당 "__me" — 10월 줄기)도 담당 필터라 false 다: 행 단위 담당 판정(리드·할 일 담당의 합집합)과 주간
 * 패널의 할 일 담당 판정이 같다고 보장하지 않으므로, 기본 화면에서는 숨기지 않고 둘 다 보인다(도달성 우선).
 */
export function todayContactsCoverTasks(data: Pick<CrmTodayContacts, "truncated" | "sources"> | null, owner: string): boolean {
  if (!data) return false
  if (owner.trim()) return false
  return !data.truncated.rows && data.sources.tasksOk
}

/**
 * 이 목록이 오늘·지난 Compass 다음 액션을 빠짐없이 담았는가 — Compass 밴드가 임박 목록에서 오늘 몫을 빼도 되는지
 * (도달성 불변). 담당 전체 범위(서버가 담당 필터로 Compass 행도 거른다)·잘리지 않음·Compass 조회 정상(ok)일 때만
 * true. down(다음 액션 조회 실패 — 행 0건)·partial(일부 실패 — 다음 액션이 잘렸을 수 있다)·목록 실패는 false.
 */
export function todayContactsCoverCompassActions(
  data: Pick<CrmTodayContacts, "truncated" | "sources"> | null,
  owner: string
): boolean {
  if (!data) return false
  if (owner.trim()) return false
  return !data.truncated.rows && data.sources.compass === "ok"
}

/**
 * 빈 목록 문구 — "없음"(데이터 누락 아님)·"모름"(원천 일부 실패·내 담당 연결 미확인)·"필터로 비움"을 가르고, 담당
 * 범위를 밝힌다. 기본 담당(내 담당 "__me" — 10월 줄기)은 "내 담당" 범위라고 말하고, 담당 전체로 넓히는 길을 함께
 * 알린다(버튼 "담당 전체로 보기"는 owner 가 있을 때 패널이 단다). "없음"의 단언(데이터 누락 아님)은 로그인 계정이 CRM
 * 담당자로 풀렸을 때(ownerResolved — 패널: currentOwner 있음·담당자 디렉터리 정상)만 한다. 못 풀리면 서버가 내 담당을
 * 매칭되지 않는 키(lib/admin/data-owner.ts currentDataOwner — userId·UNMAPPED_OWNER)로 걸러 빈 목록이 나오므로 "모름"
 * (kind "owner_unresolved")이다 — 담당 선택이 "내 담당 · 담당자 연결 확인"을 보이는 것과 같은 상태다.
 */
export function todayContactsEmptyCopy(input: { unknown: boolean; filtered: boolean; owner: string; ownerResolved: boolean }): {
  kind: "none" | "unknown" | "filtered" | "owner_unresolved"
  title: string
  detail: string
} {
  const owner = input.owner.trim()
  const mine = owner === CURRENT_OWNER_VALUE
  if (input.unknown) {
    return {
      kind: "unknown",
      title: !owner
        ? "오늘 연락 목록이 비어 있습니다"
        : mine
          ? "내 담당 오늘 연락 목록이 비어 있습니다"
          : "선택한 담당자의 오늘 연락이 보이지 않습니다",
      detail: "일부 원천을 읽지 못해 목록이 비어 보일 수 있습니다 — 대상이 없다는 뜻이 아닙니다. 위 안내를 확인한 뒤 새로고침하세요.",
    }
  }
  if (input.filtered) {
    return { kind: "filtered", title: "이 조건에 남은 연락이 없습니다", detail: "원천 필터·처리됨 숨기기를 풀면 다른 행이 보입니다." }
  }
  if (!owner) {
    return { kind: "none", title: "오늘 연락할 대상이 없습니다", detail: "처리할 연락이 없다는 뜻입니다 — 데이터 누락이 아닙니다." }
  }
  if (mine && !input.ownerResolved) {
    return {
      kind: "owner_unresolved",
      title: "내 담당 오늘 연락 목록이 비어 있습니다",
      detail: "로그인 계정과 CRM 담당자 연결을 확인하지 못해 내 담당 목록이 비어 보일 수 있습니다 — 대상이 없다는 뜻이 아닙니다. 담당 전체로 넓혀 확인하세요.",
    }
  }
  if (mine) {
    return {
      kind: "none",
      title: "내 담당 중 오늘 연락할 대상이 없습니다",
      detail: "처리할 연락이 없다는 뜻입니다 — 데이터 누락이 아닙니다. 담당 전체로 넓히면 다른 담당자의 연락이 보일 수 있습니다.",
    }
  }
  return { kind: "none", title: "선택한 담당자의 오늘 연락이 없습니다", detail: "담당 전체로 넓히면 다른 담당자의 연락이 보일 수 있습니다." }
}

/**
 * "더 보기" 문구. hiddenCount = 받은 행 중 접어 둔 수, unloadedCount = 서버가 잘라 보내지 않은 수(canLoadMore 일 때만
 * 더 불러올 수 있다). 필터가 걸려 있으면 안 받은 행이 그 필터에 몇 건 걸리는지 모르므로 합치지 않는다.
 */
export function todayContactsMoreLabel(input: {
  hiddenCount: number
  unloadedCount: number
  canLoadMore: boolean
  filterActive: boolean
}): string {
  const hidden = Math.max(0, input.hiddenCount)
  const extra = input.canLoadMore ? Math.max(0, input.unloadedCount) : 0
  if (hidden > 0 && extra > 0) {
    return input.filterActive
      ? `남은 ${hidden.toLocaleString("ko-KR")}건 더 보기 · 불러오지 않은 ${extra.toLocaleString("ko-KR")}건도 불러오기`
      : `남은 ${(hidden + extra).toLocaleString("ko-KR")}건 더 보기`
  }
  if (extra > 0) return `불러오지 않은 ${extra.toLocaleString("ko-KR")}건 더 불러오기`
  return `남은 ${hidden.toLocaleString("ko-KR")}건 더 보기`
}

/**
 * 잘린 목록의 전체 행 수(칩 "전체 원천 N"·"오늘 전체 N건")와 불러오지 않은 행 수("불러오지 않은 N건").
 *  - 잘리지 않음: 전체 = 보이는 행, 안 받은 행 0.
 *  - 잘림 + truncated.totalRows(자르기 전 목록 행 수): 전체 = max(totalRows, 보이는 행), 안 받은 행 = 전체 − 보이는 행.
 *    낙관 오버레이가 되살린 행은 보이는 행에 들어 있고, 대개 totalRows 에도 이미 들어 있다(서버가 처리됨 행을 목록 끝
 *    — 상한 밖 — 으로 보냈을 뿐). 그래서 보이는 행에 더하지 않는다 — 더하면 같은 행을 두 번 센다("불러오지 않은
 *    1건"을 눌러도 이미 보이는 행만 온다). 서버가 행을 아예 뺐다면 안 받은 행이 1 적게 나올 뿐(과다보다 안전).
 *  - 잘림 + totalRows 없음(옛 응답): progress.total 로 폴백 — 같은 기관으로 접은 리드까지 센 대상 수라 행 수보다 클 수 있다.
 */
export function todayContactsRowTotals(input: {
  truncated: Pick<CrmTodayContacts["truncated"], "rows" | "totalRows"> | null | undefined
  /** 오버레이를 덧씌운 진행률의 대상 수(옛 응답 폴백용) */
  progressTotal: number
  /** 화면 목록 행 수(오버레이 포함 — 오버레이는 행을 바꾸거나 되살릴 뿐 빼지 않는다) */
  shownRows: number
}): { total: number; unloaded: number } {
  const shown = Math.max(0, input.shownRows)
  if (!input.truncated?.rows) return { total: shown, unloaded: 0 }
  const totalRows = input.truncated.totalRows
  if (typeof totalRows === "number" && Number.isFinite(totalRows)) {
    const total = Math.max(Math.floor(totalRows), shown)
    return { total, unloaded: total - shown }
  }
  const total = Math.max(input.progressTotal, shown)
  return { total, unloaded: Math.max(0, total - shown) }
}

/** 일부 원천을 읽지 못했는가 — 빈 목록을 "대상 없음"으로 단언하면 안 되는 상태. */
export function todayContactsSourcesIncomplete(sources: CrmTodayContacts["sources"] | null | undefined): boolean {
  if (!sources) return false
  return !sources.leadsOk || !sources.neoAccountsOk || !sources.tasksOk || sources.compass !== "ok"
}

/**
 * 강등 응답(Home 필수 원천 일부를 못 읽음 — isTodayContactsCacheable false)은 화면에는 그대로 보이되 요청 캐시에서
 * 지운다. 서버는 no-store 로 주지만 adminFetchJsonCached 는 응답 헤더를 보지 않고 저장해, 그대로 두면 90초 TTL·SWR 창
 * 동안 탭 복귀·60초 틱이 같은 강등 목록("리드 없음(경고)")을 재사용한다(읽기 오류 결과를 정상 캐시에 두지 않는다 —
 * 세그먼트 허브 dropDegradedSegmentList 와 같은 패턴). 값은 그대로 돌려준다(없으면 아무것도 하지 않는다).
 */
export function dropDegradedTodayContacts<T extends CrmTodayContacts | null | undefined>(
  cacheKey: string,
  value: T,
  clear: (scope: string) => void = clearAdminRequestCache
): T {
  if (value && !isTodayContactsCacheable(value)) clear(cacheKey)
  return value
}

/**
 * 첫 마운트에 서버 프리페치 값을 요청 캐시에 심어도 되는가 — 값이 있고 강등이 아닐 때만. 강등이면 심지 않고(화면에는
 * useState 초기값으로 이미 보인다) 바로 다시 받는다.
 */
export function shouldSeedTodayContacts(seed: CrmTodayContacts | null | undefined): seed is CrmTodayContacts {
  return seed != null && isTodayContactsCacheable(seed)
}

/** 처리 뒤 포커스를 옮길 행 — 아래쪽 첫 미처리 행, 없으면 위쪽 미처리 행, 그것도 없으면 null(heading). */
export function nextFocusKeyAfterHandled(rows: readonly Pick<TodayContactRow, "key" | "handled">[], key: string): string | null {
  const index = rows.findIndex((row) => row.key === key)
  for (let i = index + 1; i < rows.length; i += 1) {
    if (!rows[i].handled && rows[i].key !== key) return rows[i].key
  }
  for (let i = (index < 0 ? rows.length : index) - 1; i >= 0; i -= 1) {
    if (!rows[i].handled && rows[i].key !== key) return rows[i].key
  }
  return null
}

/** 대상 없는 할 일 행의 할 일 id. */
export function taskIdForRow(row: Pick<TodayContactRow, "entityType" | "entityId" | "openTaskIds">): string | null {
  if (row.entityType === "task") return row.entityId || null
  return row.openTaskIds[0] ?? null
}

/**
 * 행의 "완료"·"내일로"(할 일 PATCH)가 닫을 할 일 id 전부 — 대상 없는 할 일 행은 그 할 일 하나, 대상 행(Compass
 * 매칭 리드 등)은 묶인 열린 할 일 모두(중복 제거, 결과 폼과 같은 상한 OUTCOME_CLOSE_TASK_LIMIT). 첫 건만 닫으면
 * 나머지가 내일 다시 "지남"으로 올라온다.
 */
export function taskIdsForRow(row: Pick<TodayContactRow, "entityType" | "entityId" | "openTaskIds">): string[] {
  if (row.entityType === "task") return row.entityId ? [row.entityId] : []
  return [...new Set(row.openTaskIds.filter(Boolean))].slice(0, OUTCOME_CLOSE_TASK_LIMIT)
}

/**
 * 행의 "내일로"가 무엇을 옮기는가 — "task" = 할 일 PATCH(snooze)만(대상 없는 할 일, Compass 매칭 리드에 묶인 Home
 * 할 일 — 리드 follow_up_at 은 건드리지 않는다), "outcome" = 결과 라우트의 미루기(NEO 계정·Home 리드), null = 없음.
 */
export function todayContactSnoozeKind(row: Pick<TodayContactRow, "primaryAction" | "openTaskIds">): "task" | "outcome" | null {
  if (row.primaryAction === "complete_task") return "task"
  if (row.primaryAction === "open_compass") return row.openTaskIds.length > 0 ? "task" : null
  return "outcome"
}

/**
 * 미루기 되돌리기에 쓸 할 일별 원래 기한 — 행 사유(sourceRef 'task:<id>')에서 확실한 것만. 대상 없는 할 일 행은
 * 사유가 하나라 행 기한으로 보충한다. 모르는 id 는 빠진다(호출부가 미루기 전에 할 일을 읽어 채운다).
 */
export function knownTaskDueAts(
  row: Pick<TodayContactRow, "entityType" | "reasons" | "dueAt">,
  taskIds: readonly string[]
): Map<string, string | null> {
  const dues = new Map<string, string | null>()
  for (const id of taskIds) {
    const reason = row.reasons.find((item) => item.kind === "task" && item.sourceRef === `task:${id}`)
    if (reason) dues.set(id, reason.dueAt)
  }
  if (row.entityType === "task" && taskIds.length === 1 && !dues.has(taskIds[0])) {
    // 할 일 사유가 있으면 그 기한(기한 없음 = null 포함)이 정본 — 없을 때만 행 기한.
    const taskReason = row.reasons.find((reason) => reason.kind === "task")
    dues.set(taskIds[0], taskReason ? taskReason.dueAt : row.dueAt ?? null)
  }
  return dues
}

export interface TodayContactTaskActionPlan {
  /** 오버레이에 실을 처리 상태 — null 이면 행을 연 채로 둔다(할 일만 걷는다) */
  handled: TodayContactHandled | null
  /** 접힌 줄 문구(처리됨) 또는 열린 행의 확인 문구 */
  summary: string
  /** 이 동작으로 행이 새로 "처리됨"이 되는가(포커스를 다음 행으로 옮길지) */
  closesRow: boolean
  /** 동작 뒤 행에 남는 열린 할 일(오버레이 openTaskIds) */
  remainingTaskIds: string[]
}

/**
 * 행의 할 일 "완료"·"내일로"(할 일 PATCH)가 행을 어떻게 바꾸는가.
 *  - 이미 처리됨(Compass 활동·연락 기록)인 행: 처리 판정은 그대로, 문구에 할 일 처리를 덧붙인다.
 *  - 남는 할 일이 있거나(상한 10 을 넘는 묶음), Compass 매칭 리드 행에 할 일 밖 사유(Compass 다음 액션·첫 응답 등)가
 *    남으면: 행을 연 채로 둔다 — Home 할 일을 닫거나 미룬 것은 Compass 연락이 아니다(A안). 주 행동 "Compass에서
 *    열기"가 그대로 남는다.
 *  - 그 밖(대상 없는 할 일, 할 일만으로 선 행): 처리됨(task_done·task_snoozed).
 */
export function planTodayContactTaskAction(input: {
  row: Pick<TodayContactRow, "primaryAction" | "reasons" | "handled" | "openTaskIds">
  taskIds: readonly string[]
  action: "complete" | "snooze"
  at: string
  by: string | null
  /** 미루기의 다음 기한(내일 09:00) — 완료는 null */
  nextAt: string | null
  /** 이 행에 이미 걸린 세션 요약(처리됨 문구) */
  currentSummary?: string | null
}): TodayContactTaskActionPlan {
  const { row, taskIds, action, nextAt } = input
  const countLabel = taskIds.length > 1 ? ` ${taskIds.length.toLocaleString("ko-KR")}건` : ""
  const actionSummary =
    action === "complete" ? `할 일${countLabel} 완료` : `할 일${countLabel} 미룸 → 다음 ${formatKstMonthDayTime(nextAt)}`
  const remainingTaskIds = row.openTaskIds.filter((id) => !taskIds.includes(id))
  if (row.handled) {
    const base = describeTodayContactHandled(row.handled, input.currentSummary ?? null).text
    return { handled: row.handled, summary: `${base} · ${actionSummary}`, closesRow: false, remainingTaskIds }
  }
  const otherReasonsLeft = row.primaryAction === "open_compass" && row.reasons.some((reason) => reason.kind !== "task")
  if (remainingTaskIds.length > 0 || otherReasonsLeft) {
    return { handled: null, summary: actionSummary, closesRow: false, remainingTaskIds }
  }
  return {
    handled: {
      kind: action === "complete" ? "task_done" : "task_snoozed",
      at: input.at,
      by: input.by,
      source: "home",
      nextAt,
      approximate: false,
    },
    summary: actionSummary,
    closesRow: true,
    remainingTaskIds,
  }
}

/** 실패한 결과 저장·미루기의 요청 — 다시 보낼 때 같은 requestId 를 쓴다(성공·되돌리기 뒤에만 새 id). */
export interface TodayContactPendingRequest {
  requestId: string
  /** 처음 실패한 요청의 내용(requestId 제외) — 다시 보낼 때 내용이 바뀌었는지 판단 */
  signature: string
  /** 처음 실패한 시각(ms) — 만료 판정(isTodayContactPendingRequestLive) */
  failedAtMs: number
}

/**
 * 실패 기록을 아직 "같은 요청의 재전송"으로 볼 수 있는가 — 10분 안이고 KST 날짜가 같을 때만. 지난 기록으로 새 저장을
 * 보내면 서버가 duplicate(첫 기록)로 답해 오늘 연락이 새로 남지 않는데, 할 일은 닫히고 팔로업은 옮겨진다.
 */
export function isTodayContactPendingRequestLive(pending: Pick<TodayContactPendingRequest, "failedAtMs">, nowMs: number): boolean {
  if (!Number.isFinite(pending.failedAtMs)) return false
  if (nowMs - pending.failedAtMs > TODAY_CONTACTS_PENDING_REQUEST_MAX_AGE_MS) return false
  return kstDateKey(pending.failedAtMs) === kstDateKey(nowMs)
}

export function todayContactPendingKey(rowKey: string, mode: TodayContactOutcomeRequest["mode"]): string {
  return `${mode}|${rowKey}`
}

/** 요청 내용 지문 — requestId 를 뺀 나머지(대상·채널·결과·메모·다음 일정·제목·함께 닫을 할 일). */
export function todayContactRequestSignature(request: TodayContactOutcomeRequest): string {
  const content: Partial<TodayContactOutcomeRequest> = { ...request }
  delete content.requestId
  return JSON.stringify(content)
}

/**
 * 이번 저장의 requestId. 같은 행·모드의 실패한 요청이 살아 있으면(isTodayContactPendingRequestLive) 그 id 를 다시
 * 쓴다 — 응답만 유실되고 서버에는 저장된 경우 서버가 duplicate 로 돌려줘 기록·다음 할 일이 두 번 생기지 않는다.
 * contentChanged 는 처음 실패한 요청과 내용이 달라졌는지(서버가 duplicate 로 답하면 고친 내용은 저장되지 않았을 수
 * 있다 — 화면이 알린다). 만료된 기록은 없는 것으로 보고 새 id 를 만든다.
 */
export function pickTodayContactRequestId(
  pending: TodayContactPendingRequest | null | undefined,
  signature: string,
  nowMs: number,
  create: () => string = newTodayContactRequestId
): { requestId: string; contentChanged: boolean } {
  if (pending && isTodayContactPendingRequestLive(pending, nowMs)) {
    return { requestId: pending.requestId, contentChanged: pending.signature !== signature }
  }
  return { requestId: create(), contentChanged: false }
}

/**
 * 결과 저장이 duplicate(같은 requestId 가 이미 반영됨)로 돌아왔는데 보낸 내용이 처음 실패한 요청과 달랐는가 — 고친
 * 메모·결과가 저장되지 않았으니 알려야 한다. 계정·고객·딜(sourceId)과 리드(로그 id todayContactLeadLogId) 모두
 * requestId 로 멱등이라 대상 종류와 무관하다.
 */
export function todayContactDuplicateDroppedEdit(input: { contentChanged: boolean; duplicate: boolean }): boolean {
  return input.contentChanged && input.duplicate
}

/** 화면이 스스로 알아챈 "고친 내용이 저장되지 않았을 수 있다" — 서버가 같은 경고를 주지 않았을 때만 쓴다. */
export const TODAY_CONTACT_DUPLICATE_EDIT_WARNING =
  "앞서 보낸 저장이 이미 반영돼 있었습니다 — 그 뒤 고친 내용은 저장되지 않았을 수 있으니 고객 360 에서 확인하세요."

/**
 * 서버의 "재전송 내용이 먼저 저장된 기록과 달라 고친 내용은 저장하지 않았다" 경고인가
 * (lib/crm/account-contact-record.ts todayContactContentMismatchWarning — 저장된 기록 제목이 들어 있다).
 */
export function isTodayContactContentMismatchWarning(warning: string): boolean {
  return /(고친|수정한) 내용은 저장(하지|되지) 않았/.test(warning)
}

/**
 * 결과 저장·미루기 성공 뒤 보일 경고 — 같은 뜻의 경고를 한 번만.
 *  - 서버가 내용 불일치 경고를 줬으면 그 문구가 정본이다(저장된 제목·건너뛴 단계가 들어 있다) — 접두어 없이 그대로 보이고
 *    화면 자체 경고(TODAY_CONTACT_DUPLICATE_EDIT_WARNING)는 뺀다.
 *  - 서버 경고가 없는데 화면이 재전송 내용 변경을 알아챘으면(todayContactDuplicateDroppedEdit) 화면 경고.
 *  - 그 밖의 서버 경고(할 일 닫기 실패 등)는 "기록은 저장했지만 일부 단계가 빠졌습니다 —" 뒤에 묶는다.
 */
export function todayContactSaveWarnings(input: {
  contentChanged: boolean
  duplicate: boolean
  serverWarnings?: readonly string[] | null
}): string[] {
  const server = (input.serverWarnings ?? []).map((warning) => warning.trim()).filter(Boolean)
  const mismatch = [...new Set(server.filter(isTodayContactContentMismatchWarning))]
  const others = server.filter((warning) => !isTodayContactContentMismatchWarning(warning))
  const warnings: string[] = []
  if (mismatch.length) warnings.push(...mismatch)
  else if (todayContactDuplicateDroppedEdit(input)) warnings.push(TODAY_CONTACT_DUPLICATE_EDIT_WARNING)
  if (others.length) warnings.push(`기록은 저장했지만 일부 단계가 빠졌습니다 — ${others.join(" ")}`)
  return warnings
}

/**
 * 행에서 추정한 저장 직전 follow_up_at — 확실할 때만 값을 낸다: 팔로업 사유의 기한, 없으면 미래 팔로업.
 * 둘 다 없으면 undefined(모름). "비어 있었다"(null)로 단정하지 않는다 — 행이 할 일·재문의로만 섰거나 엔진이
 * 뺀 리드면 follow_up_at 이 행에 드러나지 않을 수 있다(null 을 보내면 서버가 실제 팔로업을 지운다).
 */
export function previousLeadFollowUpAt(row: Pick<TodayContactRow, "reasons" | "nextContact">): string | undefined {
  const followUp = row.reasons.find((reason) => reason.kind === "follow_up")
  if (followUp?.dueAt) return followUp.dueAt
  if (row.nextContact?.kind === "follow_up") return row.nextContact.at
  return undefined
}

/**
 * 리드 되돌리기(DELETE)에 실을 previousFollowUpAt. undefined = 키를 빼서 서버가 follow_up_at 을 건드리지 않게 한다.
 *  1) 리드가 아니거나 다음 일정이 없던 저장(서버가 follow_up_at 을 바꾸지 않았다) → undefined
 *  2) 서버 응답의 previousFollowUpAt(계약 — 저장 직전 실제 값, null = 비어 있었음)이 있으면 그대로
 *  3) 응답에 없으면(duplicate 재전송 등) 행 추정값이 확실할 때만, 아니면 undefined
 */
export function resolveLeadUndoFollowUpAt(
  row: Pick<TodayContactRow, "reasons" | "nextContact">,
  request: Pick<TodayContactOutcomeRequest, "target" | "next">,
  response: Pick<TodayContactOutcomeResponse, "previousFollowUpAt">
): string | null | undefined {
  if (request.target.type !== "lead" || request.next == null) return undefined
  if (response.previousFollowUpAt !== undefined) return response.previousFollowUpAt
  return previousLeadFollowUpAt(row)
}

export interface TodayContactUndoFailure {
  /** 보일 문구 — 서버 error(없으면 상태 코드) */
  message: string
  /** "다시 시도"를 달아도 되는가 */
  retryable: boolean
}

/**
 * 되돌리기(DELETE …/outcome) 실패 응답 해석. 409 = 서버가 이 저장을 되돌리지 않기로 했다(이 요청이 만든 기록이 아님·
 * 다른 사람이 남긴 기록·10분 지남 — account-contact-record undoTodayContactOutcome). 다시 보내도 같은 답이라 "다시 시도"를
 * 달지 않고 서버 안내 문구만 보인다. 그 밖(5xx·400·404 등)은 지금처럼 다시 시도할 수 있다.
 */
export function readTodayContactUndoFailure(status: number, body: unknown, statusText = ""): TodayContactUndoFailure {
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  const pick = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)
  const serverMessage = pick(record?.error) ?? pick(record?.message)
  if (status === 409) return { message: serverMessage ?? "이 저장은 되돌릴 수 없습니다.", retryable: false }
  return { message: serverMessage ?? (`${status} ${statusText}`.trim() || "요청에 실패했습니다."), retryable: true }
}

/** 멱등 키(uuid v4). crypto.randomUUID 가 없는 환경(비보안 컨텍스트)은 getRandomValues → Math.random 순으로 대체. */
export function newTodayContactRequestId(): string {
  const cryptoRef = typeof globalThis !== "undefined" ? globalThis.crypto : undefined
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID()
  const bytes = new Uint8Array(16)
  if (cryptoRef?.getRandomValues) cryptoRef.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** "09/25 (금) 14:00" — KST 고정(응답 generatedAt 표기). */
function formatGeneratedLabel(iso: string | null | undefined) {
  if (!iso) return null
  const full = formatKstMonthDayTime(iso)
  return full === "-" ? null : full
}

function errorDetail(err: unknown) {
  return err instanceof Error && err.message ? err.message : "알 수 없는 오류"
}

interface PanelNotice {
  tone: "success" | "warning"
  message: string
}

interface PanelError {
  message: string
  retry?: () => void
}

// ─── 스켈레톤(CrmHomeClient 의 Suspense fallback) ──────────────────────────

export function CrmTodayContactsPanelSkeleton() {
  return (
    <section className="mb-4 rounded-xl border border-[#e8e8e4] bg-white p-4" aria-hidden>
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">ClassIn Operation</p>
        <h2 className="mt-1 text-[18px] font-bold text-[#111110]">오늘 연락</h2>
        <div className="mt-2 h-1 w-full max-w-[320px] animate-pulse rounded-full bg-[#f0f0ec]" />
      </div>
      <div className="space-y-2 sm:space-y-0 sm:divide-y sm:divide-[#f0f0ec] sm:border-y sm:border-[#f0f0ec]">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={`sk-${index}`} className="flex items-center gap-3 rounded-xl border border-[#e8e8e4] p-3 sm:rounded-none sm:border-0">
            <div className="h-4 w-24 animate-pulse rounded bg-[#f0f0ec]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-4 w-1/3 animate-pulse rounded bg-[#f0f0ec]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[#f5f5f2]" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── 패널 ─────────────────────────────────────────────────────────────

export interface CrmTodayContactsPanelProps {
  /** 값이 바뀌면 캐시를 건너뛰고 강제 재조회(홈 새로고침). 살아 있는 낙관 오버레이는 남긴다(상단 주석). */
  refreshKey?: number
  /** 값이 바뀌면 force 없이 조용히 재조회(홈 60초 틱 — TTL 지난 것만 네트워크). */
  softRefreshKey?: number
  /**
   * CRM 홈 서버 프리페치 레인(접속자 개인 기준 — 기본 담당) — 이 컴포넌트가 React use()로 직접 푼다. 호출부가
   * <Suspense fallback={<CrmTodayContactsPanelSkeleton />}>로 감싸야 한다. URL 의 ?owner= 가 내 담당이 아닌
   * 값(전체 "" · 다른 담당)이면 범위가 달라 쓰지 않는다.
   */
  initialData?: DeferredPrefetch<CrmTodayContacts> | null
  /**
   * 제목 클릭 → 고객 360 드로어(리드·NEO 계정 키만). 생략하면(CRM 홈 — 10월에 드로어를 걷었다) 제목이 고객 360 상세
   * 페이지 링크(todayContactHomeHref)다.
   */
  onOpenCustomer?: (target: { key: string; name: string }) => void
  /**
   * 이 목록이 지난·오늘 할 일을 빠짐없이 담았는지 알린다(todayContactsCoverTasks) — 홈이 주간 할 일 패널의
   * 지난·오늘 버킷을 숨길지 정한다. 잘렸거나·할 일 원천 실패·담당 필터·목록 실패면 false(숨긴 버킷을 다시 보인다).
   */
  onCoverageChange?: (coversTasks: boolean) => void
  /**
   * 이 목록이 오늘·지난 Compass 다음 액션을 빠짐없이 담았는지 알린다(todayContactsCoverCompassActions) — 홈이
   * Compass 밴드 임박 목록에서 오늘 몫을 뺄지 정한다. 담당 필터·Compass 끊김/일부 실패·잘림·목록 실패면 false.
   */
  onCompassCoverageChange?: (coversCompassActions: boolean) => void
}

export default function CrmTodayContactsPanel({
  refreshKey = 0,
  softRefreshKey = 0,
  initialData = null,
  onOpenCustomer,
  onCoverageChange,
  onCompassCoverageChange,
}: CrmTodayContactsPanelProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // 담당 필터 → URL(?owner=) 착지 복원(새로고침·공유 링크에서 유실되지 않게). ?owner 가 없으면 내 담당(기본),
  // 빈 값(?owner=)은 담당 전체다 — "" 는 nullish 가 아니라 ?? 기본값으로 바뀌지 않는다.
  const initialOwner = searchParams.get("owner")?.trim() ?? CURRENT_OWNER_VALUE
  const [owner, setOwnerState] = useState(initialOwner)
  const prefetchPromise =
    initialOwner === CURRENT_OWNER_VALUE && initialData != null ? initialData.promise : RESOLVED_NULL_PROMISE
  const prefetchSeed = use(prefetchPromise)
  const [data, setData] = useState<CrmTodayContacts | null>(prefetchSeed)
  const [loading, setLoading] = useState(!prefetchSeed)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<PanelError | null>(null)
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null)
  const [notice, setNotice] = useState<PanelNotice | null>(null)
  const [liveMessage, setLiveMessage] = useState("")
  const [overlays, setOverlays] = useState<Map<string, TodayContactOverlay>>(() => new Map())
  const [undoable, setUndoable] = useState<{ key: string; run: () => Promise<void> } | null>(null)
  const [undoPending, setUndoPending] = useState(false)
  const [acting, setActing] = useState<{ key: string; busy: Exclude<TodayContactRowBusy, null> } | null>(null)
  const [draft, setDraft] = useState<TodayContactOutcomeDraft | null>(null)
  const [discardPrompt, setDiscardPrompt] = useState<{ rowKey: string; onDiscard: () => void } | null>(null)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all")
  const [hideHandled, setHideHandled] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // 서버 상한(60)에서 잘린 목록을 최대 상한(150)으로 다시 받은 담당 범위 — 범위(담당 필터)가 바뀌면 자동으로 풀린다.
  const [fullListScope, setFullListScope] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ key: string | null; seq: number } | null>(null)
  // 렌더 중 Date.now() 금지(react-hooks/purity) — 응답이 없을 때의 표기 기준은 마운트 시각.
  const [mountNowMs] = useState(() => Date.now())
  const { owners: crmOwners, currentOwner, health: ownerHealth } = useCrmOwners()

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 실패한 결과 저장·미루기의 requestId(행·모드별) — 다시 보낼 때 같은 id 를 쓴다(상단 주석).
  const pendingRequestsRef = useRef(new Map<string, TodayContactPendingRequest>())
  const rowRefs = useRef(new Map<string, HTMLLIElement>())
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const dataRef = useRef<CrmTodayContacts | null>(data)
  const visibleRowsRef = useRef<TodayContactRow[]>([])
  const requestSeq = useRef(0)

  useEffect(() => {
    dataRef.current = data
  }, [data])

  const lastOwnerParamRef = useRef<string | null>(searchParams.get("owner"))
  useEffect(() => {
    const param = searchParams.get("owner")
    if (param === lastOwnerParamRef.current) return
    lastOwnerParamRef.current = param
    setOwnerState(param?.trim() ?? CURRENT_OWNER_VALUE)
  }, [searchParams])

  const setOwner = useCallback(
    (next: string) => {
      setOwnerState(next)
      lastOwnerParamRef.current = next
      const params = new URLSearchParams(Array.from(searchParams.entries()))
      // 전체("")도 owner= 로 남긴다 — 지우면 다음 착지가 기본(내 담당)으로 돌아간다.
      params.set("owner", next)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  // scope = 담당 범위(오버레이·"같은 목록" 판정 기준, 기본 상한 URL 과 같다) · url = 실제 조회 URL(상한 포함).
  const scope = useMemo(() => todayContactsUrl(owner), [owner])
  const wantFullList = fullListScope === scope
  const url = useMemo(() => (wantFullList ? todayContactsUrl(owner, TODAY_CONTACTS_MAX_LIMIT) : scope), [owner, scope, wantFullList])
  // 지금 data 가 어느 담당 범위의 목록인가 — 상한만 바뀐 재조회(더 불러오기)는 기존 행을 남긴 채 기다린다.
  const dataScopeRef = useRef<string | null>(prefetchSeed ? scope : null)
  const ownerOptions = useMemo(() => buildOwnerSelectOptions(data?.owners, crmOwners), [crmOwners, data?.owners])
  const actorName = currentOwner?.displayName?.trim() || null

  const load = useCallback(
    async (options?: { force?: boolean; background?: boolean }) => {
      const seq = ++requestSeq.current
      const isLatest = () => requestSeq.current === seq
      const force = Boolean(options?.force)
      // background: 쓰기 뒤·60초 틱 재검증 — 목록·오류 배너를 건드리지 않고 도착한 값만 반영한다.
      const background = Boolean(options?.background) && !force

      // force 도 만료된 오버레이만 걷는다 — 서버가 할 일 쓰기를 곧바로 반영해도 다른 인스턴스·브라우저 캐시가 방금
      // 미룬·완료한 할 일을 옛 상태로 한 번 더 줄 수 있다. 비우면 그 행이 "미처리"로 되살아난다(120초 안전망).
      const nowMs = Date.now()
      setOverlays((current) => pruneTodayContactOverlays(current, nowMs))
      // 캐시에 강등 응답이 남아 있으면(이 수정 전 저장분 등) 그리기에는 쓰되 먼저 지운다 — 아래 조회가 캐시 적중·SWR
      // 재사용 없이 네트워크로 다시 시도한다.
      const cached = dropDegradedTodayContacts(url, getCachedAdminJson<CrmTodayContacts>(url, { cacheKey: url }))
      if (!background) {
        if (cached && !force) {
          setData(cached)
          dataScopeRef.current = scope
        } else if (!force && dataScopeRef.current !== scope) {
          // 담당 필터가 바뀌어 새 URL 캐시가 없으면 이전 범위의 목록을 남기지 않는다. 같은 범위에서 상한만 올린
          // 재조회(더 불러오기)는 받은 행을 그대로 두고 기다린다.
          setData(null)
          dataScopeRef.current = null
        }
        setLoading(!cached)
        setError(null)
      }
      setRefreshing(force)
      setRefreshWarning(null)
      try {
        const next = await adminFetchJsonCached<CrmTodayContacts>(force ? `${url}&force=1` : url, undefined, {
          cacheKey: url,
          ttlMs: TODAY_CONTACTS_TTL_MS,
          staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
          force,
          onRevalidated: ({ data: fresh }) => {
            // 백그라운드 갱신도 강등 응답이면 캐시에서 지운다(화면에는 보인다).
            dropDegradedTodayContacts(url, fresh)
            if (fresh && isLatest()) {
              setData(fresh)
              dataScopeRef.current = scope
            }
          },
        })
        // 캐시 쓰기는 요청 순서와 무관하게 이미 일어났다 — 최신 요청이 아니어도 강등 응답이면 지운다.
        dropDegradedTodayContacts(url, next)
        if (!isLatest()) return
        setData(next)
        dataScopeRef.current = next ? scope : null
      } catch (err) {
        if (!isLatest()) return
        const detail = err instanceof Error ? err.message : "오늘 연락 목록을 불러오지 못했습니다."
        if (background) {
          setRefreshWarning(`목록 갱신에 실패했습니다(${detail}). 표시된 목록은 처리 전 기준일 수 있습니다.`)
        } else {
          setError({ message: detail, retry: () => void load({ force: true }) })
        }
      } finally {
        if (isLatest()) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [scope, url]
  )

  // 홈 새로고침(refreshKey 증가)은 force. 첫 마운트에 프리페치 값이 있으면 요청 캐시에 심고 네트워크를 건너뛴다.
  // 강등 프리페치(Home 필수 원천 일부 실패)는 심지 않는다 — 화면에는 이미 보이고(useState 초기값) 바로 다시 받는다.
  const lastRefreshKey = useRef(refreshKey)
  const didInitialLoadRef = useRef(false)
  useEffect(() => {
    const forced = lastRefreshKey.current !== refreshKey
    lastRefreshKey.current = refreshKey
    if (!didInitialLoadRef.current) {
      didInitialLoadRef.current = true
      if (!forced && shouldSeedTodayContacts(prefetchSeed)) {
        seedAdminRequestCache(url, prefetchSeed, {
          ttlMs: TODAY_CONTACTS_TTL_MS,
          staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
          generatedAt: initialData?.generatedAt,
        })
        return
      }
      void load(forced ? { force: true } : undefined)
      return
    }
    void load(forced ? { force: true } : undefined)
  }, [load, refreshKey, prefetchSeed, url, initialData])

  // 홈 60초 백그라운드 틱 — force 없이, 목록·오류 배너를 건드리지 않는다.
  const lastSoftRefreshKey = useRef(softRefreshKey)
  useEffect(() => {
    if (lastSoftRefreshKey.current === softRefreshKey) return
    lastSoftRefreshKey.current = softRefreshKey
    void load({ background: true })
  }, [load, softRefreshKey])

  useEffect(
    () => () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    },
    []
  )

  // 처리 뒤 포커스 이동 — 다음 미처리 행의 첫 조작, 없으면 heading(tabIndex=-1).
  useEffect(() => {
    if (!focusRequest) return
    const node = focusRequest.key ? rowRefs.current.get(focusRequest.key) : null
    const target = node?.querySelector<HTMLElement>("button:not([disabled]), a[href]") ?? headingRef.current
    target?.focus()
  }, [focusRequest])

  const announce = useCallback((text: string) => setLiveMessage(text), [])
  const requestFocus = useCallback((key: string | null) => {
    setFocusRequest((prev) => ({ key, seq: (prev?.seq ?? 0) + 1 }))
  }, [])

  const putOverlay = useCallback(
    (
      row: TodayContactRow,
      handled: TodayContactHandled | null,
      summary: string | null,
      extra?: { openTaskIds?: string[] }
    ) => {
      const until = Date.now() + TODAY_CONTACTS_OVERLAY_MS
      const serverIndex = dataRef.current?.rows.findIndex((item) => item.key === row.key) ?? -1
      setOverlays((current) => {
        const existing = current.get(row.key)
        const next = new Map(current)
        const entry: TodayContactOverlay = {
          scope,
          row: existing?.row ?? row,
          index: serverIndex >= 0 ? serverIndex : existing?.index ?? 0,
          handled,
          summary,
          until,
        }
        if (extra?.openTaskIds) entry.openTaskIds = extra.openTaskIds
        next.set(row.key, entry)
        return next
      })
    },
    [scope]
  )
  const restoreOverlay = useCallback((key: string, saved: TodayContactOverlay | null) => {
    setOverlays((current) => {
      const next = new Map(current)
      if (saved) next.set(key, saved)
      else next.delete(key)
      return next
    })
  }, [])

  const clearUndo = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    undoTimerRef.current = null
    setUndoable(null)
  }, [])
  const offerUndo = useCallback((key: string, run: () => Promise<void>) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    const entry = { key, run }
    setUndoable(entry)
    undoTimerRef.current = setTimeout(() => {
      setUndoable((current) => (current === entry ? null : current))
    }, TODAY_CONTACTS_UNDO_WINDOW_MS)
  }, [])

  // 작성 중인 결과를 버리는 전환은 먼저 묻는다(UX 규약 1).
  const guardDraft = useCallback(
    (proceed: () => void) => {
      if (draft && isOutcomeDraftDirty(draft)) {
        setDiscardPrompt({ rowKey: draft.rowKey, onDiscard: proceed })
        return
      }
      proceed()
    },
    [draft]
  )

  // 초안을 버린다(취소·버리고 닫기·담당 변경·다른 행 처리로 넘어감). 그 행의 실패한 결과 저장 기록도 함께 버린다 —
  // 버린 뒤 다시 쓰는 저장은 새 저장이다(옛 id 를 쓰면 서버가 duplicate 로 삼켜 새 내용이 남지 않는다).
  const dropDraft = useCallback(() => {
    setDiscardPrompt(null)
    if (draft) pendingRequestsRef.current.delete(todayContactPendingKey(draft.rowKey, "contact"))
    setDraft(null)
  }, [draft])

  const toggleForm = useCallback(
    (row: TodayContactRow) => {
      guardDraft(() => {
        const closing = draft?.rowKey === row.key
        dropDraft()
        if (!closing) setDraft(createOutcomeDraft(row.key))
      })
    },
    [draft, dropDraft, guardDraft]
  )

  // ── Home 결과 기록 되돌리기(DELETE …/outcome) ──
  const undoOutcome = useCallback(
    async (
      row: TodayContactRow,
      request: TodayContactOutcomeRequest,
      response: TodayContactOutcomeResponse,
      previousFollowUpAt: string | null | undefined
    ): Promise<void> => {
      const body: TodayContactOutcomeUndoRequest = {
        requestId: request.requestId,
        target: { type: request.target.type, id: request.target.id },
        eventId: response.event?.id ?? null,
        contactLogId: response.contactLogId,
        nextTaskId: response.nextTask?.id ?? null,
        closedTaskIds: response.closedTaskIds,
      }
      if (previousFollowUpAt !== undefined) body.previousFollowUpAt = previousFollowUpAt
      setUndoPending(true)
      setError(null)
      try {
        // adminFetchJson 은 상태 코드를 오류에 싣지 않는다 — 409(서버 거절)를 가리려고 응답을 직접 읽는다.
        const httpResponse = await adminFetch(TODAY_CONTACTS_OUTCOME_API_PATH, {
          method: "DELETE",
          body: JSON.stringify(body),
        })
        const payload: unknown = await httpResponse.json().catch(() => null)
        if (!httpResponse.ok) {
          const failure = readTodayContactUndoFailure(httpResponse.status, payload, httpResponse.statusText)
          if (!failure.retryable) {
            // 서버가 되돌리기를 거절했다(이 저장의 기록이 아님·다른 작성자·10분 지남) — 다시 보내도 같은 답이라
            // "다시 시도"를 달지 않고, 되돌리기 버튼도 거둔다. 저장된 기록은 그대로다.
            clearUndo()
            const message = `'${row.title}' ${failure.message}`
            setError({ message })
            announce(message)
            // 포커스된 되돌리기 버튼이 사라진다 — 성공 경로처럼 행(없으면 heading)으로 옮겨 body 로 떨어지지 않게.
            requestFocus(row.key)
            return
          }
          throw new Error(failure.message)
        }
        const result = payload as TodayContactOutcomeUndoResponse | null
        if (!result?.ok) throw new Error(result?.warnings?.join(" ") || "되돌리기가 끝나지 않았습니다")
        clearUndo()
        putOverlay(row, null, null)
        const warnings = result.warnings ?? []
        const message = warnings.length
          ? `'${row.title}' 되돌렸지만 일부가 남았습니다 — ${warnings.join(" ")}`
          : `'${row.title}' 저장을 되돌렸습니다 — 행이 다시 열렸습니다.`
        setNotice({ tone: warnings.length ? "warning" : "success", message })
        announce(message)
        requestFocus(row.key)
        void load({ background: true })
      } catch (err) {
        const message = `되돌리기에 실패했습니다(${errorDetail(err)}). 기록은 남아 있습니다 — 고객 360 에서 확인하세요.`
        setError({ message, retry: () => void undoOutcome(row, request, response, previousFollowUpAt) })
        announce(message)
      } finally {
        setUndoPending(false)
      }
    },
    [announce, clearUndo, load, putOverlay, requestFocus]
  )

  // ── 결과 기록·미루기(POST …/outcome) — 낙관 "처리됨" 오버레이 ──
  const submitOutcome = useCallback(
    async (input: {
      row: TodayContactRow
      request: TodayContactOutcomeRequest
      handled: TodayContactHandled
      summary: string
      busy: "outcome" | "snooze"
      restoreDraft: TodayContactOutcomeDraft | null
      retry: () => void
      /** 실패하면 이 키로 requestId 를 남긴다(todayContactPendingKey) */
      pendingKey: string
      /** 이 요청의 내용 지문(todayContactRequestSignature) */
      signature: string
      /** 실패한 요청의 id 를 다시 쓰면서 내용이 달라졌는가 */
      contentChanged: boolean
    }) => {
      const { row, request, handled, summary } = input
      const focusKey = nextFocusKeyAfterHandled(visibleRowsRef.current, row.key)
      const savedOverlay = overlays.get(row.key) ?? null
      const box: { response: TodayContactOutcomeResponse | null } = { response: null }
      // 서버가 이 행의 오늘 할 일을 함께 닫는다(결과: closeTaskIds, 미루기: 오늘 할 일 전부) — 낡은 응답이 "남은 할 일"로
      // 다시 보이지 않게 오버레이에 남은 목록을 싣는다(실패하면 롤백).
      const closing = request.mode === "snooze" ? row.openTaskIds : request.closeTaskIds ?? []
      const remainingTaskIds = row.openTaskIds.filter((id) => !closing.includes(id))

      setActing({ key: row.key, busy: input.busy })
      setNotice(null)
      setError(null)
      const result = await runOptimistic<TodayContactOverlay | null>({
        snapshot: () => savedOverlay,
        apply: () => {
          putOverlay(row, handled, summary, { openTaskIds: remainingTaskIds })
          if (input.busy === "outcome") setDraft(null)
          setDiscardPrompt(null)
        },
        commit: async () => {
          box.response = await adminFetchJson<TodayContactOutcomeResponse>(TODAY_CONTACTS_OUTCOME_API_PATH, {
            method: "POST",
            body: JSON.stringify(request),
          })
        },
        rollback: (saved) => {
          restoreOverlay(row.key, saved)
          if (input.restoreDraft) setDraft(input.restoreDraft)
        },
        onError: (err) => {
          const message =
            input.busy === "outcome"
              ? `'${row.title}' 연락 결과를 저장하지 못했습니다(${errorDetail(err)}). 입력은 그대로 두었으니 다시 시도하세요.`
              : `'${row.title}' 미루기에 실패했습니다(${errorDetail(err)}). 행을 원래대로 두었습니다.`
          setError({ message, retry: input.retry })
          announce(message)
        },
      })
      setActing(null)
      const response = box.response
      if (!result.ok || !response) {
        // 다시 보낼 때(배너든 폼이든) 같은 requestId 를 쓴다 — 응답만 유실되고 서버에 저장됐을 수 있다.
        // 같은 id 의 재전송이 또 실패하면 처음 실패한 요청의 지문(그 내용이 서버에 있을 수 있는 쪽)은 두고 시각만
        // 새로 한다(마지막 시도가 반영됐을 수 있다). 다른 id(만료 뒤 새 저장)면 새로 적는다.
        const failedAtMs = Date.now()
        const existing = pendingRequestsRef.current.get(input.pendingKey)
        pendingRequestsRef.current.set(
          input.pendingKey,
          existing && existing.requestId === request.requestId
            ? { ...existing, failedAtMs }
            : { requestId: request.requestId, signature: input.signature, failedAtMs }
        )
        requestFocus(row.key)
        return
      }
      // 이 행의 상태가 바뀌었다 — 결과 저장·미루기 어느 쪽의 실패 기록도 더는 재전송 대상이 아니다.
      pendingRequestsRef.current.delete(todayContactPendingKey(row.key, "contact"))
      pendingRequestsRef.current.delete(todayContactPendingKey(row.key, "snooze"))
      // 되돌릴 팔로업은 서버가 돌려준 저장 직전 값이 정본이다(행 추정은 응답에 없을 때만 — resolveLeadUndoFollowUpAt).
      const previousFollowUpAt = resolveLeadUndoFollowUpAt(row, request, response)
      offerUndo(row.key, () => undoOutcome(row, request, response, previousFollowUpAt))
      // 모든 대상이 requestId 로 멱등이다(계정·고객·딜 sourceId, 리드 로그 id) — 실패 뒤 내용을 고쳐 다시 보냈는데
      // duplicate 면, 서버에는 처음 보낸 내용이 이미 저장돼 있었고 고친 내용은 반영되지 않았다. 서버가 같은 뜻의 경고
      // (저장된 제목 포함)를 주면 그 문구만 접두어 없이 한 번 보인다(todayContactSaveWarnings).
      const warnings = todayContactSaveWarnings({
        contentChanged: input.contentChanged,
        duplicate: response.duplicate,
        serverWarnings: response.warnings,
      })
      if (warnings.length) setNotice({ tone: "warning", message: warnings.join(" ") })
      const done = input.busy === "outcome" ? "연락 결과를 저장했습니다" : "다음 일정을 내일로 옮겼습니다"
      announce(`'${row.title}' ${done}. 8초 안에 되돌릴 수 있습니다.`)
      requestFocus(focusKey)
      void load({ background: true })
    },
    [announce, load, offerUndo, overlays, putOverlay, requestFocus, restoreOverlay, undoOutcome]
  )

  const saveOutcome = useCallback(
    (row: TodayContactRow, draftOverride?: TodayContactOutcomeDraft, retryRequestId?: string) => {
      const current = draftOverride ?? draft
      if (!current || current.rowKey !== row.key) return
      const nowMs = Date.now()
      // 폼의 준비 판정은 응답 기준 시각(basisMs)으로 그려진다 — 저장 순간의 실제 시각으로 한 번 더 본다
      // (예: 10:00 직전에 연 폼에서 10:05 에 '오늘'을 저장하면 서버가 지난 시각으로 400 을 돌려준다).
      if (outcomeDateProblem(current, nowMs) === "past") {
        const message = `'${row.title}' 다음 일정 날짜의 10:00 이 이미 지났습니다 — 내일 이후 날짜를 고르세요.`
        setError({ message })
        announce(message)
        return
      }
      if (!isOutcomeDraftReady(current, nowMs)) return
      // 실패 뒤 다시 보내면(배너 "다시 시도"든, 되살아난 폼의 "저장"이든) 같은 requestId 를 쓴다 — 응답만 유실되고
      // 서버에는 기록이 남은 경우에도 서버 멱등(sourceId 'today-contact:<requestId>'·리드 로그 id)이 duplicate 로
      // 돌려줘 기록·다음 할 일이 두 번 생기지 않는다. 새 id 는 성공(되돌리기 포함)·초안 버림·실패 기록 만료 뒤에만.
      const draftRequest = buildTodayContactOutcomeRequest({ row, draft: current, requestId: "", nowMs })
      if (!draftRequest) return
      const pendingKey = todayContactPendingKey(row.key, "contact")
      const signature = todayContactRequestSignature(draftRequest)
      const pending = pendingRequestsRef.current.get(pendingKey)
      const picked = retryRequestId
        ? { requestId: retryRequestId, contentChanged: pending?.requestId === retryRequestId ? pending.signature !== signature : false }
        : pickTodayContactRequestId(pending, signature, nowMs)
      const requestId = picked.requestId
      const request: TodayContactOutcomeRequest = { ...draftRequest, requestId }
      const nextAt = outcomeNextAt(current, nowMs)
      void submitOutcome({
        row,
        request,
        handled: { kind: "contact_logged", at: new Date(nowMs).toISOString(), by: actorName, source: "home", nextAt, approximate: false },
        summary: formatOutcomeSummary(current, nextAt, { lead: request.target.type === "lead" }),
        busy: "outcome",
        restoreDraft: current,
        retry: () => saveOutcome(row, current, requestId),
        pendingKey,
        signature,
        contentChanged: picked.contentChanged,
      })
    },
    [actorName, announce, draft, submitOutcome]
  )

  const snoozeRow = useCallback(
    (row: TodayContactRow, retryRequestId?: string) => {
      const nowMs = Date.now()
      const draftRequest = buildTodayContactSnoozeRequest({ row, requestId: "", nowMs })
      if (!draftRequest) return
      // 결과 저장과 같이 실패한 미루기의 requestId 를 다시 쓴다(성공 뒤에만 새 id).
      const pendingKey = todayContactPendingKey(row.key, "snooze")
      const signature = todayContactRequestSignature(draftRequest)
      const pending = pendingRequestsRef.current.get(pendingKey)
      const picked = retryRequestId
        ? { requestId: retryRequestId, contentChanged: pending?.requestId === retryRequestId ? pending.signature !== signature : false }
        : pickTodayContactRequestId(pending, signature, nowMs)
      const requestId = picked.requestId
      const request: TodayContactOutcomeRequest = { ...draftRequest, requestId }
      const nextAt = resolveNextPresetAt("tomorrow_9", nowMs)
      void submitOutcome({
        row,
        request,
        handled: { kind: "rescheduled", at: new Date(nowMs).toISOString(), by: actorName, source: "home", nextAt, approximate: false },
        summary: `기록 없이 미룸 → 다음 ${formatKstMonthDayTime(nextAt)}`,
        busy: "snooze",
        restoreDraft: null,
        retry: () => snoozeRow(row, requestId),
        pendingKey,
        signature,
        contentChanged: picked.contentChanged,
      })
    },
    [actorName, submitOutcome]
  )

  // ── 할 일 PATCH — 대상 없는 할 일(complete_task)과 Compass 매칭 리드에 묶인 Home 할 일(open_compass) ──
  // Home crm_tasks 만 쓴다(교차 쓰기 0). 행에 묶인 열린 할 일을 모두 닫는다(taskIdsForRow).
  const undoTask = useCallback(
    async (
      row: TodayContactRow,
      taskIds: readonly string[],
      action: "complete" | "snooze",
      dueAts: ReadonlyMap<string, string | null>,
      /** 처리 직전 이 행의 세션 요약(처리됨 문구) — 되돌린 뒤 그대로 */
      restoreSummary: string | null = null
    ): Promise<void> => {
      const taskUrl = (id: string) => `/api/admin/crm/tasks/${encodeURIComponent(id)}`
      setUndoPending(true)
      setError(null)
      const reopened = await Promise.allSettled(
        taskIds.map((id) => adminFetchJson(taskUrl(id), { method: "PATCH", body: JSON.stringify({ action: "reopen" }) }))
      )
      const reopenedIds = taskIds.filter((_, index) => reopened[index].status === "fulfilled")
      const failedIds = taskIds.filter((_, index) => reopened[index].status === "rejected")
      if (reopenedIds.length === 0) {
        setUndoPending(false)
        const failure = reopened.find((item): item is PromiseRejectedResult => item.status === "rejected")
        const message = `되돌리기에 실패했습니다(${errorDetail(failure?.reason)}). 할 일 화면에서 상태를 확인하세요.`
        setError({ message, retry: () => void undoTask(row, taskIds, action, dueAts, restoreSummary) })
        announce(message)
        return
      }
      clearUndo()
      // 처리 직전 상태로 — Compass 에서 이미 처리됨이던 행은 처리됨 그대로(null 로 강제하면 행이 다시 열린다).
      putOverlay(row, row.handled, restoreSummary, { openTaskIds: [...row.openTaskIds] })
      const count = taskIds.length > 1 ? ` ${taskIds.length.toLocaleString("ko-KR")}건` : ""
      let message =
        action === "complete"
          ? `'${row.title}' 할 일${count} 완료를 되돌렸습니다 — 다시 열린 할 일입니다.`
          : `'${row.title}' 할 일${count} 미루기를 되돌렸습니다.`
      let tone: PanelNotice["tone"] = "success"
      const problems: string[] = []
      if (failedIds.length) problems.push(`할 일 ${failedIds.length.toLocaleString("ko-KR")}건은 다시 열지 못했습니다`)
      if (action === "snooze") {
        // reopen 은 due_at 을 건드리지 않는다 — 미루기가 채운 내일 09:00 을 원래 기한(없으면 비움)으로 돌린다.
        const restoring = reopenedIds.filter((id) => dueAts.has(id))
        const restored = await Promise.allSettled(
          restoring.map((id) =>
            adminFetchJson(taskUrl(id), { method: "PATCH", body: JSON.stringify({ action: "update", dueAt: dueAts.get(id) ?? null }) })
          )
        )
        const unrestored = restored.filter((item) => item.status === "rejected").length + (reopenedIds.length - restoring.length)
        if (unrestored > 0) problems.push(`할 일 ${unrestored.toLocaleString("ko-KR")}건은 기한 복원에 실패해 내일 09:00 로 남아 있습니다`)
      }
      if (problems.length) {
        tone = "warning"
        message = `'${row.title}' 되돌렸지만 일부가 남았습니다 — ${problems.join(" · ")}.`
      }
      setUndoPending(false)
      setNotice({ tone, message })
      announce(message)
      requestFocus(row.key)
      void load({ background: true })
    },
    [announce, clearUndo, load, putOverlay, requestFocus]
  )

  const handleTask = useCallback(
    async (row: TodayContactRow, action: "complete" | "snooze") => {
      const taskIds = taskIdsForRow(row)
      if (taskIds.length === 0) return
      const nowMs = Date.now()
      const nextAt = action === "snooze" ? resolveNextPresetAt("tomorrow_9", nowMs) : null
      const savedOverlay = overlays.get(row.key) ?? null
      const savedSummary = savedOverlay && savedOverlay.scope === scope ? savedOverlay.summary : null
      // 행을 접을지(처리됨) 연 채로 둘지 — Compass 행에 할 일 밖 사유가 남으면 연 채로(할 일만 걷는다).
      const plan = planTodayContactTaskAction({
        row,
        taskIds,
        action,
        at: new Date(nowMs).toISOString(),
        by: actorName,
        nextAt,
        currentSummary: savedSummary,
      })
      const countLabel = taskIds.length > 1 ? ` ${taskIds.length.toLocaleString("ko-KR")}건` : ""
      // 접히는 행은 다음 미처리 행으로, 제자리에 남는 행(연 채로·이미 처리됨)은 그 행으로 포커스를 둔다.
      const focusKey = plan.closesRow ? nextFocusKeyAfterHandled(visibleRowsRef.current, row.key) : row.key
      const taskUrl = (id: string) => `/api/admin/crm/tasks/${encodeURIComponent(id)}`
      // 미루기 되돌리기용 원래 기한 — 행 사유로 모르는 할 일(여러 건이 한 사유로 접힌 경우)은 미루기 전에 읽는다.
      const dueAts = action === "snooze" ? knownTaskDueAts(row, taskIds) : new Map<string, string | null>()
      const box: { doneIds: string[]; failedIds: string[] } = { doneIds: [], failedIds: [] }

      setActing({ key: row.key, busy: action === "complete" ? "complete" : "snooze" })
      setNotice(null)
      setError(null)
      const result = await runOptimistic<TodayContactOverlay | null>({
        snapshot: () => savedOverlay,
        apply: () => putOverlay(row, plan.handled, plan.summary, { openTaskIds: plan.remainingTaskIds }),
        commit: async () => {
          if (action === "snooze") {
            const unknown = taskIds.filter((id) => !dueAts.has(id))
            await Promise.all(
              unknown.map(async (id) => {
                try {
                  const found = await adminFetchJson<{ task?: { dueAt?: string | null } | null }>(taskUrl(id))
                  if (found?.task) dueAts.set(id, found.task.dueAt ?? null)
                } catch {
                  // 기한을 모르면 되돌리기가 기한을 복원하지 않고 알린다(undoTask).
                }
              })
            )
          }
          const settled = await Promise.allSettled(
            taskIds.map((id) =>
              adminFetchJson(taskUrl(id), {
                method: "PATCH",
                body: JSON.stringify(action === "complete" ? { action: "complete", outcome: "오늘 연락에서 완료" } : { action: "snooze" }),
              })
            )
          )
          box.doneIds = taskIds.filter((_, index) => settled[index].status === "fulfilled")
          box.failedIds = taskIds.filter((_, index) => settled[index].status === "rejected")
          const failure = settled.find((item): item is PromiseRejectedResult => item.status === "rejected")
          if (box.doneIds.length === 0 && failure) throw failure.reason
        },
        rollback: (saved) => restoreOverlay(row.key, saved),
        onError: (err) => {
          const label = action === "complete" ? "완료" : "내일로 미루기"
          const message = `'${row.title}' ${label} 처리에 실패했습니다(${errorDetail(err)}). 행을 원래대로 두었습니다.`
          setError({ message, retry: () => void handleTask(row, action) })
          announce(message)
        },
      })
      setActing(null)
      if (!result.ok) {
        requestFocus(row.key)
        return
      }
      const doneIds = box.doneIds
      if (box.failedIds.length > 0) {
        // 일부만 처리됐다 — 행을 처리됨으로 두지 않고(남은 할 일이 있다) 남은 할 일만 다시 시도하게 한다.
        // (처리한 몫의 되돌리기는 두지 않는다 — 미처리 행에는 되돌리기 자리가 없다. 고객 360 에서 다시 열 수 있다.)
        const remaining = row.openTaskIds.filter((id) => !doneIds.includes(id))
        putOverlay(row, row.handled, savedSummary, { openTaskIds: remaining })
        const doneVerb = action === "complete" ? "완료했습니다" : "내일로 옮겼습니다"
        const message = `'${row.title}' 할 일 ${taskIds.length.toLocaleString("ko-KR")}건 중 ${doneIds.length.toLocaleString("ko-KR")}건만 ${doneVerb} — 남은 ${box.failedIds.length.toLocaleString("ko-KR")}건은 다시 시도하세요.`
        setError({ message, retry: () => void handleTask({ ...row, openTaskIds: remaining }, action) })
        announce(message)
        requestFocus(row.key)
        void load({ background: true })
        return
      }
      offerUndo(row.key, () => undoTask(row, doneIds, action, dueAts, savedSummary))
      const done = action === "complete" ? `할 일${countLabel}을 완료했습니다` : `할 일${countLabel}을 내일 09:00 로 미뤘습니다`
      // 연 채로 둔 Compass 행 — 할 일만 걷혔고 Compass 다음 액션 등은 그대로라는 것을 함께 알린다.
      const stillOpen = !row.handled && !plan.closesRow ? " 이 행의 다른 연락 사유는 그대로 남았습니다." : ""
      announce(`'${row.title}' ${done}.${stillOpen} 8초 안에 되돌릴 수 있습니다.`)
      requestFocus(focusKey)
      void load({ background: true })
    },
    [actorName, announce, load, offerUndo, overlays, putOverlay, requestFocus, restoreOverlay, scope, undoTask]
  )

  // ── 파생 값 ──
  // Home 할 일 흔적만으로 접힌 Compass 행을 다시 연 뒤(서버 판정 보정 — 상단 주석) 낙관 오버레이를 덧씌운다.
  const reopened = useMemo(() => reopenCompassRowsHandledByHomeTasks(data), [data])
  const view = useMemo(() => applyTodayContactOverlays(reopened, overlays, scope), [reopened, overlays, scope])
  const basisMs = useMemo(() => {
    const ms = view?.generatedAt ? Date.parse(view.generatedAt) : Number.NaN
    return Number.isFinite(ms) ? ms : mountNowMs
  }, [mountNowMs, view?.generatedAt])
  const keepKeys = useMemo(() => {
    const keys = new Set<string>()
    if (undoable) keys.add(undoable.key)
    if (draft) keys.add(draft.rowKey)
    return keys
  }, [draft, undoable])
  const allRows = useMemo(() => view?.rows ?? [], [view])
  const sourceCounts = useMemo(
    () => todayContactSourceChipCounts(allRows, view ? { bySource: view.counts.bySource, truncated: view.truncated.rows } : null),
    [allRows, view]
  )
  const filteredRows = useMemo(
    () => filterTodayContactRows(allRows, { source: sourceFilter, hideHandled, keepKeys }),
    [allRows, hideHandled, keepKeys, sourceFilter]
  )
  const visibleRows = useMemo(
    () => (expanded ? filteredRows : filteredRows.slice(0, TODAY_CONTACTS_PREVIEW_ROWS)),
    [expanded, filteredRows]
  )
  const hiddenCount = Math.max(0, filteredRows.length - TODAY_CONTACTS_PREVIEW_ROWS)
  useEffect(() => {
    visibleRowsRef.current = visibleRows
  }, [visibleRows])

  // 서버 상한에서 잘린 목록 — 받은 행 밖의 건수와 "더 불러오기"(최대 상한 재조회) 가능 여부.
  const truncatedRows = Boolean(view?.truncated.rows)
  const canLoadMore = truncatedRows && !wantFullList
  // 전체 행 수는 자르기 전 목록 행 수(truncated.totalRows)가 정본 — progress.total 은 같은 기관으로 접은 리드까지 센
  // 대상 수라 "불러오지 않은 N건"을 부풀린다(옛 응답만 폴백).
  const rowTotals = todayContactsRowTotals({
    truncated: view?.truncated,
    progressTotal: view?.progress.total ?? 0,
    shownRows: allRows.length,
  })
  const serverTotal = view ? rowTotals.total : 0
  const unloadedCount = rowTotals.unloaded
  const loadingMore = wantFullList && loading && data != null
  const requestFullList = useCallback(() => setFullListScope(scope), [scope])

  // 지난·오늘 할 일을 이 목록이 다 담았는지 홈에 알린다(주간 패널 숨김 버킷 — 도달성 불변). 첫 조회 중에는 알리지 않는다.
  // 담긴 할 일은 모두 행에서 닫을 수 있다(할 일 행·Compass 행 보조 버튼·처리됨 행의 남은 할 일).
  const coversTasks = todayContactsCoverTasks(view, owner)
  // 오늘·지난 Compass 다음 액션을 다 담았는지(Compass 밴드가 오늘 몫을 뺄지 — 도달성 불변).
  const coversCompassActions = todayContactsCoverCompassActions(view, owner)
  const coverageSettled = data != null || !loading
  useEffect(() => {
    if (!onCoverageChange || !coverageSettled) return
    onCoverageChange(coversTasks)
  }, [coverageSettled, coversTasks, onCoverageChange])
  useEffect(() => {
    if (!onCompassCoverageChange || !coverageSettled) return
    onCompassCoverageChange(coversCompassActions)
  }, [coverageSettled, coversCompassActions, onCompassCoverageChange])

  const progress = view?.progress ?? null
  const progressPct = progress && progress.total > 0 ? Math.round((progress.handled / progress.total) * 100) : 0
  const sources = view?.sources ?? null
  const sourcesIncomplete = todayContactsSourcesIncomplete(sources)
  const neoStale = Boolean(sources?.neoSync.stale)
  const generatedLabel = formatGeneratedLabel(view?.generatedAt)
  const filterActive = sourceFilter !== "all" || hideHandled
  // 빈 목록인데 원천 일부를 못 읽었다 — "대상 없음"이 아니라 "모름"(필터로 비운 경우는 제외).
  const emptyIsUnknown = sourcesIncomplete && !(filterActive && allRows.length > 0)
  // 내 담당이 실제 CRM 담당자로 풀렸는가 — 못 풀리면(매핑 없음·디렉터리 비정상·담당자 응답 전) 빈 목록을 "없음"이라 단언하지 않는다.
  const ownerResolved = currentOwner != null && ownerHealth?.ok !== false
  const emptyCopy = todayContactsEmptyCopy({ unknown: emptyIsUnknown, filtered: filterActive && allRows.length > 0, owner, ownerResolved })
  const emptyIsOwnerUnresolved = emptyCopy.kind === "owner_unresolved"
  const slotSummary = TODAY_CALL_SLOTS.map((slot) => `${slot.label} ${slot.quota}`).join(" · ")
  const moreLabel = todayContactsMoreLabel({ hiddenCount, unloadedCount, canLoadMore, filterActive })

  return (
    <section className="mb-4 rounded-xl border border-[#e8e8e4] bg-white p-4" aria-labelledby="crm-today-contacts-heading">
      {/* 머리: 진행률(추정) + 담당 필터·새로고침 */}
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">ClassIn Operation</p>
          <h2
            id="crm-today-contacts-heading"
            ref={headingRef}
            tabIndex={-1}
            className="mt-1 text-[18px] font-bold text-[#111110] outline-none"
          >
            오늘 연락
          </h2>
          {progress ? (
            <div className="mt-1.5 grid max-w-[560px] gap-1.5">
              <p className={`text-[13px] ${INTERACTIVE_TEXT_CLASS}`}>
                오늘 <b className="text-[20px] font-bold tabular-nums text-[#111110]">{progress.total.toLocaleString("ko-KR")}</b>건 중{" "}
                <b className="text-[20px] font-bold tabular-nums text-[#084734]">{progress.handled.toLocaleString("ko-KR")}</b>건 처리
                <span className={`ml-2 text-[12px] ${SECONDARY_TEXT_CLASS}`}>
                  남은 {progress.remaining.toLocaleString("ko-KR")}건
                  {progress.overdue > 0 ? (
                    <>
                      {" · "}
                      <span className={`font-semibold ${STATUS_TONE_TEXT_STRONG_CLASS.warning}`}>
                        기한 지남 {progress.overdue.toLocaleString("ko-KR")}
                      </span>
                    </>
                  ) : null}
                </span>
              </p>
              <div className="h-1 w-full overflow-hidden rounded-full bg-[#f0f0ec]" aria-hidden>
                <div className="h-full rounded-full bg-[#084734] transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
              </div>
              <p className={`flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] ${SECONDARY_TEXT_CLASS}`}>
                {TODAY_CALL_SLOTS.map((slot) => {
                  const lane = progress.byLane[slot.key] ?? { total: 0, handled: 0 }
                  return (
                    <span key={slot.key}>
                      {slot.label}{" "}
                      <b className="font-semibold tabular-nums text-[#111110]">
                        {lane.handled.toLocaleString("ko-KR")}/{lane.total.toLocaleString("ko-KR")}
                      </b>
                    </span>
                  )
                })}
              </p>
              <p className={`text-[11px] leading-relaxed ${SECONDARY_TEXT_CLASS}`}>
                진행률은 추정 — 아침 목록을 저장하지 않아 기록 흔적으로 셉니다
                {progress.compassHandledToday > 0
                  ? ` · Compass 에서 처리한 메타 리드 ${progress.compassHandledToday.toLocaleString("ko-KR")}건은 분모에서 뺐습니다`
                  : ""}
                {generatedLabel ? ` · 기준 ${generatedLabel}` : ""}
              </p>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`flex h-9 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] ${SECONDARY_TEXT_CLASS}`}>
            <Filter className="h-3.5 w-3.5" aria-hidden />
            <select
              value={owner}
              onChange={(event) => guardDraft(() => {
                dropDraft()
                setExpanded(false)
                setOwner(event.target.value)
              })}
              className="h-full min-w-[112px] bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
              aria-label="담당자 필터"
            >
              <option value="">담당 전체</option>
              {/* 기본값이라 늘 둔다 — 담당 매핑을 못 찾았으면 이름 대신 확인 안내(목록은 빈 채로 전체로 새지 않는다). */}
              <option value={CURRENT_OWNER_VALUE}>내 담당 · {currentOwner?.displayName ?? "담당자 연결 확인"}</option>
              {ownerOptions.map((option) => (
                <option key={option.ownerName} value={option.ownerName}>
                  {option.label}
                  {option.teamRoleLabel ? ` · ${option.teamRoleLabel}` : ""}
                  {option.count > 0 ? ` (${option.count})` : ""}
                </option>
              ))}
            </select>
          </label>
          {/* force 재조회는 이 명시 새로고침 버튼에만 남긴다(UX 규약 2). */}
          <button
            type="button"
            onClick={() => void load({ force: true })}
            disabled={refreshing}
            aria-busy={refreshing || undefined}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            새로고침
          </button>
        </div>
      </div>

      {/* 항상 마운트된 SR 통지 영역(UX 규약 7). */}
      <p role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {/* 원천 상태 — 끊김·멈춤은 "없음"과 다르다(무음 강등 금지). */}
      {sources?.compass === "down" ? (
        <CrmNoticeBanner
          tone="warning"
          className="mb-3"
          message="Compass 연결이 끊겨 Compass 다음 액션과 리드 매칭이 빠졌습니다 — 없는 것이 아니라 지금 확인할 수 없는 상태입니다. 목록은 Home 원천만으로 만들었습니다."
        />
      ) : sources?.compass === "partial" ? (
        <CrmNoticeBanner
          tone="warning"
          className="mb-3"
          message="Compass 조회 일부가 실패했습니다 — Compass 다음 액션·처리 표시가 일부 빠졌을 수 있습니다."
        />
      ) : null}
      {neoStale ? (
        <CrmNoticeBanner
          tone="warning"
          className="mb-3"
          message={`NEO 값이 ${sources?.neoSync.latestSyncedAt ? formatKstMonthDay(sources.neoSync.latestSyncedAt) : "알 수 없는 시점"} 기준입니다(자동 동기화 멈춤) — 계정 만료·잔액 행은 그 시점 값이라 이미 연장·충전한 고객이 섞여 있을 수 있습니다.`}
        />
      ) : null}
      {sources?.warnings.length ? (
        <CrmNoticeBanner tone="warning" className="mb-3" message={sources.warnings.join(" ")} />
      ) : null}
      {ownerHealth?.ok === false && ownerHealth.message ? (
        <CrmNoticeBanner tone="warning" className="mb-3" message={ownerHealth.message} />
      ) : null}
      {error ? (
        <CrmNoticeBanner
          tone="danger"
          className="mb-3"
          message={error.message}
          action={error.retry ? { label: "다시 시도", onClick: error.retry, pending: acting != null || refreshing || undoPending } : undefined}
          onDismiss={() => setError(null)}
        />
      ) : null}
      {refreshWarning ? (
        <CrmNoticeBanner
          tone="warning"
          className="mb-3"
          message={refreshWarning}
          action={{ label: "다시 시도", onClick: () => void load({ force: true }), pending: refreshing }}
          onDismiss={() => setRefreshWarning(null)}
        />
      ) : null}
      {notice ? (
        <CrmNoticeBanner tone={notice.tone} className="mb-3" message={notice.message} onDismiss={() => setNotice(null)} />
      ) : null}

      {/* 필터: 원천 칩(건수) · 처리됨 숨기기. 담당은 머리의 셀렉트(URL ?owner=). */}
      {view && allRows.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="원천 필터">
          <button
            type="button"
            aria-pressed={sourceFilter === "all"}
            onClick={() => setSourceFilter("all")}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors ${
              sourceFilter === "all" ? "border-[#084734] font-semibold text-[#084734]" : `border-[#E5E5E0] ${INTERACTIVE_TEXT_CLASS} hover:border-[#A39E98]`
            }`}
          >
            전체 원천 <span className="tabular-nums">{serverTotal.toLocaleString("ko-KR")}</span>
          </button>
          {TODAY_CONTACT_SOURCE_GROUPS.filter((group) => sourceCounts[group.key].count > 0 || sourceFilter === group.key).map((group) => (
            <button
              key={group.key}
              type="button"
              aria-pressed={sourceFilter === group.key}
              onClick={() => {
                // 잘린 목록에서 원천을 고르면 최대 상한으로 다시 받는다 — 칩 건수(서버 전체)와 보이는 행이 맞게.
                if (sourceFilter !== group.key && canLoadMore) requestFullList()
                setSourceFilter((current) => (current === group.key ? "all" : group.key))
              }}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors ${
                sourceFilter === group.key ? "border-[#084734] font-semibold text-[#084734]" : `border-[#E5E5E0] ${INTERACTIVE_TEXT_CLASS} hover:border-[#A39E98]`
              }`}
            >
              <SourceDot group={group} />
              {group.label}{" "}
              <span className="tabular-nums">
                {sourceCounts[group.key].count.toLocaleString("ko-KR")}
                {sourceCounts[group.key].more ? "+" : ""}
              </span>
            </button>
          ))}
          <button
            type="button"
            aria-pressed={hideHandled}
            onClick={() => setHideHandled((value) => !value)}
            className={`inline-flex min-h-8 items-center rounded-md border px-2.5 text-[12px] transition-colors ${
              hideHandled ? "border-[#084734] font-semibold text-[#084734]" : `border-[#E5E5E0] ${INTERACTIVE_TEXT_CLASS} hover:border-[#A39E98]`
            }`}
          >
            처리됨 숨기기
          </button>
        </div>
      ) : null}

      {/* 목록 — 데스크톱은 한 줄 격자, 모바일(<sm)은 카드. */}
      {loading && !data ? (
        <div className="space-y-2 sm:space-y-0 sm:divide-y sm:divide-[#f0f0ec] sm:border-y sm:border-[#f0f0ec]" aria-hidden>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={`sk-${index}`} className="flex items-center gap-3 rounded-xl border border-[#e8e8e4] p-3 sm:rounded-none sm:border-0">
              <div className="h-4 w-24 animate-pulse rounded bg-[#f0f0ec]" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-4 w-1/3 animate-pulse rounded bg-[#f0f0ec]" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-[#f5f5f2]" />
              </div>
            </div>
          ))}
        </div>
      ) : !view ? (
        // 실패와 "대상 없음"은 다른 상태다 — 못 불러온 것을 "없다"로 말하지 않는다.
        <div className="border-y border-[#f0f0ec] px-4 py-6 text-center">
          <p className={`text-[13px] font-semibold ${STATUS_TONE_TEXT_STRONG_CLASS.danger}`}>
            오늘 연락 목록을 불러오지 못했습니다 — 대상이 없는 것이 아니라 확인할 수 없는 상태입니다.
          </p>
          <button
            type="button"
            onClick={() => void load({ force: true })}
            disabled={refreshing}
            aria-busy={refreshing || undefined}
            className={`mt-3 inline-flex min-h-9 items-center rounded-lg border bg-white px-3 text-[12px] font-semibold disabled:opacity-50 ${STATUS_TONE_CLASS.danger}`}
          >
            다시 시도
          </button>
        </div>
      ) : visibleRows.length > 0 ? (
        <>
          <div
            className={`hidden gap-x-4 border-b border-[#f0f0ec] px-3 pb-2 text-[11px] font-semibold lg:grid lg:grid-cols-[136px_minmax(0,1fr)_128px_76px_auto] ${SECONDARY_TEXT_CLASS}`}
            aria-hidden
          >
            <span>원천 · 레인</span>
            <span>고객 · 사유</span>
            <span>마지막 연락</span>
            <span>담당</span>
            <span className="text-right">행동</span>
          </div>
          <ul aria-label="오늘 연락 목록" className="space-y-2 sm:space-y-0 sm:divide-y sm:divide-[#f0f0ec] sm:border-b sm:border-[#f0f0ec]">
            {visibleRows.map((row) => {
              const formOpen = draft?.rowKey === row.key
              const formId = `today-contact-form-${row.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`
              const busy = acting?.key === row.key ? acting.busy : null
              const overlay = overlays.get(row.key)
              const summary = overlay && overlay.scope === scope ? overlay.summary : null
              // 되돌리기는 처리됨으로 접힌 행뿐 아니라 연 채로 둔 행(Compass 행의 Home 할 일만 닫음)에도 단다.
              const undo = undoable?.key === row.key ? { pending: undoPending, onUndo: () => void undoable.run() } : null
              return (
                <TodayContactRowView
                  key={row.key}
                  row={row}
                  basisMs={basisMs}
                  neoStale={neoStale}
                  handledSummary={summary}
                  undo={undo}
                  busy={busy}
                  formOpen={formOpen}
                  formId={formId}
                  onToggleForm={() => toggleForm(row)}
                  onSnooze={() =>
                    guardDraft(() => {
                      // 확인을 거쳤으니(비었거나 버리기로 함) 열린 폼을 닫는다 — 처리된 행 아래 폼이 남지 않게.
                      dropDraft()
                      // 할 일 행·Compass 행의 Home 할 일은 할 일 PATCH(snooze) — 결과 라우트의 미루기는 리드
                      // follow_up_at 을 옮기므로 Compass 매칭 리드에 쓰지 않는다.
                      const snoozeKind = todayContactSnoozeKind(row)
                      if (snoozeKind === "task") void handleTask(row, "snooze")
                      else if (snoozeKind === "outcome") snoozeRow(row)
                    })
                  }
                  onCompleteTask={() =>
                    guardDraft(() => {
                      dropDraft()
                      void handleTask(row, "complete")
                    })
                  }
                  onOpenCustomer={onOpenCustomer}
                  rowRef={(node) => {
                    if (node) rowRefs.current.set(row.key, node)
                    else rowRefs.current.delete(row.key)
                  }}
                  form={
                    formOpen && draft ? (
                      <TodayContactOutcomeForm
                        row={row}
                        draft={draft}
                        onChange={setDraft}
                        onSubmit={() => saveOutcome(row)}
                        onCancel={() => guardDraft(dropDraft)}
                        pending={busy === "outcome"}
                        basisMs={basisMs}
                        formId={formId}
                        discardPrompt={
                          discardPrompt?.rowKey === row.key
                            ? {
                                onKeep: () => setDiscardPrompt(null),
                                onDiscard: () => {
                                  const proceed = discardPrompt.onDiscard
                                  // '버리고 닫기'는 초안을 실제로 버린다 — 다른 행 처리로 넘어가도 남기지 않는다(그 행의
                                  // 실패한 결과 저장 기록도 함께 — 버린 뒤의 저장은 새 저장).
                                  dropDraft()
                                  proceed()
                                },
                              }
                            : null
                        }
                      />
                    ) : null
                  }
                />
              )
            })}
          </ul>
          {hiddenCount > 0 || canLoadMore ? (
            <button
              type="button"
              onClick={() => {
                // 서버가 잘라 보낸 목록이면 펼치면서 최대 상한으로 다시 받는다(받은 행 안에서만 펼치면 나머지에 닿을 길이 없다).
                if (canLoadMore) {
                  requestFullList()
                  setExpanded(true)
                  return
                }
                setExpanded((value) => !value)
              }}
              aria-expanded={expanded && !canLoadMore}
              aria-busy={loadingMore || undefined}
              className={`mt-2 w-full rounded-lg border border-[#e8e8e4] bg-white py-2 text-[12px] font-semibold transition-colors hover:border-[#c8c8c4] hover:text-[#111110] ${INTERACTIVE_TEXT_CLASS}`}
            >
              {expanded && !canLoadMore ? `접기 · 처음 ${TODAY_CONTACTS_PREVIEW_ROWS}건만` : moreLabel}
            </button>
          ) : null}
        </>
      ) : (
        <div
          className="border-y border-[#f0f0ec] px-4 py-6 text-center"
          data-today-contacts-empty={emptyIsUnknown ? "unknown" : emptyIsOwnerUnresolved ? "owner_unresolved" : "none"}
        >
          {/* 원천 일부를 못 읽었거나 내 담당 연결을 확인하지 못했으면 빈 목록은 "없음"이 아니라 "모름"이다 — 위 경고 배너·
              담당 선택("담당자 연결 확인")과 모순되는 단언을 하지 않는다. */}
          <p
            className={`text-[13px] font-semibold ${emptyIsUnknown || emptyIsOwnerUnresolved ? STATUS_TONE_TEXT_STRONG_CLASS.warning : "text-[#111110]"}`}
          >
            {emptyCopy.title}
          </p>
          <p className={`mt-1 text-[12px] ${SECONDARY_TEXT_CLASS}`}>{emptyCopy.detail}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            {emptyIsUnknown ? (
              <button
                type="button"
                onClick={() => void load({ force: true })}
                disabled={refreshing}
                aria-busy={refreshing || undefined}
                className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
              >
                새로고침
              </button>
            ) : null}
            {filterActive && allRows.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setSourceFilter("all")
                  setHideHandled(false)
                }}
                className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
              >
                필터 풀기
              </button>
            ) : owner ? (
              <button
                type="button"
                onClick={() => setOwner("")}
                className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
              >
                담당 전체로 보기
              </button>
            ) : null}
            <Link
              href="/admin/crm/customers/unified"
              className={`inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] ${INTERACTIVE_TEXT_CLASS}`}
            >
              고객DB에서 찾아보기
            </Link>
          </div>
        </div>
      )}

      {/* 메타 광고 리드 — 사유가 첫 응답뿐인 메타 리드는 목록 대신 이 밴드로(건수·오늘·상위 4). 응대는 Compass 에서. */}
      {view && view.meta.total > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-[#f0f0ec] pt-3 text-[12px]">
          <span className="font-semibold text-[#111110]">
            메타 광고 리드 <span className="tabular-nums">{view.meta.total.toLocaleString("ko-KR")}</span>건
          </span>
          <span className={SECONDARY_TEXT_CLASS}>
            오늘 첫 응답 <span className="tabular-nums">{view.meta.today.toLocaleString("ko-KR")}</span>건 · 응대는 Compass 에서
          </span>
          {view.meta.top.map((item) =>
            item.compass ? (
              <CompassOpenLink
                key={item.key}
                href={item.compass.url}
                compassLeadId={item.compass.leadId}
                name={item.title}
                label={item.title}
                variant="inline"
                className="max-w-[180px] [&>span]:truncate"
              />
            ) : (
              <Link key={item.key} href={todayContactHomeHref(item)} className={`max-w-[180px] truncate font-medium underline-offset-2 hover:underline ${INTERACTIVE_TEXT_CLASS}`}>
                {item.title}
              </Link>
            )
          )}
          {view.meta.total > view.meta.top.length ? (
            <span className={`tabular-nums ${SECONDARY_TEXT_CLASS}`}>+{(view.meta.total - view.meta.top.length).toLocaleString("ko-KR")}</span>
          ) : null}
          <Link
            href="/admin/crm/customers/leads?group=meta&filter=unresponded"
            className="ml-auto shrink-0 text-[12px] font-semibold text-[#084734] underline-offset-2 hover:underline"
          >
            메타 리드만 보기
          </Link>
        </div>
      ) : null}

      {/* 판단 근거·범위 한 줄 — 끼워 넣기 순서, 잘린 건수, 오래된 Compass 다음 액션. */}
      {view ? (
        <p className={`mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] ${SECONDARY_TEXT_CLASS}`}>
          <span>{slotSummary} 순서로 섞어 보여 줍니다</span>
          {view.truncated.rows ? (
            <span data-today-contacts-truncated={view.truncated.limit}>
              · 상위 {view.truncated.limit.toLocaleString("ko-KR")}건까지만 불러왔습니다(오늘 전체 {serverTotal.toLocaleString("ko-KR")}건)
              {canLoadMore ? (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={requestFullList}
                    className="inline-flex min-h-8 items-center font-semibold text-[#084734] underline underline-offset-2"
                  >
                    최대 {TODAY_CONTACTS_MAX_LIMIT.toLocaleString("ko-KR")}건까지 불러오기
                  </button>
                </>
              ) : loadingMore ? (
                " · 더 불러오는 중"
              ) : (
                // 최대 상한에서도 잘렸다 — 주간 할 일 패널이 지난·오늘 할 일을 다시 보인다(onCoverageChange).
                " — 나머지는 아래 할 일 목록·고객DB에서 확인하세요"
              )}
            </span>
          ) : null}
          {view.counts.compassOverdueBeyondLookback > 0 ? (
            <span>
              · 14일 넘게 지난 Compass 다음 액션 {view.counts.compassOverdueBeyondLookback.toLocaleString("ko-KR")}건은 목록에 올리지 않았습니다 — Compass 에서 정리
            </span>
          ) : null}
          <Link href="/admin/crm/customers/unified" className="font-semibold text-[#084734] underline-offset-2 hover:underline">
            전체는 고객DB에서 보기
          </Link>
        </p>
      ) : null}
    </section>
  )
}
