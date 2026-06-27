import { type NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getMarketingConversionStatus } from "@/lib/marketing/server-conversions"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const response = NextResponse.json(getMarketingConversionStatus())
  response.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=300")
  return response
}
