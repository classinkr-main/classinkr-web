import { NextRequest, NextResponse } from "next/server"
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { readRevDealById } from "@/lib/branch/read-rev-deals"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES); if (err) return err
  try {
    const { id } = await ctx.params
    // 미러 id → 활성 임포트 라인 id 순으로 푼다(lib/branch/read-rev-deals 주석 참고).
    const deal = await readRevDealById(id)
    if (!deal) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json({ deal })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
