import Image from "next/image"

import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import type {
  DocsArticleSection,
  DocsArticleSummary,
  DocsCategoryNavItem,
  DocsNavGroup,
  DocsTocItem,
} from "@/components/docs"
import {
  docsCategories,
  getDocCategoryPath,
  getDocPath,
  listDocs,
  type DocArticle,
  type DocCategory,
  type DocCategoryId,
  type DocMedia,
} from "@/lib/docs"
import type { DocsContent } from "@/lib/docs-content"

const staticDocsContent: DocsContent = {
  categories: docsCategories,
  docs: listDocs(),
}

const categoryNavCopy: Partial<
  Record<DocCategoryId, { label: string; scope: string; summary: string }>
> = {
  updates: {
    label: "업데이트",
    scope: "변경",
    summary: "새 기능과 변경 사항을 확인합니다.",
  },
  start: {
    label: "시작하기",
    scope: "처음 시작",
    summary: "설치, 회원 가입, 비밀번호 변경을 빠르게 확인합니다.",
  },
  software: {
    label: "소프트웨어",
    scope: "기능",
    summary: "수업 도구, 학습 활동, LMS, AI 기능을 봅니다.",
  },
  admin: {
    label: "관리자",
    scope: "운영",
    summary: "코스, 교사, 학생, 스토리지 관리를 점검합니다.",
  },
  teacher: {
    label: "교사",
    scope: "수업",
    summary: "코스 생성, 학습 활동, 교실 설정을 확인합니다.",
  },
  student: {
    label: "학생",
    scope: "학습",
    summary: "코스 참여, 수업 듣기, 과제 제출을 찾습니다.",
  },
  hardware: {
    label: "하드웨어",
    scope: "장비",
    summary: "보드 라인업, 판서, 디스플레이, AI 카메라를 봅니다.",
  },
  board: {
    label: "전자칠판",
    scope: "설치",
    summary: "전자칠판 배송과 설치 흐름을 확인합니다.",
  },
}

function isListedDoc(doc: DocArticle) {
  return (doc.visibility ?? "public") === "public" && !doc.noindex
}

function getFallbackCategoryLabel(category: DocCategory) {
  const bracketLabel = category.title.match(/^\[(.+?)\]/)?.[1]
  if (bracketLabel) return bracketLabel

  return category.title
    .replace(/^클래스인\s*/, "")
    .replace(/\s*(기능|사용)?\s*가이드$/, "")
    .trim()
}

function getDocSearchText(doc: DocArticle) {
  return [
    doc.title,
    doc.description,
    doc.audience,
    doc.chatbotSummary,
    ...doc.tags,
    ...doc.keywords,
    ...(doc.resources?.flatMap((resource) => [
      resource.label,
      resource.description ?? "",
      resource.href,
    ]) ?? []),
    ...doc.sections.flatMap((section) => [
      section.heading,
      section.body,
      ...(section.steps ?? []),
      ...(section.media?.flatMap((media) => [media.alt, media.caption ?? "", media.src]) ?? []),
    ]),
  ].join(" ")
}

