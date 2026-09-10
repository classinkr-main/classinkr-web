import "server-only"

import {
  buildRenewalAlertDigests,
  RENEWAL_ALERT_LABELS,
  type RenewalAlertDigest,
  type RenewalAlertRow,
} from "@/lib/crm/renewal-alerts"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import type { NotificationRecipientTarget } from "@/lib/notifications/types"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/** 알림 원천 태그 — 쿨다운 조회의 기준이자 감사 흔적. */
export const RENEWAL_ALERT_SOURCE = "crm_renewal_alert"

/** 같은 고객·같은 사유를 이 기간 안에는 다시 보내지 않는다. */
const DEFAULT_COOLDOWN_DAYS = 7
const SNAPSHOT_SCAN_LIMIT = 5000

export interface DispatchRenewalAlertsResult {
  ownersNotified: number
  itemsNotified: number
  suppressedKeys: number
  /** 담당자 개인에게 도달하지 못하고 관리자 전체로 나간 묶음 수. */
  fellBackToRole: number
  skipped?: string
}

interface SnapshotRow {
  account_id: string
  account_name: string
  owner_id: string | null
  owner_name: string
  billing_mode: string
  balance: number | string | null
  expire_in_days: number | null
  depletion_in_days: number | null
  risk_reasons: Array<{ code?: string | null }> | null
}

function toNumber(value: number | string | null): number | null {
  if (value == null) return null
  const numeric = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function digestMessage(digest: RenewalAlertDigest) {
  const lines = digest.items.slice(0, 8).map((item) => {
    const label = RENEWAL_ALERT_LABELS[item.kind]
    const due = item.dueInDays == null ? "" : ` D-${item.dueInDays}`
    return `· ${item.accountName} — ${label}${due}`
  })
  const rest = digest.items.length - lines.length
  if (rest > 0) lines.push(`· 외 ${rest}곳`)
  return lines.join("\n")
}

/**
 * 최근 쿨다운 기간에 이미 보낸 dedupeKey 를 모은다.
 * 알림 이력 자체가 중복 방지 저장소이므로 별도 테이블을 두지 않는다.
 */
async function loadSuppressedKeys(
  sb: ReturnType<typeof createSupabaseAdminClient>,
  since: string
): Promise<Set<string>> {
  const { data, error } = await sb
    .from("notification_events")
    .select("payload_json, created_at")
    .eq("source", RENEWAL_ALERT_SOURCE)
    .gte("created_at", since)
    .limit(1000)

  const keys = new Set<string>()
  // 이력을 못 읽으면 억제하지 않는다 — 중복 한 번이 누락 한 번보다 낫다.
  if (error || !data) return keys

  for (const row of data) {
    const payload = row.payload_json as { dedupeKeys?: unknown } | null
    const list = payload?.dedupeKeys
    if (!Array.isArray(list)) continue
    for (const key of list) if (typeof key === "string") keys.add(key)
  }
  return keys
}

/** NEO 담당자 id → 어드민 사용자. 매핑이 없으면 개인 라우팅을 포기하고 역할 전체로 보낸다. */
async function loadOwnerRecipients(sb: ReturnType<typeof createSupabaseAdminClient>) {
  const { data, error } = await sb
    .from("admin_profiles")
    .select("user_id, neo_owner_id, status")
    .eq("status", "ACTIVE")
    .not("neo_owner_id", "is", null)

  const byOwnerId = new Map<string, string>()
  if (error || !data) return byOwnerId
  for (const row of data) {
    const ownerId = row.neo_owner_id ? String(row.neo_owner_id) : null
    if (ownerId && row.user_id) byOwnerId.set(ownerId, String(row.user_id))
  }
  return byOwnerId
}

export async function dispatchRenewalAlerts(
  options: { now?: Date; cooldownDays?: number; dryRun?: boolean } = {}
): Promise<DispatchRenewalAlertsResult> {
  const sb = createSupabaseAdminClient()
  const now = options.now ?? new Date()
  const cooldownDays = options.cooldownDays ?? DEFAULT_COOLDOWN_DAYS
  const since = new Date(now.getTime() - cooldownDays * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await sb
    .from("crm_neo_customer_snapshots")
    .select(
      "account_id, account_name, owner_id, owner_name, billing_mode, balance, expire_in_days, depletion_in_days, risk_reasons"
    )
    .limit(SNAPSHOT_SCAN_LIMIT)

  if (error) {
    return { ownersNotified: 0, itemsNotified: 0, suppressedKeys: 0, fellBackToRole: 0, skipped: error.message }
  }

  const rows: RenewalAlertRow[] = (data ?? []).map((row) => {
    const snapshot = row as SnapshotRow
    return {
      accountId: snapshot.account_id,
      accountName: snapshot.account_name,
      ownerId: snapshot.owner_id,
      ownerName: snapshot.owner_name,
      billingMode: snapshot.billing_mode,
      balance: toNumber(snapshot.balance),
      expireInDays: snapshot.expire_in_days,
      depletionInDays: snapshot.depletion_in_days,
      riskReasons: snapshot.risk_reasons,
    }
  })

  const [suppressedKeys, ownerRecipients] = await Promise.all([
    loadSuppressedKeys(sb, since),
    loadOwnerRecipients(sb),
  ])

  const digests = buildRenewalAlertDigests(rows, { suppressedKeys })
  if (options.dryRun) {
    return {
      ownersNotified: digests.length,
      itemsNotified: digests.reduce((total, digest) => total + digest.items.length, 0),
      suppressedKeys: suppressedKeys.size,
      fellBackToRole: digests.filter((digest) => !digest.ownerId || !ownerRecipients.has(digest.ownerId)).length,
      skipped: "dryRun",
    }
  }

  let itemsNotified = 0
  let fellBackToRole = 0

  for (const digest of digests) {
    const userId = digest.ownerId ? ownerRecipients.get(digest.ownerId) : undefined
    const recipients: NotificationRecipientTarget[] | undefined = userId
      ? [{ recipientType: "admin_user", recipientId: userId }]
      : undefined
    if (!recipients) fellBackToRole += 1

    try {
      await emitNotificationEvent({
        eventType: "crm.renewal.due",
        notificationType: "action_required",
        categoryTag: "partner",
        severity: digest.counts.expiring || digest.counts.depleted ? "warning" : "info",
        title: `재연락 필요 ${digest.items.length}곳 — ${digest.ownerName}`,
        message: `${digest.summary}\n${digestMessage(digest)}`,
        routeUrl: "/admin/crm",
        source: RENEWAL_ALERT_SOURCE,
        sourceId: digest.ownerId ?? digest.ownerName,
        payload: {
          ownerId: digest.ownerId,
          ownerName: digest.ownerName,
          counts: digest.counts,
          // 다음 실행의 쿨다운 기준. 이 키가 남아야 같은 건이 매일 반복되지 않는다.
          dedupeKeys: digest.items.map((item) => item.dedupeKey),
        },
        recipients,
      })
      itemsNotified += digest.items.length
    } catch (alertError) {
      // 한 담당자 발송 실패가 나머지를 막지 않는다.
      console.error("[crm renewal-alert] emit failed", digest.ownerName, alertError)
    }
  }

  return {
    ownersNotified: digests.length,
    itemsNotified,
    suppressedKeys: suppressedKeys.size,
    fellBackToRole,
  }
}
