import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  generateAllCrmLinkCandidates,
  generateBranchRevLinkCandidates,
  generateExternalCrmLinkCandidates,
  generateLeadLinkCandidates,
} from "@/lib/repositories/crm-source-links"

type GenerateSource = "branch_rev_sheet" | "lead" | "xiaoshouyi_snapshot" | "all"

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const body = (await req.json().catch(() => null)) as { source?: unknown } | null
    const source = (body?.source ?? "branch_rev_sheet") as GenerateSource

    if (!["branch_rev_sheet", "lead", "xiaoshouyi_snapshot", "all"].includes(source)) {
      return NextResponse.json({ error: "Unsupported source" }, { status: 400 })
    }

    if (source === "all") {
      const result = await generateAllCrmLinkCandidates()
      return NextResponse.json({ ok: true, source, ...result })
    }

    if (source === "xiaoshouyi_snapshot") {
      const result = await generateExternalCrmLinkCandidates()
      return NextResponse.json({ ok: true, source, ...result })
    }

    if (source === "lead") {
      const result = await generateLeadLinkCandidates()
      return NextResponse.json({ ok: true, source, ...result })
    }

    const result = await generateBranchRevLinkCandidates()
    return NextResponse.json({ ok: true, source, ...result })
  } catch (error) {
    console.error("[POST /api/admin/crm/source-links/generate]", error)
    return NextResponse.json({ error: "Failed to generate CRM source link candidates" }, { status: 500 })
  }
}
