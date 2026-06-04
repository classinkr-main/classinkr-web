import "server-only"

import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import {
  getLeadAlertState,
  markLeadAlertSent,
  type LeadAlertScope,
} from "@/lib/repositories/lead-alert-states"
import { getLeads, type LeadRecord } from "@/lib/repositories/leads"

const TARGET_SOURCES = new Set(["contact_page", "demo_modal", "meta_lead_ads"])
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const AGGREGATE_COOLDOWN_MS = DAY_MS

type LeadResponseAlertKey =
  | "unresponded_24h"
  | "unresponded_48h"
  | "unresponded_count_3"
  | "unresponded_count_5"

export interface LeadResponseAlertScanResult {
  scanned: number
  unresponded: number
  sent: number
  skipped: number
  errors: string[]
  thresholds: {
    over24h: number
    over48h: number
    over3Count: boolean
    over5Count: boolean
  }
}

function isTargetLead(lead: LeadRecord) {
  return TARGET_SOURCES.has(lead.source)
}

function isUnrespondedLead(lead: LeadRecord) {
  return lead.status === "new" && isTargetLead(lead)
}

function hoursSince(value: string | Date, now = new Date()) {
  const startedAt = value instanceof Date ? value : new Date(value)
  const diff = now.getTime() - startedAt.getTime()
  return Math.max(0, Math.floor(diff / HOUR_MS))
}

function formatLeadName(lead: LeadRecord) {
  return lead.org ?? lead.name ?? lead.email ?? lead.phone ?? "이름 없음"
}

function formatLeadLine(lead: LeadRecord, now: Date) {
  const ageHours = hoursSince(lead.timestamp, now)
  const owner = lead.assigned_to?.trim() || "미배정"
  return `- ${formatLeadName(lead)} / ${owner} / ${ageHours}시간 경과`
}

function getOldestLeads(leads: LeadRecord[], now: Date, limit = 5) {
  return [...leads]
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
    .slice(0, limit)
    .map((lead) => formatLeadLine(lead, now))
    .join("\n")
}

async function shouldSendAlert(input: {
  scope: LeadAlertScope
  subjectId: string
  alertKey: LeadResponseAlertKey
  cooldownMs?: number
}) {
  const state = await getLeadAlertState(input)
  if (!state) return true
  if (!input.cooldownMs) return false

  return Date.now() - new Date(state.lastSentAt).getTime() >= input.cooldownMs
}

async function sendLeadAgeAlert(lead: LeadRecord, alertKey: LeadResponseAlertKey, now: Date) {
  const ageHours = hoursSince(lead.timestamp, now)
  const isCritical = alertKey === "unresponded_48h"
  const thresholdLabel = isCritical ? "48시간" : "24시간"

  await emitNotificationEvent({
    eventType: `lead.${alertKey}`,
    notificationType: isCritical ? "incident" : "warning",
    categoryTag: "lead",
    severity: isCritical ? "critical" : "warning",
    scopeTag: isCritical ? "critical_control" : "org_admin",
    title: `미응대 리드 ${thresholdLabel} 초과`,
    message: [
      `${formatLeadName(lead)} 리드가 ${ageHours}시간째 신규 상태입니다.`,
      `담당자: ${lead.assigned_to?.trim() || "미배정"}`,
      `경로: ${lead.source}`,
    ].join("\n"),
    routeUrl: "/admin/crm",
    source: "lead",
    sourceId: lead.id,
    payload: {
      leadId: lead.id,
      alertKey,
      ageHours,
      source: lead.source,
      name: lead.name,
      org: lead.org,
      assignedTo: lead.assigned_to,
      createdAt: lead.timestamp,
    },
    channels: ["wecom_webhook"],
  })

  await markLeadAlertSent({
    scope: "lead",
    subjectId: lead.id,
    alertKey,
    metadata: {
      ageHours,
      source: lead.source,
      createdAt: lead.timestamp,
    },
  })
}

