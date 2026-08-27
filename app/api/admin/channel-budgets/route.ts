import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { sanitizeChannelBudgetPatch } from "@/lib/marketing/channel-budget-input"
import { getChannelBudgets, saveChannelBudget } from "@/lib/repositories/channel-budgets"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  try {
    return NextResponse.json({ budgets: await getChannelBudgets() })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "채널 예산 조회 실패" },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  try {
    const body = (await req.json()) as unknown
    const patch = sanitizeChannelBudgetPatch(body)
    if (!patch) {
      return NextResponse.json({ error: "유효하지 않은 채널 예산 입력" }, { status: 400 })
    }
    const budgets = await saveChannelBudget(patch.channel, patch.amount)
    return NextResponse.json({ budgets })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "채널 예산 저장 실패" },
      { status: 500 }
    )
  }
}
