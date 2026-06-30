import "server-only"

import { createCrmCustomerEvent } from "@/lib/repositories/crm-events"
import { createCrmTask, inferTaskTypeFromTitle } from "@/lib/repositories/crm-tasks"
import { getLeadById, saveLead } from "@/lib/repositories/leads"
import type { CrmCustomerEventTargetType } from "@/lib/supabase/database.types"
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

function targetTypeOrUnknown(value: CaptureRowRecord["matchedTargetType"]): CrmCustomerEventTargetType {
  if (value === "lead" || value === "neo_account" || value === "customer" || value === "deal") return value
  return "unknown"
}

export async function applyCaptureBatch(
  batchId: string,
  options: { createdBy?: string | null; now?: Date } = {}
): Promise<{ summary: ApplyCaptureSummary } | null> {
  const loaded = await getCaptureBatchWithRows(batchId)
  if (!loaded) return null
  const { batch, rows } = loaded
  const now = options.now ?? new Date()
  const createdBy = options.createdBy?.trim() || batch.createdBy

  let eventCreated = batch.eventCreatedCount
  let taskCreated = batch.taskCreatedCount
  let leadCreated = batch.leadCreatedCount
  let failed = 0
  let skipped = 0
  let appliedThisRun = 0

  for (const row of rows) {
    // 멱등: 이미 적용되어 이벤트가 만들어진 행은 재생성하지 않는다.
    if (row.applyStatus === "applied" && row.createdEventId) continue
    if (!row.selected || row.matchStatus === "duplicate_in_batch") {
      skipped += 1
      continue
    }

    // 직전 부분 실패로 리드가 이미 생성됐을 수 있어 try 밖에서 선언 — 실패 패치에도 담아
    // 재시도 시 중복 saveLead를 막는다.
    let createdLeadId = row.createdLeadId
    try {
      let targetType = row.matchedTargetType
      let targetId = row.matchedTargetId
      let targetLabel = row.matchedTargetLabel

      // 선택된 신규 리드 후보 → 리드 생성 후 타깃으로 사용
      if (!targetId && row.matchStatus === "new_lead_candidate" && !createdLeadId) {
        const lead = await saveLead({
          source: "crm_capture",
          name: row.contactName ?? undefined,
          org: row.organizationName ?? undefined,
          phone: row.phone ?? undefined,
          email: row.email ?? undefined,
          message: row.memo ?? undefined,
          // 행사 명단이면 리드에도 토큰을 달아 리드 쪽 집계와 일관성 유지
          notes: batch.publicEventId ? setEventToken("", batch.publicEventId) : undefined,
          timestamp: now.toISOString(),
        })
        createdLeadId = lead.id
        targetType = "lead"
        targetId = lead.id
        targetLabel = lead.org || lead.name || row.organizationName || null
        leadCreated += 1
      } else if (!targetId && createdLeadId) {
        // 재시도: 리드는 이미 생성됐으니 중복 없이 그 리드를 타깃으로 사용.
        targetType = "lead"
        targetId = createdLeadId
      }

      const activityLabel = captureActivityLabel(row.activityType)

      // 참석자 출신(origin) — 행에 수동 지정(override)이 있으면 우선, 없으면 자동 도출.
      let attendeeOrigin = row.attendeeOrigin
      if (!attendeeOrigin) {
        // 기존 리드 매칭이면 그 리드의 source로 ad/site 구분.
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

      const event = await createCrmCustomerEvent({
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
      eventCreated += 1

      let createdTaskId: string | null = null
      const template = captureTaskTemplate(row.activityType)
      if (row.createTask && template) {
        const task = await createCrmTask({
          targetType: targetTypeOrUnknown(targetType),
          targetId,
          targetLabel: targetLabel ?? row.organizationName ?? row.contactName,
          taskType: inferTaskTypeFromTitle(template.title),
          title: template.title,
          dueAt: row.taskDueAt ?? captureTaskDueAt(row.activityType, now, batch.defaultTaskOffsetDays),
          sourceEventId: event.id,
          createdBy,
        })
        createdTaskId = task.id
        taskCreated += 1
      }

      await updateCaptureRowApplyResult(row.id, {
        apply_status: "applied",
        created_event_id: event.id,
        created_task_id: createdTaskId,
        created_lead_id: createdLeadId,
        error_message: null,
        matched_target_type: targetType,
        matched_target_id: targetId,
        matched_target_label: targetLabel,
        match_status: createdLeadId && row.matchStatus === "new_lead_candidate" ? "confirmed_lead" : row.matchStatus,
      })
      appliedThisRun += 1
    } catch (error) {
      failed += 1
      await updateCaptureRowApplyResult(row.id, {
        apply_status: "failed",
        // 리드가 이미 생성됐다면 기록 — 재시도 시 중복 생성 방지.
        created_lead_id: createdLeadId,
        error_message: error instanceof Error ? error.message : "적용 실패",
      }).catch(() => {})
    }
  }

  const reviewRemaining = rows.filter(
    (row) => row.applyStatus !== "applied" && !row.selected && row.matchStatus !== "duplicate_in_batch"
  ).length
  const status = failed > 0 ? "partial_failed" : "applied"
  await updateBatchCounts(batchId, { status, eventCreated, taskCreated, leadCreated })

  return {
    summary: { eventCreated, taskCreated, leadCreated, applied: appliedThisRun, failed, skipped, reviewRemaining },
  }
}
