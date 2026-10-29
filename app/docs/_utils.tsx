import type { Metadata } from "next"
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
    summary: "새 버전에서 달라진 기능과 화면",
  },
  start: {
    label: "시작하기",
    scope: "처음 시작",
    summary: "설치, 회원 가입, 비밀번호 변경, 도입 전에 묻는 질문",
  },
  software: {
    label: "소프트웨어",
    scope: "기능",
    summary: "교실과 판서 도구, 숙제·시험 같은 학습 활동, AI 튜터와 AI 평가, 요금제",
  },
  admin: {
    label: "관리자",
    scope: "운영",
    summary: "기관 설정, 교사·학생 추가, 코스 개설, 스토리지와 통계",
  },
  teacher: {
    label: "교사",
    scope: "수업",
    summary: "코스 만들기, 학습 활동 추가, 교실 설정, 수업 자료 관리",
  },
  student: {
    label: "학생",
    scope: "학습",
    summary: "코스 참여, 수업 듣기와 다시보기, 과제 제출, 성적 확인",
  },
  hardware: {
    label: "하드웨어",
    scope: "장비",
    summary: "ClassIn Board 판서와 조작, AI 카메라·마이크, 모델별 사양",
  },
  board: {
    label: "전자칠판",
    scope: "설치",
    summary: "전자칠판 배송과 설치 순서",
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

/** 문서 허브·카테고리·검색 라우트가 받는 searchParams. `?q=a&q=b` 는 배열로 들어온다. */
export type DocsSearchParams = { q?: string | string[] }

/**
 * `q` 쿼리를 문자열 하나로 정규화한다 — 배열이면 첫 값, 앞뒤 공백 제거, 없으면 "".
 * 본문과 generateMetadata 가 같은 값을 보도록 세 라우트가 모두 이 함수를 거친다.
 * (배열 `q` 에 `.trim()` 을 바로 부르면 TypeError 로 500 이 난다.)
 */
export function readQuery(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === "string" ? first.trim() : ""
}

/**
 * 검색어가 붙은 허브 URL 은 얕은 중복 페이지라 색인에서 뺀다(/docs/search 와 같은 정책).
 * canonical 은 호출한 쪽이 이미 쿼리 없는 정적 경로로 만들어 둔다.
 */
export function withSearchNoIndex(metadata: Metadata, query: string): Metadata {
  return query ? { ...metadata, robots: { index: false, follow: true } } : metadata
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
            title: "실제 설치는 본사 엔지니어 안내를 따르세요.",
            body: "네트워크와 카메라 위치는 학원마다 다릅니다. 아래 순서는 미리 알아 두는 용도로 보시면 됩니다.",
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
    description: "도입 전에 묻는 질문, 설치와 회원 가입",
  },
  {
    categoryId: "admin",
    title: "학원을 운영하고 있어요",
    description: "기관 설정, 교사·학생 추가, 코스 개설, 통계",
  },
  {
    categoryId: "teacher",
    title: "수업을 맡고 있어요",
    description: "코스 만들기, 교실 설정, 숙제·시험 내기",
  },
  {
    categoryId: "student",
    title: "수업을 듣고 있어요",
    description: "코스 참여, 수업 다시보기, 과제 제출",
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
