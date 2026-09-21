import "server-only"

import { getMetaAdInfo, isTestLead } from "@/lib/crm/lead-attribution"
import {
  DIRECT_INBOUND_LEAD_SOURCES,
  INTAKE_LEAD_SOURCES,
  WEBSITE_FORM_LEAD_SOURCES,
} from "@/lib/lead-types"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import {
  DEFAULT_NOTIFICATION_SCHEDULE,
  type LeadDailySchedule,
} from "@/lib/notifications/schedule"
import {
  claimLeadDigestRun,
  markLeadDigestRunFailed,
  markLeadDigestRunSent,
  type LeadDigestReportType,
} from "@/lib/repositories/lead-digest-runs"
import { getLeads, type LeadRecord } from "@/lib/repositories/leads"
import { getResolvedSettings } from "@/lib/repositories/settings"

// 아침 카드가 세는 유입 세 갈래. 세 갈래 사이에 겹침이 없어 합계가 곧 전체 접수다
// ("Meta 광고 경유"는 홈페이지 유입의 부분집합이라 합계에 다시 더하지 않는다).
const REPORT_SOURCES = DIRECT_INBOUND_LEAD_SOURCES
// 카드 한 장 = 창 하나 = 실행 레코드 한 줄.
const DAILY_REPORT_TYPE: LeadDigestReportType = "daily"
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
// 발송 시각은 운영자가 설정 화면에서 바꾼다(lib/notifications/schedule.ts).
// 기본값은 2026-09-07 이전 고정 상수(10:10 KST)와 같은 값이라, 스케줄을
// 넘기지 않는 호출부는 예전 그대로 동작한다.
const DEFAULT_SCHEDULE = DEFAULT_NOTIFICATION_SCHEDULE.leadDaily

async function resolveLeadDailySchedule(): Promise<LeadDailySchedule> {
  const settings = await getResolvedSettings()
  return settings.notificationSchedule?.leadDaily ?? DEFAULT_SCHEDULE
}

export interface LeadMorningWindow {
  start: Date
  end: Date
}

export interface LeadMorningBriefMetrics {
  periodLabel: string
  totalLeads: number
  metaLeadAdsLeadCount: number
  topCampaignLabel: string
  topCampaignCount: number
  /** 홈페이지 유입 합계 — 문의 + 데모 신청 + 접수. 카드에서 Meta 아래 서브 요소로 붙는다. */
  homepageLeadCount: number
  contactPageLeadCount: number
  demoModalLeadCount: number
  /** 쇼룸 예약 + 도입 신청. 방문·주문을 실제로 잡은 건이라 문의와 따로 센다. */
  intakeLeadCount: number
  metaAttributedWebsiteLeadCount: number
  unrespondedCount: number
  contactedCount: number
  convertedCount: number
}

export type LeadMorningBriefResult =
  | ({
      status: "sent"
      runId: string
      eventId: string
      windowStart: string
      windowEnd: string
    } & LeadMorningBriefMetrics)
  | {
      status: "skipped"
      runId: string
      reason: "already_sent" | "already_running"
      windowStart: string
      windowEnd: string
    }
  | {
      status: "skipped"
      reason: "weekend"
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

/**
 * 발송 시점(KST)이 토·일인지. 일일 보고는 주말에 내보내지 않는다 —
 * 크론은 그대로 돌지만 여기서 멈춰 위컴 카드가 주말에 도착하지 않게 한다. (2026-09-07)
 * 월요일 발송은 그대로라 일요일 구간은 다음 영업일 보고에 담긴다.
 */
export function isLeadMorningWeekend(now = new Date()) {
  const weekday = new Date(now.getTime() + KST_OFFSET_MS).getUTCDay()
  return weekday === 0 || weekday === 6
}

export function getLeadMorningWindow(
  now = new Date(),
  schedule: LeadDailySchedule = DEFAULT_SCHEDULE
): LeadMorningWindow {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS)
  let endMs = kstWallClockToUtcMs(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    schedule.windowEndHourKst,
    schedule.windowEndMinuteKst
  )

  // 수동 실행이 창 끝보다 이르면 아직 닫히지 않은 오늘 구간 대신 마지막 완료 구간을 쓴다.
  if (now.getTime() < endMs) endMs -= DAY_MS

  return {
    start: new Date(endMs - DAY_MS),
    end: new Date(endMs),
  }
}

