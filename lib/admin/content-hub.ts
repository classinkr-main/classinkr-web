/**
 * 어드민 콘텐츠 「한눈에」(/admin/blog) 계산 — 블로그와 인스타그램을 같은 기간으로 묶는다.
 *
 * 화면(components/admin/blog/ContentHub.tsx)과 일별 조회 API(app/api/admin/content/page-views/daily)가
 * 같은 규칙을 쓰도록 순수 함수만 둔다. 날짜 키는 KST 달력일(YYYY-MM-DD)이다.
 *
 * 수치의 뜻:
 * - 블로그 조회 = 기간 안 `/blog/` page_view(목록·카테고리 화면 포함 합계, 글별 수치는 글 경로만).
 * - 인스타 조회·도달 = 기간 안에 올린 게시물의 게시 뒤 누적값(Graph API 미디어 인사이트가 누적만 준다).
 */
import type { BlogPost } from "@/lib/blog-types"
import { getBlogPostPath } from "@/lib/blog-slug-route"
import { getBusinessDateParts } from "@/lib/business-time"

export type ContentHubPeriod = "last_7d" | "last_30d" | "last_90d" | "this_month"

export const CONTENT_HUB_PERIODS: ReadonlyArray<{ value: ContentHubPeriod; label: string }> = [
  { value: "last_7d", label: "7일" },
  { value: "last_30d", label: "30일" },
  { value: "last_90d", label: "90일" },
  { value: "this_month", label: "이번 달" },
]

export function isContentHubPeriod(value: string): value is ContentHubPeriod {
  return CONTENT_HUB_PERIODS.some((option) => option.value === value)
}

/** page_view 저장 길이(app/api/track/event — 200자)에 가깝게 잘린 경로는 앞부분으로 글을 찾는다. */
const TRUNCATED_PAGE_MIN_LENGTH = 190

const DAY_MS = 24 * 60 * 60 * 1000

export function kstDateKey(date: Date): string {
  return getBusinessDateParts(date).date
}

export function shiftDateKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d) + deltaDays * DAY_MS).toISOString().slice(0, 10)
}

export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number)
  const [ty, tm, td] = toKey.split("-").map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS)
}

export interface ContentHubWindow {
  period: ContentHubPeriod
  /** 오늘을 포함한 날 수 — page-views API 의 `days` 로도 쓴다(최대 90). */
  days: number
  startKey: string
  endKey: string
  dayKeys: string[]
}

export function buildContentHubWindow(period: ContentHubPeriod, now: Date = new Date()): ContentHubWindow {
  const endKey = kstDateKey(now)
  const days =
    period === "last_7d" ? 7
      : period === "last_90d" ? 90
        : period === "this_month" ? Number(endKey.slice(8, 10))
          : 30
  const startKey = shiftDateKey(endKey, -(days - 1))
  const dayKeys = Array.from({ length: days }, (_, index) => shiftDateKey(startKey, index))
  return { period, days, startKey, endKey, dayKeys }
}

export function isKeyInWindow(key: string | null, window: Pick<ContentHubWindow, "startKey" | "endKey">) {
  return key !== null && key >= window.startKey && key <= window.endKey
}

/** 블로그 글의 발행일 — publishedAt(ISO)이 우선이고, 없으면 표시용 date("2026. 06. 02")를 읽는다. */
export function blogPublishedDateKey(post: Pick<BlogPost, "publishedAt" | "date">): string | null {
  if (post.publishedAt) {
    const parsed = new Date(post.publishedAt)
    if (!Number.isNaN(parsed.getTime())) return kstDateKey(parsed)
  }
  const match = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(post.date ?? "")
  if (!match) return null
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
}

/** Graph API timestamp("2026-10-16T09:00:00+0000") → KST 날짜 키 */
export function instagramDateKey(timestamp: string | undefined): string | null {
  if (!timestamp) return null
  const normalized = timestamp.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : kstDateKey(parsed)
}

export function formatDateKeyLabel(key: string): string {
  const [, m, d] = key.split("-").map(Number)
  return `${m}월 ${d}일`
}

function normalizePagePath(page: string) {
  const path = page.split("?")[0].split("#")[0]
  return path.length > 1 ? path.replace(/\/+$/, "") : path
}

