import "server-only"

import fs from "fs"
import path from "path"

import { isChannelApiConfigured } from "@/lib/channel-talk-api"
import { mineFaqSuggestions, type FaqSuggestion } from "@/lib/channel-talk-mining"
import {
  deriveChannelRootCauseCandidates,
  type ChannelRootCauseCandidate,
} from "@/lib/channel-talk-root-causes"
import { detectChatbotCategory } from "@/lib/chatbot/classification"
import { getChatbotStats } from "@/lib/chatbot/service"
import { DIRECT_INBOUND_LEAD_SOURCES } from "@/lib/lead-types"
import {
  getConversations,
  listDurableConversations,
  type ChannelConversationRecord,
} from "@/lib/repositories/channel-conversations"
import { listCrmTasks } from "@/lib/repositories/crm-tasks"
import { listInstallSchedules } from "@/lib/repositories/install-schedules"
import { getLeads, type LeadRecord } from "@/lib/repositories/leads"
import { listShowroomBookings } from "@/lib/repositories/showroom-bookings"

export * from "./inquiry-types"
import {
  CS_CATEGORY_MAP,
  type ChatbotCategory,
  type CsConnectionStatus,
  type CsDashboardPeriod,
  type CsFrequentIssue,
  type CsInquiryDashboardData,
  type CsTrendBucket,
  type CsUnansweredInquiry,
  type CsUpcomingTask,
  type CsCategoryInfo,
  type CsChannelInfo,
} from "./inquiry-types"

const KST_DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function getKstDateString(date: Date = new Date()): string {
  return KST_DAY_FORMAT.format(date)
}

function parseKstDate(dateString: string): Date {
  return new Date(`${dateString}T00:00:00+09:00`)
}

function loadGoldenQuestions(): string[] {
  try {
    const file = path.join(process.cwd(), "data", "chatbot-golden-set.json")
    if (!fs.existsSync(file)) return []
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
      cases?: { question?: string }[]
    }
    return (parsed.cases ?? [])
      .map((entry) => entry.question)
      .filter((question): question is string => typeof question === "string")
  } catch {
    return []
  }
}

function maskContact(contact?: string | null): string | undefined {
  if (!contact) return undefined
  const trimmed = contact.trim()
  if (trimmed.includes("@")) {
    const [user, domain] = trimmed.split("@")
    if (!user || !domain) return trimmed
    if (user.length <= 2) return `${user[0]}*@${domain}`
    return `${user.slice(0, 2)}***@${domain}`
  }
  const digits = trimmed.replace(/\D/g, "")
  if (digits.length >= 10) {
    return trimmed.replace(/(\d{3})[- ]?(\d{3,4})[- ]?(\d{4})/, "$1-****-$3")
  }
  return trimmed
}

