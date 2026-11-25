import { NextRequest, NextResponse } from "next/server"
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { branchManagerFromRequest } from "@/lib/admin/personal-branch"
import { businessFy } from "@/lib/branch/fiscal"
import { readLedgerRevenueDeals } from "@/lib/branch/ledger-revenue"
import { buildBranchWeeklyCompassReport } from "@/lib/branch/weekly-report"

const TEAMS = new Set(["ALL", "BD", "MKT", "CSM"])

// KR Team 본사 주간 보고 — Compass 구획(끝난 주 리드 퍼널 + 월간 과정 평가). 읽기 전용.
// 조립 정본은 lib/branch/weekly-report.ts이며 AI 인사이트 입력도 같은 함수를 쓴다.
export async function GET(req: NextRequest) {
  const denied = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES)
  if (denied) return denied
  const url = new URL(req.url)
  const team = url.searchParams.get("team") ?? "ALL"
  if (!TEAMS.has(team)) return NextResponse.json({ error: "Invalid team query" }, { status: 400 })
  const manager = await branchManagerFromRequest(url, req)
  try {
    // 매출 딜 = 시트 행(액티브 임포트 우선) + 장부 항목(D1) — KA 확정·미확정이 장부 화면과 같다.
    const { deals } = await readLedgerRevenueDeals({ fiscalYear: businessFy() })
    const report = await buildBranchWeeklyCompassReport({ team, manager: manager ?? null, deals })
    return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("[GET /api/admin/branch/weekly-report]", error)
    return NextResponse.json({ error: "주간 보고 Compass 구획을 만들지 못했습니다." }, { status: 500 })
  }
}
