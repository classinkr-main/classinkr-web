// 장부 건별 시트(2026-11-23, 기획 W2·W3) — 순수 함수만. 화면은 ledger/LedgerSheet.tsx.
//
// 시트 '2. REV' 처럼 건별 한 줄(같은 기관이 여러 건이면 여러 줄)로 펴고, 기준 달(m0)과 다음 달(m1)만
// 주차(W1~W5) 칸으로 편다. 지난달은 한 열로 묶고(지난달 고정), 그 뒤 달도 한 열로 묶는다.
// 금액·확도 분해는 기존 정본(rowMonthBucket · rowWeeklySplit · computeWeekCellStates)만 쓴다 — 여기서 다시 계산하지 않는다.
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { currentWeekStart } from "@/lib/branch/sheet-writeback/target"
import { channelLabel, contractLabel } from "./ledger-simple-logic"
import { computeWeekCellStates, dominantCellConfidence, isMatrixCellLocked, type MatrixCellCoord } from "./rev-matrix-logic"
import {
  rowProductCategory,
  rowWeeklyMismatch,
  rowWeeklySplit,
  weeklyConfidenceFromMetadata,
  type DraftConfidence,
  type LedgerRevenueRow,
  type RevMonthlyBucket,
} from "./shared"
import { addMonthlyBucket, emptyMonthlyBucket, rowMonthBucket } from "./workbench-shared"

// ── 열 필터 ─────────────────────────────────────────────────────────────────────────────────────
//
// 시트의 "값으로 필터링"과 같은 모양(2026-11-24 필터 기획 F-1): 열 하나에 조건을 여러 개 고르면 그 안에서는 OR,
// 여러 열에 걸면 열끼리는 AND. 조건은 값 있음(공백 제외) · 확도 단계 · 값 없음이다.

/**
 * 열 필터 조건 하나 — 필터 메뉴의 체크박스 한 칸.
 *  - "any"   값 있음(공백 제외) — 그 칸(월 계는 그 달)에 금액이 있다.
 *  - 확도 키  그 칸에 그 확도 금액이 있다. 단계 목록은 CONFIDENCE_TOKENS 를 돌린다 — 5단계로 바뀌면 토큰 맵만 고친다.
 *  - "empty" 값 없음 — 그 칸이 비었다.
 */
export type SheetFilterCondition = "any" | DraftConfidence | "empty"

/** 한 열에 걸린 조건 집합 — 안에서는 OR(하나라도 맞으면 통과). 저장·URL 은 늘 정규형이다(normalizeSheetFilterSet). */
export type SheetFilterSet = readonly SheetFilterCondition[]

export type SheetColumnFilters = Readonly<Record<string, SheetFilterSet>>

/**
 * 확도 단계 — CONFIDENCE_TOKENS 의 키 순서(확정 → 고확도 → 예정)가 곧 메뉴·라벨·URL 순서다.
 * ConfidenceKey 와 DraftConfidence 는 같은 유니온이다(confidence-tokens.ts) — 단계를 바꾸면 둘을 함께 고친다.
 */
export const SHEET_FILTER_CONFIDENCES: readonly DraftConfidence[] = Object.keys(CONFIDENCE_TOKENS) as DraftConfidence[]

/** 조건의 정규 순서 — 값 있음 → 확도(토큰 순서) → 값 없음. 메뉴도 이 순서로 그린다. */
export const SHEET_FILTER_CONDITIONS: readonly SheetFilterCondition[] = ["any", ...SHEET_FILTER_CONFIDENCES, "empty"]

const KNOWN_CONDITIONS = new Set<string>(SHEET_FILTER_CONDITIONS)

export function isSheetFilterCondition(value: string): value is SheetFilterCondition {
  return KNOWN_CONDITIONS.has(value)
}

/** 칩·열 머리 요약에 쓰는 짧은 이름 — 값 있음 · 확정 · 고확도 · 예정 · 값 없음. 확도 이름은 토큰 라벨 그대로. */
export function sheetFilterConditionLabel(condition: SheetFilterCondition): string {
  if (condition === "any") return "값 있음"
  if (condition === "empty") return "값 없음"
  return CONFIDENCE_TOKENS[condition].label
}

export interface SheetFilterOption {
  id: SheetFilterCondition
  /** 짧은 이름(sheetFilterConditionLabel). */
  label: string
  /** 메뉴에서 이름 옆에 붙이는 보조 말 — 값 있음은 예전 이름 "공백 제외"를 남겨 둔다. 없으면 null. */
  hint: string | null
  /** 확도 조건이면 그 확도 키(메뉴가 CONFIDENCE_TOKENS 로 색 견본을 칠한다), 값 있음·값 없음이면 null. */
  confidence: DraftConfidence | null
}

/** 열 머리 필터 메뉴의 체크박스 목록 — 토큰 맵에서 만든다(3단계면 5칸, 5단계 전환 뒤 7칸). */
export const SHEET_FILTER_OPTIONS: readonly SheetFilterOption[] = SHEET_FILTER_CONDITIONS.map((id) => ({
  id,
  label: sheetFilterConditionLabel(id),
  hint: id === "any" ? "공백 제외" : id === "empty" ? "빈 칸" : null,
  confidence: id === "any" || id === "empty" ? null : id,
}))

/**
 * 필터 열 키 — 달이 아니라 **자리**다. m0 = 기준 달, m1 = 그다음 달, `.wN` = 그 달의 N주차 칸, 없으면 월 "계".
 * 월을 옮기면 필터도 열과 함께 따라간다("이번 달 계 · 값 있음"은 12월로 옮겨도 12월 계에 걸린다).
 */
