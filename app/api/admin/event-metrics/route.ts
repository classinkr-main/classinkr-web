import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getAllEventMetrics } from "@/lib/repositories/event-metrics"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  try {
    const metrics = getAllEventMetrics()
    return NextResponse.json({ metrics })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "메트릭 조회에 실패했습니다." },
      { status: 500 }
    )
  }
}