/**
 * 마지막으로 실제 발송된 일일 보고의 창 끝(가장 최근 평일 10:10 KST).
 * 주말 발송을 껐으므로 금 10:10 ~ 월 10:10 사이에는 금요일 값이 나온다 —
 * 이 시각부터 지금까지가 일일 카드가 한 번도 보고하지 않은 구간이다.
 */
export function getLastSentLeadMorningWindowEnd(
  now = new Date(),
  schedule: LeadDailySchedule = DEFAULT_SCHEDULE
) {
  let end = getLeadMorningWindow(now, schedule).end
  if (!schedule.weekdaysOnly) return end
  // 창 끝의 KST 요일이 곧 그 카드가 나갔어야 할 날이다. 주말이면 안 나갔으니 한 칸 더 뒤로.
  while (isLeadMorningWeekend(end)) {
    end = new Date(end.getTime() - DAY_MS)
  }
  return end
}

export interface LeadIntakeCounts {
  totalLeads: number
  metaLeadAdsLeadCount: number
  homepageLeadCount: number
  unrespondedCount: number
}

/**
 * 임의 구간의 유입을 일일 카드와 **같은 정의**로 센다 — 같은 세 소스, 같은 테스트 리드 제외.
 * 정의가 갈라지면 주간 보고서의 "주말 유입"과 일일 카드의 합이 조용히 어긋난다.
 */
export function summarizeLeadIntake(
  leads: LeadRecord[],
  start: Date,
  end: Date
): LeadIntakeCounts {
  const current = leads.filter(
    (lead) =>
      REPORT_SOURCES.has(lead.source) && inRange(lead, start, end) && !isTestLead(lead)
  )

  return {
    totalLeads: current.length,
    metaLeadAdsLeadCount: current.filter((lead) => lead.source === "meta_lead_ads").length,
    homepageLeadCount: current.filter((lead) => WEBSITE_FORM_LEAD_SOURCES.has(lead.source))
      .length,
    unrespondedCount: current.filter((lead) => lead.status === "new").length,
  }
}

