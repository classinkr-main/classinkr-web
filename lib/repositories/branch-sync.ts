"server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type SyncSource = "rev" | "hw" | "all" | "insights"
export type SyncTrigger = "cron" | "manual"
export type SyncStatus = "running" | "success" | "failed"

export interface SyncRun {
  id: string; started_at: string; finished_at: string | null
  source: SyncSource; trigger: SyncTrigger; status: SyncStatus
  rows_affected: number | null; error: string | null
}

export async function startSyncRun(source: SyncSource, trigger: SyncTrigger): Promise<string> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.from("branch_sync_runs")
    .insert({ source, trigger, status: "running" }).select("id").single()
  if (error) throw error
  return data.id
}
export async function finishSyncRun(id: string, patch: { status: SyncStatus; rows_affected?: number; error?: string }): Promise<void> {
  const sb = createSupabaseAdminClient()
  const { error } = await sb.from("branch_sync_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", id)
  if (error) throw error
}
export async function getRecentSyncRuns(limit = 10): Promise<SyncRun[]> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.from("branch_sync_runs").select("*").order("started_at", { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as SyncRun[]
}
export async function isAnyRunning(): Promise<boolean> {
  const sb = createSupabaseAdminClient()
  const { count, error } = await sb.from("branch_sync_runs").select("*", { count: "exact", head: true }).eq("status", "running")
  if (error) throw error
  return (count ?? 0) > 0
}
