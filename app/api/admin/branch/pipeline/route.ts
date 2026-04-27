import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { listPipeline, type PipelineStage } from "@/lib/branch/computations/pipeline"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  const url = new URL(req.url)
  try {
    const deals = await listBranchRevDeals()
    const rows = listPipeline(deals, {
      team: url.searchParams.get("team") ?? undefined,
      manager: url.searchParams.get("manager") ?? undefined,
      region: url.searchParams.get("region") ?? undefined,
      importance: url.searchParams.get("importance") ?? undefined,
      stage: (url.searchParams.get("stage") ?? undefined) as PipelineStage | undefined,
    })
    return NextResponse.json({ rows })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
