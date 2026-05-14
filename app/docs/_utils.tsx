import type { LucideIcon } from "lucide-react"
import {
  ClipboardList,
  GraduationCap,
  LifeBuoy,
  MonitorSpeaker,
  Presentation,
  Rocket,
  ShieldCheck,
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
  start: Rocket,
  admin: ShieldCheck,
  teacher: Presentation,
  student: GraduationCap,
  board: MonitorSpeaker,
}

const categoryEyebrows: Record<DocCategoryId, string> = {
  start: "Start Here",
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
  board: "Smart Board",
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
    ...(doc.resources?.flatMap((resource) => [
      resource.label,
      resource.description ?? "",
      resource.href,
    ]) ?? []),
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
    case "start":
      return <Rocket className={className} aria-hidden />
    case "admin":
      return <ShieldCheck className={className} aria-hidden />
    case "teacher":
      return <Presentation className={className} aria-hidden />
    case "student":
      return <GraduationCap className={className} aria-hidden />
    case "board":
      return <MonitorSpeaker className={className} aria-hidden />
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
      doc.category === "board" && index === 0
        ? {
            title: "전자칠판 설치는 현장 환경에 맞춰 진행하세요.",
            body: "네트워크와 카메라 위치는 학원마다 다릅니다. 단계별 절차는 참고용으로 보고, 실제 설치 시에는 본사 엔지니어 안내를 우선합니다.",
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
