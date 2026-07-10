import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext, verifyAdmin } from "@/lib/admin-auth"
import { ADMIN_CRM_REVENUE_CACHE_TAG } from "@/lib/admin-crm-revenue"
import { runExternalCrmSyncChain } from "@/lib/external-crm/sync-chain"
import { getXiaoshouyiSyncRuntimePreflight } from "@/lib/external-crm/xiaoshouyi-sync"

// 읽기(GET preflight)는 CRM 스태프 롤 매트릭스, 쓰기(POST sync 트리거)는 기본롤 유지.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

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
      neoCustomerSnapshots: chain.neoCustomerSnapshots ?? null,
      neoCustomerSnapshotsError: chain.neoCustomerSnapshotsError ?? null,
      candidates: chain.candidates ?? null,
      candidatesError: chain.candidatesError ?? null,
    }
    if (chain.sync.ok) revalidateTag(ADMIN_CRM_REVENUE_CACHE_TAG, "max")
    return NextResponse.json(result, { status: chain.sync.ok ? 200 : chain.sync.skipped ? 409 : 500 })
  } catch (error) {
    console.error("[POST /api/admin/crm/external-sync]", error)
    const message = error instanceof Error ? error.message : "Failed to sync external CRM"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
