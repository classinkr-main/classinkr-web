// 채널톡 상담 통계의 순수 집계 — 어드민 탭(클라이언트)과 서버 라우트가 함께 쓴다.
// 서버 의존(fs·supabase) 없이 레코드 배열만 받는다. 날짜 버킷은 어드민 표준시(KST) 기준.

export interface ChannelConversationStatsLike {
  total: number
  byState: Record<"opened" | "closed" | "snoozed" | "unknown", number>
  matchedLeads: number
  unmatched: number
  last7Days: number
}

interface ConversationLike {
  state?: string
  tags?: string[] | null
  matchedLeadId?: string | null
  lastMessageAt?: string | null
  messageCount?: number | null
}

function normalizeState(value: string | undefined): "opened" | "closed" | "snoozed" | "unknown" {
  return value === "opened" || value === "closed" || value === "snoozed" ? value : "unknown"
}

export function computeChannelConversationStats(
  records: ConversationLike[],
  now: number = Date.now()
): ChannelConversationStatsLike {
  const byState = { opened: 0, closed: 0, snoozed: 0, unknown: 0 }
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000
  let matchedLeads = 0
  let last7Days = 0

  for (const record of records) {
    byState[normalizeState(record.state)] += 1
    if (record.matchedLeadId) matchedLeads += 1
    if (record.lastMessageAt) {
      const ms = new Date(record.lastMessageAt).getTime()
      if (Number.isFinite(ms) && ms >= weekAgo) last7Days += 1
    }
  }

  return {
    total: records.length,
    byState,
    matchedLeads,
    unmatched: records.length - matchedLeads,
    last7Days,
  }
}

export interface ConversationTagCount {
  tag: string
  count: number
}

/** 유형(태그) 분포 — count 내림차순, 동률은 태그명 오름차순으로 안정 정렬. 빈 태그 제외. */
export function aggregateConversationTags(
  records: ConversationLike[],
  topN = 6
): ConversationTagCount[] {
  const counts = new Map<string, number>()
  for (const record of records) {
    for (const raw of record.tags ?? []) {
      const tag = typeof raw === "string" ? raw.trim() : ""
      if (!tag) continue
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ko"))
    .slice(0, Math.max(0, topN))
}

export interface DailyActivityBucket {
  /** KST 기준 날짜 (YYYY-MM-DD) */
  date: string
  /** 축 라벨 (M/D) */
  label: string
  conversations: number
  messages: number
}

const KST_DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function kstDayKey(ms: number): string {
  return KST_DAY_FORMAT.format(ms)
}

function dayLabel(dayKey: string): string {
  const [, month, day] = dayKey.split("-")
  return `${Number(month)}/${Number(day)}`
}

/**
 * 일별 상담 활동 추이 — lastMessageAt(마지막 응답 시각) 기준으로 최근 days일을 0채움 버킷팅한다.
 * messages 는 해당 날짜에 마지막 응답이 있었던 상담들의 메시지 수 합계.
 */
export function aggregateDailyActivity(
  records: ConversationLike[],
  days = 14,
  now: number = Date.now()
): DailyActivityBucket[] {
  const buckets = new Map<string, DailyActivityBucket>()
  const DAY_MS = 24 * 60 * 60 * 1000
  for (let offset = days - 1; offset >= 0; offset--) {
    const key = kstDayKey(now - offset * DAY_MS)
    buckets.set(key, { date: key, label: dayLabel(key), conversations: 0, messages: 0 })
  }

  for (const record of records) {
    if (!record.lastMessageAt) continue
    const ms = new Date(record.lastMessageAt).getTime()
    if (!Number.isFinite(ms)) continue
    const bucket = buckets.get(kstDayKey(ms))
    if (!bucket) continue
    bucket.conversations += 1
    bucket.messages += typeof record.messageCount === "number" ? record.messageCount : 0
  }

  return Array.from(buckets.values())
}
