import type { FormattedCell } from "@/lib/branch/google-sheets"
import { isBlueText, isRedBg, isRedText } from "@/lib/branch/google-sheets"

export const REV_RANGE = "'2. REV'!A1:CF400"
// 실제 '2. REV' 시트 좌측 메타 열 위치 — 원본 raw.row(84칸)로 실측 확정(2026-07-03).
// City/Scale/Porta 열이 왼쪽에 끼면서 예전 매핑이 우측으로 밀려 team=City, manager=Scale,
// productVersion=Status로 잘못 읽히고 Product(HW/SW 신호) 열은 아예 안 읽히던 버그를 교정.
// 월/주차 금액은 헤더 텍스트(monthBlocks)로 찾으므로 이 좌측 메타 교정과 독립적이다.
export const REV_COLS = {
  customer: 0, branchContact: 1, region: 2, importance: 3,
  team: 5, manager: 6, status: 7, dealType: 8,
  productVersion: 9, firstPayment: 10, note: 11, contractTarget: 12,
  monthlyStart: 13,
} as const

type RevColKey = keyof typeof REV_COLS

// 헤더 텍스트 → 필드. 회사 시트 열이 또 밀려도(자주 바뀜) 헤더로 재정렬되게 한다.
// 좌측 메타 영역(월 시작 이전)에서만 정확 일치로 매칭하고, 못 찾으면 REV_COLS 기본 위치로 폴백.
const REV_HEADER_ALIASES: Partial<Record<RevColKey, string[]>> = {
  customer: ["account", "customer", "고객", "고객명", "거래처", "거래처명"],
  branchContact: ["branch", "지점", "브랜치"],
  region: ["city", "location", "region", "지역", "소재지"],
  importance: ["scale", "tier", "등급", "중요도"],
  team: ["team", "팀"],
  manager: ["manager", "owner", "담당", "담당자"],
  status: ["status", "상태"],
  dealType: ["type", "channel", "유형", "구분", "채널"],
  productVersion: ["product", "product version", "상품", "제품"],
  firstPayment: ["first payment", "firstpay", "first pay", "첫 결제", "첫결제", "최초결제"],
  note: ["note", "remark", "비고", "메모", "특이사항"],
  contractTarget: ["target", "contract target", "객통", "객통금", "목표"],
}

function normalizeHeaderText(v: unknown): string {
  return v == null ? "" : String(v).trim().toLowerCase().replace(/\s+/g, " ")
}

// 헤더 행에서 필드별 실제 열 인덱스를 해석한다. 인식 못 하면 REV_COLS 기본 위치를 유지한다.
export function resolveRevColumns(headers: FormattedCell[]): Record<RevColKey, number> {
  const resolved: Record<RevColKey, number> = { ...REV_COLS }
  const limit = Math.min(headers.length, REV_COLS.monthlyStart) // 월 금액 영역 이전만 매칭
  const used = new Set<number>()
  for (const key of Object.keys(REV_HEADER_ALIASES) as RevColKey[]) {
    const aliases = REV_HEADER_ALIASES[key]!
    for (let i = 0; i < limit; i++) {
      if (used.has(i)) continue
      const header = normalizeHeaderText(headers[i]?.value)
      if (header && aliases.includes(header)) {
        resolved[key] = i
        used.add(i)
        break
      }
    }
  }
  return resolved
}

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
  const cols = resolveRevColumns(headers)
  // 헤더 구조: 월 합계 칸("4".."12","1".."3") 뒤에 그 달의 주차 칸(w1~w5)이 이어진다.
  // 색 표시는 주차 칸에 들어가므로 월 블록 단위로 함께 읽는다. ("5w" 같은 오타 헤더도 허용)
  const monthBlocks: Array<{ ym: string; totalIdx: number; weekIdxs: number[] }> = []
  for (let i = cols.monthlyStart; i < headers.length; i++) {
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
    const customer = asString(row[cols.customer]?.value)
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
      branch_contact: asString(row[cols.branchContact]?.value),
      team: normalizeTeam(row[cols.team]?.value),
      manager: asString(row[cols.manager]?.value),
      deal_type: asString(row[cols.dealType]?.value),
      status: asString(row[cols.status]?.value),
      first_payment: asDate(row[cols.firstPayment]?.value),
      product_version: asString(row[cols.productVersion]?.value),
      region: asString(row[cols.region]?.value),
      importance: asString(row[cols.importance]?.value),
      note: asString(row[cols.note]?.value),
      contract_target: asNumber(row[cols.contractTarget]?.value),
      monthly_payments, monthly_red, monthly_confirmed, monthly_high_conf, weekly_payments,
      // weeklyPayments도 raw에 실어 보낸다 — pipeline.ts의 weeklyPaymentsFromRaw가
      // deal.raw.weeklyPayments를 우선 사용하므로, 고정 오프셋 추정 폴백을 타지 않는다.
      raw: { row: row.map((c) => c?.value ?? null), weeklyPayments: weekly_payments },
    })
  }
  return out
}
