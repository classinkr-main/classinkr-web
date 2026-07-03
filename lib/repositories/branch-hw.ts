import "server-only"
import { unstable_cache, revalidateTag } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const BRANCH_HW_CACHE_TAG = "branch-hw"
const BRANCH_HW_REVALIDATE_SECONDS = 60

export interface HwInbound { id: string; logistics_no: string | null; inbound_date: string | null; product: string; quantity: number; unit_price: number | null; amount: number | null; serials: string[]; storage: string | null; importer: string | null; remarks: string | null; raw: unknown; synced_at: string }
export interface HwOutbound { id: string; logistics_no: string | null; outbound_date: string | null; owner: string | null; product: string; quantity: number; revenue: number | null; destination: string | null; serials: string[]; progress: string | null; type: string | null; remarks: string | null; raw: unknown; synced_at: string }
export interface HwStock { id: string; product: string; category: string | null; quantity: number; raw: unknown; synced_at: string }
export interface HwSalesMonthly { id: string; fiscal_year: number; fiscal_month: number; product: string; quantity: number; raw: unknown; synced_at: string }

const FETCH_PAGE_SIZE = 1000

// PostgREST(Supabase)는 요청당 반환 행 수를 기본 1000으로 캡한다. 전량 조회가 캡에 걸리면
// 에러 없이 잘려 재고·원장 집계가 조용히 틀어진다 — 짧은 페이지가 나올 때까지 이어 읽는다.
// range(offset) 방식은 읽는 도중 동시 insert가 페이지 경계를 밀어 기존 행이 중복/누락될 수 있어
// id 키셋(afterId 커서) 방식을 쓴다: 기존 행은 커서 기준으로 정확히 1회씩 읽힌다.
// buildQuery는 매 페이지 새 쿼리를 만들어야 하며(빌더는 1회용), 반드시
// .order("id", { ascending: true }).limit(limit) + (afterId ? .gt("id", afterId)) 형태여야 한다.
// 반환 순서는 id 오름차순 — 다른 순서가 필요하면 호출부에서 재정렬한다.
// (hardware-inventory 등 다른 저장소도 이 헬퍼를 공유한다.)
export async function fetchAllSupabaseRows<T extends { id: string }>(
  buildQuery: (afterId: string | null, limit: number) => PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  let afterId: string | null = null
  for (;;) {
    const { data, error } = await buildQuery(afterId, FETCH_PAGE_SIZE)
    if (error) throw error
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < FETCH_PAGE_SIZE) break
    afterId = page[page.length - 1].id
  }
  return rows
}

async function listAllUncached<T extends { id: string }>(table: string): Promise<T[]> {
  const sb = createSupabaseAdminClient()
  return fetchAllSupabaseRows<T>((afterId, limit) => {
    let query = sb.from(table).select("*").order("id", { ascending: true }).limit(limit)
    if (afterId) query = query.gt("id", afterId)
    return query
  })
}

const listCachedHwInbound = unstable_cache(
  () => listAllUncached<HwInbound>("branch_hw_inbound"),
  ["branch-hw-inbound"],
  { revalidate: BRANCH_HW_REVALIDATE_SECONDS, tags: [BRANCH_HW_CACHE_TAG] },
)
const listCachedHwOutbound = unstable_cache(
  () => listAllUncached<HwOutbound>("branch_hw_outbound"),
  ["branch-hw-outbound"],
  { revalidate: BRANCH_HW_REVALIDATE_SECONDS, tags: [BRANCH_HW_CACHE_TAG] },
)
const listCachedHwStock = unstable_cache(
  () => listAllUncached<HwStock>("branch_hw_stock"),
  ["branch-hw-stock"],
  { revalidate: BRANCH_HW_REVALIDATE_SECONDS, tags: [BRANCH_HW_CACHE_TAG] },
)
const listCachedHwSalesMonthly = unstable_cache(
  () => listAllUncached<HwSalesMonthly>("branch_hw_sales_monthly"),
  ["branch-hw-sales-monthly"],
  { revalidate: BRANCH_HW_REVALIDATE_SECONDS, tags: [BRANCH_HW_CACHE_TAG] },
)

export const listHwInbound = () => listCachedHwInbound()
export const listHwOutbound = () => listCachedHwOutbound()
export const listHwStock = () => listCachedHwStock()
export const listHwSalesMonthly = () => listCachedHwSalesMonthly()

export const listFreshHwInbound = () => listAllUncached<HwInbound>("branch_hw_inbound")
export const listFreshHwOutbound = () => listAllUncached<HwOutbound>("branch_hw_outbound")
export const listFreshHwStock = () => listAllUncached<HwStock>("branch_hw_stock")
export const listFreshHwSalesMonthly = () => listAllUncached<HwSalesMonthly>("branch_hw_sales_monthly")

async function replaceVia(fn: string, rows: unknown[]): Promise<number> {
  const sb = createSupabaseAdminClient()
  const { error } = await sb.rpc(fn, { rows })
  if (error) throw error
  revalidateTag(BRANCH_HW_CACHE_TAG, "max")
  return rows.length
}
export const replaceHwInbound = (r: unknown[]) => replaceVia("replace_branch_hw_inbound", r)
export const replaceHwOutbound = (r: unknown[]) => replaceVia("replace_branch_hw_outbound", r)
export const replaceHwStock = (r: unknown[]) => replaceVia("replace_branch_hw_stock", r)
export const replaceHwSalesMonthly = (r: unknown[]) => replaceVia("replace_branch_hw_sales_monthly", r)
