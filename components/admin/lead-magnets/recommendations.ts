/**
 * 자료 퍼널 「이번 주 손볼 곳」·「추천」 — 성과 집계·품질 점검·블로그 연결에서 할 일을 뽑는다.
 *
 * 규칙(기간 = 화면에서 고른 7·14·30·90일):
 * - quality  품질 점검의 「고쳐야 함(fix)」이 있는 자료.
 * - cta      조회 30회 이상인데 신청률이 전체 평균의 절반 아래.
 * - exposure 공개 자료인데 기간 안 노출·조회가 0.
 * - link     공개 블로그 글 중 기간 조회 100회 이상인데 붙은 자료가 없는 글 — 글 제목·라벨과
 *            자료 문구가 겹치는 자료를 하나 권한다(겹침 2개 미만이면 권하지 않는다).
 * - lead     리드 10명 이상인데 상담 전환율이 전체 평균의 절반 아래.
 * 정렬은 quality → cta → exposure → link → lead.
 * 성과 집계가 일부 실패한 응답(warning)이면 성과 규칙(cta·exposure·lead)은 내지 않는다.
 */
import type { LeadMagnet } from "@/lib/lead-magnets"
import type { LeadMagnetQualityArea, LeadMagnetQualityIssue } from "@/lib/lead-magnet-quality"
import { formatPercent, type LeadMagnetMetricsResponse } from "./model"

export type RecommendationKind = "quality" | "cta" | "exposure" | "link" | "lead"

export type RecommendationTarget =
  | { kind: "panel"; tab: "edit" | "perf" | "rec"; surface?: "blog" | "page"; focus?: string }
  | { kind: "full"; area: LeadMagnetQualityArea }
  | { kind: "blog"; href: string }

export interface Recommendation {
  id: string
  kind: RecommendationKind
  slug: string
  text: string
  why: string
  actionLabel: string
  target: RecommendationTarget
}

export interface RecommendationBlogPost {
  id: string
  slug: string
  title: string
  published: boolean
  leadMagnetSlug?: string
  category?: string
  tags?: readonly string[]
}

export const RECOMMENDATION_KIND_LABEL: Record<RecommendationKind, string> = {
  quality: "품질 점검",
  cta: "신청률",
  exposure: "노출",
  link: "글 연결",
  lead: "상담 연결",
}

const ORDER: RecommendationKind[] = ["quality", "cta", "exposure", "link", "lead"]

const CTA_MIN_VIEWS = 30
const LEAD_MIN_LEADS = 10
const LINK_MIN_VIEWS = 100
const LINK_MIN_OVERLAP = 2
const LINK_MAX = 3

function tokens(text: string) {
  return Array.from(new Set(text.split(/[^0-9A-Za-z가-힣]+/).map((token) => token.trim()).filter((token) => token.length >= 2)))
}

/** 글 제목·라벨·카테고리 낱말 중 자료 문구(제목·요약·대상·블로그 톤·추천 배치)에 나오는 개수 */
export function magnetPostOverlap(magnet: LeadMagnet, post: Pick<RecommendationBlogPost, "title" | "tags" | "category">) {
  const haystack = [magnet.title, magnet.summary, magnet.audience, magnet.blogTone, ...magnet.suggestedPlacements].join(" ")
  const words = tokens([post.title, post.category ?? "", ...(post.tags ?? [])].join(" "))
  return words.filter((word) => haystack.includes(word)).length
}

