/**
 * ─────────────────────────────────────────────────────────────
 * marketing-campaigns repository  —  크로스채널 캠페인 개체(D1) CRUD + 링크
 * ─────────────────────────────────────────────────────────────
 *
 * Approach A(연결·롤업 레이어): marketing_campaigns(우산 캠페인) + campaign_links
 * (채널 실행 연결). 롤업은 이 레이어에서 계산하지 않는다 — D1-3(순수함수)/API 레이어가
 * 링크를 원천으로 읽기시점에 집계한다. 여기서는 links[] 만 채워 반환하고 rollup 은 omit.
 *
 * RLS: 두 테이블은 admin-only(deny-all). 반드시 admin(service-role) 클라이언트로만 접근한다 —
 * server(anon/authenticated) 클라이언트는 RLS 로 전 행이 차단된다.
 * 스키마: supabase/migrations/20260724_marketing_campaigns.sql
 */

import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type {
  MarketingCampaign,
  CampaignLink,
  CampaignWithLinks,
  CampaignStatus,
  CampaignRefType,
} from "@/lib/types/marketing-campaign"

const sb = () => createSupabaseAdminClient()

/* ─────────────────────────────────────────────────────────────
   입력 타입 (writable 필드 — camelCase)
   ───────────────────────────────────────────────────────────── */

export interface CreateCampaignInput {
  name: string
  objective?: string | null
  status?: CampaignStatus
  channels?: string[]
  startsAt?: string | null
  endsAt?: string | null
  budget?: number | null
  owner?: string | null
  projectId?: string | null
}

export type UpdateCampaignInput = Partial<CreateCampaignInput>

/* ─────────────────────────────────────────────────────────────
   변환 헬퍼 (row snake_case ↔ 도메인 camelCase)
   admin 클라이언트는 Database 제네릭 없이 생성되어 row 가 loosely-typed 이므로
   sibling 저장소(automation.ts)와 동일하게 any row 매퍼를 쓴다.
   ───────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCampaign(row: any): MarketingCampaign {
  return {
    id: row.id,
    name: row.name,
    objective: row.objective ?? null,
    status: row.status as CampaignStatus,
    channels: row.channels ?? [],
    startsAt: row.starts_at ?? null, // DATE → ISO 문자열 그대로
    endsAt: row.ends_at ?? null,
    budget: row.budget ?? null, // BIGINT(KRW) → number
    owner: row.owner ?? null,
    projectId: row.project_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLink(row: any): CampaignLink {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    refType: row.ref_type as CampaignRefType,
    refId: row.ref_id,
    createdAt: row.created_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCampaignWithLinks(row: any): CampaignWithLinks {
  return {
    ...rowToCampaign(row),
    links: (row.campaign_links ?? []).map(rowToLink),
    // rollup 은 이 레이어에서 계산하지 않는다(omit).
  }
}

/* ─────────────────────────────────────────────────────────────
   캠페인 CRUD
   ───────────────────────────────────────────────────────────── */

export async function listCampaigns(): Promise<CampaignWithLinks[]> {
  const { data, error } = await sb()
    .from("marketing_campaigns")
    .select("*, campaign_links(*)")
    .order("created_at", { ascending: false })
  if (error) throw new Error(`[marketing-campaigns] 캠페인 조회 실패: ${error.message}`)
  return (data ?? []).map(rowToCampaignWithLinks)
}

export async function getCampaign(id: string): Promise<CampaignWithLinks | null> {
  const { data, error } = await sb()
    .from("marketing_campaigns")
    .select("*, campaign_links(*)")
    .eq("id", id)
    .single()
  if (error) return null
  return rowToCampaignWithLinks(data)
}

export async function createCampaign(input: CreateCampaignInput): Promise<MarketingCampaign> {
  const { data, error } = await sb()
    .from("marketing_campaigns")
    .insert({
      name: input.name,
      objective: input.objective ?? null,
      status: input.status ?? "planned",
      channels: input.channels ?? [],
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      budget: input.budget ?? null,
      owner: input.owner ?? null,
      project_id: input.projectId ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(`[marketing-campaigns] 캠페인 생성 실패: ${error.message}`)
  return rowToCampaign(data)
}

export async function updateCampaign(
  id: string,
  patch: UpdateCampaignInput,
): Promise<MarketingCampaign> {
  const dbPatch: Record<string, unknown> = {}
  if (patch.name !== undefined) dbPatch.name = patch.name
  if (patch.objective !== undefined) dbPatch.objective = patch.objective
  if (patch.status !== undefined) dbPatch.status = patch.status
  if (patch.channels !== undefined) dbPatch.channels = patch.channels
  if (patch.startsAt !== undefined) dbPatch.starts_at = patch.startsAt
  if (patch.endsAt !== undefined) dbPatch.ends_at = patch.endsAt
  if (patch.budget !== undefined) dbPatch.budget = patch.budget
  if (patch.owner !== undefined) dbPatch.owner = patch.owner
  if (patch.projectId !== undefined) dbPatch.project_id = patch.projectId

  const { data, error } = await sb()
    .from("marketing_campaigns")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single()
  if (error) throw new Error(`[marketing-campaigns] 캠페인 수정 실패: ${error.message}`)
  return rowToCampaign(data)
}

export async function deleteCampaign(id: string): Promise<void> {
  // campaign_links 는 FK ON DELETE CASCADE 로 함께 제거된다.
  const { error } = await sb().from("marketing_campaigns").delete().eq("id", id)
  if (error) throw new Error(`[marketing-campaigns] 캠페인 삭제 실패: ${error.message}`)
}

/* ─────────────────────────────────────────────────────────────
   캠페인 ↔ 채널 실행 링크
   ───────────────────────────────────────────────────────────── */

/**
 * 캠페인에 채널 실행 링크를 추가한다. (campaign_id, ref_type, ref_id) UNIQUE 제약이 있어
 * 중복 추가는 raw 500 대신 idempotent 하게 처리한다 — upsert(onConflict)로 원자적이라
 * 동시 추가 레이스에도 안전하며, 재추가 시 기존 링크를 그대로 반환한다.
 */
export async function addLink(
  campaignId: string,
  refType: CampaignRefType,
  refId: string,
): Promise<CampaignLink> {
  const { data, error } = await sb()
    .from("campaign_links")
    .upsert(
      { campaign_id: campaignId, ref_type: refType, ref_id: refId },
      { onConflict: "campaign_id,ref_type,ref_id" },
    )
    .select()
    .single()
  if (error) throw new Error(`[marketing-campaigns] 링크 추가 실패: ${error.message}`)
  return rowToLink(data)
}

export async function removeLink(campaignId: string, linkId: string): Promise<void> {
  // 경로의 캠페인 소속을 함께 검증한다(2026-08-18) — 다른 캠페인의 linkId 를 넘겨도 지워지지 않는다.
  const { error } = await sb()
    .from("campaign_links")
    .delete()
    .eq("id", linkId)
    .eq("campaign_id", campaignId)
  if (error) throw new Error(`[marketing-campaigns] 링크 해제 실패: ${error.message}`)
}
