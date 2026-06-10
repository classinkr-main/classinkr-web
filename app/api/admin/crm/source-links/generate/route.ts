import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { generateBranchRevLinkCandidates } from "@/lib/repositories/crm-source-links"

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const body = (await req.json().catch(() => null)) as { source?: unknown } | null

    if (body?.source != null && body.source !== "branch_rev_sheet") {
      return NextResponse.json({ error: "Unsupported source" }, { status: 400 })
    }

    const result = await generateBranchRevLinkCandidates()
    return NextResponse.json({ ok: true, source: "branch_rev_sheet", ...result })
  } catch (error) {
    console.error("[POST /api/admin/crm/source-links/generate]", error)
    return NextResponse.json({ error: "Failed to generate CRM source link candidates" }, { status: 500 })
  }
}
