// 시트 금액 칸 → 숫자. REV·DSH 파서와 시트 쓰기 되읽기가 같은 규칙을 쓴다(F-28).
//
// 1순위는 칸의 실제 숫자(effectiveValue.numberValue — readRangeWithFormat 이 FormattedCell.numberValue 로 싣는다).
// 표시 형식(회계 괄호·통화 기호·U+2212 마이너스)과 무관하게 시트 =Sum() 이 더하는 값과 같다.
// 숫자가 없을 때(텍스트로 적은 금액·테스트 픽스처)만 표시 글자를 읽는다 — '(1,750)', '¥(1,750)', '−1,750',
// '￥1,750', 'CN¥1,750', 'RMB 1,750' 을 모두 이해한다. 예전 규칙(¥₩$€£·쉼표·공백 제거)은 그대로 통과한다.
//
// 순수 모듈(클라이언트 겸용) — server-only·React 금지.

/** 금액이 아니라 '빈 칸'으로 보는 표시 — 회계 형식은 0 을 '-' 로 보인다. */
const BLANK_PLACEHOLDER_RE = /^[-−–—]$/
// 통화 표기: 앞뒤 어디에 붙어도 지운다. 긴 것(CN¥·RMB·CNY)부터 지워야 'CN' 이 남지 않는다.
const CURRENCY_WORD_RE = /CN¥|CN￥|RMB|CNY|KRW|USD|元|원/gi
const CURRENCY_SYMBOL_RE = /[¥￥₩$€£]/g
// 천 단위 구분·공백(일반·줄바꿈 없는 공백·좁은 공백)
const SEPARATOR_RE = /[,\s   ]/g
// 마이너스로 읽는 글자: ASCII '-', U+2212 '−', U+2013 '–', U+FE63 '﹣', U+FF0D '－'
const MINUS_RE = /^[-−–﹣－]/
const NUMBER_RE = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i

/** 칸에 적힌 글자를 금액으로 읽는다. 금액이 아니면 null(빈 칸·'-' 도 null). */
export function parseSheetAmount(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string") return null
  let text = value.trim()
  if (text === "" || BLANK_PLACEHOLDER_RE.test(text)) return null
  text = text.replace(CURRENCY_WORD_RE, "").replace(CURRENCY_SYMBOL_RE, "").replace(SEPARATOR_RE, "")
  let negative = false
  // 회계 괄호: '(1,750)', '¥(1,750)'(기호는 위에서 지웠다)
  const paren = /^\((.*)\)$/.exec(text)
  if (paren) {
    negative = true
    text = paren[1]
  }
  if (MINUS_RE.test(text)) {
    // '(−1,750)' 처럼 괄호와 마이너스가 겹치면 뜻이 모호하다 — 읽지 않는다.
    if (negative) return null
    negative = true
    text = text.slice(1)
  } else if (text.startsWith("+")) {
    if (negative) return null
    text = text.slice(1)
  }
  if (!NUMBER_RE.test(text)) return null
  const amount = Number(text)
  if (!Number.isFinite(amount)) return null
  return negative ? -amount : amount
}

/** 시트 칸(값 + 실제 숫자) 최소 구조 — FormattedCell 이 그대로 맞는다. */
export interface SheetAmountCell {
  value?: unknown
  /** effectiveValue.numberValue — 숫자 칸일 때만 있다. */
  numberValue?: number | null
}

// 숫자 칸이어도 금액이 아닌 표시 — 백분율(달성률 행)·날짜·시각. 실제 숫자(0.85·날짜 일련번호)를 금액으로 읽지 않는다
// (예전 글자 읽기에서도 이 칸들은 금액이 아니었다).
const NON_AMOUNT_TEXT_RE = /%\s*$|^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$|\d{1,2}:\d{2}/

function isNonAmountText(value: unknown): boolean {
  return typeof value === "string" && NON_AMOUNT_TEXT_RE.test(value.trim())
}

/**
 * 금액 칸을 읽는다. 실제 숫자가 있으면 그 값(표시 형식과 무관), 없으면 표시 글자를 parseSheetAmount 로 읽는다.
 * 회계 형식의 0('-')은 예전처럼 빈 칸(null)이다 — 0 이 찍힌 달이 '명시 0' 달로 바뀌지 않게 한다.
 * 백분율·날짜·시각으로 보이는 칸은 금액이 아니다(null).
 */
export function sheetCellAmount(cell: SheetAmountCell | null | undefined): number | null {
  if (!cell) return null
  if (isNonAmountText(cell.value)) return null
  const numeric = cell.numberValue
  if (typeof numeric === "number" && Number.isFinite(numeric)) {
    if (numeric === 0 && typeof cell.value === "string" && BLANK_PLACEHOLDER_RE.test(cell.value.trim())) return null
    return numeric
  }
  return parseSheetAmount(cell.value)
}

/**
 * 값이 적혀 있는데 금액으로 못 읽은 칸인가 — 동기화 경고(못 읽은 금액 칸 수)용.
 * 빈 칸·'-'·실제 숫자가 있는 칸·백분율·날짜(일부러 금액이 아닌 칸)는 false.
 */
export function isUnparsedSheetAmount(cell: SheetAmountCell | null | undefined): boolean {
  if (!cell) return false
  if (isNonAmountText(cell.value)) return false
  if (typeof cell.numberValue === "number" && Number.isFinite(cell.numberValue)) return false
  const value = cell.value
  if (value == null) return false
  if (typeof value === "string") {
    const text = value.trim()
    if (text === "" || BLANK_PLACEHOLDER_RE.test(text)) return false
  }
  return parseSheetAmount(value) == null
}
