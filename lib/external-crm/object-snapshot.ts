import "server-only"

import type { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { SupabaseQueryError } from "@/lib/supabase/pagination"

import { getExternalCrmLatestSyncedAt, maxIsoDate } from "./latest-synced-at"

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

export interface ExternalCrmObjectSnapshotTotalsInput {
  sourceSystem: string
  objectApiKeys: readonly string[]
}

export interface ExternalCrmObjectSnapshotTotals {
  activeCount: number
  staleCount: number
  latestSyncedAt: string | null
  error: SupabaseQueryError
  /** view = 집계 뷰 1회 읽기, fallback = 뷰 실패 시 이전과 같은 의미의 개별 쿼리 */
  source: "view" | "fallback"
}

interface ObjectSnapshotViewRow {
  object_api_key?: unknown
  active_count?: unknown
  latest_synced_at?: unknown
  stale_count?: unknown
}

function toCount(value: unknown) {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

/**
 * 요청한 객체 키들의 active/stale 합계와 최신 synced_at.
 *
 * 개요 화면은 합계·최댓값만 쓰므로 external_crm_records 를 세 번 훑는 대신(활성 head count
 * 1,163ms · stale head count · `.in(keys)` synced_at 정렬 2,421ms — 각각 84K행 스캔) 집계 뷰
 * external_crm_object_snapshot(source_system, object_api_key, active_count, latest_synced_at,
 * stale_count)을 한 번 읽어(≈614ms, 인덱스 온리) JS 에서 합산한다. 뷰가 아직 없거나 실패하면
 * 이전 쿼리 의미 그대로 폴백한다(latest 만 객체별 인덱스 프로브로 대체 — 같은 행 집합의 최댓값).
 * 뷰의 latest_synced_at 은 활성 행 기준이지만, 동기화는 활성 행을 갱신하면서 stale 을 표시하므로
 * stale 행만 더 새로운 경우는 없다. 오류는 던지지 않고 첫 오류를 돌려준다.
 */
export async function getExternalCrmObjectSnapshotTotals(
  sb: SupabaseAdminClient,
  input: ExternalCrmObjectSnapshotTotalsInput
): Promise<ExternalCrmObjectSnapshotTotals> {
  const objectApiKeys = Array.from(new Set(input.objectApiKeys))
  const keySet = new Set(objectApiKeys)

  const viewResult = await sb
    .from("external_crm_object_snapshot")
    .select("object_api_key, active_count, latest_synced_at, stale_count")
    .eq("source_system", input.sourceSystem)

  if (!viewResult.error) {
    const rows = ((viewResult.data ?? []) as ObjectSnapshotViewRow[]).filter(
      (row) => typeof row.object_api_key === "string" && keySet.has(row.object_api_key)
    )
    return {
      activeCount: rows.reduce((sum, row) => sum + toCount(row.active_count), 0),
      staleCount: rows.reduce((sum, row) => sum + toCount(row.stale_count), 0),
      latestSyncedAt: maxIsoDate(
        rows.map((row) => (typeof row.latest_synced_at === "string" ? row.latest_synced_at : null))
      ),
      error: null,
      source: "view",
    }
  }

  const [activeResult, staleResult, latestResult] = await Promise.all([
    sb
      .from("external_crm_records")
      .select("id", { count: "exact", head: true })
      .eq("source_system", input.sourceSystem)
      .in("object_api_key", objectApiKeys)
      .eq("is_stale", false),
    sb
      .from("external_crm_records")
      .select("id", { count: "exact", head: true })
      .eq("source_system", input.sourceSystem)
      .in("object_api_key", objectApiKeys)
      .eq("is_stale", true),
    getExternalCrmLatestSyncedAt(sb, { sourceSystem: input.sourceSystem, objectApiKeys }),
  ])

  return {
    activeCount: activeResult.error ? 0 : activeResult.count ?? 0,
    staleCount: staleResult.error ? 0 : staleResult.count ?? 0,
    latestSyncedAt: latestResult.error ? null : latestResult.latestSyncedAt,
    error: activeResult.error ?? staleResult.error ?? latestResult.error ?? null,
    source: "fallback",
  }
}
