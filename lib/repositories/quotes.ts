"server-only";

import { getProductBySku } from "@/lib/product-templates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Quote, QuoteInsert, QuoteUpdate,
  QuoteItem, QuoteItemInsert, QuoteItemUpdate,
} from "@/lib/supabase/database.types";

export type QuoteWithItems = Quote & { items: QuoteItem[] };

function normalizeQuoteItemInput(
  item: Omit<QuoteItemInsert, "quote_id">,
  quoteId: string,
  index: number
): QuoteItemInsert {
  const quantity = Number(item.quantity ?? 0);
  const unitPrice = Number(item.unit_price ?? 0);
  const discountRate = Number(item.discount_rate ?? 0);

  return {
    ...item,
    quote_id: quoteId,
    sort_order: index,
    quantity,
    unit_price: unitPrice,
    discount_rate: discountRate,
    amount: Math.round(quantity * unitPrice * (1 - discountRate / 100)),
  };
}

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

  // 템플릿 SKU가 있는 경우 서버 측에서 단가를 한 번 더 보정한다.
  const verifiedItems = items.map((item) => {
    const template = item.sku ? getProductBySku(item.sku) : null;
    return {
      ...item,
      unit_price: template ? template.unit_price : Number(item.unit_price || 0),
    };
  });

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      ...input,
      subtotal: Number(input.subtotal || 0),
      tax_amount: Number(input.tax_amount || 0),
      total_amount: Number(input.total_amount || 0),
    })
    .select()
    .single();
  if (error) throw error;

  const itemRows = verifiedItems.map((item, idx) =>
    normalizeQuoteItemInput(item, quote.id, idx)
  );
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
    const itemRows = items.map((item, idx) =>
      normalizeQuoteItemInput(item, id, idx)
    );
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