/** 카드 표기와 같은 KST 라벨('09.04 10:10'). 주간 보고서의 구간 표시도 이걸 쓴다. */
export function formatLeadBriefKstDateTime(date: Date) {
  return formatKstDateTime(date)
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

function isMetaAttributedWebsiteLead(lead: LeadRecord) {
  if (!WEBSITE_FORM_LEAD_SOURCES.has(lead.source)) return false
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
  leads: LeadRecord[],
  window: LeadMorningWindow
): LeadMorningBriefMetrics {
  const current = leads.filter(
    (lead) =>
      REPORT_SOURCES.has(lead.source) &&
      inRange(lead, window.start, window.end) &&
      !isTestLead(lead)
  )

  // 주요 캠페인은 Meta 리드 광고 축에서만 뽑는다. 홈페이지 유입의 utm_campaign 을
  // 섞으면 같은 칸에 성격이 다른 두 축이 올라와 무슨 캠페인인지 읽을 수 없다.
  const topCampaign = topValue(
    current
      .filter((lead) => lead.source === "meta_lead_ads")
      .map((lead) => getMetaAdInfo(lead)?.campaign)
  )
  const contactPageLeadCount = current.filter((lead) => lead.source === "contact_page").length
  const demoModalLeadCount = current.filter((lead) => lead.source === "demo_modal").length
  // 쇼룸 예약·도입 신청. 이 줄이 없으면 홈페이지 합계와 내역의 합이 어긋난다.
  const intakeLeadCount = current.filter((lead) => INTAKE_LEAD_SOURCES.has(lead.source)).length

  return {
    periodLabel: `${formatKstDateTime(window.start)} - ${formatKstDateTime(window.end)}`,
    totalLeads: current.length,
    metaLeadAdsLeadCount: current.filter((lead) => lead.source === "meta_lead_ads").length,
    topCampaignLabel: topCampaign.label,
    topCampaignCount: topCampaign.count,
    homepageLeadCount: contactPageLeadCount + demoModalLeadCount,
    contactPageLeadCount,
    demoModalLeadCount,
    intakeLeadCount,
    metaAttributedWebsiteLeadCount: current.filter(isMetaAttributedWebsiteLead).length,
    unrespondedCount: current.filter((lead) => lead.status === "new").length,
    contactedCount: current.filter((lead) => lead.status === "contacted").length,
    convertedCount: current.filter((lead) => lead.status === "converted").length,
  }
}

function buildMessage(metrics: LeadMorningBriefMetrics) {
  return [
    `${metrics.periodLabel} 전체 접수 ${metrics.totalLeads}건`,
    `Meta 광고 리드 ${metrics.metaLeadAdsLeadCount}건 (주요 캠페인 ${metrics.topCampaignLabel} ${metrics.topCampaignCount}건)`,
    `홈페이지 ${metrics.homepageLeadCount}건 — 문의 ${metrics.contactPageLeadCount}건 / 데모 신청 ${metrics.demoModalLeadCount}건 / 접수 ${metrics.intakeLeadCount}건 / Meta 광고 경유 ${metrics.metaAttributedWebsiteLeadCount}건`,
    `미응대 ${metrics.unrespondedCount}건 / 상담 진행 ${metrics.contactedCount}건 / 전환 ${metrics.convertedCount}건`,
  ].join("\n")
}

/** 발송·실행 선점 없이 현재 한 창의 집계 범위와 대상 건수를 확인한다. */
export async function previewLeadMorningBrief(
  now = new Date(),
  schedule: LeadDailySchedule = DEFAULT_SCHEDULE
) {
  const window = getLeadMorningWindow(now, schedule)
  const metrics = buildMetrics(await getLeads(), window)
  return {
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString(),
    weekend: schedule.weekdaysOnly && isLeadMorningWeekend(now),
    totalLeads: metrics.totalLeads,
    maxDeliveries: 1,
  }
}

export async function sendLeadMorningBrief(
  now = new Date(),
  scheduleOverride?: LeadDailySchedule
): Promise<LeadMorningBriefResult> {
  const schedule = scheduleOverride ?? (await resolveLeadDailySchedule())
  const window = getLeadMorningWindow(now, schedule)

  // 주말에는 실행 레코드도 남기지 않는다. 남기면 그 구간이 '발송됨'으로 굳어
  // 나중에 주말 발송을 되살리거나 수동으로 보낼 때 already_sent 로 막힌다.
  if (schedule.weekdaysOnly && isLeadMorningWeekend(now)) {
    return {
      status: "skipped",
      reason: "weekend",
      windowStart: window.start.toISOString(),
      windowEnd: window.end.toISOString(),
    }
  }

  const claim = await claimLeadDigestRun({
    reportType: DAILY_REPORT_TYPE,
    windowStart: window.start,
    windowEnd: window.end,
    now,
  })

  if (!claim.claimed) {
    return {
      status: "skipped",
      runId: claim.run.id,
      reason: claim.run.status === "sent" ? "already_sent" : "already_running",
      windowStart: window.start.toISOString(),
      windowEnd: window.end.toISOString(),
    }
  }

  try {
    const metrics = buildMetrics(await getLeads(), window)
    const event = await emitNotificationEvent({
      eventType: "lead.digest.daily",
      notificationType: "digest",
      categoryTag: "lead",
      severity: "info",
      scopeTag: "org_admin",
      title: "리드 일일 리포트",
      message: buildMessage(metrics),
      routeUrl: "/admin/crm/customers/leads",
      source: "lead",
      sourceId: `digest:daily:${window.end.toISOString()}`,
      payload: {
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