export const SHEET_FILTER_KEYS: readonly string[] = [0, 1].flatMap((slot) => [
  `m${slot}`,
  ...[1, 2, 3, 4, 5].map((week) => `m${slot}.w${week}`),
])

/** 들어오면 걸려 있는 필터 — 기준 달 계 · 값 있음("매출 난 것만"). */
export const DEFAULT_SHEET_FILTERS: SheetColumnFilters = { m0: ["any"] }
export const DEFAULT_SHEET_FILTER_KEY = "m0"

export const NO_SHEET_FILTERS: SheetColumnFilters = {}

export function parseSheetFilterKey(key: string): { slot: 0 | 1; week: number | null } | null {
  const match = /^m([01])(?:\.w([1-5]))?$/.exec(key)
  if (!match) return null
  return { slot: match[1] === "0" ? 0 : 1, week: match[2] ? Number(match[2]) - 1 : null }
}

/** 겹친 값·모르는 값을 빼고 정규 순서로 줄 세운다. 뜻은 바꾸지 않는다 — 메뉴 초안·라벨용. */
function orderSheetFilterConditions(conditions: readonly string[]): SheetFilterCondition[] {
  const picked = new Set(conditions)
  return SHEET_FILTER_CONDITIONS.filter((condition) => picked.has(condition))
}

/**
 * 한 열의 조건 집합 → 정규형. null 이면 그 열은 아무것도 거르지 않는다(필터를 지운다).
 *  1. 모르는 값·겹친 값을 빼고 정규 순서(값 있음 → 확도 토큰 순서 → 값 없음)로 줄 세운다.
 *  2. 빈 집합 → null.
 *  3. 값 있음 + 값 없음 → 모든 행이 통과한다 → null(걸어 봐야 거르는 것이 없는데 열 머리만 초록으로 칠해진다).
 *  4. 값 있음 + 확도 → ["any"]. 확도 조건은 값 있음 안에 든다(확도 금액이 있으면 그 칸·그 달에 값이 있다 —
 *     rowMonthBucket 의 total = 확정 + 고확도 + 예정, 0 이하면 전부 0) — OR 하면 값 있음과 같다.
 * 확도를 전부 골라도 값 있음으로 줄이지 않는다. 월 금액이 0인데 주차 값만 있는 칸은 확도가 없어(weekCellConfidences)
 * 주차 열에서는 뜻이 달라진다.
 */
export function normalizeSheetFilterSet(conditions: readonly string[] | null | undefined): SheetFilterSet | null {
  const ordered = orderSheetFilterConditions(conditions ?? [])
  if (ordered.length === 0) return null
  const any = ordered.includes("any")
  if (any && ordered.includes("empty")) return null
  return any ? ["any"] : ordered
}

/** 열 순서(SHEET_FILTER_KEYS)로 다시 쌓고, 열마다 정규형으로 바꾸고, 모르는 열·거르지 않는 열은 버린다. */
function normalizeSheetFilters(filters: Readonly<Record<string, readonly string[] | undefined>>): SheetColumnFilters {
  const out: Record<string, SheetFilterSet> = {}
  for (const key of SHEET_FILTER_KEYS) {
    const set = normalizeSheetFilterSet(filters[key])
    if (set) out[key] = set
  }
  return out
}

// URL 에 싣는 조건 이름. 고확도만 짧게("high") — 옛 주소(`m1:high`)가 그대로 열려야 한다. 나머지는 키 그대로라
// 확도 단계가 바뀌어도 이 표는 고칠 것이 없다(옛 이름을 살려야 할 때만 여기에 별칭을 더한다).
const CONDITION_PARAM_ALIAS: Partial<Record<SheetFilterCondition, string>> = { "high-confidence": "high" }

function conditionParam(condition: SheetFilterCondition): string {
  return CONDITION_PARAM_ALIAS[condition] ?? condition
}

const PARAM_TO_CONDITION = new Map<string, SheetFilterCondition>(
  SHEET_FILTER_CONDITIONS.map((condition) => [conditionParam(condition), condition]),
)

function encodeSheetFilters(filters: SheetColumnFilters): string {
  return Object.entries(filters)
    .map(([key, set]) => `${key}:${set.map(conditionParam).join("+")}`)
    .join(",")
}

const DEFAULT_SHEET_FILTER_PARAM = encodeSheetFilters(DEFAULT_SHEET_FILTERS)

/**
 * URL `cf` → 필터. 생략(null)은 기본값, `none` 은 "전부 풀림". 그 밖은 `열:조건+조건,열:조건` 꼴이다
 * (`m0:any,m1.w2:confirmed+high,m1:empty`). 한 조건짜리 옛 주소(`m0:any,m0.w2:confirmed`)는 그대로 같은 뜻이다.
 *  - `+` 를 그대로 쓴 주소는 URLSearchParams 가 공백으로 읽는다 — 공백도 구분자로 받는다.
 *  - 같은 열이 두 번 나오면 조건을 합친다(집합이라 순서·중복은 뜻이 없다).
 *  - 모르는 열·조건은 버린다(남의 주소를 붙여 넣어도 화면이 깨지지 않게). 조건이 하나도 안 남은 열은 걸리지 않는다.
 */
export function parseSheetFilters(param: string | null): SheetColumnFilters {
  if (param == null) return DEFAULT_SHEET_FILTERS
  const merged: Record<string, SheetFilterCondition[]> = {}
  for (const part of param.split(",")) {
    const colon = part.indexOf(":")
    if (colon < 0) continue
    const key = part.slice(0, colon).trim()
    if (!parseSheetFilterKey(key)) continue
    const conditions = part
      .slice(colon + 1)
      .split(/[+\s]+/)
      .flatMap((value) => {
        const condition = PARAM_TO_CONDITION.get(value)
        return condition ? [condition] : []
      })
    merged[key] = [...(merged[key] ?? []), ...conditions]
  }
  return normalizeSheetFilters(merged)
}

