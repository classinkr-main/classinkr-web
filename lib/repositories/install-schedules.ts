"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  InstallSchedule, InstallScheduleInsert, InstallScheduleUpdate,
  Team, QuoteItem,
} from "@/lib/supabase/database.types";

export type InstallScheduleWithRelations = InstallSchedule & {
  team: Pick<Team, "id" | "name"> | null;
  quote_item: Pick<QuoteItem, "id" | "product_name" | "quantity"> | null;
};

export async function listInstallSchedules(filters?: {
  contractId?: string; partnerId?: string; teamId?: string;
  status?: string; from?: string; to?: string;
}): Promise<InstallScheduleWithRelations[]> {
  const supabase = createSupabaseAdminClient();
  let q = supabase
    .from("install_schedules")
    .select("*, team:teams(id, name), quote_item:quote_items(id, product_name, quantity)")
    .order("scheduled_date", { ascending: true });
  if (filters?.contractId) q = q.eq("contract_id", filters.contractId);
  if (filters?.partnerId)  q = q.eq("partner_id", filters.partnerId);
  if (filters?.teamId)     q = q.eq("team_id", filters.teamId);
  if (filters?.status)     q = q.eq("status", filters.status);
  if (filters?.from)       q = q.gte("scheduled_date", filters.from);
  if (filters?.to)         q = q.lte("scheduled_date", filters.to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as InstallScheduleWithRelations[];
}

export async function getInstallSchedule(id: string): Promise<InstallScheduleWithRelations | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("install_schedules")
    .select("*, team:teams(id, name), quote_item:quote_items(id, product_name, quantity)")
    .eq("id", id).single();
  if (error) return null;
  return data as InstallScheduleWithRelations;
}

export async function createInstallSchedule(input: InstallScheduleInsert): Promise<InstallSchedule> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("install_schedules").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateInstallSchedule(id: string, input: InstallScheduleUpdate): Promise<InstallSchedule> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("install_schedules").update(input).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteInstallSchedule(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("install_schedules").delete().eq("id", id);
  if (error) throw error;
}

export interface SalesSummary {
  product_name: string;
  quoted_qty: number;
  contracted_qty: number;
  scheduled_qty: number;
  installed_qty: number;
}

type RelatedQuoteStatus = { status: string };
type RelatedQuoteItem = { product_name: string; quantity: number };

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export async function getSalesSummary(): Promise<SalesSummary[]> {
  const supabase = createSupabaseAdminClient();
  const { data: quoteItems } = await supabase
    .from("quote_items")
    .select("product_name, quantity, quote:quotes(status)")
    .not("quote", "is", null);
  const { data: schedules } = await supabase
    .from("install_schedules")
    .select("status, quote_item:quote_items(product_name, quantity)");
  const map = new Map<string, SalesSummary>();
  const ensure = (name: string) => {
    if (!map.has(name)) map.set(name, { product_name: name, quoted_qty: 0, contracted_qty: 0, scheduled_qty: 0, installed_qty: 0 });
    return map.get(name)!;
  };
  for (const item of quoteItems ?? []) {
    const quote = firstRelation(item.quote) as RelatedQuoteStatus | null;
    if (!quote) continue;
    const s = ensure(item.product_name);
    const qty = item.quantity ?? 0;
    if (["sent", "accepted", "converted"].includes(quote.status)) s.quoted_qty += qty;
    if (quote.status === "converted") s.contracted_qty += qty;
  }
  for (const sch of schedules ?? []) {
    const qi = firstRelation(sch.quote_item) as RelatedQuoteItem | null;
    if (!qi) continue;
    const s = ensure(qi.product_name);
    if (sch.status === "confirmed") s.scheduled_qty += qi.quantity;
    if (sch.status === "completed") s.installed_qty += qi.quantity;
  }
  return Array.from(map.values()).sort((a, b) => b.contracted_qty - a.contracted_qty);
}
