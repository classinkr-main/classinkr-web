import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  LeadContactLog,
  LeadContactLogInsert,
  ContactLogType,
  ContactLogResult,
} from "@/lib/supabase/database.types";

export type { ContactLogType, ContactLogResult };

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
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("lead_contact_logs")
    .select("*")
    .eq("lead_id", leadId)
    .order("contacted_at", { ascending: false });

  if (error) throw new Error(`[contact-logs] 조회 실패: ${error.message}`);
  return (data as LeadContactLog[]).map(toRecord);
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
  const supabase = await createSupabaseServerClient();

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
  return toRecord(data as LeadContactLog);
}

export async function deleteContactLog(id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("lead_contact_logs").delete().eq("id", id);
  return !error;
}
