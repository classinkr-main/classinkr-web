import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type TeamScope = "ALL" | "BD" | "MKT" | "CSM"
export interface NextAction { title: string; why: string; owner: string; due?: string }
export interface BranchInsight {
  id: string; team: TeamScope; fiscal_period: string; generated_at: string
  one_liner: string | null; next_actions: NextAction[]
  raw_response: unknown; input_digest: string | null
}

export async function getLatestInsight(team: TeamScope): Promise<BranchInsight | null> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.from("branch_dashboard_insights")
    .select("*").eq("team", team).order("generated_at", { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data as BranchInsight | null
}
export async function findInsightByDigest(team: TeamScope, digest: string, withinHours = 24): Promise<BranchInsight | null> {
  const sb = createSupabaseAdminClient()
  const cutoff = new Date(Date.now() - withinHours * 3600_000).toISOString()
  const { data, error } = await sb.from("branch_dashboard_insights")
    .select("*").eq("team", team).eq("input_digest", digest)
    .gte("generated_at", cutoff).order("generated_at", { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data as BranchInsight | null
}
export async function insertInsight(row: Omit<BranchInsight, "id" | "generated_at">): Promise<BranchInsight> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.from("branch_dashboard_insights").insert(row).select("*").single()
  if (error) throw error
  return data as BranchInsight
}
