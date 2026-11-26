import { after, NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/server/cron-auth"

import { expireExternalCrmSyncCaches } from "@/lib/external-crm/sync-cache"
import {
  notifyExternalCrmSyncOutcome,
  runExternalCrmSyncChain,
} from "@/lib/external-crm/sync-chain"
import { getExternalCrmSyncChainHttpStatus } from "@/lib/external-crm/sync-result"

// 수동 라우트(app/api/admin/crm/external-sync)와 같은 상한 — 체인의 시간 예산이 이 안에서 끝낸다.
export const maxDuration = 300

export async function GET(req: NextRequest) {
  // 인증은 아래 CRON_SECRET Bearer 하나뿐이다 — Vercel 이 크론에 붙이는 건 그 헤더이지
  // x-vercel-cron 이 아니다. 근거는 app/api/cron/sync-branch/route.ts 주석 참조. (2026-08-28)
  // 비교는 lib/server/cron-auth 의 timing-safe 헬퍼로 한다.
  const authResult = checkCronAuth(req)
  if (authResult !== "ok") {
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
    renewalAlerts: chain.renewalAlerts ?? null,
    renewalAlertsError: chain.renewalAlertsError ?? null,
  }
  // 예전엔 매출 태그만 "max"로 걸어 NEO 고객·지역 지도·바깥 캐시가 크론 뒤에도 옛 값이었다 — 수동 버튼과 같은 즉시 만료.
  expireExternalCrmSyncCaches(chain)
  after(() => notifyExternalCrmSyncOutcome(chain, "cron"))
  return NextResponse.json(result, { status: getExternalCrmSyncChainHttpStatus(chain) })
}
