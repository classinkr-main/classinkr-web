/**
 * Leads Repository — JSON ↔ Supabase 듀얼 모드
 *
 * 환경변수 USE_SUPABASE_LEADS=true 로 Supabase 전환
 * 기존 lib/db.ts 의 함수 시그니처를 최대한 유지
 */

import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Lead, LeadInsert, LeadUpdate } from "@/lib/supabase/database.types";

// 기존 타입 re-export (호환성)
export type { LeadStatus } from "@/lib/supabase/database.types";

const USE_SUPABASE = process.env.USE_SUPABASE_LEADS === "true";

/* ─── 기존 LeadRecord ↔ Supabase Lead 변환 ─── */

// 기존 코드와 호환되는 LeadRecord 타입
export interface LeadRecord {
  id: string;
  source: string;
  name?: string;
  org?: string;
  role?: string;
  size?: string;
  email?: string;
  phone?: string;
  message?: string;
  timestamp: string;
  status: "new" | "contacted" | "converted" | "closed";
  branch?: string;
  notes?: string;
}

function supabaseToLegacy(row: Lead): LeadRecord {
  return {
    id: row.id,
    source: row.source,
    name: row.name ?? undefined,
    org: row.org ?? undefined,
    role: row.role ?? undefined,
    size: row.size ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    message: row.message ?? undefined,
    timestamp: row.created_at,
    status: row.status,
    branch: row.branch ?? undefined,
    notes: row.notes ?? undefined,
  };
}

/* ─── READ ─── */

export async function getLeads(): Promise<LeadRecord[]> {
  if (!USE_SUPABASE) {
    const { getLeads: jsonGetLeads } = await import("@/lib/db");
    return jsonGetLeads();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`[leads] 조회 실패: ${error.message}`);
  return (data as Lead[]).map(supabaseToLegacy);
}

export async function getLeadById(id: string): Promise<LeadRecord | null> {
  if (!USE_SUPABASE) {
    const { getLeads: jsonGetLeads } = await import("@/lib/db");
    return jsonGetLeads().find((l) => l.id === id) ?? null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return supabaseToLegacy(data as Lead);
}

/* ─── CREATE ─── */

export async function saveLead(
  lead: Omit<LeadRecord, "id" | "status">
): Promise<LeadRecord> {
  if (!USE_SUPABASE) {
    const { saveLead: jsonSaveLead } = await import("@/lib/db");
    return jsonSaveLead(lead);
  }

  // 공개 리드 제출은 admin 클라이언트 사용 (RLS: anyone can insert)
  const supabase = createSupabaseAdminClient();

  const insert: LeadInsert = {
    source: lead.source,
    name: lead.name ?? null,
    org: lead.org ?? null,
    role: lead.role ?? null,
    size: lead.size ?? null,
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    message: lead.message ?? null,
    branch: lead.branch ?? null,
    status: "new",
    notes: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
  };

  const { data, error } = await supabase
    .from("leads")
    .insert(insert)
    .select()
    .single();

  if (error) throw new Error(`[leads] 저장 실패: ${error.message}`);
  return supabaseToLegacy(data as Lead);
}

/* ─── UPDATE ─── */

export async function updateLead(
  id: string,
  patch: Partial<LeadRecord>
): Promise<LeadRecord | null> {
  if (!USE_SUPABASE) {
    const { updateLead: jsonUpdateLead } = await import("@/lib/db");
    return jsonUpdateLead(id, patch);
  }

  const supabase = await createSupabaseServerClient();

  const update: LeadUpdate = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.branch !== undefined) update.branch = patch.branch;
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.email !== undefined) update.email = patch.email;
  if (patch.phone !== undefined) update.phone = patch.phone;
  if (patch.org !== undefined) update.org = patch.org;

  const { data, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) return null;
  return supabaseToLegacy(data as Lead);
}

/* ─── DELETE ─── */

export async function deleteLead(id: string): Promise<boolean> {
  if (!USE_SUPABASE) {
    const { deleteLead: jsonDeleteLead } = await import("@/lib/db");
    return jsonDeleteLead(id);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);

  return !error;
}

/* ─── 집계 ─── */

export async function getLeadStats() {
  const leads = await getLeads();

  const total = leads.length;
  const byStatus = {
    new: leads.filter((l) => l.status === "new").length,
    contacted: leads.filter((l) => l.status === "contacted").length,
    converted: leads.filter((l) => l.status === "converted").length,
    closed: leads.filter((l) => l.status === "closed").length,
  };

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = leads.filter((l) => l.timestamp.startsWith(today)).length;

  return { total, byStatus, todayCount };
}
