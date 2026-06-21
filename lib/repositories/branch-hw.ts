import "server-only"
import { unstable_cache, revalidateTag } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const BRANCH_HW_CACHE_TAG = "branch-hw"
const BRANCH_HW_REVALIDATE_SECONDS = 60

export interface HwInbound { id: string; logistics_no: string | null; inbound_date: string | null; product: string; quantity: number; unit_price: number | null; amount: number | null; serials: string[]; storage: string | null; importer: string | null; remarks: string | null; synced_at: string }
export interface HwOutbound { id: string; logistics_no: string | null; outbound_date: string | null; owner: string | null; product: string; quantity: number; revenue: number | null; destination: string | null; serials: string[]; progress: string | null; type: string | null; remarks: string | null; synced_at: string }
export interface HwStock { id: string; product: string; category: string | null; quantity: number }
export interface HwSalesMonthly { id: string; fiscal_year: number; fiscal_month: number; product: string; quantity: number }

async function listAllUncached<T>(table: string): Promise<T[]> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.from(table).select("*")
  if (error) throw error
  return (data ?? []) as T[]
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
