import "server-only";

import { invalidateLeadsActivitySummary } from "@/lib/repositories/lead-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  LeadContactLog,
  LeadContactLogInsert,
  ContactLogType,
  ContactLogResult,
} from "@/lib/supabase/database.types";

export type { ContactLogType, ContactLogResult };

/**
 * 연락 로그 사본·집계를 들고 캐시하는 소비자(CRM 홈 우선순위 큐 등)가 구독한다.
 * 리스너는 자기 모듈 캐시를 비우기만 한다 — I/O·await 금지(여기서 던지면 쓰기가 깨진다).
 */
type ContactLogMutationListener = () => void;
const contactLogMutationListeners = new Set<ContactLogMutationListener>();

export function onContactLogsMutated(listener: ContactLogMutationListener) {
  contactLogMutationListeners.add(listener);
}

// 연락 로그는 참여 신호 집계(연락 횟수·마지막 접점)의 입력이라 그 캐시도 같이 버린다.
// 그 집계는 보드 정렬과 우선순위 점수의 입력이므로, 남겨두면 방금 건 전화가 반영되지 않는다.
function notifyContactLogsMutated() {
  invalidateLeadsActivitySummary();
  for (const listener of contactLogMutationListeners) listener();
}

export interface ContactLogRecord {
  id: string;
  lead_id: string;
  type: ContactLogType;
  result: ContactLogResult | null;
  notes: string | null;
  contacted_at: string;
  contacted_by: string | null;
}

function toRecord(row: LeadContactLog): ContactLogRecord {
  return {
    id: row.id,
    lead_id: row.lead_id,
    type: row.type,
    result: row.result,
    notes: row.notes,
    contacted_at: row.contacted_at,
    contacted_by: row.contacted_by,
  };
}

export async function getContactLogs(leadId: string): Promise<ContactLogRecord[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("lead_contact_logs")
    .select("*")
    .eq("lead_id", leadId)
    .order("contacted_at", { ascending: false });

  if (error) throw new Error(`[contact-logs] 조회 실패: ${error.message}`);
  return (data as LeadContactLog[]).map(toRecord);
}

export async function hasContactLog(leadId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from("lead_contact_logs")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId);

  if (error) throw new Error(`[contact-logs] 증거 조회 실패: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function addContactLog(
  leadId: string,
  entry: {
    type: ContactLogType;
    result?: ContactLogResult;
    notes?: string;
    contacted_by?: string;
    contacted_at?: string;
  }
): Promise<ContactLogRecord> {
  const supabase = createSupabaseAdminClient();

  const insert: LeadContactLogInsert = {
    lead_id: leadId,
    type: entry.type,
    result: entry.result ?? null,
    notes: entry.notes ?? null,
    contacted_by: entry.contacted_by ?? null,
    contacted_at: entry.contacted_at ?? new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("lead_contact_logs")
    .insert(insert)
    .select()
    .single();

  if (error) throw new Error(`[contact-logs] 저장 실패: ${error.message}`);
  notifyContactLogsMutated();
  return toRecord(data as LeadContactLog);
}

export async function deleteContactLog(id: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("lead_contact_logs").delete().eq("id", id);
  if (error) return false;
  notifyContactLogsMutated();
  return true;
}
