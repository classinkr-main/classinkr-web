"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  Download,
  Eye,
  ExternalLink,
  HelpCircle,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  RotateCcw,
  Route,
  Save,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Wand2,
  X,
} from "lucide-react"

import { type RichMarkdownEditorHandle } from "@/components/admin/RichMarkdownEditor"
import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import {
  DocsArticle,
  DocsSidebar,
  DocsTableOfContents,
  type DocsArticleSection,
  type DocsNavGroup,
  type DocsTocItem,
} from "@/components/docs"
import { adminFetch, adminFetchJson } from "@/lib/admin-client"
import type { AdminDocsContentResponse } from "@/lib/admin-docs"
import {
  PATH_STEP_EXAMPLE,
  PATH_STEP_MARKDOWN,
  getDocsEditorHelp,
  restorePathStepMarkup,
} from "@/lib/admin/docs-editor-usability"
import {
  DROPPED_INTRO_WARNING,
  buildContentJson,
  estimateReadMinutes,
  hasDroppedIntroContent,
  markdownToSections,
  reconcileSectionsWithPrevious,
  type StructuredDocMedia,
  type StructuredDocSection,
} from "@/lib/admin/docs-markdown"
import type {
  DocsArticleAnalyticsDetail,
  DocsArticleDetail,
  DocsArticleDifficulty,
  DocsArticleDocType,
  DocsArticleDraftDetail,
  DocsArticleRelationDetail,
  DocsArticleProductArea,
  DocsArticleStatus,
  DocsArticleVersionDetail,
  DocsArticleVisibility,
} from "@/lib/repositories/docs-articles"

interface DocsCategoryOption {
  id: string
  title: string
}

interface Props {
  mode: "create" | "edit"
  categories: DocsCategoryOption[]
  article: DocsArticleDetail | null
}

/** 문서 쓰기 API는 챗봇 인덱스 갱신 실패 시 reindexWarning을 함께 내려준다. */
type DocsArticleDetailResponse = DocsArticleDetail & { reindexWarning?: string }

type RelationType = NonNullable<DocsArticleRelationDetail["relationType"]>

interface ArticleOption {
  id: string
  title: string
  categoryId: string
  slug: string
  status: string
  orderIndex: number
  publicPath: string
}

interface RelationsResponse {
  relations: DocsArticleRelationDetail[]
  warning?: string
}

interface VersionsResponse {
  versions: DocsArticleVersionDetail[]
  warning?: string
}

interface DraftResponse {
  draft: DocsArticleDraftDetail | null
  warning?: string
}

interface EditorSupportState {
  articleOptions: ArticleOption[]
  relations: DocsArticleRelationDetail[]
  versions: DocsArticleVersionDetail[]
  analytics: DocsArticleAnalyticsDetail | null
  draft: DocsArticleDraftDetail | null
  warning: string | null
}

const STATUS_OPTIONS: { value: DocsArticleStatus; label: string; tone: string }[] = [
  { value: "draft", label: "초안", tone: "border-[#e8e8e4] bg-white text-[#1a1a1a]/55" },
  { value: "review", label: "리뷰", tone: "border-amber-100 bg-amber-50 text-amber-700" },
  { value: "published", label: "게시됨", tone: "border-emerald-100 bg-emerald-50 text-emerald-700" },
  { value: "archived", label: "보관", tone: "border-[#e8e8e4] bg-[#f5f5f2] text-[#1a1a1a]/45" },
]

const VISIBILITY_OPTIONS: { value: DocsArticleVisibility; label: string }[] = [
  { value: "public", label: "공개" },
  { value: "unlisted", label: "링크/SEO만" },
  { value: "internal", label: "내부" },
]

const DOC_TYPE_OPTIONS: { value: DocsArticleDocType; label: string }[] = [
  { value: "guide", label: "가이드" },
  { value: "manual", label: "매뉴얼" },
  { value: "faq", label: "FAQ" },
  { value: "troubleshooting", label: "문제 해결" },
  { value: "release_note", label: "업데이트" },
  { value: "reference", label: "레퍼런스" },
]

const PRODUCT_AREA_OPTIONS: { value: DocsArticleProductArea; label: string }[] = [
  { value: "general", label: "공통" },
  { value: "software", label: "소프트웨어" },
  { value: "hardware", label: "하드웨어" },
  { value: "billing", label: "결제" },
  { value: "onboarding", label: "온보딩" },
  { value: "classroom", label: "수업 운영" },
  { value: "admin", label: "관리자" },
  { value: "partner", label: "파트너" },
]

const DIFFICULTY_OPTIONS: { value: DocsArticleDifficulty; label: string }[] = [
  { value: "beginner", label: "기본" },
  { value: "intermediate", label: "중급" },
  { value: "advanced", label: "고급" },
]

const RELATION_TYPE_OPTIONS: { value: RelationType; label: string }[] = [
  { value: "related", label: "함께 보기" },
  { value: "next_step", label: "다음 단계" },
  { value: "prerequisite", label: "먼저 보기" },
  { value: "replaces", label: "대체 문서" },
]

interface DocsArticleTemplate {
  id: string
  label: string
  description: string
  categoryId: string
  slugBase: string
  title: string
  articleDescription: string
  audience: string
  tagsCsv: string
  keywordsCsv: string
  symptomsCsv: string
  chatbotSummary: string
  productArea: DocsArticleProductArea
  docType: DocsArticleDocType
  difficulty: DocsArticleDifficulty
  contentMarkdown: string
}

const DOC_TEMPLATES: DocsArticleTemplate[] = [
  {
    id: "operations-guide",
    label: "운영 가이드",
    description: "상황, 순서, 체크리스트, 안내문을 한 번에 잡습니다.",
    categoryId: "guides",
    slugBase: "operations-guide",
    title: "새 운영 가이드",
    articleDescription: "운영팀이 같은 순서로 따라 할 수 있는 실행 가이드입니다.",
    audience: "원장, 운영팀, 교사",
    tagsCsv: "운영 가이드, 체크리스트",
    keywordsCsv: "운영, 체크리스트, 안내문",
    symptomsCsv: "",
    chatbotSummary:
      "이 문서는 운영팀이 특정 상황에서 확인해야 할 순서, 체크리스트, 안내 문구를 정리합니다.",
    productArea: "classroom",
    docType: "guide",
    difficulty: "beginner",
    contentMarkdown: `# 새 운영 가이드

## 대상과 사용 시점

누가 읽고 언제 쓰는 문서인지 한 문장으로 정리합니다.

- 원장 또는 운영팀이 확인할 상황을 적습니다.
- 교사나 상담팀이 함께 봐야 하는 기준을 적습니다.

## 권장 진행 순서

실제로 따라 할 순서를 3-7단계로 정리합니다.

- 먼저 확인할 조건을 적습니다.
- 다음으로 실행할 작업을 적습니다.
- 완료 후 기록하거나 공유할 내용을 적습니다.

## 체크리스트

완료 여부를 판단할 수 있는 문장으로 적습니다.

- 담당자가 정해져 있습니다.
- 고객 또는 교사에게 안내가 전달됐습니다.
- 후속 확인 일정이 정리됐습니다.

## 복사 안내문

학부모, 교사, 내부 담당자에게 바로 보낼 수 있는 문구를 적습니다.

## 흔한 실수

운영 중 놓치기 쉬운 부분과 예방 방법을 적습니다.`,
  },
  {
    id: "feature-manual",
    label: "기능 매뉴얼",
    description: "화면, 권한, 입력값, 확인 결과를 기능 기준으로 씁니다.",
    categoryId: "manual",
    slugBase: "feature-manual",
    title: "새 기능 매뉴얼",
    articleDescription: "특정 기능을 설정하고 확인하는 방법을 설명합니다.",
    audience: "운영팀, 교사",
    tagsCsv: "기능 매뉴얼, 설정",
    keywordsCsv: "기능, 설정, 권한",
    symptomsCsv: "",
    chatbotSummary:
      "이 문서는 특정 기능을 어디에서 설정하고 어떤 값을 확인해야 하는지 안내합니다.",
    productArea: "software",
    docType: "manual",
    difficulty: "beginner",
    contentMarkdown: `# 새 기능 매뉴얼

## 사용 전 확인

기능을 쓰기 전에 필요한 권한, 계정, 준비 상태를 적습니다.

- 필요한 관리자 권한을 확인합니다.
- 영향을 받는 수업이나 사용자를 확인합니다.

## 설정 방법

화면 이름과 입력값을 기준으로 순서대로 적습니다.

- 메뉴 또는 화면 진입 위치를 적습니다.
- 입력해야 하는 값을 적습니다.
- 저장 후 확인할 결과를 적습니다.

## 확인 방법

설정이 정상 반영됐는지 확인하는 기준을 적습니다.

## 함께 보면 좋은 문서

관련 운영 가이드나 문제 해결 문서를 적습니다.`,
  },
  {
    id: "faq",
    label: "FAQ",
    description: "반복 문의를 질문과 답변 단위로 빠르게 정리합니다.",
    categoryId: "help",
    slugBase: "faq",
    title: "새 FAQ",
    articleDescription: "자주 묻는 질문에 대한 짧고 정확한 답변입니다.",
    audience: "원장, 운영팀, 상담팀",
    tagsCsv: "FAQ, 도움말",
    keywordsCsv: "질문, 답변, 도움말",
    symptomsCsv: "",
    chatbotSummary:
      "이 문서는 자주 묻는 질문에 대해 상담과 문서 검색에서 바로 쓸 수 있는 답변을 제공합니다.",
    productArea: "general",
    docType: "faq",
    difficulty: "beginner",
    contentMarkdown: `# 새 FAQ

## 질문

사용자가 실제로 묻는 표현으로 질문을 적습니다.

## 답변

확정된 기준만 간결하게 답합니다. 가격, 환불, 지원 시간처럼 확인이 필요한 값은 검증 후 게시합니다.

## 추가 확인이 필요한 경우

상담원 또는 운영팀이 확인해야 하는 조건을 적습니다.

## 관련 안내

이어 볼 문서나 상담 연결 기준을 적습니다.`,
  },
  {
    id: "troubleshooting",
    label: "문제 해결",
    description: "증상, 빠른 복구, 이관 기준을 수업 중 대응 순서로 씁니다.",
    categoryId: "troubleshooting",
    slugBase: "troubleshooting",
    title: "새 문제 해결 문서",
    articleDescription: "수업 중 발생할 수 있는 증상을 빠르게 복구하는 안내입니다.",
    audience: "운영팀, 교사, 상담팀",
    tagsCsv: "문제 해결, 빠른 복구",
    keywordsCsv: "접속, 음성, 화면, 복구",
    symptomsCsv: "접속 안 됨, 소리 안 남, 화면 공유 안 됨",
    chatbotSummary:
      "이 문서는 수업 중 문제가 생겼을 때 먼저 시도할 빠른 복구 순서와 상담 이관 기준을 안내합니다.",
    productArea: "classroom",
    docType: "troubleshooting",
    difficulty: "beginner",
    contentMarkdown: `# 새 문제 해결 문서

## 증상

사용자가 보는 현상을 짧게 적습니다.

- 접속이 되지 않습니다.
- 소리가 들리지 않습니다.
- 화면 공유가 정상적으로 보이지 않습니다.

## 빠른 복구 순서

수업을 이어가기 위해 먼저 시도할 순서를 적습니다.

- 새로고침 또는 재입장을 안내합니다.
- 장치 선택과 권한 허용 상태를 확인합니다.
- 대체 접속 방법을 안내합니다.

## 재발 방지 확인

수업 이후 확인할 설정이나 환경을 적습니다.

## 상담 이관 기준

운영팀이나 상담팀이 직접 확인해야 하는 조건을 적습니다.`,
  },
  {
    id: "release-note",
    label: "업데이트",
    description: "무엇이 바뀌었고 운영팀이 무엇을 확인할지 정리합니다.",
    categoryId: "updates",
    slugBase: "release-note",
    title: "새 업데이트 안내",
    articleDescription: "제품 또는 운영 정책 변경 사항과 권장 조치를 안내합니다.",
    audience: "원장, 운영팀",
    tagsCsv: "업데이트, 변경 사항",
    keywordsCsv: "업데이트, 변경, 권장 조치",
    symptomsCsv: "",
    chatbotSummary:
      "이 문서는 변경된 내용과 운영팀이 확인해야 할 후속 조치를 안내합니다.",
    productArea: "general",
    docType: "release_note",
    difficulty: "beginner",
    contentMarkdown: `# 새 업데이트 안내

## 변경 내용

무엇이 바뀌었는지 사실 기준으로 적습니다.

## 영향을 받는 대상

어떤 고객, 사용자, 운영 흐름에 영향이 있는지 적습니다.

## 권장 조치

운영팀이 확인하거나 안내해야 할 일을 적습니다.

- 변경 사항을 확인합니다.
- 고객 안내가 필요한지 판단합니다.
- 관련 문서를 함께 갱신합니다.

## 참고 사항

아직 확정되지 않은 내용은 공개 문서에 남기지 않습니다.`,
  },
]

