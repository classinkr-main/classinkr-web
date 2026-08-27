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

const SUBSCRIBER_COLUMNS = [
  "id",
  "name",
  "email",
  "org",
  "role",
  "size",
  "phone",
  "tags",
  "status",
  "source",
  "opt_in_at",
  "unsubscribed_at",
  "created_at",
  "updated_at",
].join(", ");
const SUBSCRIBER_ANALYTICS_COLUMNS = "id, status, source, created_at";
const SUBSCRIBER_ANALYTICS_PAGE_SIZE = 1_000;
const SUBSCRIBER_MAX_ANALYTICS_ROWS = 100_000;
const SUBSCRIBER_QUERY_TIMEOUT_MS = 12_000;

export interface SubscriberPage {
  subscribers: SubRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface SubscriberAnalyticsRow {
  createdAt: string;
  status: Subscriber["status"];
  source: string;
}

interface SubscriberKeysetPageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/** 전량 롤업용 id keyset. 고정 1,000건 절단과 깊은 OFFSET 스캔을 모두 피한다. */
export async function fetchAllSubscriberRowsById<T extends { id: string }>(
  fetchPage: (afterId: string | null, limit: number) => Promise<SubscriberKeysetPageResult<T>>,
  options: { pageSize?: number; maxRows?: number } = {}
): Promise<T[]> {
  const pageSize = options.pageSize ?? SUBSCRIBER_ANALYTICS_PAGE_SIZE;
  const maxRows = options.maxRows ?? SUBSCRIBER_MAX_ANALYTICS_ROWS;
  const rows: T[] = [];
  let afterId: string | null = null;

  while (true) {
    const result = await fetchPage(afterId, pageSize);
    if (result.error) {
      throw new Error(`[marketing] 구독자 분석 조회 실패: ${result.error.message}`);
    }
    const page = result.data ?? [];
    if (rows.length + page.length > maxRows) {
      throw new Error(
        `[marketing] 구독자 분석 행이 안전 상한 ${maxRows.toLocaleString()}건을 초과했습니다.`
      );
    }
    rows.push(...page);
    if (page.length < pageSize) break;

    const nextCursor = page.at(-1)?.id ?? null;
    if (!nextCursor || nextCursor === afterId) {
      throw new Error("[marketing] 구독자 분석 keyset cursor가 전진하지 않았습니다.");
    }
    afterId = nextCursor;
  }

  return rows;
}

export async function getSubscribersPage(
  limit = 1_000,
  offset = 0,
  filters?: { status?: string; tag?: string }
): Promise<SubscriberPage> {
  const safeLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.floor(limit), 1), 1_000)
    : 1_000;
  const safeOffset = Number.isFinite(offset) ? Math.max(Math.floor(offset), 0) : 0;

  if (!USE_SUPABASE) {
    const { getAllSubscribers: jsonGet } = await import("@/lib/marketing-data");
    let subscribers: SubRow[] = await jsonGet();
    if (filters?.status) subscribers = subscribers.filter((row) => row.status === filters.status);
    if (filters?.tag) {
      const tag = filters.tag;
      subscribers = subscribers.filter((row) => row.tags.includes(tag));
    }
    const total = subscribers.length;
    const page = subscribers.slice(safeOffset, safeOffset + safeLimit);
    return {
      subscribers: page,
      total,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + page.length < total,
    };
  }

  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), SUBSCRIBER_QUERY_TIMEOUT_MS);
  try {
    let query = sb()
      .from("newsletter_subscribers")
      .select(SUBSCRIBER_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(safeOffset, safeOffset + safeLimit - 1);

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.tag) query = query.contains("tags", [filters.tag]);

    const { data, error, count } = await query.abortSignal(timeoutController.signal);
    if (error) throw new Error(`[marketing] 구독자 조회 실패: ${error.message}`);
    if (typeof count !== "number") {
      throw new Error("[marketing] 구독자 전체 수를 확인하지 못했습니다.");
    }
    const subscribers = (data ?? []).map(rowToSubscriber);
    return {
      subscribers,
      total: count,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + subscribers.length < count,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAllSubscribers(
  limit = 1000,
  offset = 0,
  filters?: { status?: string; tag?: string }
): Promise<SubRow[]> {
  return (await getSubscribersPage(limit, offset, filters)).subscribers;
}

export async function getSubscriberAnalyticsRows(filters?: {
  status?: string;
  tag?: string;
}): Promise<SubscriberAnalyticsRow[]> {
  if (!USE_SUPABASE) {
    const { getAllSubscribers: jsonGet } = await import("@/lib/marketing-data");
    let subscribers: SubRow[] = await jsonGet();
    if (filters?.status) subscribers = subscribers.filter((row) => row.status === filters.status);
    if (filters?.tag) {
      const tag = filters.tag;
      subscribers = subscribers.filter((row) => row.tags.includes(tag));
    }
    return subscribers.map((subscriber) => ({
      createdAt: subscriber.createdAt,
      status: subscriber.status,
      source: subscriber.source,
    }));
  }

  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), SUBSCRIBER_QUERY_TIMEOUT_MS);
  try {
    const rows = await fetchAllSubscriberRowsById(async (afterId, limit) => {
      let query = sb()
        .from("newsletter_subscribers")
        .select(SUBSCRIBER_ANALYTICS_COLUMNS)
        .order("id", { ascending: true })
        .limit(limit);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.tag) query = query.contains("tags", [filters.tag]);
      if (afterId) query = query.gt("id", afterId);
      const { data, error } = await query.abortSignal(timeoutController.signal);
      return {
        data: (data ?? null) as Array<{
          id: string;
          created_at: string;
          status: Subscriber["status"];
          source: string;
        }> | null,
        error,
      };
    });

    return rows.map((row) => ({
      createdAt: row.created_at,
      status: row.status,
      source: row.source,
    }));
  } finally {
    clearTimeout(timeout);
  }
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

  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), SUBSCRIBER_QUERY_TIMEOUT_MS);
  try {
    let query = sb()
      .from("newsletter_subscribers")
      .select("id", { count: "exact", head: true });

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
    if (filters?.tag) {
      query = query.contains("tags", [filters.tag]);
    }

    const { count, error } = await query.abortSignal(timeoutController.signal);
    if (error) throw new Error(`[marketing] 구독자 수 조회 실패: ${error.message}`);
    if (typeof count !== "number") {
      throw new Error("[marketing] 구독자 전체 수를 확인하지 못했습니다.");
    }
    return count;
  } finally {
    clearTimeout(timeout);
  }
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