async function sendAggregateAlert(
  unrespondedLeads: LeadRecord[],
  alertKey: LeadResponseAlertKey,
  now: Date
) {
  const isCritical = alertKey === "unresponded_count_5"
  const threshold = isCritical ? 5 : 3
  const over24h = unrespondedLeads.filter(
    (lead) => hoursSince(lead.timestamp, now) >= 24
  ).length
  const over48h = unrespondedLeads.filter(
    (lead) => hoursSince(lead.timestamp, now) >= 48
  ).length

  await emitNotificationEvent({
    eventType: `lead.${alertKey}`,
    notificationType: isCritical ? "incident" : "warning",
    categoryTag: "lead",
    severity: isCritical ? "critical" : "warning",
    scopeTag: isCritical ? "critical_control" : "org_admin",
    title: `미응대 리드 ${threshold}건 이상`,
    message: [
      `현재 미응대 리드가 ${unrespondedLeads.length}건입니다.`,
      `24시간 초과: ${over24h}건 / 48시간 초과: ${over48h}건`,
      "오래된 리드:",
      getOldestLeads(unrespondedLeads, now),
    ].join("\n"),
    routeUrl: "/admin/crm",
    source: "lead",
    sourceId: "unresponded",
    payload: {
      alertKey,
      threshold,
      unrespondedCount: unrespondedLeads.length,
      over24h,
      over48h,
      leadIds: unrespondedLeads.map((lead) => lead.id),
    },
    channels: ["wecom_webhook"],
  })

  await markLeadAlertSent({
    scope: "aggregate",
    subjectId: "unresponded",
    alertKey,
    lastCount: unrespondedLeads.length,
    metadata: {
      threshold,
      over24h,
      over48h,
    },
  })
}

export async function scanLeadResponseAlerts(): Promise<LeadResponseAlertScanResult> {
  const now = new Date()
  const leads = await getLeads()
  const unrespondedLeads = leads.filter(isUnrespondedLead)
  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const lead of unrespondedLeads) {
    const ageHours = hoursSince(lead.timestamp, now)
    const alertKey: LeadResponseAlertKey | null =
      ageHours >= 48 ? "unresponded_48h" : ageHours >= 24 ? "unresponded_24h" : null

    if (!alertKey) {
      skipped += 1
      continue
    }

    try {
      const shouldSend = await shouldSendAlert({
        scope: "lead",
        subjectId: lead.id,
        alertKey,
      })

      if (!shouldSend) {
        skipped += 1
        continue
      }

      await sendLeadAgeAlert(lead, alertKey, now)
      sent += 1
    } catch (error) {
      errors.push(
        `[${lead.id}] ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  const aggregateKey: LeadResponseAlertKey | null =
    unrespondedLeads.length >= 5
      ? "unresponded_count_5"
      : unrespondedLeads.length >= 3
        ? "unresponded_count_3"
        : null

  if (aggregateKey) {
    try {
      const shouldSend = await shouldSendAlert({
        scope: "aggregate",
        subjectId: "unresponded",
        alertKey: aggregateKey,
        cooldownMs: AGGREGATE_COOLDOWN_MS,
      })

      if (shouldSend) {
        await sendAggregateAlert(unrespondedLeads, aggregateKey, now)
        sent += 1
      } else {
        skipped += 1
      }
    } catch (error) {
      errors.push(
        `[aggregate] ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return {
    scanned: leads.length,
    unresponded: unrespondedLeads.length,
    sent,
    skipped,
    errors,
    thresholds: {
      over24h: unrespondedLeads.filter((lead) => hoursSince(lead.timestamp, now) >= 24).length,
      over48h: unrespondedLeads.filter((lead) => hoursSince(lead.timestamp, now) >= 48).length,
      over3Count: unrespondedLeads.length >= 3,
      over5Count: unrespondedLeads.length >= 5,
    },
  }
}