/** 필터 → URL `cf`. 정규형으로 적는다. 기본값이면 null(주소에서 지운다 — 생략 = 기본값 복귀), 비었으면 `none`. */
export function serializeSheetFilters(filters: SheetColumnFilters): string | null {
  const normalized = normalizeSheetFilters(filters)
  if (Object.keys(normalized).length === 0) return "none"
  const param = encodeSheetFilters(normalized)
  return param === DEFAULT_SHEET_FILTER_PARAM ? null : param
}

export function sameSheetFilters(a: SheetColumnFilters, b: SheetColumnFilters): boolean {
  return serializeSheetFilters(a) === serializeSheetFilters(b)
}

/**
 * 열 하나의 조건 집합을 바꾼다(정규형으로). null · 빈 집합 · 거르지 않는 집합(값 있음 + 값 없음)이면 그 열을 푼다.
 * 다른 열의 필터는 그대로 — 겹쳐 걸린다(AND). 모르는 열이거나 뜻이 그대로면 받은 객체를 그대로 돌려준다(리렌더 방지).
 */
export function setSheetFilter(
  filters: SheetColumnFilters,
  key: string,
  conditions: readonly SheetFilterCondition[] | null,
): SheetColumnFilters {
  if (!parseSheetFilterKey(key)) return filters
  const next: Record<string, SheetFilterSet> = { ...filters }
  const set = normalizeSheetFilterSet(conditions)
  if (set) next[key] = set
  else delete next[key]
  const normalized = normalizeSheetFilters(next)
  return sameSheetFilters(normalized, filters) ? filters : normalized
}

/** 열 하나만 푼다(메뉴 [이 열 풀기] · 걸린 필터 칩 ×). */
export function clearSheetFilter(filters: SheetColumnFilters, key: string): SheetColumnFilters {
  return setSheetFilter(filters, key, null)
}

/**
 * 메뉴 [이 열만 보기] — 다른 열 필터(기본 필터 포함)를 전부 풀고 이 열의 조건만 남긴다. 기본 필터와 몰래 겹치는
 * 오답(F4)을 사람이 명시적으로 푸는 길이다(D3 — 자동으로 풀지 않는다). 모르는 열이면 그대로 둔다.
 */
export function onlySheetFilter(
  filters: SheetColumnFilters,
  key: string,
  conditions: readonly SheetFilterCondition[] | null,
): SheetColumnFilters {
  if (!parseSheetFilterKey(key)) return filters
  const next = setSheetFilter(NO_SHEET_FILTERS, key, conditions)
  return sameSheetFilters(next, filters) ? filters : next
}

/**
 * 메뉴를 열 때의 체크 상태 — 걸린 열이면 그 조건, 아니면 "값 있음" 하나(D2: 메뉴를 열고 Enter 한 번이면
 * 예전처럼 공백 제외가 걸린다). 새 배열이라 메뉴가 고쳐도 걸린 필터는 바뀌지 않는다.
 */
export function sheetFilterDraft(filters: SheetColumnFilters, key: string): SheetFilterCondition[] {
  const current = filters[key]
  return current && current.length > 0 ? [...current] : ["any"]
}

/**
 * 메뉴 체크박스 하나를 켜고 끈다(정규 순서로 줄 세운다). 값 있음은 확도 · 값 없음과 함께 켜지지 않는다:
 *  - 확도나 값 없음을 켜면 값 있음을 끈다. 메뉴는 값 있음이 켜진 채 열리므로(D2) 끄지 않으면 "머리 → 확정 →
 *    이 열만 보기"가 값 있음 + 확정 → 정규화(normalizeSheetFilterSet)로 값 있음이 되어 확정만이 아닌 행이 남는다
 *    (기획 F-1 "오답 경로 없음"). 값 있음 + 값 없음은 열을 몰래 푼다.
 *  - 값 있음을 켜면 확도 · 값 없음을 끈다 — 확도는 값 있음 안에 들고, 값 없음과 함께면 거르는 것이 없다.
 * 그래서 메뉴의 체크 상태가 곧 적용될 조건이다(체크한 것과 다른 것이 걸리지 않는다).
 */
export function toggleSheetFilterCondition(
  conditions: readonly SheetFilterCondition[],
  condition: SheetFilterCondition,
): SheetFilterCondition[] {
  if (conditions.includes(condition)) return orderSheetFilterConditions(conditions.filter((item) => item !== condition))
  if (condition === "any") return ["any"]
  return orderSheetFilterConditions([...conditions.filter((item) => item !== "any"), condition])
}

