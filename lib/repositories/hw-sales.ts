"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  HwSale, HwSaleInsert, HwSaleUpdate,
  HwSaleItem, HwSaleItemInsert,
} from "@/lib/supabase/database.types";

export type HwSaleWithItems = HwSale & { items: HwSaleItem[] };

/* ─── 채번 ─────────────────────────────────────────────── */

export async function generateSaleNumber(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("hw_sales")
    .select("*", { count: "exact", head: true })
    .like("sale_number", `HS-${year}-%`);
  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `HS-${year}-${seq}`;
}

/* ─── HwSales CRUD ───────────────────────────────────────── */

export async function listHwSales(options?: {
  partnerId?: string;
  contractId?: string;
}): Promise<HwSale[]> {
  const supabase = createSupabaseAdminClient();
  let q = supabase.from("hw_sales").select("*").order("created_at", { ascending: false });
  if (options?.partnerId) q = q.eq("partner_id", options.partnerId);
  if (options?.contractId) q = q.eq("contract_id", options.contractId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getHwSale(id: string): Promise<HwSaleWithItems | null> {
  const supabase = createSupabaseAdminClient();
  const [{ data: sale, error: sErr }, { data: items }] = await Promise.all([
    supabase.from("hw_sales").select("*").eq("id", id).single(),
    supabase.from("hw_sale_items").select("*").eq("sale_id", id).order("sort_order"),
  ]);
  if (sErr) return null;
  return { ...sale!, items: items ?? [] };
}

export async function createHwSale(
  input: HwSaleInsert,
  items: Omit<HwSaleItemInsert, "sale_id">[]
): Promise<HwSale> {
  const supabase = createSupabaseAdminClient();
  const { data: sale, error } = await supabase
    .from("hw_sales")
    .insert(input)
    .select()
    .single();
  if (error) throw error;

  if (items.length > 0) {
    const itemRows = items.map((item, idx) => ({ ...item, sale_id: sale.id, sort_order: idx }));
    const { error: iErr } = await supabase.from("hw_sale_items").insert(itemRows);
    if (iErr) throw iErr;
  }

  return sale;
}

export async function updateHwSale(
  id: string,
  input: HwSaleUpdate,
  items?: Omit<HwSaleItemInsert, "sale_id">[]
): Promise<HwSale> {
  const supabase = createSupabaseAdminClient();
  const { data: sale, error } = await supabase
    .from("hw_sales")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  if (items !== undefined) {
    await supabase.from("hw_sale_items").delete().eq("sale_id", id);
    if (items.length > 0) {
      const itemRows = items.map((item, idx) => ({ ...item, sale_id: id, sort_order: idx }));
      await supabase.from("hw_sale_items").insert(itemRows);
    }
  }

  return sale;
}

export async function deleteHwSale(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("hw_sales").delete().eq("id", id);
  if (error) throw error;
}
