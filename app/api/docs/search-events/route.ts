import { NextRequest, NextResponse } from "next/server"

import {
  DocsAnalyticsInputError,
  saveDocsSearchEvent,
} from "@/lib/docs-analytics"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"

async function readJson(req: NextRequest) {
  try {
    return await req.json()
  } catch {
    throw new DocsAnalyticsInputError("Invalid JSON body.")
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimitDistributed(ip, "docs-search-events", {
    windowMs: 60_000,
    max: 60,
  })

  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  try {
    const result = await saveDocsSearchEvent(await readJson(req))
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof DocsAnalyticsInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("[POST /api/docs/search-events] error:", error)
    return NextResponse.json({
      ok: true,
      stored: false,
      piiRedacted: false,
      fallback: "storage_unavailable",
      warning: "Analytics event was accepted but not stored.",
    })
  }
}
