import { getBusinessCalendarParts } from "@/lib/business-time"

// REV 시트 색 규칙: 주차 칸 빨간 글자 = 확정 매출, 파란 글자 = 클로징 임박(90%+).
// 파서가 monthly_confirmed / monthly_high_conf 에 월별 "금액"으로 분해해 둔다.
// monthly_red(boolean)는 금액 컬럼 도입 전 동기화분 호환용으로만 본다.
//
// ⚠️ 이 모듈이 '확정 매출' 정의의 유일한 SSOT다(2026-07-10 운영 캐논 확정 — 마스터플랜 §7).
// 장부(summary/pipeline/heatmap)·CRM(revenue/performance/rev-sheet 워크스페이스)·주간마감이
// 전부 이 함수를 소비해야 표면 간 수치가 일치한다. 새 표면에서 monthly_confirmed 맵을
// 직접 합산하지 말 것 — red-불리언·무색상 폴백이 빠져 과소집계된다.
//
// 읽는 시점 판정(2026-11-25, 12/1 시트 잠금 준비 — F-08·F-09):
// - 시간에 따라 바뀌는 판정은 전부 여기서, 읽는 시점의 KST 영업일로 한다. 파싱·캡처 시점에 굳히지 않는다.
//   ① 빨간 금액인데 그 주가 아직 시작 안 한 칸(raw.pendingCells)은 시작일(KST)부터 확정, 그 전에는 예정.
//      시트 동기화가 멈춰도(잠금) 그 주가 오면 확정이 된다 — 다시 파싱할 필요가 없다.
//   ② 색 데이터가 전혀 없는 행은 이번 KST 영업월 "이전" 달만 확정(이번 달·다음 달은 예정).
// - 임포트(branch_rev_lines + period entries)와 미러(branch_rev_deals)가 같은 입력을 내므로 두 경로가 같다.
// - 적어 둔 월 칸이 주차 합과 다른 달(raw.monthWeekMismatch, F-15)은 확정·고확도를 월 합계 안으로 자른다.

// BranchRevDeal 전체가 아니라 확도 판정에 필요한 최소 구조만 요구한다.
// CRM 쪽 시트 행 타입(SheetRevDealRow 등)도 그대로 넘길 수 있다.
export interface RevConfidenceSource {
  monthly_red?: Record<string, boolean> | null
  monthly_confirmed?: Record<string, number> | null
  monthly_high_conf?: Record<string, number> | null
  /**
   * 시트 원천 raw(BranchRevDeal.raw). 캐논은 pendingCells(읽는 시점 확정 전환)·monthWeekMismatch(월≠주 합)만 읽는다.
   * 없으면(raw 를 읽지 않은 경로·이 필드 전에 저장된 행) 예전 규칙 그대로다.
   */
  raw?: Record<string, unknown> | null
}

/**
 * 아직 시작하지 않은 주차의 빨간 금액 한 칸(예정) — parseRev 가 raw.pendingCells[YYYY-MM] 에 싣는다.
 * week 0 = 월 합계 칸(주차 없이 월 칸만 빨간 행). start = 그 칸의 시작일(KST 'YYYY-MM-DD').
 */
export interface RevPendingCell {
  week: number
  start: string
  amount: number
}
export type RevPendingCells = Record<string, RevPendingCell[]>

/** 적어 둔 월 칸(month)이 주차 칸 합(weeks)과 다르다 — parseRev 가 raw.monthWeekMismatch[YYYY-MM] 에 싣는다. */
export interface RevMonthWeekMismatch {
  month: number
  weeks: number
}

/** 읽는 시점 — KST 영업일과 그 달. */
export interface RevReadDate {
  ym: string
  date: string
}

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const YMD_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/** 지금의 KST 영업일 — 읽는 시점 기본값. */
export function businessReadDate(now: Date = new Date()): RevReadDate {
  const { year, month, day } = getBusinessCalendarParts(now)
  const ym = `${year}-${String(month).padStart(2, "0")}`
  return { ym, date: `${ym}-${String(day).padStart(2, "0")}` }
}

/**
 * 캐논의 '오늘' 인자 해석. 'YYYY-MM-DD'(KST 영업일, 권장)면 그날. 'YYYY-MM'(예전 todayYm)이면 그 달 —
 * 빨간 예정 칸의 확정 전환일은 그 달이 지금의 영업월이면 오늘, 아니면 그 달 1일로 본다(미래를 확정으로 올리지 않는다).
 * 없거나 형식이 틀리면 지금의 KST 영업일.
 */
