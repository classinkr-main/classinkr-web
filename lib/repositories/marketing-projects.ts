/**
 * ─────────────────────────────────────────────────────────────
 * marketing-projects repository  —  마케팅 프로젝트 묶음(D3) CRUD + 캠페인 배정
 * ─────────────────────────────────────────────────────────────
 *
 * 프로젝트는 marketing_campaigns(D1)를 묶는 상위 개체다. 소속 관계는
 * marketing_campaigns.project_id → marketing_projects.id (FK ON DELETE SET NULL:
 * 프로젝트 삭제 시 멤버 캠페인은 보존, 소속만 해제). 롤업(멤버 캠페인 수·채널/행사
 * 수·예산 소진%)은 이 레이어에서 계산하지 않는다 — D3-2(API 레이어)가
 * listCampaignsByProject 의 links 를 원천으로 읽기시점에 집계한다.
 *
 * RLS: marketing_projects 는 admin-only(deny-all). 반드시 admin(service-role)
 * 클라이언트로만 접근한다 — server(anon/authenticated) 클라이언트는 RLS 로 전 행이 차단된다.
 * 스키마: supabase/migrations/20260724_marketing_projects.sql
 */

import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type {
  MarketingProject,
  ProjectStatus,
  CampaignWithLinks,
  CampaignLink,
  CampaignRefType,
} from "@/lib/types/marketing-campaign"

const sb = () => createSupabaseAdminClient()

/* ─────────────────────────────────────────────────────────────
   입력 타입 (writable 필드 — camelCase)
   ───────────────────────────────────────────────────────────── */

export interface CreateProjectInput {
  name: string
  objective?: string | null
  status?: ProjectStatus
  startsAt?: string | null
  endsAt?: string | null
  budget?: number | null
  owner?: string | null
}

export type UpdateProjectInput = Partial<CreateProjectInput>

/* ─────────────────────────────────────────────────────────────
   변환 헬퍼 (row snake_case ↔ 도메인 camelCase)
   admin 클라이언트는 Database 제네릭 없이 생성되어 row 가 loosely-typed 이므로
   sibling 저장소(marketing-campaigns.ts)와 동일하게 any row 매퍼를 쓴다.
   ───────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProject(row: any): MarketingProject {
  return {
    id: row.id,
    name: row.name,
    objective: row.objective ?? null,
    status: row.status as ProjectStatus,
    startsAt: row.starts_at ?? null, // DATE → ISO 문자열 그대로
    endsAt: row.ends_at ?? null,
    budget: row.budget ?? null, // BIGINT(KRW) → number
    owner: row.owner ?? null,
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

// marketing-campaigns.ts 의 rowToCampaignWithLinks 와 동형 매퍼.
// D1 파일의 매퍼는 export 되지 않았고 이 태스크의 스코프는 이 저장소 파일에 한정되어
// (D1 파일 불변) 여기서 자립적으로 다시 정의한다 — 스키마가 같으므로 형태를 일치시킨다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCampaignWithLinks(row: any): CampaignWithLinks {
  return {
    id: row.id,
    name: row.name,
    objective: row.objective ?? null,
    status: row.status,
    channels: row.channels ?? [],
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    budget: row.budget ?? null,
    owner: row.owner ?? null,
    projectId: row.project_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    links: (row.campaign_links ?? []).map(rowToLink),
    // rollup 은 이 레이어에서 계산하지 않는다(omit) — D3-2 API 가 집계한다.
  }
}

/* ─────────────────────────────────────────────────────────────
   프로젝트 CRUD
   ───────────────────────────────────────────────────────────── */

export async function listProjects(): Promise<MarketingProject[]> {
  const { data, error } = await sb()
    .from("marketing_projects")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) throw new Error(`[marketing-projects] 프로젝트 조회 실패: ${error.message}`)
  return (data ?? []).map(rowToProject)
}

export async function getProject(id: string): Promise<MarketingProject | null> {
  const { data, error } = await sb()
    .from("marketing_projects")
    .select("*")
    .eq("id", id)
    .single()
  if (error) return null
  return rowToProject(data)
}

export async function createProject(input: CreateProjectInput): Promise<MarketingProject> {
  const { data, error } = await sb()
    .from("marketing_projects")
    .insert({
      name: input.name,
      objective: input.objective ?? null,
      status: input.status ?? "active", // DB DEFAULT 'active' 와 일치
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      budget: input.budget ?? null,
      owner: input.owner ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(`[marketing-projects] 프로젝트 생성 실패: ${error.message}`)
  return rowToProject(data)
}

export async function updateProject(
  id: string,
  patch: UpdateProjectInput,
): Promise<MarketingProject> {
  const dbPatch: Record<string, unknown> = {}
  if (patch.name !== undefined) dbPatch.name = patch.name
  if (patch.objective !== undefined) dbPatch.objective = patch.objective
  if (patch.status !== undefined) dbPatch.status = patch.status
  if (patch.startsAt !== undefined) dbPatch.starts_at = patch.startsAt
  if (patch.endsAt !== undefined) dbPatch.ends_at = patch.endsAt
  if (patch.budget !== undefined) dbPatch.budget = patch.budget
  if (patch.owner !== undefined) dbPatch.owner = patch.owner

  const { data, error } = await sb()
    .from("marketing_projects")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single()
  if (error) throw new Error(`[marketing-projects] 프로젝트 수정 실패: ${error.message}`)
  return rowToProject(data)
}

export async function deleteProject(id: string): Promise<void> {
  // 멤버 캠페인은 FK ON DELETE SET NULL 로 project_id 만 null 로 해제되고 보존된다.
  const { error } = await sb().from("marketing_projects").delete().eq("id", id)
  if (error) throw new Error(`[marketing-projects] 프로젝트 삭제 실패: ${error.message}`)
}

/* ─────────────────────────────────────────────────────────────
   캠페인 ↔ 프로젝트 배정
   ───────────────────────────────────────────────────────────── */

/**
 * 캠페인의 소속 프로젝트를 지정/해제한다. projectId=null 이면 소속 해제(무소속).
 * marketing_campaigns.project_id 단일 컬럼만 갱신하는 직접 업데이트 —
 * 단일 필드라 캠페인 저장소를 경유하지 않고 여기서 self-contained 하게 처리한다.
 */
export async function assignCampaignToProject(
  campaignId: string,
  projectId: string | null,
): Promise<void> {
  const { error } = await sb()
    .from("marketing_campaigns")
    .update({ project_id: projectId })
    .eq("id", campaignId)
  if (error) throw new Error(`[marketing-projects] 캠페인 배정 실패: ${error.message}`)
}

/**
 * 프로젝트에 소속된 멤버 캠페인을 links[] 와 함께 조회한다(D3-2 롤업 원천).
 * marketing-campaigns 의 listCampaigns 와 동일한 campaign_links 조인 형태 —
 * 여기서는 project_id 로 필터링한다.
 */
export async function listCampaignsByProject(projectId: string): Promise<CampaignWithLinks[]> {
  const { data, error } = await sb()
    .from("marketing_campaigns")
    .select("*, campaign_links(*)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
  if (error) {
    throw new Error(`[marketing-projects] 프로젝트 캠페인 조회 실패: ${error.message}`)
  }
  return (data ?? []).map(rowToCampaignWithLinks)
}
