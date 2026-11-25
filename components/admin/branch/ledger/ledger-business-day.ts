// 장부 화면의 '오늘'(KST 영업일) — 이번 달 · 회계연도 · 월 선택지 · 밤새 열어 둔 탭의 날짜 바뀜을 한 곳에서 정하는 순수 함수.
//
// 왜(F-10 · F-11 · F-27 · F-45):
//  - '지금 → 달 · 회계연도'를 UTC 로 바꾸면 매월 1일 00:00~08:59 KST(12/1 잠금일 · 1/1 · 4/1 아침)에 지난달로 열린다.
//  - 마운트 때 한 번만 정하면 자정을 넘겨 열어 둔 탭이 다음 날에도 지난달 · 지난 회계연도에 멈춘다.
//  - 서버 렌더와 브라우저가 서로 다른 '지금'을 쓰면 달 경계에서 하이드레이션이 깨진다 — 첫 상태는 서버가 넘긴 날짜로 연다.
// 화면은 이 날짜를 상태로 들고(1분 틱 · 탭 복귀 때 다시 읽음) 여기 함수로만 달 · 회계연도를 만든다.
// UTC 산술은 'YYYY-MM' 끼리의 순수 계산(shiftYm)에만 쓴다.

import { getBusinessDateParts } from "@/lib/business-time"
import { fiscalYearMonths, fiscalYearOfYm, parseYmMonth } from "@/lib/branch/fiscal"

const BUSINESS_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/** 'YYYY-MM-DD'(KST 영업일)로 읽히는 값인가. */
export function isLedgerBusinessDate(value: unknown): value is string {
  return typeof value === "string" && BUSINESS_DATE_PATTERN.test(value)
}

/**
 * 화면의 첫 '오늘' — 서버가 넘긴 KST 영업일(initialBusinessDate)이 맞는 모양이면 그대로, 아니면 now 의 KST 영업일.
 * 서버 값을 쓰면 서버 렌더와 첫 클라이언트 렌더가 같은 달 · 같은 회계연도를 그린다(F-45).
 */
export function ledgerBusinessDate(value: string | null | undefined, now: Date = new Date()): string {
  return isLedgerBusinessDate(value) ? value : getBusinessDateParts(now).date
}

/** now 의 KST 영업일 — current 와 같은 날이면 current 를 그대로 돌려준다(상태가 안 바뀌어 다시 그리지 않는다). */
export function nextLedgerBusinessDate(current: string, now: Date): string {
  const today = getBusinessDateParts(now).date
  return today === current ? current : today
}

/**
 * 화면이 보는 회계연도 — 선택 달이 든 회계연도. 기본 선택 달은 이번 달(KST)이라 평소엔 오늘의 회계연도이고,
 * 주소의 ?month= 가 다른 회계연도의 달이면 그 회계연도를 보인다(F-27 — 선택 달과 표 열이 어긋나지 않게).
 * 선택 달이 'YYYY-MM' 이 아니면 오늘의 회계연도.
 */
export function ledgerViewFiscalYear(selectedMonth: string | null | undefined, businessDate: string): number {
  return fiscalYearOfYm(parseYmMonth(selectedMonth) ?? businessDate.slice(0, 7))
}

export interface LedgerMonthOption {
  value: string
  label: string
  /** 오늘(KST)의 달인가 — "· 이번 달" 표시. */
  current: boolean
}

/** 회계연도 fy 의 열두 달 선택지(4월 → 3월). current 는 오늘(KST 영업월)과 같은 달. */
export function ledgerFiscalMonthOptions(fy: number, businessMonth: string): LedgerMonthOption[] {
  return fiscalYearMonths(fy).map((value) => ({
    value,
    label: `${Number(value.slice(5, 7))}월`,
    current: value === businessMonth,
  }))
}

