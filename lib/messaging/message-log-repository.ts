import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type {
  MessageChannel,
  MessageLogRow,
  MessageLogStatus,
  MessageProvider,
} from "@/lib/messaging/types"

/**
 * ─────────────────────────────────────────────────────────────
 * messaging/message-log-repository.ts  —  message_logs CRUD
 * ─────────────────────────────────────────────────────────────
 *
 * Supabase admin 클라이언트 전용(RLS 우회). per-recipient 발송 결과를 기록한다.
 * 테이블 정의: supabase/migrations/20260703_message_logs.sql
 */

const sb = () => createSupabaseAdminClient()

export interface InsertMessageLogInput {
  channel: MessageChannel
  provider: MessageProvider | string
  recipient: string
  templateId?: string | null
  groupId?: string | null
  status: MessageLogStatus
  statusCode?: string | null
  error?: string | null
  context?: Record<string, unknown>
}

/**
 * per-recipient 발송 로그를 일괄 삽입한다.
 * 로깅 실패가 발송 응답 자체를 막지 않도록 에러는 삼키지 않되 throw 하지 않고
 * 호출부에서 판단하도록 반환값으로만 신호를 준다.
 */
export async function insertMessageLogs(
  rows: InsertMessageLogInput[]
): Promise<{ inserted: number; error?: string }> {
  if (rows.length === 0) return { inserted: 0 }

  const payload = rows.map((r) => ({
    channel: r.channel,
    provider: r.provider,
    recipient: r.recipient,
    template_id: r.templateId ?? null,
    group_id: r.groupId ?? null,
    status: r.status,
    status_code: r.statusCode ?? null,
    error: r.error ?? null,
    context: r.context ?? {},
  }))

  const { data, error } = await sb().from("message_logs").insert(payload).select("id")
  if (error) {
    return { inserted: 0, error: error.message }
  }
  return { inserted: data?.length ?? 0 }
}

export interface ListMessageLogsParams {
  channel?: MessageChannel
  status?: MessageLogStatus
  limit?: number
  offset?: number
}

export interface ListMessageLogsResult {
  logs: MessageLogRow[]
  total: number
}

/** 로그 목록 조회(필터/페이지네이션). total은 필터 반영 count. */
export async function listMessageLogs(
  params: ListMessageLogsParams = {}
): Promise<ListMessageLogsResult> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200)
  const offset = Math.max(params.offset ?? 0, 0)

  let query = sb()
    .from("message_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (params.channel) query = query.eq("channel", params.channel)
  if (params.status) query = query.eq("status", params.status)

  const { data, error, count } = await query
  if (error) {
    throw new Error(`[messaging] 로그 조회 실패: ${error.message}`)
  }

  return {
    logs: (data ?? []).map(rowToLog),
    total: count ?? 0,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLog(row: any): MessageLogRow {
  return {
    id: row.id,
    channel: row.channel,
    provider: row.provider,
    recipient: row.recipient,
    templateId: row.template_id ?? null,
    groupId: row.group_id ?? null,
    status: row.status,
    statusCode: row.status_code ?? null,
    error: row.error ?? null,
    context: row.context ?? {},
    createdAt: row.created_at,
  }
}

/**
 * 전화번호/식별자 마스킹. 010****5678 형태.
 * API 응답에서만 사용(DB에는 원본 저장 — 재발송/진단 필요).
 */
export function maskRecipient(recipient: string): string {
  const digits = recipient.replace(/[^0-9]/g, "")
  if (digits.length >= 8) {
    // 앞 3자리 + **** + 뒤 4자리
    const head = digits.slice(0, 3)
    const tail = digits.slice(-4)
    return `${head}****${tail}`
  }
  // 이메일 등 비전화 식별자
  if (recipient.includes("@")) {
    const [local, domain] = recipient.split("@")
    const maskedLocal = local.length <= 2 ? `${local[0] ?? ""}*` : `${local.slice(0, 2)}***`
    return `${maskedLocal}@${domain}`
  }
  if (recipient.length <= 3) return "***"
  return `${recipient.slice(0, 2)}***${recipient.slice(-1)}`
}
