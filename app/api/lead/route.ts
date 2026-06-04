import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"
import { submitLeadCapture } from "@/lib/server/lead-capture"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const { allowed } = checkRateLimit(ip, "lead", { windowMs: 60_000, max: 5 })
    if (!allowed) {
      return NextResponse.json({ error: "요청이 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 })
    }

    const body = await req.json().catch(() => null)
    const result = await submitLeadCapture(body)

    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("[POST /api/lead] unexpected error:", error)
    return NextResponse.json(
      { ok: false, error: "상담 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    )
  }
}
