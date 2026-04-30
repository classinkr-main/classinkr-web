import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getBranchRevDeal } from "@/lib/repositories/branch-deals"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req); if (err) return err
  try {
    const { id } = await ctx.params
    const deal = await getBranchRevDeal(id)
    if (!deal) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json({ deal })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