export function resolveRevReadDate(today?: string | null, now: Date = new Date()): RevReadDate {
  if (typeof today === "string") {
    if (YMD_RE.test(today)) return { ym: today.slice(0, 7), date: today }
    if (YM_RE.test(today)) {
      const current = businessReadDate(now)
      return today === current.ym ? current : { ym: today, date: `${today}-01` }
    }
  }
  return businessReadDate(now)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

function validPendingCell(value: unknown): RevPendingCell | null {
  if (!isRecord(value)) return null
  const { week, start, amount } = value
  if (typeof start !== "string" || !YMD_RE.test(start)) return null
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null
  return { week: typeof week === "number" && Number.isFinite(week) ? week : 0, start, amount }
}

function pendingCellsForMonth(raw: unknown, ym: string): RevPendingCell[] {
  if (!isRecord(raw)) return []
  const map = raw.pendingCells
  if (!isRecord(map)) return []
  const cells = map[ym]
  if (!Array.isArray(cells)) return []
  const out: RevPendingCell[] = []
  for (const cell of cells) {
    const valid = validPendingCell(cell)
    if (valid) out.push(valid)
  }
  return out
}

function validMismatch(value: unknown): RevMonthWeekMismatch | null {
  if (!isRecord(value)) return null
  const { month, weeks } = value
  if (typeof month !== "number" || !Number.isFinite(month)) return null
  if (typeof weeks !== "number" || !Number.isFinite(weeks)) return null
  return { month, weeks }
}

function hasMonthWeekMismatch(d: RevConfidenceSource, ym: string): boolean {
  const raw = d.raw
  if (!isRecord(raw) || !isRecord(raw.monthWeekMismatch)) return false
  return validMismatch(raw.monthWeekMismatch[ym]) != null
}

/** raw.pendingCells 검증본(형식이 틀린 칸은 버린다). 없으면 null. */
export function readRevPendingCells(raw: unknown): RevPendingCells | null {
  if (!isRecord(raw) || !isRecord(raw.pendingCells)) return null
  const out: RevPendingCells = {}
  for (const ym of Object.keys(raw.pendingCells)) {
    if (!YM_RE.test(ym)) continue
    const cells = pendingCellsForMonth(raw, ym)
    if (cells.length > 0) out[ym] = cells
  }
  return Object.keys(out).length > 0 ? out : null
}

/** raw.monthWeekMismatch 검증본. 없으면 null. */
export function readRevMonthWeekMismatch(raw: unknown): Record<string, RevMonthWeekMismatch> | null {
  if (!isRecord(raw) || !isRecord(raw.monthWeekMismatch)) return null
  const out: Record<string, RevMonthWeekMismatch> = {}
  for (const [ym, value] of Object.entries(raw.monthWeekMismatch)) {
    const valid = YM_RE.test(ym) ? validMismatch(value) : null
    if (valid) out[ym] = valid
  }
  return Object.keys(out).length > 0 ? out : null
}

/** 행(camelCase)에 실어 클라이언트로 보낼 읽는 시점 판정 재료. 없으면 키를 싣지 않는다. */
export interface RevReadTimeFields {
  pendingCells?: RevPendingCells
  monthWeekMismatch?: Record<string, RevMonthWeekMismatch>
}

/** deal.raw → 행 필드(pendingCells·monthWeekMismatch). 파이프라인 행이 캐논에 같은 재료를 넘기게 한다. */
export function revReadTimeFields(raw: unknown): RevReadTimeFields {
  const out: RevReadTimeFields = {}
  const pendingCells = readRevPendingCells(raw)
  if (pendingCells) out.pendingCells = pendingCells
  const mismatch = readRevMonthWeekMismatch(raw)
  if (mismatch) out.monthWeekMismatch = mismatch
  return out
}

export function dealHasColorData(d: RevConfidenceSource): boolean {
  return (
    Object.keys(d.monthly_red ?? {}).length > 0 ||
    Object.keys(d.monthly_confirmed ?? {}).length > 0 ||
    Object.keys(d.monthly_high_conf ?? {}).length > 0
  )
}

function monthAmount(values: Record<string, number> | null | undefined, ym: string): number | null {
  const value = values?.[ym]
  if (value == null) return null
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

/**
 * 그 달 확정 맵 금액 + 읽는 날까지 시작한 예정 칸 금액. 확정 맵에 그 달 키가 없으면 null —
 * 파서는 예정 칸이 있는 달에 늘 확정 키(0 포함)를 둔다. 키가 지워진 달(장부 정정이 달을 갈아 끼운 행)의
 * 예정 칸은 올리지 않는다(그 달 금액은 이미 시트 값이 아니다).
 */
function effectiveConfirmed(d: RevConfidenceSource, ym: string, at: RevReadDate): number | null {
  const fromMap = monthAmount(d.monthly_confirmed, ym)
  if (fromMap == null) return null
  let promoted = 0
  for (const cell of pendingCellsForMonth(d.raw, ym)) {
    if (cell.start <= at.date) promoted += cell.amount
  }
  return fromMap + promoted
}

function isSignedMonth(total: number, confirmed: number, highConfidence: number): boolean {
  return total < 0 || confirmed < 0 || highConfidence < 0 || (total === 0 && (confirmed !== 0 || highConfidence !== 0))
}

// 월 합계(total)와 같은 부호 쪽으로, 크기는 |total| 안으로 자른다.
function clampToTotal(value: number, total: number): number {
  return total >= 0 ? Math.min(Math.max(value, 0), total) : Math.max(Math.min(value, 0), total)
}

function confirmedAt(d: RevConfidenceSource, ym: string, total: number, hasColor: boolean, at: RevReadDate): number {
  const fromMap = effectiveConfirmed(d, ym, at)
  if (fromMap != null) {
    if (hasMonthWeekMismatch(d, ym)) return clampToTotal(fromMap, total)
    return isSignedMonth(total, fromMap, monthAmount(d.monthly_high_conf, ym) ?? 0) ? fromMap : Math.min(total, fromMap)
  }
  if (d.monthly_red?.[ym]) return total
  if (!hasColor && ym < at.ym) return total
  return 0
}

// 해당 월(ym) 납부액(total) 중 확정 매출로 집계할 금액.
// 1순위: 명시 monthly_confirmed 금액(0·환불 포함) + 읽는 날까지 시작한 빨간 예정 칸. 양수 전용 자료만 월 합계로
//   클램프한다. 음수·순액 0 상계에서는 색별 금액이 순액을 넘을 수 있어 원본 부호를 보존한다.
//   월 칸 ≠ 주차 합으로 표시된 달은 월 합계 안으로 자른다(F-15 — 월 0 · 주차 빨강 500 이 확정 500 이 되지 않게).
// 2순위: monthly_red=true 면 그 달 전액 확정 (금액 컬럼 도입 전 동기화분 호환)
// 3순위: 색 데이터가 전혀 없는 행은 이번 KST 영업월 이전 달만 전액 확정 fallback(읽는 시점 평가).
//   이번 달·미래 월까지 확정으로 올리면 매출이 부풀려진다 — 2026-07-10 실측: 미러 398행 중
//   무색상 310행, 그중 201행에 미래 월 금액 ¥492.9만이 걸려 있었다.
export function confirmedMonthAmount(d: RevConfidenceSource, ym: string, total: number, today?: string): number {
  return confirmedMonthAmountWithColor(d, ym, total, dealHasColorData(d), today)
}

// confirmedMonthAmount와 동일하되, dealHasColorData(d) 결과를 호출자가 미리 계산해
// 넘긴다. 한 딜의 여러 월을 순회할 때(예: pipeline.ts) 딜당 한 번만 색 데이터 스캔을
// 하도록 hoisting 하기 위한 진입점 — 결과는 confirmedMonthAmount와 바이트 동일하다.
// today: 읽는 시점(KST 'YYYY-MM-DD' 권장, 'YYYY-MM' 도 받는다 — resolveRevReadDate). 없으면 지금의 KST 영업일.
export function confirmedMonthAmountWithColor(
  d: RevConfidenceSource,
  ym: string,
  total: number,
  hasColor: boolean,
  today?: string,
): number {
  return confirmedAt(d, ym, total, hasColor, resolveRevReadDate(today))
}

export interface MonthConfidenceSplit {
  confirmed: number
  highConfidence: number
  expected: number
}

// 한 달 납부액(total)의 확도 3분해 — confirmed는 위 캐논, highConfidence는 확정을 뺀
// 잔여를 넘지 않게 클램프, 나머지가 expected. 음수·순액 0 상계는 원본 부호와 합계를 보존한다.
// 월 칸 ≠ 주차 합인 달은 확정·고확도를 월 합계 안으로 자른다 — 예정이 월 합계와 반대 부호가 되지 않는다.
// 주간마감 스냅샷·CRM 매출 병기·rev-sheet
// 워크스페이스가 공용으로 쓴다(각자 재구현하면 클램프 규칙이 갈라진다).
export function splitMonthConfidence(
  d: RevConfidenceSource,
  ym: string,
  total: number,
  hasColor: boolean = dealHasColorData(d),
  today?: string,
): MonthConfidenceSplit {
  const at = resolveRevReadDate(today)
  const confirmed = confirmedAt(d, ym, total, hasColor, at)
  const mapHigh = monthAmount(d.monthly_high_conf, ym) ?? 0
  if (hasMonthWeekMismatch(d, ym)) {
    const highConfidence = clampToTotal(mapHigh, total - confirmed)
    return { confirmed, highConfidence, expected: total - confirmed - highConfidence }
  }
  if (isSignedMonth(total, effectiveConfirmed(d, ym, at) ?? 0, mapHigh)) {
    return { confirmed, highConfidence: mapHigh, expected: total - confirmed - mapHigh }
  }
  const highConfidence = Math.min(
    Math.max(0, total - confirmed),
    Number(d.monthly_high_conf?.[ym]) || 0,
  )
  const expected = Math.max(0, total - confirmed - highConfidence)
  return { confirmed, highConfidence, expected }
}
