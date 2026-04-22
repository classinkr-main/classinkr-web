import { NextResponse } from "next/server"
import { listPublicEvents } from "@/lib/repositories/public-events"

export async function GET() {
  try {
    const events = await listPublicEvents()
    return NextResponse.json(events)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "행사 목록 조회에 실패했습니다." },
      { status: 500 }
    )
  }
}
