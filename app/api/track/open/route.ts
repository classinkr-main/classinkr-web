import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
)

export async function GET(req: NextRequest) {
  const cid = req.nextUrl.searchParams.get("cid")

  if (cid) {
    try {
      const sb = createSupabaseAdminClient()
      await sb.rpc("increment_campaign_open_count", { campaign_id: Number(cid) })
    } catch {
      // silently ignore — tracking must never break email display
    }
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache",
    },
  })
}
