"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Partner, PartnerInsert, PartnerUpdate } from "@/lib/supabase/database.types";

export async function listPartners(): Promise<Partner[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("partners")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPartner(id: string): Promise<Partner | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("partners")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

export async function createPartner(input: PartnerInsert): Promise<Partner> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("partners")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePartner(id: string, input: PartnerUpdate): Promise<Partner> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("partners")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePartner(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("partners").delete().eq("id", id);
  if (error) throw error;
}
