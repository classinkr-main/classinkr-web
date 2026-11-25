import { NextRequest, NextResponse } from "next/server"
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { branchManagerFromRequest } from "@/lib/admin/personal-branch"
import { fyOf, ymKey } from "@/lib/branch/fiscal"
import { countBoards, countBranchCustomers } from "@/lib/branch/sales-counts"
import type { BranchBoardCounts, BranchSalesCounts } from "@/lib/branch/sales-counts-contract"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { getHardwareSalesDashboard } from "@/lib/repositories/hardware-sales-dashboard"

const TEAMS = new Set(["ALL", "BD", "MKT", "CSM"])

// KR Team 개요 — 총 고객수(REV 장부) · 전자칠판 판매 대수(하드웨어 판매대시보드). 읽기 전용.
// 칠판 수치를 못 읽어도 고객수는 내려준다(state=unavailable, 0으로 위장하지 않는다).
async function readBoards(now: Date): Promise<BranchBoardCounts> {
  try {
    const fy = fyOf(now)
    const current = await getHardwareSalesDashboard(fy)
    const others = await Promise.all(current.availableFys.filter((value) => value !== fy).map((value) => getHardwareSalesDashboard(value)))
    return countBoards(current, others, now)
  } catch (error) {
    console.error("[GET /api/admin/branch/sales-counts] boards", error)
    return { state: "unavailable", fy: 0, month: 0, fyPlanned: 0, fyPromotion: 0, allTime: 0 }
  }
}

export async function GET(req: NextRequest) {
  const denied = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES)
  if (denied) return denied
  const url = new URL(req.url)
  const team = url.searchParams.get("team") ?? "ALL"
  if (!TEAMS.has(team)) return NextResponse.json({ error: "Invalid team query" }, { status: 400 })
  const manager = (await branchManagerFromRequest(url, req)) ?? null
  const now = new Date()
  try {
    const [deals, boards] = await Promise.all([listBranchRevDeals(), readBoards(now)])
    const fy = fyOf(now)
    const body: BranchSalesCounts = {
      fy,
      fyLabel: `FY${fy}`,
      month: ymKey(now),
      scope: { team, manager },
      customers: countBranchCustomers(deals, { now, team, manager }),
      boards,
    }
    return NextResponse.json(body, { headers: { "Cache-Control": "private, max-age=60" } })
  } catch (error) {
    console.error("[GET /api/admin/branch/sales-counts]", error)
    return NextResponse.json({ error: "고객수·칠판 판매 대수를 불러오지 못했습니다." }, { status: 500 })
  }
}
