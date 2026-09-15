import "server-only"

import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import { listRecentSyncRunsFresh } from "@/lib/repositories/branch-sync"
import {
  buildSyncFailureAlert,
  computeSyncFailureStreak,
  shouldAlertSyncFailureStreak,
  type SyncSourceKey,
} from "./failure-streak"

const SOURCES: SyncSourceKey[] = ["rev", "hw"]
// 하루 1회 크론 + 수동 재시도 몇 번이면 두 달치를 덮는다. 창을 넘기면 streak.truncated로 드러난다.
const RECENT_RUN_WINDOW = 60

export interface SyncFailureAlertOutcome {
  source: SyncSourceKey
  failedDays: number
  delivered: boolean
}

// 크론(하루 1회)이 동기화 실패 직후 호출한다. 수동 동기화에서는 부르지 않는다 — 같은 날
// 여러 번 판정하면 "2일째" 알림이 재시도마다 반복된다. 운영방(wecom_webhook, warning → ops)으로만
// 보내고, 발송 실패는 동기화 결과를 바꾸지 않는다.
export async function notifyBranchSyncFailureStreaks(now = new Date()): Promise<SyncFailureAlertOutcome[]> {
  const runs = await listRecentSyncRunsFresh(RECENT_RUN_WINDOW)
  const outcomes: SyncFailureAlertOutcome[] = []
  for (const source of SOURCES) {
    const streak = computeSyncFailureStreak(runs, source)
    if (!shouldAlertSyncFailureStreak(streak.failedDays)) continue
    const { title, message } = buildSyncFailureAlert(streak, {
      now,
      serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null,
    })
    try {
      const event = await emitNotificationEvent({
        eventType: "branch.sync.failure_streak",
        notificationType: "warning",
        categoryTag: "system",
        severity: "warning",
        title,
        message,
        routeUrl: "/admin/branch/ledger",
        source: "branch_sync",
        sourceId: source,
        payload: {
          source,
          failedDays: streak.failedDays,
          failedRuns: streak.failedRuns,
          lastSuccessAt: streak.lastSuccessAt,
          lastFailureAt: streak.lastFailureAt,
          truncated: streak.truncated,
        },
        channels: ["wecom_webhook"],
      })
      // 웹훅 실패·꺼둠은 throw가 아니라 deliveryResults로 돌아온다 — 실제로 나갔는지는 여기서 본다.
      const delivered = ((event.deliveryResults ?? []) as Array<{ status: string }>).some((result) => result.status === "sent")
      outcomes.push({ source, failedDays: streak.failedDays, delivered })
    } catch (error) {
      console.error("[branch-sync] failure streak alert failed", error)
      outcomes.push({ source, failedDays: streak.failedDays, delivered: false })
    }
  }
  return outcomes
}
