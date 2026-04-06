"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  InsertPaymentV2,
  InsertReceiptV2,
} from "@/lib/supabase/database.types.v2";
import type { PaymentRecord, ReceiptRecord } from "@/lib/partner-portal/types";

/* ─── Payment ───────────────────────────────────────────── */

export async function createPayment(
  input: InsertPaymentV2
): Promise<PaymentRecord> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("payments_v2")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data as PaymentRecord;
}

/* ─── Receipt ───────────────────────────────────────────── */

async function generateReceiptNumber(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const year = new Date().getFullYear();
  const prefix = `R-${year}-`;

  const { count } = await supabase
    .from("receipts_v2")
    .select("*", { count: "exact", head: true })
    .like("receipt_number", `${prefix}%`);

  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

export async function createReceipt(
  input: Omit<InsertReceiptV2, "receipt_number">
): Promise<ReceiptRecord> {
  const supabase = createSupabaseAdminClient();
  const receiptNumber = await generateReceiptNumber();

  const { data, error } = await supabase
    .from("receipts_v2")
    .insert({ ...input, receipt_number: receiptNumber })
    .select()
    .single();

  if (error) throw error;
  return data as ReceiptRecord;
}

export async function getReceipt(
  id: string
): Promise<ReceiptRecord | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("receipts_v2")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as ReceiptRecord;
}