export async function fetchCsInquiryDashboard(options?: {
  period?: CsDashboardPeriod
  now?: Date
}): Promise<CsInquiryDashboardData> {
  const period: CsDashboardPeriod = options?.period ?? "7d"
  const now = options?.now ?? new Date()
  const nowMs = now.getTime()
  const todayKstStr = getKstDateString(now)
  const todayMidnightKst = parseKstDate(todayKstStr).getTime()

  // Calculate start and end times for period
  let periodStartMs: number
  const periodEndMs = nowMs
  let daysInPeriod = 7

  if (period === "today") {
    periodStartMs = todayMidnightKst
    daysInPeriod = 1
  } else if (period === "7d") {
    periodStartMs = todayMidnightKst - 6 * 86_400_000
    daysInPeriod = 7
  } else if (period === "30d") {
    periodStartMs = todayMidnightKst - 29 * 86_400_000
    daysInPeriod = 30
  } else if (period === "90d") {
    periodStartMs = todayMidnightKst - 89 * 86_400_000
    daysInPeriod = 90
  } else {
    // all
    periodStartMs = 0
    daysInPeriod = 90
  }

  // Previous period for comparison diff
  const periodDurationMs = periodEndMs - periodStartMs
  const prevPeriodStartMs = period === "all" ? 0 : periodStartMs - periodDurationMs
  const prevPeriodEndMs = periodStartMs

  // 1. Fetch channel talk data
  const durableChats = await listDurableConversations(500)
  const allConversations: ChannelConversationRecord[] = durableChats ?? getConversations()

  // 2. Fetch homepage inquiries (leads)
  let allLeads: LeadRecord[] = []
  try {
    allLeads = await getLeads()
  } catch (err) {
    console.warn("[cs-dashboard] getLeads failed, proceeding with empty leads:", err)
  }

  // Filter leads to direct inbound inquiries (contact_page, demo_modal, etc.)
  const inboundLeads = allLeads.filter((l) => DIRECT_INBOUND_LEAD_SOURCES.has(l.source))

  // 3. Chatbot stats
  const fromDateStr = period === "all" ? "2026-01-01" : getKstDateString(new Date(periodStartMs))
  const toDateStr = todayKstStr
  let chatbotStats: Awaited<ReturnType<typeof getChatbotStats>> | null = null
  try {
    chatbotStats = await getChatbotStats(new URLSearchParams({ from: fromDateStr, to: toDateStr }))
  } catch (err) {
    console.warn("[cs-dashboard] getChatbotStats failed, using fallback:", err)
  }

  // Connection check: Channel Talk
  const hasChannelPluginKey = Boolean(
    process.env.NEXT_PUBLIC_CHANNEL_TALK_PLUGIN_KEY?.trim() ||
      process.env.NEXT_PUBLIC_CHANNEL_PLUGIN_KEY?.trim()
  )
  const hasChannelApiKey = Boolean(
    process.env.CHANNEL_TALK_ACCESS?.trim() || process.env.CHANNEL_ACCESS_KEY?.trim()
  )
  const hasChannelWebhook = Boolean(
    process.env.CHANNEL_TALK_WEBHOOK_URL?.trim() ||
      process.env.CHANNEL_TALK_WEBHOOK_SECRET?.trim() ||
      process.env.CHANNEL_TALK_WEBHOOK_URL_TOKEN?.trim()
  )
  const isChannelConfigured = isChannelApiConfigured()
  const channelTalkStatus: "connected" | "warning" | "error" =
    isChannelConfigured && (hasChannelPluginKey || hasChannelWebhook)
      ? "connected"
      : isChannelConfigured || hasChannelPluginKey || hasChannelWebhook
        ? "warning"
        : "error"

  let latestChannelSync: string | null = null
  for (const conv of allConversations) {
    if (conv.syncedAt && (!latestChannelSync || conv.syncedAt > latestChannelSync)) {
      latestChannelSync = conv.syncedAt
    }
  }

  // Connection check: Homepage
  const hasSupabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  )
  const hasSolapi = Boolean(
    process.env.SOLAPI_API?.trim() && process.env.SOLAPI_SECRET?.trim()
  )
  const homepageStatus: "connected" | "warning" | "error" = hasSupabase ? "connected" : "warning"

  let latestHomepageInquiryAt: string | null = null
  for (const lead of inboundLeads) {
    if (lead.timestamp && (!latestHomepageInquiryAt || lead.timestamp > latestHomepageInquiryAt)) {
      latestHomepageInquiryAt = lead.timestamp
    }
  }

  const connections: CsConnectionStatus = {
    channelTalk: {
      status: channelTalkStatus,
      configured: isChannelConfigured,
      hasPluginKey: hasChannelPluginKey,
      hasApiKey: hasChannelApiKey,
      hasWebhook: hasChannelWebhook,
      lastSyncedAt: latestChannelSync,
      totalCount: allConversations.length,
    },
    homepage: {
      status: homepageStatus,
      dbConnected: hasSupabase,
      formConfigured: true,
      smsConfigured: hasSolapi,
      lastInquiryAt: latestHomepageInquiryAt,
      totalCount: inboundLeads.length,
    },
  }

  // Helper to extract timestamp from conversation
  function getConvTime(c: ChannelConversationRecord): number {
    const raw = c.lastMessageAt || c.firstAskedAt || c.syncedAt
    if (!raw) return 0
    const parsed = new Date(raw).getTime()
    return Number.isFinite(parsed) ? parsed : 0
  }

  // Helper to extract timestamp from lead
  function getLeadTime(l: LeadRecord): number {
    if (!l.timestamp) return 0
    const parsed = new Date(l.timestamp).getTime()
    return Number.isFinite(parsed) ? parsed : 0
  }

  // Filter items in period
  const periodConversations = allConversations.filter((c) => {
    const t = getConvTime(c)
    return t >= periodStartMs && t <= periodEndMs
  })

  const prevPeriodConversations = allConversations.filter((c) => {
    const t = getConvTime(c)
    return t >= prevPeriodStartMs && t < prevPeriodEndMs
  })

  const periodLeads = inboundLeads.filter((l) => {
    const t = getLeadTime(l)
    return t >= periodStartMs && t <= periodEndMs
  })

  const prevPeriodLeads = inboundLeads.filter((l) => {
    const t = getLeadTime(l)
    return t >= prevPeriodStartMs && t < prevPeriodEndMs
  })

  // Chatbot question count in period
  const chatbotTotals = chatbotStats?.totals ?? {
    questionCount: 0,
    unresolvedCount: 0,
    handoffCount: 0,
    directAnswerCount: 0,
  }

  // Count inquiries by resolution state
  // Channel Talk:
  // closed = resolved
  // snoozed = in_progress
  // opened: messageCount > 1 => in_progress, messageCount <= 1 => unanswered
  let ctResolved = 0
  let ctInProgress = 0
  let ctUnanswered = 0
  for (const c of periodConversations) {
    if (c.state === "closed") ctResolved++
    else if (c.state === "snoozed") ctInProgress++
    else if (c.messageCount > 1) ctInProgress++
    else ctUnanswered++
  }

  // Leads:
  // converted or closed = resolved
  // contacted, nurturing, qualified = in_progress
  // new = unanswered
  let leadResolved = 0
  let leadInProgress = 0
  let leadUnanswered = 0
  for (const l of periodLeads) {
    if (l.status === "converted" || l.status === "closed") leadResolved++
    else if (l.status === "new") leadUnanswered++
    else leadInProgress++
  }

  const chatbotResolved = chatbotTotals.directAnswerCount || 0
  const chatbotUnanswered = chatbotTotals.unresolvedCount || 0
  const chatbotInProgress = chatbotTotals.handoffCount || 0

  const totalInquiries =
    periodConversations.length + periodLeads.length + chatbotTotals.questionCount
  const resolvedCount = ctResolved + leadResolved + chatbotResolved
  const inProgressCount = ctInProgress + leadInProgress + chatbotInProgress
  const unansweredCount = ctUnanswered + leadUnanswered + chatbotUnanswered

  const resolutionRate =
    totalInquiries > 0 ? Math.round((resolvedCount / totalInquiries) * 1000) / 10 : 0

  // Prev period stats for comparison diff
  const prevTotal = prevPeriodConversations.length + prevPeriodLeads.length
  let prevResolved = 0
  for (const c of prevPeriodConversations) {
    if (c.state === "closed") prevResolved++
  }
  for (const l of prevPeriodLeads) {
    if (l.status === "converted" || l.status === "closed") prevResolved++
  }
  const prevResolutionRate =
    prevTotal > 0 ? Math.round((prevResolved / prevTotal) * 1000) / 10 : 0

  const totalDiff =
    prevTotal > 0 ? Math.round(((totalInquiries - prevTotal) / prevTotal) * 100) : 0
  const resRateDiff = Math.round((resolutionRate - prevResolutionRate) * 10) / 10

  // Category classification for all period inquiries
  const categoryCounts: Record<ChatbotCategory, number> = {
    billing: 0,
    hardware: 0,
    troubleshooting: 0,
    classroom: 0,
    onboarding: 0,
    admin: 0,
    consultation: 0,
    general: 0,
  }

  for (const c of periodConversations) {
    const text = `${c.firstQuestion ?? ""} ${c.lastMessageText ?? ""} ${(c.tags ?? []).join(" ")}`
    const cat = detectChatbotCategory(text, c.tags ?? [])
    categoryCounts[cat]++
  }

  for (const l of periodLeads) {
    const text = `${l.message ?? ""} ${l.notes ?? ""} ${l.source_detail ?? ""}`
    const cat = detectChatbotCategory(text)
    categoryCounts[cat]++
  }

  // Incorporate chatbot categories if present
  if (Array.isArray(chatbotStats?.categories)) {
    for (const item of chatbotStats.categories) {
      const catName = item.key
      if (catName in categoryCounts) {
        categoryCounts[catName as ChatbotCategory] += item.count
      } else {
        categoryCounts.general += item.count
      }
    }
  }

  const totalClassified = Math.max(1, totalInquiries)
  const genres: CsCategoryInfo[] = (
    Object.keys(CS_CATEGORY_MAP) as ChatbotCategory[]
  )
    .map((cat) => {
      const meta = CS_CATEGORY_MAP[cat]
      const count = categoryCounts[cat]
      const percentage = Math.round((count / totalClassified) * 1000) / 10
      return {
        category: cat,
        label: meta.label,
        count,
        percentage,
        color: meta.color,
      }
    })
    .sort((a, b) => b.count - a.count)

  // Channels distribution
  const channels: CsChannelInfo[] = [
    {
      channel: "channel_talk",
      label: "채널톡",
      count: periodConversations.length,
      percentage: Math.round((periodConversations.length / totalClassified) * 1000) / 10,
      color: "#FF6B00",
    },
    {
      channel: "homepage",
      label: "홈페이지 문의",
      count: periodLeads.length,
      percentage: Math.round((periodLeads.length / totalClassified) * 1000) / 10,
      color: "#084734",
    },
    {
      channel: "chatbot",
      label: "챗봇",
      count: chatbotTotals.questionCount,
      percentage: Math.round((chatbotTotals.questionCount / totalClassified) * 1000) / 10,
      color: "#D4537E",
    },
  ]

  // Trend buckets calculation
  const trendBuckets: Map<string, CsTrendBucket> = new Map()
  const bucketDays = Math.min(daysInPeriod, 30) // Cap display chart to max 30 bars

  for (let i = bucketDays - 1; i >= 0; i--) {
    const d = new Date(todayMidnightKst - i * 86_400_000)
    const key = getKstDateString(d)
    const [, month, day] = key.split("-")
    trendBuckets.set(key, {
      date: key,
      label: `${Number(month)}/${Number(day)}`,
      total: 0,
      resolved: 0,
      unanswered: 0,
      channelTalk: 0,
      homepage: 0,
      chatbot: 0,
    })
  }

  for (const c of periodConversations) {
    const t = getConvTime(c)
    if (!t) continue
    const key = getKstDateString(new Date(t))
    const b = trendBuckets.get(key)
    if (!b) continue
    b.total++
    b.channelTalk++
    if (c.state === "closed") b.resolved++
    else if (c.messageCount <= 1 && c.state === "opened") b.unanswered++
  }

  for (const l of periodLeads) {
    const t = getLeadTime(l)
    if (!t) continue
    const key = getKstDateString(new Date(t))
    const b = trendBuckets.get(key)
    if (!b) continue
    b.total++
    b.homepage++
    if (l.status === "converted" || l.status === "closed") b.resolved++
    else if (l.status === "new") b.unanswered++
  }

  const trends = Array.from(trendBuckets.values())

  // 4. Frequent recurring issues (최신 자주 오는 문제)
  const goldenQuestions = loadGoldenQuestions()
  const faqSuggestions: FaqSuggestion[] = mineFaqSuggestions(
    allConversations,
    goldenQuestions,
    { minCount: 1, limit: 10 }
  )
  const rootCauses: ChannelRootCauseCandidate[] =
    deriveChannelRootCauseCandidates(allConversations, { limit: 10 })

  const frequentIssues: CsFrequentIssue[] = []
  const seenIssues = new Set<string>()

  // Add mined FAQs
  for (const s of faqSuggestions) {
    const key = s.question.toLowerCase().trim()
    if (seenIssues.has(key)) continue
    seenIssues.add(key)
    frequentIssues.push({
      id: `faq-${s.normalizedQuestion.slice(0, 24)}`,
      title: s.question,
      category: s.category,
      categoryLabel: CS_CATEGORY_MAP[s.category]?.label ?? "일반",
      count: s.count,
      lastAskedAt: s.lastAskedAt ?? null,
      sampleQuestions: s.sampleQuestions?.slice(0, 2) ?? [s.question],
      source: "channel_talk",
      sourceLabel: "채널톡",
    })
  }

  // Add root cause rules if not yet present
  for (const r of rootCauses) {
    const key = r.symptom.toLowerCase().trim()
    if (seenIssues.has(key)) continue
    seenIssues.add(key)
    const cat = detectChatbotCategory(r.symptom, r.suggestedTags)
    frequentIssues.push({
      id: `rc-${r.ruleId}-${r.candidateKey.slice(0, 16)}`,
      title: r.symptom,
      category: cat,
      categoryLabel: CS_CATEGORY_MAP[cat]?.label ?? "일반",
      count: r.diagnosticQuestions.length + 1,
      lastAskedAt: r.occurredAt,
      sampleQuestions: r.diagnosticQuestions.slice(0, 2),
      source: "channel_talk",
      sourceLabel: "원인 분석",
    })
  }

  // Add top chatbot questions if available
  if (Array.isArray(chatbotStats?.topQuestions)) {
    for (const q of chatbotStats.topQuestions) {
      const title =
        q.questionLabel ||
        (q as unknown as { canonicalQuestion?: string }).canonicalQuestion ||
        ""
      if (!title) continue
      const key = title.toLowerCase().trim()
      if (seenIssues.has(key)) continue
      seenIssues.add(key)
      const cat = detectChatbotCategory(title)
      frequentIssues.push({
        id: `bot-${q.clusterId}`,
        title,
        category: cat,
        categoryLabel: CS_CATEGORY_MAP[cat]?.label ?? "일반",
        count: q.questionCount,
        lastAskedAt: null,
        sampleQuestions: [title],
        source: "chatbot",
        sourceLabel: "챗봇",
      })
    }
  }

  frequentIssues.sort((a, b) => b.count - a.count)

  // 5. Unanswered inquiries (답변 안된 내역)
  const unansweredInquiries: CsUnansweredInquiry[] = []

  // 5a. Channel Talk opened conversations
  for (const c of allConversations) {
    if (c.state === "opened" && c.messageCount <= 1) {
      const t = getConvTime(c)
      const waitMinutes = t > 0 ? Math.max(0, Math.floor((nowMs - t) / 60_000)) : 0
      const text = c.firstQuestion || c.lastMessageText || "상담 요청이 인입되었습니다."
      const cat = detectChatbotCategory(text, c.tags ?? [])

      unansweredInquiries.push({
        id: `ct-${c.id}`,
        channel: "channel_talk",
        channelLabel: "채널톡",
        customerName: c.name || "고객",
        customerOrg: c.matchedLeadOrg,
        customerContact: maskContact(c.phone || c.email),
        inquiryText: text,
        category: cat,
        categoryLabel: CS_CATEGORY_MAP[cat]?.label ?? "일반",
        createdAt: c.firstAskedAt || c.lastMessageAt || c.syncedAt,
        waitingMinutes: waitMinutes,
        urgency:
          waitMinutes >= 1440 ? "critical" : waitMinutes >= 120 ? "warning" : "normal",
        targetUrl: `/admin/channel-talk?sub=conversations`,
      })
    }
  }

  // 5b. Homepage leads with status === 'new'
  for (const l of inboundLeads) {
    if (l.status === "new") {
      const t = getLeadTime(l)
      const waitMinutes = t > 0 ? Math.max(0, Math.floor((nowMs - t) / 60_000)) : 0
      const text =
        l.message ||
        `${l.source === "demo_modal" ? "데모 체험 신청" : l.source === "showroom_booking" ? "쇼룸 방문 예약" : "홈페이지 문의 접수"}`
      const cat = detectChatbotCategory(text)

      unansweredInquiries.push({
        id: `lead-${l.id}`,
        channel: "homepage",
        channelLabel: "홈페이지 문의",
        customerName: l.name || "문의 고객",
        customerOrg: l.org || undefined,
        customerContact: maskContact(l.phone || l.email),
        inquiryText: text,
        category: cat,
        categoryLabel: CS_CATEGORY_MAP[cat]?.label ?? "도입·온보딩",
        createdAt: l.timestamp,
        waitingMinutes: waitMinutes,
        urgency:
          waitMinutes >= 1440 ? "critical" : waitMinutes >= 120 ? "warning" : "normal",
        targetUrl: `/admin/crm?leadId=${encodeURIComponent(l.id)}`,
      })
    }
  }

  // Sort unanswered by wait time descending (oldest waiting first)
  unansweredInquiries.sort((a, b) => b.waitingMinutes - a.waitingMinutes)

  // 6. Upcoming scheduled tasks (앞으로 예정된 작업들)
  const upcomingTasks: CsUpcomingTask[] = []

  // 6a. Lead follow-ups (고객 팔로업)
  for (const l of inboundLeads) {
    if (!l.follow_up_at) continue
    const followUpDate = l.follow_up_at.slice(0, 10)
    const diffDays = Math.round(
      (new Date(`${followUpDate}T00:00:00+09:00`).getTime() - todayMidnightKst) / 86_400_000
    )
    const dDay =
      diffDays === 0
        ? "D-Day 오늘"
        : diffDays === 1
          ? "D-1 내일"
          : diffDays > 1
            ? `D-${diffDays}`
            : `D+${Math.abs(diffDays)} 지연`
    const urgency = diffDays < 0 ? "urgent" : diffDays === 0 ? "today" : "upcoming"

    upcomingTasks.push({
      id: `lead-fu-${l.id}`,
      type: "follow_up",
      typeLabel: "고객 팔로업",
      title: `${l.name || "고객"} (${l.org || "기관"}) 상담 팔로업`,
      description: l.notes || l.message || undefined,
      scheduledAt: l.follow_up_at,
      scheduledDate: followUpDate,
      scheduledTime: l.follow_up_at.length > 10 ? l.follow_up_at.slice(11, 16) : undefined,
      dDay,
      urgency,
      customerName: l.name || "문의 고객",
      customerOrg: l.org || undefined,
      ownerName: l.assigned_to || undefined,
      priority: urgency === "urgent" ? "urgent" : urgency === "today" ? "high" : "normal",
      targetUrl: `/admin/crm?leadId=${encodeURIComponent(l.id)}`,
      targetUrlLabel: "CRM 리드 열기",
    })
  }

  // 6b. Showroom visit bookings (쇼룸 방문 예약)
  try {
    const showroomList = await listShowroomBookings({ from: todayKstStr })
    for (const b of showroomList) {
      if (b.status !== "requested" && b.status !== "confirmed") continue
      if (b.visitDate < todayKstStr) continue
      const diffDays = Math.round(
        (new Date(`${b.visitDate}T00:00:00+09:00`).getTime() - todayMidnightKst) / 86_400_000
      )
      const dDay =
        diffDays === 0
          ? "D-Day 오늘"
          : diffDays === 1
            ? "D-1 내일"
            : `D-${diffDays}`
      const urgency = diffDays <= 0 ? "today" : "upcoming"

      upcomingTasks.push({
        id: `sr-${b.id}`,
        type: "showroom",
        typeLabel: "쇼룸 방문",
        title: `${b.org || b.name} 쇼룸 체험 방문 (${b.durationMinutes}분)`,
        description: b.memo || (b.interests?.length ? `관심사: ${b.interests.join(", ")}` : undefined),
        scheduledAt: `${b.visitDate}T${b.visitTime}`,
        scheduledDate: b.visitDate,
        scheduledTime: b.visitTime,
        dDay,
        urgency,
        customerName: b.name,
        customerOrg: b.org,
        ownerName: b.assignedTo || undefined,
        priority: "high",
        targetUrl: `/admin/showroom-bookings`,
        targetUrlLabel: "쇼룸 예약 관리",
      })
    }
  } catch (err) {
    console.warn("[cs-dashboard] listShowroomBookings error:", err)
  }

  // 6c. Hardware installation schedules (설치 지원 일정)
  try {
    const installList = await listInstallSchedules({ from: todayKstStr })
    for (const s of installList) {
      if (s.status === "completed" || s.status === "cancelled") continue
      const diffDays = Math.round(
        (new Date(`${s.scheduled_date}T00:00:00+09:00`).getTime() - todayMidnightKst) / 86_400_000
      )
      upcomingTasks.push({
        id: `inst-${s.id}`,
        type: "install",
        typeLabel: "설치 지원",
        title: `${s.quote_item?.product_name || "하드웨어"} 현장 설치 및 세팅`,
        description: s.team?.name ? `배정팀: ${s.team.name} (수량: ${s.quote_item?.quantity || 1}대)` : (s.location || undefined),
        scheduledAt: s.scheduled_date,
        scheduledDate: s.scheduled_date,
        scheduledTime: undefined,
        dDay: diffDays === 0 ? "D-Day 오늘" : diffDays === 1 ? "D-1 내일" : `D-${diffDays}`,
        urgency: diffDays <= 0 ? "today" : "upcoming",
        ownerName: s.team?.name || undefined,
        priority: "high",
        targetUrl: `/admin/hardware`,
        targetUrlLabel: "하드웨어 재고 관리",
      })
    }
  } catch (err) {
    console.warn("[cs-dashboard] listInstallSchedules error:", err)
  }

  // 6d. CRM Tasks (CS 체크인 및 데모 과업)
  try {
    const crmResult = await listCrmTasks({ status: "open", limit: 20 })
    for (const t of crmResult.rows) {
      if (!t.dueAt) continue
      const diffDays = Math.round(
        (new Date(t.dueAt).getTime() - todayMidnightKst) / 86_400_000
      )
      const dDay =
        diffDays < 0
          ? `D+${Math.abs(diffDays)} 지연`
          : diffDays === 0
            ? "D-Day 오늘"
            : diffDays === 1
              ? "D-1 내일"
              : `D-${diffDays}`
      const urgency = diffDays < 0 ? "urgent" : diffDays === 0 ? "today" : "upcoming"

      upcomingTasks.push({
        id: `task-${t.id}`,
        type: "crm_task",
        typeLabel:
          t.taskType === "cs_checkin"
            ? "CS 체크인"
            : t.taskType === "demo"
              ? "데모 지원"
              : "CRM 과업",
        title: t.title,
        description: t.detail || undefined,
        scheduledAt: t.dueAt,
        scheduledDate: t.dueAt.slice(0, 10),
        dDay,
        urgency,
        customerName: t.targetLabel || undefined,
        ownerName: t.ownerNameSnapshot || undefined,
        priority: t.priority,
        targetUrl: `/admin/crm`,
        targetUrlLabel: "CRM 확인",
      })
    }
  } catch (err) {
    console.warn("[cs-dashboard] listCrmTasks error:", err)
  }

  // 6e. Frequent issue guide doc creation recommendation
  for (const issue of frequentIssues.slice(0, 2)) {
    upcomingTasks.push({
      id: `guide-${issue.id}`,
      type: "guide_doc",
      typeLabel: "가이드 보강",
      title: `[문서 보강 권장] ${issue.title}`,
      description: `최근 ${issue.count}회 반복 문의 감지 — 가이드 문서 신규 작성 필요`,
      scheduledAt: todayKstStr,
      scheduledDate: todayKstStr,
      dDay: "권장",
      urgency: "today",
      priority: "normal",
      targetUrl: `/admin/docs?tab=documents`,
      targetUrlLabel: "문서 작성",
    })
  }

  // Sort upcoming tasks by urgency then scheduledAt
  upcomingTasks.sort((a, b) => {
    const urgencyWeight = { urgent: 0, today: 1, upcoming: 2 }
    if (urgencyWeight[a.urgency] !== urgencyWeight[b.urgency]) {
      return urgencyWeight[a.urgency] - urgencyWeight[b.urgency]
    }
    return a.scheduledAt.localeCompare(b.scheduledAt)
  })

  return {
    period,
    dateRange: {
      from: fromDateStr,
      to: toDateStr,
    },
    kpis: {
      totalInquiries,
      unansweredCount,
      resolvedCount,
      inProgressCount,
      resolutionRate,
      avgResponseHours: chatbotStats?.latency.avgMs
        ? Math.round((chatbotStats.latency.avgMs / 3_600_000) * 10) / 10
        : null,
      prevPeriodDiff: {
        totalPercent: totalDiff,
        resolutionRateDiff: resRateDiff,
      },
    },
    connections,
    trends,
    genres,
    channels,
    frequentIssues: frequentIssues.slice(0, 12),
    unansweredInquiries: unansweredInquiries.slice(0, 50),
    upcomingTasks: upcomingTasks.slice(0, 30),
  }
}
