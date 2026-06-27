import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type {
  CrmCaptureActivityType,
  CrmCaptureBatch,
  CrmCaptureBatchStatus,
  CrmCaptureRow,
  CrmCaptureRowInsert,
  CrmCaptureRowUpdate,
  CrmCaptureSourceType,
} from "@/lib/supabase/database.types"
import { captureTaskDueAt, captureTaskTemplate } from "./task-templates"
import type { MatchedRow } from "./matching"

export interface CaptureBatchRecord {
  id: string
  sourceType: CrmCaptureSourceType
  sourceId: string | null
  sourceLabel: string | null
  defaultActivityType: CrmCaptureActivityType
  defaultTaskEnabled: boolean
  defaultTaskOffsetDays: number
  status: CrmCaptureBatchStatus
  rowCount: number
  eventCreatedCount: number
  taskCreatedCount: number
  leadCreatedCount: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface CaptureRowRecord {
  id: string
  batchId: string
  rowIndex: number
  rawText: string
  organizationName: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  regionLabel: string | null
  activityType: CrmCaptureActivityType
  memo: string | null
  matchStatus: CrmCaptureRow["match_status"]
  matchedTargetType: CrmCaptureRow["matched_target_type"]
  matchedTargetId: string | null
  matchedTargetLabel: string | null
  matchCandidates: Record<string, unknown>[]
  selected: boolean
  createTask: boolean
  taskDueAt: string | null
  applyStatus: CrmCaptureRow["apply_status"]
  createdEventId: string | null
  createdTaskId: string | null
  createdLeadId: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

function toBatchRecord(row: CrmCaptureBatch): CaptureBatchRecord {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceLabel: row.source_label,
    defaultActivityType: row.default_activity_type,
    defaultTaskEnabled: row.default_task_enabled,
    defaultTaskOffsetDays: row.default_task_offset_days,
    status: row.status,
    rowCount: row.row_count,
    eventCreatedCount: row.event_created_count,
    taskCreatedCount: row.task_created_count,
    leadCreatedCount: row.lead_created_count,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toCaptureRowRecord(row: CrmCaptureRow): CaptureRowRecord {
  return {
    id: row.id,
    batchId: row.batch_id,
    rowIndex: row.row_index,
    rawText: row.raw_text,
    organizationName: row.organization_name,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    regionLabel: row.region_label,
    activityType: row.activity_type,
    memo: row.memo,
    matchStatus: row.match_status,
    matchedTargetType: row.matched_target_type,
    matchedTargetId: row.matched_target_id,
    matchedTargetLabel: row.matched_target_label,
    matchCandidates: row.match_candidates ?? [],
    selected: row.selected,
    createTask: row.create_task,
    taskDueAt: row.task_due_at,
    applyStatus: row.apply_status,
    createdEventId: row.created_event_id,
    createdTaskId: row.created_task_id,
    createdLeadId: row.created_lead_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface CreateCaptureBatchInput {
  sourceType: CrmCaptureSourceType
  sourceLabel?: string | null
  defaultActivityType: CrmCaptureActivityType
  defaultTaskEnabled: boolean
  defaultTaskOffsetDays: number
  createdBy?: string | null
}

export async function createCaptureBatch(input: CreateCaptureBatchInput): Promise<CaptureBatchRecord> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("crm_capture_batches")
    .insert({
      source_type: input.sourceType,
      source_label: input.sourceLabel?.trim() || null,
      default_activity_type: input.defaultActivityType,
      default_task_enabled: input.defaultTaskEnabled,
      default_task_offset_days: input.defaultTaskOffsetDays,
      status: "draft",
      created_by: input.createdBy?.trim() || null,
    })
    .select("*")
    .single()
  if (error) throw new Error(`[crm-capture] 배치 생성 실패: ${error.message}`)
  return toBatchRecord(data as CrmCaptureBatch)
}

export async function getCaptureBatch(id: string): Promise<CaptureBatchRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from("crm_capture_batches").select("*").eq("id", id).maybeSingle()
  if (error) throw new Error(`[crm-capture] 배치 조회 실패: ${error.message}`)
  return data ? toBatchRecord(data as CrmCaptureBatch) : null
}

export async function getCaptureBatchWithRows(
  id: string
): Promise<{ batch: CaptureBatchRecord; rows: CaptureRowRecord[] } | null> {
  const batch = await getCaptureBatch(id)
  if (!batch) return null
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("crm_capture_rows")
    .select("*")
    .eq("batch_id", id)
    .order("row_index", { ascending: true })
  if (error) throw new Error(`[crm-capture] 행 조회 실패: ${error.message}`)
  return { batch, rows: ((data ?? []) as CrmCaptureRow[]).map(toCaptureRowRecord) }
}

// 확정 매칭만 기본 선택(예외 중심 검토). 확인 필요/신규/다중/중복은 명시 확인 필요.
function isConfirmed(status: MatchedRow["matchStatus"]) {
  return status === "confirmed_customer" || status === "confirmed_lead"
}

export async function replaceCaptureRows(
  batch: CaptureBatchRecord,
  matched: MatchedRow[],
  now = new Date()
): Promise<CaptureRowRecord[]> {
  const supabase = createSupabaseAdminClient()
  const { error: deleteError } = await supabase.from("crm_capture_rows").delete().eq("batch_id", batch.id)
  if (deleteError) throw new Error(`[crm-capture] 기존 행 삭제 실패: ${deleteError.message}`)

  const activityType = batch.defaultActivityType
  const hasTemplate = captureTaskTemplate(activityType) != null
  const inserts: CrmCaptureRowInsert[] = matched.map((row, index) => ({
    batch_id: batch.id,
    row_index: index,
    raw_text: row.rawText || row.memo || `행 ${index + 1}`,
    organization_name: row.organizationName,
    contact_name: row.contactName,
    phone: row.phone,
    email: row.email,
    region_label: row.regionLabel,
    activity_type: activityType,
    memo: row.memo,
    match_status: row.matchStatus,
    matched_target_type: row.matchedTargetType,
    matched_target_id: row.matchedTargetId,
    matched_target_label: row.matchedTargetLabel,
    match_candidates: row.matchCandidates as unknown as Record<string, unknown>[],
    selected: isConfirmed(row.matchStatus),
    create_task: batch.defaultTaskEnabled && hasTemplate,
    task_due_at: batch.defaultTaskEnabled ? captureTaskDueAt(activityType, now, batch.defaultTaskOffsetDays) : null,
    apply_status: "pending",
    created_event_id: null,
    created_task_id: null,
    created_lead_id: null,
    error_message: null,
  }))

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from("crm_capture_rows").insert(inserts)
    if (insertError) throw new Error(`[crm-capture] 행 저장 실패: ${insertError.message}`)
  }

  await supabase
    .from("crm_capture_batches")
    .update({ status: "parsed", row_count: inserts.length })
    .eq("id", batch.id)

  const result = await getCaptureBatchWithRows(batch.id)
  return result?.rows ?? []
}

export async function getCaptureRow(id: string): Promise<CaptureRowRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from("crm_capture_rows").select("*").eq("id", id).maybeSingle()
  if (error) throw new Error(`[crm-capture] 행 조회 실패: ${error.message}`)
  return data ? toCaptureRowRecord(data as CrmCaptureRow) : null
}

export async function updateCaptureRow(id: string, patch: CrmCaptureRowUpdate): Promise<CaptureRowRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from("crm_capture_rows").update(patch).eq("id", id).select("*").maybeSingle()
  if (error) throw new Error(`[crm-capture] 행 수정 실패: ${error.message}`)
  return data ? toCaptureRowRecord(data as CrmCaptureRow) : null
}

