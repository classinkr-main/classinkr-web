import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimitDistributed(ip, "track-open", {
    windowMs: 60_000,
    max: 120,
  })

  if (!allowed) {
    return pixelResponse()
  }

  const cid = req.nextUrl.searchParams.get("cid")

  if (cid) {
    const campaignId = cid.trim()
    if (!UUID_RE.test(campaignId)) {
      return pixelResponse()
    }

    try {
      const sb = createSupabaseAdminClient()
      const { error } = await sb.rpc("increment_campaign_open_count", { campaign_id: campaignId })
      if (error) {
        console.warn("[track/open] increment_campaign_open_count failed:", error.message)
      }
    } catch (error) {
      // silently ignore — tracking must never break email display
      console.warn("[track/open] open tracking failed:", error)
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
