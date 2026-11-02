import "server-only"

import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import {
  HARDWARE_PROCESS_ALERT_EVENT_TYPE,
  HARDWARE_PROCESS_ALERT_SOURCE,
  buildProcessAlertMessage,
  kstDateKey,
  processAlertTotal,
  selectProcessAlerts,
  type ProcessAlertSelection,
} from "@/lib/hardware/process-alerts"
import { hasProcessAlertBeenSent, listProcessAlertLedger } from "@/lib/repositories/hardware-process-alerts"

// 하드웨어 일일 알림 실행 — /api/cron/dispatch/[slot] 의 고정 슬롯(HARDWARE_PROCESS_ALERT_UTC_SLOT)이 부른다.
// 하루 한 통, 운영 WeCom 방(wecom_webhook). 같은 날 이미 나갔으면 다시 보내지 않는다(source_id = KST 날짜).
// 웹훅 주소·외부 오류 원문은 결과·로그에 싣지 않는다.
// 끄기: 설정 > 웹훅에서 운영 방(wecomOpsWebhookUrl)을 끄면 발송이 skipped 로 멈춘다(운영 방 알림 전체).
// 이 알림만 끄려면 env HARDWARE_PROCESS_ALERTS=off — 원장도 읽지 않고 disabled 로 끝난다.

export interface HardwareProcessAlertReport {
  status: "sent" | "empty" | "already_sent" | "preview" | "disabled"
  dryRun: boolean
  dateKey: string
  stalePlannedCount: number
  overdueSampleCount: number
  ownerCount: number
  shownItems: number
  omittedItems: number
  sampleCheckAvailable: boolean
  /** 담당자별 건수(이름·건수만 — 고객·품목 목록은 싣지 않는다). */
  owners: Array<{ label: string; stalePlanned: number; overdueSamples: number }>
  eventId?: string | null
  /** dryRun 일 때만 — 보낼 메시지 미리보기. */
  preview?: { title: string; message: string }
}

function summarize(selection: ProcessAlertSelection) {
  return {
    dateKey: selection.dateKey,
    stalePlannedCount: selection.stalePlannedCount,
    overdueSampleCount: selection.overdueSampleCount,
    ownerCount: selection.groups.length,
    sampleCheckAvailable: selection.sampleCheckAvailable,
    owners: selection.groups.map((group) => ({
      label: group.label,
      stalePlanned: group.stalePlanned.length,
      overdueSamples: group.overdueSamples.length,
    })),
  }
}

export function isHardwareProcessAlertsDisabled(env: NodeJS.ProcessEnv = process.env) {
  return /^(off|0|false|disabled)$/i.test((env.HARDWARE_PROCESS_ALERTS ?? "").trim())
}

export async function runHardwareProcessAlerts(
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<HardwareProcessAlertReport> {
  const dryRun = options.dryRun === true
  const now = options.now ?? new Date()
  if (isHardwareProcessAlertsDisabled()) {
    return {
      status: "disabled",
      dryRun,
      dateKey: kstDateKey(now) ?? now.toISOString().slice(0, 10),
      stalePlannedCount: 0,
      overdueSampleCount: 0,
      ownerCount: 0,
      shownItems: 0,
      omittedItems: 0,
      sampleCheckAvailable: false,
      owners: [],
    }
  }
  const ledger = await listProcessAlertLedger()
  const selection = selectProcessAlerts(ledger.rows, now, { sampleCheckAvailable: ledger.processColumns })
  const built = buildProcessAlertMessage(selection)
  const base = {
    ...summarize(selection),
    dryRun,
    shownItems: built.shownItems,
    omittedItems: built.omittedItems,
  }

  if (dryRun) {
    return { ...base, status: "preview", preview: { title: built.title, message: built.message } }
  }
  if (processAlertTotal(selection) === 0) return { ...base, status: "empty" }

  const dedupe = {
    eventType: HARDWARE_PROCESS_ALERT_EVENT_TYPE,
    source: HARDWARE_PROCESS_ALERT_SOURCE,
    sourceId: selection.dateKey,
  }
  try {
    if (await hasProcessAlertBeenSent(dedupe)) return { ...base, status: "already_sent" }
  } catch (error) {
    // 확인을 못 해도 보낸다 — 드문 중복이 하루 알림을 통째로 놓치는 것보다 낫다.
    console.error("[hardware-process-alerts] dedupe check failed:", error instanceof Error ? error.name : "Error")
  }

  const event = await emitNotificationEvent({
    eventType: HARDWARE_PROCESS_ALERT_EVENT_TYPE,
    notificationType: "reminder",
    categoryTag: "general",
    severity: "warning",
    scopeTag: "org_admin",
    title: built.title,
    message: built.message,
    routeUrl: "/admin/hardware",
    source: HARDWARE_PROCESS_ALERT_SOURCE,
    sourceId: selection.dateKey,
    payload: {
      dateKey: selection.dateKey,
      stalePlannedCount: selection.stalePlannedCount,
      overdueSampleCount: selection.overdueSampleCount,
      ownerCount: selection.groups.length,
      omittedItems: built.omittedItems,
      sampleCheckAvailable: selection.sampleCheckAvailable,
    },
    channels: ["wecom_webhook"],
    // 크론 결과가 실제 발송 여부를 말하게 한다 — 방이 꺼져 있거나 HTTP 실패면 잡이 failed 가 된다.
    requireSuccessfulDelivery: true,
  })

  return { ...base, status: "sent", eventId: event.id == null ? null : String(event.id) }
}
