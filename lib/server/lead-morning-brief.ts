import "server-only"

import { getMetaAdInfo, isTestLead } from "@/lib/crm/lead-attribution"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import {
  claimLeadDigestRun,
  markLeadDigestRunFailed,
  markLeadDigestRunSent,
  type LeadDigestReportType,
} from "@/lib/repositories/lead-digest-runs"
import { getLeads, type LeadRecord } from "@/lib/repositories/leads"

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const REPORT_HOUR_KST = 10
const REPORT_MINUTE_KST = 10

export interface LeadMorningWindow {
  start: Date
  end: Date
}

export interface LeadMorningBriefMetrics {
  periodLabel: string
  totalLeads: number
  contactPageLeadCount: number
  demoModalLeadCount: number
  metaLeadAdsLeadCount: number
  metaAttributedWebsiteLeadCount: number
  unrespondedCount: number
  contactedCount: number
  convertedCount: number
  topCampaignLabel: string
  topCampaignCount: number
}

export type LeadMorningBriefResult =
  | ({
      status: "sent"
      reportType: LeadDigestReportType
      runId: string
      eventId: string
      windowStart: string
      windowEnd: string
    } & LeadMorningBriefMetrics)
  | {
      status: "skipped"
      reportType: LeadDigestReportType
      runId: string
      reason: "already_sent" | "already_running"
      windowStart: string
      windowEnd: string
    }

function kstWallClockToUtcMs(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number
) {
  return Date.UTC(year, monthIndex, day, hour, minute) - KST_OFFSET_MS
}

export function getLeadMorningWindow(now = new Date()): LeadMorningWindow {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS)
  let endMs = kstWallClockToUtcMs(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    REPORT_HOUR_KST,
    REPORT_MINUTE_KST
  )

  // 수동 실행이 10:10보다 이르면 아직 닫히지 않은 오늘 구간 대신 마지막 완료 구간을 쓴다.
  if (now.getTime() < endMs) endMs -= DAY_MS

  return {
    start: new Date(endMs - DAY_MS),
    end: new Date(endMs),
  }
}

function formatKstDateTime(date: Date) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS)
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const day = String(shifted.getUTCDate()).padStart(2, "0")
  const hour = String(shifted.getUTCHours()).padStart(2, "0")
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0")
  return `${month}.${day} ${hour}:${minute}`
}

function inRange(lead: LeadRecord, start: Date, end: Date) {
  const timestamp = new Date(lead.timestamp).getTime()
  return (
    Number.isFinite(timestamp) &&
    timestamp >= start.getTime() &&
    timestamp < end.getTime()
  )
}

function belongsToReport(lead: LeadRecord, reportType: LeadDigestReportType) {
  if (reportType === "meta") return lead.source === "meta_lead_ads"
  return lead.source === "contact_page" || lead.source === "demo_modal"
}

function isMetaAttributedWebsiteLead(lead: LeadRecord) {
  if (lead.source !== "contact_page" && lead.source !== "demo_modal") return false
  if (lead.fbclid?.trim()) return true

  const source = lead.utm_source?.trim().toLowerCase()
  return source === "meta" || source === "facebook" || source === "instagram"
}

function topValue(values: Array<string | undefined>) {
  const counts = new Map<string, number>()
  for (const raw of values) {
    const value = raw?.trim()
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  const [top] = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")
  )
  return { label: top?.[0] ?? "없음", count: top?.[1] ?? 0 }
}

