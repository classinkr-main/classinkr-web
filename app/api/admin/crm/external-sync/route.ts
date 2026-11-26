import { after, NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext, verifyAdmin } from "@/lib/admin-auth"
import { expireExternalCrmSyncCaches } from "@/lib/external-crm/sync-cache"
import {
  notifyExternalCrmSyncOutcome,
  runExternalCrmSyncChain,
} from "@/lib/external-crm/sync-chain"
import { getExternalCrmSyncHttpStatus } from "@/lib/external-crm/sync-result"
import { expireSyncCacheTags } from "@/lib/server/sync-cache-tags"
import { getXiaoshouyiSyncRuntimePreflight } from "@/lib/external-crm/xiaoshouyi-sync"
import { refreshCrmNeoCustomerSnapshotsFromExternalRecords } from "@/lib/repositories/crm-neo-customer-snapshots"

// 동기화는 객체·페이지마다 외부 API 왕복이라 길다. 체인 안의 시간 예산(lib/external-crm/xiaoshouyi-sync.ts
// XIAOSHOUYI_SYNC_TIME_BUDGET_MS)이 이 상한 안에서 끝내고 잠금을 스스로 푼다 — 상한을 바꾸면 예산도 같이 본다.
export const maxDuration = 300

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
    const startedAt = Date.now()
    let force = false
    let refreshSnapshotsOnly = false
    let recentSyncTtlMs = 60_000
    const rawBody = await req.text()
    if (rawBody.trim()) {
      let body: Record<string, unknown>
      try {
        const parsed = JSON.parse(rawBody) as unknown
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return NextResponse.json({ ok: false, error: "요청 본문은 JSON 객체여야 합니다." }, { status: 400 })
        }
        body = parsed as Record<string, unknown>
      } catch {
        return NextResponse.json({ ok: false, error: "올바른 JSON 본문이 필요합니다." }, { status: 400 })
      }

      if (body.force !== undefined && typeof body.force !== "boolean") {
        return NextResponse.json({ ok: false, error: "force는 boolean이어야 합니다." }, { status: 400 })
      }
      if (
        body.recentSyncTtlMs !== undefined &&
        (typeof body.recentSyncTtlMs !== "number" || !Number.isFinite(body.recentSyncTtlMs))
      ) {
        return NextResponse.json({ ok: false, error: "recentSyncTtlMs는 유효한 숫자여야 합니다." }, { status: 400 })
      }

      if (body.refreshSnapshotsOnly !== undefined && typeof body.refreshSnapshotsOnly !== "boolean") {
        return NextResponse.json({ ok: false, error: "refreshSnapshotsOnly는 boolean이어야 합니다." }, { status: 400 })
      }
      refreshSnapshotsOnly = body.refreshSnapshotsOnly === true
      force = body.force === true
      if (typeof body.recentSyncTtlMs === "number") {
        recentSyncTtlMs = Math.min(Math.max(Math.trunc(body.recentSyncTtlMs), 0), 30 * 60_000)
      }
    }

    // 외부 동기화 없이 스냅샷만 다시 계산한다.
    // 파생 로직(잔액 필드·과금 유형·소진 예상일)을 고쳤을 때, 동기화가 막혀 있어도
    // external_crm_records 에 이미 있는 원본으로 읽기모델을 최신화하기 위한 경로다.
    if (refreshSnapshotsOnly) {
      const snapshots = await refreshCrmNeoCustomerSnapshotsFromExternalRecords()
      // NEO 고객 스냅샷(crm_neo_customer_snapshots)을 다시 계산했다 — admin-crm-customers-neo.ts의
      // Data Cache, region-map의 "고객" 레이어(region_label 원천), 그 값을 품은 바깥 캐시까지 즉시 만료한다
      // (lib/server/sync-cache-tags.ts neoSync).
      expireSyncCacheTags("neoSync")
      return NextResponse.json({
        ok: true,
        refreshSnapshotsOnly: true,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        neoCustomerSnapshots: snapshots,
      })
    }

    const chain = await runExternalCrmSyncChain("manual", { force, recentSyncTtlMs })
    const completedAt = new Date().toISOString()
    const result = {
      ...chain.sync,
      completedAt,
      durationMs: Date.now() - startedAt,
      neoCustomerSnapshots: chain.neoCustomerSnapshots ?? null,
      neoCustomerSnapshotsError: chain.neoCustomerSnapshotsError ?? null,
      candidates: chain.candidates ?? null,
      candidatesError: chain.candidatesError ?? null,
    }
    // 새 데이터가 있을 때만(잠김·최근 결과 재사용·건너뜀이면 그대로) 즉시 만료 — 크론과 같은 규칙(lib/external-crm/sync-cache.ts).
    expireExternalCrmSyncCaches(chain)
    after(() => notifyExternalCrmSyncOutcome(chain, "manual"))
    return NextResponse.json(result, { status: getExternalCrmSyncHttpStatus(chain.sync) })
  } catch (error) {
    console.error("[POST /api/admin/crm/external-sync]", error)
    const message = error instanceof Error ? error.message : "Failed to sync external CRM"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
