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
    let force = false
    let recentSyncTtlMs = 5 * 60_000
    try {
      const body = (await req.json()) as {
        force?: unknown
        recentSyncTtlMs?: unknown
      }
      force = body.force === true
      if (typeof body.recentSyncTtlMs === "number" && Number.isFinite(body.recentSyncTtlMs)) {
        recentSyncTtlMs = Math.min(Math.max(Math.trunc(body.recentSyncTtlMs), 0), 30 * 60_000)
      }
    } catch {
      // 본문 없음 — 최근 성공 sync 재사용 기본값 사용
    }

    const chain = await runExternalCrmSyncChain("manual", { force, recentSyncTtlMs })
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
