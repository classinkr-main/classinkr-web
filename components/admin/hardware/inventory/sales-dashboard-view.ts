// 판매대시보드 화면 모델 — 순수 계산만 둔다(테스트 대상). 집계 규칙은 서버
// lib/repositories/hardware-sales-dashboard.ts 가 정본이고, 여기는 표시 형식만 정한다.
import type {
  HardwareSalesDashboard,
  SalesDashboardCounts,
  SalesDashboardLine,
} from "@/lib/repositories/hardware-sales-dashboard"

export interface SalesDashboardCellView {
  /** 설치 완료 수량 텍스트("9"). 설치·예정 둘 다 0이면 "". */
  installed: string
  /** "+3" — 배송 예정이 0이면 null(“+0” 은 숨긴다). */
  planned: string | null
  /** 회수 "회수 2" — 0이면 null. */
  returned: string | null
  empty: boolean
}

export type SalesDashboardTableRowKind = "item" | "subtotal" | "grand"

export interface SalesDashboardTableRow {
  key: string
  kind: SalesDashboardTableRowKind
  label: string
  /** 묶음 이름(품목 줄만) — 첫 품목 줄에서만 보인다. */
  groupLabel: string | null
  cells: SalesDashboardCellView[]
  undated: SalesDashboardCellView
  total: SalesDashboardCellView
}

export interface SalesDashboardColumn {
  key: string
  label: string
  /** 연도가 바뀌는 첫 달(1월)에 붙는 연도 표시. */
  yearHint: string | null
  current: boolean
}

const numberFormat = new Intl.NumberFormat("ko-KR")

export function formatSalesCell(counts: SalesDashboardCounts, options: { showZero?: boolean } = {}): SalesDashboardCellView {
  const empty = counts.installed === 0 && counts.planned === 0 && counts.returned === 0
  const showInstalled = counts.installed !== 0 || counts.planned !== 0 || options.showZero
  return {
    installed: showInstalled ? numberFormat.format(counts.installed) : "",
    planned: counts.planned !== 0 ? `+${numberFormat.format(counts.planned)}` : null,
    returned: counts.returned !== 0 ? `회수 ${numberFormat.format(counts.returned)}` : null,
    empty,
  }
}

/** "FY26 (2026.4 ~ 2027.3)" */
export function salesFyLabel(fy: number): string {
  return `FY${String(fy).slice(-2)} (${fy}.4 ~ ${fy + 1}.3)`
}

/** FY 선택지 — 현재 FY 와 직전 FY 는 늘 있고, 기록이 있는 이전 FY 를 더한다(내림차순). */
export function salesFyOptions(availableFys: readonly number[], currentFy: number): number[] {
  const set = new Set<number>([currentFy, currentFy - 1])
  for (const fy of availableFys) if (fy <= currentFy) set.add(fy)
  return Array.from(set).sort((a, b) => b - a)
}

/** 오늘(KST)이 속한 "YYYY-MM". */
export function currentMonthKey(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`
}

export function salesDashboardColumns(months: readonly string[], now: Date): SalesDashboardColumn[] {
  const today = currentMonthKey(now)
  return months.map((key, index) => {
    const [year, month] = key.split("-")
    const monthNumber = Number(month)
    return {
      key,
      label: `${monthNumber}월`,
      yearHint: index === 0 || monthNumber === 1 ? `'${year.slice(-2)}` : null,
      current: key === today,
    }
  })
}

function lineCells(line: SalesDashboardLine, showZeroTotal: boolean) {
  return {
    cells: line.months.map((counts) => formatSalesCell(counts)),
    undated: formatSalesCell(line.undated),
    total: formatSalesCell(line.total, { showZero: showZeroTotal }),
  }
}

/** 표 줄 — 묶음마다 품목 줄 + 소계 줄, 마지막에 합계 줄. */
export function buildSalesDashboardRows(dashboard: Pick<HardwareSalesDashboard, "groups" | "grandTotal">): SalesDashboardTableRow[] {
  const rows: SalesDashboardTableRow[] = []
  for (const group of dashboard.groups) {
    group.rows.forEach((row, index) => {
      rows.push({
        key: `${group.key}:${row.itemId ?? row.name}`,
        kind: "item",
        label: row.name,
        groupLabel: index === 0 ? group.label : null,
        ...lineCells(row, true),
      })
    })
    // 품목이 하나뿐인 묶음도 소계를 둔다 — 묶음 합계를 같은 자리에서 읽게 한다.
    rows.push({
      key: `${group.key}:subtotal`,
      kind: "subtotal",
      label: `${group.label} 소계`,
      groupLabel: group.rows.length === 0 ? group.label : null,
      ...lineCells(group.subtotal, true),
    })
  }
  rows.push({ key: "grand", kind: "grand", label: "합계", groupLabel: null, ...lineCells(dashboard.grandTotal, true) })
  return rows
}

/** 머리 요약 — FY 설치 완료·배송 예정·회수 합. */
export function salesDashboardHeadline(dashboard: Pick<HardwareSalesDashboard, "grandTotal">) {
  const { installed, planned, returned } = dashboard.grandTotal.total
  return {
    installed: numberFormat.format(installed),
    planned: numberFormat.format(planned),
    returned: numberFormat.format(returned),
    hasUndated: dashboard.grandTotal.undated.installed + dashboard.grandTotal.undated.planned + dashboard.grandTotal.undated.returned !== 0,
  }
}
