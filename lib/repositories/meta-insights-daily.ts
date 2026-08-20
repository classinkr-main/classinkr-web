// lib/repositories/meta-insights-daily.ts
// Meta 캠페인 일자별 스냅샷(meta_insights_daily) — 크론이 쓰고 perf API 가 읽는다.
// RLS admin-only(deny-all) — 반드시 admin(service-role) 클라이언트로만 접근.

import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { MetaDailyInsightRow } from "@/lib/meta/marketing"

const sb = () => createSupabaseAdminClient()

export interface MetaInsightsDailyRecord extends MetaDailyInsightRow {
  currency: string | null
  syncedAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRecord(row: any): MetaInsightsDailyRecord {
  return {
    date: row.date,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name ?? null,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    reach: Number(row.reach ?? 0),
    clicks: Number(row.clicks ?? 0),
    ctr: row.ctr != null ? Number(row.ctr) : null,
    cpc: row.cpc != null ? Number(row.cpc) : null,
    cpm: row.cpm != null ? Number(row.cpm) : null,
    leads: Number(row.leads ?? 0),
    currency: row.currency ?? null,
    syncedAt: row.synced_at,
  }
}

/**
 * (date, campaign_id) upsert — 백필 대비 500행 청크. 반환 = 처리 행 수.
 * 입력을 (date, campaign_id) 키로 먼저 디듑한다(last-wins) — Meta 커서 페이징이 페이지
 * 경계에서 같은 행을 중복 반환하면, Postgres upsert 는 한 문에서 같은 키를 두 번 건드릴 수
 * 없어 "cannot affect row a second time"로 청크 전체가 죽는다.
 */
export async function upsertMetaInsightsDaily(
  rows: MetaDailyInsightRow[],
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
    reach: r.reach,
    clicks: r.clicks,
    ctr: r.ctr,
    cpc: r.cpc,
    cpm: r.cpm,
    leads: r.leads,
    currency,
    synced_at: syncedAt,
  }))
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await sb()
      .from("meta_insights_daily")
      .upsert(payload.slice(i, i + 500), { onConflict: "date,campaign_id" })
    if (error) throw new Error(`[meta-insights-daily] upsert 실패: ${error.message}`)
  }
  return payload.length
}

/** [since, until] (YYYY-MM-DD, inclusive) 범위 조회 — date asc. */
export async function getMetaInsightsDailyRange(
  since: string,
  until: string
): Promise<MetaInsightsDailyRecord[]> {
  const { data, error } = await sb()
    .from("meta_insights_daily")
    .select("*")
    .gte("date", since)
    .lte("date", until)
    .order("date", { ascending: true })
  if (error) throw new Error(`[meta-insights-daily] 조회 실패: ${error.message}`)
  return (data ?? []).map(rowToRecord)
}

/**
 * 최신 synced_at (대시보드 "스냅샷 시각" 표기용).
 * 행이 없거나 조회 자체가 실패해도 null — 마이그레이션 미적용(테이블 없음) 상태를 그레이스풀
 * 강등으로 흡수한다(throw 하지 않는다).
 */
export async function getLatestSyncedAt(): Promise<string | null> {
  const { data, error } = await sb()
    .from("meta_insights_daily")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1)
  if (error) return null
  return data?.[0]?.synced_at ?? null
}
