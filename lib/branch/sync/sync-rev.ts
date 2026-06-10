import "server-only"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseRev, REV_RANGE } from "@/lib/branch/parsers/rev"
import { replaceBranchRevDeals } from "@/lib/repositories/branch-deals"
import { fyOf } from "@/lib/branch/fiscal"

export async function syncRev(): Promise<{ rows: number }> {
  const sheetId = envSheetId("dashboard")
  const grid = await readRangeWithFormat(sheetId, REV_RANGE)
  const refFy = fyOf(new Date())
  const parsed = parseRev(grid, { refFy })
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
  return { rows: n }
}
