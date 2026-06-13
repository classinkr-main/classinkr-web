import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"

export interface BranchRevDeal {
  id: string; sheet_row: number
  customer_name: string; branch_contact: string | null
  team: string | null; manager: string | null
  deal_type: string | null; status: string | null
  first_payment: string | null; product_version: string | null
  region: string | null; importance: string | null; note: string | null
  contract_target: number | null
  monthly_payments: Record<string, number>
  monthly_red: Record<string, boolean>
  // 주차 칸 글자색 기반 금액 분해(빨강=확정, 파랑=임박 90%+).
  // 마이그레이션(rev_color_amounts) 적용 전 행에는 없을 수 있어 optional
  monthly_confirmed?: Record<string, number> | null
  monthly_high_conf?: Record<string, number> | null
  raw: Record<string, unknown>; synced_at: string
}

export async function listBranchRevDeals(filter?: { team?: string }): Promise<BranchRevDeal[]> {
  const sb = createSupabaseAdminClient()
  let q = sb.from("branch_rev_deals").select("*")
  if (filter?.team && filter.team !== "ALL") q = q.eq("team", filter.team)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as BranchRevDeal[]).map((deal) => ({
    ...deal,
    manager: normalizeBranchMemberName(deal.manager),
  }))
}

export async function getBranchRevDeal(id: string): Promise<BranchRevDeal | null> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.from("branch_rev_deals").select("*").eq("id", id).maybeSingle()
  if (error) throw error
  if (!data) return null
  const deal = data as BranchRevDeal
  return { ...deal, manager: normalizeBranchMemberName(deal.manager) }
}

export async function replaceBranchRevDeals(rows: unknown[]): Promise<number> {
  const sb = createSupabaseAdminClient()
  const { error } = await sb.rpc("replace_branch_rev_deals", { rows })
  if (error) throw error
  return rows.length
}