interface FormState {
  categoryId: string
  slug: string
  title: string
  description: string
  audience: string
  tagsCsv: string
  keywordsCsv: string
  symptomsCsv: string
  chatbotSummary: string
  contentMarkdown: string
  productArea: DocsArticleProductArea
  docType: DocsArticleDocType
  difficulty: DocsArticleDifficulty
  status: DocsArticleStatus
  publishedAt: string
  visibility: DocsArticleVisibility
  noindex: boolean
  featured: boolean
  orderIndex: number
  seoTitle: string
  seoDescription: string
}

type SidebarTab = "publish" | "insights" | "versions" | "templates"

const SIDEBAR_TABS: { value: SidebarTab; label: string; mode: "all" | "create" | "edit" }[] = [
  { value: "publish", label: "게시", mode: "all" },
  { value: "insights", label: "성과", mode: "edit" },
  { value: "versions", label: "버전", mode: "edit" },
  { value: "templates", label: "템플릿", mode: "create" },
]

const CURRENT_PREVIEW_ARTICLE_ID = "__current-preview-article__"
const MARKDOWN_IMPORT_MAX_BYTES = 1024 * 1024
const STATUS_VALUES = STATUS_OPTIONS.map((option) => option.value)
const VISIBILITY_VALUES = VISIBILITY_OPTIONS.map((option) => option.value)
const DOC_TYPE_VALUES = DOC_TYPE_OPTIONS.map((option) => option.value)
const PRODUCT_AREA_VALUES = PRODUCT_AREA_OPTIONS.map((option) => option.value)
const DIFFICULTY_VALUES = DIFFICULTY_OPTIONS.map((option) => option.value)

interface PreviewSidebarOrderItem {
  id: string
  title: string
  orderIndex: number
  current: boolean
}

type FrontMatterValue = string | number | boolean | null | FrontMatterValue[]

function formSignature(form: FormState) {
  return JSON.stringify(form)
}

function toCsv(values: string[] | undefined) {
  return (values ?? []).join(", ")
}

function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseInlineArray(value: string): FrontMatterValue[] | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (Array.isArray(parsed)) return parsed as FrontMatterValue[]
  } catch {
    // YAML also permits simple inline arrays such as [운영, 체크리스트].
  }

  return trimmed
    .slice(1, -1)
    .split(",")
    .map((item) => parseFrontMatterScalar(item))
}

function toCsvFromUnknown(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
      .filter(Boolean)
      .join(", ")
  }

  if (typeof value !== "string") return ""
  const inlineArray = parseInlineArray(value)
  if (inlineArray) return toCsvFromUnknown(inlineArray)
  return value.trim()
}

function getStringField(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === "string" ? value.trim() : undefined
}

function getCsvField(metadata: Record<string, unknown>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(metadata, key)) return undefined
  return toCsvFromUnknown(metadata[key])
}

function getBooleanField(metadata: Record<string, unknown>, key: string) {
  return typeof metadata[key] === "boolean" ? metadata[key] : undefined
}

function getNumberField(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function getOptionField<T extends string>(
  metadata: Record<string, unknown>,
  key: string,
  options: readonly T[]
) {
  const value = getStringField(metadata, key)
  return value && options.includes(value as T) ? (value as T) : undefined
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function titleFromMarkdown(markdown: string) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim()
}

function titleFromFilename(filename: string) {
  return filename.replace(/\.(md|markdown)$/i, "").replace(/[-_]+/g, " ").trim()
}

function mdFilename(form: Pick<FormState, "slug" | "title">) {
  const candidate = form.slug.trim() || slugify(form.title) || "classin-guide"
  return `${candidate}.md`
}

function fallbackImportSlug(filenameTitle: string) {
  return slugify(filenameTitle) || makeTemplateSlug("imported-doc")
}

function parseFrontMatterScalar(value: string): FrontMatterValue {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const inlineArray = parseInlineArray(trimmed)
  if (inlineArray) return inlineArray
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (trimmed === "null") return null
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    try {
      return JSON.parse(trimmed) as FrontMatterValue
    } catch {
      return trimmed.slice(1, -1)
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'")
  }
  return trimmed
}

function parseMarkdownFrontMatter(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, "\n")
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
  if (!match?.[1]) return { metadata: {}, body: normalized.trim() }

  const metadata: Record<string, unknown> = {}
  let activeArrayKey: string | null = null

  for (const line of match[1].split("\n")) {
    const arrayItem = line.match(/^\s*-\s+(.*)$/)
    if (arrayItem?.[1] && activeArrayKey) {
      const current = metadata[activeArrayKey]
      metadata[activeArrayKey] = [
        ...(Array.isArray(current) ? current : []),
        parseFrontMatterScalar(arrayItem[1]),
      ]
      continue
    }

    const field = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/)
    if (!field?.[1]) {
      activeArrayKey = null
      continue
    }

    const [, key, rawValue = ""] = field
    if (rawValue.trim()) {
      metadata[key] = parseFrontMatterScalar(rawValue)
      activeArrayKey = null
    } else {
      metadata[key] = []
      activeArrayKey = key
    }
  }

  return {
    metadata,
    body: normalized.slice(match[0].length).trim(),
  }
}

function frontMatterLine(key: string, value: unknown) {
  if (typeof value === "boolean" || typeof value === "number") return `${key}: ${value}`
  return `${key}: ${JSON.stringify(value ?? "")}`
}

function frontMatterArray(key: string, values: string[]) {
  if (values.length === 0) return `${key}:`
  return [`${key}:`, ...values.map((value) => `  - ${JSON.stringify(value)}`)].join("\n")
}

function buildMarkdownExport(form: FormState) {
  const frontMatter = [
    frontMatterLine("title", form.title),
    frontMatterLine("description", form.description),
    frontMatterLine("slug", form.slug),
    frontMatterLine("categoryId", form.categoryId),
    frontMatterLine("status", form.status),
    frontMatterLine("visibility", form.visibility),
    frontMatterLine("docType", form.docType),
    frontMatterLine("productArea", form.productArea),
    frontMatterLine("difficulty", form.difficulty),
    frontMatterArray("audience", fromCsv(form.audience)),
    frontMatterArray("tags", fromCsv(form.tagsCsv)),
    frontMatterArray("keywords", fromCsv(form.keywordsCsv)),
    frontMatterArray("symptoms", fromCsv(form.symptomsCsv)),
    frontMatterLine("chatbotSummary", form.chatbotSummary),
    frontMatterLine("seoTitle", form.seoTitle),
    frontMatterLine("seoDescription", form.seoDescription),
    frontMatterLine("noindex", form.noindex),
    frontMatterLine("featured", form.featured),
    frontMatterLine("orderIndex", form.orderIndex),
  ].join("\n")

  return `---\n${frontMatter}\n---\n\n${form.contentMarkdown.trim()}\n`
}

