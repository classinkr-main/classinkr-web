import { NextRequest, NextResponse } from "next/server"
import { submitLeadCapture } from "@/lib/server/lead-capture"

export async function POST(req: NextRequest) {
  const result = await submitLeadCapture(await req.json())
  return NextResponse.json(result.body, { status: result.status })
}
