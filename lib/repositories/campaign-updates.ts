// lib/repositories/campaign-updates.ts
// 우산 캠페인 수동 진행상황 로그(marketing_campaign_updates).
// RLS admin-only — admin 클라이언트 전용.

import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { CampaignUpdate, CampaignUpdateKind } from "@/lib/types/marketing-campaign"

const sb = () => createSupabaseAdminClient()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToUpdate(row: any): CampaignUpdate {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    campaignName: row.marketing_campaigns?.name ?? null,
    kind: row.kind as CampaignUpdateKind,
    body: row.body,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  }
}

export async function listCampaignUpdates(campaignId: string, limit = 50): Promise<CampaignUpdate[]> {
  const { data, error } = await sb()
    .from("marketing_campaign_updates")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`[campaign-updates] 조회 실패: ${error.message}`)
  return (data ?? []).map(rowToUpdate)
}

/** 전 캠페인 통합 피드 — 캠페인명 조인. */
export async function listRecentUpdates(limit = 20): Promise<CampaignUpdate[]> {
  const { data, error } = await sb()
    .from("marketing_campaign_updates")
    .select("*, marketing_campaigns(name)")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`[campaign-updates] 피드 조회 실패: ${error.message}`)
  return (data ?? []).map(rowToUpdate)
}

/** 캠페인별 최신 업데이트 1건씩 — 스코어보드 행 표시용. */
export async function latestUpdatesByCampaign(
  campaignIds: string[]
): Promise<Record<string, CampaignUpdate>> {
  if (campaignIds.length === 0) return {}
  const { data, error } = await sb()
    .from("marketing_campaign_updates")
    .select("*")
    .in("campaign_id", campaignIds)
    .order("created_at", { ascending: false })
  if (error) throw new Error(`[campaign-updates] 최신 조회 실패: ${error.message}`)
  const result: Record<string, CampaignUpdate> = {}
  for (const row of data ?? []) {
    if (!result[row.campaign_id]) result[row.campaign_id] = rowToUpdate(row)
  }
  return result
}

export async function createCampaignUpdate(input: {
  campaignId: string
  kind: CampaignUpdateKind
  body: string
  createdBy?: string | null
}): Promise<CampaignUpdate> {
  const { data, error } = await sb()
    .from("marketing_campaign_updates")
    .insert({
      campaign_id: input.campaignId,
      kind: input.kind,
      body: input.body,
      created_by: input.createdBy ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(`[campaign-updates] 생성 실패: ${error.message}`)
  return rowToUpdate(data)
}

export async function deleteCampaignUpdate(campaignId: string, updateId: string): Promise<void> {
  const { error } = await sb()
    .from("marketing_campaign_updates")
    .delete()
    .eq("id", updateId)
    .eq("campaign_id", campaignId) // 경로 캠페인 소속 검증 (removeLink 패턴)
  if (error) throw new Error(`[campaign-updates] 삭제 실패: ${error.message}`)
}
