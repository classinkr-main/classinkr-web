import "server-only"

import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import { getLeads, type LeadRecord } from "@/lib/repositories/leads"

const TARGET_SOURCES = new Set(["contact_page", "demo_modal", "meta_lead_ads"])
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export type LeadDigestPeriod = "weekly" | "monthly"

export interface LeadDigestAlertResult {
  period: LeadDigestPeriod
  periodLabel: string
  previousPeriodLabel: string
  totalLeads: number
  previousTotalLeads: number
  deltaLeads: number
  contactedCount: number
  convertedCount: number
  closedCount: number
  unrespondedCount: number
  over24h: number
  over48h: number
  unassignedCount: number
  topSourceLabel: string
  topSourceCount: number
  eventId: string
}

interface PeriodRange {
  start: Date
  end: Date
  previousStart: Date
  previousEnd: Date
}

function isTargetLead(lead: LeadRecord) {
  return TARGET_SOURCES.has(lead.source)
}

function getKstParts(date: Date) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  }
}

function kstDateToUtcMs(year: number, monthIndex: number, day: number) {
  return Date.UTC(year, monthIndex, day) - KST_OFFSET_MS
}

function getKstDayStartMs(date: Date) {
  const parts = getKstParts(date)
  return kstDateToUtcMs(parts.year, parts.monthIndex, parts.day)
}

function getPeriodRange(period: LeadDigestPeriod, now: Date): PeriodRange {
  if (period === "weekly") {
    const todayStartMs = getKstDayStartMs(now)
    const weekday = getKstParts(now).weekday
    const daysSinceMonday = (weekday + 6) % 7
    const currentWeekStartMs = todayStartMs - daysSinceMonday * DAY_MS
    const startMs = currentWeekStartMs - 7 * DAY_MS

    return {
      start: new Date(startMs),
      end: new Date(currentWeekStartMs),
      previousStart: new Date(startMs - 7 * DAY_MS),
      previousEnd: new Date(startMs),
    }
  }

  const parts = getKstParts(now)
  const currentMonthStartMs = kstDateToUtcMs(parts.year, parts.monthIndex, 1)
  const startMs = kstDateToUtcMs(parts.year, parts.monthIndex - 1, 1)

  return {
    start: new Date(startMs),
    end: new Date(currentMonthStartMs),
    previousStart: new Date(kstDateToUtcMs(parts.year, parts.monthIndex - 2, 1)),
    previousEnd: new Date(startMs),
  }
}

function formatKstDate(date: Date) {
  const parts = getKstParts(date)
  const month = String(parts.monthIndex + 1).padStart(2, "0")
  const day = String(parts.day).padStart(2, "0")
  return `${parts.year}.${month}.${day}`
}

function formatPeriodLabel(start: Date, end: Date) {
  return `${formatKstDate(start)} - ${formatKstDate(new Date(end.getTime() - DAY_MS))}`
}

function isLeadInRange(lead: LeadRecord, start: Date, end: Date) {
  const timestamp = new Date(lead.timestamp).getTime()
  return (
    Number.isFinite(timestamp) &&
    timestamp >= start.getTime() &&
    timestamp < end.getTime()
  )
}

function hoursSince(value: string | Date, now: Date) {
  const startedAt = value instanceof Date ? value : new Date(value)
  const diff = now.getTime() - startedAt.getTime()
  return Math.max(0, Math.floor(diff / HOUR_MS))
}

function getSourceLabel(source: string) {
  if (source === "meta_lead_ads") return "Meta 광고"
  return "홈페이지"
}

function getTopSource(leads: LeadRecord[]) {
  const counts = new Map<string, number>()

  for (const lead of leads) {
    const label = getSourceLabel(lead.source)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return {
    label: top?.[0] ?? "없음",
    count: top?.[1] ?? 0,
  }
}

function formatDelta(delta: number) {
  if (delta === 0) return "0"
  return delta > 0 ? `+${delta}` : String(delta)
}

function buildDigestMessage(input: {
  periodLabel: string
  previousLabel: string
  totalLeads: number
  deltaLeads: number
  unrespondedCount: number
  over24h: number
  over48h: number
  contactedCount: number
  convertedCount: number
  closedCount: number
  topSourceLabel: string
  topSourceCount: number
}) {
  return [
    `${input.periodLabel} 신규 리드 ${input.totalLeads}개`,
    `${input.previousLabel} ${formatDelta(input.deltaLeads)}개`,
    `미응답 ${input.unrespondedCount}개 / 24시간 초과 ${input.over24h}개 / 48시간 초과 ${input.over48h}개`,
    `상담 진행 ${input.contactedCount}개 / 전환 ${input.convertedCount}개 / 종료 ${input.closedCount}개`,
    `주요 경로: ${input.topSourceLabel} (${input.topSourceCount}개)`,
  ].join("\n")
}

export async function sendLeadDigestAlert(
  period: LeadDigestPeriod,
  now = new Date()
): Promise<LeadDigestAlertResult> {
  const range = getPeriodRange(period, now)
  const periodLabel = formatPeriodLabel(range.start, range.end)
  const previousPeriodLabel = formatPeriodLabel(range.previousStart, range.previousEnd)
  const leads = (await getLeads()).filter(isTargetLead)
  const periodLeads = leads.filter((lead) => isLeadInRange(lead, range.start, range.end))
  const previousPeriodLeads = leads.filter((lead) =>
    isLeadInRange(lead, range.previousStart, range.previousEnd)
  )
  const unrespondedLeads = periodLeads.filter((lead) => lead.status === "new")
  const topSource = getTopSource(periodLeads)
  const title = period === "weekly" ? "주간 리드 리포트" : "월간 리드 리포트"
  const previousLabel = period === "weekly" ? "전주 대비" : "전월 대비"

  const result = {
    period,
    periodLabel,
    previousPeriodLabel,
    totalLeads: periodLeads.length,
    previousTotalLeads: previousPeriodLeads.length,
    deltaLeads: periodLeads.length - previousPeriodLeads.length,
    contactedCount: periodLeads.filter((lead) => lead.status === "contacted").length,
    convertedCount: periodLeads.filter((lead) => lead.status === "converted").length,
    closedCount: periodLeads.filter((lead) => lead.status === "closed").length,
    unrespondedCount: unrespondedLeads.length,
    over24h: unrespondedLeads.filter((lead) => hoursSince(lead.timestamp, now) >= 24).length,
    over48h: unrespondedLeads.filter((lead) => hoursSince(lead.timestamp, now) >= 48).length,
    unassignedCount: periodLeads.filter((lead) => !lead.assigned_to?.trim()).length,
    topSourceLabel: topSource.label,
    topSourceCount: topSource.count,
  }

  const event = await emitNotificationEvent({
    eventType: `lead.digest.${period}`,
    notificationType: "digest",
    categoryTag: "lead",
    severity: "info",
    scopeTag: "org_admin",
    title,
    message: buildDigestMessage({
      ...result,
      previousLabel,
    }),
    routeUrl: "/admin/crm",
    source: "lead",
    sourceId: `digest:${period}:${range.start.toISOString()}`,
    payload: {
      ...result,
      previousLabel,
      rangeStart: range.start.toISOString(),
      rangeEnd: range.end.toISOString(),
      previousRangeStart: range.previousStart.toISOString(),
      previousRangeEnd: range.previousEnd.toISOString(),
    },
    channels: ["wecom_webhook"],
  })

  return {
    ...result,
    eventId: String(event.id),
  }
}