export async function updateCaptureRowApplyResult(
  id: string,
  patch: Pick<CrmCaptureRowUpdate, "apply_status" | "created_event_id" | "created_task_id" | "created_lead_id" | "error_message" | "matched_target_type" | "matched_target_id" | "matched_target_label" | "match_status">
): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from("crm_capture_rows").update(patch).eq("id", id)
  if (error) throw new Error(`[crm-capture] 적용 결과 저장 실패: ${error.message}`)
}

export async function setCaptureBatchStatus(id: string, status: CrmCaptureBatchStatus): Promise<CaptureBatchRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from("crm_capture_batches").update({ status }).eq("id", id).select("*").maybeSingle()
  if (error) throw new Error(`[crm-capture] 배치 상태 변경 실패: ${error.message}`)
  return data ? toBatchRecord(data as CrmCaptureBatch) : null
}

export async function updateBatchCounts(
  id: string,
  counts: { status: CrmCaptureBatchStatus; eventCreated: number; taskCreated: number; leadCreated: number }
): Promise<CaptureBatchRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("crm_capture_batches")
    .update({
      status: counts.status,
      event_created_count: counts.eventCreated,
      task_created_count: counts.taskCreated,
      lead_created_count: counts.leadCreated,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle()
  if (error) throw new Error(`[crm-capture] 배치 카운트 갱신 실패: ${error.message}`)
  return data ? toBatchRecord(data as CrmCaptureBatch) : null
}
