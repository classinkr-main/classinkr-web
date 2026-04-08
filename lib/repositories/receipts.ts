"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Receipt, ReceiptInsert, ReceiptUpdate } from "@/lib/supabase/database.types";

/* ─── 채번 ─────────────────────────────────────────────── */

export async function generateReceiptNumber(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("receipts")
    .select("*", { count: "exact", head: true })
    .like("receipt_number", `R-${year}-%`);
  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `R-${year}-${seq}`;
}

/* ─── Receipts CRUD ──────────────────────────────────────── */

export async function listReceipts(contractId?: string, partnerId?: string): Promise<Receipt[]> {
  const supabase = createSupabaseAdminClient();
  let q = supabase.from("receipts").select("*").order("created_at", { ascending: false });
  if (contractId) q = q.eq("contract_id", contractId);
  if (partnerId) q = q.eq("partner_id", partnerId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

export async function createReceipt(input: ReceiptInsert): Promise<Receipt> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("receipts")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateReceipt(id: string, input: ReceiptUpdate): Promise<Receipt> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("receipts")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteReceipt(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("receipts").delete().eq("id", id);
  if (error) throw error;
}
