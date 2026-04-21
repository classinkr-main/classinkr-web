import type { LucideIcon } from "lucide-react"
import {
  BookOpen,
  CircleHelp,
  ClipboardList,
  FileText,
  LifeBuoy,
  Rocket,
  Sparkles,
  Wrench,
} from "lucide-react"

import type {
  DocsArticleSection,
  DocsArticleSummary,
  DocsCategory,
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
} from "@/lib/docs"
import type { DocsContent } from "@/lib/docs-content"

const staticDocsContent: DocsContent = {
  categories: docsCategories,
  docs: listDocs(),
}

const categoryIcons: Record<DocCategoryId, LucideIcon> = {
  "quick-start": Rocket,
  guides: BookOpen,
  manual: FileText,
  help: CircleHelp,
  troubleshooting: LifeBuoy,
  updates: Sparkles,
}

const categoryEyebrows: Record<DocCategoryId, string> = {
  "quick-start": "Start Here",
  guides: "Guides",
  manual: "Manual",
  help: "FAQ & CS",
  troubleshooting: "Troubleshooting",
  updates: "Updates",
}

function isListedDoc(doc: DocArticle) {
  return (doc.visibility ?? "public") === "public" && !doc.noindex
}

function getDocSearchText(doc: DocArticle) {
  return [
    doc.title,
    doc.description,
    doc.audience,
    doc.chatbotSummary,
    ...doc.tags,
    ...doc.keywords,
    ...doc.sections.flatMap((section) => [
      section.heading,
      section.body,
      ...(section.steps ?? []),
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
    case "quick-start":
      return <Rocket className={className} aria-hidden />
    case "guides":
      return <BookOpen className={className} aria-hidden />
    case "manual":
      return <FileText className={className} aria-hidden />
    case "help":
      return <CircleHelp className={className} aria-hidden />
    case "troubleshooting":
      return <LifeBuoy className={className} aria-hidden />
    case "updates":
      return <Sparkles className={className} aria-hidden />
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
    eyebrow: categoryEyebrows[category.id],
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
    body: <p>{section.body}</p>,
    checklist: section.steps?.map((step) => ({
      label: step,
      checked: true,
    })),
    callout:
      doc.category === "troubleshooting" && index === 0
        ? {
            title: "수업 중이라면 먼저 빠른 복구를 우선하세요.",
            body: "원인 분석은 수업 이후에 진행하고, 학생에게는 재입장 또는 대체 접속 안내를 짧게 전달하는 것이 좋습니다.",
            tone: "info" as const,
          }
        : undefined,
  }))
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

export function getDocsCategoryCards(content = staticDocsContent) {
  return content.categories.map((category) => toCategoryCard(category, content))
}

export const docsTrustCards = [
  {
    title: "가이드는 공개하고, 문제 해결은 필요한 순간에 보이게",
    description:
      "에러 조치 문서는 감추지 않습니다. 다만 제품 첫인상에서는 덜 드러내고, 검색·FAQ·챗봇에서 바로 찾을 수 있게 설계했습니다.",
    icon: Wrench,
  },
  {
    title: "챗봇이 읽기 좋은 원본 문서",
    description:
      "각 문서는 대상, 증상, 키워드, 요약을 함께 담아 상담 챗봇이 같은 기준으로 답변할 수 있도록 준비했습니다.",
    icon: LifeBuoy,
  },
  {
    title: "업데이트까지 하나의 흐름으로",
    description:
      "신규 기능과 운영 변경사항은 업데이트 문서로 남겨, 원장님과 운영팀이 바뀐 점을 빠르게 확인할 수 있게 합니다.",
    icon: Sparkles,
  },
]
