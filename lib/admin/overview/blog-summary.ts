import { DEFAULT_BLOG_CTA, type BlogPostStatus } from "@/lib/blog-types"

export interface AdminBlogOverviewSourceRow {
  id: string
  title: string
  category: string | null
  authorName: string | null
  status: string | null
  ctaText: string | null
  ctaUrl: string | null
  publishedAt: string | null
  updatedAt: string | null
}

export interface AdminBlogOverviewRecentPost {
  id: string
  title: string
  category: string
  author: string
  status: BlogPostStatus
  publishedAt?: string
  updatedAt?: string
}

export interface AdminBlogOverviewSummary {
  totalPosts: number
  draftPosts: number
  publishedPosts: number
  ctaCoverage: number
  publishedPostsWithoutCta: number
  recentPosts: AdminBlogOverviewRecentPost[]
}

function normalizeStatus(status: string | null): BlogPostStatus {
  const normalized = status?.toLowerCase()
  if (normalized === "review" || normalized === "published" || normalized === "archived") {
    return normalized
  }
  return "draft"
}

function timestamp(value: string | null) {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function hasCompleteCta(row: AdminBlogOverviewSourceRow) {
  // getAllPosts()의 legacy 변환과 같은 기본값 규칙을 유지한다. DB 값이 null이면
  // 기본 CTA가 적용되고, 명시적으로 빈 문자열을 저장한 경우만 미완성으로 본다.
  const ctaText = row.ctaText ?? DEFAULT_BLOG_CTA.buttonLabel
  const ctaUrl = row.ctaUrl ?? DEFAULT_BLOG_CTA.buttonHref
  return Boolean(ctaText.trim() && ctaUrl.trim())
}

export function buildAdminBlogOverviewSummary(
  rows: AdminBlogOverviewSourceRow[]
): AdminBlogOverviewSummary {
  const normalizedRows = rows.map((row) => ({ row, status: normalizeStatus(row.status) }))
  const publishedRows = normalizedRows.filter(({ status }) => status === "published")
  const publishedWithCta = publishedRows.filter(({ row }) => hasCompleteCta(row)).length

  return {
    totalPosts: normalizedRows.length,
    draftPosts: normalizedRows.filter(({ status }) => status === "draft").length,
    publishedPosts: publishedRows.length,
    ctaCoverage:
      publishedRows.length > 0
        ? Math.round((publishedWithCta / publishedRows.length) * 100)
        : 0,
    publishedPostsWithoutCta: Math.max(0, publishedRows.length - publishedWithCta),
    recentPosts: [...normalizedRows]
      .sort(
        (a, b) =>
          timestamp(b.row.updatedAt ?? b.row.publishedAt) -
          timestamp(a.row.updatedAt ?? a.row.publishedAt)
      )
      .slice(0, 4)
      .map(({ row, status }) => ({
        id: row.id,
        title: row.title,
        category: row.category ?? "전체",
        author: row.authorName ?? "",
        status,
        publishedAt: row.publishedAt ?? undefined,
        updatedAt: row.updatedAt ?? undefined,
      })),
  }
}
