// lib/repositories/event-metrics.ts
// 행사 캠페인 메트릭 저장소 — Supabase(event_metrics) 이전 완료(2026-08-20).
// 이전 JSON 폴백(data/event-metrics.json)은 프로덕션 쓰기 차단 문제로 폐기.
// RLS admin-only(deny-all) — 반드시 admin 클라이언트로만 접근.

import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  DEFAULT_EVENT_METRICS,
  type EventMetrics,
} from "@/lib/types/event-metrics"

const sb = () => createSupabaseAdminClient()

function normalize(eventId: string, raw: Partial<EventMetrics> | null | undefined): EventMetrics {
  const base = raw ?? {}
  return {
    ...DEFAULT_EVENT_METRICS,
    ...base,
    eventId,
    adSpendEntries: Array.isArray(base.adSpendEntries) ? base.adSpendEntries : [],
    relatedLinks: Array.isArray(base.relatedLinks) ? base.relatedLinks : [],
    updatedAt: base.updatedAt ?? new Date().toISOString(),
  }
}

// 행 부재(data=null, error=null)는 여전히 기본값 반환 — 신규 행사 상세를 여는 정상 경로다.
// 반면 쿼리 자체 실패(테이블 부재·네트워크 등)는 무시하지 않고 throw 한다 — 무시하면
// saveEventMetrics 의 read-merge-upsert 가 일시 장애 때 기존 데이터를 기본값으로 덮어써
// 유실시킬 수 있다(부재와 장애를 분리하는 게 목적).
export async function getEventMetrics(eventId: string): Promise<EventMetrics> {
  const { data, error } = await sb()
    .from("event_metrics")
    .select("metrics")
    .eq("event_id", eventId)
    .maybeSingle()
  if (error) throw new Error(`[event-metrics] 조회 실패: ${error.message}`)
  return normalize(eventId, data?.metrics as Partial<EventMetrics> | undefined)
}

export async function getAllEventMetrics(): Promise<Record<string, EventMetrics>> {
  const { data, error } = await sb().from("event_metrics").select("event_id, metrics")
  if (error) throw new Error(`[event-metrics] 조회 실패: ${error.message}`)
  const result: Record<string, EventMetrics> = {}
  for (const row of data ?? []) {
    result[row.event_id] = normalize(row.event_id, row.metrics as Partial<EventMetrics>)
  }
  return result
}

// read-merge-upsert 레이스는 단일 어드민 편집 흐름이라 v1 허용.
export async function saveEventMetrics(
  eventId: string,
  patch: Partial<Omit<EventMetrics, "eventId" | "updatedAt">>
): Promise<EventMetrics> {
  const current = await getEventMetrics(eventId)
  const merged: EventMetrics = {
    ...current,
    ...patch,
    eventId,
    adSpendEntries: patch.adSpendEntries ?? current.adSpendEntries ?? [],
    relatedLinks: patch.relatedLinks ?? current.relatedLinks ?? [],
    updatedAt: new Date().toISOString(),
  }
  const { error } = await sb()
    .from("event_metrics")
    .upsert(
      { event_id: eventId, metrics: merged, updated_at: merged.updatedAt },
      { onConflict: "event_id" }
    )
  if (error) throw new Error(`[event-metrics] 저장 실패: ${error.message}`)
  return merged
}

export async function deleteEventMetrics(eventId: string): Promise<void> {
  const { error } = await sb().from("event_metrics").delete().eq("event_id", eventId)
  if (error) throw new Error(`[event-metrics] 삭제 실패: ${error.message}`)
}
