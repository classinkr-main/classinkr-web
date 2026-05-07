import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"
import { submitLeadCapture } from "@/lib/server/lead-capture"

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "lead", { windowMs: 60_000, max: 5 })
  if (!allowed) {
    return NextResponse.json({ error: "요청이 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const result = await submitLeadCapture(body)
  return NextResponse.json(result.body, { status: result.status })
}