export interface SheetRect {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * 열 머리 필터 메뉴가 붙을 머리 칸의 보이는 가로 구간. 보이는 자리 = 창 ∩ 표 스크롤 상자 안쪽(스크롤바 제외)에서
 * 왼쪽 고정 열(# · 고객, stickyLeft px)이 덮는 부분을 뺀 곳. 머리 칸이 그 자리와 겹치지 않으면 null — 메뉴를 닫는다.
 * 창만 보면 안 된다: 상자 왼쪽엔 어드민 사이드바, 오른쪽엔 빠른 작업 레일이 있어 가로 스크롤로 고정 열 밑 · 레일 밑에
 * 숨은 머리도 창 안에 있다 — 메뉴가 안 보이는 열을 가리킨 채 남는다.
 */
export function sheetMenuAnchorSpan(
  head: SheetRect,
  viewport: SheetRect,
  scroller: SheetRect | null,
  stickyLeft: number,
): { left: number; right: number } | null {
  const area = scroller
    ? {
        left: Math.max(viewport.left, scroller.left + stickyLeft),
        right: Math.min(viewport.right, scroller.right),
        top: Math.max(viewport.top, scroller.top),
        bottom: Math.min(viewport.bottom, scroller.bottom),
      }
    : viewport
  const left = Math.max(head.left, area.left)
  const right = Math.min(head.right, area.right)
  if (right <= left || head.bottom <= area.top || head.top >= area.bottom) return null
  return { left, right }
}

/**
 * 메뉴로 필터를 건 뒤(적용 · 이 열만 보기) 표를 가로로 얼마나 밀지(px, + 면 오른쪽으로 스크롤). 머리를 누를 수
 * 있었다는 건 열이 조금이라도 보였다는 뜻이라, 화면 끝에 걸린 열(1440 에서 다음 달 W2 등)은 결과를 보는 동안에도
 * 끝에 붙어 그 달 띠("12월")가 잘린 채 남았다. 그 달 묶음(계 · W1~W5)이 통째로 들어가면 묶음을, 안 들어가면 그 열만
 * 가장 가까운 쪽으로 맞춘다. 이미 다 보이면 0 — 보이는 열에 필터를 걸 때마다 표가 움직이지 않게.
 * area 는 표 스크롤 상자 안쪽에서 왼쪽 고정 열(# · 고객)을 뺀 가로 구간(sheetMenuAnchorSpan 과 같은 자리)이다.
 */
export function sheetRevealScrollDelta(
  column: Pick<SheetRect, "left" | "right">,
  block: Pick<SheetRect, "left" | "right"> | null,
  area: Pick<SheetRect, "left" | "right">,
): number {
  const width = area.right - area.left
  const target = block && block.right - block.left <= width ? block : column
  if (target.left >= area.left && target.right <= area.right) return 0
  // 왼쪽으로 숨었거나 열 하나도 다 안 들어가면 왼쪽 끝을 맞춘다(앞자리부터 보이게), 오른쪽으로 숨었으면 오른쪽 끝.
  if (target.left < area.left || target.right - target.left > width) return target.left - area.left
  return target.right - area.right
}

/** 조건 집합의 이름 — "확정·고확도", "값 있음". 정규 순서로 적고, 비었으면 빈 문자열. */
export function sheetFilterSetLabel(conditions: readonly SheetFilterCondition[] | null | undefined): string {
  return orderSheetFilterConditions(conditions ?? []).map(sheetFilterConditionLabel).join("·")
}

// ── 열 구성 ─────────────────────────────────────────────────────────────────────────────────────

export interface SheetMonthBlock {
  slot: 0 | 1
  /** YYYY-MM */
  month: string
  /** "11월" */
  label: string
}

export interface SheetColumns {
  /** 기준 달(회계연도 안으로 맞춘 값). */
  anchor: string
  /** 기준 달 이전의 회계월. 고정이면 한 열로 묶이고, 풀면 달마다 한 열. */
  pastMonths: string[]
  pastLabel: string | null
  pastPinned: boolean
  /** 주차로 펴는 달 — 기준 달, 다음 달(회계연도 마지막 달이면 하나뿐). */
  blocks: SheetMonthBlock[]
  /** 다음 달 뒤의 회계월 — 늘 한 열. */
  laterMonths: string[]
  laterLabel: string | null
}

function monthNumber(month: string) {
  return Number(month.split("-")[1])
}

function rangeLabel(months: string[]): string | null {
  if (months.length === 0) return null
  const first = monthNumber(months[0])
  const last = monthNumber(months[months.length - 1])
  return months.length === 1 ? `${first}월` : `${first}–${last}월`
}

/** 기준 달이 회계연도 밖이면 가장 가까운 끝 달로 맞춘다. */
export function clampSheetAnchor(months: string[], anchorMonth: string): string {
  if (months.length === 0 || months.includes(anchorMonth)) return anchorMonth
  return anchorMonth < months[0] ? months[0] : months[months.length - 1]
}

export function buildSheetColumns(months: string[], anchorMonth: string, pastPinned = true): SheetColumns {
  const anchor = clampSheetAnchor(months, anchorMonth)
  const index = Math.max(months.indexOf(anchor), 0)
  const pastMonths = months.slice(0, index)
  const blockMonths = months.slice(index, index + 2)
  const laterMonths = months.slice(index + 2)
  return {
    anchor,
    pastMonths,
    pastLabel: rangeLabel(pastMonths),
    pastPinned,
    blocks: blockMonths.map((month, slot) => ({ slot: slot as 0 | 1, month, label: `${monthNumber(month)}월` })),
    laterMonths,
    laterLabel: rangeLabel(laterMonths),
  }
}

/** "11월 계" · "11월 W2". 그 자리에 달이 없으면(회계연도 끝) null. */
export function sheetFilterColumnLabel(key: string, columns: SheetColumns): string | null {
  const parsed = parseSheetFilterKey(key)
  if (!parsed) return null
  const block = columns.blocks.find((item) => item.slot === parsed.slot)
  if (!block) return null
  return parsed.week == null ? `${block.label} 계` : `${block.label} W${parsed.week + 1}`
}

export interface SheetFilterChip {
  key: string
  /** "11월 W2 확정·고확도" — 열 이름 + 조건 이름. */
  label: string
  /** "11월 W2". 그 자리에 달이 없으면(회계연도 마지막 달의 다음 달) "다음 달 W2". */
  columnLabel: string
  /** "확정·고확도". */
  conditionLabel: string
  conditions: SheetFilterSet
  /**
   * 지금 행을 거르는가. 그 자리에 달이 없는 필터는 걸려 있어도 건너뛴다(sheetRowPassesFilters) — 그래도 목록에서
   * 빼지 않는다. 빼면 주소에 남은 필터가 안 보이다가 월을 옮기는 순간 몰래 다시 걸린다(F-2 "숨은 필터 0").
   */
  applies: boolean
}

/** 걸린 필터 목록 — 결과 줄 칩. "11월 계 값 있음", "11월 W2 확정·고확도" … (열 순서대로, 정규형으로). */
export function describeSheetFilters(filters: SheetColumnFilters, columns: SheetColumns): SheetFilterChip[] {
  return SHEET_FILTER_KEYS.flatMap((key) => {
    const conditions = normalizeSheetFilterSet(filters[key])
    const parsed = parseSheetFilterKey(key)
    if (!conditions || !parsed) return []
    const monthLabel = sheetFilterColumnLabel(key, columns)
    const columnLabel = monthLabel ?? `${parsed.slot === 0 ? "기준 달" : "다음 달"} ${parsed.week == null ? "계" : `W${parsed.week + 1}`}`
    const conditionLabel = sheetFilterSetLabel(conditions)
    return [{ key, label: `${columnLabel} ${conditionLabel}`, columnLabel, conditionLabel, conditions, applies: monthLabel != null }]
  })
}

// ── 행 ──────────────────────────────────────────────────────────────────────────────────────────

export interface SheetWeekCell {
  /** 화면에 보이는 금액(월합계만 있는 행은 W5 에 얹는다 — computeWeekCellStates 규약). */
  display: number
  isMonthOnly: boolean
  /** 값이 있는 칸의 확도. 빈 칸은 null. */
  confidence: DraftConfidence | null
}

export interface SheetBlockView {
  slot: 0 | 1
  month: string
  bucket: RevMonthlyBucket
  /** 주차 5칸(표시용). */
  weeks: SheetWeekCell[]
  /** rowWeeklySplit 원본 — 칸 편집 컴포넌트(RevMatrixWeekCells)에 그대로 넘긴다. */
  rawWeeks: number[]
  inferred: boolean
  monthOnlyAmount: number
  /** 주차 합계와 월 금액이 어긋났다(rowWeeklyMismatch). */
  mismatch: boolean
  /** 그 달이 잠겼다(isMatrixCellLocked) — 값이 있는 주차 칸은 고칠 수 없다. */
  monthLocked: boolean
}

export interface SheetRowView {
  row: LedgerRevenueRow
  /** 제품 — "SW" · "HW", 분류 못 하면 빈 문자열. */
  product: string
  /** 계약 — 신규 · 갱신 · 기타. */
  contract: string
  /** 경로 — 직접 · 채널 · 기타. */
  channel: string
  past: RevMonthlyBucket
  pastByMonth: RevMonthlyBucket[]
  blocks: SheetBlockView[]
  later: RevMonthlyBucket
  annual: RevMonthlyBucket
  /** 금액이 있는 달이 전부 확정이고 잠겼다 — 고객명 옆 자물쇠. */
  lockedConfirmed: boolean
  /** 주차·월 불일치가 난 달(회계연도 순) — 고객명 옆 경고. */
  mismatchMonths: string[]
  correctedMonths: Set<string> | null
  /** 비고 — 장부에서 넣은 행의 메모. 시트 행은 데이터 계약에 비고가 없어 비어 있다. */
  note: string
}

function uniformConfidence(bucket: RevMonthlyBucket): DraftConfidence | null {
  if (bucket.total <= 0) return null
  if (bucket.confirmed >= bucket.total) return "confirmed"
  if (bucket.confirmed <= 0 && bucket.open <= 0) return "high-confidence"
  if (bucket.confirmed <= 0 && bucket.high <= 0) return "expected"
  return null
}

/**
 * 주차 칸별 확도(표시·필터용). 월 확도 분해(bucket)가 정본이라 그 합을 넘겨 칠하지 않는다.
 *  - 그 달이 한 가지 확도뿐이면 값 있는 칸 전부 그 확도.
 *  - 섞였으면 장부 입력 행은 저장된 주차별 확도, 시트 행은 칸 글자색(weeklyColors: r 빨강 · b 파랑 · k 그 밖)을
 *    읽되, 빨강·파랑 칸은 그 달의 확정·고확도 금액이 남아 있을 때만 그 확도로 본다(아직 오지 않은 주차의 빨강은
 *    정본에서 예정이다). 글자색을 모르면 그 달의 우세 확도.
 */
export function weekCellConfidences(
  row: Pick<LedgerRevenueRow, "weeklyColors" | "draftMetadata" | "draftMonth">,
  month: string,
  displays: number[],
  bucket: RevMonthlyBucket,
): Array<DraftConfidence | null> {
  const uniform = uniformConfidence(bucket)
  if (bucket.total <= 0) return displays.map(() => null)
  if (uniform) return displays.map((value) => (value > 0 ? uniform : null))
  const stored = row.draftMonth === month ? weeklyConfidenceFromMetadata(row.draftMetadata) : null
  const marks = row.weeklyColors?.[month] ?? ""
  const dominant = dominantCellConfidence(bucket)
  let confirmedLeft = bucket.confirmed
  let highLeft = bucket.high
  return displays.map((value, index) => {
    if (value <= 0) return null
    if (stored?.[index]) return stored[index]
    const mark = marks[index]
    if (mark === "r" && confirmedLeft >= value - 1) {
      confirmedLeft -= value
      return "confirmed"
    }
    if (mark === "b" && highLeft >= value - 1) {
      highLeft -= value
      return "high-confidence"
    }
    if (mark === "r" || mark === "b" || mark === "k") return "expected"
    return dominant
  })
}

export function buildSheetRowView(row: LedgerRevenueRow, columns: SheetColumns, correctedMonths: Set<string> | null = null): SheetRowView {
  const past = emptyMonthlyBucket()
  const later = emptyMonthlyBucket()
  const annual = emptyMonthlyBucket()
  const mismatchMonths: string[] = []
  let valuedMonths = 0
  let lockedConfirmedMonths = 0
  const visit = (month: string) => {
    const bucket = rowMonthBucket(row, month)
    if (bucket.total > 0) {
      valuedMonths += 1
      addMonthlyBucket(annual, bucket)
      if (bucket.confirmed >= bucket.total && isMatrixCellLocked(row, month, correctedMonths)) lockedConfirmedMonths += 1
    }
    if (rowWeeklyMismatch(row, month)) mismatchMonths.push(month)
    return bucket
  }
  const pastByMonth = columns.pastMonths.map((month) => {
    const bucket = visit(month)
    addMonthlyBucket(past, bucket)
    return bucket
  })
  const blocks = columns.blocks.map((block): SheetBlockView => {
    const bucket = visit(block.month)
    const split = rowWeeklySplit(row, block.month)
    const rawWeeks = split.source === "explicit" || split.source === "inferred" ? split.weeks : [0, 0, 0, 0, 0]
    const monthOnlyAmount = split.source === "month-only" ? split.total : 0
    const monthLocked = isMatrixCellLocked(row, block.month, correctedMonths)
    const states = computeWeekCellStates(rawWeeks, monthOnlyAmount, monthLocked)
    const confidences = weekCellConfidences(row, block.month, states.map((state) => state.display), bucket)
    return {
      slot: block.slot,
      month: block.month,
      bucket,
      weeks: states.map((state, index) => ({ display: state.display, isMonthOnly: state.isMonthOnly, confidence: confidences[index] })),
      rawWeeks,
      inferred: split.source === "inferred",
      monthOnlyAmount,
      mismatch: mismatchMonths.includes(block.month),
      monthLocked,
    }
  })
  for (const month of columns.laterMonths) addMonthlyBucket(later, visit(month))
  const category = rowProductCategory(row)
  return {
    row,
    product: category === "hardware" ? "HW" : category === "software" ? "SW" : "",
    contract: contractLabel(row),
    channel: channelLabel(row),
    past,
    pastByMonth,
    blocks,
    later,
    annual,
    lockedConfirmed: valuedMonths > 0 && lockedConfirmedMonths === valuedMonths,
    mismatchMonths,
    correctedMonths,
    note: (row.draftNote ?? "").trim(),
  }
}

/** 시트 순서 — 시트 행 번호 오름차순, 행 번호가 없는 행(장부에서 넣은 행)은 원래 순서대로 맨 뒤. */
export function sortSheetRows<T extends Pick<LedgerRevenueRow, "sheetRow">>(rows: T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const aRow = a.row.sheetRow ?? Number.POSITIVE_INFINITY
      const bRow = b.row.sheetRow ?? Number.POSITIVE_INFINITY
      return aRow === bRow ? a.index - b.index : aRow - bRow
    })
    .map((item) => item.row)
}

