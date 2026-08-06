import "server-only"

import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import {
  getConversations,
  type ChannelConversationRecord,
} from "@/lib/repositories/channel-conversations"
import { getLeads, type LeadRecord } from "@/lib/repositories/leads"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

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
  totalInboundCount: number
  previousTotalLeads: number
  deltaLeads: number
  contactPageLeadCount: number
  demoModalLeadCount: number
  metaLeadAdsLeadCount: number
  contactedCount: number
  convertedCount: number
  closedCount: number
  unrespondedCount: number
  over24h: number
  over48h: number
  unassignedCount: number
  channelTalkInquiryCount: number
  channelTalkOpenCount: number
  channelTalkMatchedLeadCount: number
  chatbotHandoffCount: number
  chatbotHandoffSentCount: number
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
  if (source === "demo_modal") return "데모 신청"
  return "홈페이지 문의"
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
  totalInboundCount: number
  deltaLeads: number
  contactPageLeadCount: number
  demoModalLeadCount: number
  metaLeadAdsLeadCount: number
  unrespondedCount: number
  over24h: number
  over48h: number
  contactedCount: number
  convertedCount: number
  closedCount: number
  channelTalkInquiryCount: number
  channelTalkOpenCount: number
  channelTalkMatchedLeadCount: number
  chatbotHandoffCount: number
  chatbotHandoffSentCount: number
  topSourceLabel: string
  topSourceCount: number
}) {
  return [
    `${input.periodLabel} 유효 인바운드 ${input.totalInboundCount}개`,
    `홈페이지 문의 ${input.contactPageLeadCount}개 / 데모 신청 ${input.demoModalLeadCount}개 / Meta ${input.metaLeadAdsLeadCount}개`,
    `채널톡 문의 ${input.channelTalkInquiryCount}개 / 열린 상담 ${input.channelTalkOpenCount}개 / CRM 매칭 ${input.channelTalkMatchedLeadCount}개`,
    `챗봇→채널톡 넘김 ${input.chatbotHandoffSentCount}개 / 전체 ${input.chatbotHandoffCount}개`,
    `${input.previousLabel} ${formatDelta(input.deltaLeads)}개`,
    `미응답 ${input.unrespondedCount}개 / 24시간 초과 ${input.over24h}개 / 48시간 초과 ${input.over48h}개`,
    `상담 진행 ${input.contactedCount}개 / 전환 ${input.convertedCount}개 / 종료 ${input.closedCount}개`,
    `주요 경로: ${input.topSourceLabel} (${input.topSourceCount}개)`,
  ].join("\n")
}

function hasSupabaseServerEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() &&
      (process.env.SUPABASE_SECRET_KEY?.trim() ||
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  )
}

function getValidTimestamp(value?: string) {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function getConversationStartedAt(conversation: ChannelConversationRecord) {
  return getValidTimestamp(conversation.firstAskedAt) ??
    getValidTimestamp(conversation.lastMessageAt)
}

function getChannelTalkPeriodStats(range: Pick<PeriodRange, "start" | "end">) {
  const startMs = range.start.getTime()
  const endMs = range.end.getTime()
  const conversations = getConversations().filter((conversation) => {
    const startedAt = getConversationStartedAt(conversation)
    return startedAt != null && startedAt >= startMs && startedAt < endMs
  })

  return {
    total: conversations.length,
    open: conversations.filter((conversation) => conversation.state === "opened").length,
    matchedLeads: conversations.filter((conversation) => conversation.matchedLeadId).length,
  }
}

async function getChatbotHandoffPeriodStats(range: Pick<PeriodRange, "start" | "end">) {
  if (!hasSupabaseServerEnv()) {
    return { total: 0, sent: 0 }
  }

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from("chatbot_channel_handoffs")
      .select("status")
      .gte("created_at", range.start.toISOString())
      .lt("created_at", range.end.toISOString())

    if (error) throw error

    return {
      total: data?.length ?? 0,
      sent: (data ?? []).filter((row) => row.status === "sent").length,
    }
  } catch (error) {
    console.warn(
      "[lead-digest-alerts] chatbot handoff stats unavailable:",
      error instanceof Error ? error.message : error
    )
    return { total: 0, sent: 0 }
  }
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
  const channelTalkStats = getChannelTalkPeriodStats(range)
  const chatbotHandoffStats = await getChatbotHandoffPeriodStats(range)
  const topSource = getTopSource(periodLeads)
  const title = period === "weekly" ? "주간 리드 리포트" : "월간 리드 리포트"
  const previousLabel = period === "weekly" ? "전주 대비" : "전월 대비"
  const contactPageLeadCount = periodLeads.filter((lead) => lead.source === "contact_page").length
  const demoModalLeadCount = periodLeads.filter((lead) => lead.source === "demo_modal").length
  const metaLeadAdsLeadCount = periodLeads.filter((lead) => lead.source === "meta_lead_ads").length

  const result = {
    period,
    periodLabel,
    previousPeriodLabel,
    totalLeads: periodLeads.length,
    totalInboundCount: periodLeads.length + channelTalkStats.total,
    previousTotalLeads: previousPeriodLeads.length,
    deltaLeads: periodLeads.length - previousPeriodLeads.length,
    contactPageLeadCount,
    demoModalLeadCount,
    metaLeadAdsLeadCount,
    contactedCount: periodLeads.filter((lead) => lead.status === "contacted").length,
    convertedCount: periodLeads.filter((lead) => lead.status === "converted").length,
    closedCount: periodLeads.filter((lead) => lead.status === "closed").length,
    unrespondedCount: unrespondedLeads.length,
    over24h: unrespondedLeads.filter((lead) => hoursSince(lead.timestamp, now) >= 24).length,
    over48h: unrespondedLeads.filter((lead) => hoursSince(lead.timestamp, now) >= 48).length,
    unassignedCount: periodLeads.filter((lead) => !lead.assigned_to?.trim()).length,
    channelTalkInquiryCount: channelTalkStats.total,
    channelTalkOpenCount: channelTalkStats.open,
    channelTalkMatchedLeadCount: channelTalkStats.matchedLeads,
    chatbotHandoffCount: chatbotHandoffStats.total,
    chatbotHandoffSentCount: chatbotHandoffStats.sent,
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
    channels: ["wecom_lead_report_webhook"],
  })

  return {
    ...result,
    eventId: String(event.id),
  }
}
