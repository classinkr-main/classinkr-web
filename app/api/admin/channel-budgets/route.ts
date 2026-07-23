import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getChannelBudgets, saveChannelBudget } from "@/lib/repositories/channel-budgets"
import type { AdChannel } from "@/lib/types/event-metrics"

const VALID_CHANNELS = new Set<string>([
  "google",
  "meta",
  "naver",
  "kakao",
  "youtube",
  "offline",
  "other",
])

// PATCH 본문을 검증·정규화한다. 유효하지 않으면 null.
//   channel — 7개 AdChannel enum 중 하나여야 한다.
//   amount  — 유한한 0 이상 값만 허용(음수·NaN·Infinity·비수치 → null), 소수는 floor해 정수화.
// 이 값이 예산 배정·잔여(배정−집행) 계산으로 흘러가므로 -5원 / 1.5원 같은 입력을 원천 차단한다.
export function sanitizeChannelBudgetPatch(
  body: unknown
): { channel: AdChannel; amount: number } | null {
  if (!body || typeof body !== "object") return null
  const obj = body as Record<string, unknown>
  const channel = obj.channel
  if (typeof channel !== "string" || !VALID_CHANNELS.has(channel)) return null
  const rawAmount = obj.amount
  if (typeof rawAmount !== "number" && typeof rawAmount !== "string") return null
  const amount = Number(rawAmount)
  if (!Number.isFinite(amount) || amount < 0) return null
  return { channel: channel as AdChannel, amount: Math.floor(amount) }
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  return NextResponse.json({ budgets: getChannelBudgets() })
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
    const budgets = saveChannelBudget(patch.channel, patch.amount)
    return NextResponse.json({ budgets })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "채널 예산 저장 실패" },
      { status: 500 }
    )
  }
}
