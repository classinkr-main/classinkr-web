"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Receipt, ReceiptInsert, ReceiptUpdate } from "@/lib/supabase/database.types";

/* ─── 채번 ─────────────────────────────────────────────── */

// 해당 연도 번호를 이만큼까지 읽는다(사전순 내림차순이라 999 를 넘어도 최댓값이 이 범위에 들어온다).
const RECEIPT_NUMBER_FETCH_LIMIT = 2000;

/**
 * 영수증 번호(`R-<연도>-<NNN>`) 채번 — 행 수가 아니라 최대 순번 + 1 이다.
 * 행 수 기반이면 중간 영수증을 삭제한 뒤 이미 있는 번호를 다시 만들어 UNIQUE 위반이 반복된다.
 */
export async function generateReceiptNumber(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const year = new Date().getFullYear();
  const prefix = `R-${year}-`;
  const { data, error } = await supabase
    .from("receipts")
    .select("receipt_number")
    .like("receipt_number", `${prefix}%`)
    .order("receipt_number", { ascending: false })
    .limit(RECEIPT_NUMBER_FETCH_LIMIT);
  if (error) throw error;
  let maxSequence = 0;
  for (const row of (data ?? []) as Array<{ receipt_number: unknown }>) {
    const value = row.receipt_number;
    if (typeof value !== "string" || !value.startsWith(prefix)) continue;
    const suffix = value.slice(prefix.length);
    if (/^\d+$/.test(suffix)) maxSequence = Math.max(maxSequence, Number(suffix));
  }
  return `${prefix}${String(maxSequence + 1).padStart(3, "0")}`;
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