function buildMetrics(
  reportType: LeadDigestReportType,
  leads: LeadRecord[],
  window: LeadMorningWindow
): LeadMorningBriefMetrics {
  const reportLeads = leads.filter((lead) => belongsToReport(lead, reportType))
  const current = reportLeads.filter(
    (lead) => inRange(lead, window.start, window.end) && !isTestLead(lead)
  )
  const metaInfo = current
    .map((lead) => getMetaAdInfo(lead))
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
  const topCampaign = topValue(metaInfo.map((info) => info.campaign))

  return {
    periodLabel: `${formatKstDateTime(window.start)} - ${formatKstDateTime(window.end)}`,
    totalLeads: current.length,
    contactPageLeadCount: current.filter((lead) => lead.source === "contact_page").length,
    demoModalLeadCount: current.filter((lead) => lead.source === "demo_modal").length,
    metaLeadAdsLeadCount: current.filter((lead) => lead.source === "meta_lead_ads").length,
    metaAttributedWebsiteLeadCount: current.filter(isMetaAttributedWebsiteLead).length,
    unrespondedCount: current.filter((lead) => lead.status === "new").length,
    contactedCount: current.filter((lead) => lead.status === "contacted").length,
    convertedCount: current.filter((lead) => lead.status === "converted").length,
    topCampaignLabel: topCampaign.label,
    topCampaignCount: topCampaign.count,
  }
}

function buildMessage(reportType: LeadDigestReportType, metrics: LeadMorningBriefMetrics) {
  const common = [
    `${metrics.periodLabel} 전체 접수 ${metrics.totalLeads}건`,
    `미응대 ${metrics.unrespondedCount}건`,
    `상담 진행 ${metrics.contactedCount}건 / 전환 ${metrics.convertedCount}건`,
  ]

  if (reportType === "meta") {
    return [
      ...common,
      `주요 캠페인 ${metrics.topCampaignLabel} (${metrics.topCampaignCount}건)`,
    ].join("\n")
  }

  return [
    ...common,
    `홈페이지 문의 ${metrics.contactPageLeadCount}건 / 데모 신청 ${metrics.demoModalLeadCount}건`,
    `Meta 광고 경유 ${metrics.metaAttributedWebsiteLeadCount}건`,
  ].join("\n")
}

export async function sendLeadMorningBrief(
  reportType: LeadDigestReportType,
  now = new Date()
): Promise<LeadMorningBriefResult> {
  const window = getLeadMorningWindow(now)
  const claim = await claimLeadDigestRun({
    reportType,
    windowStart: window.start,
    windowEnd: window.end,
    now,
  })

  if (!claim.claimed) {
    return {
      status: "skipped",
      reportType,
      runId: claim.run.id,
      reason: claim.run.status === "sent" ? "already_sent" : "already_running",
      windowStart: window.start.toISOString(),
      windowEnd: window.end.toISOString(),
    }
  }

  try {
    const metrics = buildMetrics(reportType, await getLeads(), window)
    const event = await emitNotificationEvent({
      eventType: `lead.digest.daily.${reportType}`,
      notificationType: "digest",
      categoryTag: "lead",
      severity: "info",
      scopeTag: "org_admin",
      title:
        reportType === "meta"
          ? "Meta 광고 리드 · 일일 리포트"
          : "홈페이지 리드 · 아침 공지",
      message: buildMessage(reportType, metrics),
      routeUrl:
        reportType === "meta"
          ? "/admin/crm/customers/leads?source=meta_lead_ads"
          : "/admin/crm/customers/leads",
      source: "lead",
      sourceId: `digest:daily:${reportType}:${window.end.toISOString()}`,
      payload: {
        reportType,
        period: "daily",
        ...metrics,
        rangeStart: window.start.toISOString(),
        rangeEnd: window.end.toISOString(),
      },
      channels: ["wecom_lead_report_webhook"],
      requireSuccessfulDelivery: true,
    })

    await markLeadDigestRunSent({
      runId: claim.run.id,
      notificationEventId: String(event.id),
    })

    return {
      status: "sent",
      reportType,
      runId: claim.run.id,
      eventId: String(event.id),
      windowStart: window.start.toISOString(),
      windowEnd: window.end.toISOString(),
      ...metrics,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      await markLeadDigestRunFailed({ runId: claim.run.id, error: message })
    } catch (stateError) {
      console.error("[lead-morning-brief] failed to persist failure state:", stateError)
    }
    throw error
  }
}
