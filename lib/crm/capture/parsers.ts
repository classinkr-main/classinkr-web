import { normalizeRegionLabel } from "@/lib/regions/korea-regions"

// 접점 캡처 파서(capture-layer §6.4/§6.5). 순수 함수, LLM 없음.
// 완벽한 자동 인식보다 "검토 가능한 행"으로 바꾸는 것이 목표(§3.2).

export interface ParsedRow {
  rawText: string
  organizationName: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  regionLabel: string | null
  memo: string | null
}

export type CaptureField = "organizationName" | "contactName" | "phone" | "email" | "regionLabel" | "memo"
export type ColumnMap = Array<CaptureField | null>

const PHONE_RE = /0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}/
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/
const ORG_SUFFIX_RE = /(학원|어학원|캠퍼스|센터|학교|유치원|교습소|공부방|회사|\(주\)|㈜)$/
const HONORIFIC_RE = /(원장|선생님|선생|대표님|대표|실장|팀장|이사|부장|과장|샘|쌤)$/

const HEADER_FIELD_KEYWORDS: Array<[CaptureField, RegExp]> = [
  ["phone", /전화|연락처|휴대폰|핸드폰|phone|tel|mobile|hp/i],
  ["email", /이메일|메일|email|mail/i],
  ["organizationName", /기관|학원|회사|업체|소속|상호|거래처|org/i],
  ["contactName", /이름|성함|담당자|성명|연락담당|name/i],
  ["regionLabel", /지역|주소|소재|region|area|addr/i],
  ["memo", /메모|비고|내용|note|memo|remark/i],
]

const DEFAULT_POSITIONAL_MAP: ColumnMap = ["organizationName", "contactName", "phone", "email"]

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function extractPhone(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(PHONE_RE)
  return match ? match[0].replace(/[\s.]/g, "-").replace(/-+/g, "-") : null
}

export function extractEmail(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(EMAIL_RE)
  return match ? match[0] : null
}

function looksLikeName(token: string): string | null {
  const t = token.trim()
  if (HONORIFIC_RE.test(t)) {
    const stripped = t.replace(HONORIFIC_RE, "").trim()
    return stripped.length >= 2 ? stripped : t
  }
  // 순수 한글 2~4자 토큰을 이름 후보로 본다.
  if (/^[가-힣]{2,4}$/.test(t)) return t
  return null
}

function headerFieldFor(cell: string): CaptureField | null {
  for (const [field, pattern] of HEADER_FIELD_KEYWORDS) {
    if (pattern.test(cell)) return field
  }
  return null
}

function detectDelimiter(lines: string[]): "\t" | "," {
  return lines.some((line) => line.includes("\t")) ? "\t" : ","
}

function splitCells(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((cell) => cell.trim())
}

function buildRowFromCells(cells: string[], map: ColumnMap): ParsedRow {
  const fields: Partial<Record<CaptureField, string>> = {}
  const memoExtras: string[] = []
  cells.forEach((cell, index) => {
    if (!cell) return
    const field = map[index] ?? null
    if (!field) {
      memoExtras.push(cell)
      return
    }
    if (field === "memo") {
      memoExtras.push(cell)
      return
    }
    if (!fields[field]) fields[field] = cell
  })

  const regionRaw = fields.regionLabel ?? null
  return {
    rawText: cells.filter(Boolean).join(" · "),
    organizationName: trimOrNull(fields.organizationName),
    contactName: trimOrNull(fields.contactName),
    phone: extractPhone(fields.phone) ?? trimOrNull(fields.phone),
    email: extractEmail(fields.email) ?? trimOrNull(fields.email),
    regionLabel: normalizeRegionLabel(regionRaw) ?? trimOrNull(regionRaw),
    memo: memoExtras.length ? memoExtras.join(" · ") : null,
  }
}

export interface ParseTabularOptions {
  hasHeader?: boolean
  mapping?: ColumnMap
}

export interface ParseTabularResult {
  rows: ParsedRow[]
  detectedHeader: boolean
  columnMap: ColumnMap
  headerCells: string[] | null
}

export function parseTabularGrid(raw: string, options: ParseTabularOptions = {}): ParseTabularResult {
  const lines = (raw ?? "").split(/\r?\n/).map((line) => line.replace(/\s+$/, "")).filter((line) => line.trim().length > 0)
  if (lines.length === 0) {
    return { rows: [], detectedHeader: false, columnMap: [], headerCells: null }
  }

  const delimiter = detectDelimiter(lines)
  const grid = lines.map((line) => splitCells(line, delimiter))
  const firstRow = grid[0]

  // 헤더 자동 감지: 첫 행 셀 중 2개 이상이 헤더 키워드와 매칭되면 헤더로 본다.
  const headerMatches = firstRow.map((cell) => headerFieldFor(cell))
  const autoHasHeader = headerMatches.filter(Boolean).length >= 2
  const hasHeader = options.hasHeader ?? autoHasHeader

  let columnMap: ColumnMap
  let headerCells: string[] | null = null
  if (options.mapping && options.mapping.length > 0) {
    columnMap = options.mapping
  } else if (hasHeader) {
    columnMap = headerMatches
    headerCells = firstRow
  } else {
    columnMap = DEFAULT_POSITIONAL_MAP
  }

  const dataRows = hasHeader ? grid.slice(1) : grid
  const rows = dataRows.map((cells) => buildRowFromCells(cells, columnMap)).filter((row) => Boolean(row.rawText))
  return { rows, detectedHeader: hasHeader, columnMap, headerCells }
}

export function parseUnstructuredLines(raw: string): ParsedRow[] {
  const lines = (raw ?? "").split(/\r?\n/)
  const rows: ParsedRow[] = []
  for (const line of lines) {
    // 카톡 타임스탬프/발신자 접두, 불릿, 번호 제거
    const cleaned = line
      .replace(/^\s*\[[^\]]+\]\s*\[[^\]]+\]\s*/, "")
      .replace(/^\s*[-•*]\s+/, "")
      .replace(/^\s*\d+[.)]\s+/, "")
      .trim()
    if (!cleaned) continue

    const phone = extractPhone(cleaned)
    const email = extractEmail(cleaned)

    let work = cleaned
    if (phone) work = work.replace(PHONE_RE, " ")
    if (email) work = work.replace(EMAIL_RE, " ")

    const segments = work.split(/[/|·]/).map((segment) => segment.trim()).filter(Boolean)
    const tokens = (segments.length > 1 ? segments : work.split(/\s+/)).map((token) => token.trim()).filter(Boolean)

    let organizationName: string | null = null
    let contactName: string | null = null
    let regionLabel: string | null = null
    for (const token of tokens) {
      if (!regionLabel) {
        const region = normalizeRegionLabel(token)
        if (region) {
          regionLabel = region
          continue
        }
      }
      if (!organizationName && ORG_SUFFIX_RE.test(token)) {
        organizationName = token
        continue
      }
      if (!contactName) {
        const name = looksLikeName(token)
        if (name) {
          contactName = name
          continue
        }
      }
    }

    rows.push({
      rawText: cleaned,
      organizationName,
      contactName,
      phone,
      email,
      regionLabel,
      memo: cleaned,
    })
  }
  return rows
}