/** `#` 칸 — 무엇을 보이고 툴팁에 무엇이라 적을지. */
export interface SheetRowNumberCell {
  /** sheet = 시트 행 번호 · ledger = 장부에서 넣은 행(시트에 없음) · unnumbered = 시트에서 온 행인데 번호가 없다. */
  kind: "sheet" | "ledger" | "unnumbered"
  text: string
  title: string
}

/**
 * `#` 칸(필터 기획 C-1 · D4) — 시트 행 번호(동기화 시점, 필터·정렬과 무관). 장부에서 넣은 행은 "새".
 * 번호가 없다고 다 장부 행은 아니다 — 시트에서 온 행(ledgerOrigin "sheet")인데 동기화 기록에 행 번호가 빠졌으면 시트에 있는
 * 행이라 "새"(시트에 없음)라고 하지 않는다. 표시는 "–", 툴팁은 번호가 없다는 사실과 행 ID.
 */
export function sheetRowNumberCell(row: Pick<LedgerRevenueRow, "id" | "sheetRow" | "ledgerOrigin">): SheetRowNumberCell {
  if (row.sheetRow != null) return { kind: "sheet", text: String(row.sheetRow), title: `시트 '2. REV' ${row.sheetRow}행(동기화 시점)` }
  if (row.ledgerOrigin === "draft") return { kind: "ledger", text: "새", title: `장부에서 넣은 행 · 시트에 없음 · 장부 행 ID ${row.id}` }
  return { kind: "unnumbered", text: "–", title: `시트에서 온 행 · 동기화 기록에 시트 행 번호가 없음 · 행 ID ${row.id}` }
}

