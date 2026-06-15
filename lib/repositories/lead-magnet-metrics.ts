import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getLeads } from "@/lib/repositories/leads"

const TRACKED_EVENTS = [
  "view_resource_card",
  "view_resource",
  "submit_newsletter",
  "download_materials",
  "click_cta",
] as const

const EVENT_QUERY_LIMIT = 50000

type TrackedEventName = (typeof TRACKED_EVENTS)[number]

interface ClientEventRow {
  event_name: string
  page: string | null
  params: Record<string, unknown> | null
  created_at: string
}

export interface LeadMagnetMetricRow {
  slug: string
  impressions: number
  views: number
  submissions: number
  downloads: number
  ctaClicks: number
  leads: number
  convertedLeads: number
  conversionRate: number
  leadConversionRate: number
  lastEventAt: string | null
}

export interface LeadMagnetMetrics {
  days: number
  since: string
  generatedAt: string
  truncated: boolean
  totals: {
    impressions: number
    views: number
    submissions: number
    downloads: number
    ctaClicks: number
    leads: number
    convertedLeads: number
    conversionRate: number
    leadConversionRate: number
  }
  byLeadMagnet: LeadMagnetMetricRow[]
  recentEvents: Array<{
    eventName: string
    leadMagnet: string
    createdAt: string
    page: string | null
    source: string | null
  }>
  warning?: string
}

function emptyMetrics(days: number, since: string, warning?: string): LeadMagnetMetrics {
  return {
    days,
    since,
    generatedAt: new Date().toISOString(),
    truncated: false,
    totals: {
      impressions: 0,
      views: 0,
      submissions: 0,
      downloads: 0,
      ctaClicks: 0,
      leads: 0,
      convertedLeads: 0,
      conversionRate: 0,
      leadConversionRate: 0,
    },
    byLeadMagnet: [],
    recentEvents: [],
    warning,
  }
}

function getStringParam(params: Record<string, unknown> | null, key: string) {
  const value = params?.[key]
  return typeof value === "string" ? value.trim() : ""
}

function increment(row: LeadMagnetMetricRow, eventName: string) {
  if (eventName === "view_resource_card") row.impressions += 1
  else if (eventName === "view_resource") row.views += 1
  else if (eventName === "submit_newsletter") row.submissions += 1
  else if (eventName === "download_materials") row.downloads += 1
  else if (eventName === "click_cta") row.ctaClicks += 1
}

function conversionRate(submissions: number, views: number) {
  if (views <= 0) return 0
  return Math.round((submissions / views) * 1000) / 10
}

function getOrCreateRow(rows: Map<string, LeadMagnetMetricRow>, slug: string) {
  const existing = rows.get(slug)
  if (existing) return existing

  const row: LeadMagnetMetricRow = {
    slug,
    impressions: 0,
    views: 0,
    submissions: 0,
    downloads: 0,
    ctaClicks: 0,
    leads: 0,
    convertedLeads: 0,
    conversionRate: 0,
    leadConversionRate: 0,
    lastEventAt: null,
  }
  rows.set(slug, row)
  return row
}

export async function getLeadMagnetMetrics(days: number): Promise<LeadMagnetMetrics> {
  const safeDays = Number.isFinite(days) && days > 0 && days <= 90 ? Math.round(days) : 30
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString()

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from("client_events")
      .select("event_name, page, params, created_at")
      .in("event_name", [...TRACKED_EVENTS])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(EVENT_QUERY_LIMIT)

    if (error) {
      console.warn("[lead-magnet-metrics] client_events query failed:", error.message)
      return emptyMetrics(safeDays, since, error.message)
    }

    const bySlug = new Map<string, LeadMagnetMetricRow>()
    const recentEvents: LeadMagnetMetrics["recentEvents"] = []

    for (const event of (data ?? []) as ClientEventRow[]) {
      const slug = getStringParam(event.params, "lead_magnet")
      if (!slug) continue

      const row = getOrCreateRow(bySlug, slug)
      increment(row, event.event_name)
      if (!row.lastEventAt || event.created_at > row.lastEventAt) {
        row.lastEventAt = event.created_at
      }
      if (recentEvents.length < 20) {
        recentEvents.push({
          eventName: event.event_name as TrackedEventName,
          leadMagnet: slug,
          createdAt: event.created_at,
          page: event.page,
          source: getStringParam(event.params, "source") || null,
        })
      }
    }

    try {
      const leads = await getLeads()
      for (const lead of leads) {
        const slug = lead.lead_magnet?.trim()
        if (!slug || lead.timestamp < since) continue

        const row = getOrCreateRow(bySlug, slug)
        row.leads += 1
        if (lead.status === "converted") row.convertedLeads += 1
        if (!row.lastEventAt || lead.timestamp > row.lastEventAt) {
          row.lastEventAt = lead.timestamp
        }
      }
    } catch (error) {
      console.warn(
        "[lead-magnet-metrics] leads query failed:",
        error instanceof Error ? error.message : error
      )
    }

    const byLeadMagnet = Array.from(bySlug.values())
      .map((row) => ({
        ...row,
        conversionRate: conversionRate(row.submissions, Math.max(row.impressions, row.views)),
        leadConversionRate: conversionRate(row.convertedLeads, row.leads),
      }))
      .sort((a, b) => {
        const aTotal = a.impressions + a.views + a.submissions + a.downloads + a.ctaClicks + a.leads
        const bTotal = b.impressions + b.views + b.submissions + b.downloads + b.ctaClicks + b.leads
        return bTotal - aTotal
      })

    const totals = byLeadMagnet.reduce(
      (acc, row) => {
        acc.impressions += row.impressions
        acc.views += row.views
        acc.submissions += row.submissions
        acc.downloads += row.downloads
        acc.ctaClicks += row.ctaClicks
        acc.leads += row.leads
        acc.convertedLeads += row.convertedLeads
        return acc
      },
      {
        impressions: 0,
        views: 0,
        submissions: 0,
        downloads: 0,
        ctaClicks: 0,
        leads: 0,
        convertedLeads: 0,
        conversionRate: 0,
        leadConversionRate: 0,
      }
    )
    totals.conversionRate = conversionRate(totals.submissions, Math.max(totals.impressions, totals.views))
    totals.leadConversionRate = conversionRate(totals.convertedLeads, totals.leads)

    return {
      days: safeDays,
      since,
      generatedAt: new Date().toISOString(),
      truncated: (data?.length ?? 0) >= EVENT_QUERY_LIMIT,
      totals,
      byLeadMagnet,
      recentEvents,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown metrics error"
    console.warn("[lead-magnet-metrics]", message)
    return emptyMetrics(safeDays, since, message)
  }
}
