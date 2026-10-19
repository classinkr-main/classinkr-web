import "server-only"

// 동기화 건강 읽기 모델의 조회 쪽 — 실행 기록 테이블을 읽어 lib/admin/sync-health.ts 순수 판정에 넘긴다.
//
// 원천별 기록 위치(코드로 확인, 2026-09-25):
//  - NEO 읽기   : external_crm_sync_runs (source_system='xiaoshouyi'). 전체 동기화 결과는 코디네이터 행
//                 (object_api_key='__sync_lock__'), env 누락 건너뜀은 'all' 행 — lib/external-crm/xiaoshouyi-sync.ts.
//  - KR Team 시트·HW : branch_sync_runs (source='all'|'rev'|'hw' — 실제로 돌린 원천, 오류 "rev: … | hw: …")
//                 — lib/branch/sync/run-all.ts. 캐시를 거치지 않는 listRecentSyncRunsFresh(60)로 읽는다:
//                 finishSyncRun의 태그 무효화는 SWR("max")라 캐시판(getRecentSyncRuns)은 동기화 직후 첫
//                 새로고침에 직전 런을 보여 줘, 방금 성공했는데 실패 띠가 한 번 더 남았다(2026-09-25).
//                 크론 연속 실패 알림(lib/branch/sync/failure-alert.ts)과 같은 조회·같은 창이다.
//
// 실패 규칙: 한 원천의 조회가 실패하면 그 원천만 state="unknown"(확인 불가)으로 돌려준다. 던지지 않는다 —
// 경고 띠 때문에 화면 전체가 깨지면 안 되고, 정상인 척 빈 값을 내지도 않는다.
// 로그에는 조회 오류 코드만 남긴다(동기화 원문 오류·키 값은 싣지 않는다).

import {
  NEO_SYNC_COORDINATOR_KEY,
  NEO_SYNC_TOP_LEVEL_KEYS,
  SYNC_HEALTH_SOURCES,
  computeBranchSourceHealth,
  computeNeoSyncHealth,
  unknownSyncSourceHealth,
  type BranchSyncRunRow,
  type NeoSyncRunRow,
  type SyncHealthReport,
  type SyncHealthSourceKey,
  type SyncSourceHealth,
} from "@/lib/admin/sync-health"
import { listRecentSyncRunsFresh } from "@/lib/repositories/branch-sync"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/** 하루 1회 크론 + 수동 재시도를 두 달가량 덮는 창 — 크론 알림(failure-alert.ts)과 같은 값. */
export const SYNC_HEALTH_RUN_WINDOW = 60

const NEO_RUN_COLUMNS = "object_api_key, status, trigger, started_at, finished_at, error"

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code
  }
  return "unknown"
}

async function loadNeoSyncHealth(nowMs: number): Promise<SyncSourceHealth> {
  const sb = createSupabaseAdminClient()
  const [recent, latestSuccess] = await Promise.all([
    sb
      .from("external_crm_sync_runs")
      .select(NEO_RUN_COLUMNS)
      .eq("source_system", "xiaoshouyi")
      .in("object_api_key", [...NEO_SYNC_TOP_LEVEL_KEYS])
      .order("started_at", { ascending: false })
      .limit(SYNC_HEALTH_RUN_WINDOW),
    // 창 밖까지 포함한 마지막 전체 성공 — 연속 실패가 창보다 길어도 "마지막 성공"은 정확히 낸다.
    sb
      .from("external_crm_sync_runs")
      .select(NEO_RUN_COLUMNS)
      .eq("source_system", "xiaoshouyi")
      .eq("object_api_key", NEO_SYNC_COORDINATOR_KEY)
      .eq("status", "success")
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(1),
  ])
  if (recent.error || latestSuccess.error) {
    console.error("[sync-health] NEO 실행 기록 조회 실패", errorCode(recent.error ?? latestSuccess.error))
    return unknownSyncSourceHealth("neo")
  }
  const rows = (recent.data ?? []) as NeoSyncRunRow[]
  const success = ((latestSuccess.data ?? []) as NeoSyncRunRow[])[0] ?? null
  return computeNeoSyncHealth(rows, success, nowMs)
}

async function loadBranchSyncHealth(
  sources: Array<"sheets" | "hw">,
  nowMs: number
): Promise<SyncSourceHealth[]> {
  try {
    const runs = (await listRecentSyncRunsFresh(SYNC_HEALTH_RUN_WINDOW)) as BranchSyncRunRow[]
    return sources.map((source) => computeBranchSourceHealth(runs, source, nowMs))
  } catch (error) {
    console.error("[sync-health] branch_sync_runs 조회 실패", errorCode(error))
    return sources.map((source) => unknownSyncSourceHealth(source))
  }
}

/**
 * 요청한 원천만 읽어 건강 보고서를 만든다(기본 전체). 반환 순서는 요청 순서를 따른다.
 * 어떤 경우에도 던지지 않는다 — 조회 실패 원천은 state="unknown".
 */
export async function loadSyncHealthReport(
  sources: readonly SyncHealthSourceKey[] = SYNC_HEALTH_SOURCES,
  now: Date = new Date()
): Promise<SyncHealthReport> {
  const nowMs = now.getTime()
  const wanted = Array.from(new Set(sources))
  const branchSources = wanted.filter((source): source is "sheets" | "hw" => source !== "neo")

  const [neo, branch] = await Promise.all([
    wanted.includes("neo")
      ? loadNeoSyncHealth(nowMs).catch((error) => {
          console.error("[sync-health] NEO 실행 기록 조회 예외", errorCode(error))
          return unknownSyncSourceHealth("neo")
        })
      : Promise.resolve(null),
    branchSources.length > 0 ? loadBranchSyncHealth(branchSources, nowMs) : Promise.resolve([]),
  ])

  const bySource = new Map<SyncHealthSourceKey, SyncSourceHealth>()
  if (neo) bySource.set("neo", neo)
  for (const health of branch) bySource.set(health.source, health)

  return {
    generatedAt: now.toISOString(),
    sources: wanted.map((source) => bySource.get(source) ?? unknownSyncSourceHealth(source)),
  }
}
