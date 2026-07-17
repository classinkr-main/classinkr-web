/**
 * Marketing Repository — JSON ↔ Supabase 듀얼 모드
 *
 * 환경변수 USE_SUPABASE_MARKETING=true 로 Supabase 전환.
 * false(기본)이면 기존 marketing-data.ts(JSON 파일) 사용.
 * 함수 시그니처는 marketing-data.ts와 동일하게 유지.
 */

import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Subscriber, EmailCampaign } from "@/lib/marketing-types";

export type { Subscriber, EmailCampaign } from "@/lib/marketing-types";

// 운영에서는 JSON 폴백을 절대 선택하지 않는다. DB 미구성은 저장 성공으로
// 위장하지 않고 Supabase 오류로 노출한다. JSON 모드는 로컬 개발/테스트 전용이다.
const USE_SUPABASE =
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL === "1" ||
  process.env.USE_SUPABASE_MARKETING === "true";

// Supabase row는 id가 UUID string이므로 number id 타입과 분리
type SubRow = Omit<Subscriber, "id"> & { id: string | number };
type CampaignRow = Omit<EmailCampaign, "id"> & { id: string | number };

const sb = () => createSupabaseAdminClient();

/* ─── 구독자 ─────────────────────────────────────────────── */

export async function getAllSubscribers(
  limit = 1000,
  offset = 0,
  filters?: { status?: string; tag?: string }
): Promise<SubRow[]> {
  if (!USE_SUPABASE) {
    const { getAllSubscribers: jsonGet } = await import("@/lib/marketing-data");
    let subscribers: SubRow[] = await jsonGet();
    if (filters?.status) {
      subscribers = subscribers.filter((s) => s.status === filters.status);
    }
    if (filters?.tag) {
      const tag = filters.tag;
      subscribers = subscribers.filter((s) => s.tags.includes(tag));
    }
    return subscribers;
  }

  let query = sb()
    .from("newsletter_subscribers")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.tag) {
    query = query.contains("tags", [filters.tag]);
  }

  const { data, error } = await query;
  if (error) throw new Error(`[marketing] 구독자 조회 실패: ${error.message}`);
  return (data ?? []).map(rowToSubscriber);
}

/**
 * 구독자 수만 필요할 때(대시보드 KPI 등) 행을 받아오지 않고 count만 조회한다.
 * 기존 getAllSubscribers(1000)는 최대 1000행을 전송 + length로 셌으나,
 * 이쪽은 head:true로 페이로드 0 + 1000 초과 구독자도 정확히 집계한다.
 */