export function formatDocDate(date: string) {
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function toArticleSummary(
  doc: DocArticle,
  categories = docsCategories
): DocsArticleSummary {
  const category = categories.find((item) => item.id === doc.category)

  return {
    title: doc.title,
    description: doc.description,
    href: getDocPath(doc),
    category: category?.title,
    readTime: `${doc.readMinutes}분 읽기`,
    updatedAt: formatDocDate(doc.updatedAt),
    tags: doc.tags,
    searchText: getDocSearchText(doc),
  }
}

export function toArticleSections(doc: DocArticle): DocsArticleSection[] {
  return doc.sections.map((section, index) => ({
    id: `section-${index + 1}`,
    title: section.heading,
    body: section.body ? <BlogMarkdownRenderer markdown={section.body} /> : null,
    checklist: section.steps?.map((step) => ({
      label: step,
      checked: true,
    })),
    callout:
      doc.category === "board" && index === 0
        ? {
            title: "전자칠판 설치는 현장 환경에 맞춰 진행하세요.",
            body: "네트워크와 카메라 위치는 학원마다 다릅니다. 단계별 절차는 참고용으로 보고, 실제 설치 시에는 본사 엔지니어 안내를 우선합니다.",
            tone: "info" as const,
          }
        : undefined,
    children: section.media?.length ? <DocsSectionMedia media={section.media} /> : undefined,
  }))
}

function DocsSectionMedia({ media }: { media: DocMedia[] }) {
  return (
    <div className="space-y-5">
      {media.map((item) => (
        <figure key={item.src} className="overflow-hidden rounded-lg border border-black/[0.08] bg-white">
          {item.type === "image" ? (
            <Image
              src={item.src}
              alt={item.alt}
              width={item.width ?? 1440}
              height={item.height ?? 900}
              sizes="(min-width: 1024px) 760px, calc(100vw - 32px)"
              unoptimized={item.src.startsWith("/")}
              className={
                item.width && item.height && item.height > item.width
                  ? "mx-auto h-auto max-h-[640px] w-auto max-w-full object-contain"
                  : "h-auto w-full object-contain"
              }
            />
          ) : (
            <video
              controls
              preload="metadata"
              src={item.src}
              className="block w-full bg-black"
            >
              {item.alt}
            </video>
          )}
          {item.caption ? (
            <figcaption className="border-t border-black/[0.08] px-4 py-3 text-sm leading-6 text-[#615D59]">
              {item.caption}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  )
}

export function toTocItems(doc: DocArticle): DocsTocItem[] {
  return doc.sections.map((section, index) => ({
    id: `section-${index + 1}`,
    title: section.heading,
  }))
}

export function getDocsNavGroups(
  activePath?: string,
  content = staticDocsContent
): DocsNavGroup[] {
  return content.categories.map((category) => ({
    title: category.title,
    links: content.docs.filter((doc) => doc.category === category.id && isListedDoc(doc)).map((doc) => {
      const href = getDocPath(doc)

      return {
        title: doc.title,
        href,
        description: doc.description,
        isActive: href === activePath,
      }
    }),
  }))
}

export function getAllDocsSummaries(content = staticDocsContent) {
  return content.docs
    .filter(isListedDoc)
    .map((doc) => toArticleSummary(doc, content.categories))
}

export function getDocsCategoryNavItems(
  content = staticDocsContent,
  activeCategoryId?: DocCategoryId
): DocsCategoryNavItem[] {
  return content.categories
    .map((category) => {
      const articleCount = content.docs.filter(
        (doc) => doc.category === category.id && isListedDoc(doc)
      ).length
      const copy = categoryNavCopy[category.id]

      return {
        articleCount,
        categoryId: category.id,
        href: getDocCategoryPath(category.id),
        label: copy?.label ?? getFallbackCategoryLabel(category),
        meta: `${copy?.scope ?? "가이드"} · ${articleCount}개`,
        description: copy?.summary ?? category.description,
        isActive: category.id === activeCategoryId,
      }
    })
    .filter((item) => item.articleCount > 0 || item.categoryId === activeCategoryId)
    .map((item) => ({
      href: item.href,
      label: item.label,
      meta: item.meta,
      description: item.description,
      isActive: item.isActive,
    }))
}

export interface GuideLink {
  title: string
  href: string
}

export interface GuideIntentCard {
  categoryId: DocCategoryId
  href: string
  kicker: string
  title: string
  description: string
  image: string
  links: GuideLink[]
}

export interface GuideProductTile {
  categoryId: DocCategoryId
  href: string
  caption: string
  label: string
  description: string
  count: number
}

const GUIDE_INTENT_COPY: Array<{
  categoryId: DocCategoryId
  title: string
  description: string
}> = [
  {
    categoryId: "start",
    title: "도입을 검토하고 있어요",
    description: "설치와 가입부터 도입 전 확인 사항까지",
  },
  {
    categoryId: "admin",
    title: "학원을 운영하고 있어요",
    description: "기관 설정, 코스·교사·학생 관리, 통계",
  },
  {
    categoryId: "teacher",
    title: "수업을 진행해요",
    description: "교실 설정, 학습 활동, 수업 도구",
  },
  {
    categoryId: "student",
    title: "수업에 참여해요",
    description: "코스 참여, 수업 듣기, 과제 제출",
  },
]

const GUIDE_PRODUCT_LABELS: Array<{ categoryId: DocCategoryId; label: string }> = [
  { categoryId: "software", label: "소프트웨어 가이드" },
  { categoryId: "hardware", label: "하드웨어 가이드" },
  { categoryId: "updates", label: "업데이트" },
]

// 라운드로빈 큐레이션 순서 — 역할(시작/운영/수업)을 먼저 노출하고 제품·학생·업데이트로 채운다.
const CURATED_FEATURED_ORDER: DocCategoryId[] = [
  "start",
  "admin",
  "teacher",
  "software",
  "hardware",
  "student",
  "updates",
]

// 설치 안내는 시작하기 → 하드웨어 순으로 노출한다(소프트웨어 설치가 먼저 필요한 동선).
const INSTALL_CATEGORY_ORDER: DocCategoryId[] = ["start", "hardware"]

function getListedDocsByCategory(content: DocsContent, categoryId: DocCategoryId) {
  return content.docs.filter((doc) => doc.category === categoryId && isListedDoc(doc))
}

export function getGuideIntentCards(content = staticDocsContent): GuideIntentCard[] {
  const availableCategoryIds = new Set(content.categories.map((category) => category.id))

  return GUIDE_INTENT_COPY.filter((intent) => availableCategoryIds.has(intent.categoryId)).map(
    (intent) => {
      const listed = getListedDocsByCategory(content, intent.categoryId)
      // featured 를 앞으로 끌어올리되 원래 정렬 순서는 유지한다.
      const ordered = [...listed.filter((doc) => doc.featured), ...listed.filter((doc) => !doc.featured)]
      const copy = categoryNavCopy[intent.categoryId]

      return {
        categoryId: intent.categoryId,
        href: getDocCategoryPath(intent.categoryId),
        kicker: `${copy?.label ?? intent.title} · ${listed.length}개`,
        title: intent.title,
        description: intent.description,
        image: `/images/docs/guide/intent-${intent.categoryId}.png`,
        links: ordered.slice(0, 3).map((doc) => ({ title: doc.title, href: getDocPath(doc) })),
      }
    }
  )
}

export function getGuideProductTiles(content = staticDocsContent): GuideProductTile[] {
  // updates 는 Supabase 병합 콘텐츠에만 있을 수 있어 카테고리 존재 여부를 먼저 확인한다.
  const availableCategoryIds = new Set(content.categories.map((category) => category.id))

  return GUIDE_PRODUCT_LABELS.filter((tile) => availableCategoryIds.has(tile.categoryId))
    .map((tile) => {
      const count = getListedDocsByCategory(content, tile.categoryId).length
      const copy = categoryNavCopy[tile.categoryId]

      return {
        categoryId: tile.categoryId,
        href: getDocCategoryPath(tile.categoryId),
        caption: `${copy?.scope ?? "가이드"} · ${count}개`,
        label: tile.label,
        description: copy?.summary ?? "",
        count,
      }
    })
    .filter((tile) => tile.count > 0)
}

export function getCuratedFeaturedSummaries(
  content = staticDocsContent,
  limit = 6
): DocsArticleSummary[] {
  const pools = new Map<DocCategoryId, { featured: DocArticle[]; rest: DocArticle[] }>()
  for (const categoryId of CURATED_FEATURED_ORDER) {
    const listed = getListedDocsByCategory(content, categoryId)
    pools.set(categoryId, {
      featured: listed.filter((doc) => doc.featured),
      rest: listed.filter((doc) => !doc.featured),
    })
  }

  const picked: DocArticle[] = []
  const usedHrefs = new Set<string>()
  let progressed = true

  // 카테고리를 한 바퀴씩 돌며 featured 를 우선 소진하고, 없으면 남은 문서로 채운다.
  while (picked.length < limit && progressed) {
    progressed = false

    for (const categoryId of CURATED_FEATURED_ORDER) {
      if (picked.length >= limit) break

      const pool = pools.get(categoryId)
      const next = pool?.featured.shift() ?? pool?.rest.shift()
      if (!next) continue

      progressed = true
      const href = getDocPath(next)
      if (usedHrefs.has(href)) continue

      usedHrefs.add(href)
      picked.push(next)
    }
  }

  return picked.map((doc) => toArticleSummary(doc, content.categories))
}

export function getInstallGuideLinks(content = staticDocsContent, limit = 3): GuideLink[] {
  return content.docs
    .filter((doc) => isListedDoc(doc) && doc.title.includes("설치"))
    .map((doc, index) => ({ doc, index }))
    .sort((a, b) => {
      // 순서 밖 카테고리는 뒤로 밀되 원래 등장 순서를 유지한다.
      const rankA = INSTALL_CATEGORY_ORDER.indexOf(a.doc.category)
      const rankB = INSTALL_CATEGORY_ORDER.indexOf(b.doc.category)
      const normalizedA = rankA === -1 ? INSTALL_CATEGORY_ORDER.length : rankA
      const normalizedB = rankB === -1 ? INSTALL_CATEGORY_ORDER.length : rankB
      if (normalizedA !== normalizedB) return normalizedA - normalizedB
      return a.index - b.index
    })
    .slice(0, limit)
    .map(({ doc }) => ({ title: doc.title, href: getDocPath(doc) }))
}

export function scoreDocsArticle(doc: DocsArticleSummary, query: string): number {
  const tokens = query.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 0

  const titleLower = doc.title.toLowerCase()
  const descLower = doc.description.toLowerCase()
  const categoryLower = (doc.category ?? "").toLowerCase()
  const tagsLower = (doc.tags ?? []).map((t: string) => t.toLowerCase())
  const searchTextLower = (doc.searchText ?? "").toLowerCase()

  let score = 0
  let matchesAll = true

  for (const token of tokens) {
    let tokenMatched = false

    if (titleLower.includes(token)) {
      score += 100
      tokenMatched = true
    }
    if (descLower.includes(token)) {
      score += 50
      tokenMatched = true
    }
    if (tagsLower.some((t: string) => t.includes(token))) {
      score += 30
      tokenMatched = true
    }
    if (categoryLower.includes(token)) {
      score += 10
      tokenMatched = true
    }
    if (searchTextLower.includes(token)) {
      score += 10
      tokenMatched = true
    }

    if (!tokenMatched) {
      matchesAll = false
    }
  }

  // Bonus for matching all tokens (AND-match gets high priority)
  if (matchesAll && tokens.length > 1) {
    score += 500
  }

  return score
}
