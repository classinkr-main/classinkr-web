// 월 합계 칸 수식 검사 — 순수 모듈.
//
// '2. REV' 의 월 합계 칸(N·T·Z…)은 그 달 주차 칸을 더하는 수식이다(`=O3+P3+Q3+R3+S3`).
// 실측(2026-10-21)에서 19행이 다른 칸을 더한다 — 예: 9월 합계(AR) 15행이 AW 대신 10월 w2(AZ)를
// 더한다. 그 상태로 주차 칸에 쓰면 월 합계·M Sum·1행 합계가 틀어지므로 쓰기 전에 막는다.
//
// 해석하는 꼴(공백·$ 허용): `=A3+B3+…`, `=SUM(A3:E3)`, `=SUM(A3,B3)`, 둘의 + 조합. 그 밖(빼기·상수·
// 다른 행·여러 행 범위·같은 칸 두 번)은 해석하지 않는다(null) — 해석 못 하는 합계 수식은 불규칙으로 본다.

import { a1LettersToCol, colToA1, type RevLayout } from "./layout"

const CELL_RE = /^\$?([A-Za-z]{1,3})\$?(\d+)$/

function parseCellRef(token: string): { col: number; row: number } | null {
  const match = CELL_RE.exec(token.trim())
  if (!match) return null
  const col = a1LettersToCol(match[1])
  const row = Number(match[2])
  if (col == null || !Number.isSafeInteger(row) || row < 1) return null
  return { col, row }
}

/** 한 항(칸·같은 행 범위)을 칸 목록으로. 해석 못 하면 null. */
function expandTerm(term: string, row1: number): Array<{ col: number; row: number }> | null {
  const parts = term.split(":")
  if (parts.length === 1) {
    const cell = parseCellRef(parts[0])
    return cell ? [cell] : null
  }
  if (parts.length !== 2) return null
  const start = parseCellRef(parts[0])
  const end = parseCellRef(parts[1])
  if (!start || !end || start.row !== end.row || start.row !== row1) return null
  const from = Math.min(start.col, end.col)
  const to = Math.max(start.col, end.col)
  return Array.from({ length: to - from + 1 }, (_, index) => ({ col: from + index, row: start.row }))
}

export function formulaRefs(formula: string, row1: number): Set<string> | null {
  if (typeof formula !== "string") return null
  const body = formula.trim()
  if (!body.startsWith("=")) return null
  const expr = body.slice(1).replace(/\s+/g, "")
  if (!expr) return null

  const terms: string[] = []
  // 맨 바깥 + 로만 나눈다. SUM(...) 안은 , 또는 + 로 나눈다.
  for (const top of expr.split("+")) {
    if (!top) return null
    const sum = /^SUM\((.*)\)$/i.exec(top)
    if (sum) {
      if (!sum[1]) return null
      for (const inner of sum[1].split(",")) {
        if (!inner) return null
        terms.push(inner)
      }
      continue
    }
    terms.push(top)
  }
  // SUM( 안에서 + 로 나뉜 경우("=SUM(A3+B3)")는 위 split 이 괄호를 깨뜨려 여기서 걸러진다.
  const refs = new Set<string>()
  for (const term of terms) {
    if (/[()]/.test(term)) return null
    const cells = expandTerm(term, row1)
    if (!cells) return null
    for (const cell of cells) {
      if (cell.row !== row1) return null
      const key = `${colToA1(cell.col)}${cell.row}`
      // 같은 칸을 두 번 더하면 합이 틀린다 — 집합으로는 그 사실을 담을 수 없으니 해석 거부.
      if (refs.has(key)) return null
      refs.add(key)
    }
  }
  return refs.size > 0 ? refs : null
}

/** 해석 여부와 무관하게 수식 글자에 나오는 칸·범위가 (row1, col) 을 덮는지 — 다른 달 합계 검사용. */
function formulaMentionsCell(formula: string, row1: number, col: number): boolean {
  const tokenRe = /\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?/g
  for (const match of formula.matchAll(tokenRe)) {
    const startCol = a1LettersToCol(match[1])
    const startRow = Number(match[2])
    if (startCol == null) continue
    const endCol = match[3] ? a1LettersToCol(match[3]) : startCol
    const endRow = match[4] ? Number(match[4]) : startRow
    if (endCol == null) continue
    const colLo = Math.min(startCol, endCol)
    const colHi = Math.max(startCol, endCol)
    const rowLo = Math.min(startRow, endRow)
    const rowHi = Math.max(startRow, endRow)
    if (col >= colLo && col <= colHi && row1 >= rowLo && row1 <= rowHi) return true
  }
  return false
}

export function checkMonthFormulas(
  row1: number,
  rowFormulas: Map<number, string | null>,
  layout: RevLayout,
  targetCols: number[],
): { ok: true } | { ok: false; code: "month_formula_irregular"; month: string } {
  const targets = new Set(targetCols)
  const targetBlocks = layout.monthBlocks.filter((block) => block.weekCols.some((col) => targets.has(col)))

  // 1) 대상 칸이 속한 달 — 합계 수식이 정확히 그 달 주차 칸 전부를 더해야 한다.
  for (const block of targetBlocks) {
    const formula = rowFormulas.get(block.totalCol) ?? null
    if (!formula) return { ok: false, code: "month_formula_irregular", month: block.ym }
    const refs = formulaRefs(formula, row1)
    const expected = new Set(block.weekCols.map((col) => `${colToA1(col)}${row1}`))
    if (!refs || refs.size !== expected.size || [...expected].some((ref) => !refs.has(ref))) {
      return { ok: false, code: "month_formula_irregular", month: block.ym }
    }
  }

  // 2) 다른 달 합계가 대상 칸을 더하면 안 된다(9월 합계가 10월 w2 를 더하는 실측 사례).
  for (const block of layout.monthBlocks) {
    if (targetBlocks.includes(block)) continue
    const formula = rowFormulas.get(block.totalCol) ?? null
    if (!formula) continue
    for (const col of targets) {
      if (formulaMentionsCell(formula, row1, col)) return { ok: false, code: "month_formula_irregular", month: block.ym }
    }
  }

  return { ok: true }
}