export async function countSubscribers(filters?: {
  status?: string;
  tag?: string;
}): Promise<number> {
  if (!USE_SUPABASE) {
    const { getAllSubscribers: jsonGet } = await import("@/lib/marketing-data");
    let subscribers: SubRow[] = await jsonGet();
    if (filters?.status) {
      subscribers = subscribers.filter((s) => s.status === filters.status);
    }
    if (filters?.tag) {
      const tag = filters.tag;
      subscribers = subscribers.filter((s) => s.tags.includes(tag));
    }
    return subscribers.length;
  }

  let query = sb()
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.tag) {
    query = query.contains("tags", [filters.tag]);
  }

  const { count, error } = await query;
  if (error) throw new Error(`[marketing] 구독자 수 조회 실패: ${error.message}`);
  return count ?? 0;
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
    // 기존 태그와 병합 (중복 제거)
    const mergedTags = Array.from(
      new Set([...(existing.tags ?? []), ...(data.tags ?? [])])
    );
    const { data: row, error } = await sb()
      .from("newsletter_subscribers")
      .update({
        name: data.name,
        org: data.org ?? null,
        role: data.role ?? null,
        size: data.size ?? null,
        phone: data.phone ?? null,
        tags: mergedTags,
        status: data.status ?? "active",
        source: data.source,
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

export async function subscribeSubscriber(
  data: Pick<Subscriber, "name" | "email" | "source"> & { optInAt?: string }
): Promise<{ subscriber: SubRow; created: boolean; reactivated: boolean }> {
  if (!USE_SUPABASE) {
    const existing = await getSubscriberByEmail(data.email)
    if (existing) {
      if (existing.status === "active") {
        return { subscriber: existing, created: false, reactivated: false }
      }

      const { upsertSubscriber: jsonUpsert } = await import("@/lib/marketing-data")
      const subscriber = await jsonUpsert({
        name: data.name,
        email: data.email,
        tags: existing.tags ?? [],
        source: data.source,
        status: "active",
        optInAt: data.optInAt ?? new Date().toISOString(),
      })

      return { subscriber, created: false, reactivated: true }
    }

    const { upsertSubscriber: jsonUpsert } = await import("@/lib/marketing-data")
    const subscriber = await jsonUpsert({
      name: data.name,
      email: data.email,
      tags: [],
      source: data.source,
      status: "active",
      optInAt: data.optInAt,
    })

    return { subscriber, created: true, reactivated: false }
  }

  const existing = await getSubscriberByEmail(data.email)
  if (existing) {
    if (existing.status === "active") {
      return { subscriber: existing, created: false, reactivated: false }
    }

    const now = new Date().toISOString()
    const { data: row, error } = await sb()
      .from("newsletter_subscribers")
      .update({
        name: data.name,
        status: "active",
        source: data.source,
        opt_in_at: data.optInAt ?? now,
        unsubscribed_at: null,
      })
      .eq("id", existing.id as string)
      .select()
      .single()

    if (error) throw new Error(`[marketing] 구독자 재등록 실패: ${error.message}`)
    return { subscriber: rowToSubscriber(row), created: false, reactivated: true }
  }

  const now = new Date().toISOString()
  const { data: row, error } = await sb()
    .from("newsletter_subscribers")
    .insert({
      name: data.name,
      email: data.email,
      tags: [],
      status: "active",
      source: data.source,
      opt_in_at: data.optInAt ?? now,
    })
    .select()
    .single()

  if (error) throw new Error(`[marketing] 援щ룆???깅줉 ?ㅽ뙣: ${error.message}`)
  return { subscriber: rowToSubscriber(row), created: true, reactivated: false }
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

export async function getAllCampaigns(limit = 200, offset = 0): Promise<CampaignRow[]> {
  if (!USE_SUPABASE) {
    const { getAllCampaigns: jsonGet } = await import("@/lib/marketing-data");
    return jsonGet();
  }

  const { data, error } = await sb()
    .from("email_campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`[marketing] 캠페인 조회 실패: ${error.message}`);
  return (data ?? []).map(rowToCampaign);
}

export const MARKETING_CAMPAIGNS_CACHE_TAG = "marketing-campaigns";

// summarizeCampaigns(branch summary의 "최근 30일 캠페인" 위젯)처럼 초단위 신선도가
// 필요 없는 소비처용 60초 캐시. getAllCampaigns의 기본 인자(limit=200, offset=0) 호출만
// 캐시한다 — createCampaign/updateCampaign이 뮤테이션마다 태그를 무효화한다.
export const getCachedAllCampaigns = unstable_cache(
  async () => getAllCampaigns(),
  ["marketing-campaigns-default"],
  { revalidate: 60, tags: [MARKETING_CAMPAIGNS_CACHE_TAG] },
);

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
  revalidateTag(MARKETING_CAMPAIGNS_CACHE_TAG, "max");
  return rowToCampaign(row);
}

export async function updateCampaign(
  id: string | number,
  data: Partial<Pick<EmailCampaign, "status" | "sentAt" | "recipientCount" | "openCount">>
): Promise<void> {
  if (!USE_SUPABASE) return // JSON 폴백에서는 무시

  const patch: Record<string, unknown> = {}
  if (data.status !== undefined) patch.status = data.status
  if (data.sentAt !== undefined) patch.sent_at = data.sentAt
  if (data.recipientCount !== undefined) patch.recipient_count = data.recipientCount
  if (data.openCount !== undefined) patch.open_count = data.openCount

  const { error } = await sb()
    .from("email_campaigns")
    .update(patch)
    .eq("id", id as string)

  if (error) throw new Error(`[marketing] 캠페인 업데이트 실패: ${error.message}`)
  revalidateTag(MARKETING_CAMPAIGNS_CACHE_TAG, "max");
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
    openCount: row.open_count ?? 0,
    externalId: row.external_id ?? undefined,
    createdAt: row.created_at,
  };
}