/**
 * page_view 한 줄의 경로가 이 글의 것인지 — 쿼리스트링·끝 `/` 는 같은 글로 보고, 저장 길이에서 잘린
 * 긴 한글 경로는 글 경로의 앞부분과 같으면 같은 글로 본다.
 */
export function pageMatchesBlogPath(page: string, postPath: string): boolean {
  const normalized = normalizePagePath(page)
  if (normalized === postPath) return true
  return normalized.length >= TRUNCATED_PAGE_MIN_LENGTH && postPath.startsWith(normalized)
}

/** page-views API 의 top 목록 → 글 slug 별 조회수. 어느 글에도 안 맞는 경로(목록·카테고리)는 버린다. */
export function blogViewsBySlug(
  top: ReadonlyArray<{ page: string; count: number }>,
  posts: ReadonlyArray<Pick<BlogPost, "slug">>
): Map<string, number> {
  const byPath = new Map<string, string>()
  for (const post of posts) {
    if (!post.slug) continue
    byPath.set(getBlogPostPath(post.slug), post.slug)
    byPath.set(`/blog/${post.slug}`, post.slug)
  }

  const counts = new Map<string, number>()
  for (const item of top) {
    const normalized = normalizePagePath(item.page)
    let slug = byPath.get(normalized)
    if (!slug && normalized.length >= TRUNCATED_PAGE_MIN_LENGTH) {
      const candidates = posts.filter((post) => post.slug && getBlogPostPath(post.slug).startsWith(normalized))
      if (candidates.length === 1) slug = candidates[0].slug
    }
    if (!slug) continue
    counts.set(slug, (counts.get(slug) ?? 0) + item.count)
  }
  return counts
}

export interface ContentHubInstagramMedia {
  id: string
  caption?: string
  mediaType?: string
  mediaProductType?: string
  permalink?: string
  timestamp?: string
  thumbnailUrl?: string
  mediaUrl?: string
  insights: {
    views: number
    reach: number
    likes: number
    comments: number
    shares: number
    saved: number
    totalInteractions: number
  }
  insightsError?: string
}

export interface ContentHubInstagramDashboard {
  account: { username?: string; followersCount: number }
  media: ContentHubInstagramMedia[]
  followerGrowth: Array<{ date: string; value: number }>
  summary: { followerDelta: number }
}

export function instagramMediaTypeLabel(media: Pick<ContentHubInstagramMedia, "mediaType" | "mediaProductType">) {
  if (media.mediaProductType === "REELS") return "릴스"
  switch (media.mediaType) {
    case "VIDEO":
      return "영상"
    case "CAROUSEL_ALBUM":
      return "캐러셀"
    case "IMAGE":
      return "이미지"
    default:
      return "게시물"
  }
}

export function instagramCaptionTitle(caption: string | undefined, maxLength = 60) {
  const firstLine = caption?.split("\n").map((line) => line.trim()).find(Boolean) ?? ""
  if (!firstLine) return "캡션 없음"
  return firstLine.length > maxLength ? `${firstLine.slice(0, maxLength - 1)}…` : firstLine
}

export type ContentHubChannel = "blog" | "ig"

export interface ContentHubItem {
  key: string
  channel: ContentHubChannel
  title: string
  /** 블로그는 카테고리, 인스타는 게시물 종류 */
  kind: string
  dateKey: string | null
  /** 기간 안에 발행했는지 — 발행 흐름 띠에는 이것만 찍는다 */
  inWindow: boolean
  views: number | null
  /** 인스타 상호작용 합. 블로그는 아직 세지 않는다(null) */
  reactions: number | null
  thumbnailUrl: string | null
  post?: BlogPost
  media?: ContentHubInstagramMedia
}

/**
 * 표에 올릴 콘텐츠 — 블로그는 공개 글 중 기간 안에 발행했거나 기간 안에 조회된 글(오래된 인기 글이
 * 빠지지 않게), 인스타는 기간 안에 올린 게시물. 최신 발행순.
 */
