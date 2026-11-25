// REV 시트('2. REV') 고정 스위치 — 순수 모듈(클라이언트 겸용 — server-only 금지).
//
// 왜(D5, 2026-11-25 결정): 2026-12-01 00:00 KST 에 '2. REV' 탭을 잠근다. 그 뒤 새 매출의 원본은 장부
// (branch_sales_ledger_entries)이고 시트는 12/1 스냅샷으로만 남는다. 이 스위치 하나가 서버의 세 곳을 바꾼다.
//   1) 시트 쓰기 — BRANCH_REV_SHEET_WRITE_ENABLED 와 상관없이 꺼짐(sheet-writeback/config.ts).
//   2) 동기화 — 크론·수동 모두 REV 읽기·장부 임포트 재캡처를 건너뛰고 DSH·KPI·하드웨어만 읽는다(sync/run-all.ts).
//      관리자의 "12/1 스냅샷 다시 읽기"(POST /api/admin/branch/sync { revSnapshotReread: true })만 예외다.
//   3) 화면 — GET /api/admin/branch/ledger-drafts 의 sheetWrite.lock 으로 장부 머리 한 줄·버튼 문구를 바꾼다.
//
// env BRANCH_REV_SHEET_LOCKED_AT=YYYY-MM-DD(KST 날짜). 그날 0시(KST)부터 active 다 — 날짜 기반이라 당일 배포가 필요 없다.
// 상태: unset(없음) · invalid(형식 틀림 — 경고 한 번, 그다음은 unset 과 같다) · scheduled(날짜 전) · active(날짜 당일·이후).
// unset·invalid·scheduled 는 지금 동작과 똑같다 — 새 갈래는 전부 active 에서만 켜진다.
//
// 브라우저 번들에서는 이 env 가 없어 currentRevSheetLock() 이 늘 unset 이다. 화면은 GET 의 sheetWrite.lock 을 쓴다.

import { getBusinessDateParts } from "@/lib/business-time"

export const REV_SHEET_LOCK_ENV = "BRANCH_REV_SHEET_LOCKED_AT"

export type RevSheetLockState = "unset" | "invalid" | "scheduled" | "active"

export interface RevSheetLock {
  state: RevSheetLockState
  /** 고정 날짜 YYYY-MM-DD(KST). scheduled·active 만 채운다. */
  lockedAt: string | null
  /** 고정 날짜의 달 YYYY-MM. 이 달부터 DSH 실적을 장부에서 계산한다(D4). scheduled·active 만 채운다. */
  lockMonth: string | null
}

export type ActiveRevSheetLock = RevSheetLock & { state: "active"; lockedAt: string; lockMonth: string }

