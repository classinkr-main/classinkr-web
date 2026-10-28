import "server-only"
import { revalidateTag, unstable_cache } from "next/cache"
import type { SyncRuntimeInfo } from "@/lib/branch/sync/write-guard"
import { isMissingColumnMessage } from "@/lib/db/schema-contract"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type SyncSource = "rev" | "hw" | "all" | "insights"
export type SyncTrigger = "cron" | "manual"
export type SyncStatus = "running" | "success" | "failed"

/** branch_sync_runs.runtime(20261028_branch_sync_runs_runtime.sql) — 이 런을 쓴 환경·배포·커밋·리전. */
export type SyncRunRuntime = SyncRuntimeInfo

export interface SyncRun {
  id: string; started_at: string; finished_at: string | null
  source: SyncSource; trigger: SyncTrigger; status: SyncStatus
  rows_affected: number | null; error: string | null
  // 컬럼이 없는(마이그레이션 미적용) 환경이나 그 이전 런은 undefined/null.
  runtime?: SyncRunRuntime | null
}

export const BRANCH_SYNC_RUNS_CACHE_TAG = "branch-sync-runs"
export const BRANCH_SYNC_RUNS_RUNTIME_MIGRATION = "supabase/migrations/20261028_branch_sync_runs_runtime.sql"

// PostgREST 가 컬럼 부재로 돌려주는 신호 — insert 는 42703 대신 PGRST204("Could not find the 'runtime'
// column … in the schema cache")로 올 수 있다. 테이블 부재(42P01)는 여기서 삼키지 않는다.
function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === "42703" || error.code === "PGRST204") return true
  return typeof error.message === "string" && isMissingColumnMessage(error.message)
}

/**
 * 런 시작 기록. runtime(어느 환경·배포가 쓰는가)은 best-effort 다 — 컬럼이 아직 없는 환경에서는
 * 컬럼 없이 한 번 더 insert 해서 동기화 자체가 죽지 않게 한다(런북 "새 컬럼 기록은 코어 경로와 분리").
 * 강등은 무음이 아니라 console.warn 으로 남긴다.
 */
export async function startSyncRun(source: SyncSource, trigger: SyncTrigger, runtime?: SyncRunRuntime | null): Promise<string> {
  const sb = createSupabaseAdminClient()
  const base = { source, trigger, status: "running" as const }
  const insert = (row: Record<string, unknown>) => sb.from("branch_sync_runs").insert(row).select("id").single()
  let result = await insert(runtime ? { ...base, runtime } : base)
  if (result.error && runtime && isMissingColumnError(result.error)) {
    console.warn(
      `[branch-sync] branch_sync_runs.runtime 컬럼이 없어 출처 없이 기록합니다 — ${BRANCH_SYNC_RUNS_RUNTIME_MIGRATION} 을 적용하세요.`,
    )
    result = await insert(base)
  }
  if (result.error) throw result.error
  // "지금 동기화가 도는 중"이라는 상태 변화도 getRecentSyncRuns가 즉시 반영해야 한다
  // (summary의 lastSync/lastError가 runs[0] 기준이라, 캐시가 남아 있으면 방금 시작한
  // 런이 아니라 그 이전 완료 런을 계속 보여준다).
  revalidateTag(BRANCH_SYNC_RUNS_CACHE_TAG, "max")
  return result.data.id
}
export async function finishSyncRun(id: string, patch: { status: SyncStatus; rows_affected?: number; error?: string }): Promise<void> {
  const sb = createSupabaseAdminClient()
  const { error } = await sb.from("branch_sync_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", id)
  if (error) throw error
  // 2026-07-16 스테일 임포트 사고 이후 요구사항과 동일한 이유: 동기화 완료 직후 새로고침한
  // summary가 방금 갱신된 수치의 lastSync/lastError를 지연 없이 봐야 한다.
  revalidateTag(BRANCH_SYNC_RUNS_CACHE_TAG, "max")
}

async function fetchRecentSyncRuns(limit: number): Promise<SyncRun[]> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.from("branch_sync_runs").select("*").order("started_at", { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as SyncRun[]
}

// summary 라우트가 요청마다 다시 묻는 핫패스라 캐시한다. 위 startSyncRun/finishSyncRun이
// 뮤테이션마다 태그를 무효화하므로 즉시 반영이 보장되고, revalidate(60s)는 그 무효화 경로가
// 어떤 이유로든 안 탄 경우의 안전망일 뿐이다(다른 sales-ledger 60초 캐시들과 동일 TTL).
const getCachedRecentSyncRuns = unstable_cache(
  async (limit: number) => fetchRecentSyncRuns(limit),
  ["branch-recent-sync-runs"],
  { revalidate: 60, tags: [BRANCH_SYNC_RUNS_CACHE_TAG] },
)

export async function getRecentSyncRuns(limit = 10): Promise<SyncRun[]> {
  return getCachedRecentSyncRuns(limit)
}

// 캐시를 거치지 않는 최근 런 조회 — 방금 끝난 런까지 포함해야 하는 판정(연속 실패 알림) 전용.
// finishSyncRun의 revalidateTag(…, "max")는 SWR이라 캐시판은 직전 런을 빠뜨릴 수 있다.
export async function listRecentSyncRunsFresh(limit = 60): Promise<SyncRun[]> {
  return fetchRecentSyncRuns(limit)
}
export async function isAnyRunning(): Promise<boolean> {
  const sb = createSupabaseAdminClient()
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString()
  const { count, error } = await sb
    .from("branch_sync_runs")
    .select("*", { count: "exact", head: true })
    .eq("status", "running")
    .gte("started_at", cutoff)
  if (error) throw error
  return (count ?? 0) > 0
}
