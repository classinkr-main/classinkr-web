import "server-only"
import { revalidateTag, unstable_cache } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type SyncSource = "rev" | "hw" | "all" | "insights"
export type SyncTrigger = "cron" | "manual"
export type SyncStatus = "running" | "success" | "failed"

export interface SyncRun {
  id: string; started_at: string; finished_at: string | null
  source: SyncSource; trigger: SyncTrigger; status: SyncStatus
  rows_affected: number | null; error: string | null
}

export const BRANCH_SYNC_RUNS_CACHE_TAG = "branch-sync-runs"

export async function startSyncRun(source: SyncSource, trigger: SyncTrigger): Promise<string> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.from("branch_sync_runs")
    .insert({ source, trigger, status: "running" }).select("id").single()
  if (error) throw error
  // "지금 동기화가 도는 중"이라는 상태 변화도 getRecentSyncRuns가 즉시 반영해야 한다
  // (summary의 lastSync/lastError가 runs[0] 기준이라, 캐시가 남아 있으면 방금 시작한
  // 런이 아니라 그 이전 완료 런을 계속 보여준다).
  revalidateTag(BRANCH_SYNC_RUNS_CACHE_TAG, "max")
  return data.id
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
