import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { verifyAdmin } from "@/lib/admin-auth"
import { runAll } from "@/lib/branch/sync/run-all"
import { runBranchRevLinkMaintenance } from "@/lib/repositories/crm-source-links"

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  const body = await req.json().catch(() => null) as { sources?: unknown } | null
  const sources = Array.isArray(body?.sources)
    ? body.sources.filter((s): s is "rev" | "hw" => s === "rev" || s === "hw")
    : []
  const effectiveSources = sources.length ? sources : ["rev", "hw"]
  const result = await runAll({ trigger: "manual", sources: sources.length ? sources : undefined })
  if (result.ok) {
    for (const tag of ["branch-dsh", "branch-seg", "branch-kpi"]) {
      revalidateTag(tag, "max")
    }
    const crmLinks = effectiveSources.includes("rev") ? await runBranchRevLinkMaintenance() : undefined
    return NextResponse.json({ ...result, crmLinks }, { status: 200 })
  }
  if (result.skipped) {
    return NextResponse.json(result, { status: 200 })  // skipped is not an error
  }
  return NextResponse.json(result, { status: 500 })
}
