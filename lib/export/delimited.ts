// 표를 CSV·TSV 텍스트로 — 순수 모듈(서버·클라이언트 공용). 라운드 5 B1~B3(매출 장부·매출시트 출력).
//
// 어드민 곳곳에 CSV 이스케이프 사본이 따로 있었다(리드 보드·캠페인 내보내기). 새 출력은 이 모듈 하나를 쓴다.
// - CSV: RFC 4180 따옴표 규칙 + CRLF 줄바꿈. 엑셀이 한글을 깨뜨리지 않게 파일로 내릴 때는 BOM을 붙인다
//   (lib/export/browser-download.ts).
// - TSV: 스프레드시트·메신저에 그대로 붙여 넣는 클립보드용. 칸 안의 탭·줄바꿈은 공백으로 바꾼다
//   (TSV에는 따옴표 규칙이 없어 칸이 밀린다).
// - 수식 주입 방지: 문자열 칸이 =·+·@·탭·CR로 시작하거나 "-" 뒤가 숫자가 아니면 앞에 작은따옴표를 붙여
//   엑셀·구글 시트가 수식으로 해석하지 않게 한다(OWASP CSV Injection). 숫자는 숫자 타입으로 넘기면 그대로 나간다.

export type DelimitedCell = string | number | boolean | null | undefined

const FORMULA_LEAD = /^[=+@\t\r]/
const DASH_NOT_NUMBER = /^-(?![\d.,\s]*$)/

function guardFormula(text: string): string {
  if (FORMULA_LEAD.test(text) || DASH_NOT_NUMBER.test(text)) return `'${text}`
  return text
}

function cellText(value: DelimitedCell): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : ""
  if (typeof value === "boolean") return value ? "Y" : ""
  return guardFormula(value)
}

export function escapeCsvCell(value: DelimitedCell): string {
  const text = cellText(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** 2차원 배열 → CSV 텍스트(CRLF). 첫 행을 머리글로 넘긴다. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<DelimitedCell>>): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")
}

export function escapeTsvCell(value: DelimitedCell): string {
  return cellText(value).replace(/[\t\r\n]+/g, " ")
}

/** 2차원 배열 → TSV 텍스트(LF). 스프레드시트에 붙여 넣으면 칸이 그대로 나뉜다. */
export function toTsv(rows: ReadonlyArray<ReadonlyArray<DelimitedCell>>): string {
  return rows.map((row) => row.map(escapeTsvCell).join("\t")).join("\n")
}

/** 파일 이름에 쓸 수 없는 문자를 걸러 낸다(한글은 그대로). */
export function safeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
  return cleaned || "export"
}

/** 로컬(KST 브라우저) 기준 YYYYMMDD — 파일 이름용. */
export function fileDateStamp(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}
