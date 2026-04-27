import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { verifyAdmin } from "@/lib/admin-auth"
import { runAll } from "@/lib/branch/sync/run-all"

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  const result = await runAll({ trigger: "manual" })
  for (const tag of ["branch-dsh", "branch-seg", "branch-kpi"]) revalidateTag(tag, "max")
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
