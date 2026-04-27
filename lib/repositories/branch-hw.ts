import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export interface HwInbound { id: string; logistics_no: string | null; inbound_date: string | null; product: string; quantity: number; unit_price: number | null; amount: number | null; serials: string[]; storage: string | null; importer: string | null; remarks: string | null; synced_at: string }
export interface HwOutbound { id: string; logistics_no: string | null; outbound_date: string | null; owner: string | null; product: string; quantity: number; revenue: number | null; destination: string | null; serials: string[]; progress: string | null; type: string | null; remarks: string | null; synced_at: string }
export interface HwStock { id: string; product: string; category: string | null; quantity: number }
export interface HwSalesMonthly { id: string; fiscal_year: number; fiscal_month: number; product: string; quantity: number }

async function listAll<T>(table: string): Promise<T[]> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.from(table).select("*")
  if (error) throw error
  return (data ?? []) as T[]
}
export const listHwInbound = () => listAll<HwInbound>("branch_hw_inbound")
export const listHwOutbound = () => listAll<HwOutbound>("branch_hw_outbound")
export const listHwStock = () => listAll<HwStock>("branch_hw_stock")
export const listHwSalesMonthly = () => listAll<HwSalesMonthly>("branch_hw_sales_monthly")

async function replaceVia(fn: string, rows: unknown[]): Promise<number> {
  const sb = createSupabaseAdminClient()
  const { error } = await sb.rpc(fn, { rows })
  if (error) throw error
  return rows.length
}
export const replaceHwInbound = (r: unknown[]) => replaceVia("replace_branch_hw_inbound", r)
export const replaceHwOutbound = (r: unknown[]) => replaceVia("replace_branch_hw_outbound", r)
export const replaceHwStock = (r: unknown[]) => replaceVia("replace_branch_hw_stock", r)
export const replaceHwSalesMonthly = (r: unknown[]) => replaceVia("replace_branch_hw_sales_monthly", r)
