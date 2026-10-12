// Compass 다음 액션 — 현황 "오늘 연락"(C안 ①, 2026-09-25)이 쓰는 순수 판정 모듈. 클라이언트·서버·테스트 공용
// ("server-only" 없음, I/O 없음). 원천 조회는 lib/compass/bridge.ts getCompassNextActionsInRange 가 한다.
//
// 계약(Compass → Home 단방향 읽기):
//  * 다음 액션 문구(next_action)는 **표시 전용**이다 — 최대 60자로 잘라 응답에만 싣고, Home DB·CSV·Data Cache 에
//    복제하지 않는다(lib/compass/overlay.ts "장문 비복제" 계약의 좁은 예외: 요약 밴드 선례 summary-contract.ts).
//  * 열린 액션 = 종료(lost) 단계가 아니고 케어 종료(care_stage closed)가 아닌 행. 결제(won) 뒤 케어 액션은 연락이라 남긴다.
//  * 기한 구분은 KST 달력일이다(한국은 DST 가 없어 +9h 고정) — 오늘 00:00 전이면 지남, 오늘 끝 전이면 오늘.

const DAY_MS = 24 * 60 * 60 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** 지난 다음 액션을 목록에 올리는 최대 일수 — 더 오래된 건은 건수만("Compass 에서 정리"). */
export const COMPASS_NEXT_ACTION_LOOKBACK_DAYS = 14
/** 다음 액션 문구 표시 상한(글자) — 통합 담당 결정(2026-09-25): 60자로 잘라 표시만. */
export const COMPASS_NEXT_ACTION_TEXT_MAX = 60

export type CompassDue = "overdue" | "today" | "later"

/** 판정에 쓰는 최소 필드 — CompassNextActionRow·CompassLeadIndexRow·CompassLeadRow 가 그대로 만족한다. */
export interface CompassActionLike {
  stage?: string | null
  care_stage?: string | null
  owner?: string | null
  caller?: string | null
  bd_owner?: string | null
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function kstDayIndex(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS)
}

/** 열린 다음 액션인가 — 종료(lost)·케어 종료(care_stage closed)는 닫힌 것으로 본다. */
export function isOpenCompassAction(row: Pick<CompassActionLike, "stage" | "care_stage">): boolean {
  if (trimOrNull(row.stage) === "lost") return false
  if (trimOrNull(row.care_stage) === "closed") return false
  return true
}

/** Compass 책임자 표시 이름 — BD 단계면 bd_owner 우선, 그 밖은 caller → owner(요약 summary.ts 담당 행과 같은 순서). */
export function compassResponsibleName(row: CompassActionLike): string | null {
  if (trimOrNull(row.stage) === "bd") {
    return trimOrNull(row.bd_owner) ?? trimOrNull(row.caller) ?? trimOrNull(row.owner)
  }
  return trimOrNull(row.caller) ?? trimOrNull(row.owner)
}

/** Compass 담당 이름들(caller·owner·bd_owner)을 담당 필터 키(소문자·trim)로 — Home ownerKeys 와 이름으로 비교한다(추정 매칭). */
export function compassOwnerKeys(row: CompassActionLike): string[] {
  const keys = [row.caller, row.owner, row.bd_owner]
    .map((value) => trimOrNull(value)?.toLowerCase() ?? null)
    .filter((value): value is string => Boolean(value))
  return [...new Set(keys)]
}

/** 담당 필터 키 집합과 Compass 담당(caller·owner·bd_owner) 중 하나라도 겹치는가. 필터가 비면 true. */
export function matchCompassOwner(row: CompassActionLike, ownerKeys: ReadonlySet<string>): boolean {
  if (ownerKeys.size === 0) return true
  return compassOwnerKeys(row).some((key) => ownerKeys.has(key))
}

/** 다음 액션 시각 → 지남(오늘 00:00 KST 이전) · 오늘 · 이후. 시각을 읽을 수 없으면 null. */
export function bucketCompassDue(nextActionAt: string | null | undefined, nowMs: number): CompassDue | null {
  if (!nextActionAt) return null
  const ms = new Date(nextActionAt).getTime()
  if (Number.isNaN(ms)) return null
  const delta = kstDayIndex(ms) - kstDayIndex(nowMs)
  if (delta < 0) return "overdue"
  if (delta === 0) return "today"
  return "later"
}

/** 오늘(KST)보다 며칠 지났는가 — 오늘·미래는 0. */
export function compassDueOverdueDays(nextActionAt: string | null | undefined, nowMs: number): number {
  if (!nextActionAt) return 0
  const ms = new Date(nextActionAt).getTime()
  if (Number.isNaN(ms)) return 0
  return Math.max(0, kstDayIndex(nowMs) - kstDayIndex(ms))
}

/** 지난 다음 액션 목록 창을 넘었는가(오늘 기준 LOOKBACK 일보다 더 지났다) — 목록에 올리지 않고 건수만 센다. */
export function isBeyondCompassLookback(
  nextActionAt: string | null | undefined,
  nowMs: number,
  lookbackDays: number = COMPASS_NEXT_ACTION_LOOKBACK_DAYS
): boolean {
  return compassDueOverdueDays(nextActionAt, nowMs) > lookbackDays
}

// 국내 전화 모양(0 으로 시작 · 구분자 선택) — 앞뒤가 숫자면 긴 번호의 일부라 건드리지 않는다.
const PHONE_IN_TEXT_PATTERN = /(?<!\d)(0\d{1,2})[-.\s]?(\d{3,4})[-.\s]?(\d{4})(?!\d)/g
const EMAIL_IN_TEXT_PATTERN = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g

/**
 * 자유 문구 속 연락처를 가린다 — 전화는 "010-****-5678", 이메일은 "***@도메인". 다음 액션 문구는 Compass 사람이 적은
 * 자유 입력이라 번호가 섞일 수 있다. 오늘 연락 응답은 연락처 원문을 싣지 않는다(계약: today-contact-types.ts).
 */
export function maskContactsInText(text: string): string {
  return text
    .replace(PHONE_IN_TEXT_PATTERN, (_match, head: string, _middle: string, tail: string) => `${head}-****-${tail}`)
    .replace(EMAIL_IN_TEXT_PATTERN, (_match, domain: string) => `***@${domain}`)
}

/** 다음 액션 문구를 표시용으로 자른다(공백 정리 · 연락처 가림 후 max 글자, 넘치면 말줄임). 비면 null. */
export function truncateCompassNextActionText(
  text: string | null | undefined,
  max: number = COMPASS_NEXT_ACTION_TEXT_MAX
): string | null {
  const collapsed = text?.replace(/\s+/g, " ").trim()
  if (!collapsed) return null
  const normalized = maskContactsInText(collapsed)
  const chars = Array.from(normalized)
  if (chars.length <= max) return normalized
  return `${chars.slice(0, Math.max(1, max - 1)).join("")}…`
}
