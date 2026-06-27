import Image from "next/image"
import type { LucideIcon } from "lucide-react"
import {
  ClipboardList,
  GraduationCap,
  LifeBuoy,
  MonitorSpeaker,
  BookOpen,
  Presentation,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react"

import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import type {
  DocsArticleSection,
  DocsArticleSummary,
  DocsCategory,
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

const categoryIcons: Partial<Record<DocCategoryId, LucideIcon>> = {
  "quick-start": Rocket,
  guides: BookOpen,
  manual: ClipboardList,
  help: LifeBuoy,
  troubleshooting: LifeBuoy,
  updates: Sparkles,
  start: Rocket,
  software: Sparkles,
  admin: ShieldCheck,
  teacher: Presentation,
  student: GraduationCap,
  hardware: MonitorSpeaker,
  board: Wrench,
}

const categoryEyebrows: Partial<Record<DocCategoryId, string>> = {
  "quick-start": "Quick Start",
  guides: "Guide",
  manual: "Manual",
  help: "Help",
  troubleshooting: "Troubleshooting",
  updates: "Updates",
  start: "Start Here",
  software: "Software",
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
  hardware: "Hardware",
  board: "Smart Board",
}

const categoryNavCopy: Partial<
  Record<DocCategoryId, { label: string; scope: string; summary: string }>
> = {
  "quick-start": {
    label: "빠른 시작",
    scope: "Quick Start",
    summary: "처음 확인할 설치와 가입 흐름을 봅니다.",
  },
  guides: {
    label: "가이드",
    scope: "Guide",
    summary: "역할과 상황별 안내를 이어서 확인합니다.",
  },
  manual: {
    label: "매뉴얼",
    scope: "Manual",
    summary: "제품 사용 기준과 세부 절차를 확인합니다.",
  },
  help: {
    label: "도움말",
    scope: "Help",
    summary: "자주 묻는 질문과 기본 해결 방법을 봅니다.",
  },
  troubleshooting: {
    label: "문제 해결",
    scope: "Troubleshooting",
    summary: "접속, 장비, 수업 중 문제를 빠르게 좁힙니다.",
  },
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

export function getCategoryIcon(categoryId: DocCategoryId) {
  return categoryIcons[categoryId] ?? ClipboardList
}

export function DocsCategoryIcon({
  categoryId,
  className,
}: {
  categoryId: DocCategoryId
  className?: string
}) {
  switch (categoryId) {
    case "start":
    case "quick-start":
      return <Rocket className={className} aria-hidden />
    case "guides":
      return <BookOpen className={className} aria-hidden />
    case "manual":
      return <ClipboardList className={className} aria-hidden />
    case "help":
    case "troubleshooting":
      return <LifeBuoy className={className} aria-hidden />
    case "updates":
      return <Sparkles className={className} aria-hidden />
    case "software":
      return <Sparkles className={className} aria-hidden />
    case "admin":
      return <ShieldCheck className={className} aria-hidden />
    case "teacher":
      return <Presentation className={className} aria-hidden />
    case "student":
      return <GraduationCap className={className} aria-hidden />
    case "hardware":
      return <MonitorSpeaker className={className} aria-hidden />
    case "board":
      return <Wrench className={className} aria-hidden />
    default:
      return <ClipboardList className={className} aria-hidden />
  }
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

export function toCategoryCard(
  category: DocCategory,
  content = staticDocsContent
): DocsCategory {
  const articles = content.docs
    .filter((doc) => doc.category === category.id && isListedDoc(doc))
    .slice(0, 3)

  return {
    title: category.title,
    description: category.description,
    href: getDocCategoryPath(category.id),
    eyebrow: categoryEyebrows[category.id] ?? category.title,
    icon: categoryIcons[category.id],
    articles: articles.map((doc) => ({
      title: doc.title,
      href: getDocPath(doc),
      description: doc.description,
    })),
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

export function getDocsCategoryCards(content = staticDocsContent) {
  return content.categories.map((category) => toCategoryCard(category, content))
}

export const docsTrustCards = [
  {
    title: "역할별로 바로 찾을 수 있게",
    description:
      "관리자·교사·학생 누구든 맡은 역할에 맞춰 필요한 안내를 한곳에서 찾아볼 수 있게 정리했습니다.",
    icon: Wrench,
  },
  {
    title: "수업 중 막히는 순간에도 빠르게",
    description:
      "장비 설정, 접속, 자료 활용처럼 자주 만나는 상황은 단계별 절차로 정리해 즉시 따라 할 수 있습니다.",
    icon: LifeBuoy,
  },
  {
    title: "공식 채널 가이드와 한 흐름으로",
    description:
      "channel.io의 공식 가이드 내용을 기반으로 정리해 가장 최신 사용 방법을 그대로 확인할 수 있습니다.",
    icon: Sparkles,
  },
]

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
