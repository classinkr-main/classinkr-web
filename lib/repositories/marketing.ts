/**
 * Marketing Repository — JSON ↔ Supabase 듀얼 모드
 *
 * 환경변수 USE_SUPABASE_MARKETING=true 로 Supabase 전환.
 * false(기본)이면 기존 marketing-data.ts(JSON 파일) 사용.
 * 함수 시그니처는 marketing-data.ts와 동일하게 유지.
 */

import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Subscriber, EmailCampaign } from "@/lib/marketing-types";

export type { Subscriber, EmailCampaign } from "@/lib/marketing-types";

const USE_SUPABASE = process.env.USE_SUPABASE_MARKETING === "true";

// Supabase row는 id가 UUID string이므로 number id 타입과 분리
type SubRow = Omit<Subscriber, "id"> & { id: string | number };
type CampaignRow = Omit<EmailCampaign, "id"> & { id: string | number };

const sb = () => createSupabaseAdminClient();

/* ─── 구독자 ─────────────────────────────────────────────── */

export async function getAllSubscribers(): Promise<SubRow[]> {
  if (!USE_SUPABASE) {
    const { getAllSubscribers: jsonGet } = await import("@/lib/marketing-data");
    return jsonGet();
  }

  const { data, error } = await sb()
    .from("newsletter_subscribers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`[marketing] 구독자 조회 실패: ${error.message}`);
  return (data ?? []).map(rowToSubscriber);
}

export async function getSubscriberByEmail(
  email: string
): Promise<SubRow | undefined> {
  if (!USE_SUPABASE) {
    const { getSubscriberByEmail: jsonGet } = await import(
      "@/lib/marketing-data"
    );
    return jsonGet(email);
  }

  const { data } = await sb()
    .from("newsletter_subscribers")
    .select("*")
    .ilike("email", email)
    .single();
  return data ? rowToSubscriber(data) : undefined;
}

export async function getActiveSubscribersByTags(
  tags: string[]
): Promise<SubRow[]> {
  if (!USE_SUPABASE) {
    const { getActiveSubscribersByTags: jsonGet } = await import(
      "@/lib/marketing-data"
    );
    return jsonGet(tags);
  }

  let query = sb()
    .from("newsletter_subscribers")
    .select("*")
    .eq("status", "active");

  if (tags.length > 0) {
    query = query.overlaps("tags", tags);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`[marketing] 태그 구독자 조회 실패: ${error.message}`);
  return (data ?? []).map(rowToSubscriber);
}

export async function upsertSubscriber(
  data: Omit<
    Subscriber,
    "id" | "createdAt" | "updatedAt" | "status" | "optInAt"
  > & { status?: Subscriber["status"]; optInAt?: string }
): Promise<SubRow> {
  if (!USE_SUPABASE) {
    const { upsertSubscriber: jsonUpsert } = await import(
      "@/lib/marketing-data"
    );
    return jsonUpsert(data);
  }

  const now = new Date().toISOString();
  const existing = await getSubscriberByEmail(data.email);

  if (existing) {
    const { data: row, error } = await sb()
      .from("newsletter_subscribers")
      .update({
        name: data.name,
        org: data.org ?? null,
        role: data.role ?? null,
        size: data.size ?? null,
        phone: data.phone ?? null,
        tags: data.tags ?? [],
        status: data.status ?? "active",
        unsubscribed_at: data.status === "active" ? null : undefined,
      })
      .eq("id", existing.id as string)
      .select()
      .single();
    if (error) throw new Error(`[marketing] 구독자 업데이트 실패: ${error.message}`);
    return rowToSubscriber(row);
  }

  const { data: row, error } = await sb()
    .from("newsletter_subscribers")
    .insert({
      name: data.name,
      email: data.email,
      org: data.org ?? null,
      role: data.role ?? null,
      size: data.size ?? null,
      phone: data.phone ?? null,
      tags: data.tags ?? [],
      status: "active",
      source: data.source,
      opt_in_at: data.optInAt ?? now,
    })
    .select()
    .single();
  if (error) throw new Error(`[marketing] 구독자 등록 실패: ${error.message}`);
  return rowToSubscriber(row);
}

export async function unsubscribe(email: string): Promise<boolean> {
  if (!USE_SUPABASE) {
    const { unsubscribe: jsonUnsub } = await import("@/lib/marketing-data");
    return jsonUnsub(email);
  }

  const { data, error } = await sb()
    .from("newsletter_subscribers")
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
    })
    .ilike("email", email)
    .select("id");
  if (error || !data?.length) return false;
  return true;
}

export async function deleteSubscriber(id: string | number): Promise<boolean> {
  if (!USE_SUPABASE) {
    const { deleteSubscriber: jsonDelete } = await import(
      "@/lib/marketing-data"
    );
    return jsonDelete(id as number);
  }

  const { error } = await sb()
    .from("newsletter_subscribers")
    .delete()
    .eq("id", id as string);
  return !error;
}

/* ─── 이메일 캠페인 ──────────────────────────────────────── */

export async function getAllCampaigns(): Promise<CampaignRow[]> {
  if (!USE_SUPABASE) {
    const { getAllCampaigns: jsonGet } = await import("@/lib/marketing-data");
    return jsonGet();
  }

  const { data, error } = await sb()
    .from("email_campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`[marketing] 캠페인 조회 실패: ${error.message}`);
  return (data ?? []).map(rowToCampaign);
}

export async function createCampaign(
  data: Omit<EmailCampaign, "id" | "createdAt">
): Promise<CampaignRow> {
  if (!USE_SUPABASE) {
    const { createCampaign: jsonCreate } = await import("@/lib/marketing-data");
    return jsonCreate(data);
  }

  const { data: row, error } = await sb()
    .from("email_campaigns")
    .insert({
      subject: data.subject,
      body: data.body,
      target_tags: data.targetTags ?? [],
      status: data.status,
      sent_at: data.sentAt ?? null,
      recipient_count: data.recipientCount ?? 0,
      external_id: data.externalId ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`[marketing] 캠페인 생성 실패: ${error.message}`);
  return rowToCampaign(row);
}

/* ─── 변환 헬퍼 ──────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSubscriber(row: any): SubRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    org: row.org ?? undefined,
    role: row.role ?? undefined,
    size: row.size ?? undefined,
    phone: row.phone ?? undefined,
    tags: row.tags ?? [],
    status: row.status,
    source: row.source,
    optInAt: row.opt_in_at,
    unsubscribedAt: row.unsubscribed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCampaign(row: any): CampaignRow {
  return {
    id: row.id,
    subject: row.subject,
    body: row.body,
    targetTags: row.target_tags ?? [],
    status: row.status,
    sentAt: row.sent_at ?? undefined,
    recipientCount: row.recipient_count ?? 0,
    externalId: row.external_id ?? undefined,
    createdAt: row.created_at,
  };
}