function bucketHasConfidence(bucket: RevMonthlyBucket, mode: DraftConfidence): boolean {
  if (mode === "confirmed") return bucket.confirmed > 0
  if (mode === "high-confidence") return bucket.high > 0
  return bucket.open > 0
}

/**
 * 칸 하나가 조건 하나에 맞는가.
 *  - 월 "계": 값 있음 = 그 달 금액 > 0, 확도 = 그 달에 그 확도 금액이 조금이라도 있다, 값 없음 = 금액 0 이하.
 *  - 주차: 값 있음 = 보이는 금액 > 0, 확도 = 값이 있고 그 칸의 확도가 같다, 값 없음 = 보이는 금액 0 이하.
 */
function sheetColumnMatches(block: Pick<SheetBlockView, "bucket" | "weeks">, week: number | null, condition: SheetFilterCondition): boolean {
  if (week == null) {
    if (condition === "any") return block.bucket.total > 0
    if (condition === "empty") return block.bucket.total <= 0
    return bucketHasConfidence(block.bucket, condition)
  }
  const cell = block.weeks[week]
  const display = cell?.display ?? 0
  if (condition === "any") return display > 0
  if (condition === "empty") return display <= 0
  return display > 0 && cell?.confidence === condition
}

/**
 * 걸린 열 필터를 전부 통과해야 보인다 — 열 안의 조건은 OR(하나라도 맞으면), 열끼리는 AND.
 * 그 자리에 달이 없는 필터(회계연도 끝)와 조건이 빈 열은 건너뛴다. 정규화 전 집합(값 있음 + 값 없음 등)도 같은 뜻으로 읽는다.
 */
