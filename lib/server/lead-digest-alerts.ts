import "server-only"

import { isTestLead } from "@/lib/crm/lead-attribution"
import { tallyLeadInflow } from "@/lib/crm/lead-reinflow"
import { summarizeLeadResponseStatus } from "@/lib/crm/lead-response-status"
import { DIRECT_INBOUND_LEAD_SOURCES, INTAKE_LEAD_SOURCES } from "@/lib/lead-types"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import {
  getConversations,
  type ChannelConversationRecord,
} from "@/lib/repositories/channel-conversations"
import { getLeads, type LeadRecord } from "@/lib/repositories/leads"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 기간 유입 축은 생성 시각 또는 재문의 시각(last_inflow_at)이다(2026-09-21) — 이 소스들의 재문의는 새 행 대신
// 기존 행에 병합되므로(lib/server/lead-capture.ts) 생성 시각만 보면 재문의가 빠진다. 아침 카드
// (lib/server/lead-morning-brief.ts)와 같은 규칙(lib/crm/lead-reinflow.ts tallyLeadInflow)으로 세고 신규/재유입을 가른다.
const TARGET_SOURCES = DIRECT_INBOUND_LEAD_SOURCES
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export type LeadDigestPeriod = "weekly" | "monthly"

export interface LeadDigestAlertResult {
  period: LeadDigestPeriod
  periodLabel: string
  previousPeriodLabel: string
  /** 기간 유입 리드 = 신규 + 재유입. 한 리드는 한 번만(생성과 재문의가 모두 기간 안이면 신규). */
  totalLeads: number
  /** 기간 안에 생성된 리드. */
  newLeadCount: number
  /** 기간 밖에 생성됐고 기간 안에 재문의(last_inflow_at)한 리드. */
  reinflowLeadCount: number
  totalInboundCount: number
  previousTotalLeads: number
  deltaLeads: number
  contactPageLeadCount: number
  demoModalLeadCount: number
  /** 쇼룸 예약 + 도입 신청. 전용 source 로 갈린 뒤로 문의 건수에서 빠지므로 따로 센다. */
  intakeLeadCount: number
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
  return TARGET_SOURCES.has(lead.source) && !isTestLead(lead)
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
  newLeadCount: number
  reinflowLeadCount: number
  totalInboundCount: number
  deltaLeads: number
  contactPageLeadCount: number
  demoModalLeadCount: number
  intakeLeadCount: number
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
    `홈페이지 문의 ${input.contactPageLeadCount}개 / 데모 신청 ${input.demoModalLeadCount}개 / 접수 ${input.intakeLeadCount}개 / Meta ${input.metaLeadAdsLeadCount}개`,
    // 재문의(재유입)가 섞였을 때만 리드 합계를 가른다 — 없으면 예전 문구 그대로(전부 신규다).
    input.reinflowLeadCount > 0
      ? `리드 ${input.totalLeads}개 — 신규 ${input.newLeadCount}개 · 재유입 ${input.reinflowLeadCount}개`
      : null,
    `채널톡 문의 ${input.channelTalkInquiryCount}개 / 열린 상담 ${input.channelTalkOpenCount}개 / CRM 매칭 ${input.channelTalkMatchedLeadCount}개`,
    `챗봇→채널톡 넘김 ${input.chatbotHandoffSentCount}개 / 전체 ${input.chatbotHandoffCount}개`,
    `${input.previousLabel} ${formatDelta(input.deltaLeads)}개`,
    `미응답 ${input.unrespondedCount}개 / 24시간 초과 ${input.over24h}개 / 48시간 초과 ${input.over48h}개`,
    `상담 진행 ${input.contactedCount}개 / 전환 ${input.convertedCount}개 / 종료 ${input.closedCount}개`,
    `주요 경로: ${input.topSourceLabel} (${input.topSourceCount}개)`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n")
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
  // 기간마다 반열린 창 [start, end) 로 유입 축(생성 또는 재문의)을 센다 — 직전 기간도 같은 축이라 델타가 맞선다.
  const periodInflow = tallyLeadInflow(leads, range.start.getTime(), range.end.getTime())
  const previousInflow = tallyLeadInflow(
    leads,
    range.previousStart.getTime(),
    range.previousEnd.getTime()
  )
  const periodLeads = periodInflow.leads
  const previousPeriodLeads = previousInflow.leads
  const unrespondedLeads = periodLeads.filter((lead) => lead.status === "new")
  // 방치 시간은 최신 유입부터 잰다(lib/crm/lead-response-status.ts 와 같은 규칙) — 몇 달 전 첫 문의 때문에
  // 방금 재문의한 리드가 곧장 48시간 초과로 뜨지 않게. 재문의가 없는 리드는 예전처럼 생성 시각이다.
  const responseStatus = summarizeLeadResponseStatus(unrespondedLeads, now)
  const channelTalkStats = getChannelTalkPeriodStats(range)
  const chatbotHandoffStats = await getChatbotHandoffPeriodStats(range)
  const topSource = getTopSource(periodLeads)
  const title = period === "weekly" ? "주간 리드 리포트" : "월간 리드 리포트"
  const previousLabel = period === "weekly" ? "전주 대비" : "전월 대비"
  const contactPageLeadCount = periodLeads.filter((lead) => lead.source === "contact_page").length
  const demoModalLeadCount = periodLeads.filter((lead) => lead.source === "demo_modal").length
  const intakeLeadCount = periodLeads.filter((lead) =>
    INTAKE_LEAD_SOURCES.has(lead.source)
  ).length
  const metaLeadAdsLeadCount = periodLeads.filter((lead) => lead.source === "meta_lead_ads").length

  const result = {
    period,
    periodLabel,
    previousPeriodLabel,
    totalLeads: periodLeads.length,
    newLeadCount: periodInflow.newCount,
    reinflowLeadCount: periodInflow.reinflowCount,
    totalInboundCount: periodLeads.length + channelTalkStats.total,
    previousTotalLeads: previousPeriodLeads.length,
    deltaLeads: periodLeads.length - previousPeriodLeads.length,
    contactPageLeadCount,
    demoModalLeadCount,
    intakeLeadCount,
    metaLeadAdsLeadCount,
    contactedCount: periodLeads.filter((lead) => lead.status === "contacted").length,
    convertedCount: periodLeads.filter((lead) => lead.status === "converted").length,
    closedCount: periodLeads.filter((lead) => lead.status === "closed").length,
    unrespondedCount: unrespondedLeads.length,
    over24h: responseStatus.over24hCount,
    over48h: responseStatus.over48hCount,
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
