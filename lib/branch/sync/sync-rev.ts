import "server-only"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseRevWithStats, REV_RANGE, revParseWarning, revRowIdWarning, summarizeRevRowIds } from "@/lib/branch/parsers/rev"
import { dshParseWarning, parseDshWithStats, DSH_RANGE } from "@/lib/branch/parsers/dsh"
import { parseKpiBlocks, KPI_RANGE } from "@/lib/branch/parsers/kpi"
import { replaceBranchRevDeals } from "@/lib/repositories/branch-deals"
import { replaceBranchDshMirror, replaceBranchKpiMirror } from "@/lib/repositories/branch-dsh-kpi-mirror"
import type { FormattedCell } from "@/lib/branch/google-sheets"
import { businessFy } from "@/lib/branch/fiscal"
import { isRangeLikelyTruncated } from "./range-truncation"

// refFy(월 머리 "4"~"3" 을 어느 해로 읽을지)는 KST 업무일 회계연도다(F-26) — UTC 로 정하면 4월 1일 0~9시(KST)에 한 해 어긋난다.
// 시트 고정 중 "12/1 스냅샷 다시 읽기"는 runAll 이 고정 날짜의 회계연도를 넘긴다.
interface SheetSyncOptions {
  refFy?: number
}

// DSH 금액으로 못 읽은 칸(F-28)은 경고로만 싣는다 — 동기화는 성공이고 그 칸은 0 으로 읽힌다.
async function replaceDshKpiMirrors(
  refFy: number,
  dshGrid: FormattedCell[][],
  kpiGrid: FormattedCell[][],
): Promise<{ rows: number; warning?: string }> {
  const { output, stats } = parseDshWithStats(dshGrid, refFy)
  const dsh = await replaceBranchDshMirror(refFy, output)
  const kpi = await replaceBranchKpiMirror(refFy, parseKpiBlocks(kpiGrid))
  const warning = dshParseWarning(stats)
  return { rows: dsh + kpi, ...(warning ? { warning } : {}) }
}

// "rev" 소스 = 매출 대시보드 스프레드시트 전체. REV(계약)뿐 아니라 DSH/KPI 탭도
// 같은 시트라 함께 스냅샷한다 — 요청 경로(read-dsh-kpi.ts)가 라이브 시트 대신
// 이 미러를 읽으므로, 여기서 채우지 않으면 DB-우선 사다리가 성립하지 않는다.
export async function syncRev(opts: SheetSyncOptions = {}): Promise<{ rows: number; warning?: string }> {
  const sheetId = envSheetId("dashboard")
  const refFy = opts.refFy ?? businessFy()
  const [revGrid, dshGrid, kpiGrid] = await Promise.all([
    readRangeWithFormat(sheetId, REV_RANGE),
    readRangeWithFormat(sheetId, DSH_RANGE),
    readRangeWithFormat(sheetId, KPI_RANGE),
  ])
  const { deals: parsed, stats } = parseRevWithStats(revGrid, { refFy })
  const rows = parsed.map((p) => ({
    sheet_row: p.sheet_row, customer_name: p.customer_name, branch_contact: p.branch_contact,
    team: p.team, manager: p.manager, deal_type: p.deal_type, status: p.status,
    first_payment: p.first_payment, product_version: p.product_version, region: p.region,
    importance: p.importance, note: p.note,
    contract_target: p.contract_target == null ? "" : String(p.contract_target),
    monthly_payments: p.monthly_payments, monthly_red: p.monthly_red,
    monthly_confirmed: p.monthly_confirmed, monthly_high_conf: p.monthly_high_conf, raw: p.raw,
  }))
  const n = await replaceBranchRevDeals(rows)
  const dshKpi = await replaceDshKpiMirrors(refFy, dshGrid, kpiGrid)
  // 범위 상한 도달 = 시트가 범위보다 커져 뒷부분 행이 잘렸을 수 있다는 신호.
  // 동기화 자체는 여전히 성공이므로 에러로 취급하지 않고 경고만 실어 보낸다.
  const warnings: string[] = []
  if (isRangeLikelyTruncated(revGrid.length, REV_RANGE)) {
    warnings.push(`REV 범위(${REV_RANGE})가 상한에 도달했습니다 — 시트가 더 커졌다면 일부 행이 잘렸을 수 있습니다 (읽은 행 수: ${revGrid.length}).`)
  }
  // Row ID(시트 쓰기 행 식별 — ADR-011) 상태도 경고로만 싣는다. 장부 반영의 시트 쓰기가 그 행을 거절할 뿐
  // 동기화·집계는 Row ID 없이도 그대로다. 화면은 첫 경고만 보이므로 절단 경고를 앞에 둔다.
  const rowIdWarning = revRowIdWarning(summarizeRevRowIds(revGrid, parsed))
  if (rowIdWarning) warnings.push(rowIdWarning)
  // 금액으로 못 읽은 칸(F-28)·월 칸 ≠ 주차 합(F-15) 개수와 견본 — 동기화는 성공이고 집계 규칙은 파서·캐논이 정한다.
  const parseWarning = revParseWarning(stats)
  if (parseWarning) warnings.push(parseWarning)
  if (dshKpi.warning) warnings.push(dshKpi.warning)
  return { rows: n, warning: warnings.length > 0 ? warnings.join(" / ") : undefined }
}

// 시트 고정(lib/branch/rev-sheet-lock.ts) 뒤 크론·수동 동기화는 REV 대신 이것만 돌린다 — 같은 스프레드시트의 DSH·KPI 탭만
// 읽어 미러를 바꾼다(DSH 목표·KPI 는 계속 시트가 원본). REV 미러(branch_rev_deals)·장부 임포트는 건드리지 않는다.
export async function syncDshKpi(opts: SheetSyncOptions = {}): Promise<{ rows: number; warning?: string }> {
  const sheetId = envSheetId("dashboard")
  const refFy = opts.refFy ?? businessFy()
  const [dshGrid, kpiGrid] = await Promise.all([
    readRangeWithFormat(sheetId, DSH_RANGE),
    readRangeWithFormat(sheetId, KPI_RANGE),
  ])
  return replaceDshKpiMirrors(refFy, dshGrid, kpiGrid)
}
