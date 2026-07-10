import "server-only"
import { unstable_cache, revalidateTag } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"

export const BRANCH_REV_DEALS_CACHE_TAG = "branch-rev-deals"
const BRANCH_REV_DEALS_REVALIDATE_SECONDS = 60

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

type BranchRevDealListRow = Omit<BranchRevDeal, "raw"> & {
  raw?: Record<string, unknown> | null
}

const BRANCH_REV_DEAL_COLUMN_LIST = [
  "id",
  "sheet_row",
  "customer_name",
  "branch_contact",
  "team",
  "manager",
  "deal_type",
  "status",
  "first_payment",
  "product_version",
  "region",
  "importance",
  "note",
  "contract_target",
  "monthly_payments",
  "monthly_red",
  "monthly_confirmed",
  "monthly_high_conf",
  "raw",
  "synced_at",
]

const BRANCH_REV_DEAL_LIST_COLUMNS = BRANCH_REV_DEAL_COLUMN_LIST.join(", ")

// getBranchRevDeal 콜러(딜 슬라이드오버·초안 프리필)는 raw JSON을 읽지 않으므로
// 상세 조회에서는 대용량 raw 컬럼을 생략해 페이로드를 줄인다.
const BRANCH_REV_DEAL_DETAIL_COLUMNS = BRANCH_REV_DEAL_COLUMN_LIST.filter(
  (column) => column !== "raw",
).join(", ")

function normalizeDealRow(deal: BranchRevDealListRow): BranchRevDeal {
  return {
    ...deal,
    manager: normalizeBranchMemberName(deal.manager),
    monthly_payments: deal.monthly_payments ?? {},
    monthly_red: deal.monthly_red ?? {},
    monthly_confirmed: deal.monthly_confirmed ?? {},
    monthly_high_conf: deal.monthly_high_conf ?? {},
    raw: deal.raw ?? {},
  }
}

const BRANCH_REV_DEALS_PAGE_SIZE = 1000

const listCachedBranchRevDeals = unstable_cache(
  async (team: string): Promise<BranchRevDeal[]> => {
    const sb = createSupabaseAdminClient()
    // PostgREST는 요청당 기본 1000행에서 조용히 절단한다 — REV 시트(BD/MKT/CSM 미러)가
    // 1000행을 넘기면 매출·파이프라인이 실제보다 낮게 잡힌다. 결정적 order(id) + range로
    // 짧은 페이지가 나올 때까지 이어 읽는다(안정 페이징에 유니크 정렬 필수).
    const rows: BranchRevDealListRow[] = []
    for (let from = 0; ; from += BRANCH_REV_DEALS_PAGE_SIZE) {
      let q = sb
        .from("branch_rev_deals")
        .select(BRANCH_REV_DEAL_LIST_COLUMNS)
        .order("id", { ascending: true })
        .range(from, from + BRANCH_REV_DEALS_PAGE_SIZE - 1)
      if (team !== "ALL") q = q.eq("team", team)
      const { data, error } = await q
      if (error) throw error
      const page = (data ?? []) as unknown as BranchRevDealListRow[]
      rows.push(...page)
      if (page.length < BRANCH_REV_DEALS_PAGE_SIZE) break
    }
    return rows.map(normalizeDealRow)
  },
  [BRANCH_REV_DEALS_CACHE_TAG],
  { revalidate: BRANCH_REV_DEALS_REVALIDATE_SECONDS, tags: [BRANCH_REV_DEALS_CACHE_TAG] },
)

export async function listBranchRevDeals(filter?: { team?: string }): Promise<BranchRevDeal[]> {
  return listCachedBranchRevDeals(filter?.team && filter.team !== "ALL" ? filter.team : "ALL")
}

export async function getBranchRevDeal(id: string): Promise<BranchRevDeal | null> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("branch_rev_deals")
    .select(BRANCH_REV_DEAL_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const deal = data as unknown as BranchRevDealListRow
  return normalizeDealRow(deal)
}

export async function replaceBranchRevDeals(rows: unknown[]): Promise<number> {
  const sb = createSupabaseAdminClient()
  const { error } = await sb.rpc("replace_branch_rev_deals", { rows })
  if (error) throw error
  revalidateTag(BRANCH_REV_DEALS_CACHE_TAG, "max")
  return rows.length
}
