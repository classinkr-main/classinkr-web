import type { FormattedCell } from "@/lib/branch/google-sheets"
import { isBlueText, isRedBg, isRedText } from "@/lib/branch/google-sheets"

export const REV_RANGE = "'2. REV'!A1:CF400"
export const REV_COLS = {
  customer: 0, branchContact: 1, team: 2, manager: 3,
  dealType: 4, status: 5, firstPayment: 6, productVersion: 7,
  region: 8, importance: 10, note: 11, contractTarget: 12,
  monthlyStart: 13,
} as const

export interface RevDealParsed {
  sheet_row: number
  customer_name: string
  branch_contact: string | null
  team: string | null
  manager: string | null
  deal_type: string | null
  status: string | null
  first_payment: string | null
  product_version: string | null
  region: string | null
  importance: string | null
  note: string | null
  contract_target: number | null
  monthly_payments: Record<string, number>
  monthly_red: Record<string, boolean>
  // 주차(w1~w5) 칸 글자색 기반 금액 분해. 빨강 = 확정, 파랑 = 클로징 임박(90%+)
  monthly_confirmed: Record<string, number>
  monthly_high_conf: Record<string, number>
  // 주차 실수치(w1~w5, 최대 5칸). block.weekIdxs로 찾은 실제 열에서 직접 읽으므로
  // 다운스트림에서 고정 오프셋으로 열 위치를 재추정할 필요가 없다.
  weekly_payments: Record<string, number[]>
  raw: Record<string, unknown>
}

const TEAM_ALIASES: Record<string, string> = {
  "BD": "BD",
  "Business Development": "BD",
  "사업개발": "BD",
  "MK": "MKT",
  "MKT": "MKT",
  "Marketing": "MKT",
  "마케팅": "MKT",
  "CS": "CSM",
  "CSM": "CSM",
  "Customer Success": "CSM",
  "고객지원": "CSM",
}

export function normalizeTeam(raw: unknown): string | null {
  const s = raw == null ? "" : String(raw).trim()
  if (!s) return null
  return TEAM_ALIASES[s] ?? "기타"
}

const ymRe = /^(\d{4})-(\d{1,2})$/
const monthOnlyRe = /^([1-9]|1[0-2])월?$/

export function normalizeMonthHeader(value: unknown, refFy: number): string | null {
  if (value == null) return null
  const s = String(value).trim()
  const ym = s.match(ymRe)
  if (ym) return `${ym[1]}-${ym[2].padStart(2, "0")}`
  const mo = s.match(monthOnlyRe)
  if (mo) {
    const m = parseInt(mo[1], 10)
    const y = m >= 4 ? refFy : refFy + 1
    return `${y}-${String(m).padStart(2, "0")}`
  }
  return null
}

function asString(v: unknown): string | null { if (v == null) return null; const s = String(v).trim(); return s.length ? s : null }
function asNumber(v: unknown): number | null {
  if (v == null || v === "") return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  // Strip currency symbols, thousand separators, and whitespace
  const cleaned = String(v).replace(/[¥₩$€£,\s]/g, "")
  if (cleaned === "" || cleaned === "-") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}
