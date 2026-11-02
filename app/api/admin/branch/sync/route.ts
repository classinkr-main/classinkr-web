import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { runAll } from "@/lib/branch/sync/run-all"
import { completeBranchSync } from "@/lib/branch/sync/complete"

// 시트 3범위 읽기 + 미러 교체 + 장부 임포트 재캡처 + CRM 링크 유지보수를 한 요청에서 끝낸다.
// 운영은 Fluid(기본 300초)지만 기본값에 기대지 않고 명시한다.
export const maxDuration = 300

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
