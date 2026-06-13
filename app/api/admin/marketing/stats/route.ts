import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getAllSubscribers, getAllCampaigns } from "@/lib/repositories/marketing"
import { getAllRules, getAllLogs } from "@/lib/repositories/automation"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const [subscribers, campaigns, rules, logs] = await Promise.all([
      getAllSubscribers(),
      getAllCampaigns(),
      getAllRules(),
      getAllLogs(),
    ])

    // ── 구독자 통계 ─────────────────────────────────────────
    const total = subscribers.length
    const active = subscribers.filter((s) => s.status === "active").length
    const unsubscribed = subscribers.filter((s) => s.status === "unsubscribed").length

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const newThisMonth = subscribers.filter(
      (s) => s.createdAt && s.createdAt >= startOfMonth
    ).length

    // ── 캠페인 통계 ─────────────────────────────────────────
    const recentCampaigns = campaigns.slice(0, 5).map((c) => ({
      id: c.id,
      subject: c.subject,
      sentAt: c.sentAt ?? null,
      recipientCount: c.recipientCount,
      status: c.status,
      tags: c.targetTags,
    }))

    // ── 자동화 통계 ─────────────────────────────────────────
    const totalRules = rules.length
    const activeRules = rules.filter((r) => r.status === "active").length

    const recentLogs = logs.slice(0, 5).map((l) => ({
      id: l.id,
      ruleName: l.ruleName ?? "",
      triggeredAt: l.triggeredAt,
      recipientCount: l.recipientCount,
      status: l.status,
    }))

    // ── 태그 분포 (상위 10개) ────────────────────────────────
    const tagCountMap: Record<string, number> = {}
    for (const sub of subscribers) {
      if (!sub.tags) continue
      for (const tag of sub.tags) {
        tagCountMap[tag] = (tagCountMap[tag] ?? 0) + 1
      }
    }
    const tagDistribution = Object.entries(tagCountMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }))

    const response = NextResponse.json({
      subscribers: { total, active, unsubscribed, newThisMonth },
      campaigns: { total: campaigns.length, recentCampaigns },
      automation: { totalRules, activeRules, recentLogs },
      tagDistribution,
    })
    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120")
    return response
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