/**
 * 같은 제목이 withinMs 안에 이미 발송(sent)됐는지 — 더블클릭·이중 제출의 서버 방어용
 * (2026-08-18). 클라이언트 sendLoading 만으로는 새로고침·중복 탭을 막지 못한다.
 * JSON 폴백에서는 검사 없이 통과한다(로컬 개발 전용 경로).
 */
export async function findRecentSentCampaign(
  subject: string,
  withinMs: number
): Promise<{ id: string | number; sentAt?: string } | null> {
  if (!USE_SUPABASE) return null

  const since = new Date(Date.now() - withinMs).toISOString()
  const { data, error } = await sb()
    .from("email_campaigns")
    .select("id, sent_at")
    .eq("subject", subject)
    .eq("status", "sent")
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(1)
  if (error) throw new Error(`[marketing] 최근 발송 조회 실패: ${error.message}`)

  const row = data?.[0]
  return row ? { id: row.id, sentAt: row.sent_at ?? undefined } : null
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
  revalidateTag(MARKETING_CAMPAIGNS_CACHE_TAG, "max");
  return rowToCampaign(row);
}

export async function updateCampaign(
  id: string | number,
  data: Partial<
    Pick<EmailCampaign, "status" | "sentAt" | "recipientCount" | "openCount" | "failedCount" | "sendErrors">
  >
): Promise<void> {
  if (!USE_SUPABASE) return // JSON 폴백에서는 무시

  const patch: Record<string, unknown> = {}
  if (data.status !== undefined) patch.status = data.status
  if (data.sentAt !== undefined) patch.sent_at = data.sentAt
  if (data.recipientCount !== undefined) patch.recipient_count = data.recipientCount
  if (data.openCount !== undefined) patch.open_count = data.openCount
  if (data.failedCount !== undefined) patch.failed_count = data.failedCount
  if (data.sendErrors !== undefined) patch.send_errors = data.sendErrors

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
    clickCount: row.click_count ?? 0,
    failedCount: row.failed_count ?? 0,
    sendErrors: row.send_errors ?? [],
    externalId: row.external_id ?? undefined,
    createdAt: row.created_at,
  };
}
