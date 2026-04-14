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

/** scheduled_at <= now() 인 pending 항목 전체 조회 */
export async function getDueDelayItems(): Promise<DelayQueueItem[]> {
  const { data, error } = await sb()
    .from("automation_delay_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })

  if (error) {
    throw new Error(`[delay-queue] due 항목 조회 실패: ${error.message}`)
  }
  return (data ?? []).map(rowToItem)
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
