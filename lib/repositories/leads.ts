/**
 * Leads Repository — JSON ↔ Supabase 듀얼 모드
 *
 * 환경변수 USE_SUPABASE_LEADS=true 로 Supabase 전환
 * 기존 lib/db.ts 의 함수 시그니처를 최대한 유지
 */

import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Lead, LeadInsert, LeadUpdate } from "@/lib/supabase/database.types";

// 기존 타입 re-export (호환성)
export type { LeadStatus } from "@/lib/supabase/database.types";

const USE_SUPABASE = process.env.USE_SUPABASE_LEADS === "true";
const IS_PRODUCTION_RUNTIME =
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
const RESPONSE_TARGET_SOURCES = ["demo_modal", "contact_page", "meta_lead_ads"] as const;
const ACTIVE_LEAD_STATUSES = ["new", "contacted"] as const;

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
  source_detail?: string;
  lead_magnet?: string;
  follow_up_at?: string;
  assigned_to?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  ttclid?: string;
  landing_page?: string;
  current_page?: string;
  referrer?: string;
}

export interface LeadActionStats {
  total: number;
  byStatus: Record<LeadRecord["status"], number>;
  unrespondedCount: number;
  unresponded24hCount: number;
  unresponded48hCount: number;
  todayFollowUpCount: number;
  overdueFollowUpCount: number;
}

function toLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function getLocalDayBounds(value: Date) {
  const [year, month, day] = toLocalDateKey(value).split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);
  return { start, end };
}

function isActiveLeadStatus(status: LeadRecord["status"]) {
  return status !== "converted" && status !== "closed";
}

function isResponseTargetSource(source: string) {
  return RESPONSE_TARGET_SOURCES.includes(source as (typeof RESPONSE_TARGET_SOURCES)[number]);
}

function isUnrespondedLeadRecord(lead: LeadRecord) {
  return lead.status === "new" && isResponseTargetSource(lead.source);
}

function getSupabaseCountError(
  results: Array<{ error: { message?: string } | null }>
) {
  return results.find((result) => result.error)?.error ?? null;
}

function assertDurableLeadStorage() {
  if (!USE_SUPABASE && IS_PRODUCTION_RUNTIME) {
    throw new Error("[leads] production lead capture requires USE_SUPABASE_LEADS=true");
  }
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
    source_detail: row.source_detail ?? undefined,
    lead_magnet: row.lead_magnet ?? undefined,
    follow_up_at: row.follow_up_at ?? undefined,
    assigned_to: row.assigned_to ?? undefined,
    utm_source: row.utm_source ?? undefined,
    utm_medium: row.utm_medium ?? undefined,
    utm_campaign: row.utm_campaign ?? undefined,
    utm_term: row.utm_term ?? undefined,
    utm_content: row.utm_content ?? undefined,
    gclid: row.gclid ?? undefined,
    fbclid: row.fbclid ?? undefined,
    msclkid: row.msclkid ?? undefined,
    ttclid: row.ttclid ?? undefined,
    landing_page: row.landing_page ?? undefined,
    current_page: row.current_page ?? undefined,
    referrer: row.referrer ?? undefined,
  };
}

/* ─── READ ─── */

export async function getLeads(): Promise<LeadRecord[]> {
  if (!USE_SUPABASE) {
    const { getLeads: jsonGetLeads } = await import("@/lib/db");
    return jsonGetLeads();
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`[leads] 조회 실패: ${error.message}`);
  return (data as Lead[]).map(supabaseToLegacy);
}

/**
 * 대시보드 전용 경량 조회 — message/notes/utm_* 등 무거운 컬럼을 제외하고
 * 화면에서 실제로 쓰는 필드만 가져온다. (overview 페이로드 축소용)
 * supabaseToLegacy는 미선택 컬럼을 `?? undefined`로 처리하므로 그대로 재사용 가능.
 */
export async function getDashboardLeads(): Promise<LeadRecord[]> {
  if (!USE_SUPABASE) {
    const { getLeads: jsonGetLeads } = await import("@/lib/db");
    return jsonGetLeads();
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id, source, name, org, email, status, branch, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`[leads] 대시보드 조회 실패: ${error.message}`);
  return (data as Lead[]).map(supabaseToLegacy);
}

