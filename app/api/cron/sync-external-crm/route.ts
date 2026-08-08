import { revalidateTag } from "next/cache"
import { after, NextRequest, NextResponse } from "next/server"

import { ADMIN_CRM_REVENUE_CACHE_TAG } from "@/lib/admin-crm-revenue"
import {
  notifyExternalCrmSyncOutcome,
  runExternalCrmSyncChain,
} from "@/lib/external-crm/sync-chain"
import {
  getExternalCrmSyncHttpStatus,
  hasFreshExternalCrmSyncData,
} from "@/lib/external-crm/sync-result"

export async function GET(req: NextRequest) {
  // Vercel 환경에서는 x-vercel-cron 헤더 필수
  if (process.env.VERCEL && !req.headers.get("x-vercel-cron")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""

  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const startedAt = Date.now()
  const chain = await runExternalCrmSyncChain("cron")
  const result = {
    ...chain.sync,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    neoCustomerSnapshots: chain.neoCustomerSnapshots ?? null,
    neoCustomerSnapshotsError: chain.neoCustomerSnapshotsError ?? null,
    candidates: chain.candidates ?? null,
    candidatesError: chain.candidatesError ?? null,
  }
  if (hasFreshExternalCrmSyncData(chain.sync)) {
    revalidateTag(ADMIN_CRM_REVENUE_CACHE_TAG, "max")
  }
  after(() => notifyExternalCrmSyncOutcome(chain, "cron"))
  return NextResponse.json(result, { status: getExternalCrmSyncHttpStatus(chain.sync) })
}