export function buildRecommendations({
  magnets,
  metrics: rawMetrics,
  qualityBySlug,
  blogPosts,
  blogViews,
}: {
  magnets: readonly LeadMagnet[]
  metrics: LeadMagnetMetricsResponse | null
  qualityBySlug: ReadonlyMap<string, readonly LeadMagnetQualityIssue[]>
  blogPosts: readonly RecommendationBlogPost[] | null
  blogViews: ReadonlyMap<string, number> | null
}): Recommendation[] {
  const recs: Recommendation[] = []
  const days = rawMetrics?.days ?? 30
  // 집계가 일부 실패했으면(warning) 0 이 「없음」인지 「못 읽음」인지 모른다 — 성과 규칙은 쉰다
  const metrics = rawMetrics?.warning ? null : rawMetrics
  const rows = new Map((metrics?.byLeadMagnet ?? []).map((row) => [row.slug, row]))
  const totals = metrics?.totals
  const avgRate = totals && totals.views > 0 ? totals.submissions / totals.views : null
  const avgLeadRate = totals && totals.leads > 0 ? totals.convertedLeads / totals.leads : null

  for (const magnet of magnets) {
    const fixes = (qualityBySlug.get(magnet.slug) ?? []).filter((issue) => issue.severity === "fix")
    if (fixes.length > 0) {
      recs.push({
        id: `quality:${magnet.slug}`,
        kind: "quality",
        slug: magnet.slug,
        text: `「${magnet.title}」 ${fixes[0].message}`,
        why: fixes.length > 1 ? `고칠 곳 ${fixes.length}개 · 품질 점검` : `${fixes[0].where ?? "자료"} · 품질 점검`,
        actionLabel: "고치기",
        target: { kind: "full", area: fixes[0].area },
      })
    }

    if (!metrics) continue
    const row = rows.get(magnet.slug)
    const views = row?.views ?? 0
    const submissions = row?.submissions ?? 0

    if (avgRate !== null && views >= CTA_MIN_VIEWS && submissions / views < avgRate / 2) {
      recs.push({
        id: `cta:${magnet.slug}`,
        kind: "cta",
        slug: magnet.slug,
        text: `「${magnet.title}」 조회는 많은데 신청이 적습니다`,
        why: `조회 ${views.toLocaleString("ko-KR")} · 신청 ${submissions.toLocaleString("ko-KR")} (${formatPercent((submissions / views) * 100)}) · 전체 평균 ${formatPercent(avgRate * 100)}`,
        actionLabel: "CTA 고치기",
        target: { kind: "panel", tab: "edit", surface: "blog", focus: "ctaCopy.title" },
      })
    }

    if (magnet.published && (row?.impressions ?? 0) === 0 && views === 0) {
      recs.push({
        id: `exposure:${magnet.slug}`,
        kind: "exposure",
        slug: magnet.slug,
        text: `「${magnet.title}」가 최근 ${days}일 동안 노출되지 않았습니다`,
        why: magnet.suggestedPlacements.length > 0 ? `노출 0 · 추천 배치 ${magnet.suggestedPlacements.length}곳이 적혀 있음` : "노출 0 · 추천 배치 없음",
        actionLabel: "배치 보기",
        target: { kind: "panel", tab: "perf" },
      })
    }

    const leads = row?.leads ?? 0
    const converted = row?.convertedLeads ?? 0
    if (avgLeadRate !== null && leads >= LEAD_MIN_LEADS && converted / leads < avgLeadRate / 2) {
      recs.push({
        id: `lead:${magnet.slug}`,
        kind: "lead",
        slug: magnet.slug,
        text: `「${magnet.title}」 신청자가 상담까지 잘 이어지지 않습니다`,
        why: `리드 ${leads.toLocaleString("ko-KR")} 중 전환 ${converted.toLocaleString("ko-KR")} · 전체 평균 ${formatPercent(avgLeadRate * 100)}`,
        actionLabel: "세일즈 응대 보기",
        target: { kind: "full", area: "sales" },
      })
    }
  }

  if (blogPosts && blogViews) {
    const known = new Set(magnets.map((magnet) => magnet.slug))
    const candidates = blogPosts
      .filter((post) => post.published && !(post.leadMagnetSlug && known.has(post.leadMagnetSlug)))
      .map((post) => ({ post, views: blogViews.get(post.slug) ?? 0 }))
      .filter((entry) => entry.views >= LINK_MIN_VIEWS)
      .sort((a, b) => b.views - a.views)
    let added = 0
    for (const { post, views } of candidates) {
      if (added >= LINK_MAX) break
      const best = magnets
        .filter((magnet) => magnet.published)
        .map((magnet) => ({ magnet, score: magnetPostOverlap(magnet, post) }))
        .sort((a, b) => b.score - a.score)[0]
      if (!best || best.score < LINK_MIN_OVERLAP) continue
      added += 1
      recs.push({
        id: `link:${post.slug}`,
        kind: "link",
        slug: best.magnet.slug,
        text: `블로그 「${post.title}」에 「${best.magnet.title}」를 붙여 보세요`,
        why: `블로그 최근 ${days}일 조회 ${views.toLocaleString("ko-KR")}회 · 붙은 자료 없음`,
        actionLabel: "글 열기",
        target: { kind: "blog", href: `/admin/blog/${encodeURIComponent(post.id)}/edit` },
      })
    }
  }

  return recs.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}

/** page-views API 의 `/blog/…` 경로 → 글 slug 별 조회수. 목록·카테고리 화면은 버린다. */
export function blogViewsFromTop(top: ReadonlyArray<{ page: string; count: number }>, slugs: ReadonlySet<string>) {
  const views = new Map<string, number>()
  for (const item of top) {
    const raw = item.page.split("?")[0].replace(/\/+$/, "").replace(/^\/blog\//, "")
    let slug = raw
    try {
      slug = decodeURIComponent(raw)
    } catch {
      // 저장 길이에서 잘린 긴 한글 경로 — 그대로 둔다(맞는 글이 없으면 버려진다)
    }
    if (!slugs.has(slug)) continue
    views.set(slug, (views.get(slug) ?? 0) + item.count)
  }
  return views
}
