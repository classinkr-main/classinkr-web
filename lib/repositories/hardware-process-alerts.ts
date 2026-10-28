import "server-only"

import { fetchAllSupabaseRows } from "@/lib/repositories/branch-hw"
import { isMissingColumnError } from "@/lib/repositories/hardware-inventory"
import type { ProcessAlertMovementRow } from "@/lib/hardware/process-alerts"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 하드웨어 일일 알림(lib/hardware/process-alerts.ts)이 읽는 원장 — 취소 안 된 출고·회수 전량(키셋 페이지, 행 수 상한 없음).
// 가격·시리얼·raw 는 읽지 않는다. 시트 행의 유형 추정에 쓰는 raw 를 빼도 되는 이유: 샘플 반납 알림은 반납 예정일
// (expected_return_at — 어드민 기록에만 있다)이 있는 행만 보므로 시트 행은 처음부터 대상이 아니다.

const BASE_COLUMNS =
  "id,product_name,movement_type,quantity,occurred_at,created_at,to_location,owner,status,memo,voided_at"
const PROCESS_COLUMNS = "owner_user_id,outbound_type,expected_return_at,return_of_movement_id"

export interface ProcessAlertLedger {
  rows: ProcessAlertMovementRow[]
  /** false = 프로세스 칸이 없다(20261028 마이그레이션 전) — 기본 칸만 읽었다. */
  processColumns: boolean
}

function readRows(columns: string) {
  const sb = createSupabaseAdminClient()
  return fetchAllSupabaseRows<ProcessAlertMovementRow>((afterId, limit) => {
    let query = sb
      .from("hardware_movements")
      .select(columns)
      .in("movement_type", ["outbound", "return"])
      .is("voided_at", null)
      .order("id", { ascending: true })
      .limit(limit)
    if (afterId) query = query.gt("id", afterId)
    return query
  })
}

export async function listProcessAlertLedger(): Promise<ProcessAlertLedger> {
  try {
    return { rows: await readRows(`${BASE_COLUMNS},${PROCESS_COLUMNS}`), processColumns: true }
  } catch (error) {
    if (!isMissingColumnError(error)) throw error
  }
  return { rows: await readRows(BASE_COLUMNS), processColumns: false }
}

/**
 * 같은 날(source_id = KST 날짜) 이 알림이 외부 채널로 이미 나갔는가. 이벤트 행만 있고 발송이 실패·건너뜀이면
 * 아직 안 나간 것으로 본다 — 같은 슬롯 재시도가 다시 보낼 수 있게.
 */
export async function hasProcessAlertBeenSent(input: {
  eventType: string
  source: string
  sourceId: string
}): Promise<boolean> {
  const sb = createSupabaseAdminClient()
  const events = await sb
    .from("notification_events")
    .select("id")
    .eq("event_type", input.eventType)
    .eq("source", input.source)
    .eq("source_id", input.sourceId)
    .limit(20)
  if (events.error) throw events.error
  const eventIds = (events.data ?? []).map((row) => String((row as { id: unknown }).id))
  if (eventIds.length === 0) return false

  const sent = await sb
    .from("notification_delivery_logs")
    .select("id")
    .in("event_id", eventIds)
    .eq("status", "sent")
    .limit(1)
  if (sent.error) throw sent.error
  return (sent.data ?? []).length > 0
}
