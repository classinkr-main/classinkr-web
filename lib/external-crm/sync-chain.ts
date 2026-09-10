import "server-only"
import { dispatchRenewalAlerts, type DispatchRenewalAlertsResult } from "@/lib/crm/renewal-alert-dispatch"

import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import {
  type ExternalCrmSyncResult,
  syncXiaoshouyiSnapshots,
} from "@/lib/external-crm/xiaoshouyi-sync"
import {
  type GenerateExternalCrmLinkCandidatesResult,
  generateExternalCrmLinkCandidates,
} from "@/lib/repositories/crm-source-links"
import {
  type RefreshCrmNeoCustomerSnapshotsResult,
  refreshCrmNeoCustomerSnapshotsFromExternalRecords,
} from "@/lib/repositories/crm-neo-customer-snapshots"

export interface ExternalCrmSyncChainResult {
  sync: ExternalCrmSyncResult
  neoCustomerSnapshots?: RefreshCrmNeoCustomerSnapshotsResult
  neoCustomerSnapshotsError?: string
  candidates?: GenerateExternalCrmLinkCandidatesResult
  candidatesError?: string
  renewalAlerts?: DispatchRenewalAlertsResult
  renewalAlertsError?: string
}

export async function notifyExternalCrmSyncOutcome(
  result: ExternalCrmSyncChainResult,
  trigger: "manual" | "cron"
) {
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

  const shouldRefreshSnapshots = sync.ok && !sync.skipped
  const shouldGenerateCandidates = sync.ok && !sync.skipped && !sync.cached
  const [snapshotOutcome, candidateOutcome] = await Promise.all([
    shouldRefreshSnapshots
      ? refreshCrmNeoCustomerSnapshotsFromExternalRecords()
          .then((value) => ({ value }))
          .catch((error: unknown) => ({ error }))
      : Promise.resolve(null),
    shouldGenerateCandidates
      ? generateExternalCrmLinkCandidates()
          .then((value) => ({ value }))
          .catch((error: unknown) => ({ error }))
      : Promise.resolve(null),
  ])

  if (snapshotOutcome && "value" in snapshotOutcome) {
    result.neoCustomerSnapshots = snapshotOutcome.value
  } else if (snapshotOutcome && "error" in snapshotOutcome) {
    result.neoCustomerSnapshotsError = snapshotOutcome.error instanceof Error
      ? snapshotOutcome.error.message
      : String(snapshotOutcome.error)
    console.error("[external-crm sync-chain] NEO customer snapshot refresh failed", snapshotOutcome.error)
  }

  if (candidateOutcome && "value" in candidateOutcome) {
    result.candidates = candidateOutcome.value
  } else if (candidateOutcome && "error" in candidateOutcome) {
    result.candidatesError = candidateOutcome.error instanceof Error
      ? candidateOutcome.error.message
      : String(candidateOutcome.error)
    console.error("[external-crm sync-chain] candidate generation failed", candidateOutcome.error)
  }

  // 재연락 알림은 스냅샷이 갱신된 뒤에만 낸다.
  // 묵은 잔액·만료로 알림을 쏘면 이미 연장한 고객에게 "연장하세요"가 가고,
  // 정작 소진된 고객은 조용하다. 순서가 곧 정확성이다.
  if (result.neoCustomerSnapshots) {
    try {
      result.renewalAlerts = await dispatchRenewalAlerts()
    } catch (alertError) {
      result.renewalAlertsError = alertError instanceof Error ? alertError.message : String(alertError)
      console.error("[external-crm sync-chain] renewal alert dispatch failed", alertError)
    }
  }

  return result
}