export async function getLeadById(id: string): Promise<LeadRecord | null> {
  if (!USE_SUPABASE) {
    const { getLeads: jsonGetLeads } = await import("@/lib/db");
    return jsonGetLeads().find((l) => l.id === id) ?? null;
  }

  const supabase = createSupabaseAdminClient();
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
  assertDurableLeadStorage();

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
    notes: lead.notes ?? null,
    source_detail: lead.source_detail ?? null,
    lead_magnet: lead.lead_magnet ?? null,
    follow_up_at: null,
    assigned_to: null,
    utm_source: lead.utm_source ?? null,
    utm_medium: lead.utm_medium ?? null,
    utm_campaign: lead.utm_campaign ?? null,
    utm_term: lead.utm_term ?? null,
    utm_content: lead.utm_content ?? null,
    gclid: lead.gclid ?? null,
    fbclid: lead.fbclid ?? null,
    msclkid: lead.msclkid ?? null,
    ttclid: lead.ttclid ?? null,
    landing_page: lead.landing_page ?? null,
    current_page: lead.current_page ?? null,
    referrer: lead.referrer ?? null,
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

  const supabase = createSupabaseAdminClient();

  const update: LeadUpdate = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.source_detail !== undefined) update.source_detail = patch.source_detail;
  if (patch.lead_magnet !== undefined) update.lead_magnet = patch.lead_magnet;
  if (patch.branch !== undefined) update.branch = patch.branch;
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.email !== undefined) update.email = patch.email;
  if (patch.phone !== undefined) update.phone = patch.phone;
  if (patch.org !== undefined) update.org = patch.org;
  if (patch.follow_up_at !== undefined) update.follow_up_at = patch.follow_up_at;
  if (patch.assigned_to !== undefined) update.assigned_to = patch.assigned_to;
  if (patch.utm_source !== undefined) update.utm_source = patch.utm_source;
  if (patch.utm_medium !== undefined) update.utm_medium = patch.utm_medium;
  if (patch.utm_campaign !== undefined) update.utm_campaign = patch.utm_campaign;
  if (patch.utm_term !== undefined) update.utm_term = patch.utm_term;
  if (patch.utm_content !== undefined) update.utm_content = patch.utm_content;
  if (patch.gclid !== undefined) update.gclid = patch.gclid;
  if (patch.fbclid !== undefined) update.fbclid = patch.fbclid;
  if (patch.msclkid !== undefined) update.msclkid = patch.msclkid;
  if (patch.ttclid !== undefined) update.ttclid = patch.ttclid;
  if (patch.landing_page !== undefined) update.landing_page = patch.landing_page;
  if (patch.current_page !== undefined) update.current_page = patch.current_page;
  if (patch.referrer !== undefined) update.referrer = patch.referrer;

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

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);

  return !error;
}

/* ─── 집계 ─── */

export async function getLeadStats() {
  if (!USE_SUPABASE) {
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

  const supabase = createSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const [totalRes, newRes, contactedRes, convertedRes, closedRes, todayRes] =
    await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true }),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "contacted"),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "converted"),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "closed"),
      supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", `${today}T00:00:00Z`),
    ]);

  return {
    total: totalRes.count ?? 0,
    byStatus: {
      new: newRes.count ?? 0,
      contacted: contactedRes.count ?? 0,
      converted: convertedRes.count ?? 0,
      closed: closedRes.count ?? 0,
    },
    todayCount: todayRes.count ?? 0,
  };
}

export async function getLeadActionStats(now = new Date()): Promise<LeadActionStats> {
  if (!USE_SUPABASE) {
    const leads = await getLeads();
    const today = toLocalDateKey(now);
    const cutoff24h = now.getTime() - 24 * 3_600_000;
    const cutoff48h = now.getTime() - 48 * 3_600_000;
    const stats: LeadActionStats = {
      total: leads.length,
      byStatus: { new: 0, contacted: 0, converted: 0, closed: 0 },
      unrespondedCount: 0,
      unresponded24hCount: 0,
      unresponded48hCount: 0,
      todayFollowUpCount: 0,
      overdueFollowUpCount: 0,
    };

    for (const lead of leads) {
      stats.byStatus[lead.status] += 1;
      if (isUnrespondedLeadRecord(lead)) {
        stats.unrespondedCount += 1;
        const leadTime = new Date(lead.timestamp).getTime();
        if (leadTime <= cutoff24h) {
          stats.unresponded24hCount += 1;
        }
        if (leadTime <= cutoff48h) {
          stats.unresponded48hCount += 1;
        }
      }

      if (!lead.follow_up_at || !isActiveLeadStatus(lead.status)) continue;
      const followUpDate = toLocalDateKey(lead.follow_up_at);
      if (followUpDate === today) stats.todayFollowUpCount += 1;
      if (followUpDate < today) stats.overdueFollowUpCount += 1;
    }

    return stats;
  }

  const supabase = createSupabaseAdminClient();
  const { start, end } = getLocalDayBounds(now);
  const cutoff24h = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const cutoff48h = new Date(now.getTime() - 48 * 3_600_000).toISOString();

  const [
    totalRes,
    newRes,
    contactedRes,
    convertedRes,
    closedRes,
    unrespondedRes,
    unresponded24hRes,
    unresponded48hRes,
    todayFollowUpRes,
    overdueFollowUpRes,
  ] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "contacted"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "converted"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "closed"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .in("source", [...RESPONSE_TARGET_SOURCES]),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .in("source", [...RESPONSE_TARGET_SOURCES])
      .lte("created_at", cutoff24h),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .in("source", [...RESPONSE_TARGET_SOURCES])
      .lte("created_at", cutoff48h),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("status", [...ACTIVE_LEAD_STATUSES])
      .gte("follow_up_at", start.toISOString())
      .lt("follow_up_at", end.toISOString()),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("status", [...ACTIVE_LEAD_STATUSES])
      .lt("follow_up_at", start.toISOString()),
  ]);

  const error = getSupabaseCountError([
    totalRes,
    newRes,
    contactedRes,
    convertedRes,
    closedRes,
    unrespondedRes,
    unresponded24hRes,
    unresponded48hRes,
    todayFollowUpRes,
    overdueFollowUpRes,
  ]);
  if (error) throw new Error(`[leads] KPI 조회 실패: ${error.message ?? "unknown database error"}`);

  return {
    total: totalRes.count ?? 0,
    byStatus: {
      new: newRes.count ?? 0,
      contacted: contactedRes.count ?? 0,
      converted: convertedRes.count ?? 0,
      closed: closedRes.count ?? 0,
    },
    unrespondedCount: unrespondedRes.count ?? 0,
    unresponded24hCount: unresponded24hRes.count ?? 0,
    unresponded48hCount: unresponded48hRes.count ?? 0,
    todayFollowUpCount: todayFollowUpRes.count ?? 0,
    overdueFollowUpCount: overdueFollowUpRes.count ?? 0,
  };
}