/** 화면·응답에 싣는 모양(GET ledger-drafts sheetWrite.lock · batch 응답). unset·invalid 는 null. */
export interface RevSheetLockView {
  lockedAt: string
  active: boolean
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const UNSET: RevSheetLock = { state: "unset", lockedAt: null, lockMonth: null }
const INVALID: RevSheetLock = { state: "invalid", lockedAt: null, lockMonth: null }

/** 실제 달력 날짜인가(2026-02-30·2026-13-01 거절) — UTC 왕복으로 본다. */
function isCalendarDate(value: string): boolean {
  const match = YMD_RE.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// 같은 잘못된 값으로 요청마다 로그가 쌓이지 않게 값마다 한 번만 경고한다(인스턴스 단위).
const warnedInvalidValues = new Set<string>()

/**
 * env 원문과 오늘(KST YYYY-MM-DD)로 고정 상태를 정한다. 앞뒤 공백은 지운다. 형식이 틀리면 한 번 경고하고 invalid
 * (지금 동작과 같다 — 오타 하나로 REV 읽기가 멈추지 않게 fail open). 오늘이 날짜 이상이면 active(문자열 비교).
 */
export function resolveRevSheetLock(raw: string | null | undefined, todayKstDate: string): RevSheetLock {
  const value = typeof raw === "string" ? raw.trim() : ""
  if (!value) return UNSET
  if (!isCalendarDate(value)) {
    if (!warnedInvalidValues.has(value)) {
      warnedInvalidValues.add(value)
      console.warn(
        `[branch/rev-sheet-lock] ${REV_SHEET_LOCK_ENV} 값이 YYYY-MM-DD 날짜가 아니라 무시합니다 — 시트 고정 없이 지금처럼 동작합니다`,
      )
    }
    return INVALID
  }
  return { state: todayKstDate >= value ? "active" : "scheduled", lockedAt: value, lockMonth: value.slice(0, 7) }
}

export function isRevSheetLockActive(lock: RevSheetLock | null | undefined): lock is ActiveRevSheetLock {
  return lock?.state === "active" && typeof lock.lockedAt === "string" && typeof lock.lockMonth === "string"
}

/** 지금 서버의 고정 상태. 오늘은 KST 업무일(lib/business-time) — UTC 날짜를 쓰면 12/1 0~9시가 11/30 으로 읽힌다. */
export function currentRevSheetLock(now: Date = new Date()): RevSheetLock {
  // process.env.X 를 리터럴로 읽는다 — 변수 키로 바꾸면 번들러가 env 를 못 찾아 조용히 unset 이 된다(config.ts 와 같은 이유).
  return resolveRevSheetLock(process.env.BRANCH_REV_SHEET_LOCKED_AT, getBusinessDateParts(now).date)
}

/** 응답에 싣는 모양 — scheduled·active 만, 나머지는 null. */
export function revSheetLockView(lock: RevSheetLock | null | undefined): RevSheetLockView | null {
  if (!lock || (lock.state !== "scheduled" && lock.state !== "active") || !lock.lockedAt) return null
  return { lockedAt: lock.lockedAt, active: lock.state === "active" }
}

function monthDay(lockedAt: string): { month: number; day: number } {
  const match = YMD_RE.exec(lockedAt.trim())
  if (!match) return { month: 0, day: 0 }
  return { month: Number(match[2]), day: Number(match[3]) }
}

/** "2026-12-01" → "12월 1일". */
export function formatLockDayLabel(lockedAt: string): string {
  const { month, day } = monthDay(lockedAt)
  return `${month}월 ${day}일`
}

/** "2026-12-01" → "12/1". */
export function formatLockDayShort(lockedAt: string): string {
  const { month, day } = monthDay(lockedAt)
  return `${month}/${day}`
}

/** 동기화 건강에서 REV 자리에 보이는 라벨 — "12/1 고정"(stale·실패로 보지 않는다). */
export function revSheetFrozenLabel(lockedAt: string): string {
  return `${formatLockDayShort(lockedAt)} 고정`
}

/** 장부 머리의 조용한 한 줄 — "시트는 12월 1일 기준으로 고정 — 이후 원본은 장부". */
export function revSheetLockNotice(lockedAt: string): string {
  return `시트는 ${formatLockDayLabel(lockedAt)} 기준으로 고정 — 이후 원본은 장부`
}

/** 관리자 버튼 — "12/1 스냅샷 다시 읽기". */
export function revSnapshotRereadLabel(lockedAt: string): string {
  return `${formatLockDayShort(lockedAt)} 스냅샷 다시 읽기`
}

/**
 * 고정 중 REV 를 건너뛴 동기화의 결과 문구(sync-outcome 의 describeSyncOutcome 이 쓴다).
 * ran 은 실제로 돌린 부분 — dsh 와 hw 를 함께 돌렸으면 "DSH·KPI·하드웨어", dsh 만이면 "DSH·KPI".
 */
export function revLockedSyncNote(lockedAt: string, ran: ReadonlyArray<string>): string {
  const read = ran.includes("dsh") && ran.includes("hw") ? "DSH·KPI·하드웨어" : ran.includes("hw") ? "하드웨어" : "DSH·KPI"
  return `${read}만 읽었습니다(REV 시트는 ${formatLockDayLabel(lockedAt)} 기준으로 고정돼 다시 읽지 않음)`
}

/**
 * 시트에 쓴 정정의 장부 되돌리기를 막을 때의 고정 뒤 문구(F-22) — 시트에서 직접 되돌릴 수 없으므로 장부에서 원래 값을
 * 다시 넣는 길만 안내한다. 가드 판정(sheet-writeback/ledger-rules.ts sheetWriteBlocksReverse)은 고정 전후가 같고,
 * 고정 전 문구는 sheet-writeback/messages.ts SHEET_WRITTEN_REVERSE_MESSAGE 다. 라우트 409 와 큐 버튼 title 이 같이 쓴다.
 */
export function sheetWrittenReverseLockedMessage(lockedAt: string): string {
  return `시트는 ${formatLockDayLabel(lockedAt)} 기준으로 고정돼 되돌릴 수 없습니다 — 장부에서 원래 값으로 다시 입력하세요`
}

/** "12/1 스냅샷 다시 읽기" 성공 문구. */
export function revSnapshotRereadDoneNote(lockedAt: string): string {
  return `${formatLockDayShort(lockedAt)} 스냅샷을 다시 읽었습니다 — 장부 기준값을 방금 읽은 시트 값으로 바꿨습니다`
}
