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

// ── 시트 QC 레인 ──────────────────────────────────────────────────────────────
// 이 라우트의 점검(DQ-2/3/4/10: REV 색·월 헤더 추출, DQ-7/13: DSH/KPI 구조)은
// "시트 동기화 산출물"의 품질 검사다. summary/kpi처럼 DB 액티브 임포트를 우선하면
// 다음 캡처의 원천이 될 시트 미러를 검사할 수 없으므로 의도적으로 시트만 파싱한다.
// 캐시 키를 summary/kpi의 DB-우선 readDsh(키 ["branch-dsh"] 등)와 공유하면 먼저
// 워밍한 쪽의 데이터셋이 서빙될 수 있어 시트 QC 전용 키로 분리한다.
// 태그는 sync 라우트의 무효화(["branch-dsh","branch-seg","branch-kpi"])를 그대로 받도록 유지.
const readDsh = unstable_cache(
  async () => parseDsh(await readRangeWithFormat(envSheetId("dashboard"), DSH_RANGE), fyOf(new Date())),
  ["branch-dsh-sheet-qc"], { revalidate: 60, tags: ["branch-dsh"] },
)
const readSeg = unstable_cache(
  async () => parseSeg(await readRangeWithFormat(envSheetId("dashboard"), SEG_RANGE)),
  ["branch-seg-sheet-qc"], { revalidate: 60, tags: ["branch-seg"] },
)
const readKpi = unstable_cache(
  async () => parseKpi(await readRangeWithFormat(envSheetId("dashboard"), KPI_RANGE)),
  ["branch-kpi-sheet-qc"], { revalidate: 60, tags: ["branch-kpi"] },
)

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  try {
    // deals도 시트 미러(branch_rev_deals)를 직접 읽는다 — REV 매출 집계용이 아니라
    // 시트 추출 품질(색 데이터·월 헤더) 검사 대상이기 때문. 매출 수치가 필요해지면
    // lib/branch/read-rev-deals.ts의 readRevDealsPreferActive를 써야 한다.
    const [dsh, seg, kpi, deals, hwInbound, hwOutbound, hwStock] = await Promise.all([
      readDsh(), readSeg(), readKpi(), listBranchRevDeals(), listHwInbound(), listHwOutbound(), listHwStock(),
    ])
    const issues = runDataQuality({ deals, dsh, kpi, seg, hwInbound, hwOutbound, hwStock })
    return adminCachedJson({
      issues,
      checkedAt: new Date().toISOString(),
      ruleCount: DATA_QUALITY_RULE_COUNT,
      // 이 라우트의 소스는 전부 시트 레인이다(위 주석 참조) — 소비자가 오해하지 않게 명시
      lane: "sheet-qc",
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
