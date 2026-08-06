import "server-only"

import { getOrCreateCrmCustomerEventBySource } from "@/lib/repositories/crm-events"
import {
  createCrmTask,
  getCrmTaskBySourceEventId,
  inferTaskTypeFromTitle,
} from "@/lib/repositories/crm-tasks"
import { getLeadById, saveLead } from "@/lib/repositories/leads"
import { getPublicEventById } from "@/lib/repositories/public-events"
import type { CrmCaptureBatchStatus, CrmCustomerEventTargetType } from "@/lib/supabase/database.types"
import { setEventToken } from "@/lib/types/event-metrics"
import { captureActivityLabel } from "./activity-types"
import { deriveAttendeeOrigin } from "./origin"
import {
  getCaptureBatchWithRows,
  updateBatchCounts,
  updateCaptureRowApplyResult,
  type CaptureRowRecord,
} from "./repository"
import { captureTaskDueAt, captureTaskTemplate } from "./task-templates"

export interface ApplyCaptureSummary {
  eventCreated: number
  taskCreated: number
  leadCreated: number
  applied: number
  failed: number
  skipped: number
  reviewRemaining: number
}

export class CaptureApplyConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CaptureApplyConflictError"
  }
}

export function captureBatchStatusAfterApply(input: {
  failed: number
  reviewRemaining: number
}): CrmCaptureBatchStatus {
  if (input.failed > 0) return "partial_failed"
  if (input.reviewRemaining > 0) return "reviewed"
  return "applied"
}

function targetTypeOrUnknown(value: CaptureRowRecord["matchedTargetType"]): CrmCustomerEventTargetType {
  if (value === "lead" || value === "neo_account" || value === "customer" || value === "deal") return value
  return "unknown"
}

function selectedRowsForApply(rows: CaptureRowRecord[], requestedIds?: string[]) {
  const ids = requestedIds ?? rows.filter((row) => row.selected && row.applyStatus !== "applied").map((row) => row.id)
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (uniqueIds.length === 0) throw new CaptureApplyConflictError("적용할 행을 1개 이상 선택하세요.")

  const byId = new Map(rows.map((row) => [row.id, row]))
  return uniqueIds.map((id) => {
    const row = byId.get(id)
    if (!row) throw new CaptureApplyConflictError("선택한 행 중 현재 배치에 없는 항목이 있습니다.")
    if (!row.selected) throw new CaptureApplyConflictError("선택이 해제된 행이 포함되어 있습니다. 목록을 새로고침하세요.")
    if (row.matchStatus === "duplicate_in_batch") {
      throw new CaptureApplyConflictError("배치 내 중복 행은 적용할 수 없습니다.")
    }
    if (row.applyStatus === "applied") {
      throw new CaptureApplyConflictError("이미 적용된 행이 포함되어 있습니다. 목록을 새로고침하세요.")
    }
    return row
  })
}

