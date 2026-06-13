import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { runExternalCrmSyncChain } from "@/lib/external-crm/sync-chain"
import { getXiaoshouyiSyncRuntimePreflight } from "@/lib/external-crm/xiaoshouyi-sync"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  return NextResponse.json(await getXiaoshouyiSyncRuntimePreflight())
}

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const chain = await runExternalCrmSyncChain("manual")
    const result = {
      ...chain.sync,
      candidates: chain.candidates ?? null,
      candidatesError: chain.candidatesError ?? null,
    }
    return NextResponse.json(result, { status: chain.sync.ok ? 200 : chain.sync.skipped ? 409 : 500 })
  } catch (error) {
    console.error("[POST /api/admin/crm/external-sync]", error)
    const message = error instanceof Error ? error.message : "Failed to sync external CRM"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
