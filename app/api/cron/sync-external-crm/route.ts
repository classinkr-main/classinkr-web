import { NextRequest, NextResponse } from "next/server"

import { runExternalCrmSyncChain } from "@/lib/external-crm/sync-chain"

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""

  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const chain = await runExternalCrmSyncChain("cron")
  const result = {
    ...chain.sync,
    candidates: chain.candidates ?? null,
    candidatesError: chain.candidatesError ?? null,
  }
  return NextResponse.json(result, { status: chain.sync.ok ? 200 : chain.sync.skipped ? 409 : 500 })
}
