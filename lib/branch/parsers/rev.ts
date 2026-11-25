import type { FormattedCell } from "@/lib/branch/google-sheets"
import { isBlueText, isRedBg, isRedText } from "@/lib/branch/google-sheets"
import { REV_ROW_ID_HEADER } from "@/lib/branch/sheet-writeback/config"
import { weekColorOf } from "@/lib/branch/sheet-writeback/colors"
import { isValidRowId } from "@/lib/branch/sheet-writeback/row-id"
import { fiscalYearOfYm } from "@/lib/branch/fiscal"
import { isUnparsedSheetAmount, sheetCellAmount } from "@/lib/branch/sheet-number"
import type { RevMonthWeekMismatch, RevPendingCell } from "@/lib/branch/computations/rev-confirmed"
import { getBusinessDateParts } from "@/lib/business-time"

// 예정 칸(raw.pendingCells)·월≠주 합(raw.monthWeekMismatch)의 모양은 캐논(rev-confirmed.ts)이 정한다 — 파서는 싣기만 한다.
export type { RevMonthWeekMismatch, RevPendingCell }

// 84열(A~CF) 뒤 숨김 "Row ID" 열(CG)까지 읽도록 CZ 로 넓혔다(ADR-011 — 장부 반영 때 시트 쓰기).
// 월 블록은 머리 글자로 찾으므로 오른쪽 여유 열은 금액에 섞이지 않는다. 행 상한(1000)은 그대로다.
export const REV_RANGE = "'2. REV'!A1:CZ1000"
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
// 별칭 배열 순서가 우선순위다 — v2 시트(FY26-27 Sales Ledger)처럼 Scale과 Importance가
// 둘 다 있으면 앞선 별칭(importance)이 이긴다.
const REV_HEADER_ALIASES: Partial<Record<RevColKey, string[]>> = {
  customer: ["account", "customer", "고객", "고객명", "거래처", "거래처명"],
  branchContact: ["branch", "지점", "브랜치"],
  region: ["city", "location", "region", "지역", "소재지"],
  importance: ["importance", "중요도", "tier", "등급", "scale"],
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
// 단, 헤더 행이 인식된 상태(별칭 매칭 1개 이상)에서 별칭에 안 걸린 키의 기본 위치에
// "다른 이름의 헤더"가 붙어 있으면 그 열을 읽지 않는다(-1 → 값 null). v2 시트의 [12] "Sum"
// (행 총합)이 contractTarget 기본 위치로 흘러들어 CRM 매칭 금액을 오염시키는 것을 막는다.
export function resolveRevColumns(headers: FormattedCell[]): Record<RevColKey, number> {
  const resolved: Record<RevColKey, number> = { ...REV_COLS }
  const limit = Math.min(headers.length, REV_COLS.monthlyStart) // 월 금액 영역 이전만 매칭
  const used = new Set<number>()
  const matched = new Set<RevColKey>()
  for (const key of Object.keys(REV_HEADER_ALIASES) as RevColKey[]) {
    const aliases = REV_HEADER_ALIASES[key]!
    outer: for (const alias of aliases) {
      for (let i = 0; i < limit; i++) {
        if (used.has(i)) continue
        if (normalizeHeaderText(headers[i]?.value) === alias) {
          resolved[key] = i
          used.add(i)
          matched.add(key)
          break outer
        }
      }
    }
  }
  if (matched.size > 0) {
    for (const key of Object.keys(REV_HEADER_ALIASES) as RevColKey[]) {
      if (matched.has(key)) continue
      if (normalizeHeaderText(headers[resolved[key]]?.value)) resolved[key] = -1
    }
  }
  return resolved
}

// '2. REV' 숨김 "Row ID" 열 — 행 번호가 바뀌어도 시트 쓰기가 같은 행을 다시 찾는 열쇠다.
// 머리는 월 영역(REV_COLS.monthlyStart)부터 찾고, 앞뒤 공백·대소문자만 무시한 정확 일치다 —
// lib/branch/sheet-writeback/layout.ts resolveRevLayout 과 같은 판정이라 두 쪽이 같은 열을 본다.
// "Row ID" 는 월("4")·주차("w1") 머리 정규식에 걸리지 않으므로 월 블록에 섞이지 않는다.
export type RevRowIdIssue = "invalid" | "duplicate"

export interface RevRowIdColumn {
  /** 머리가 정확히 하나일 때 그 열(0-based). 없거나 둘 이상이면 null — 행 ID 를 읽지 않는다. */
  col: number | null
  /** "Row ID" 머리가 붙은 열 전부(진단용 — 둘 이상이면 시트 쓰기도 layout_changed 로 막힌다). */
  headerCols: number[]
}

export function resolveRevRowIdColumn(headers: FormattedCell[]): RevRowIdColumn {
  const target = REV_ROW_ID_HEADER.toLowerCase()
  const headerCols: number[] = []
  for (let i = REV_COLS.monthlyStart; i < headers.length; i++) {
    const v = headers[i]?.value
    if (v != null && String(v).trim().toLowerCase() === target) headerCols.push(i)
  }
  return { col: headerCols.length === 1 ? headerCols[0] : null, headerCols }
}

// 칸 값의 앞뒤 공백은 지운다 — 쓰기 직전 행 찾기(sheet-writeback/plan.ts liveRowId)도 trim 한 값을 본다.
function rowIdText(cell: FormattedCell | undefined): string | null {
  const v = cell?.value
  if (v == null) return null
  const s = String(v).trim()
  return s.length ? s : null
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
function asDate(v: unknown): string | null {
  const s = asString(v)
  if (!s) return null
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`
}

// 원장 주차 칸의 시작일(Compass ADR-0062와 같은 규칙) — 머리에 날짜가 없어 7일 묶음 관례를 쓴다.
// w1 = 1일, w2 = 8일, w3 = 15일, w4 = 22일, w5 = 29일, 월 합계 칸(week 0)은 1일.
export function ledgerCellStart(ym: string, week: number): string {
  const day = week <= 1 ? 1 : 1 + 7 * (week - 1)
  return `${ym}-${String(day).padStart(2, "0")}`
}

// 시작일이 오늘(KST, YYYY-MM-DD) 뒤인 칸의 빨간 금액은 결제가 아니라 예정이다. 시작일 당일부터 확정.
export const isFutureLedgerCell = (ym: string, week: number, today: string) => ledgerCellStart(ym, week) > today

/** '2. REV' 월 블록 — 월 합계 칸 하나와 그 뒤 주차 칸들(w1~w5, '5w' 같은 표기 포함). */
export interface RevMonthBlock {
  ym: string
  totalIdx: number
  weekIdxs: number[]
}

/**
 * 머리 행에서 월 블록을 찾는다. 월 합계 칸("4".."12","1".."3") 뒤에 그 달의 주차 칸이 이어진다 — 색 표시는
 * 주차 칸에 들어가므로 월 블록 단위로 함께 읽는다. 7월 다섯째 주처럼 "5w" 로 적힌 머리도 주차다. 2월은 주차가 넷이다.
 * refFy 는 "4"~"12" 의 해, "1"~"3" 은 refFy+1 년이다. 대조 도구(reconcile)가 파서와 같은 열 배치를 쓰게 내보낸다.
 */
export function resolveRevMonthBlocks(
  headers: FormattedCell[],
  refFy: number,
  monthlyStart: number = REV_COLS.monthlyStart,
): RevMonthBlock[] {
  const monthBlocks: RevMonthBlock[] = []
  for (let i = monthlyStart; i < headers.length; i++) {
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
  return monthBlocks
}

/** 파싱 진단 — 동기화가 경고로 싣는다(F-28 못 읽은 금액 칸, F-15 월≠주 합). */
export interface RevParseStats {
  /** 값이 적혀 있는데 금액으로 못 읽은 월·주차 칸 수(고객 행만). */
  unparsedAmountCells: number
  /** 못 읽은 칸 예시(최대 5개) — 시트 행 번호(1-based)·열(0-based)·표시 글자. */
  unparsedSamples: Array<{ row: number; col: number; text: string }>
  /** 월 칸 ≠ 주차 칸 합인 (행, 달) 수. */
  monthWeekMismatches: number
}

export interface RevParseOptions {
  /** 월 머리 "4"~"3" 을 어느 회계연도로 읽을지. 없으면 today(KST)의 회계연도(F-26 — 예전 기본값은 달력 연도였다). */
  refFy?: number
  /** 파싱 기준일(KST 'YYYY-MM-DD'). 없으면 지금의 KST 영업일. */
  today?: string
}

const UNPARSED_SAMPLE_LIMIT = 5
// 월 칸과 주차 합을 같다고 보는 허용 오차(반 펀) — 소수 합산 오차만 흡수한다.
const MONTH_WEEK_TOLERANCE = 0.005

export function parseRev(grid: FormattedCell[][], opts?: RevParseOptions): RevDealParsed[] {
  return parseRevWithStats(grid, opts).deals
}

export function parseRevWithStats(
  grid: FormattedCell[][],
  opts?: RevParseOptions,
): { deals: RevDealParsed[]; stats: RevParseStats } {
  const stats: RevParseStats = { unparsedAmountCells: 0, unparsedSamples: [], monthWeekMismatches: 0 }
  if (grid.length < 2) return { deals: [], stats }
  // 파싱 기준일. 테스트 주입용 — 기본값은 동기화 시점의 KST 오늘. 예정 칸은 raw.pendingCells 로 남아 읽는 시점에 판정된다.
  const today = opts?.today ?? getBusinessDateParts().date
  const refFy = opts?.refFy ?? fiscalYearOfYm(today)
  const headers = grid[1] ?? []
  const cols = resolveRevColumns(headers)
  const monthBlocks = resolveRevMonthBlocks(headers, refFy, cols.monthlyStart)
  const noteUnparsed = (cell: FormattedCell | undefined, r: number, col: number) => {
    if (!isUnparsedSheetAmount(cell)) return
    stats.unparsedAmountCells += 1
    if (stats.unparsedSamples.length < UNPARSED_SAMPLE_LIMIT) {
      stats.unparsedSamples.push({ row: r + 1, col, text: String(cell?.value ?? "").slice(0, 40) })
    }
  }

  // Row ID: 한 번 파싱 안에서 같은 ID 가 둘 이상이면 그 행 모두 duplicate 이고 rowId 는 null 이다.
  // 고객명이 빈 행도 센다 — 쓰기 직전 행 찾기(sheet-writeback/plan.ts)가 3행부터 모든 행을 보므로
  // 여기서 한 행만 있다고 보면 화면은 쓸 수 있다고 하고 서버는 row_id_duplicate 로 막는다.
  const rowIdCol = resolveRevRowIdColumn(headers).col
  const rowIdCounts = new Map<string, number>()
  if (rowIdCol != null) {
    for (let r = 2; r < grid.length; r++) {
      const id = rowIdText(grid[r]?.[rowIdCol])
      if (id && isValidRowId(id)) rowIdCounts.set(id, (rowIdCounts.get(id) ?? 0) + 1)
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
    // ADR-0062: 아직 오지 않은 주차의 빨간 금액(예정). DB 칼럼 없이 raw에만 싣는다.
    const monthly_pending: Record<string, number> = {}
    // 예정 칸의 주차 번호(1~5, 월 합계 칸 = 0) — 화면이 "w4 시작 10/22에 확정 전환"을 말하는 근거.
    const pending_weeks: Record<string, number[]> = {}
    // 예정 칸 하나하나(주차·시작일·금액) — 캐논이 읽는 시점(KST)에 시작일이 지난 칸을 확정으로 올린다(F-08).
    const pending_cells: Record<string, RevPendingCell[]> = {}
    // 적어 둔 월 칸 ≠ 주차 합(F-15) — 캐논이 확정·고확도를 월 합계 안으로 자른다.
    const month_week_mismatch: Record<string, RevMonthWeekMismatch> = {}
    // 그 달 주차 칸 순서의 확도 글자("rk--b"). 값 있는 칸(>0)은 글자색(r 빨강·b 파랑·k 그 밖),
    // 값 없는 칸은 '-'. 초안 baseline(sheet-writeback/baseline.ts)이 읽는다 — 키는 weekly_payments 와 같다.
    const weekly_colors: Record<string, string> = {}
    for (const block of monthBlocks) {
      const totalCell = row[block.totalIdx]
      // 금액은 칸의 실제 숫자(effectiveValue)를 먼저 읽는다 — '(1,750)'·'−1,750' 환불이 빠지지 않는다(F-28).
      const total = sheetCellAmount(totalCell)
      noteUnparsed(totalCell, r, block.totalIdx)
      // block.weekIdxs는 헤더 텍스트로 찾은 이 달의 실제 주차 열 위치다. 값은 이 순서
      // 그대로 배열에 담아 내려보낸다 — 다운스트림에서 고정 오프셋 공식으로 열 위치를
      // 재추정하면(예전 weeklyPaymentsFromRaw 폴백) 블록 하나라도 어긋날 때 이후 달의
      // 주차 값이 전부 밀려 읽힌다.
      const weekValues: number[] = []
      let weekSum = 0
      let confirmed = 0
      let highConf = 0
      let hasWeekValue = false
      let hasConfirmed = false
      let hasHighConf = false
      let pending = 0
      let hasPending = false
      const pendingWeekNos: number[] = []
      const pendingCells: RevPendingCell[] = []
      let weekMarks = ""
      for (const [weekPos, weekIdx] of block.weekIdxs.entries()) {
        const cell = row[weekIdx]
        const n = sheetCellAmount(cell)
        noteUnparsed(cell, r, weekIdx)
        const amount = n ?? 0
        weekValues.push(amount)
        // 글자색만 본다(배경 빨강 호환은 확정 집계에만) — 쓰기 직전 비교(plan.ts liveWeeks)도 글자색만 본다.
        weekMarks += n != null && n > 0 ? weekColorOf(cell?.fg) : "-"
        if (!cell || n == null) continue
        hasWeekValue = true
        weekSum += n
        // 운영 규칙: 빨간 글자 = 확정 매출 (과거 배경색 표기 호환), 파란 글자 = 클로징 임박(90%+)
        if (isRedText(cell.fg) || isRedBg(cell.bg)) {
          const week = weekPos + 1
          if (isFutureLedgerCell(block.ym, week, today)) {
            pending += n; hasPending = true; pendingWeekNos.push(week)
            pendingCells.push({ week, start: ledgerCellStart(block.ym, week), amount: n })
          }
          else { confirmed += n; hasConfirmed = true }
        }
        else if (isBlueText(cell.fg)) { highConf += n; hasHighConf = true }
      }
      const monthTotal = total ?? (hasWeekValue ? weekSum : null)
      if (monthTotal == null) continue
      monthly_payments[block.ym] = monthTotal
      if (hasWeekValue) {
        weekly_payments[block.ym] = weekValues
        weekly_colors[block.ym] = weekMarks
        // 월 칸에 상수를 적어 주차 합과 달라진 달(예: 월 0 · 주차 빨강 500). 진짜 상계(+100 빨강 · −100 검정 → 월 0)는
        // 주차 합도 0 이라 여기 걸리지 않는다 — 캐논의 부호 보존 규칙은 그대로다.
        if (total != null && Math.abs(total - weekSum) > MONTH_WEEK_TOLERANCE) {
          month_week_mismatch[block.ym] = { month: total, weeks: weekSum }
          stats.monthWeekMismatches += 1
        }
      }
      // 주차 입력 없이 월 합계 칸에만 적고 색을 칠한 행 호환
      if (!hasWeekValue && total != null && totalCell) {
        if (isRedText(totalCell.fg) || isRedBg(totalCell.bg)) {
          if (isFutureLedgerCell(block.ym, 0, today)) {
            pending = monthTotal; hasPending = true; pendingWeekNos.push(0)
            pendingCells.push({ week: 0, start: ledgerCellStart(block.ym, 0), amount: monthTotal })
          }
          else { confirmed = monthTotal; hasConfirmed = true }
        }
        else if (isBlueText(totalCell.fg)) { highConf = monthTotal; hasHighConf = true }
      }
      if (hasConfirmed) {
        monthly_confirmed[block.ym] = confirmed
        monthly_red[block.ym] = true // 기존 브랜치 집계(boolean 기반) 호환 플래그
      } else if (hasPending) {
        // 빨간 칸이 전부 예정이면 확정 0을 명시한다 — 비워 두면 캐논의 무색상 폴백이 당월 전액을 확정으로 올린다.
        // 이 0 키가 있어야 캐논이 pendingCells 를 확정으로 올린다(키가 지워진 달은 올리지 않는다).
        monthly_confirmed[block.ym] = 0
      }
      if (hasPending) {
        monthly_pending[block.ym] = pending
        pending_weeks[block.ym] = pendingWeekNos
        pending_cells[block.ym] = pendingCells
      }
      if (hasHighConf) monthly_high_conf[block.ym] = highConf
    }
    let rowId: string | null = null
    let rowIdIssue: RevRowIdIssue | null = null
    if (rowIdCol != null) {
      const id = rowIdText(row[rowIdCol])
      if (id) {
        if (!isValidRowId(id)) rowIdIssue = "invalid"
        else if ((rowIdCounts.get(id) ?? 0) > 1) rowIdIssue = "duplicate"
        else rowId = id
      }
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
      contract_target: sheetCellAmount(row[cols.contractTarget]),
      monthly_payments, monthly_red, monthly_confirmed, monthly_high_conf, weekly_payments,
      // weeklyPayments도 raw에 실어 보낸다 — pipeline.ts의 weeklyPaymentsFromRaw가
      // deal.raw.weeklyPayments를 우선 사용하므로, 고정 오프셋 추정 폴백을 타지 않는다.
      // monthlyPending은 표시용 — 확정 집계(rev-confirmed.ts)는 pendingCells 를 읽는 시점(KST)에 판정한다.
      // rowId·rowIdIssue·weeklyColors 는 시트 쓰기(ADR-011)용 — 금액·확도 집계는 읽지 않는다.
      // pendingCells·monthWeekMismatch 는 있을 때만 싣는다(대부분의 행은 없다 — raw 를 늘리지 않는다).
      raw: {
        row: row.map((c) => c?.value ?? null),
        weeklyPayments: weekly_payments,
        monthlyPending: monthly_pending,
        pendingWeeks: pending_weeks,
        ...(Object.keys(pending_cells).length > 0 ? { pendingCells: pending_cells } : {}),
        ...(Object.keys(month_week_mismatch).length > 0 ? { monthWeekMismatch: month_week_mismatch } : {}),
        rowId,
        rowIdIssue,
        weeklyColors: weekly_colors,
      },
    })
  }
  return { deals: out, stats }
}

/** 파싱 진단 경고 한 줄(동기화가 싣는다). 문제가 없으면 undefined — 동기화 실패로 치지 않는다(경고만). */
export function revParseWarning(stats: RevParseStats): string | undefined {
  const parts: string[] = []
  if (stats.unparsedAmountCells > 0) {
    const where = stats.unparsedSamples.map((sample) => `${sample.row}행 '${sample.text}'`).join(", ")
    parts.push(`금액으로 못 읽은 칸 ${stats.unparsedAmountCells}개${where ? `(${where})` : ""}`)
  }
  if (stats.monthWeekMismatches > 0) parts.push(`월 칸과 주차 합이 다른 달 ${stats.monthWeekMismatches}개`)
  return parts.length > 0 ? `REV ${parts.join(" · ")}` : undefined
}

export interface RevRowIdSummary {
  /** present = "Row ID" 머리 하나 · missing = 없음(행 ID 스크립트 전) · ambiguous = 둘 이상 */
  column: "present" | "missing" | "ambiguous"
  /** 고객 행 중 Row ID 칸이 빈 행 수(column=present 일 때만 센다) */
  missing: number
  duplicate: number
  invalid: number
}

/** parseRev 결과(raw.rowId·raw.rowIdIssue)로 Row ID 상태를 센다 — 동기화 경고용. */
export function summarizeRevRowIds(grid: FormattedCell[][], parsed: RevDealParsed[]): RevRowIdSummary {
  const { col, headerCols } = resolveRevRowIdColumn(grid[1] ?? [])
  const column = col != null ? "present" : headerCols.length > 1 ? "ambiguous" : "missing"
  const summary: RevRowIdSummary = { column, missing: 0, duplicate: 0, invalid: 0 }
  if (column !== "present") return summary
  for (const deal of parsed) {
    const issue = deal.raw.rowIdIssue
    if (issue === "duplicate") summary.duplicate += 1
    else if (issue === "invalid") summary.invalid += 1
    else if (!isValidRowId(deal.raw.rowId)) summary.missing += 1
  }
  return summary
}

/** 동기화 경고 한 줄. 문제가 없으면 undefined — 동기화 실패로 치지 않는다(경고만). */
export function revRowIdWarning(summary: RevRowIdSummary): string | undefined {
  if (summary.column === "missing") return "Row ID 열 없음 — 시트 쓰기 불가(행 ID 스크립트 필요)"
  if (summary.column === "ambiguous") return "Row ID 열이 여럿 — 시트 쓰기 불가(관리자 확인 필요)"
  const parts: string[] = []
  if (summary.missing > 0) parts.push(`없음 ${summary.missing}`)
  if (summary.duplicate > 0) parts.push(`중복 ${summary.duplicate}`)
  if (summary.invalid > 0) parts.push(`형식 오류 ${summary.invalid}`)
  return parts.length > 0 ? `Row ID ${parts.join(" · ")}` : undefined
}
