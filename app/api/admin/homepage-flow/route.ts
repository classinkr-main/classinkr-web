import { type NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import {
  getAdminHomepageFlow,
  parseHomepageFlowRange,
} from "@/lib/admin-homepage-flow"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const rangeDays = parseHomepageFlowRange(req.nextUrl.searchParams.get("range"))

  try {
    const flow = await getAdminHomepageFlow(rangeDays)
    const response = NextResponse.json(flow)
    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120")
    return response
  } catch (error) {
    console.error("[GET /api/admin/homepage-flow]", error)
    return NextResponse.json(
      { error: "Failed to fetch homepage flow analytics" },
      { status: 500 }
    )
  }
}
