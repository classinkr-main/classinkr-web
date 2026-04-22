import { NextRequest, NextResponse } from "next/server"

import {
  DocsAnalyticsInputError,
  saveDocsSearchEvent,
} from "@/lib/docs-analytics"

async function readJson(req: NextRequest) {
  try {
    return await req.json()
  } catch {
    throw new DocsAnalyticsInputError("Invalid JSON body.")
  }
}

export async function POST(req: NextRequest) {
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