/** 'YYYY-MM' + delta 개월(연도 경계를 넘는다) — 순수 산술. */
export function shiftYm(ym: string, delta: number): string {
  const [year, month] = ym.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * 날짜가 바뀌어 이번 달이 바뀌었을 때(F-11)의 선택 달.
 * 선택 달이 예전 기본(어제까지의 이번 달)이고 주소에 ?month 가 없으면 새 이번 달로 옮긴다 — 사용자가 고른 달이 아니라
 * 기본값을 보고 있었다는 뜻이다. 다른 달을 골라 보고 있었거나 주소가 달을 박아 두었으면 그대로 둔다.
 */
export function rolledSelectedMonth(input: {
  selectedMonth: string
  previousDefault: string
  nextDefault: string
  urlHasMonth: boolean
}): string {
  const { selectedMonth, previousDefault, nextDefault, urlHasMonth } = input
  if (previousDefault === nextDefault) return selectedMonth
  if (urlHasMonth || selectedMonth !== previousDefault) return selectedMonth
  return nextDefault
}

/** 날짜 바뀜 판정에 쓰는 입력 폼 칸(DraftForm 의 일부). */
export interface RollableDraftForm {
  month: string
  fromMonth: string
  customer: string
  amount: string
  quantity: string
  weekly: string[]
}

/** 손대지 않은 입력 폼 — 고객 · 금액 · 수량 · 주차 칸이 모두 비었다(행을 고르면 고객이 채워져 손댄 폼이 된다). */
export function isUntouchedDraftForm(form: RollableDraftForm): boolean {
  return (
    !form.customer.trim() &&
    !form.amount.trim() &&
    !form.quantity.trim() &&
    form.weekly.every((value) => !String(value ?? "").trim())
  )
}

/**
 * 날짜가 바뀌었을 때의 입력 폼(F-11) — 초안을 고치는 중이 아니고 손대지 않은 폼이 예전 기본 달을 가리키면 새 달로 옮긴다
 * (기간 이동의 시작 달 fromMonth 도 같은 규칙). 바꿀 게 없으면 같은 객체를 돌려준다.
 */
export function rolledDraftForm<F extends RollableDraftForm>(
  form: F,
  previousDefault: string,
  nextDefault: string,
  editing: boolean,
): F {
  if (editing || previousDefault === nextDefault || !isUntouchedDraftForm(form)) return form
  const month = form.month === previousDefault ? nextDefault : form.month
  const fromMonth = form.fromMonth === previousDefault ? nextDefault : form.fromMonth
  if (month === form.month && fromMonth === form.fromMonth) return form
  return { ...form, month, fromMonth }
}

/** 주차 검수 표에서 처음 펼쳐 두는 달 — 이번 달 · 다음 달. */
export function defaultExpandedRevMonths(month: string): Set<string> {
  return new Set([month, shiftYm(month, 1)])
}

/** 날짜가 바뀌었을 때 펼친 달 — 기본(예전 이번 달 · 다음 달) 그대로였으면 새 이번 달 · 다음 달로, 손댔으면 그대로. */
export function rolledExpandedRevMonths(current: Set<string>, previousDefault: string, nextDefault: string): Set<string> {
  if (previousDefault === nextDefault) return current
  const untouched = defaultExpandedRevMonths(previousDefault)
  if (current.size !== untouched.size || Array.from(current).some((month) => !untouched.has(month))) return current
  return defaultExpandedRevMonths(nextDefault)
}

/**
 * 파이프라인(시트 행) 요청 URL — 워크벤치의 pipelineUrl 과 페이지 서버 프리페치 시드 키(app/admin/branch/ledger/page.tsx)가 이 함수
 * 하나로 만든다(문자 그대로 같아야 시드가 쓰인다). month 는 월(M) 보기에서만, manager 는 담당 1명일 때만 붙는다.
 * 끝의 fy 는 화면 회계연도(F-45) — 시드 키를 회계연도로 가르고, 회계연도가 넘어가면 URL 이 바뀌어 다시 읽는다.
 */
export function ledgerPipelineUrl(input: {
  team: string
  period: string
  month?: string | null
  manager?: string | null
  fy: number
}): string {
  const monthQuery = input.period === "M" && input.month ? `&month=${encodeURIComponent(input.month)}` : ""
  const managerQuery = input.manager ? `&manager=${encodeURIComponent(input.manager)}` : ""
  return `/api/admin/branch/pipeline?team=${input.team}&period=${input.period}${monthQuery}${managerQuery}&fy=${input.fy}`
}

/**
 * 시트 표의 기준 달을 회계연도 안으로 맞춘 값(clampSheetAnchor 결과)이 선택 달과 다르면 그 값 — 선택 달 · 주소 · 표가
 * 같은 달을 보게 되돌려 쓴다(F-27). 같으면 null(되돌려 쓸 것 없음).
 */
export function sheetAnchorCorrection(selectedMonth: string, clampedAnchor: string): string | null {
  return clampedAnchor === selectedMonth ? null : clampedAnchor
}
