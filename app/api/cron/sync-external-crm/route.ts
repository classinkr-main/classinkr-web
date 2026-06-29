import { NextRequest, NextResponse } from "next/server"

import { runExternalCrmSyncChain } from "@/lib/external-crm/sync-chain"

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

  const chain = await runExternalCrmSyncChain("cron")
  const result = {
    ...chain.sync,
    neoCustomerSnapshots: chain.neoCustomerSnapshots ?? null,
    neoCustomerSnapshotsError: chain.neoCustomerSnapshotsError ?? null,
    candidates: chain.candidates ?? null,
    candidatesError: chain.candidatesError ?? null,
  }
  return NextResponse.json(result, { status: chain.sync.ok ? 200 : chain.sync.skipped ? 409 : 500 })
}
