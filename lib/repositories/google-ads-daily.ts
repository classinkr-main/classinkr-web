// lib/repositories/google-ads-daily.ts
// Google Ads 캠페인 일자별 스냅샷(google_ads_daily) — 크론이 쓰고 perf 조립이 읽는다.
// RLS admin-only(deny-all) — 반드시 admin(service-role) 클라이언트로만 접근.
// 구조·규약은 meta-insights-daily.ts 와 동일하게 맞춘다(세 채널이 같은 방식으로 읽히게).

import "server-only"
import { revalidateTag } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { MARKETING_PERF_CACHE_TAG } from "@/lib/repositories/marketing"
import type { GoogleAdsDailyRow } from "@/lib/google/ads"

const sb = () => createSupabaseAdminClient()

export interface GoogleAdsDailyRecord extends GoogleAdsDailyRow {
  /** 계정 통화 — KRW 로 환산하지 않는다(정직 규칙). */
  currency: string | null
  syncedAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRecord(row: any): GoogleAdsDailyRecord {
  return {
    date: row.date,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name ?? null,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    conversions: Number(row.conversions ?? 0),
    currency: row.currency ?? null,
    syncedAt: row.synced_at,
  }
}

/**
 * (date, campaign_id) upsert — 500행 청크. 반환 = 처리 행 수.
 * 입력을 (date, campaign_id) 키로 먼저 디듑한다(last-wins) — 같은 키가 한 문에 두 번 들어가면
 * Postgres 가 "cannot affect row a second time"로 청크 전체를 죽인다(meta 쪽과 같은 사고).
 */
export async function upsertGoogleAdsDaily(
  rows: GoogleAdsDailyRow[],
  currency: string | null
): Promise<number> {
  if (rows.length === 0) return 0
  const syncedAt = new Date().toISOString() // 같은 배치는 같은 synced_at.
  const deduped = new Map(rows.map((r) => [`${r.date}:${r.campaignId}`, r]))
  const payload = Array.from(deduped.values()).map((r) => ({
    date: r.date,
    campaign_id: r.campaignId,
    campaign_name: r.campaignName,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    conversions: r.conversions,
    currency,
    synced_at: syncedAt,
  }))
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await sb()
      .from("google_ads_daily")
      .upsert(payload.slice(i, i + 500), { onConflict: "date,campaign_id" })
    if (error) throw new Error(`[google-ads-daily] upsert 실패: ${error.message}`)
  }
  // perf 채널 스트립이 이 스냅샷을 읽는다 — 동기화 직후 최대 60초 동안 어제 값으로
  // 보이지 않도록 무효화한다(meta-insights-daily 와 같은 규약).
  revalidateTag(MARKETING_PERF_CACHE_TAG, "max")
  return payload.length
}

/** [since, until] (YYYY-MM-DD, inclusive) 범위 조회 — date asc. */
export async function getGoogleAdsDailyRange(
  since: string,
  until: string
): Promise<GoogleAdsDailyRecord[]> {
  const { data, error } = await sb()
    .from("google_ads_daily")
    .select("*")
    .gte("date", since)
    .lte("date", until)
    .order("date", { ascending: true })
  if (error) throw new Error(`[google-ads-daily] 조회 실패: ${error.message}`)
  return (data ?? []).map(rowToRecord)
}

/**
 * 최신 synced_at. 행이 없거나 조회 자체가 실패해도 null — 마이그레이션 미적용(테이블 없음)을
 * 그레이스풀 강등으로 흡수한다(throw 하지 않는다).
 */
export async function getGoogleLatestSyncedAt(): Promise<string | null> {
  const { data, error } = await sb()
    .from("google_ads_daily")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1)
  if (error) return null
  return data?.[0]?.synced_at ?? null
}
