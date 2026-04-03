"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Team, TeamInsert, TeamUpdate } from "@/lib/supabase/database.types";

export async function listTeams(activeOnly = false): Promise<Team[]> {
  const supabase = createSupabaseAdminClient();
  let q = supabase.from("teams").select("*").order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getTeam(id: string): Promise<Team | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("teams").select("*").eq("id", id).single();
  if (error) return null;
  return data;
}

export async function createTeam(input: TeamInsert): Promise<Team> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("teams").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateTeam(id: string, input: TeamUpdate): Promise<Team> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("teams").update(input).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTeam(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("teams").delete().eq("id", id);
  if (error) throw error;
}
