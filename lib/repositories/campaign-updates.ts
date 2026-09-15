// lib/repositories/campaign-updates.ts
// 우산 캠페인 수동 진행상황 로그(marketing_campaign_updates).
// RLS admin-only — admin 클라이언트 전용.

import "server-only"
import { revalidateTag } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { MARKETING_PERF_CACHE_TAG } from "@/lib/repositories/marketing"
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

/**
 * 캠페인별 최신 업데이트 1건씩 — 스코어보드 행 표시용.
 * 제약: 전역 created_at DESC 로 가져와 JS 에서 캠페인별 첫 등장만 취하는 구조라,
 * PostgREST 기본 상한(1000행)을 넘으면 업데이트가 뜸한 캠페인의 최신 항목이 그 상한
 * 밖으로 밀려나 조용히 누락될 수 있다. 캠페인 수·로그 총량이 그 임계에 가까워지면
 * DISTINCT ON 을 쓰는 RPC 로 교체한다.
 */
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
  // admin-performance-round3-2026-09-10.md §3.4 — perf 조립(lib/marketing/perf-assemble.ts)이
  // listRecentUpdates/latestUpdatesByCampaign로 이 테이블을 읽어 MARKETING_PERF_CACHE_TAG로
  // 캐시하는데, 이 쓰기가 그 태그를 무효화하지 않아 새 업데이트 로그가 최대 60초 동안 perf
  // 대시보드 피드에 나타나지 않던 공백이었다. marketing-campaigns.ts의 캠페인 CRUD와 같은
  // 톤("max" — SWR, 이 쓰기의 주체가 다음 화면에서 바로 확인하지 않아도 되는 로그 기록이므로
  // 하드 만료까지는 필요 없다).
  revalidateTag(MARKETING_PERF_CACHE_TAG, "max")
  return rowToUpdate(data)
}

export async function deleteCampaignUpdate(campaignId: string, updateId: string): Promise<void> {
  const { error } = await sb()
    .from("marketing_campaign_updates")
    .delete()
    .eq("id", updateId)
    .eq("campaign_id", campaignId) // 경로 캠페인 소속 검증 (removeLink 패턴)
  if (error) throw new Error(`[campaign-updates] 삭제 실패: ${error.message}`)
  // 위와 동일 — 삭제도 perf 피드 입력을 바꾸므로 무효화한다.
  revalidateTag(MARKETING_PERF_CACHE_TAG, "max")
}
