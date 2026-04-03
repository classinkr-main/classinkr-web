"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Quote, QuoteInsert, QuoteUpdate,
  QuoteItem, QuoteItemInsert, QuoteItemUpdate,
} from "@/lib/supabase/database.types";

export type QuoteWithItems = Quote & { items: QuoteItem[] };

/* ─── 채번 ─────────────────────────────────────────────── */

export async function generateQuoteNumber(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("quotes")
    .select("*", { count: "exact", head: true })
    .like("quote_number", `Q-${year}-%`);
  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `Q-${year}-${seq}`;
}

/* ─── Quotes CRUD ────────────────────────────────────────── */

export async function listQuotes(partnerId?: string): Promise<Quote[]> {
  const supabase = createSupabaseAdminClient();
  let q = supabase.from("quotes").select("*").order("created_at", { ascending: false });
  if (partnerId) q = q.eq("partner_id", partnerId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getQuote(id: string): Promise<QuoteWithItems | null> {
  const supabase = createSupabaseAdminClient();
  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .single();
  if (qErr) return null;

  const { data: items } = await supabase
    .from("quote_items")
    .select("*")
    .eq("quote_id", id)
    .order("sort_order");

  return { ...quote, items: items ?? [] };
}

export async function createQuote(
  input: QuoteInsert,
  items: Omit<QuoteItemInsert, "quote_id">[]
): Promise<QuoteWithItems> {
  const supabase = createSupabaseAdminClient();
  const { data: quote, error } = await supabase
    .from("quotes")
    .insert(input)
    .select()
    .single();
  if (error) throw error;

  const itemRows = items.map((item, idx) => ({ ...item, quote_id: quote.id, sort_order: idx }));
  const { data: savedItems, error: iErr } = await supabase
    .from("quote_items")
    .insert(itemRows)
    .select();
  if (iErr) throw iErr;

  return { ...quote, items: savedItems ?? [] };
}

export async function updateQuote(
  id: string,
  input: QuoteUpdate,
  items?: Omit<QuoteItemInsert, "quote_id">[]
): Promise<QuoteWithItems> {
  const supabase = createSupabaseAdminClient();
  const { data: quote, error } = await supabase
    .from("quotes")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  if (items !== undefined) {
    await supabase.from("quote_items").delete().eq("quote_id", id);
    const itemRows = items.map((item, idx) => ({ ...item, quote_id: id, sort_order: idx }));
    await supabase.from("quote_items").insert(itemRows);
  }

  const { data: savedItems } = await supabase
    .from("quote_items")
    .select("*")
    .eq("quote_id", id)
    .order("sort_order");

  return { ...quote, items: savedItems ?? [] };
}

export async function deleteQuote(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw error;
}

/* ─── Items 개별 수정 ────────────────────────────────────── */

export async function updateQuoteItem(id: string, input: QuoteItemUpdate): Promise<QuoteItem> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("quote_items")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