function getOptionLabel<T extends { value: string; label: string }>(options: T[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value
}

function mergeCsv(current: string, values: string[]) {
  return Array.from(new Set([...fromCsv(current), ...values])).join(", ")
}

function suggestKeywords(form: Pick<FormState, "title" | "description" | "docType" | "productArea">) {
  const productArea = getOptionLabel(PRODUCT_AREA_OPTIONS, form.productArea)
  const docType = getOptionLabel(DOC_TYPE_OPTIONS, form.docType)
  const source = `${form.title} ${form.description}`
  const tokens = source
    .split(/[\s,./|·()[\]{}]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token.length <= 18)

  return Array.from(new Set([productArea, docType, ...tokens])).slice(0, 10)
}

function createSummaryDraft(form: Pick<FormState, "description" | "contentMarkdown">) {
  const firstBodyParagraph =
    form.contentMarkdown
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .find((paragraph) => paragraph && !paragraph.startsWith("#")) ?? ""
  const summary = [form.description.trim(), firstBodyParagraph]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  return summary.slice(0, 180)
}

/** 승격된 미디어는 본문에서 빠지므로, 미리보기에서도 공개 화면처럼 figure로 다시 보여준다. */
function mediaToMarkdown(media: StructuredDocMedia[]) {
  return media
    .map((item) => {
      const title = [item.caption, item.width ? `width=${item.width}` : ""].filter(Boolean).join(" | ")
      const suffix = title ? ` "${title}"` : ""
      return item.type === "image"
        ? `![${item.alt}](${item.src}${suffix})`
        : `[${item.alt}](${item.src})`
    })
    .join("\n\n")
}

function toPreviewArticleSections(sections: StructuredDocSection[]): DocsArticleSection[] {
  return sections.map((section, index) => ({
    id: `preview-section-${index + 1}`,
    title: section.heading,
    body: section.body ? <BlogMarkdownRenderer markdown={section.body} /> : null,
    checklist: section.steps?.map((step) => ({
      label: step,
      checked: true,
    })),
    children: section.media?.length ? (
      <BlogMarkdownRenderer markdown={mediaToMarkdown(section.media)} />
    ) : undefined,
  }))
}

function toPreviewTocItems(sections: StructuredDocSection[]): DocsTocItem[] {
  return sections.map((section, index) => ({
    id: `preview-section-${index + 1}`,
    title: section.heading,
  }))
}

function createArticleDraft(form: FormState) {
  const title = form.title.trim() || "새 문서"
  const audience = form.audience.trim() || "원장, 운영팀"

  if (form.docType === "faq") {
    return `# ${title}

## 질문

사용자가 실제로 묻는 표현으로 질문을 적습니다.

## 답변

핵심 답변을 2~4문장으로 먼저 정리합니다.

## 추가 안내

예외 조건, 필요한 확인 정보, 상담으로 넘겨야 하는 상황을 적습니다.

## 관련 문서

함께 확인하면 좋은 문서를 연결합니다.`
  }

  if (form.docType === "troubleshooting") {
    return `# ${title}

## 증상

사용자가 겪는 현상을 화면, 소리, 계정, 장비 상태 기준으로 적습니다.

## 원인 확인

- 사용 환경과 계정을 확인합니다.
- 같은 증상이 반복되는 범위를 확인합니다.
- 최근 변경된 설정이나 장비 상태를 확인합니다.

## 해결 순서

- 가장 안전한 확인부터 진행합니다.
- 사용자가 직접 할 수 있는 조치를 먼저 안내합니다.
- 내부 확인이나 상담 연결이 필요한 조건을 적습니다.

## 상담 연결 기준

담당자가 이어받아야 하는 상황과 필요한 정보를 정리합니다.`
  }

  return `# ${title}

## 대상과 사용 시점

이 문서는 ${audience}가 같은 기준으로 확인하고 실행할 수 있도록 작성합니다.

## 진행 순서

- 먼저 확인해야 할 조건을 적습니다.
- 실제 실행 순서를 단계별로 적습니다.
- 완료 후 기록하거나 공유할 내용을 적습니다.

## 체크리스트

- 담당자가 정해져 있습니다.
- 안내 대상과 시점이 정리되어 있습니다.
- 후속 확인 방법이 정리되어 있습니다.

## 안내 문구

고객, 교사, 내부 담당자에게 바로 보낼 수 있는 문구를 적습니다.`
}

function optimizeMarkdown(markdown: string) {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^([^\n#-].{0,70})\n(?=##\s)/gm, "$1\n\n")
    .trim()
}

function isoToLocalDatetimeInput(value: string | null | undefined) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function localDatetimeInputToIso(value: string) {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function makeTemplateSlug(slugBase: string) {
  return `${slugBase}-${Date.now().toString(36).slice(-5)}`
}

function initialForm(
  article: DocsArticleDetail | null,
  fallbackCategoryId: string
): FormState {
  if (!article) {
    return {
      categoryId: fallbackCategoryId,
      slug: "",
      title: "",
      description: "",
      audience: "",
      tagsCsv: "",
      keywordsCsv: "",
      symptomsCsv: "",
      chatbotSummary: "",
      contentMarkdown: "",
      productArea: "general",
      docType: "guide",
      difficulty: "beginner",
      status: "draft",
      publishedAt: "",
      visibility: "public",
      noindex: false,
      featured: false,
      orderIndex: 100,
      seoTitle: "",
      seoDescription: "",
    }
  }

  return {
    categoryId: article.categoryId,
    slug: article.slug,
    title: article.title,
    description: article.description,
    audience: toCsv(article.audience),
    tagsCsv: toCsv(article.tags),
    keywordsCsv: toCsv(article.keywords),
    symptomsCsv: toCsv(article.symptoms),
    chatbotSummary: article.chatbotSummary ?? "",
    contentMarkdown: article.contentMarkdown,
    productArea: article.productArea,
    docType: article.docType,
    difficulty: article.difficulty,
    status: article.status,
    publishedAt: article.publishedAt ?? "",
    visibility: article.visibility,
    noindex: article.noindex,
    featured: article.featured,
    orderIndex: article.orderIndex,
    seoTitle: article.seoTitle ?? "",
    seoDescription: article.seoDescription ?? "",
  }
}

function formWithDraftPayload(
  base: FormState,
  draftPayload: DocsArticleDraftDetail["draftPayload"]
): FormState {
  return {
    ...base,
    categoryId: draftPayload.categoryId ?? base.categoryId,
    slug: draftPayload.slug ?? base.slug,
    title: draftPayload.title ?? base.title,
    description: draftPayload.description ?? base.description,
    audience: draftPayload.audience ? toCsv(draftPayload.audience) : base.audience,
    tagsCsv: draftPayload.tags ? toCsv(draftPayload.tags) : base.tagsCsv,
    keywordsCsv: draftPayload.keywords ? toCsv(draftPayload.keywords) : base.keywordsCsv,
    symptomsCsv: draftPayload.symptoms ? toCsv(draftPayload.symptoms) : base.symptomsCsv,
    chatbotSummary:
      draftPayload.chatbotSummary === null
        ? ""
        : draftPayload.chatbotSummary ?? base.chatbotSummary,
    contentMarkdown: draftPayload.contentMarkdown ?? base.contentMarkdown,
    productArea: draftPayload.productArea ?? base.productArea,
    docType: draftPayload.docType ?? base.docType,
    difficulty: draftPayload.difficulty ?? base.difficulty,
    status: draftPayload.status ?? base.status,
    publishedAt:
      draftPayload.publishedAt === null
        ? ""
        : draftPayload.publishedAt ?? base.publishedAt,
    visibility: draftPayload.visibility ?? base.visibility,
    noindex: draftPayload.noindex ?? base.noindex,
    featured: draftPayload.featured ?? base.featured,
    orderIndex: draftPayload.orderIndex ?? base.orderIndex,
    seoTitle: draftPayload.seoTitle === null ? "" : draftPayload.seoTitle ?? base.seoTitle,
    seoDescription:
      draftPayload.seoDescription === null
        ? ""
        : draftPayload.seoDescription ?? base.seoDescription,
  }
}

function ToolbarButton({
  onClick,
  children,
  icon,
  title,
}: {
  onClick: () => void
  children: string
  icon?: ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-2 text-xs font-medium text-[#1a1a1a]/60 transition-colors duration-75 hover:border-[#1a1a1a]/20 hover:text-[#111110] active:scale-[0.96] active:bg-[#f7f7f5]"
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}

function HelpTip({ term }: { term: string }) {
  const help = getDocsEditorHelp(term)
  if (!help) return null

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`${help.title} 도움말`}
        className="-my-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-[#1a1a1a]/40 transition-colors hover:bg-[#F6F5F4] hover:text-[#084734] focus:bg-[#F6F5F4] focus:text-[#084734] focus:outline-none"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-6 z-40 hidden w-64 rounded-lg border border-[#e8e8e4] bg-white p-3 text-left shadow-xl group-hover:block group-focus-within:block"
      >
        <span className="block text-[12px] font-semibold text-[#111110]">{help.title}</span>
        <span className="mt-1 block text-[11px] leading-5 text-[#615D59]">{help.description}</span>
      </span>
    </span>
  )
}

function FieldLabel({
  children,
  helpTerm,
  required = false,
}: {
  children: ReactNode
  helpTerm?: string
  required?: boolean
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="text-[12px] font-medium text-[#1a1a1a]/50">
        {children}
        {required ? " *" : null}
      </span>
      {helpTerm ? <HelpTip term={helpTerm} /> : null}
    </div>
  )
}

const RichMarkdownEditor = dynamic(() => import("@/components/admin/RichMarkdownEditor"), {
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="본문 편집기를 불러오는 중입니다."
      className="h-[600px] animate-pulse rounded-xl bg-[#f0f0ec]"
    />
  ),
  ssr: false,
})

export default function DocsArticleEditor({ mode, categories, article }: Props) {
  const router = useRouter()
  const editorRef = useRef<RichMarkdownEditorHandle | null>(null)
  const markdownFileInputRef = useRef<HTMLInputElement | null>(null)
  const previewDialogRef = useRef<HTMLDivElement | null>(null)
  const previewCloseButtonRef = useRef<HTMLButtonElement | null>(null)
  const draftAppliedRef = useRef(false)
  const [form, setForm] = useState<FormState>(() =>
    initialForm(article, categories[0]?.id ?? "start")
  )
  // 저장 경로가 editorRef.flush() 직후 최신 본문을 같은 틱에서 읽을 수 있도록 form을 미러링한다.
  // (커밋 후 effect 동기화 + 에디터 onChange에서 본문만 선행 동기 갱신)
  const formRef = useRef(form)
  const [lastSavedForm, setLastSavedForm] = useState<FormState>(() =>
    initialForm(article, categories[0]?.id ?? "start")
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [support, setSupport] = useState<EditorSupportState>({
    articleOptions: [],
    relations: [],
    versions: [],
    analytics: null,
    draft: null,
    warning: null,
  })
  const [supportLoading, setSupportLoading] = useState(mode === "edit")
  const [relationsSaving, setRelationsSaving] = useState(false)
  const [snapshotting, setSnapshotting] = useState(false)
  const [rollingBackVersionId, setRollingBackVersionId] = useState<string | null>(null)
  const [snapshotNote, setSnapshotNote] = useState("Manual snapshot")
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>(
    mode === "create" ? "templates" : "publish"
  )

  useEffect(() => {
    if (!previewOpen) return

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    previewCloseButtonRef.current?.focus()

    const handlePreviewKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setPreviewOpen(false)
        return
      }
      if (event.key !== "Tab") return

      const focusable = previewDialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable?.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handlePreviewKeyDown)
    return () => {
      document.removeEventListener("keydown", handlePreviewKeyDown)
      previouslyFocused?.focus()
    }
  }, [previewOpen])

  const publicPath = useMemo(
    () => `/docs/${form.categoryId}/${form.slug || article?.slug || "new"}`,
    [form.categoryId, form.slug, article?.slug]
  )
  const suggestedKeywords = useMemo(
    () =>
      suggestKeywords({
        title: form.title,
        description: form.description,
        docType: form.docType,
        productArea: form.productArea,
      }),
    [form.description, form.docType, form.productArea, form.title]
  )
  const suggestedSummary = useMemo(
    () =>
      createSummaryDraft({
        contentMarkdown: form.contentMarkdown,
        description: form.description,
      }),
    [form.contentMarkdown, form.description]
  )
  // WYSIWYG 직렬화가 경로 스텝의 " > "와 [대괄호]를 이스케이프하므로 파서에 넣기 전에 되돌린다
  // (저장 경로 buildPayload도 같은 정규화를 거친다 — 미리보기와 저장 결과가 갈리면 안 된다).
  // reconcile까지 걸어야 미리보기가 저장 결과와 같아진다 — 이전 content_json에서 이미지 크기를
  // 이어받고, resources 전용 블록과 겹치는 "첨부 자료" 섹션을 떨어낸 뒤의 모습이 실제 공개 화면이다.
  const previewSections = useMemo(
    () =>
      reconcileSectionsWithPrevious(
        markdownToSections(restorePathStepMarkup(form.contentMarkdown)),
        article?.contentJson
      ),
    [article?.contentJson, form.contentMarkdown]
  )
  // 첫 ## 앞 산문은 저장 시 조용히 사라진다 — 파서 동작은 그대로 두고 편집기에서 경고만 한다.
  const introDropped = useMemo(
    () => hasDroppedIntroContent(form.contentMarkdown, form.description),
    [form.contentMarkdown, form.description]
  )
  // 미리보기 모달(previewOpen)에서만 소비되므로 닫혀 있으면 섹션 오브젝트 빌드를 건너뛴다.
  const previewArticleSections = useMemo(
    () => (previewOpen ? toPreviewArticleSections(previewSections) : []),
    [previewOpen, previewSections]
  )
  const previewTocItems = useMemo(
    () => toPreviewTocItems(previewSections),
    [previewSections]
  )
  const activeCategoryTitle = useMemo(
    () => categories.find((category) => category.id === form.categoryId)?.title ?? form.categoryId,
    [categories, form.categoryId]
  )
  const previewAudience = useMemo(() => fromCsv(form.audience).join(", "), [form.audience])
  const currentPreviewArticleId = article?.id ?? CURRENT_PREVIEW_ARTICLE_ID
  const previewSidebarOrderItems = useMemo<PreviewSidebarOrderItem[]>(() => {
    const currentItem: PreviewSidebarOrderItem = {
      id: currentPreviewArticleId,
      title: form.title.trim() || "새 문서",
      orderIndex: Number.isFinite(form.orderIndex) ? form.orderIndex : 100,
      current: true,
    }

    return [
      ...support.articleOptions
        .filter((option) => option.categoryId === form.categoryId && option.id !== currentPreviewArticleId)
        .map((option) => ({
          id: option.id,
          title: option.title,
          orderIndex: option.orderIndex,
          current: false,
        })),
      currentItem,
    ].sort((left, right) => {
      if (left.orderIndex !== right.orderIndex) return left.orderIndex - right.orderIndex
      if (left.current !== right.current) return left.current ? -1 : 1
      return left.title.localeCompare(right.title, "ko-KR")
    })
  }, [
    currentPreviewArticleId,
    form.categoryId,
    form.orderIndex,
    form.title,
    support.articleOptions,
  ])
  const currentPreviewSidebarIndex = previewSidebarOrderItems.findIndex((item) => item.current)
  const previewSidebarPosition = currentPreviewSidebarIndex >= 0 ? currentPreviewSidebarIndex + 1 : 1
  const previewSidebarTotal = previewSidebarOrderItems.length
  const canMovePreviewUp = currentPreviewSidebarIndex > 0
  const canMovePreviewDown =
    currentPreviewSidebarIndex >= 0 && currentPreviewSidebarIndex < previewSidebarOrderItems.length - 1
  const previewNavGroups = useMemo<DocsNavGroup[]>(() => {
    // 미리보기 사이드바(모달 전용)에서만 소비 — 닫혀 있으면 전체 카테고리×문서 매핑을 건너뛴다.
    if (!previewOpen) return []
    const currentHref = "#preview-current-doc"
    const currentTitle = form.title.trim() || "새 문서"
    const currentOrder = Number.isFinite(form.orderIndex) ? form.orderIndex : 100

    return categories.map((category) => {
      const links = support.articleOptions
        .filter((option) => option.categoryId === category.id)
        .map((option) => ({
          title: option.title,
          href: option.publicPath,
          description: `순서 ${option.orderIndex}`,
          isActive: false,
          orderIndex: option.orderIndex,
        }))

      if (category.id === form.categoryId) {
        links.push({
          title: currentTitle,
          href: currentHref,
          description: `순서 ${currentOrder}`,
          isActive: true,
          orderIndex: currentOrder,
        })
      }

      return {
        title: category.title,
        links: links
          .sort((left, right) => {
            if (left.orderIndex !== right.orderIndex) return left.orderIndex - right.orderIndex
            return left.title.localeCompare(right.title, "ko-KR")
          })
          .map((link) => ({
            title: link.title,
            href: link.href,
            description: link.description,
            isActive: link.isActive,
          })),
      }
    })
  }, [previewOpen, categories, form.categoryId, form.orderIndex, form.title, support.articleOptions])
  const chatbotIncluded =
    form.status === "published" && form.visibility !== "internal" && !form.noindex
  const aiChecklist = useMemo(
    () => [
      {
        label: "챗봇 노출",
        complete: chatbotIncluded,
        hint: chatbotIncluded ? "게시/공개/noindex 해제 상태입니다." : "게시 후 공개 상태로 두면 챗봇 후보가 됩니다.",
      },
      {
        label: "챗봇 요약",
        complete: form.chatbotSummary.trim().length >= 30,
        hint: "답변 첫 문맥으로 쓸 2~3문장 요약을 넣으세요.",
      },
      {
        label: "키워드",
        complete: fromCsv(form.keywordsCsv).length + fromCsv(form.tagsCsv).length >= 3,
        hint: "사용자가 검색할 표현을 태그/키워드에 넣으세요.",
      },
      {
        label: "본문 청킹",
        complete: form.contentMarkdown.trim().length >= 120 && form.contentMarkdown.includes("## "),
        hint: "본문 120자 이상, 섹션은 ## 헤딩으로 나누면 좋습니다.",
      },
    ],
    [chatbotIncluded, form.chatbotSummary, form.contentMarkdown, form.keywordsCsv, form.tagsCsv]
  )
  const completedAiChecks = aiChecklist.filter((item) => item.complete).length
  const isDirty = useMemo(
    () => formSignature(form) !== formSignature(lastSavedForm),
    [form, lastSavedForm]
  )
  const requiredItems = [
    { label: "제목", done: Boolean(form.title.trim()) },
    { label: "설명", done: Boolean(form.description.trim()) },
    { label: "카테고리", done: Boolean(form.categoryId) },
    { label: "본문", done: form.contentMarkdown.trim().length >= 120 },
  ]
  const requiredDone = requiredItems.filter((item) => item.done).length
  const contentCharacterCount = form.contentMarkdown.trim().length
  const publishTone =
    form.status === "published"
      ? "border-emerald-100 bg-emerald-50 text-[#084734]"
      : form.status === "review"
      ? "border-amber-100 bg-amber-50 text-amber-700"
      : "border-[#e8e8e4] bg-white text-[#615D59]"
  const publishLabel = getOptionLabel(STATUS_OPTIONS, form.status)
  const visibleSidebarTabs = useMemo(
    () => SIDEBAR_TABS.filter((tab) => tab.mode === "all" || tab.mode === mode),
    [mode]
  )

  const handleSidebarTabKeyDown = useCallback((
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentTab: SidebarTab
  ) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    event.preventDefault()

    const currentIndex = visibleSidebarTabs.findIndex((item) => item.value === currentTab)
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? visibleSidebarTabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + visibleSidebarTabs.length)
          % visibleSidebarTabs.length
    const nextTab = visibleSidebarTabs[nextIndex].value
    setActiveSidebarTab(nextTab)
    requestAnimationFrame(() => document.getElementById(`docs-editor-tab-${nextTab}`)?.focus())
  }, [visibleSidebarTabs])

  useEffect(() => {
    if (!previewOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [previewOpen])

  const loadEditorSupport = useCallback(async () => {
    if (mode !== "edit" || !article) return

    setSupportLoading(true)
    try {
      const [contentResult, relationsResult, versionsResult, analyticsResult, draftResult] = await Promise.all([
        adminFetchJson<AdminDocsContentResponse>("/api/admin/docs").catch((err) => ({
          configured: false,
          status: "unconfigured",
          generatedAt: new Date().toISOString(),
          categories: [],
          articles: [],
          warnings: [err instanceof Error ? err.message : "문서 목록을 불러오지 못했습니다."],
        } satisfies AdminDocsContentResponse)),
        adminFetchJson<RelationsResponse>(`/api/admin/docs/articles/${article.id}/relations`).catch((err) => ({
          relations: [],
          warning: err instanceof Error ? err.message : "관련 문서를 불러오지 못했습니다.",
        })),
        adminFetchJson<VersionsResponse>(`/api/admin/docs/articles/${article.id}/versions`).catch((err) => ({
          versions: [],
          warning: err instanceof Error ? err.message : "버전을 불러오지 못했습니다.",
        })),
        adminFetchJson<DocsArticleAnalyticsDetail>(`/api/admin/docs/articles/${article.id}/analytics?days=90`)
          .then((data) => ({ data, warning: null as string | null }))
          .catch((err) => ({
            data: null,
            warning: err instanceof Error ? err.message : "성과를 불러오지 못했습니다.",
          })),
        adminFetchJson<DraftResponse>(`/api/admin/docs/articles/${article.id}/draft`).catch((err) => ({
          draft: null,
          warning: err instanceof Error ? err.message : "작업 초안을 불러오지 못했습니다.",
        })),
      ])

      const warnings = [
        ...(contentResult.warnings ?? []),
        relationsResult.warning,
        versionsResult.warning,
        draftResult.warning,
        analyticsResult.warning,
      ].filter((item): item is string => Boolean(item))

      if (draftResult.draft && !draftAppliedRef.current) {
        const draftForm = formWithDraftPayload(
          initialForm(article, article.categoryId),
          draftResult.draft.draftPayload
        )
        setForm(draftForm)
        setLastSavedForm(draftForm)
        draftAppliedRef.current = true
      }

      setSupport({
        articleOptions: contentResult.articles
          .filter((item) => item.id !== article.id)
          .map((item) => ({
            id: item.id,
            title: item.title,
            categoryId: item.categoryId,
            slug: item.slug,
            status: item.status,
            publicPath: item.publicPath,
            orderIndex: item.orderIndex,
          })),
        relations: relationsResult.relations,
        versions: versionsResult.versions,
        analytics: analyticsResult.data,
        draft: draftResult.draft,
        warning: warnings[0] ?? null,
      })
    } finally {
      setSupportLoading(false)
    }
  }, [article, mode])

  useEffect(() => {
    void loadEditorSupport()
  }, [loadEditorSupport])

  useEffect(() => {
    if (mode !== "create") return

    let cancelled = false

    adminFetchJson<AdminDocsContentResponse>("/api/admin/docs")
      .then((contentResult) => {
        if (cancelled) return

        setSupport((previous) => ({
          ...previous,
          articleOptions: contentResult.articles.map((item) => ({
            id: item.id,
            title: item.title,
            categoryId: item.categoryId,
            slug: item.slug,
            status: item.status,
            publicPath: item.publicPath,
            orderIndex: item.orderIndex,
          })),
          warning: previous.warning ?? contentResult.warnings[0] ?? null,
        }))
      })
      .catch(() => null)

    return () => {
      cancelled = true
    }
  }, [mode])

  useEffect(() => {
    formRef.current = form
  }, [form])

  useEffect(() => {
    if (!isDirty) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [isDirty])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function getOrderIndexForPreviewPosition(
    items: PreviewSidebarOrderItem[],
    targetIndex: number
  ) {
    const previous = items[targetIndex - 1]
    const next = items[targetIndex + 1]

    if (previous && next) {
      const gap = next.orderIndex - previous.orderIndex
      if (gap > 1) return Math.floor(previous.orderIndex + gap / 2)
      return (targetIndex + 1) * 10
    }

    if (previous) return previous.orderIndex + 10
    if (next) return Math.max(0, next.orderIndex - 10)
    return 100
  }

  function moveCurrentPreviewSidebarOrder(direction: "up" | "down") {
    const currentIndex = previewSidebarOrderItems.findIndex((item) => item.current)
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= previewSidebarOrderItems.length) {
      return
    }

    const reordered = [...previewSidebarOrderItems]
    const [currentItem] = reordered.splice(currentIndex, 1)
    if (!currentItem) return
    reordered.splice(targetIndex, 0, currentItem)

    update("orderIndex", getOrderIndexForPreviewPosition(reordered, targetIndex))
  }

  function getLastPreviewOrderIndexForCategory(categoryId: string) {
    return support.articleOptions
      .filter((option) => option.categoryId === categoryId && option.id !== currentPreviewArticleId)
      .reduce((max, option) => Math.max(max, option.orderIndex), 0)
  }

  function updateCategoryAndMoveToEnd(categoryId: string) {
    setForm((previous) => ({
      ...previous,
      categoryId,
      orderIndex: getLastPreviewOrderIndexForCategory(categoryId) + 10,
    }))
  }

  function applySummaryDraft() {
    if (!suggestedSummary) return
    update("chatbotSummary", suggestedSummary)
  }

  function applySuggestedKeywords() {
    update("keywordsCsv", mergeCsv(form.keywordsCsv, suggestedKeywords))
  }

  function applyChatbotVisibility() {
    setForm((previous) => ({
      ...previous,
      visibility: "public",
      noindex: false,
    }))
  }

  function applyTemplate(template: DocsArticleTemplate) {
    const categoryId = categories.some((category) => category.id === template.categoryId)
      ? template.categoryId
      : categories[0]?.id ?? form.categoryId

    setForm((previous) => ({
      ...previous,
      categoryId,
      slug: makeTemplateSlug(template.slugBase),
      title: template.title,
      description: template.articleDescription,
      audience: template.audience,
      tagsCsv: template.tagsCsv,
      keywordsCsv: template.keywordsCsv,
      symptomsCsv: template.symptomsCsv,
      chatbotSummary: template.chatbotSummary,
      contentMarkdown: template.contentMarkdown,
      productArea: template.productArea,
      docType: template.docType,
      difficulty: template.difficulty,
      orderIndex: getLastPreviewOrderIndexForCategory(categoryId) + 10,
      status: "draft",
      visibility: "public",
      noindex: false,
      featured: false,
      seoTitle: "",
      seoDescription: "",
    }))
    setError(null)
    setSavedMessage(null)
  }

  function applyArticleDraft() {
    update("contentMarkdown", createArticleDraft(form))
    if (!form.chatbotSummary.trim()) {
      update("chatbotSummary", createSummaryDraft({ ...form, contentMarkdown: createArticleDraft(form) }))
    }
  }

  function applySeoDraft() {
    const title = form.seoTitle.trim() || `${form.title.trim()} | ClassIn 가이드`
    const description = form.seoDescription.trim() || form.description.trim() || createSummaryDraft(form)
    update("seoTitle", title.slice(0, 70))
    update("seoDescription", description.slice(0, 155))
  }

  function optimizeCurrentMarkdown() {
    update("contentMarkdown", optimizeMarkdown(form.contentMarkdown))
  }

  async function importMarkdownFile(file: File) {
    setError(null)
    setSavedMessage(null)

    const filename = file.name.trim()
    if (!/\.(md|markdown)$/i.test(filename)) {
      setError("Markdown 파일(.md, .markdown)만 가져올 수 있습니다.")
      return
    }

    if (file.size > MARKDOWN_IMPORT_MAX_BYTES) {
      setError("1MB 이하의 Markdown 파일만 가져올 수 있습니다.")
      return
    }

    if (
      form.contentMarkdown.trim() &&
      !window.confirm("현재 본문을 가져온 Markdown 파일로 덮어씁니다. 계속할까요?")
    ) {
      return
    }

    try {
      const raw = await file.text()
      const { metadata, body } = parseMarkdownFrontMatter(raw)
      const contentMarkdown = optimizeMarkdown(body)

      if (!contentMarkdown) {
        setError("가져온 Markdown 파일에 본문이 없습니다.")
        return
      }

      const hasMetadata = Object.keys(metadata).length > 0
      const importedTitle = getStringField(metadata, "title") ?? titleFromMarkdown(contentMarkdown)
      const filenameTitle = titleFromFilename(filename)
      const importedSlug = slugify(getStringField(metadata, "slug") ?? filenameTitle) || fallbackImportSlug(filenameTitle)
      const importedCategoryId = getStringField(metadata, "categoryId")
      const categoryId =
        importedCategoryId && categories.some((category) => category.id === importedCategoryId)
          ? importedCategoryId
          : undefined

      setForm((previous) => ({
        ...previous,
        contentMarkdown,
        title:
          (hasMetadata ? importedTitle : previous.title || importedTitle || filenameTitle) ??
          previous.title,
        description:
          (hasMetadata ? getStringField(metadata, "description") : undefined) ??
          previous.description,
        slug:
          (hasMetadata ? importedSlug : previous.slug || importedSlug) ??
          previous.slug,
        categoryId: categoryId ?? previous.categoryId,
        audience:
          (hasMetadata ? getCsvField(metadata, "audience") : undefined) ??
          previous.audience,
        tagsCsv:
          (hasMetadata ? getCsvField(metadata, "tags") : undefined) ??
          previous.tagsCsv,
        keywordsCsv:
          (hasMetadata ? getCsvField(metadata, "keywords") : undefined) ??
          previous.keywordsCsv,
        symptomsCsv:
          (hasMetadata ? getCsvField(metadata, "symptoms") : undefined) ??
          previous.symptomsCsv,
        chatbotSummary:
          (hasMetadata ? getStringField(metadata, "chatbotSummary") : undefined) ??
          previous.chatbotSummary,
        productArea:
          getOptionField<DocsArticleProductArea>(metadata, "productArea", PRODUCT_AREA_VALUES) ??
          previous.productArea,
        docType:
          getOptionField<DocsArticleDocType>(metadata, "docType", DOC_TYPE_VALUES) ??
          previous.docType,
        difficulty:
          getOptionField<DocsArticleDifficulty>(metadata, "difficulty", DIFFICULTY_VALUES) ??
          previous.difficulty,
        status:
          getOptionField<DocsArticleStatus>(metadata, "status", STATUS_VALUES) ??
          previous.status,
        visibility:
          getOptionField<DocsArticleVisibility>(metadata, "visibility", VISIBILITY_VALUES) ??
          previous.visibility,
        noindex: getBooleanField(metadata, "noindex") ?? previous.noindex,
        featured: getBooleanField(metadata, "featured") ?? previous.featured,
        orderIndex: getNumberField(metadata, "orderIndex") ?? previous.orderIndex,
        seoTitle:
          (hasMetadata ? getStringField(metadata, "seoTitle") : undefined) ??
          previous.seoTitle,
        seoDescription:
          (hasMetadata ? getStringField(metadata, "seoDescription") : undefined) ??
          previous.seoDescription,
      }))
      setSavedMessage("Markdown 파일을 가져왔습니다. 저장 전 미리보기를 확인하세요.")
      setTimeout(() => setSavedMessage(null), 2500)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Markdown 파일을 가져오지 못했습니다.")
    }
  }

  function handleMarkdownFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    void importMarkdownFile(file)
  }

  function exportMarkdownFile() {
    setError(null)
    const blob = new Blob([buildMarkdownExport(form)], {
      type: "text/markdown;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = mdFilename(form)
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setSavedMessage("Markdown 파일을 내보냈습니다.")
    setTimeout(() => setSavedMessage(null), 2500)
  }

  function updateRelation<K extends keyof DocsArticleRelationDetail>(
    index: number,
    key: K,
    value: DocsArticleRelationDetail[K]
  ) {
    setSupport((previous) => {
      const relations = [...previous.relations]
      const current = relations[index]
      if (!current) return previous
      relations[index] = { ...current, [key]: value }
      return { ...previous, relations }
    })
  }

  function addRelation() {
    const candidate = support.articleOptions.find(
      (option) => !support.relations.some((relation) => relation.relatedArticleId === option.id)
    )
    if (!candidate) return

    setSupport((previous) => ({
      ...previous,
      relations: [
        ...previous.relations,
        {
          relatedArticleId: candidate.id,
          relationType: "related",
          orderIndex: (previous.relations.length + 1) * 10,
          note: null,
          relatedSlug: candidate.slug,
          relatedTitle: candidate.title,
          relatedCategoryId: candidate.categoryId,
        },
      ],
    }))
  }

  function removeRelation(index: number) {
    setSupport((previous) => ({
      ...previous,
      relations: previous.relations.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  async function saveRelations() {
    if (!article) return
    setRelationsSaving(true)
    setError(null)
    try {
      const result = await adminFetchJson<RelationsResponse>(
        `/api/admin/docs/articles/${article.id}/relations`,
        {
          method: "PUT",
          body: JSON.stringify({ relations: support.relations }),
        }
      )
      setSupport((previous) => ({ ...previous, relations: result.relations }))
      setSavedMessage("관련 문서를 저장했습니다.")
      setTimeout(() => setSavedMessage(null), 2500)
    } catch (error) {
      setError(error instanceof Error ? error.message : "관련 문서를 저장하지 못했습니다.")
    } finally {
      setRelationsSaving(false)
    }
  }

  async function createSnapshot() {
    if (!article) return
    setSnapshotting(true)
    setError(null)
    try {
      const version = await adminFetchJson<DocsArticleVersionDetail>(
        `/api/admin/docs/articles/${article.id}/versions`,
        {
          method: "POST",
          body: JSON.stringify({ changeNote: snapshotNote }),
        }
      )
      setSupport((previous) => ({ ...previous, versions: [version, ...previous.versions] }))
      setSavedMessage("스냅샷을 만들었습니다.")
      setTimeout(() => setSavedMessage(null), 2500)
    } catch (error) {
      setError(error instanceof Error ? error.message : "스냅샷을 만들지 못했습니다.")
    } finally {
      setSnapshotting(false)
    }
  }

  async function rollbackToVersion(version: DocsArticleVersionDetail) {
    if (!article) return
    if (!window.confirm(`v${version.versionNumber} 버전으로 본문을 되돌립니다. 현재 내용은 백업 스냅샷으로 저장됩니다.`)) return

    setRollingBackVersionId(version.id)
    setError(null)
    try {
      // 챗봇 인덱스 갱신은 롤백 API가 서버에서 처리한다.
      const detail = await adminFetchJson<DocsArticleDetailResponse>(
        `/api/admin/docs/articles/${article.id}/versions/${version.id}/rollback`,
        { method: "POST" }
      )
      const rolledBackForm = initialForm(detail, detail.categoryId)
      setForm(rolledBackForm)
      setLastSavedForm(rolledBackForm)
      await loadEditorSupport()
      setSavedMessage(detail.reindexWarning ?? "선택한 버전으로 롤백했습니다.")
      setTimeout(() => setSavedMessage(null), 2500)
    } catch (error) {
      setError(error instanceof Error ? error.message : "롤백하지 못했습니다.")
    } finally {
      setRollingBackVersionId(null)
    }
  }

  function buildPayload(overrides: Partial<FormState> = {}): Record<string, unknown> {
    // 클로저 state 대신 ref를 읽는다 — 저장 직전 flush()가 전파한 디바운스 대기 본문 포함.
    const next = { ...formRef.current, ...overrides }

    return {
      categoryId: next.categoryId,
      slug: next.slug,
      title: next.title,
      description: next.description,
      audience: fromCsv(next.audience),
      tags: fromCsv(next.tagsCsv),
      keywords: fromCsv(next.keywordsCsv),
      symptoms: fromCsv(next.symptomsCsv),
      chatbotSummary: next.chatbotSummary.trim() ? next.chatbotSummary.trim() : null,
      contentMarkdown: next.contentMarkdown,
      // 마크다운 원문은 그대로 저장한다(이스케이프된 상태도 유효한 마크다운이라 편집기 왕복은 멀쩡하다).
      // 규약을 문자열로 읽는 sections만 경로 스텝을 되돌려 넘긴다.
      contentJson: buildContentJson(restorePathStepMarkup(next.contentMarkdown), article?.contentJson),
      productArea: next.productArea,
      docType: next.docType,
      difficulty: next.difficulty,
      status: next.status,
      publishedAt: next.publishedAt || (article?.publishedAt ? null : undefined),
      visibility: next.visibility,
      noindex: next.noindex,
      featured: next.featured,
      orderIndex: next.orderIndex,
      seoTitle: next.seoTitle.trim() ? next.seoTitle.trim() : null,
      seoDescription: next.seoDescription.trim() ? next.seoDescription.trim() : null,
    }
  }

  function validate(next: FormState) {
    if (!next.title.trim()) return "제목은 필수입니다."
    if (!next.description.trim()) return "설명은 필수입니다."
    if (!next.slug.trim()) return "slug는 필수입니다."
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next.slug)) {
      return "slug는 소문자·숫자·하이픈만 허용합니다."
    }
    if (!next.categoryId) return "카테고리를 선택하세요."
    if (next.status === "published" && !next.contentMarkdown.trim()) {
      return "게시 문서는 본문이 필요합니다."
    }
    return null
  }

  function validateDraft(next: FormState) {
    if (next.slug.trim() && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next.slug)) {
      return "slug는 소문자·숫자·하이픈만 허용합니다."
    }
    return null
  }

  async function saveDraft(overrides: Partial<FormState> = {}) {
    // 트레일링 디바운스로 대기 중인 마지막 <200ms 타이핑을 저장 전에 동기 전파한다.
    editorRef.current?.flush()
    setError(null)
    setSavedMessage(null)
    const next = { ...formRef.current, ...overrides }

    if (mode === "create") {
      await save({ ...overrides, status: "draft" })
      return
    }

    if (!article) return

    const validationError = validateDraft(next)
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    try {
      const result = await adminFetchJson<DraftResponse>(
        `/api/admin/docs/articles/${article.id}/draft`,
        {
          method: "PUT",
          body: JSON.stringify(buildPayload(overrides)),
        }
      )
      setSupport((previous) => ({ ...previous, draft: result.draft }))
      setLastSavedForm(next)
      setSavedMessage("작업 초안을 저장했습니다. 공개본은 아직 바뀌지 않았습니다.")
      setTimeout(() => setSavedMessage(null), 3000)
    } catch (error) {
      setError(error instanceof Error ? error.message : "작업 초안을 저장하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function publishDraft(overrides: Partial<FormState> = {}) {
    // 공개 반영 전에 디바운스 대기 본문을 동기 전파한다.
    editorRef.current?.flush()
    setError(null)
    setSavedMessage(null)
    const next = { ...formRef.current, ...overrides }
    const validationError = validate(next)
    if (validationError) {
      setError(validationError)
      return
    }

    if (mode === "create") {
      await save({ ...overrides, status: "published" })
      return
    }

    if (!article) return

    const confirmed = window.confirm(
      "작업 초안을 공개본에 반영합니다. 저장 후 공개 /docs URL과 챗봇 인덱스가 최신화됩니다. 계속할까요?"
    )
    if (!confirmed) return

    setSaving(true)
    try {
      await adminFetchJson<DraftResponse>(`/api/admin/docs/articles/${article.id}/draft`, {
        method: "PUT",
        body: JSON.stringify(buildPayload(overrides)),
      })
      // 챗봇 인덱스 갱신은 publish API가 서버에서 처리한다.
      const detail = await adminFetchJson<DocsArticleDetailResponse>(
        `/api/admin/docs/articles/${article.id}/draft/publish`,
        { method: "POST" }
      )
      const savedForm = initialForm(detail, detail.categoryId)
      setForm(savedForm)
      setLastSavedForm(savedForm)
      setSupport((previous) => ({ ...previous, draft: null }))
      draftAppliedRef.current = true
      setSavedMessage(
        detail.reindexWarning ??
          (detail.status === "published" ? "공개본 반영 완료 · 검색 인덱스 반영" : "문서 반영 완료")
      )
      setTimeout(() => setSavedMessage(null), 3000)
      router.refresh()
    } catch (error) {
      setError(error instanceof Error ? error.message : "공개본에 반영하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function discardDraft() {
    if (!article) return
    if (!window.confirm("저장된 작업 초안을 삭제하고 현재 공개본 기준으로 되돌립니다. 계속할까요?")) {
      return
    }

    setSaving(true)
    setError(null)
    try {
      await adminFetchJson<{ ok: boolean }>(`/api/admin/docs/articles/${article.id}/draft`, {
        method: "DELETE",
      })
      const liveForm = initialForm(article, article.categoryId)
      setForm(liveForm)
      setLastSavedForm(liveForm)
      setSupport((previous) => ({ ...previous, draft: null }))
      setSavedMessage("작업 초안을 삭제하고 공개본으로 되돌렸습니다.")
      setTimeout(() => setSavedMessage(null), 3000)
    } catch (error) {
      setError(error instanceof Error ? error.message : "작업 초안을 삭제하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function save(overrides: Partial<FormState> = {}) {
    // saveDraft/publishDraft(create 모드)를 거치지 않는 직접 호출 대비 — flush는 멱등이라 중복 호출 무해.
    editorRef.current?.flush()
    setError(null)
    setSavedMessage(null)
    const next = { ...formRef.current, ...overrides }
    const validationError = validate(next)
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    try {
      // 챗봇 인덱스 갱신은 문서 쓰기 API가 서버에서 처리한다.
      if (mode === "create") {
        const detail = await adminFetchJson<DocsArticleDetailResponse>("/api/admin/docs/articles", {
          method: "POST",
          body: JSON.stringify(buildPayload(overrides)),
        })
        router.replace(`/admin/docs/${detail.id}/edit`)
        router.refresh()
        return
      }

      if (!article) return
      const detail = await adminFetchJson<DocsArticleDetailResponse>(
        `/api/admin/docs/articles/${article.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(buildPayload(overrides)),
        }
      )
      const savedForm = initialForm(detail, detail.categoryId)
      setForm(savedForm)
      setLastSavedForm(savedForm)
      setSavedMessage(
        detail.reindexWarning ??
          (next.status === "published" ? "저장 완료 · 검색 인덱스 반영" : "저장 완료")
      )
      setTimeout(() => setSavedMessage(null), 2500)
      router.refresh()
    } catch (error) {
      setError(error instanceof Error ? error.message : "저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!article) return
    if (!window.confirm(`"${article.title}" 문서를 삭제합니다. 계속할까요?`)) return

    setDeleting(true)
    try {
      const response = await adminFetch(`/api/admin/docs/articles/${article.id}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? "삭제에 실패했습니다.")
      }
      router.replace("/admin/docs")
    } catch (error) {
      setError(error instanceof Error ? error.message : "삭제에 실패했습니다.")
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] [&_a]:focus-visible:outline-none [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-[#084734] [&_a]:focus-visible:ring-offset-2 [&_button]:min-h-11 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-[#084734] [&_button]:focus-visible:ring-offset-2 [&_input:not([type=checkbox])]:min-h-11 [&_input]:focus-visible:outline-none [&_input]:focus-visible:ring-2 [&_input]:focus-visible:ring-[#084734] [&_input]:focus-visible:ring-offset-2 [&_select]:min-h-11 [&_select]:focus-visible:outline-none [&_select]:focus-visible:ring-2 [&_select]:focus-visible:ring-[#084734] [&_select]:focus-visible:ring-offset-2 [&_textarea]:focus-visible:outline-none [&_textarea]:focus-visible:ring-2 [&_textarea]:focus-visible:ring-[#084734] [&_textarea]:focus-visible:ring-offset-2">
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/docs"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-[13px] text-[#1a1a1a]/40 transition-colors hover:text-[#111110]"
          >
            <ArrowLeft className="h-4 w-4" />
            문서 센터
          </Link>
          <span className="text-[#1a1a1a]/15">/</span>
          <span className="line-clamp-1 max-w-[320px] text-[13px] font-medium text-[#111110]">
            {form.title || (mode === "create" ? "새 문서" : "문서 편집")}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              isDirty
                ? "bg-amber-50 text-amber-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {isDirty ? "저장 안 됨" : "저장됨"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode === "edit" && article ? (
            <Link
              href={article.publicPath}
              target="_blank"
              className="inline-flex items-center gap-1.5 text-[12px] text-[#1a1a1a]/45 transition-colors hover:text-[#084734]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              공개 페이지
            </Link>
          ) : null}

          {error ? <span role="alert" className="text-[12px] text-red-600">{error}</span> : null}
          {savedMessage ? (
            <span role="status" aria-live="polite" className="text-[12px] text-emerald-600">{savedMessage}</span>
          ) : null}
          {support.warning ? (
            <span role="status" className="max-w-[280px] truncate text-[12px] text-amber-600">{support.warning}</span>
          ) : null}

          {mode === "edit" && article ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#B85C33] transition-colors hover:bg-[#FEF3EE] disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              삭제
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] font-medium text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "저장 중..." : mode === "edit" ? "임시 저장" : "초안 저장"}
          </button>

          <button
            type="button"
            onClick={() =>
              void publishDraft(
                mode === "create" || form.status !== "published" ? { status: "published" } : {}
              )
            }
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#084734] px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#065c41] disabled:opacity-50"
          >
            {mode === "edit" && form.status === "published" ? "공개본에 반영" : "게시하기"}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {mode === "edit" ? (
          <div className="mb-6 rounded-2xl border border-[#DDEFE5] bg-[#F7FBF8] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[13px] font-semibold text-[#084734]">
                  {support.draft ? "작업 초안 편집 중" : "공개본 보호 모드"}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/55">
                  임시 저장은 공개 문서를 바꾸지 않습니다. 최종 검수 후
                  {" "}
                  <span className="font-semibold text-[#111110]">공개본에 반영</span>
                  을 눌러야 `/docs` 페이지와 검색 인덱스가 최신화됩니다.
                </p>
              </div>
              {support.draft ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className="rounded-full border border-emerald-100 bg-white px-3 py-1 text-[12px] font-semibold text-[#084734]">
                    임시 저장 {formatDateTime(support.draft.updatedAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void discardDraft()}
                    disabled={saving}
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#B85C33] transition-colors hover:bg-[#FEF3EE] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    초안 삭제
                  </button>
                </div>
              ) : (
                <span className="shrink-0 rounded-full border border-[#e8e8e4] bg-white px-3 py-1 text-[12px] font-semibold text-[#1a1a1a]/45">
                  임시 저장 없음
                </span>
              )}
            </div>
          </div>
        ) : null}

        <section className="mb-6 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-4 shadow-sm md:p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-[#dcebd9] bg-[#ECFDF5] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#084734]/75">필수 입력</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[#084734]">{requiredDone}/{requiredItems.length}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {requiredItems.map((item) => (
                  <span
                    key={item.label}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      item.done ? "bg-[#084734] text-white" : "border border-[#F6D5C5] bg-white text-[#B85C33]"
                    }`}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-[#e8e8e4] bg-[#FAFAF8] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#615D59]">본문 구조</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[#111110]">{previewSections.length}개</p>
              <p className="mt-1 text-[12px] text-[#615D59]">
                {estimateReadMinutes(form.contentMarkdown)}분 읽기 · {contentCharacterCount.toLocaleString("ko-KR")}자
              </p>
            </div>
            <div className="rounded-xl border border-[#e8e8e4] bg-[#FAFAF8] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#615D59]">챗봇 준비</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[#111110]">{completedAiChecks}/{aiChecklist.length}</p>
              <p className="mt-1 text-[12px] text-[#615D59]">
                검색 메타와 본문 청킹 상태를 같이 봅니다.
              </p>
            </div>
            <div className={`rounded-xl border p-4 ${publishTone}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-75">게시 상태</p>
              <p className="mt-2 text-2xl font-bold">{publishLabel}</p>
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[12px] font-semibold text-[#111110] shadow-sm transition-colors hover:bg-[#F6F5F4]"
              >
                <Eye className="h-3.5 w-3.5" />
                미리보기
              </button>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="space-y-6">
            <section className="space-y-4 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">
                  기본 정보
                </h2>
                {isDirty ? (
                  <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                    저장하지 않은 변경 사항
                  </span>
                ) : (
                  <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    최신 저장 상태
                  </span>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                  제목 *
                </label>
                <input
                  aria-label="제목"
                  type="text"
                  value={form.title}
                  onChange={(event) => {
                    const nextTitle = event.target.value
                    update("title", nextTitle)
                    if (mode === "create" && !form.slug) {
                      update("slug", slugify(nextTitle))
                    }
                  }}
                  placeholder="예: 첫 수업 전 30분 설정 체크리스트"
                  className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                    카테고리 *
                  </label>
                  <select
                    aria-label="카테고리"
                    value={form.categoryId}
                    onChange={(event) => updateCategoryAndMoveToEnd(event.target.value)}
                    className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel helpTerm="slug" required>
                    URL 주소(slug)
                  </FieldLabel>
                  <input
                    aria-label="URL 주소 slug"
                    type="text"
                    value={form.slug}
                    onChange={(event) => update("slug", event.target.value)}
                    placeholder="first-class-setup"
                    className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 font-mono text-[12px] focus:border-[#111110]/30 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-[#1a1a1a]/35">공개 URL: {publicPath}</p>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                  설명 *
                </label>
                <textarea
                  aria-label="설명"
                  value={form.description}
                  onChange={(event) => update("description", event.target.value)}
                  rows={2}
                  placeholder="문서 목록과 검색 결과에 노출되는 한 줄 요약"
                  className="w-full resize-none rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <FieldLabel helpTerm="docType">
                    문서 유형
                  </FieldLabel>
                  <select
                    aria-label="문서 유형"
                    value={form.docType}
                    onChange={(event) => update("docType", event.target.value as DocsArticleDocType)}
                    className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                  >
                    {DOC_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel helpTerm="productArea">
                    제품 영역
                  </FieldLabel>
                  <select
                    aria-label="제품 영역"
                    value={form.productArea}
                    onChange={(event) =>
                      update("productArea", event.target.value as DocsArticleProductArea)
                    }
                    className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                  >
                    {PRODUCT_AREA_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                    난이도
                  </label>
                  <select
                    aria-label="난이도"
                    value={form.difficulty}
                    onChange={(event) =>
                      update("difficulty", event.target.value as DocsArticleDifficulty)
                    }
                    className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                  >
                    {DIFFICULTY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-6">
              <div className="mb-4 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">
                      본문 작성
                    </h2>
                    <p className="mt-1 text-[11px] text-[#1a1a1a]/35">
                      Markdown 기반 · 공개 가이드 문서에 동일하게 렌더링됩니다
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[12px] text-[#615D59]">
                    <span className="rounded-full bg-[#F6F5F4] px-3 py-1 font-semibold text-[#111110]">
                      {contentCharacterCount.toLocaleString("ko-KR")}자
                    </span>
                    <span className="rounded-full bg-[#F6F5F4] px-3 py-1 font-semibold text-[#111110]">
                      {previewSections.length}개 섹션
                    </span>
                    <span className="rounded-full bg-[#F6F5F4] px-3 py-1 font-semibold text-[#111110]">
                      {estimateReadMinutes(form.contentMarkdown)}분
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ToolbarButton onClick={() => editorRef.current?.setHeading(2)}>H2</ToolbarButton>
                    <ToolbarButton onClick={() => editorRef.current?.setHeading(3)}>H3</ToolbarButton>
                    <span className="mx-0.5 h-4 w-px bg-[#e8e8e4]" aria-hidden="true" />
                    <ToolbarButton onClick={() => editorRef.current?.toggleBold()} icon={<Type className="h-3 w-3" />}>
                      굵게
                    </ToolbarButton>
                    <ToolbarButton onClick={() => editorRef.current?.toggleItalic()} icon={<Italic className="h-3 w-3" />}>
                      기울이기
                    </ToolbarButton>
                    <ToolbarButton onClick={() => editorRef.current?.toggleHighlight()} icon={<Highlighter className="h-3 w-3" />}>
                      강조색
                    </ToolbarButton>
                    <ToolbarButton onClick={() => editorRef.current?.wrapBrandColor()} icon={<Sparkles className="h-3 w-3" />}>
                      브랜드색
                    </ToolbarButton>
                    <span className="mx-0.5 h-4 w-px bg-[#e8e8e4]" aria-hidden="true" />
                    <ToolbarButton onClick={() => editorRef.current?.toggleBlockquote()} icon={<Quote className="h-3 w-3" />}>
                      인용
                    </ToolbarButton>
                    <ToolbarButton onClick={() => editorRef.current?.toggleBulletList()} icon={<List className="h-3 w-3" />}>
                      리스트
                    </ToolbarButton>
                    <ToolbarButton onClick={() => editorRef.current?.toggleOrderedList()} icon={<ListOrdered className="h-3 w-3" />}>
                      번호
                    </ToolbarButton>
                    <ToolbarButton
                      onClick={() => editorRef.current?.insertMarkdown(PATH_STEP_MARKDOWN)}
                      icon={<Route className="h-3 w-3" />}
                      title={`${PATH_STEP_EXAMPLE} — 공개 문서에서 이동 경로 칩으로 보입니다.`}
                    >
                      경로
                    </ToolbarButton>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ToolbarButton onClick={() => editorRef.current?.insertLink()} icon={<Link2 className="h-3 w-3" />}>
                      링크
                    </ToolbarButton>
                    <ToolbarButton onClick={() => editorRef.current?.insertImage()} icon={<ImageIcon className="h-3 w-3" />}>
                      이미지
                    </ToolbarButton>
                    <ToolbarButton onClick={() => editorRef.current?.insertDivider()} icon={<Minus className="h-3 w-3" />}>
                      구분선
                    </ToolbarButton>
                    <span className="mx-0.5 h-4 w-px bg-[#e8e8e4]" aria-hidden="true" />
                    <ToolbarButton
                      onClick={() => markdownFileInputRef.current?.click()}
                      icon={<Upload className="h-3 w-3" />}
                    >
                      MD 가져오기
                    </ToolbarButton>
                    <ToolbarButton
                      onClick={exportMarkdownFile}
                      icon={<Download className="h-3 w-3" />}
                    >
                      MD 내보내기
                    </ToolbarButton>
                  </div>
                  <input
                    ref={markdownFileInputRef}
                    type="file"
                    accept=".md,.markdown,text/markdown"
                    className="hidden"
                    onChange={handleMarkdownFileChange}
                  />
                </div>
              </div>

              {introDropped ? (
                <div className="mb-4 flex items-start gap-2.5 rounded-[8px] border border-[#ECD29C] bg-[#FBF1E0] px-3.5 py-3 text-[11px] leading-4 text-[#7A520F]">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{DROPPED_INTRO_WARNING}</p>
                </div>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
                <RichMarkdownEditor
                  ref={editorRef}
                  value={form.contentMarkdown}
                  onChange={(markdown) => {
                    // flush() 전파를 저장 경로가 같은 틱에서 읽도록 ref를 setState보다 먼저 갱신한다.
                    formRef.current = { ...formRef.current, contentMarkdown: markdown }
                    update("contentMarkdown", markdown)
                  }}
                  placeholder="본문을 작성해주세요"
                  imageUploadEndpoint="/api/admin/upload"
                  onAiDraftClick={applyArticleDraft}
                  onSelectionOptimize={optimizeCurrentMarkdown}
                />

                <div className="space-y-4 rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[#111110]">문서 구조</p>
                    <p className="mt-1 text-[11px] leading-5 text-[#1a1a1a]/40">
                      ## 헤딩이 공개 문서 본문 순서와 챗봇 청킹 기준이 됩니다.
                    </p>
                  </div>
                  <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                    {previewTocItems.length === 0 ? (
                      <p className="text-[12px] text-[#1a1a1a]/30">
                        ## 소제목을 추가하면 섹션 목록이 생성됩니다.
                      </p>
                    ) : (
                      previewTocItems.map((item, index) => (
                        <div key={item.id} className="rounded-lg bg-white px-3 py-2 text-[12px] text-[#1a1a1a]/60">
                          <span className="mr-2 font-semibold tabular-nums text-[#084734]">{index + 1}</span>
                          {item.title}
                        </div>
                      ))
                    )}
                  </div>

                  <div className="h-px bg-[#e8e8e4]" />

                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => markdownFileInputRef.current?.click()}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4]"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      MD 가져오기
                    </button>
                    <button
                      type="button"
                      onClick={exportMarkdownFile}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      MD 내보내기
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewOpen(true)}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#111110] text-[12px] font-semibold text-white transition-colors hover:bg-[#2a2a28]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      사용자 화면 보기
                    </button>
                  </div>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5">
                    <p className="text-[12px] font-semibold text-[#084734]">문법 팁</p>
                    <div className="mt-2 space-y-1.5 text-[11px] leading-5 text-[#084734]/75">
                      <p>**굵게** · *기울임* · ==강조==</p>
                      <p>{"{{green:브랜드색}} · [링크](url)"}</p>
                      <p>![설명](/images/example.png) · {">"} 인용</p>
                      <p>- {PATH_STEP_EXAMPLE} → 이동 경로 칩</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[#DDEFE5] bg-[#F7FBF8] p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-[#084734]" />
                    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#084734]">
                      AI/챗봇 준비 상태
                    </h2>
                  </div>
                  <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-[#1a1a1a]/48">
                    저장 전에 챗봇 답변 후보로 쓸 수 있는지 확인하고, 부족한 메타데이터를 빠르게 채웁니다.
                  </p>
                </div>
                <span className="inline-flex w-fit items-center rounded-full border border-emerald-100 bg-white px-3 py-1 text-[12px] font-semibold text-[#084734]">
                  {completedAiChecks}/{aiChecklist.length} 완료
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {aiChecklist.map((item) => (
                  <div key={item.label} className="border-t border-[#DDEFE5] pt-3">
                    <div className="flex items-center gap-2">
                      {item.complete ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <CircleAlert className="h-4 w-4 text-[#B85C33]" />
                      )}
                      <p className="text-[13px] font-semibold text-[#111110]">{item.label}</p>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-[#1a1a1a]/42">{item.hint}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applySummaryDraft}
                  disabled={!suggestedSummary}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDEFE5] bg-white px-3 py-2 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#EDF8F1] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  요약 초안 채우기
                </button>
                <button
                  type="button"
                  onClick={applySuggestedKeywords}
                  disabled={suggestedKeywords.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDEFE5] bg-white px-3 py-2 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#EDF8F1] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  추천 키워드 추가
                </button>
                <button
                  type="button"
                  onClick={applyChatbotVisibility}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDEFE5] bg-white px-3 py-2 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#EDF8F1]"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  챗봇 노출값 맞추기
                </button>
                <button
                  type="button"
                  onClick={applyArticleDraft}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDEFE5] bg-white px-3 py-2 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#EDF8F1]"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  본문 초안 채우기
                </button>
                <button
                  type="button"
                  onClick={applySeoDraft}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDEFE5] bg-white px-3 py-2 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#EDF8F1]"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  SEO 초안 채우기
                </button>
                <button
                  type="button"
                  onClick={optimizeCurrentMarkdown}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDEFE5] bg-white px-3 py-2 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#EDF8F1]"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  본문 정리
                </button>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-6">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">
                검색 메타
              </h2>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                  대상 (쉼표 구분)
                </label>
                <input
                  aria-label="대상"
                  type="text"
                  value={form.audience}
                  onChange={(event) => update("audience", event.target.value)}
                  placeholder="예: 원장, 운영팀, 교사"
                  className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                    태그 (쉼표 구분)
                  </label>
                  <input
                    aria-label="태그"
                    type="text"
                    value={form.tagsCsv}
                    onChange={(event) => update("tagsCsv", event.target.value)}
                    placeholder="온보딩, 체크리스트"
                    className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                  />
                </div>
                <div>
                  <FieldLabel helpTerm="keywords">
                    검색 키워드 (쉼표 구분)
                  </FieldLabel>
                  <input
                    aria-label="검색 키워드"
                    type="text"
                    value={form.keywordsCsv}
                    onChange={(event) => update("keywordsCsv", event.target.value)}
                    placeholder="첫 수업, 학생 초대"
                    className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                    증상 (문제 해결 전용)
                  </label>
                  <input
                    aria-label="증상"
                    type="text"
                    value={form.symptomsCsv}
                    onChange={(event) => update("symptomsCsv", event.target.value)}
                    placeholder="검은 화면, 소리 안 나옴"
                    className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <FieldLabel helpTerm="chatbotSummary">
                  챗봇 요약
                </FieldLabel>
                <textarea
                  aria-label="챗봇 요약"
                  value={form.chatbotSummary}
                  onChange={(event) => update("chatbotSummary", event.target.value)}
                  rows={3}
                  placeholder="챗봇이 답변할 때 우선 참고하는 2~3문장 요약"
                  className="w-full resize-none rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
            </section>

            {mode === "edit" && article ? (
              <section className="space-y-5 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">
                      관련 문서
                    </h2>
                    <p className="mt-1 text-[12px] text-[#1a1a1a]/40">
                      공개 문서 하단과 챗봇 문맥 확장에 함께 쓰이는 연결입니다.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addRelation}
                      disabled={support.articleOptions.length === 0}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      연결 추가
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveRelations()}
                      disabled={relationsSaving}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#111110] px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#2a2a28] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {relationsSaving ? "저장 중" : "저장"}
                    </button>
                  </div>
                </div>

                {supportLoading ? (
                  <p className="rounded-xl bg-[#FAFAF8] px-4 py-6 text-center text-[13px] text-[#1a1a1a]/35">
                    관련 문서를 불러오는 중입니다.
                  </p>
                ) : support.relations.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[#e8e8e4] px-4 py-6 text-center text-[13px] text-[#1a1a1a]/35">
                    연결된 문서가 없습니다.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {support.relations.map((relation, index) => (
                      <div key={`${relation.relatedArticleId}:${index}`} className="grid gap-2 rounded-xl border border-[#e8e8e4] bg-[#FAFAF8] p-3">
                        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px_84px]">
                      <select
                        aria-label="관련 문서"
                        value={relation.relatedArticleId}
                            onChange={(event) => {
                              const option = support.articleOptions.find((item) => item.id === event.target.value)
                              updateRelation(index, "relatedArticleId", event.target.value)
                              updateRelation(index, "relatedTitle", option?.title ?? "")
                              updateRelation(index, "relatedSlug", option?.slug ?? "")
                              updateRelation(index, "relatedCategoryId", option?.categoryId ?? "")
                            }}
                            className="h-9 min-w-0 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none focus:border-[#084734]"
                          >
                            {support.articleOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.title}
                              </option>
                            ))}
                          </select>
                      <select
                        aria-label="관련 문서 연결 유형"
                        value={relation.relationType ?? "related"}
                            onChange={(event) =>
                              updateRelation(index, "relationType", event.target.value as RelationType)
                            }
                            className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none focus:border-[#084734]"
                          >
                            {RELATION_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                      <button
                        type="button"
                        aria-label="관련 문서 연결 삭제"
                        onClick={() => removeRelation(index)}
                            className="h-9 rounded-lg border border-[#e8e8e4] bg-white text-[12px] font-semibold text-[#B85C33] transition-colors hover:bg-[#FEF3EE]"
                          >
                            제거
                          </button>
                        </div>
                        <input
                          aria-label="관련 문서 메모"
                          value={relation.note ?? ""}
                          onChange={(event) => updateRelation(index, "note", event.target.value)}
                          placeholder="내부 메모 또는 연결 이유"
                          className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

          </main>

          <aside className="lg:self-start lg:pr-1">
            <section className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-4">
              <div className="rounded-xl bg-[#FAFAF8] p-1">
                <div
                  role="tablist"
                  aria-label="문서 편집 보조 패널"
                  className={`grid gap-1 ${
                    visibleSidebarTabs.length === 4
                      ? "grid-cols-4"
                      : visibleSidebarTabs.length === 3
                        ? "grid-cols-3"
                        : "grid-cols-2"
                  }`}
                >
                  {visibleSidebarTabs.map((tab) => (
                    <button
                      key={tab.value}
                      id={`docs-editor-tab-${tab.value}`}
                      type="button"
                      role="tab"
                      aria-selected={activeSidebarTab === tab.value}
                      tabIndex={activeSidebarTab === tab.value ? 0 : -1}
                      onClick={() => setActiveSidebarTab(tab.value)}
                      onKeyDown={(event) => handleSidebarTabKeyDown(event, tab.value)}
                      className={`rounded-lg px-2 py-2 text-[12px] font-semibold transition-colors ${
                        activeSidebarTab === tab.value
                          ? "bg-white text-[#111110] shadow-sm"
                          : "text-[#1a1a1a]/45 hover:text-[#111110]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {activeSidebarTab === "publish" ? (
                <div className="mt-5 space-y-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">
                        게시 설정
                      </h2>
                      <p className="mt-1 text-[12px] text-[#1a1a1a]/40">
                        상태, 공개 범위, SEO 값을 저장 전에 확인합니다.
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isDirty ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {isDirty ? "미저장" : "저장됨"}
                    </span>
                  </div>

                  <div>
                    <FieldLabel helpTerm="status">
                      상태
                    </FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {STATUS_OPTIONS.map((option) => {
                        const active = form.status === option.value
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => update("status", option.value)}
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
                              active
                                ? option.tone
                                : "border-[#e8e8e4] bg-white text-[#1a1a1a]/40 hover:bg-[#f5f5f2]"
                            }`}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div>
                      <FieldLabel helpTerm="visibility">
                        가시성
                      </FieldLabel>
                      <select
                        aria-label="가시성"
                        value={form.visibility}
                        onChange={(event) =>
                          update("visibility", event.target.value as DocsArticleVisibility)
                        }
                        className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                      >
                        {VISIBILITY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="rounded-xl border border-[#e8e8e4] bg-[#FAFAF8] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-[12px] font-semibold text-[#111110]">
                              왼쪽 사이드 순서
                            </p>
                            <HelpTip term="orderIndex" />
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-[#1a1a1a]/38">
                            공개 문서 왼쪽 카테고리 목록에서 보일 위치입니다.
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-bold text-[#111110]">
                          {previewSidebarPosition}/{previewSidebarTotal}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => moveCurrentPreviewSidebarOrder("up")}
                          disabled={!canMovePreviewUp}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                          위로
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCurrentPreviewSidebarOrder("down")}
                          disabled={!canMovePreviewDown}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                          아래로
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#e8e8e4] bg-white p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[12px] font-semibold text-[#111110]">고급 설정</p>
                        <p className="mt-1 text-[11px] leading-5 text-[#1a1a1a]/38">
                          게시일 표시와 정렬 기준을 직접 보정합니다.
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-[#e8e8e4] bg-[#FAFAF8] px-2.5 py-1 text-[11px] font-semibold text-[#1a1a1a]/45">
                        선택
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label
                          htmlFor="docs-published-at"
                          className="mb-1.5 text-[12px] font-medium text-[#1a1a1a]/50"
                        >
                          발행 날짜
                        </label>
                        {form.publishedAt ? (
                          <button
                            type="button"
                            onClick={() => update("publishedAt", "")}
                            className="mb-1.5 text-[11px] font-semibold text-[#1a1a1a]/35 transition-colors hover:text-[#B85C33]"
                          >
                            비우기
                          </button>
                        ) : null}
                      </div>
                      <input
                        id="docs-published-at"
                        type="datetime-local"
                        value={isoToLocalDatetimeInput(form.publishedAt)}
                        onChange={(event) =>
                          update("publishedAt", localDatetimeInputToIso(event.target.value))
                        }
                        className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => update("publishedAt", new Date().toISOString())}
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4]"
                        >
                          지금으로 설정
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!article?.publishedAt) return
                            update("publishedAt", article.publishedAt)
                          }}
                          disabled={!article?.publishedAt}
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          기존 날짜 복원
                        </button>
                      </div>
                      <p className="text-[11px] leading-5 text-[#1a1a1a]/35">
                        새 문서를 게시할 때 비워두면 저장 시각이 자동 기록됩니다.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 rounded-xl bg-[#FAFAF8] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-[#1a1a1a]/60">
                        <input
                          type="checkbox"
                          checked={form.featured}
                          onChange={(event) => update("featured", event.target.checked)}
                          className="h-4 w-4 rounded border-[rgba(0,0,0,0.15)]"
                        />
                        대표 문서
                      </label>
                      <HelpTip term="featured" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-[#1a1a1a]/60">
                        <input
                          type="checkbox"
                          checked={form.noindex}
                          onChange={(event) => update("noindex", event.target.checked)}
                          className="h-4 w-4 rounded border-[rgba(0,0,0,0.15)]"
                        />
                        검색 엔진 색인 제외
                      </label>
                      <HelpTip term="noindex" />
                    </div>
                  </div>

                  <div className="grid gap-4 border-t border-[#f0f0ec] pt-4">
                    <div>
                      <FieldLabel helpTerm="seo">
                        SEO 제목
                      </FieldLabel>
                      <input
                        aria-label="SEO 제목"
                        type="text"
                        value={form.seoTitle}
                        onChange={(event) => update("seoTitle", event.target.value)}
                        placeholder="기본: 제목 | ClassIn 가이드"
                        className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                      />
                    </div>
                    <div>
                      <FieldLabel helpTerm="seo">
                        SEO 설명
                      </FieldLabel>
                      <input
                        aria-label="SEO 설명"
                        type="text"
                        value={form.seoDescription}
                        onChange={(event) => update("seoDescription", event.target.value)}
                        placeholder="기본: 설명 필드"
                        className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                      />
                    </div>
                  </div>

                  {mode === "edit" && article ? (
                    <div className="grid gap-2 rounded-xl bg-[#FAFAF8] px-4 py-3 text-[12px] text-[#1a1a1a]/45">
                      <span>
                        게시일: {formatDateTime(form.publishedAt)}
                      </span>
                      <span>
                        최근 검수: {article.lastReviewedAt ? new Date(article.lastReviewedAt).toLocaleString("ko-KR") : "-"}
                      </span>
                      <span>
                        업데이트: {new Date(article.updatedAt).toLocaleString("ko-KR")}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeSidebarTab === "insights" && mode === "edit" ? (
                <div className="mt-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-[#1a1a1a]/35" />
                    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">
                      문서 성과
                    </h2>
                  </div>
                  {supportLoading ? (
                    <p role="status" aria-live="polite" aria-busy="true" className="rounded-xl bg-[#FAFAF8] px-4 py-6 text-center text-[13px] text-[#1a1a1a]/35">
                      성과를 불러오는 중입니다.
                    </p>
                  ) : !support.analytics ? (
                    <div role="alert" className="grid gap-3 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] p-4 text-[12px] text-[#8F2C2C]">
                      <p>문서 성과를 불러오지 못했습니다. 0건으로 표시하지 않습니다.</p>
                      <button
                        type="button"
                        onClick={() => void loadEditorSupport()}
                        className="inline-flex w-fit items-center justify-center rounded-lg border border-[#F2B8B8] bg-white px-3 font-semibold transition-colors hover:bg-[#FCE9E9]"
                      >
                        다시 시도
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3">
                        <div className="rounded-xl bg-[#FAFAF8] p-3">
                          <p className="text-[11px] text-[#1a1a1a]/35">피드백</p>
                          <p className="mt-1 text-xl font-bold text-[#111110]">{support.analytics.feedbackTotal}</p>
                          <p className="text-[11px] text-[#1a1a1a]/35">
                            도움됨 {support.analytics.helpfulRate ?? "-"}%
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl bg-[#FAFAF8] p-3">
                            <p className="text-[11px] text-[#1a1a1a]/35">검색 클릭</p>
                            <p className="mt-1 text-xl font-bold text-[#111110]">{support.analytics.searchClicks}</p>
                          </div>
                          <div className="rounded-xl bg-[#FAFAF8] p-3">
                            <p className="text-[11px] text-[#1a1a1a]/35">챗봇 인용</p>
                            <p className="mt-1 text-xl font-bold text-[#111110]">{support.analytics.chatbotCitations}</p>
                          </div>
                        </div>
                      </div>
                      {support.analytics.recentFeedback.length > 0 ? (
                        <div className="divide-y divide-[#f0f0ec] rounded-xl border border-[#e8e8e4]">
                          {support.analytics.recentFeedback.slice(0, 3).map((item) => (
                            <div key={item.id} className="p-3">
                              <p className="text-[12px] font-semibold text-[#111110]">
                                {item.helpful ? "도움됨" : "도움 안 됨"} · {formatDateTime(item.createdAt)}
                              </p>
                              {item.reason ? (
                                <p className="mt-1 line-clamp-2 text-[12px] text-[#1a1a1a]/45">{item.reason}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-xl border border-dashed border-[#e8e8e4] px-4 py-6 text-center text-[13px] text-[#1a1a1a]/35">
                          최근 피드백이 없습니다.
                        </p>
                      )}
                    </>
                  )}
                </div>
              ) : null}

              {activeSidebarTab === "versions" && mode === "edit" ? (
                <div className="mt-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-[#1a1a1a]/35" />
                    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">
                      버전 기록
                    </h2>
                  </div>
                  <div className="grid gap-2">
                    <input
                      aria-label="스냅샷 메모"
                      value={snapshotNote}
                      onChange={(event) => setSnapshotNote(event.target.value)}
                      className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none focus:border-[#084734]"
                    />
                    <button
                      type="button"
                      onClick={() => void createSnapshot()}
                      disabled={snapshotting}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#111110] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#2a2a28] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {snapshotting ? "스냅샷 생성 중" : "스냅샷 만들기"}
                    </button>
                  </div>
                  {supportLoading ? (
                    <p className="rounded-xl bg-[#FAFAF8] px-4 py-6 text-center text-[13px] text-[#1a1a1a]/35">
                      버전을 불러오는 중입니다.
                    </p>
                  ) : support.versions.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[#e8e8e4] px-4 py-6 text-center text-[13px] text-[#1a1a1a]/35">
                      저장된 버전이 없습니다.
                    </p>
                  ) : (
                    <div className="max-h-[420px] divide-y divide-[#f0f0ec] overflow-y-auto rounded-xl border border-[#e8e8e4]">
                      {support.versions.map((version) => (
                        <div key={version.id} className="grid gap-3 p-3">
                          <div>
                            <p className="text-[13px] font-semibold text-[#111110]">
                              v{version.versionNumber} · {version.title}
                            </p>
                            <p className="mt-1 text-[11px] text-[#1a1a1a]/35">
                              {version.changeNote ?? "변경 메모 없음"} · {formatDateTime(version.createdAt)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void rollbackToVersion(version)}
                            disabled={rollingBackVersionId === version.id}
                            className="inline-flex h-8 w-fit items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            이 버전으로 롤백
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {activeSidebarTab === "templates" && mode === "create" ? (
                <div className="mt-5 space-y-4">
                  <div>
                    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">
                      작성 템플릿
                    </h2>
                    <p className="mt-2 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                      문서 유형을 고르면 기본 섹션과 검색 메타를 함께 채웁니다.
                    </p>
                  </div>
                  <div className="grid gap-3">
                    {DOC_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => applyTemplate(template)}
                        className="rounded-xl border border-[#e8e8e4] bg-[#FAFAF8] p-4 text-left transition-colors hover:border-[#084734]/30 hover:bg-[#F7FBF8]"
                      >
                        <span className="block text-[13px] font-semibold text-[#111110]">
                          {template.label}
                        </span>
                        <span className="mt-2 block text-[12px] leading-relaxed text-[#1a1a1a]/45">
                          {template.description}
                        </span>
                        <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#084734]">
                          <Wand2 className="h-3.5 w-3.5" />
                          템플릿 적용
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      </div>

      {previewOpen ? (
        <div
          ref={previewDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="사용자 화면 미리보기"
          className="fixed inset-0 z-50 bg-[#111110]/55 p-3 backdrop-blur-sm sm:p-5"
        >
          <div className="mx-auto flex h-full max-w-[1440px] flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-[#FAFAF8] shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e8e4] bg-white px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#084734]">
                  User Preview
                </p>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[12px] text-[#1a1a1a]/45">
                  <span className="truncate font-mono">{publicPath}</span>
                  <span className="rounded-full border border-[#e8e8e4] px-2 py-0.5 font-semibold text-[#1a1a1a]/45">
                    왼쪽 사이드 {previewSidebarPosition}/{previewSidebarTotal}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {mode === "edit" && article ? (
                  <Link
                    href={article.publicPath}
                    target="_blank"
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    공개 페이지
                  </Link>
                ) : null}
                <button
                  ref={previewCloseButtonRef}
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">미리보기 닫기</span>
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <section className="px-4 py-6 sm:px-6 lg:px-8">
                <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_220px]">
                  <div className="lg:sticky lg:top-6 lg:self-start">
                    <DocsSidebar groups={previewNavGroups} title="가이드" />
                  </div>
                  <main id="preview-current-doc" className="min-w-0">
                    <DocsArticle
                      eyebrow={activeCategoryTitle}
                      title={form.title.trim() || "새 문서"}
                      description={form.description.trim() || "문서 설명이 여기에 표시됩니다."}
                      meta={
                        <div className="flex flex-wrap items-center gap-4">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 className="h-4 w-4" />
                            {estimateReadMinutes(form.contentMarkdown)}분 읽기
                          </span>
                          {previewAudience ? <span>추천 대상: {previewAudience}</span> : null}
                        </div>
                      }
                      sections={previewArticleSections}
                    />
                    {previewSections.length === 0 ? (
                      <p className="mt-8 rounded-xl border border-dashed border-[#e8e8e4] bg-white px-4 py-8 text-center text-[13px] text-[#1a1a1a]/35">
                        본문에 섹션을 입력하면 공개 문서 미리보기가 표시됩니다.
                      </p>
                    ) : null}
                  </main>
                  <div className="hidden xl:sticky xl:top-6 xl:block xl:self-start">
                    <DocsTableOfContents items={previewTocItems} title="본문 순서" />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
