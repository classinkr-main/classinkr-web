import "server-only";

import { revalidateTag } from "next/cache";

import { ADMIN_CRM_PRIORITY_QUEUE_SNAPSHOT_CACHE_TAG } from "@/lib/admin/crm/cache-tags";
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
  // 우선순위 큐 소스 스냅샷은 인스턴스 간 공유 Data Cache다 — 구독(onContactLogsMutated)은 큐 모듈을
  // 로드한 인스턴스에만 걸려 있어 쓰기가 다른 인스턴스에서 일어나면 리스너가 0개다. 태그를 직접
  // SWR 무효화한다(cache-tags 모듈만 import — 큐 모듈을 import하면 순환이 된다).
  // 로그는 이미 커밋됐다 — 무효화 실패(요청 스코프 밖 등)가 저장을 500으로 바꿔 재시도 중복을 만들면 안 된다.
  try {
    revalidateTag(ADMIN_CRM_PRIORITY_QUEUE_SNAPSHOT_CACHE_TAG, "max");
  } catch (error) {
    console.warn("[contact-logs] priority queue snapshot invalidation failed:", error);
  }
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

/** 이 리드의 로그 한 건(id) — 없거나 조회 실패면 null. */
async function findContactLogById(leadId: string, id: string): Promise<ContactLogRecord | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("lead_contact_logs")
    .select("*")
    .eq("id", id)
    .eq("lead_id", leadId)
    .maybeSingle();
  if (error || !data) return null;
  return toRecord(data as LeadContactLog);
}

/**
 * 같은 리드·채널·결과·메모·담당자·연락 시각으로 이미 저장된 로그를 찾는다(재전송·더블 클릭 방지).
 * 연락 시각을 호출자가 명시한 경우에만 의미가 있다 — 서버 now로 채우는 저장은 매번 시각이 달라
 * 중복일 수 없다. 조회 실패는 null(막지 않음) — 중복 방지가 저장 자체를 깨뜨리면 안 된다.
 *
 * 호출자가 로그 id 를 정한 저장(entry.id — 현황 "오늘 연락"의 요청 키 멱등, lib/crm/account-contact-record.ts)은
 * 그 id 가 곧 멱등 키다 — 내용·시각과 무관하게 같은 id 의 로그를 돌려준다(재전송은 첫 저장을 가리킨다).
 */
export async function findDuplicateContactLog(
  leadId: string,
  entry: {
    id?: string;
    type: ContactLogType;
    result?: ContactLogResult;
    notes?: string;
    contacted_by?: string;
    contacted_at?: string;
  }
): Promise<ContactLogRecord | null> {
  if (entry.id) return findContactLogById(leadId, entry.id);
  if (!entry.contacted_at) return null;
  const contactedAt = new Date(entry.contacted_at);
  if (Number.isNaN(contactedAt.getTime())) return null;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("lead_contact_logs")
    .select("*")
    .eq("lead_id", leadId)
    .eq("type", entry.type)
    .eq("contacted_at", contactedAt.toISOString())
    .limit(10);
  if (error || !data) return null;

  const match = (data as LeadContactLog[]).find(
    (row) =>
      (row.result ?? null) === (entry.result ?? null) &&
      (row.notes ?? null) === (entry.notes ?? null) &&
      (row.contacted_by ?? null) === (entry.contacted_by ?? null)
  );
  return match ? toRecord(match) : null;
}

export async function addContactLog(
  leadId: string,
  entry: {
    /** 호출자가 정한 로그 id(요청 키 멱등) — 없으면 DB 기본값(gen_random_uuid). */
    id?: string;
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
  if (entry.id) insert.id = entry.id;

  const { data, error } = await supabase
    .from("lead_contact_logs")
    .insert(insert)
    .select()
    .single();

  if (error) {
    // 같은 id 로 동시에 들어온 재전송 — 먼저 저장된 로그가 정본이다(기본키 충돌은 저장 실패가 아니다).
    if (entry.id && error.code === "23505") {
      const concurrent = await findContactLogById(leadId, entry.id);
      if (concurrent) return concurrent;
    }
    throw new Error(`[contact-logs] 저장 실패: ${error.message}`);
  }
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
