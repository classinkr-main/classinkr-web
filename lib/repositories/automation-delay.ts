/**
 * ─────────────────────────────────────────────────────────────
 * automation-delay repository  —  delay 큐 CRUD
 * ─────────────────────────────────────────────────────────────
 *
 * automation_delay_queue 테이블 접근 전용.
 * Supabase admin 클라이언트 사용 (RLS 우회).
 */

import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { AutomationRecipient } from "@/lib/automation-types"

const sb = () => createSupabaseAdminClient()

// ─── 타입 ────────────────────────────────────────────────────

export type DelayQueueStatus = "pending" | "sent" | "failed" | "cancelled"

export interface DelayQueueItem {
  id: string
  ruleId: string
  recipientEmail: string
  recipientName: string | null
  recipientData: AutomationRecipient
  scheduledAt: string
  status: DelayQueueStatus
  errorMessage: string | null
  createdAt: string
  processedAt: string | null
}

export interface CreateDelayQueueItemInput {
  ruleId: string
  recipientEmail: string
  recipientName?: string
  recipientData: AutomationRecipient
  scheduledAt: Date
}

// ─── CRUD ────────────────────────────────────────────────────

/** 큐 항목 삽입 */
export async function createDelayQueueItem(
  input: CreateDelayQueueItemInput
): Promise<DelayQueueItem> {
  const { data, error } = await sb()
    .from("automation_delay_queue")
    .insert({
      rule_id: input.ruleId,
      recipient_email: input.recipientEmail,
      recipient_name: input.recipientName ?? null,
      recipient_data: input.recipientData as unknown as Record<string, unknown>,
      scheduled_at: input.scheduledAt.toISOString(),
      status: "pending",
    })
    .select()
    .single()

  if (error) {
    throw new Error(`[delay-queue] 항목 생성 실패: ${error.message}`)
  }
  return rowToItem(data)
}

/** 한 번의 크론 실행이 집는 지연 발송 상한 — 남은 항목은 pending 으로 남아 다음 실행이 이어 간다. */
export const DELAY_QUEUE_BATCH_LIMIT = 100

/** 선점한 항목에 남기는 문구 — 발송 결과를 기록하지 못하고 끊기면 이 상태(failed)로 남아 사람이 본다. */
export const DELAY_QUEUE_CLAIM_NOTE = "발송 시도 중 — 결과가 기록되지 않았습니다(중단됐다면 발송 여부를 확인하세요)"

/** scheduled_at <= now() 인 pending 항목을 오래된 것부터 상한까지 조회 */
export async function getDueDelayItems(limit = DELAY_QUEUE_BATCH_LIMIT): Promise<DelayQueueItem[]> {
  const { data, error } = await sb()
    .from("automation_delay_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit)

  if (error) {
    throw new Error(`[delay-queue] due 항목 조회 실패: ${error.message}`)
  }
  return (data ?? []).map(rowToItem)
}

/**
 * 발송 전에 항목을 선점한다 — pending 일 때만 한 실행이 가져간다(겹친 크론·재전달이 같은 메일을 두 번 보내지 않게).
 * 상태 값이 pending/sent/failed/cancelled 뿐이라 선점은 failed + 안내 문구로 표시한다: 발송 뒤 sent 로 바꾸고,
 * 그 사이에 끊기면 "결과 불명"으로 남는다. 다시 보내지 않는 쪽을 택한다(중복 발송보다 누락 확인이 낫다).
 * 반환값: 이 실행이 선점했으면 true.
 */
export async function claimDelayItem(id: string): Promise<boolean> {
  const { data, error } = await sb()
    .from("automation_delay_queue")
    .update({ status: "failed", processed_at: new Date().toISOString(), error_message: DELAY_QUEUE_CLAIM_NOTE })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")

  if (error) {
    throw new Error(`[delay-queue] 선점 실패 (id=${id}): ${error.message}`)
  }
  return (data ?? []).length > 0
}

/** 항목 상태 및 processed_at 업데이트 */
export async function updateDelayItemStatus(
  id: string,
  status: DelayQueueStatus,
  errorMessage?: string
): Promise<void> {
  const patch: Record<string, unknown> = {
    status,
    processed_at: new Date().toISOString(),
  }
  if (errorMessage !== undefined) {
    patch.error_message = errorMessage
  } else if (status === "sent") {
    // 선점 때 남긴 안내 문구를 지운다.
    patch.error_message = null
  }

  const { error } = await sb()
    .from("automation_delay_queue")
    .update(patch)
    .eq("id", id)

  if (error) {
    throw new Error(`[delay-queue] 상태 업데이트 실패 (id=${id}): ${error.message}`)
  }
}

// ─── 변환 헬퍼 ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToItem(row: any): DelayQueueItem {
  return {
    id: row.id,
    ruleId: row.rule_id,
    recipientEmail: row.recipient_email,
    recipientName: row.recipient_name ?? null,
    recipientData: row.recipient_data as AutomationRecipient,
    scheduledAt: row.scheduled_at,
    status: row.status as DelayQueueStatus,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
    processedAt: row.processed_at ?? null,
  }
}