export function sheetRowPassesFilters(view: Pick<SheetRowView, "blocks">, filters: SheetColumnFilters): boolean {
  for (const [key, conditions] of Object.entries(filters)) {
    if (!conditions || conditions.length === 0) continue
    const parsed = parseSheetFilterKey(key)
    if (!parsed) continue
    const block = view.blocks.find((item) => item.slot === parsed.slot)
    if (!block) continue
    if (!conditions.some((condition) => sheetColumnMatches(block, parsed.week, condition))) return false
  }
  return true
}

export function filterSheetRows<T extends Pick<SheetRowView, "blocks">>(views: T[], filters: SheetColumnFilters): T[] {
  if (Object.keys(filters).length === 0) return views
  return views.filter((view) => sheetRowPassesFilters(view, filters))
}

/** 이 필터를 걸면 남는 행 수 — 걸기 전에 세어 보는 용도(행 목록을 새로 만들지 않는다). */
export function countSheetRowsPassing(views: ReadonlyArray<Pick<SheetRowView, "blocks">>, filters: SheetColumnFilters): number {
  if (Object.keys(filters).length === 0) return views.length
  let count = 0
  for (const view of views) if (sheetRowPassesFilters(view, filters)) count += 1
  return count
}

/**
 * 메뉴 아래 미리보기 "적용하면 N행 · 이 열만 보면 M행".
 *  - apply: 지금 필터에 이 열의 조건을 바꿔 넣었을 때(setSheetFilter).
 *  - only:  다른 열을 다 풀고 이 열만 걸었을 때(onlySheetFilter).
 * views 는 열 필터를 걸기 전의 행(범위·검색·속성 칩까지만 반영한 것)이어야 한다 — 걸린 뒤의 행을 넘기면 "이 열만"이 줄어든 채로 센다.
 */
export function previewSheetFilter(
  views: ReadonlyArray<Pick<SheetRowView, "blocks">>,
  filters: SheetColumnFilters,
  key: string,
  conditions: readonly SheetFilterCondition[] | null,
): { apply: number; only: number } {
  return {
    apply: countSheetRowsPassing(views, setSheetFilter(filters, key, conditions)),
    only: countSheetRowsPassing(views, onlySheetFilter(filters, key, conditions)),
  }
}

/** 열 필터가 지금 행을 거르고 있는가 — 합계 행 이름("필터 결과" · "합계"). 그 자리에 달이 없는 필터는 거르지 않는다. */
export function sheetFiltersApply(filters: SheetColumnFilters, columns: SheetColumns): boolean {
  return describeSheetFilters(filters, columns).some((chip) => chip.applies)
}

/**
 * 결과 0행일 때의 안내(D-4) — 걸린 열 필터 중 하나만 풀었을 때 행이 가장 많이 남는 것("12월 W2 확정을 풀면 8행").
 * views 는 열 필터를 걸기 전의 행(sheetAllViews)이다. 하나를 풀어도 0행이면 null — 열 필터가 아니라 검색·범위가 0을 만들었다.
 * 같은 수면 열 순서(SHEET_FILTER_KEYS)에서 앞의 것.
 */
export function sheetFilterRelaxHint(
  views: ReadonlyArray<Pick<SheetRowView, "blocks">>,
  filters: SheetColumnFilters,
  columns: SheetColumns,
): { key: string; label: string; count: number } | null {
  let best: { key: string; label: string; count: number } | null = null
  for (const chip of describeSheetFilters(filters, columns)) {
    if (!chip.applies) continue
    const count = countSheetRowsPassing(views, clearSheetFilter(filters, chip.key))
    if (count > 0 && (!best || count > best.count)) best = { key: chip.key, label: chip.label, count }
  }
  return best
}

// 받침 있는 숫자 — 영(0) 일(1) 삼(3) 육(6) 칠(7) 팔(8).
const DIGITS_WITH_FINAL = new Set(["0", "1", "3", "6", "7", "8"])

/** 목적격 조사 — "11월 W2 확정을", "12월 계 고확도를". 한글·숫자가 아니면 "을(를)". */
export function objectParticle(word: string): "을" | "를" | "을(를)" {
  const last = word.trim().slice(-1)
  if (!last) return "을(를)"
  const code = last.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? "를" : "을"
  if (/[0-9]/.test(last)) return DIGITS_WITH_FINAL.has(last) ? "을" : "를"
  return "을(를)"
}

// ── 이번 주 열(D-3) ─────────────────────────────────────────────────────────────────────────────

/**
 * 이번 주 열 키("m0.w4") — 기준 달이 오늘이 든 달일 때만. 다른 달을 보고 있으면 null.
 * 주차 규칙은 시트 쓰기와 같다(currentWeekStart — 1·8·15·22·29일 시작, 29일부터는 W5). today 는 업무일(KST) YYYY-MM-DD.
 */
export function sheetCurrentWeekKey(columns: Pick<SheetColumns, "blocks">, today: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(today)) return null
  const anchor = columns.blocks.find((block) => block.slot === 0)
  if (!anchor || anchor.month !== today.slice(0, 7)) return null
  const startDay = Number(currentWeekStart(today).slice(8, 10))
  return `m0.w${(startDay - 1) / 7 + 1}`
}

