import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { unstable_cache } from "next/cache"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseDsh, DSH_RANGE } from "@/lib/branch/parsers/dsh"
import { parseSeg, SEG_RANGE } from "@/lib/branch/parsers/seg"
import { parseKpi, KPI_RANGE } from "@/lib/branch/parsers/kpi"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { listHwInbound, listHwOutbound, listHwStock } from "@/lib/repositories/branch-hw"
import { DATA_QUALITY_RULE_COUNT, runDataQuality } from "@/lib/branch/computations/data-quality"
import { fyOf } from "@/lib/branch/fiscal"

const readDsh = unstable_cache(
  async () => parseDsh(await readRangeWithFormat(envSheetId("dashboard"), DSH_RANGE), fyOf(new Date())),
  ["branch-dsh"], { revalidate: 60, tags: ["branch-dsh"] },
)
const readSeg = unstable_cache(
  async () => parseSeg(await readRangeWithFormat(envSheetId("dashboard"), SEG_RANGE)),
  ["branch-seg"], { revalidate: 60, tags: ["branch-seg"] },
)
const readKpi = unstable_cache(
  async () => parseKpi(await readRangeWithFormat(envSheetId("dashboard"), KPI_RANGE)),
  ["branch-kpi"], { revalidate: 60, tags: ["branch-kpi"] },
)

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  try {
    const [dsh, seg, kpi, deals, hwInbound, hwOutbound, hwStock] = await Promise.all([
      readDsh(), readSeg(), readKpi(), listBranchRevDeals(), listHwInbound(), listHwOutbound(), listHwStock(),
    ])
    const issues = runDataQuality({ deals, dsh, kpi, seg, hwInbound, hwOutbound, hwStock })
    return adminCachedJson({
      issues,
      checkedAt: new Date().toISOString(),
      ruleCount: DATA_QUALITY_RULE_COUNT,
      sourceCounts: {
        deals: deals.length,
        dshRows: dsh.rows.length,
        dshMembers: Object.keys(dsh.members).length,
        kpiRows: kpi.length,
        segRows: seg.length,
        hwInbound: hwInbound.length,
        hwOutbound: hwOutbound.length,
        hwStock: hwStock.length,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
