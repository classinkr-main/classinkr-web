// CRM CSV 내보내기 공용 규약 — 서버 라우트(통합 고객 내보내기)와 클라이언트 버튼(360 품목 등)이
// 같은 이스케이프·BOM·수식 주입 방어를 쓰게 한 곳에 둔다. 리드 보드의 옛 인라인 구현은
// 수식 주입 방어가 없어 새 표면은 이 모듈을 쓴다.
//
// 규칙
// - Excel·Google Sheets 가 한글 헤더를 깨지 않게 UTF-8 BOM 을 앞에 붙인다.
// - `= + - @` 와 탭·CR 로 시작하는 셀은 스프레드시트가 수식으로 실행할 수 있다(CSV injection).
//   앞에 작은따옴표를 붙여 문자열로 고정한다. 음수 같은 숫자 셀은 number 타입으로 넘기면 그대로 둔다.
// - 금액 열은 통화별로 따로 둔다(₩/$/¥ 합산 금지 — 플레이북 규칙). 이 모듈은 값을 합치지 않는다.

export type CsvCell = string | number | boolean | null | undefined

export interface CsvColumn<Row> {
  header: string
  value: (row: Row) => CsvCell
}

export const CSV_BOM = "﻿"

const FORMULA_PREFIX = /^[=+\-@\t\r]/

/** 셀 하나를 CSV 안전 문자열로 — 수식 주입 방어 후 필요할 때만 따옴표로 감싼다. */
export function escapeCsvCell(value: CsvCell): string {
  if (value == null) return ""
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : ""
  if (typeof value === "boolean") return value ? "Y" : "N"

  let text = String(value)
  if (FORMULA_PREFIX.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** 행 배열 → CSV 본문(BOM 포함, 줄바꿈 \r\n — Excel 호환). */
export function buildCsv<Row>(rows: readonly Row[], columns: readonly CsvColumn<Row>[]): string {
  const lines = [columns.map((column) => escapeCsvCell(column.header)).join(",")]
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvCell(column.value(row))).join(","))
  }
  return CSV_BOM + lines.join("\r\n")
}

/** 내려받기 파일명 — `<prefix>-YYYY-MM-DD.csv` (KST 날짜). 경로 문자는 걸러 낸다. */
export function csvFileName(prefix: string, now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const date = kst.toISOString().slice(0, 10)
  const safePrefix = prefix.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "export"
  return `${safePrefix}-${date}.csv`
}

/** 브라우저에서 CSV 문자열을 파일로 내려받는다. 서버에서 부르면 아무것도 하지 않는다. */
export function downloadCsvInBrowser(fileName: string, csv: string): void {
  if (typeof document === "undefined") return
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
