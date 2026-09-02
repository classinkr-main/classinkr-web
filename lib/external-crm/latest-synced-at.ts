import "server-only"

import type { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { SupabaseQueryError } from "@/lib/supabase/pagination"

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

/**
 * external_crm_records 에 동기화되는 Xiaoshouyi 객체 키(동기화 기본 객체 목록과 같다).
 * "객체별 집계"로 답할 수 있는 읽기(최신 동기화 시각, 스냅샷 합계)가 이 목록을 공유한다 —
 * 테이블 전체를 훑는 대신 객체 키마다 인덱스 프로브 한 번으로 끝내기 위해서다.
 */
export const EXTERNAL_CRM_SNAPSHOT_OBJECT_KEYS = [
  "User",
  "account",
  "contact",
  "opportunity",
  "ShroffAccount__c",
  "Collection__c",
  "SalesPerformance__c",
  "CollectionPlan__c",
  "FinancialInformation__c",
  "ResourceInformation__c",
] as const

export interface ExternalCrmLatestSyncedAtInput {
  sourceSystem: string
  objectApiKeys: readonly string[]
}

export interface ExternalCrmLatestSyncedAtResult {
  latestSyncedAt: string | null
  error: SupabaseQueryError
}

/** ISO 문자열 중 가장 늦은 시각을 원본 문자열 그대로 돌려준다(파싱 불가 값은 무시). */
export function maxIsoDate(values: Array<string | null | undefined>) {
  let latest: string | null = null
  let latestTime = Number.NEGATIVE_INFINITY

  for (const value of values) {
    if (!value) continue
    const time = new Date(value).getTime()
    if (Number.isNaN(time) || time <= latestTime) continue
    latest = value
    latestTime = time
  }

  return latest
}

function readSyncedAt(rows: unknown[] | null | undefined) {
  const row = rows?.[0]
  if (!row || typeof row !== "object") return null
  const value = (row as { synced_at?: unknown }).synced_at
  return typeof value === "string" ? value : null
}

/**
 * source_system 의 "가장 최근 synced_at".
 *
 * `WHERE source_system = $1 ORDER BY synced_at DESC LIMIT 1` 은 synced_at 단독 인덱스가 없어
 * 85K 인덱스 엔트리를 정렬하고 힙을 약 1만 회 읽는다(프로덕션 평균 2.4s). 객체 키를 함께 걸면
 * external_crm_records_object_idx(source_system, object_api_key, synced_at DESC) 프로브 한 번
 * (1.4ms)이므로, 키마다 하나씩 병렬로 묻고 최댓값을 취한다. 같은 행 집합의 최댓값이라 결과는 동일하다.
 * 오류는 던지지 않고 첫 오류를 돌려준다(그때 값은 null).
 */
export async function getExternalCrmLatestSyncedAt(
  sb: SupabaseAdminClient,
  input: ExternalCrmLatestSyncedAtInput
): Promise<ExternalCrmLatestSyncedAtResult> {
  const objectApiKeys = Array.from(new Set(input.objectApiKeys))
  if (objectApiKeys.length === 0) return { latestSyncedAt: null, error: null }

  const results = await Promise.all(
    objectApiKeys.map((objectApiKey) =>
      sb
        .from("external_crm_records")
        .select("synced_at")
        .eq("source_system", input.sourceSystem)
        .eq("object_api_key", objectApiKey)
        .order("synced_at", { ascending: false })
        .limit(1)
    )
  )

  const error = results.find((result) => result.error)?.error ?? null
  if (error) return { latestSyncedAt: null, error }

  return {
    latestSyncedAt: maxIsoDate(results.map((result) => readSyncedAt(result.data))),
    error: null,
  }
}
