import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
)

export async function GET(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "track-open", {
    windowMs: 60_000,
    max: 120,
  })

  if (!allowed) {
    return pixelResponse()
  }

  const cid = req.nextUrl.searchParams.get("cid")

  if (cid) {
    const campaignId = Number(cid)
    if (!Number.isSafeInteger(campaignId) || campaignId <= 0) {
      return pixelResponse()
    }

    try {
      const sb = createSupabaseAdminClient()
      await sb.rpc("increment_campaign_open_count", { campaign_id: campaignId })
    } catch {
      // silently ignore — tracking must never break email display
    }
  }

  return pixelResponse()
}

function pixelResponse() {
  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache",
    },
  })
}