function asDate(v: unknown): string | null {
  const s = asString(v)
  if (!s) return null
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`
}

export function parseRev(grid: FormattedCell[][], opts?: { refFy?: number }): RevDealParsed[] {
  if (grid.length < 2) return []
  const refFy = opts?.refFy ?? new Date().getUTCFullYear()
  const headers = grid[1] ?? []
  // 헤더 구조: 월 합계 칸("4".."12","1".."3") 뒤에 그 달의 주차 칸(w1~w5)이 이어진다.
  // 색 표시는 주차 칸에 들어가므로 월 블록 단위로 함께 읽는다. ("5w" 같은 오타 헤더도 허용)
  const monthBlocks: Array<{ ym: string; totalIdx: number; weekIdxs: number[] }> = []
  for (let i = REV_COLS.monthlyStart; i < headers.length; i++) {
    const v = headers[i]?.value
    if (v == null) continue
    const s = String(v).trim()
    if (/^([1-9]|1[0-2])$/.test(s)) {
      const month = parseInt(s, 10)
      const year = month >= 4 ? refFy : refFy + 1
      monthBlocks.push({ ym: `${year}-${String(month).padStart(2, "0")}`, totalIdx: i, weekIdxs: [] })
    } else if (/^(w\d|\dw)$/i.test(s) && monthBlocks.length > 0) {
      monthBlocks[monthBlocks.length - 1].weekIdxs.push(i)
    }
  }

  const out: RevDealParsed[] = []
  for (let r = 2; r < grid.length; r++) {
    const row = grid[r] ?? []
    const customer = asString(row[REV_COLS.customer]?.value)
    if (!customer) continue
    const monthly_payments: Record<string, number> = {}
    const monthly_red: Record<string, boolean> = {}
    const monthly_confirmed: Record<string, number> = {}
    const monthly_high_conf: Record<string, number> = {}
    const weekly_payments: Record<string, number[]> = {}
    for (const block of monthBlocks) {
      const totalCell = row[block.totalIdx]
      const total = asNumber(totalCell?.value)
      // block.weekIdxs는 헤더 텍스트로 찾은 이 달의 실제 주차 열 위치다. 값은 이 순서
      // 그대로 배열에 담아 내려보낸다 — 다운스트림에서 고정 오프셋 공식으로 열 위치를
      // 재추정하면(예전 weeklyPaymentsFromRaw 폴백) 블록 하나라도 어긋날 때 이후 달의
      // 주차 값이 전부 밀려 읽힌다.
      const weekValues: number[] = []
      let weekSum = 0
      let confirmed = 0
      let highConf = 0
      for (const weekIdx of block.weekIdxs) {
        const cell = row[weekIdx]
        const n = cell ? asNumber(cell.value) : null
        const amount = n ?? 0
        weekValues.push(amount)
        if (!cell || n == null || n === 0) continue
        weekSum += n
        // 운영 규칙: 빨간 글자 = 확정 매출 (과거 배경색 표기 호환), 파란 글자 = 클로징 임박(90%+)
        if (isRedText(cell.fg) || isRedBg(cell.bg)) confirmed += n
        else if (isBlueText(cell.fg)) highConf += n
      }
      const monthTotal = total ?? (weekSum !== 0 ? weekSum : null)
      if (monthTotal == null || monthTotal === 0) continue
      monthly_payments[block.ym] = monthTotal
      if (weekValues.some((value) => value !== 0)) weekly_payments[block.ym] = weekValues
      // 주차 입력 없이 월 합계 칸에만 적고 색을 칠한 행 호환
      if (totalCell && (isRedText(totalCell.fg) || isRedBg(totalCell.bg))) {
        confirmed = Math.max(confirmed, monthTotal)
      } else if (totalCell && isBlueText(totalCell.fg) && confirmed === 0) {
        highConf = Math.max(highConf, monthTotal)
      }
      if (confirmed > 0) {
        monthly_confirmed[block.ym] = confirmed
        monthly_red[block.ym] = true // 기존 브랜치 집계(boolean 기반) 호환 플래그
      }
      if (highConf > 0) monthly_high_conf[block.ym] = highConf
    }
    out.push({
      sheet_row: r + 1,
      customer_name: customer,
      branch_contact: asString(row[REV_COLS.branchContact]?.value),
      team: normalizeTeam(row[REV_COLS.team]?.value),
      manager: asString(row[REV_COLS.manager]?.value),
      deal_type: asString(row[REV_COLS.dealType]?.value),
      status: asString(row[REV_COLS.status]?.value),
      first_payment: asDate(row[REV_COLS.firstPayment]?.value),
      product_version: asString(row[REV_COLS.productVersion]?.value),
      region: asString(row[REV_COLS.region]?.value),
      importance: asString(row[REV_COLS.importance]?.value),
      note: asString(row[REV_COLS.note]?.value),
      contract_target: asNumber(row[REV_COLS.contractTarget]?.value),
      monthly_payments, monthly_red, monthly_confirmed, monthly_high_conf, weekly_payments,
      // weeklyPayments도 raw에 실어 보낸다 — pipeline.ts의 weeklyPaymentsFromRaw가
      // deal.raw.weeklyPayments를 우선 사용하므로, 고정 오프셋 추정 폴백을 타지 않는다.
      raw: { row: row.map((c) => c?.value ?? null), weeklyPayments: weekly_payments },
    })
  }
  return out
}
