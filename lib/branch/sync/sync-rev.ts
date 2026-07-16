import "server-only"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseRev, REV_RANGE } from "@/lib/branch/parsers/rev"
import { parseDsh, DSH_RANGE } from "@/lib/branch/parsers/dsh"
import { parseKpiBlocks, KPI_RANGE } from "@/lib/branch/parsers/kpi"
import { replaceBranchRevDeals } from "@/lib/repositories/branch-deals"
import { replaceBranchDshMirror, replaceBranchKpiMirror } from "@/lib/repositories/branch-dsh-kpi-mirror"
import { fyOf } from "@/lib/branch/fiscal"

// "rev" 소스 = 매출 대시보드 스프레드시트 전체. REV(계약)뿐 아니라 DSH/KPI 탭도
// 같은 시트라 함께 스냅샷한다 — 요청 경로(read-dsh-kpi.ts)가 라이브 시트 대신
// 이 미러를 읽으므로, 여기서 채우지 않으면 DB-우선 사다리가 성립하지 않는다.
export async function syncRev(): Promise<{ rows: number }> {
  const sheetId = envSheetId("dashboard")
  const refFy = fyOf(new Date())
  const [revGrid, dshGrid, kpiGrid] = await Promise.all([
    readRangeWithFormat(sheetId, REV_RANGE),
    readRangeWithFormat(sheetId, DSH_RANGE),
    readRangeWithFormat(sheetId, KPI_RANGE),
  ])
  const parsed = parseRev(revGrid, { refFy })
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
  await replaceBranchDshMirror(refFy, parseDsh(dshGrid, refFy))
  await replaceBranchKpiMirror(refFy, parseKpiBlocks(kpiGrid))
  return { rows: n }
}
