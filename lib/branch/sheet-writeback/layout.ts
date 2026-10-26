// '2. REV' 머리(2행) 구조 해석 — 순수 모듈(클라이언트 겸용).
//
// 쓰기 직전에 다시 읽은 머리로 월 블록·주차 칸·Row ID 열을 정한다. 아래 불변식 중 하나라도
// 어긋나면 쓰지 않는다(layout_changed) — 열 위치를 짐작해서 쓰면 다른 달·다른 칸을 덮는다.
//   1) A2 머리 = "Account"
//   2) 월 합계 머리 12개가 4..12, 1..3 순서로 한 번씩
//   3) 각 월 합계 칸 바로 뒤에 주차 칸(w1~w5, "5w" 같은 오타 허용)이 4~5칸 붙어 있다
//   4) "Row ID" 머리는 0개 또는 1개이고 마지막 월 블록 뒤에 있다
// 월 블록 탐색은 parsers/rev.ts parseRev 와 같은 머리 규칙(순수 숫자 1~12 · /^(w\d|\dw)$/i)을 쓴다.

import { REV_ROW_ID_HEADER } from "./config"

export interface RevMonthBlock {
  ym: string
  totalCol: number
  weekCols: number[]
}

export interface RevLayout {
  monthBlocks: RevMonthBlock[]
  rowIdCol: number | null
  columnCount: number
}

export type RevLayoutError = { error: "layout_changed"; detail: string }

const FISCAL_MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3] as const
// parsers/rev.ts REV_COLS.monthlyStart — A~M(속성·Sum) 뒤부터 월 블록이다.
const MONTH_REGION_START = 13
const MONTH_HEADER_RE = /^([1-9]|1[0-2])$/
const WEEK_HEADER_RE = /^(w\d|\dw)$/i

function headerText(v: string | number | null | undefined): string {
  return v == null ? "" : String(v).trim()
}

export function isRevLayoutError(v: RevLayout | RevLayoutError): v is RevLayoutError {
  return (v as RevLayoutError).error === "layout_changed"
}

export function resolveRevLayout(
  headerRow: Array<string | number | null>,
  refFy: number,
): RevLayout | RevLayoutError {
  const fail = (detail: string): RevLayoutError => ({ error: "layout_changed", detail })

  if (headerText(headerRow[0]).toLowerCase() !== "account") return fail("A2 머리가 Account 가 아닙니다")

  const monthBlocks: RevMonthBlock[] = []
  let rowIdCol: number | null = null

  for (let col = MONTH_REGION_START; col < headerRow.length; col += 1) {
    const text = headerText(headerRow[col])
    if (!text) continue
    const monthsDone = monthBlocks.length === FISCAL_MONTH_ORDER.length

    if (text.toLowerCase() === REV_ROW_ID_HEADER.toLowerCase()) {
      if (rowIdCol != null) return fail("Row ID 머리가 둘 이상입니다")
      if (!monthsDone) return fail("Row ID 머리가 월 블록 앞이나 사이에 있습니다")
      rowIdCol = col
      continue
    }

    if (MONTH_HEADER_RE.test(text)) {
      if (monthsDone) return fail(`월 머리가 12개를 넘습니다(${colToA1(col)})`)
      const previous = monthBlocks[monthBlocks.length - 1]
      if (previous && (previous.weekCols.length < 4 || previous.weekCols.length > 5)) {
        return fail(`${previous.ym} 주차 칸이 ${previous.weekCols.length}개입니다`)
      }
      const expected = FISCAL_MONTH_ORDER[monthBlocks.length]
      const month = Number(text)
      if (month !== expected) return fail(`월 머리 순서가 다릅니다(${colToA1(col)}: ${month}, 기대 ${expected})`)
      const year = month >= 4 ? refFy : refFy + 1
      monthBlocks.push({ ym: `${year}-${String(month).padStart(2, "0")}`, totalCol: col, weekCols: [] })
      continue
    }

    if (WEEK_HEADER_RE.test(text)) {
      const current = monthBlocks[monthBlocks.length - 1]
      if (!current) return fail(`월 머리 앞에 주차 머리가 있습니다(${colToA1(col)})`)
      const lastCol = current.weekCols.length > 0 ? current.weekCols[current.weekCols.length - 1] : current.totalCol
      if (col !== lastCol + 1) return fail(`${current.ym} 주차 칸이 떨어져 있습니다(${colToA1(col)})`)
      if (current.weekCols.length >= 5) return fail(`${current.ym} 주차 칸이 5개를 넘습니다`)
      current.weekCols.push(col)
      continue
    }

    // 월 블록 영역 안의 모르는 머리는 블록 경계를 흐린다 — 다 끝난 뒤(오른쪽)의 머리는 상관없다.
    if (!monthsDone || isWithinLastBlock(monthBlocks)) {
      return fail(`월 블록 사이에 모르는 머리가 있습니다(${colToA1(col)})`)
    }
  }

  if (monthBlocks.length !== FISCAL_MONTH_ORDER.length) return fail(`월 머리가 ${monthBlocks.length}개입니다(12개 필요)`)
  for (const block of monthBlocks) {
    if (block.weekCols.length < 4 || block.weekCols.length > 5) {
      return fail(`${block.ym} 주차 칸이 ${block.weekCols.length}개입니다`)
    }
  }
  const lastBlock = monthBlocks[monthBlocks.length - 1]
  const lastWeekCol = lastBlock.weekCols[lastBlock.weekCols.length - 1]
  if (rowIdCol != null && rowIdCol <= lastWeekCol) return fail("Row ID 머리가 월 블록 안에 있습니다")

  const columnCount = Math.max(headerRow.length, lastWeekCol + 1, rowIdCol != null ? rowIdCol + 1 : 0)
  return { monthBlocks, rowIdCol, columnCount }
}

function isWithinLastBlock(monthBlocks: RevMonthBlock[]): boolean {
  const last = monthBlocks[monthBlocks.length - 1]
  // 마지막 블록의 주차 칸이 4칸 미만이면 아직 블록이 끝나지 않은 것으로 본다.
  return Boolean(last) && last.weekCols.length < 4
}

/** 0 → A, 25 → Z, 26 → AA, 84 → CG */
export function colToA1(col: number): string {
  if (!Number.isInteger(col) || col < 0) throw new Error(`colToA1: 잘못된 열 ${col}`)
  let n = col + 1
  let letters = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

/** "A" → 0, "CG" → 84. 글자가 아니면 null. */
export function a1LettersToCol(letters: string): number | null {
  if (!/^[A-Za-z]{1,3}$/.test(letters)) return null
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export function monthBlockOfCol(layout: RevLayout, col: number): RevMonthBlock | null {
  return layout.monthBlocks.find((block) => block.weekCols.includes(col)) ?? null
}

export function allowedWeekCols(layout: RevLayout): Set<number> {
  return new Set(layout.monthBlocks.flatMap((block) => block.weekCols))
}