// ── 금액 글자 맞추기(C-2 가) ────────────────────────────────────────────────────────────────────
//
// 금액은 원 그대로 싣는다(D1). 칸에 안 들어가면 앞자리를 숨기지 않고 글자를 한 단계씩 줄이고, 마지막 단계에서도
// 넘치면 끝을 줄임표로 자른다(칸이 그 일을 한다 — 왼쪽 정렬 넘침). 전체 금액은 늘 title 에 있다.
// 예전에는 오른쪽 정렬 flex(justify-end)가 넘친 앞자리를 칸 왼쪽 밖으로 밀어 1,660,000 이 ",660,000" 으로 보였다.

/** 데이터 칸의 글자 크기 단계(px). */
export const SHEET_AMOUNT_STEPS: readonly number[] = [12, 11, 10.5]
/** 합계 행의 글자 크기 단계(px) — 한 단계 작게 시작한다(여러 행을 더해 자릿수가 한두 자리 더 길다). */
export const SHEET_SUM_STEPS: readonly number[] = [11, 10.5, 10, 9.5]

// 표 숫자(tabular-nums) 한 자 폭(em) — 어드민 글꼴 Pretendard 굵은 글씨(700) 실측(숫자 0.655 · 쉼표 0.282, 2026-11-25)을
// 조금 넉넉히 잡았다. 칸마다 굵기가 달라도(확정 700 · 고확도 600 · 예정 500) 굵은 쪽으로 재야 앞자리가 밀리지 않는다.
const DIGIT_EM = 0.66
const MARK_EM = 0.29

/** 금액 글자의 대략 폭(px) — 숫자 · 그 밖(쉼표·마침표·부호). */
export function sheetAmountTextWidth(text: string, fontPx: number): number {
  let width = 0
  for (const char of text) width += (/[0-9]/.test(char) ? DIGIT_EM : MARK_EM) * fontPx
  return width
}

/** 칸 안쪽 폭(contentPx)에 들어가는 가장 큰 단계. 마지막 단계에서도 넘치면 마지막 단계(나머지는 줄임표). */
export function sheetAmountFontPx(text: string, contentPx: number, steps: readonly number[] = SHEET_AMOUNT_STEPS): number {
  for (const px of steps) {
    if (sheetAmountTextWidth(text, px) <= contentPx) return px
  }
  return steps[steps.length - 1]
}

// Tailwind 정적 추출용 — 완성된 리터럴만.
const SHEET_AMOUNT_FONT_CLASS: Readonly<Record<string, string>> = {
  "12": "text-[12px]",
  "11": "text-[11px]",
  "10.5": "text-[10.5px]",
  "10": "text-[10px]",
  "9.5": "text-[9.5px]",
}

/** sheetAmountFontPx 의 글자 크기 클래스. */
export function sheetAmountFontClass(text: string, contentPx: number, steps: readonly number[] = SHEET_AMOUNT_STEPS): string {
  return SHEET_AMOUNT_FONT_CLASS[String(sheetAmountFontPx(text, contentPx, steps))] ?? "text-[10px]"
}

// ── 합계 ────────────────────────────────────────────────────────────────────────────────────────

export interface SheetTotals {
  past: RevMonthlyBucket
  pastByMonth: RevMonthlyBucket[]
  blocks: Array<{ slot: 0 | 1; month: string; bucket: RevMonthlyBucket; weeks: number[] }>
  later: RevMonthlyBucket
  annual: RevMonthlyBucket
}

/** 머리 아래 합계 행 — 지금 보이는 행(필터 반영)만 더한다. */
export function sumSheetRows(views: SheetRowView[], columns: SheetColumns): SheetTotals {
  const totals: SheetTotals = {
    past: emptyMonthlyBucket(),
    pastByMonth: columns.pastMonths.map(() => emptyMonthlyBucket()),
    blocks: columns.blocks.map((block) => ({ slot: block.slot, month: block.month, bucket: emptyMonthlyBucket(), weeks: [0, 0, 0, 0, 0] })),
    later: emptyMonthlyBucket(),
    annual: emptyMonthlyBucket(),
  }
  for (const view of views) {
    addMonthlyBucket(totals.past, view.past)
    view.pastByMonth.forEach((bucket, index) => {
      if (totals.pastByMonth[index]) addMonthlyBucket(totals.pastByMonth[index], bucket)
    })
    view.blocks.forEach((block, index) => {
      const target = totals.blocks[index]
      if (!target) return
      addMonthlyBucket(target.bucket, block.bucket)
      block.weeks.forEach((cell, week) => {
        target.weeks[week] += cell.display
      })
    })
    addMonthlyBucket(totals.later, view.later)
    addMonthlyBucket(totals.annual, view.annual)
  }
  return totals
}

// ── 칸 편집 순서 ────────────────────────────────────────────────────────────────────────────────

/**
 * 고칠 수 있는 칸 좌표(행 위→아래, 달 왼→오, W1→W5) — 방향키·Tab·Enter 이동의 순서다.
 * 잠긴 달에서도 빈 주차 칸은 열려 있다(computeWeekCellStates) — 값이 찍힌 잠긴 칸만 뺀다.
 */
export function sheetEditableCells(views: SheetRowView[]): MatrixCellCoord[] {
  const cells: MatrixCellCoord[] = []
  for (const view of views) {
    for (const block of view.blocks) {
      block.weeks.forEach((cell, week) => {
        if (block.monthLocked && cell.display > 0) return
        cells.push({ rowId: view.row.id, month: block.month, week })
      })
    }
  }
  return cells
}