export async function applyCaptureBatch(
  batchId: string,
  options: { createdBy?: string | null; now?: Date; selectedRowIds?: string[] } = {}
): Promise<{ summary: ApplyCaptureSummary } | null> {
  const loaded = await getCaptureBatchWithRows(batchId)
  if (!loaded) return null
  const { batch, rows } = loaded
  if (batch.status === "applied" || batch.status === "canceled") {
    throw new CaptureApplyConflictError("이미 완료되었거나 취소된 배치입니다.")
  }

  const rowsToApply = selectedRowsForApply(rows, options.selectedRowIds)
  const now = options.now ?? new Date()
  const createdBy = options.createdBy?.trim() || batch.createdBy

  let eventCreated = batch.eventCreatedCount
  let taskCreated = batch.taskCreatedCount
  let leadCreated = batch.leadCreatedCount
  let failed = 0
  const skipped = 0
  let appliedThisRun = 0
  const appliedIds = new Set(rows.filter((row) => row.applyStatus === "applied").map((row) => row.id))

  // 리드 notes 토큰은 공개 신청 리드와 같은 규약으로 slug 우선(없으면 id 폴백).
  let publicEventToken: string | null = batch.publicEventId
  if (batch.publicEventId) {
    try {
      const publicEvent = await getPublicEventById(batch.publicEventId)
      publicEventToken = publicEvent?.slug ?? batch.publicEventId
    } catch {
      // 조회 실패 시 id 토큰으로 폴백 — 적용 자체를 막지 않는다.
    }
  }

  for (const row of rowsToApply) {
    let createdLeadId = row.createdLeadId
    let createdEventId = row.createdEventId
    let createdTaskId = row.createdTaskId

    try {
      let targetType = row.matchedTargetType
      let targetId = row.matchedTargetId
      let targetLabel = row.matchedTargetLabel

      if (!targetId && row.matchStatus === "new_lead_candidate" && !createdLeadId) {
        const lead = await saveLead({
          source: "crm_capture",
          name: row.contactName ?? undefined,
          org: row.organizationName ?? undefined,
          phone: row.phone ?? undefined,
          email: row.email ?? undefined,
          message: row.memo ?? undefined,
          notes: publicEventToken ? setEventToken("", publicEventToken) : undefined,
          timestamp: now.toISOString(),
        })
        createdLeadId = lead.id
        targetType = "lead"
        targetId = lead.id
        targetLabel = lead.org || lead.name || row.organizationName || null
        leadCreated += 1
        await updateCaptureRowApplyResult(row.id, {
          apply_status: "pending",
          created_lead_id: createdLeadId,
          matched_target_type: targetType,
          matched_target_id: targetId,
          matched_target_label: targetLabel,
          match_status: "confirmed_lead",
          error_message: null,
        })
      } else if (!targetId && createdLeadId) {
        targetType = "lead"
        targetId = createdLeadId
      }

      const activityLabel = captureActivityLabel(row.activityType)
      let attendeeOrigin = row.attendeeOrigin
      if (!attendeeOrigin) {
        let leadSource: string | null = null
        let leadHasAdClickId = false
        if (targetType === "lead" && row.matchStatus !== "new_lead_candidate" && targetId) {
          const matchedLead = await getLeadById(targetId)
          leadSource = matchedLead?.source ?? null
          leadHasAdClickId = Boolean(
            matchedLead?.gclid || matchedLead?.fbclid || matchedLead?.msclkid || matchedLead?.ttclid
          )
        }
        attendeeOrigin = deriveAttendeeOrigin({
          matchedTargetType: targetType,
          createdNewLead: row.matchStatus === "new_lead_candidate",
          leadSource,
          leadHasAdClickId,
        })
      }

      if (!createdEventId) {
        const eventResult = await getOrCreateCrmCustomerEventBySource({
          targetType: targetTypeOrUnknown(targetType),
          targetId,
          targetLabel: targetLabel ?? row.organizationName ?? row.contactName,
          sourceType: "sheet",
          sourceId: `capture:${row.id}`,
          occurredAt: now.toISOString(),
          title: `${activityLabel} 기록`,
          summary: row.memo,
          publicEventId: batch.publicEventId,
          attendeeOrigin,
          ownerName: createdBy,
          createdBy,
        })
        createdEventId = eventResult.record.id
        if (eventResult.created) eventCreated += 1
        await updateCaptureRowApplyResult(row.id, {
          apply_status: "pending",
          created_event_id: createdEventId,
          created_lead_id: createdLeadId,
          error_message: null,
        })
      }

      const template = captureTaskTemplate(row.activityType)
      if (row.createTask && template && !createdTaskId) {
        const existingTask = await getCrmTaskBySourceEventId(createdEventId)
        if (existingTask) {
          createdTaskId = existingTask.id
        } else {
          const task = await createCrmTask({
            targetType: targetTypeOrUnknown(targetType),
            targetId,
            targetLabel: targetLabel ?? row.organizationName ?? row.contactName,
            taskType: inferTaskTypeFromTitle(template.title),
            title: template.title,
            dueAt: row.taskDueAt ?? captureTaskDueAt(row.activityType, now, batch.defaultTaskOffsetDays),
            sourceEventId: createdEventId,
            createdBy,
          })
          createdTaskId = task.id
          taskCreated += 1
        }
        await updateCaptureRowApplyResult(row.id, {
          apply_status: "pending",
          created_event_id: createdEventId,
          created_task_id: createdTaskId,
          created_lead_id: createdLeadId,
          error_message: null,
        })
      }

      await updateCaptureRowApplyResult(row.id, {
        apply_status: "applied",
        created_event_id: createdEventId,
        created_task_id: createdTaskId,
        created_lead_id: createdLeadId,
        error_message: null,
        matched_target_type: targetType,
        matched_target_id: targetId,
        matched_target_label: targetLabel,
        match_status: createdLeadId && row.matchStatus === "new_lead_candidate" ? "confirmed_lead" : row.matchStatus,
      })
      appliedIds.add(row.id)
      appliedThisRun += 1
    } catch (error) {
      failed += 1
      await updateCaptureRowApplyResult(row.id, {
        apply_status: "failed",
        created_event_id: createdEventId,
        created_task_id: createdTaskId,
        created_lead_id: createdLeadId,
        error_message: error instanceof Error ? error.message : "적용 실패",
      }).catch(() => {})
    }
  }

  const reviewRemaining = rows.filter(
    (row) => row.matchStatus !== "duplicate_in_batch" && !appliedIds.has(row.id)
  ).length
  const status = captureBatchStatusAfterApply({ failed, reviewRemaining })
  await updateBatchCounts(batchId, { status, eventCreated, taskCreated, leadCreated })

  return {
    summary: { eventCreated, taskCreated, leadCreated, applied: appliedThisRun, failed, skipped, reviewRemaining },
  }
}