export function buildContentHubItems({
  posts,
  viewsBySlug,
  media,
  window,
}: {
  posts: ReadonlyArray<BlogPost>
  viewsBySlug: ReadonlyMap<string, number> | null
  media: ReadonlyArray<ContentHubInstagramMedia> | null
  window: Pick<ContentHubWindow, "startKey" | "endKey">
}): ContentHubItem[] {
  const items: ContentHubItem[] = []

  for (const post of posts) {
    if (post.status !== "published" || post.deletedAt) continue
    const dateKey = blogPublishedDateKey(post)
    const inWindow = isKeyInWindow(dateKey, window)
    const views = viewsBySlug ? viewsBySlug.get(post.slug) ?? 0 : null
    if (!inWindow && !(views && views > 0)) continue
    items.push({
      key: `blog:${post._uuid ?? post.id}`,
      channel: "blog",
      title: post.title,
      kind: post.category || "블로그",
      dateKey,
      inWindow,
      views,
      reactions: null,
      thumbnailUrl: post.imageUrl || null,
      post,
    })
  }

  for (const row of media ?? []) {
    const dateKey = instagramDateKey(row.timestamp)
    if (!isKeyInWindow(dateKey, window)) continue
    items.push({
      key: `ig:${row.id}`,
      channel: "ig",
      title: instagramCaptionTitle(row.caption),
      kind: instagramMediaTypeLabel(row),
      dateKey,
      inWindow: true,
      views: row.insights.views,
      reactions: row.insights.totalInteractions,
      thumbnailUrl: row.thumbnailUrl || row.mediaUrl || null,
      media: row,
    })
  }

  return sortContentHubItems(items, "recent")
}

export type ContentHubSort = "recent" | "views"

export function sortContentHubItems(items: ReadonlyArray<ContentHubItem>, sort: ContentHubSort): ContentHubItem[] {
  const byViews = (a: ContentHubItem, b: ContentHubItem) => (b.views ?? -1) - (a.views ?? -1)
  const byDate = (a: ContentHubItem, b: ContentHubItem) => (b.dateKey ?? "").localeCompare(a.dateKey ?? "")
  return [...items].sort((a, b) => (sort === "views" ? byViews(a, b) || byDate(a, b) : byDate(a, b) || byViews(a, b)))
}

/** 조회수 순위(1부터) — 조회가 0인 글은 순위가 없다 */
export function blogViewRanks(viewsBySlug: ReadonlyMap<string, number>): Map<string, number> {
  const ranked = [...viewsBySlug.entries()].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1])
  return new Map(ranked.map(([slug], index) => [slug, index + 1]))
}

export interface ContentHubCadenceDay {
  key: string
  blog: number
  ig: number
  isToday: boolean
}

export interface ContentHubCadence {
  days: ContentHubCadenceDay[]
  blogCount: number
  igCount: number
  /** 첫 발행과 마지막 발행 사이를 나눈 평균 간격(일). 두 건 미만이면 null */
  blogAverageGapDays: number | null
  igAverageGapDays: number | null
}

function averageGap(keys: string[]): number | null {
  if (keys.length < 2) return null
  const sorted = [...keys].sort()
  return Math.round(daysBetweenKeys(sorted[0], sorted[sorted.length - 1]) / (sorted.length - 1))
}

export function buildContentHubCadence(items: ReadonlyArray<ContentHubItem>, window: ContentHubWindow): ContentHubCadence {
  const blogKeys: string[] = []
  const igKeys: string[] = []
  for (const item of items) {
    if (!item.inWindow || !item.dateKey) continue
    if (item.channel === "blog") blogKeys.push(item.dateKey)
    else igKeys.push(item.dateKey)
  }
  const tally = (keys: string[]) => keys.reduce((map, key) => map.set(key, (map.get(key) ?? 0) + 1), new Map<string, number>())
  const blogByDay = tally(blogKeys)
  const igByDay = tally(igKeys)
  return {
    days: window.dayKeys.map((key) => ({
      key,
      blog: blogByDay.get(key) ?? 0,
      ig: igByDay.get(key) ?? 0,
      isToday: key === window.endKey,
    })),
    blogCount: blogKeys.length,
    igCount: igKeys.length,
    blogAverageGapDays: averageGap(blogKeys),
    igAverageGapDays: averageGap(igKeys),
  }
}

/** 일별 조회 — page_view 시각(ISO) 목록을 KST 날짜 칸에 센다. 칸 밖 시각은 버린다. */
export function bucketDailyViews(timestamps: ReadonlyArray<string>, dayKeys: ReadonlyArray<string>): number[] {
  const index = new Map(dayKeys.map((key, position) => [key, position]))
  const counts = dayKeys.map(() => 0)
  for (const value of timestamps) {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) continue
    const position = index.get(kstDateKey(parsed))
    if (position !== undefined) counts[position] += 1
  }
  return counts
}
