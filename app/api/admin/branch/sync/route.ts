import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { runAll } from "@/lib/branch/sync/run-all"
import { completeBranchSync } from "@/lib/branch/sync/complete"

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  const body = await req.json().catch(() => null) as { sources?: unknown } | null
  const sources = Array.isArray(body?.sources)
    ? body.sources.filter((s): s is "rev" | "hw" => s === "rev" || s === "hw")
    : []
  const effectiveSources = sources.length ? sources : ["rev", "hw"]
  const result = await runAll({ trigger: "manual", sources: sources.length ? sources : undefined })
  const completed = await completeBranchSync(result, effectiveSources)
  return NextResponse.json(completed, { status: result.ok || result.skipped ? 200 : 500 })
}
