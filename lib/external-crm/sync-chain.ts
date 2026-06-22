import "server-only"

import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import {
  type ExternalCrmSyncResult,
  syncXiaoshouyiSnapshots,
} from "@/lib/external-crm/xiaoshouyi-sync"
import {
  type GenerateExternalCrmLinkCandidatesResult,
  generateExternalCrmLinkCandidates,
} from "@/lib/repositories/crm-source-links"

export interface ExternalCrmSyncChainResult {
  sync: ExternalCrmSyncResult
  candidates?: GenerateExternalCrmLinkCandidatesResult
  candidatesError?: string
}

async function notifySyncOutcome(result: ExternalCrmSyncChainResult, trigger: "manual" | "cron") {
  const { sync, candidates } = result

  try {
    if (!sync.ok && !sync.skipped) {
      const failedObjects = sync.objects.filter((object) => object.status === "failed")
      await emitNotificationEvent({
        eventType: "crm.external_sync.failed",
        notificationType: "warning",
        categoryTag: "partner",
        severity: "warning",
        title: "외부 CRM 동기화 실패",
        message: `Xiaoshouyi 동기화 중 ${failedObjects.length}개 객체가 실패했습니다: ${failedObjects
          .map((object) => object.objectApiKey)
          .join(", ")}`,
        routeUrl: "/admin/crm/deals",
        source: "external_crm_sync",
        payload: { trigger, failedObjects: failedObjects.map((object) => object.objectApiKey) },
      })
      return
    }

    if (!candidates) return

    const newCandidates = candidates.insertedCandidates
    const autoConfirmed = candidates.autoConfirmed
    if (newCandidates === 0 && autoConfirmed === 0) return

    const rowsUpserted = sync.objects.reduce((total, object) => total + object.rowsUpserted, 0)
    await emitNotificationEvent({
      eventType: "crm.external_sync.completed",
      notificationType: "status_update",
      categoryTag: "partner",
      severity: "info",
      title: `외부 CRM 동기화 — 자동 확정 ${autoConfirmed}건, 검토 대기 ${newCandidates}건`,
      message: `Xiaoshouyi 스냅샷 ${rowsUpserted}건을 반영하고 매칭 후보 ${newCandidates}건을 생성했습니다. 자동 확정 ${autoConfirmed}건은 매칭 인박스에서 되돌릴 수 있습니다.`,
      routeUrl: "/admin/crm/matching",
      source: "external_crm_sync",
      payload: {
        trigger,
        rowsUpserted,
        newCandidates,
        autoConfirmed,
        scannedExternalRecords: candidates.scannedExternalRecords,
      },
    })
  } catch (error) {
    console.error("[external-crm sync-chain] notification failed", error)
  }
}

// Sync → candidate generation → auto-confirm → admin notification, as one
// unit so manual button and cron behave identically.
export async function runExternalCrmSyncChain(
  trigger: "manual" | "cron",
  options: { force?: boolean; recentSyncTtlMs?: number } = {}
): Promise<ExternalCrmSyncChainResult> {
  const sync = await syncXiaoshouyiSnapshots(trigger, options)
  const result: ExternalCrmSyncChainResult = { sync }

  if (sync.ok && !sync.skipped && !sync.cached) {
    try {
      result.candidates = await generateExternalCrmLinkCandidates()
    } catch (error) {
      result.candidatesError = error instanceof Error ? error.message : String(error)
      console.error("[external-crm sync-chain] candidate generation failed", error)
    }
  }

  await notifySyncOutcome(result, trigger)
  return result
}
