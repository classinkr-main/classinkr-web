import { NextRequest, NextResponse } from "next/server"

import {
  DocsAnalyticsInputError,
  saveDocsFeedback,
} from "@/lib/docs-analytics"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"

async function readJson(req: NextRequest) {
  try {
    return await req.json()
  } catch {
    throw new DocsAnalyticsInputError("Invalid JSON body.")
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "docs-feedback", {
    windowMs: 60_000,
    max: 20,
  })

  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  try {
    const result = await saveDocsFeedback(await readJson(req), {
      userAgent: req.headers.get("user-agent"),
      referrer: req.headers.get("referer") ?? req.headers.get("referrer"),
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof DocsAnalyticsInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("[POST /api/docs/feedback] error:", error)
    return NextResponse.json({
      ok: true,
      stored: false,
      piiRedacted: false,
      fallback: "storage_unavailable",
      warning: "Analytics event was accepted but not stored.",
    })
  }
}
