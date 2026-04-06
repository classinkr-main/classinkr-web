"use client"

import Link from "next/link"
import { startTransition, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  Eye,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Save,
  Sparkles,
  Type,
  Undo2,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import {
  BLOG_STATUS_OPTIONS,
  CATEGORIES,
  DEFAULT_BLOG_CTA,
  type BlogPost,
  type BlogPostInput,
  type BlogPostStatus,
} from "@/lib/blog-types"
import {
  estimateReadTime,
  extractMarkdownHeadings,
  slugify,
} from "@/lib/blog-markdown"

interface BlogPostEditorProps {
  mode: "create" | "edit"
  initialPost?: BlogPost
  allPosts: BlogPost[]
}

type DraftState = "saved" | "saving" | "dirty"
type EditorSnapshot = {
  form: BlogPostInput
  tagsInput: string
  slugEdited: boolean
}
type PersistedDraft = {
  version: 2
  snapshot: EditorSnapshot
  updatedAt: string
}
type DraftIndexEntry = {
  key: string
  href: string
  mode: "create" | "edit"
  title: string
  excerpt: string
  category: string
  updatedAt: string
}
type BlogAiTemplateKey = "insight" | "product" | "case" | "event" | "faq"
type BlogAiTool = "refine" | "template" | "title" | "excerpt" | "cta" | "seo"
type BlogAiDraft =
  | {
      tool: "refine"
      title: string
      subtitle: string
      note: string
      before: string
      after: string
      applyLabel: string
      selectionStart: number
      selectionEnd: number
    }
  | {
      tool: "template"
      title: string
      subtitle: string
      note: string
      before: string
      after: string
      applyLabel: string
      templateKey: BlogAiTemplateKey
    }
  | {
      tool: "title"
      title: string
      subtitle: string
      note: string
      suggestions: string[]
      applyLabel: string
    }
  | {
      tool: "excerpt"
      title: string
      subtitle: string
      note: string
      suggestions: string[]
      applyLabel: string
    }
  | {
      tool: "cta"
      title: string
      subtitle: string
      note: string
      before: string
      after: string
      checklist: string[]
      applyLabel: string
      cta: BlogPostInput["cta"]
    }
  | {
      tool: "seo"
      title: string
      subtitle: string
      note: string
      before: string
      after: string
      checklist: { label: string; ok: boolean }[]
      applyLabel: string
      seo: {
        seoTitle: string
        seoDescription: string
        thumbnailAlt: string
        heroImageAlt: string
      }
    }

const HISTORY_LIMIT = 50
const DRAFT_INDEX_KEY = "admin-blog-editor-drafts-v2"

const BLOG_AI_TEMPLATE_META: Record<
  BlogAiTemplateKey,
  { label: string; description: string; summary: string }
> = {
  insight: {
    label: "인사이트형",
    description: "문제 -> 핵심 포인트 -> 다음 액션",
    summary: "운영 팁, 분석, 체크리스트를 빠르게 정리할 때 좋습니다.",
  },
  product: {
    label: "제품 업데이트형",
    description: "배경 -> 바뀐 점 -> 영향",
    summary: "기능 변경, 릴리즈 노트, 운영 정책 공지에 맞습니다.",
  },
  case: {
    label: "성공 사례형",
    description: "상황 -> 적용 전 -> 적용 후",
    summary: "사례와 전후 비교를 설득력 있게 쌓는 구조입니다.",
  },
  event: {
    label: "이벤트형",
    description: "행사 개요 -> 누구에게 -> 참여 방법",
    summary: "세미나, 웨비나, 오프라인 이벤트 안내용입니다.",
  },
  faq: {
    label: "FAQ형",
    description: "질문 -> 답변 -> 정리",
    summary: "반복 문의, 가이드, 운영 Q&A를 묶을 때 적합합니다.",
  },
}

const BLOG_AI_TOOL_META: Record<
  BlogAiTool,
  { label: string; description: string; tone: string }
> = {
  refine: {
    label: "다듬기",
    description: "선택한 문장을 더 읽기 좋게 정리",
    tone: "border-[#d5e7dd] bg-[#f4fbf7] text-[#084734]",
  },
  template: {
    label: "템플릿",
    description: "초안 구조를 빠르게 만든 뒤 시작",
    tone: "border-[#dbe5f7] bg-[#f5f8ff] text-[#1f4ea3]",
  },
  title: {
    label: "제목",
    description: "현재 글의 클릭 가능한 제목 3안",
    tone: "border-[#ece0d2] bg-[#fff8f0] text-[#9c5a11]",
  },
  excerpt: {
    label: "요약",
    description: "한 줄 요약과 검색 노출 문구 보강",
    tone: "border-[#e0e0ea] bg-[#faf9ff] text-[#5a45a8]",
  },
  cta: {
    label: "CTA",
    description: "하단 행동 유도 문구와 버튼 정리",
    tone: "border-[#dce9e6] bg-[#f5fbfa] text-[#11635b]",
  },
  seo: {
    label: "SEO",
    description: "검색/대표 이미지/설명 누락 확인",
    tone: "border-[#e6e8d9] bg-[#fbfcf2] text-[#6b7a24]",
  },
}

function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    form: JSON.parse(JSON.stringify(snapshot.form)) as BlogPostInput,
    tagsInput: snapshot.tagsInput,
    slugEdited: snapshot.slugEdited,
  }
}

function isMeaningfulSnapshot(snapshot: EditorSnapshot) {
  const form = snapshot.form
  return Boolean(
    form.title.trim() ||
      form.excerpt.trim() ||
      form.contentMarkdown.trim() ||
      form.slug.trim() ||
      form.tags.some(Boolean) ||
      form.imageUrl.trim() ||
      form.heroImageUrl.trim() ||
      form.cta.title.trim() ||
      form.cta.description.trim()
  )
}

function formatRelativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime()
  if (Number.isNaN(diff)) return "방금 전"
  if (diff < 60_000) return "방금 전"
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}분 전`
  if (diff < 86_400_000) return `${Math.max(1, Math.round(diff / 3_600_000))}시간 전`

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

function formatDraftStamp(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function readDraftIndex(): DraftIndexEntry[] {
  if (typeof window === "undefined") return []

  try {
    const raw = localStorage.getItem(DRAFT_INDEX_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((entry): entry is DraftIndexEntry => {
        if (!entry || typeof entry !== "object") return false
        const candidate = entry as DraftIndexEntry
        return (
          typeof candidate.key === "string" &&
          typeof candidate.href === "string" &&
          typeof candidate.mode === "string" &&
          typeof candidate.title === "string" &&
          typeof candidate.excerpt === "string" &&
          typeof candidate.category === "string" &&
          typeof candidate.updatedAt === "string"
        )
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  } catch {
    return []
  }
}

function writeDraftIndex(entries: DraftIndexEntry[]) {
  if (typeof window === "undefined") return

  localStorage.setItem(
    DRAFT_INDEX_KEY,
    JSON.stringify(
      [...entries].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    )
  )
}

function upsertDraftIndex(entry: DraftIndexEntry) {
  const currentEntries = readDraftIndex()
  const nextEntries = [entry, ...currentEntries.filter((draft) => draft.key !== entry.key)]
  writeDraftIndex(nextEntries)
  return nextEntries
}

function removeDraftIndexEntry(key: string) {
  const currentEntries = readDraftIndex()
  const nextEntries = currentEntries.filter((draft) => draft.key !== key)
  writeDraftIndex(nextEntries)
  return nextEntries
}

function getStoredDraft(key: string) {
  if (typeof window === "undefined") return null

  const rawDraft = localStorage.getItem(key)
  if (!rawDraft) return null

  try {
    const parsed = JSON.parse(rawDraft) as unknown

    if (
      parsed &&
      typeof parsed === "object" &&
      "version" in parsed &&
      (parsed as PersistedDraft).version === 2 &&
      "snapshot" in parsed
    ) {
      const payload = parsed as PersistedDraft
      return {
        snapshot: cloneSnapshot(payload.snapshot),
        updatedAt: payload.updatedAt,
      }
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      "form" in parsed &&
      "tagsInput" in parsed &&
      "slugEdited" in parsed
    ) {
      const legacy = parsed as EditorSnapshot
      return {
        snapshot: cloneSnapshot(legacy),
        updatedAt: new Date().toISOString(),
      }
    }

    if (parsed && typeof parsed === "object" && "title" in parsed) {
      const form = parsed as BlogPostInput
      return {
        snapshot: {
          form: cloneSnapshot({
            form,
            tagsInput: form.tags.join(", "),
            slugEdited: Boolean(form.slug),
          }).form,
          tagsInput: form.tags.join(", "),
          slugEdited: Boolean(form.slug),
        },
        updatedAt: new Date().toISOString(),
      }
    }

    return null
  } catch {
    return null
  }
}

function normalizeMarkdownBlock(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(^|\n)(#{1,6})([^\s#])/g, "$1$2 $3")
    .replace(/(^|\n)([-*+])(?=\S)/g, "$1$2 ")
    .trim()
}

function buildAiTemplateMarkdown(
  key: BlogAiTemplateKey,
  form: BlogPostInput
) {
  const title = form.title.trim() || BLOG_AI_TEMPLATE_META[key].label
  const audience = form.targetReader.trim() || "독자"
  const category = form.category.trim() || "인사이트"
  const ctaTitle = form.cta.title.trim() || DEFAULT_BLOG_CTA.title
  const ctaLabel = form.cta.buttonLabel.trim() || DEFAULT_BLOG_CTA.buttonLabel

  const templates: Record<BlogAiTemplateKey, string[]> = {
    insight: [
      "## 문제",
      "",
      `${audience}이 바로 겪는 문제를 먼저 정리합니다.`,
      "",
      "## 핵심 포인트",
      "",
      "- 지금 확인할 포인트 1",
      "- 지금 확인할 포인트 2",
      "- 지금 확인할 포인트 3",
      "",
      "## 다음 액션",
      "",
      `${category} 관점에서 바로 실행할 체크리스트를 남깁니다.`,
    ],
    product: [
      "## 업데이트 배경",
      "",
      `${title}가 왜 지금 필요한지 설명합니다.`,
      "",
      "## 무엇이 달라졌나",
      "",
      "- 변경된 점 1",
      "- 변경된 점 2",
      "- 변경으로 생기는 운영 효과",
      "",
      "## 적용 방법",
      "",
      `${audience}이 실제로 적용할 순서를 안내합니다.`,
    ],
    case: [
      "## 상황",
      "",
      "도입 전 어떤 문제가 있었는지 먼저 보여줍니다.",
      "",
      "## 적용 전",
      "",
      "- 기존 흐름의 병목",
      "- 해결되지 않던 지점",
      "",
      "## 적용 후",
      "",
      "- 개선된 결과",
      "- 운영에서 달라진 점",
    ],
    event: [
      "## 행사 개요",
      "",
      `${title}의 핵심 정보를 한눈에 볼 수 있게 정리합니다.`,
      "",
      "## 누구에게 추천하나",
      "",
      `- ${audience}`,
      "- 관련 실무자",
      "",
      "## 참여 방법",
      "",
      `참여 링크와 함께 ${ctaLabel} CTA를 연결합니다.`,
    ],
    faq: [
      "## 자주 묻는 질문",
      "",
      "### 질문 1",
      "",
      "실무에서 가장 많이 묻는 질문을 적습니다.",
      "",
      "### 질문 2",
      "",
      "운영 전에 꼭 확인할 내용을 적습니다.",
      "",
      "## 정리",
      "",
      `${ctaTitle}로 이어지는 마지막 문장을 남깁니다.`,
    ],
  }

  return templates[key].join("\n")
}

function buildAiTitleSuggestions(form: BlogPostInput) {
  const baseTitle = form.title.trim() || form.category.trim() || "블로그"
  const audience = form.targetReader.trim() || "독자"
  const category = form.category.trim() || "인사이트"

  return [
    `${audience}가 먼저 챙겨야 할 ${baseTitle}`,
    `${category} 관점에서 다시 본 ${baseTitle}`,
    `${baseTitle}, 지금 바로 적용할 3가지 포인트`,
  ]
}

function buildAiExcerptSuggestions(form: BlogPostInput) {
  const title = form.title.trim() || form.category.trim() || "이번 글"
  const audience = form.targetReader.trim() || "실무자"
  const category = form.category.trim() || "인사이트"

  return [
    `${title}의 핵심을 ${audience}이 바로 이해할 수 있도록 ${category} 기준으로 정리했습니다.`,
    `${title}를 읽고 나면 다음 액션이 바로 보이도록, 실행 포인트 중심으로 구성했습니다.`,
    `${audience}에게 필요한 정보만 남기고, 현장 적용에 필요한 맥락을 빠르게 담았습니다.`,
  ]
}

function buildAiCtaSuggestion(form: BlogPostInput) {
  const audience = form.targetReader.trim() || "운영팀"
  const category = form.category.trim() || "인사이트"
  const title = form.title.trim() || "우리 팀에 맞는 다음 단계"

  return {
    cta: {
      eyebrow: `${category} 다음 단계`,
      title: `${title}를 ${audience} 상황에 맞게 적용해보세요`,
      description:
        "이 글에서 정리한 핵심을 실제 운영으로 옮길 수 있도록, 가장 부담 없는 다음 액션을 제안합니다.",
      buttonLabel: "상담/문의하기",
      buttonHref: "#demo",
    },
    checklist: [
      "CTA 상단 문구가 본문 주제와 이어집니다.",
      "버튼 문구가 실제 행동으로 연결됩니다.",
      "링크가 실제 상담/문의 흐름과 맞습니다.",
    ],
  }
}

function buildAiSeoSuggestion(form: BlogPostInput) {
  const title = form.title.trim() || form.category.trim() || "블로그 글"
  const excerpt = form.excerpt.trim() || "한 줄 요약을 입력하면 SEO 설명도 더 자연스럽게 맞출 수 있습니다."

  return {
    seo: {
      seoTitle: form.seoTitle.trim() || title,
      seoDescription: form.seoDescription.trim() || excerpt,
      thumbnailAlt: form.thumbnailAlt.trim() || `${title} 썸네일`,
      heroImageAlt: form.heroImageAlt.trim() || `${title} 배너 이미지`,
    },
    checklist: [
      { label: "제목이 검색 결과에 맞게 정리되어 있습니다.", ok: Boolean(title) },
      { label: "설명이 한 줄 요약과 연결됩니다.", ok: Boolean(excerpt) },
      { label: "대표 이미지 alt가 비어 있지 않습니다.", ok: Boolean(form.thumbnailAlt.trim() || form.heroImageAlt.trim()) },
      { label: "CTA와 본문 톤이 어긋나지 않습니다.", ok: Boolean(form.cta.title.trim() && form.cta.buttonLabel.trim()) },
    ],
  }
}

function refineMarkdownSelection(value: string) {
  return normalizeMarkdownBlock(value)
}

function createEmptyDraft(): BlogPostInput {
  const today = new Date()
    .toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\./g, ". ")
    .trim()

  const contentMarkdown = [
    "## 문제",
    "",
    "독자가 현재 겪고 있는 문제를 한 문단으로 정리해보세요.",
    "",
    "## 핵심 포인트",
    "",
    "- 바로 적용할 수 있는 포인트 1",
    "- 바로 적용할 수 있는 포인트 2",
    "- 바로 적용할 수 있는 포인트 3",
    "",
    "## 다음 액션",
    "",
    "이 글을 읽고 나서 어떤 행동을 해야 하는지 적어보세요.",
  ].join("\n")

  return {
    slug: "",
    title: "",
    excerpt: "",
    category: "인사이트",
    tags: [],
    tag: "",
    date: today,
    author: "",
    authorRole: "",
    authorBio: "",
    authorAvatarUrl: "",
    readTime: estimateReadTime(contentMarkdown),
    imageUrl: "",
    thumbnailAlt: "",
    heroImageUrl: "",
    heroImageAlt: "",
    featured: false,
    benefitItems: ["", "", ""],
    targetReader: "",
    contentMarkdown,
    seoTitle: "",
    seoDescription: "",
    relatedPostIds: [],
    cta: { ...DEFAULT_BLOG_CTA },
    status: "draft",
  }
}

function getToken() {
  return sessionStorage.getItem("admin_password") ?? ""
}

function adminFetch(url: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...options?.headers,
    },
  })
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function ToolbarButton({
  onClick,
  children,
  icon,
}: {
  onClick: () => void
  children: string
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-2 text-xs font-medium text-[#1a1a1a]/65 transition-colors hover:border-[#111110]/15 hover:text-[#111110]"
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}

export default function BlogPostEditor({
  mode,
  initialPost,
  allPosts,
}: BlogPostEditorProps) {
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const initialSnapshot = useMemo<EditorSnapshot>(() => {
    const form = initialPost ? { ...initialPost } : createEmptyDraft()
    return {
      form,
      tagsInput: form.tags.join(", "),
      slugEdited: Boolean(initialPost?.slug),
    }
  }, [initialPost])

  const [form, setForm] = useState<BlogPostInput>(() => cloneSnapshot(initialSnapshot).form)
  const [tagsInput, setTagsInput] = useState(initialSnapshot.tagsInput)
  const [draftState, setDraftState] = useState<DraftState>("saved")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState("")
  const [slugEdited, setSlugEdited] = useState(initialSnapshot.slugEdited)
  const [draftEntries, setDraftEntries] = useState<DraftIndexEntry[]>([])
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [aiDraft, setAiDraft] = useState<BlogAiDraft | null>(null)
  const [aiTemplateKey, setAiTemplateKey] = useState<BlogAiTemplateKey>("insight")
  const formRef = useRef(form)
  const tagsInputRef = useRef(tagsInput)
  const slugEditedRef = useRef(slugEdited)
  const hydrationRef = useRef(false)
  const undoStackRef = useRef<EditorSnapshot[]>([])
  const redoStackRef = useRef<EditorSnapshot[]>([])

  const draftStorageKey = `admin-blog-editor-${initialPost?.id ?? "new"}`
  const draftHref = initialPost ? `/admin/blog/${initialPost.id}/edit` : "/admin/blog/new"
  const currentDraftEntry = draftEntries.find((entry) => entry.key === draftStorageKey)
  const otherDraftEntries = draftEntries
    .filter((entry) => entry.key !== draftStorageKey)
    .slice(0, 3)
  const filteredPosts = allPosts.filter((post) => post.id !== initialPost?.id)
  const computedReadTime = estimateReadTime(form.contentMarkdown)
  const aiSeoPreview = buildAiSeoSuggestion(form)
  const aiReadinessChecks = [
    {
      label: "제목",
      hint: form.title.trim() ? "초안 제목이 있습니다." : "제목 보조를 눌러 시작하세요.",
      ok: Boolean(form.title.trim()),
    },
    {
      label: "요약",
      hint: form.excerpt.trim() ? "한 줄 요약이 있습니다." : "요약 보조로 톤을 맞출 수 있습니다.",
      ok: Boolean(form.excerpt.trim()),
    },
    {
      label: "본문",
      hint: form.contentMarkdown.trim() ? "본문을 바로 다듬을 수 있습니다." : "템플릿으로 시작하면 편합니다.",
      ok: Boolean(form.contentMarkdown.trim()),
    },
    {
      label: "CTA",
      hint: form.cta.title.trim() && form.cta.buttonLabel.trim() ? "하단 CTA가 채워져 있습니다." : "CTA 점검으로 보강할 수 있습니다.",
      ok: Boolean(form.cta.title.trim() && form.cta.buttonLabel.trim()),
    },
    {
      label: "SEO",
      hint: aiSeoPreview.seo.seoTitle.trim() && aiSeoPreview.seo.seoDescription.trim() ? "검색 노출 문구가 채워져 있습니다." : "SEO 점검이 아직 필요합니다.",
      ok: Boolean(form.seoTitle.trim() && form.seoDescription.trim()),
    },
  ]
  const aiReadiness = Math.round(
    (aiReadinessChecks.filter((check) => check.ok).length /
      aiReadinessChecks.length) *
      100
  )
  const headings = useMemo(
    () => extractMarkdownHeadings(form.contentMarkdown),
    [form.contentMarkdown]
  )

  useEffect(() => {
    formRef.current = form
  }, [form])

  useEffect(() => {
    tagsInputRef.current = tagsInput
  }, [tagsInput])

  useEffect(() => {
    slugEditedRef.current = slugEdited
  }, [slugEdited])

  const createSnapshot = useCallback((): EditorSnapshot => {
    return cloneSnapshot({
      form: formRef.current,
      tagsInput: tagsInputRef.current,
      slugEdited: slugEditedRef.current,
    })
  }, [])

  const applySnapshot = useCallback((snapshot: EditorSnapshot) => {
    const nextSnapshot = cloneSnapshot(snapshot)
    formRef.current = nextSnapshot.form
    tagsInputRef.current = nextSnapshot.tagsInput
    slugEditedRef.current = nextSnapshot.slugEdited
    setForm(nextSnapshot.form)
    setTagsInput(nextSnapshot.tagsInput)
    setSlugEdited(nextSnapshot.slugEdited)
  }, [])

  const refreshDraftEntries = useCallback(() => {
    setDraftEntries(readDraftIndex())
  }, [])

  const persistDraft = useCallback(
    (snapshot: EditorSnapshot) => {
      if (typeof window === "undefined") return

      const updatedAt = new Date().toISOString()
      const payload: PersistedDraft = {
        version: 2,
        snapshot: cloneSnapshot(snapshot),
        updatedAt,
      }

      localStorage.setItem(draftStorageKey, JSON.stringify(payload))
      setDraftEntries(
        upsertDraftIndex({
          key: draftStorageKey,
          href: draftHref,
          mode,
          title: snapshot.form.title.trim() || "제목 없는 초안",
          excerpt:
            snapshot.form.excerpt.trim() ||
            "요약을 추가하면 목록에서 더 쉽게 찾을 수 있습니다.",
          category: snapshot.form.category,
          updatedAt,
        })
      )
      setLastSavedAt(updatedAt)
    },
    [draftHref, draftStorageKey, mode]
  )

  const discardDraft = useCallback(
    (key: string) => {
      if (typeof window === "undefined") return

      localStorage.removeItem(key)
      setDraftEntries(removeDraftIndexEntry(key))

      if (key === draftStorageKey) {
        setDraftState("saved")
        setLastSavedAt(null)
      }
    },
    [draftStorageKey]
  )

  const updateEditor = useCallback(
    (updater: (snapshot: EditorSnapshot) => EditorSnapshot) => {
      const previousSnapshot = createSnapshot()
      const nextSnapshot = updater(cloneSnapshot(previousSnapshot))

      if (JSON.stringify(previousSnapshot) === JSON.stringify(nextSnapshot)) {
        return
      }

      undoStackRef.current = [
        ...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)),
        previousSnapshot,
      ]
      redoStackRef.current = []
      applySnapshot(nextSnapshot)
      setNotice("")
    },
    [applySnapshot, createSnapshot]
  )

  const handleUndo = useCallback(() => {
    const previousSnapshot = undoStackRef.current.at(-1)
    if (!previousSnapshot) return

    undoStackRef.current = undoStackRef.current.slice(0, -1)
    redoStackRef.current = [...redoStackRef.current, createSnapshot()]
    applySnapshot(previousSnapshot)
    setNotice("이전 편집 상태로 되돌렸습니다.")
  }, [applySnapshot, createSnapshot])

  const handleRedo = useCallback(() => {
    const nextSnapshot = redoStackRef.current.at(-1)
    if (!nextSnapshot) return

    redoStackRef.current = redoStackRef.current.slice(0, -1)
    undoStackRef.current = [...undoStackRef.current, createSnapshot()]
    applySnapshot(nextSnapshot)
    setNotice("다시 실행했습니다.")
  }, [applySnapshot, createSnapshot])

  const replaceContentRange = useCallback(
    (start: number, end: number, nextMarkdown: string) => {
      updateEditor((snapshot) => ({
        ...snapshot,
        form: {
          ...snapshot.form,
          contentMarkdown:
            snapshot.form.contentMarkdown.slice(0, start) +
            nextMarkdown +
            snapshot.form.contentMarkdown.slice(end),
        },
      }))

      window.requestAnimationFrame(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        textarea.focus()
        textarea.selectionStart = start
        textarea.selectionEnd = start + nextMarkdown.length
      })
    },
    [updateEditor]
  )

  const getSelectionRange = () => {
    const textarea = textareaRef.current
    if (!textarea) return null

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    if (start === end) return null

    return {
      start,
      end,
      text: form.contentMarkdown.slice(start, end),
    }
  }

  const openAiDraft = (draft: BlogAiDraft) => {
    setAiDraft(draft)
    setNotice(`AI 제안: ${draft.title}`)
  }

  const openRefineDraft = () => {
    const selection = getSelectionRange()
    if (!selection) {
      setNotice("다듬을 문장을 먼저 선택한 뒤 다시 눌러주세요.")
      textareaRef.current?.focus()
      return
    }

    const after = refineMarkdownSelection(selection.text)
    openAiDraft({
      tool: "refine",
      title: "선택 영역 다듬기",
      subtitle: "줄바꿈, 헤딩, 리스트 규칙만 정리해 읽기 좋게 만듭니다.",
      note: "현재 선택한 부분만 바꾸는 안전한 정리 제안입니다.",
      before: selection.text,
      after,
      applyLabel: "선택 영역에 반영",
      selectionStart: selection.start,
      selectionEnd: selection.end,
    })
  }

  const openTemplateDraft = (nextKey = aiTemplateKey) => {
    const after = buildAiTemplateMarkdown(nextKey, form)
    setAiTemplateKey(nextKey)
    openAiDraft({
      tool: "template",
      title: `${BLOG_AI_TEMPLATE_META[nextKey].label}로 시작`,
      subtitle: BLOG_AI_TEMPLATE_META[nextKey].description,
      note: BLOG_AI_TEMPLATE_META[nextKey].summary,
      before: form.contentMarkdown.trim() || "현재 본문이 비어 있습니다.",
      after,
      applyLabel: form.contentMarkdown.trim() ? "본문 아래에 추가" : "이 템플릿으로 시작",
      templateKey: nextKey,
    })
  }

  const openTitleDraft = () => {
    const suggestions = buildAiTitleSuggestions(form)
    openAiDraft({
      tool: "title",
      title: "제목 보조",
      subtitle: "클릭을 부르는 제목 3안을 빠르게 제안합니다.",
      note: "제목은 SEO 제목에도 같이 반영할 수 있습니다.",
      suggestions,
      applyLabel: "제목 사용",
    })
  }

  const openExcerptDraft = () => {
    const suggestions = buildAiExcerptSuggestions(form)
    openAiDraft({
      tool: "excerpt",
      title: "요약 보조",
      subtitle: "한 줄 요약을 더 읽기 쉽게 정리합니다.",
      note: "발행 전 미리보기와 검색 설명에 같이 쓰기 좋습니다.",
      suggestions,
      applyLabel: "요약 사용",
    })
  }

  const openCtaDraft = () => {
    const suggestion = buildAiCtaSuggestion(form)
    openAiDraft({
      tool: "cta",
      title: "CTA 점검",
      subtitle: "하단 행동 유도 문구를 현재 글 톤에 맞게 보정합니다.",
      note: "CTA는 클릭 다음 행동까지 읽히도록 맞추는 게 핵심입니다.",
      before: `${form.cta.eyebrow} / ${form.cta.title}`,
      after: `${suggestion.cta.eyebrow} / ${suggestion.cta.title}`,
      checklist: suggestion.checklist,
      applyLabel: "CTA 반영",
      cta: suggestion.cta,
    })
  }

  const openSeoDraft = () => {
    const suggestion = buildAiSeoSuggestion(form)
    openAiDraft({
      tool: "seo",
      title: "SEO 점검",
      subtitle: "검색용 제목, 설명, 이미지 alt를 빠짐없이 채웁니다.",
      note: "발행 전 최소한의 노출 품질을 확인하는 단계입니다.",
      before: [form.seoTitle, form.seoDescription, form.thumbnailAlt, form.heroImageAlt]
        .filter(Boolean)
        .join(" · ") || "아직 SEO 값이 비어 있습니다.",
      after: [suggestion.seo.seoTitle, suggestion.seo.seoDescription, suggestion.seo.thumbnailAlt, suggestion.seo.heroImageAlt]
        .join(" · "),
      checklist: suggestion.checklist,
      applyLabel: "SEO 자동 채움",
      seo: suggestion.seo,
    })
  }

  const applyAiDraft = () => {
    if (!aiDraft) return

    switch (aiDraft.tool) {
      case "refine":
        replaceContentRange(aiDraft.selectionStart, aiDraft.selectionEnd, aiDraft.after)
        setNotice("선택 영역을 다듬었습니다.")
        break
      case "template": {
        const nextContent = form.contentMarkdown.trim()
          ? `${form.contentMarkdown.trim()}\n\n---\n\n${aiDraft.after}`
          : aiDraft.after
        updateForm("contentMarkdown", nextContent)
        setNotice("템플릿을 본문에 반영했습니다.")
        break
      }
      case "title":
        updateEditor((snapshot) => ({
          ...snapshot,
          form: {
            ...snapshot.form,
            title: aiDraft.suggestions[0] || snapshot.form.title,
            seoTitle: snapshot.form.seoTitle || aiDraft.suggestions[0] || snapshot.form.title,
          },
        }))
        setNotice("제목 제안을 반영했습니다.")
        break
      case "excerpt":
        updateForm("excerpt", aiDraft.suggestions[0] || form.excerpt)
        setNotice("요약 제안을 반영했습니다.")
        break
      case "cta":
        updateEditor((snapshot) => ({
          ...snapshot,
          form: {
            ...snapshot.form,
            cta: {
              ...snapshot.form.cta,
              ...aiDraft.cta,
            },
          },
        }))
        setNotice("CTA 제안을 반영했습니다.")
        break
      case "seo":
        updateEditor((snapshot) => ({
          ...snapshot,
          form: {
            ...snapshot.form,
            seoTitle: aiDraft.seo.seoTitle,
            seoDescription: aiDraft.seo.seoDescription,
            thumbnailAlt: aiDraft.seo.thumbnailAlt,
            heroImageAlt: aiDraft.seo.heroImageAlt,
          },
        }))
        setNotice("SEO 항목을 자동으로 채웠습니다.")
        break
    }

    setAiDraft(null)
  }

  const applyTitleSuggestion = (nextTitle: string) => {
    updateEditor((snapshot) => ({
      ...snapshot,
      form: {
        ...snapshot.form,
        title: nextTitle,
        seoTitle: snapshot.form.seoTitle || nextTitle,
      },
    }))
    setAiDraft(null)
    setNotice("제목 제안을 반영했습니다.")
  }

  const applyExcerptSuggestion = (nextExcerpt: string) => {
    updateForm("excerpt", nextExcerpt)
    setAiDraft(null)
    setNotice("요약 제안을 반영했습니다.")
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") {
        return
      }

      event.preventDefault()

      if (event.shiftKey) {
        handleRedo()
        return
      }

      handleUndo()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleRedo, handleUndo])

  useEffect(() => {
    hydrationRef.current = true
    refreshDraftEntries()

    const loadedDraft = getStoredDraft(draftStorageKey)
    if (!loadedDraft) {
      setLastSavedAt(null)
      return
    }

    if (
      !isMeaningfulSnapshot(loadedDraft.snapshot) ||
      JSON.stringify(loadedDraft.snapshot) === JSON.stringify(initialSnapshot)
    ) {
      discardDraft(draftStorageKey)
      return
    }

    applySnapshot(loadedDraft.snapshot)
    undoStackRef.current = []
    redoStackRef.current = []
    setDraftState("saved")
    setLastSavedAt(loadedDraft.updatedAt)
    setNotice("로컬 임시저장을 불러왔습니다.")
  }, [applySnapshot, discardDraft, draftStorageKey, initialSnapshot, refreshDraftEntries])

  useEffect(() => {
    if (!hydrationRef.current) return

    const currentSnapshot = createSnapshot()
    const isPristine =
      JSON.stringify(currentSnapshot) === JSON.stringify(initialSnapshot)

    if (isPristine || !isMeaningfulSnapshot(currentSnapshot)) {
      if (localStorage.getItem(draftStorageKey)) {
        discardDraft(draftStorageKey)
      }
      setDraftState("saved")
      return
    }

    setDraftState("dirty")

    const timer = window.setTimeout(() => {
      setDraftState("saving")
      persistDraft(currentSnapshot)
      setDraftState("saved")
    }, 700)

    return () => window.clearTimeout(timer)
  }, [createSnapshot, discardDraft, draftStorageKey, initialSnapshot, persistDraft])

  const updateForm = <K extends keyof BlogPostInput>(
    key: K,
    value: BlogPostInput[K]
  ) => {
    updateEditor((snapshot) => ({
      ...snapshot,
      form: { ...snapshot.form, [key]: value },
    }))
  }

  const updateBenefit = (index: number, value: string) => {
    updateEditor((snapshot) => {
      const nextBenefits = [...snapshot.form.benefitItems]
      nextBenefits[index] = value
      return {
        ...snapshot,
        form: { ...snapshot.form, benefitItems: nextBenefits },
      }
    })
  }

  const updateCta = <K extends keyof BlogPostInput["cta"]>(
    key: K,
    value: BlogPostInput["cta"][K]
  ) => {
    updateEditor((snapshot) => ({
      ...snapshot,
      form: {
        ...snapshot.form,
        cta: {
          ...snapshot.form.cta,
          [key]: value,
        },
      },
    }))
  }

  const replaceSelection = (
    nextTextFactory: (selected: string) => {
      text: string
      selectionStart: number
      selectionEnd: number
    }
  ) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = form.contentMarkdown.slice(start, end)
    const { text, selectionStart, selectionEnd } = nextTextFactory(selected)
    const nextMarkdown =
      form.contentMarkdown.slice(0, start) +
      text +
      form.contentMarkdown.slice(end)

    updateEditor((snapshot) => ({
      ...snapshot,
      form: {
        ...snapshot.form,
        contentMarkdown: nextMarkdown,
      },
    }))

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.selectionStart = start + selectionStart
      textarea.selectionEnd = start + selectionEnd
    })
  }

  const wrapSelection = (prefix: string, suffix = prefix, fallback = "텍스트") => {
    replaceSelection((selected) => {
      const target = selected || fallback
      const text = `${prefix}${target}${suffix}`
      return {
        text,
        selectionStart: prefix.length,
        selectionEnd: prefix.length + target.length,
      }
    })
  }

  const insertBlock = (template: string, fallback = "") => {
    replaceSelection((selected) => {
      const target = selected || fallback
      const text = template.replace("__TEXT__", target)
      const selectionIndex = text.indexOf(target)
      return {
        text,
        selectionStart: selectionIndex >= 0 ? selectionIndex : text.length,
        selectionEnd:
          selectionIndex >= 0 ? selectionIndex + target.length : text.length,
      }
    })
  }

  const toggleRelatedPost = (postId: number) => {
    updateEditor((snapshot) => ({
      ...snapshot,
      form: {
        ...snapshot.form,
        relatedPostIds: snapshot.form.relatedPostIds.includes(postId)
          ? snapshot.form.relatedPostIds.filter((id) => id !== postId)
          : [...snapshot.form.relatedPostIds, postId],
      },
    }))
  }

  const buildPayload = (nextStatus?: BlogPostStatus): BlogPostInput => {
    const parsedTags = parseTags(tagsInput)
    const finalTitle = form.title.trim()
    const finalExcerpt = form.excerpt.trim()

    return {
      ...form,
      slug: slugify(form.slug.trim() || finalTitle),
      title: finalTitle,
      excerpt: finalExcerpt,
      tags: parsedTags,
      tag: parsedTags[0] || "",
      readTime: computedReadTime,
      imageUrl: form.imageUrl.trim() || form.heroImageUrl.trim(),
      heroImageUrl: form.heroImageUrl.trim() || form.imageUrl.trim(),
      thumbnailAlt: form.thumbnailAlt.trim() || `${finalTitle} 썸네일`,
      heroImageAlt: form.heroImageAlt.trim() || `${finalTitle} 배너 이미지`,
      benefitItems: form.benefitItems.map((item) => item.trim()).filter(Boolean).slice(0, 3),
      authorBio:
        form.authorBio.trim() ||
        `${form.author.trim() || "Classin 팀"}은 교육 운영과 전환 경험을 정리합니다.`,
      seoTitle: form.seoTitle.trim() || finalTitle,
      seoDescription: form.seoDescription.trim() || finalExcerpt,
      cta: {
        eyebrow: form.cta.eyebrow.trim() || DEFAULT_BLOG_CTA.eyebrow,
        title: form.cta.title.trim() || DEFAULT_BLOG_CTA.title,
        description: form.cta.description.trim() || DEFAULT_BLOG_CTA.description,
        buttonLabel: form.cta.buttonLabel.trim() || DEFAULT_BLOG_CTA.buttonLabel,
        buttonHref: form.cta.buttonHref.trim() || DEFAULT_BLOG_CTA.buttonHref,
      },
      status: nextStatus ?? form.status,
    }
  }

  const handleSubmit = async (nextStatus?: BlogPostStatus) => {
    const payload = buildPayload(nextStatus)

    if (!payload.title || !payload.excerpt || !payload.category) {
      setNotice("제목, 요약, 카테고리는 꼭 입력해주세요.")
      return
    }

    setIsSubmitting(true)
    setNotice("")

    try {
      const url = initialPost
        ? `/api/admin/blog/${initialPost.id}`
        : "/api/admin/blog"
      const method = initialPost ? "PUT" : "POST"
      const response = await adminFetch(url, {
        method,
        body: JSON.stringify(payload),
      })

      if (response.status === 401) {
        startTransition(() => router.replace("/admin/login"))
        return
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        setNotice(data?.error || "저장 중 문제가 발생했습니다.")
        return
      }

      const data = (await response.json()) as { post: BlogPost }
      discardDraft(draftStorageKey)
      setDraftState("saved")
      setNotice(nextStatus === "published" ? "발행까지 완료했습니다." : "저장했습니다.")
      startTransition(() => {
        router.push(`/admin/blog/${data.post.id}/edit`)
        router.refresh()
      })
    } catch {
      setNotice("저장 중 문제가 발생했습니다.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="sticky top-0 z-20 border-b border-[#e8e8e4] bg-[#FAFAF8]/90 backdrop-blur">
        <div className="flex flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/blog">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                목록으로
              </Link>
            </Button>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#1a1a1a]/30">
                Blog Editor
              </p>
              <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#111110]">
                {mode === "create" ? "새 글 작성" : "글 수정"}
              </h1>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <span className="rounded-full border border-[#e8e8e4] bg-white px-3 py-1 text-[12px] text-[#1a1a1a]/45">
              임시저장: {draftState === "dirty" ? "수정됨" : draftState === "saving" ? "저장 중" : "저장됨"}
            </span>
            <span className="rounded-full border border-[#e8e8e4] bg-white px-3 py-1 text-[12px] text-[#1a1a1a]/45">
              예상 읽기 시간 {computedReadTime}
              {lastSavedAt ? ` · ${formatRelativeTime(lastSavedAt)}` : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUndo}
              disabled={isSubmitting || undoStackRef.current.length === 0}
              title="되돌리기 (Ctrl/Cmd + Z)"
            >
              <Undo2 className="mr-1.5 h-4 w-4" />
              되돌리기
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRedo}
              disabled={isSubmitting || redoStackRef.current.length === 0}
              title="다시 실행 (Ctrl/Cmd + Shift + Z)"
            >
              <Redo2 className="mr-1.5 h-4 w-4" />
              다시 실행
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSubmit()}
              disabled={isSubmitting}
            >
              <Save className="mr-1.5 h-4 w-4" />
              저장
            </Button>
            <Button
              size="sm"
              onClick={() => handleSubmit("published")}
              disabled={isSubmitting}
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              발행
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8 lg:py-8">
        <section className="min-w-0 space-y-6">
          <div className="rounded-[28px] border border-[#e8e8e4] bg-white p-6 shadow-sm">
            <div className="grid gap-5">
              <div className="grid gap-2">
                <Label htmlFor="title">제목</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(event) => {
                    const nextTitle = event.target.value
                    updateEditor((snapshot) => ({
                      ...snapshot,
                      form: {
                        ...snapshot.form,
                        title: nextTitle,
                        seoTitle: snapshot.form.seoTitle || nextTitle,
                        slug: snapshot.slugEdited
                          ? snapshot.form.slug
                          : slugify(nextTitle),
                      },
                    }))
                  }}
                  placeholder="독자가 클릭하고 싶어지는 제목을 적어주세요"
                />
              </div>

              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_260px]">
                <div className="grid gap-2">
                  <Label htmlFor="excerpt">한 줄 요약</Label>
                  <textarea
                    id="excerpt"
                    rows={3}
                    value={form.excerpt}
                    onChange={(event) => updateForm("excerpt", event.target.value)}
                    placeholder="글을 읽기 전에 핵심 메시지를 한 번에 파악할 수 있도록 적어주세요"
                    className="min-h-[96px] rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#084734]"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="slug">슬러그</Label>
                  <Input
                    id="slug"
                    value={form.slug}
                    onChange={(event) => {
                      updateEditor((snapshot) => ({
                        ...snapshot,
                        slugEdited: true,
                        form: {
                          ...snapshot.form,
                          slug: slugify(event.target.value),
                        },
                      }))
                    }}
                    placeholder="blog-v1"
                  />
                  <p className="text-[12px] text-[#1a1a1a]/35">
                    공개 URL: /blog/{form.slug || "your-slug"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-[#e8e8e4] bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-[#e8e8e4] pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#111110]">Blog AI</p>
                <p className="mt-1 text-[13px] leading-5 text-[#1a1a1a]/40">
                  로컬 제안으로 먼저 시작하고, 적용은 한 번 더 확인한 뒤 반영합니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-3 py-1 text-[11px] text-[#1a1a1a]/55">
                  AI 서버 연결 전
                </span>
                <span className="rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-3 py-1 text-[11px] text-[#1a1a1a]/55">
                  선택 후 적용
                </span>
              </div>
            </div>

            <div className="grid gap-5 pt-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="outline" className="justify-start gap-2 border-[#d5e7dd] bg-[#f4fbf7]" onClick={openRefineDraft}>
                    <Sparkles className="h-4 w-4 text-[#084734]" />
                    다듬기
                  </Button>
                  <Button variant="outline" className="justify-start gap-2 border-[#dbe5f7] bg-[#f5f8ff]" onClick={() => openTemplateDraft()}>
                    <FileText className="h-4 w-4 text-[#1f4ea3]" />
                    템플릿으로 시작
                  </Button>
                  <Button variant="outline" className="justify-start gap-2 border-[#ece0d2] bg-[#fff8f0]" onClick={openTitleDraft}>
                    <Type className="h-4 w-4 text-[#9c5a11]" />
                    제목 보조
                  </Button>
                  <Button variant="outline" className="justify-start gap-2 border-[#e0e0ea] bg-[#faf9ff]" onClick={openExcerptDraft}>
                    <Minus className="h-4 w-4 text-[#5a45a8]" />
                    요약 보조
                  </Button>
                  <Button variant="outline" className="justify-start gap-2 border-[#dce9e6] bg-[#f5fbfa]" onClick={openCtaDraft}>
                    <CheckCircle2 className="h-4 w-4 text-[#11635b]" />
                    CTA 점검
                  </Button>
                  <Button variant="outline" className="justify-start gap-2 border-[#e6e8d9] bg-[#fbfcf2]" onClick={openSeoDraft}>
                    <Highlighter className="h-4 w-4 text-[#6b7a24]" />
                    SEO 점검
                  </Button>
                </div>

                <div className="rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[13px] font-semibold text-[#111110]">템플릿 선택</p>
                      <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/40">
                        빈 초안을 빠르게 채우고 싶다면, 구조부터 먼저 잡아주세요.
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] text-[#1a1a1a]/45">
                      현재 {BLOG_AI_TEMPLATE_META[aiTemplateKey].label}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {(Object.entries(BLOG_AI_TEMPLATE_META) as Array<[BlogAiTemplateKey, (typeof BLOG_AI_TEMPLATE_META)[BlogAiTemplateKey]]>).map(
                      ([key, meta]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => openTemplateDraft(key)}
                          className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                            aiTemplateKey === key
                              ? "border-[#111110] bg-white shadow-sm"
                              : "border-[#e8e8e4] bg-white/80 hover:border-[#c8c8c4]"
                          }`}
                        >
                          <p className="text-[13px] font-medium text-[#111110]">{meta.label}</p>
                          <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/40">{meta.description}</p>
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4">
                  <p className="text-[13px] font-semibold text-[#111110]">사용 팁</p>
                  <div className="mt-2 space-y-2 text-[12px] leading-5 text-[#1a1a1a]/45">
                    <p>제목과 요약은 제안 버튼을 누른 뒤 바로 교체할 수 있습니다.</p>
                    <p>다듬기는 본문에서 선택한 영역만 안전하게 손봅니다.</p>
                    <p>CTA와 SEO는 발행 직전 마지막 점검용으로 쓰면 좋습니다.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-semibold text-[#111110]">초안 점검</p>
                      <p className="mt-1 text-[12px] text-[#1a1a1a]/40">현재 글의 채움 상태를 한눈에 봅니다.</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] ${aiReadiness >= 80 ? "bg-green-50 text-green-700" : aiReadiness >= 60 ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                      {aiReadiness}%
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {aiReadinessChecks.map((check) => (
                      <div key={check.label} className="flex items-start gap-3 rounded-xl border border-[#e8e8e4] bg-white px-3 py-2.5">
                        <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${check.ok ? "bg-green-50 text-green-600" : "bg-[#f0f0ec] text-[#1a1a1a]/35"}`}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-[#111110]">{check.label}</p>
                          <p className="mt-0.5 text-[11px] leading-4 text-[#1a1a1a]/40">{check.hint}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4">
                  <p className="text-[13px] font-semibold text-[#111110]">지금 AI가 볼 포인트</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#1a1a1a]/45 sm:grid-cols-3">
                    <span className="rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1">선택 영역 {form.contentMarkdown.trim() ? "가능" : "비어 있음"}</span>
                    <span className="rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1">CTA {form.cta.title.trim() ? "완료" : "점검 필요"}</span>
                    <span className="rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1">SEO {form.seoTitle.trim() ? "채움" : "미입력"}</span>
                    <span className="rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1">템플릿 {BLOG_AI_TEMPLATE_META[aiTemplateKey].label}</span>
                    <span className="rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1">자동저장 {draftState === "saved" ? "안정" : "진행중"}</span>
                    <span className="rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1">후속 적용 가능</span>
                  </div>
                </div>
              </div>
            </div>

            {aiDraft && (
              <div className="mt-6 border-t border-[#e8e8e4] pt-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#111110]">{aiDraft.title}</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#1a1a1a]/40">{aiDraft.subtitle}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${BLOG_AI_TOOL_META[aiDraft.tool].tone}`}>
                      {BLOG_AI_TOOL_META[aiDraft.tool].label}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setAiDraft(null)}>
                      닫기
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-[12px] leading-5 text-[#1a1a1a]/45">{aiDraft.note}</p>

                {aiDraft.tool === "refine" && (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                      <p className="text-[12px] font-medium text-[#111110]">Before</p>
                      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-[12px] leading-6 text-[#1a1a1a]/70">
                        {aiDraft.before}
                      </pre>
                    </div>
                    <div className="rounded-2xl border border-[#e8e8e4] bg-[#f4fbf7] p-4">
                      <p className="text-[12px] font-medium text-[#084734]">After</p>
                      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-[12px] leading-6 text-[#084734]">
                        {aiDraft.after}
                      </pre>
                    </div>
                    <div className="lg:col-span-2 flex flex-wrap gap-2">
                      <Button onClick={applyAiDraft}>
                        {aiDraft.applyLabel}
                      </Button>
                      <Button variant="outline" onClick={() => setAiDraft(null)}>
                        나중에 적용
                      </Button>
                    </div>
                  </div>
                )}

                {aiDraft.tool === "template" && (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {(Object.entries(BLOG_AI_TEMPLATE_META) as Array<[BlogAiTemplateKey, (typeof BLOG_AI_TEMPLATE_META)[BlogAiTemplateKey]]>).map(
                        ([key, meta]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => openTemplateDraft(key)}
                            className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                              aiTemplateKey === key
                                ? "border-[#111110] bg-white shadow-sm"
                                : "border-[#e8e8e4] bg-white/80 hover:border-[#c8c8c4]"
                            }`}
                          >
                            <p className="text-[13px] font-medium text-[#111110]">{meta.label}</p>
                            <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/40">{meta.summary}</p>
                          </button>
                        )
                      )}
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                        <p className="text-[12px] font-medium text-[#111110]">현재 본문</p>
                        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-[12px] leading-6 text-[#1a1a1a]/70">
                          {aiDraft.before}
                        </pre>
                      </div>
                      <div className="rounded-2xl border border-[#dbe5f7] bg-[#f5f8ff] p-4">
                        <p className="text-[12px] font-medium text-[#1f4ea3]">삽입될 템플릿</p>
                        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-[12px] leading-6 text-[#1f4ea3]">
                          {aiDraft.after}
                        </pre>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={applyAiDraft}>{aiDraft.applyLabel}</Button>
                      <Button variant="outline" onClick={() => setAiDraft(null)}>
                        닫기
                      </Button>
                    </div>
                  </div>
                )}

                {aiDraft.tool === "title" && (
                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    {aiDraft.suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => applyTitleSuggestion(suggestion)}
                        className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-4 text-left transition-colors hover:border-[#c8c8c4] hover:bg-white"
                      >
                        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/30">추천 제목</p>
                        <p className="mt-2 text-[13px] font-medium leading-6 text-[#111110]">{suggestion}</p>
                        <p className="mt-3 text-[12px] text-[#084734]">눌러서 바로 제목에 반영</p>
                      </button>
                    ))}
                  </div>
                )}

                {aiDraft.tool === "excerpt" && (
                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    {aiDraft.suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => applyExcerptSuggestion(suggestion)}
                        className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-4 text-left transition-colors hover:border-[#c8c8c4] hover:bg-white"
                      >
                        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/30">추천 요약</p>
                        <p className="mt-2 text-[13px] leading-6 text-[#111110]">{suggestion}</p>
                        <p className="mt-3 text-[12px] text-[#5a45a8]">눌러서 바로 요약에 반영</p>
                      </button>
                    ))}
                  </div>
                )}

                {aiDraft.tool === "cta" && (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                      <p className="text-[12px] font-medium text-[#111110]">Before</p>
                      <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-3 text-[12px] leading-6 text-[#1a1a1a]/70">
                        {aiDraft.before}
                      </pre>
                    </div>
                    <div className="rounded-2xl border border-[#dce9e6] bg-[#f5fbfa] p-4">
                      <p className="text-[12px] font-medium text-[#11635b]">After</p>
                      <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-3 text-[12px] leading-6 text-[#11635b]">
                        {aiDraft.after}
                      </pre>
                    </div>
                    <div className="lg:col-span-2 rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4">
                      <p className="text-[12px] font-medium text-[#111110]">체크리스트</p>
                      <div className="mt-3 space-y-2">
                        {aiDraft.checklist.map((item) => (
                          <div key={item} className="flex items-start gap-2 rounded-xl border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] text-[#1a1a1a]/55">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#11635b]" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="lg:col-span-2 flex flex-wrap gap-2">
                      <Button onClick={applyAiDraft}>{aiDraft.applyLabel}</Button>
                      <Button variant="outline" onClick={() => setAiDraft(null)}>
                        닫기
                      </Button>
                    </div>
                  </div>
                )}

                {aiDraft.tool === "seo" && (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                      <p className="text-[12px] font-medium text-[#111110]">Before</p>
                      <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-3 text-[12px] leading-6 text-[#1a1a1a]/70">
                        {aiDraft.before}
                      </pre>
                    </div>
                    <div className="rounded-2xl border border-[#e6e8d9] bg-[#fbfcf2] p-4">
                      <p className="text-[12px] font-medium text-[#6b7a24]">After</p>
                      <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-3 text-[12px] leading-6 text-[#6b7a24]">
                        {aiDraft.after}
                      </pre>
                    </div>
                    <div className="lg:col-span-2 rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4">
                      <p className="text-[12px] font-medium text-[#111110]">점검 결과</p>
                      <div className="mt-3 space-y-2">
                        {aiDraft.checklist.map((item) => (
                          <div key={item.label} className="flex items-start gap-2 rounded-xl border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] text-[#1a1a1a]/55">
                            <CheckCircle2 className={`mt-0.5 h-4 w-4 ${item.ok ? "text-[#6b7a24]" : "text-[#1a1a1a]/25"}`} />
                            <span>{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="lg:col-span-2 flex flex-wrap gap-2">
                      <Button onClick={applyAiDraft}>{aiDraft.applyLabel}</Button>
                      <Button variant="outline" onClick={() => setAiDraft(null)}>
                        닫기
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-[#e8e8e4] bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#111110]">이 글을 읽으면 좋은 점</p>
                <p className="text-[13px] text-[#1a1a1a]/40">
                  상세 페이지 상단에 노출되는 3개의 포인트입니다.
                </p>
              </div>
              <span className="rounded-full bg-[#f5f6f1] px-3 py-1 text-[12px] text-[#084734]">
                추천 3개
              </span>
            </div>

            <div className="grid gap-3">
              {form.benefitItems.map((benefit, index) => (
                <Input
                  key={index}
                  value={benefit}
                  onChange={(event) => updateBenefit(index, event.target.value)}
                  placeholder={`좋은 점 ${index + 1}`}
                />
              ))}
              <Input
                value={form.targetReader || ""}
                onChange={(event) => updateForm("targetReader", event.target.value)}
                placeholder="예: 상담 전환율을 끌어올리고 싶은 학원 원장"
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-[#e8e8e4] bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#111110]">본문 작성</p>
                <p className="text-[13px] text-[#1a1a1a]/40">
                  Markdown 기반으로 작성하고, 같은 규칙으로 상세 페이지에 렌더링됩니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ToolbarButton onClick={() => insertBlock("## __TEXT__\n", "소제목")}>
                  H2
                </ToolbarButton>
                <ToolbarButton onClick={() => insertBlock("### __TEXT__\n", "세부 제목")}>
                  H3
                </ToolbarButton>
                <ToolbarButton onClick={() => wrapSelection("**", "**", "강조 텍스트")} icon={<Type className="h-3.5 w-3.5" />}>
                  굵게
                </ToolbarButton>
                <ToolbarButton onClick={() => wrapSelection("*", "*", "기울임 텍스트")} icon={<Italic className="h-3.5 w-3.5" />}>
                  기울이기
                </ToolbarButton>
                <ToolbarButton onClick={() => insertBlock("> __TEXT__", "인용할 문장")} icon={<Quote className="h-3.5 w-3.5" />}>
                  인용
                </ToolbarButton>
                <ToolbarButton onClick={() => insertBlock("- __TEXT__", "포인트")} icon={<List className="h-3.5 w-3.5" />}>
                  리스트
                </ToolbarButton>
                <ToolbarButton onClick={() => insertBlock("1. __TEXT__", "순서 설명")} icon={<ListOrdered className="h-3.5 w-3.5" />}>
                  번호
                </ToolbarButton>
                <ToolbarButton onClick={() => wrapSelection("==", "==", "하이라이트")} icon={<Highlighter className="h-3.5 w-3.5" />}>
                  강조색
                </ToolbarButton>
                <ToolbarButton onClick={() => wrapSelection("{{green:", "}}", "브랜드 컬러 텍스트")} icon={<Sparkles className="h-3.5 w-3.5" />}>
                  브랜드색
                </ToolbarButton>
                <ToolbarButton onClick={() => insertBlock("[__TEXT__](https://example.com)", "링크 텍스트")} icon={<Link2 className="h-3.5 w-3.5" />}>
                  링크
                </ToolbarButton>
                <ToolbarButton onClick={() => insertBlock("![이미지 설명](https://example.com/image.jpg)\n", "")} icon={<ImageIcon className="h-3.5 w-3.5" />}>
                  이미지
                </ToolbarButton>
                <ToolbarButton onClick={() => insertBlock("---\n", "")} icon={<Minus className="h-3.5 w-3.5" />}>
                  구분선
                </ToolbarButton>
              </div>
            </div>

            <Tabs defaultValue="write">
              <TabsList className="mb-4 bg-[#f5f5f2]">
                <TabsTrigger value="write">작성</TabsTrigger>
                <TabsTrigger value="preview">
                  <Eye className="mr-1.5 h-4 w-4" />
                  미리보기
                </TabsTrigger>
              </TabsList>

              <TabsContent value="write" className="mt-0">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <textarea
                    ref={textareaRef}
                    value={form.contentMarkdown}
                    onChange={(event) => updateForm("contentMarkdown", event.target.value)}
                    className="min-h-[620px] rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] px-5 py-4 font-mono text-[14px] leading-7 text-[#111110] outline-none transition-colors focus:border-[#084734]"
                    placeholder="본문을 작성해주세요"
                  />

                  <div className="space-y-4 rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4">
                    <div>
                      <p className="text-sm font-semibold text-[#111110]">자동 목차</p>
                      <p className="mt-1 text-[12px] text-[#1a1a1a]/40">
                        H2, H3 헤딩이 상세 페이지 목차로 노출됩니다.
                      </p>
                    </div>

                    <div className="space-y-2">
                      {headings.length === 0 ? (
                        <p className="text-[13px] text-[#1a1a1a]/35">
                          `## 소제목` 또는 `### 세부 제목`을 넣으면 목차가 생성됩니다.
                        </p>
                      ) : (
                        headings.map((heading) => (
                          <div
                            key={heading.id}
                            className={`text-[13px] text-[#1a1a1a]/65 ${heading.level === 3 ? "pl-4" : ""}`}
                          >
                            {heading.text}
                          </div>
                        ))
                      )}
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                      <p className="text-sm font-semibold text-[#084734]">빠른 문법 팁</p>
                      <div className="mt-3 space-y-2 text-[12px] leading-5 text-[#084734]/80">
                        <p>{"`**굵게**`, `*기울이기*`, `==강조==`"}</p>
                        <p>{"`{{green:브랜드색}}`, `[링크](url)`"}</p>
                        <p>{"`![설명](이미지URL)`, `> 인용문`"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="mt-0">
                <div className="rounded-[28px] border border-[#e8e8e4] bg-[#fcfcfb] p-8">
                  <BlogMarkdownRenderer markdown={form.contentMarkdown} />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-[28px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#111110]">임시저장</p>
                <p className="mt-1 text-[13px] leading-5 text-[#1a1a1a]/40">
                  최근 초안을 다시 열고, 필요 없는 초안은 바로 정리할 수 있습니다.
                </p>
              </div>
              <span className="rounded-full bg-[#f5f5f2] px-3 py-1 text-[12px] text-[#084734]">
                {draftEntries.length}개
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {currentDraftEntry ? (
                <div className="rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#111110]">
                        {currentDraftEntry.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#1a1a1a]/42">
                        {currentDraftEntry.excerpt}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#eaf4ef] px-2.5 py-1 text-[11px] text-[#084734]">
                      현재 글
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[#1a1a1a]/40">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatRelativeTime(currentDraftEntry.updatedAt)}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1">
                      {currentDraftEntry.category}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const storedDraft = getStoredDraft(draftStorageKey)
                        if (!storedDraft) return
                        applySnapshot(storedDraft.snapshot)
                        undoStackRef.current = []
                        redoStackRef.current = []
                        setDraftState("saved")
                        setLastSavedAt(storedDraft.updatedAt)
                        setNotice("임시저장을 다시 불러왔습니다.")
                      }}
                    >
                      다시 불러오기
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const baseline = cloneSnapshot(initialSnapshot)
                        applySnapshot(baseline)
                        undoStackRef.current = []
                        redoStackRef.current = []
                        setDraftState("saved")
                        setLastSavedAt(null)
                        discardDraft(draftStorageKey)
                        setNotice("초안을 초기 상태로 되돌렸습니다.")
                      }}
                    >
                      초안 비우기
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#dfe2db] bg-[#fcfcfb] p-4">
                  <p className="text-sm font-medium text-[#111110]">현재 임시저장 없음</p>
                  <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/40">
                    조금만 작성하면 자동으로 이어쓸 수 있는 초안이 만들어집니다.
                  </p>
                </div>
              )}

              {otherDraftEntries.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#1a1a1a]/30">
                    최근 다른 초안
                  </p>
                  {otherDraftEntries.map((entry) => (
                    <div
                      key={entry.key}
                      className="rounded-2xl border border-[#f0f0ec] bg-[#fcfcfb] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#111110]">
                            {entry.title}
                          </p>
                          <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#1a1a1a]/40">
                            {entry.excerpt}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] text-[#1a1a1a]/45">
                          {entry.mode === "create" ? "새 글" : "수정"}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="text-[12px] text-[#1a1a1a]/35">
                          {entry.category} · {formatDraftStamp(entry.updatedAt)}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button type="button" size="sm" variant="outline" asChild>
                            <Link href={entry.href}>이어쓰기</Link>
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => discardDraft(entry.key)}
                            aria-label="초안 삭제"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#111110]">발행 설정</p>
            <div className="mt-4 grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="status">상태</Label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(event) => updateForm("status", event.target.value as BlogPostStatus)}
                  className="h-10 rounded-xl border border-[#e8e8e4] bg-white px-3 text-sm outline-none focus:border-[#084734]"
                >
                  {BLOG_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="category">카테고리</Label>
                <select
                  id="category"
                  value={form.category}
                  onChange={(event) => updateForm("category", event.target.value)}
                  className="h-10 rounded-xl border border-[#e8e8e4] bg-white px-3 text-sm outline-none focus:border-[#084734]"
                >
                  {CATEGORIES.filter((category) => category !== "전체").map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tags">태그</Label>
                <Input
                  id="tags"
                  value={tagsInput}
                  onChange={(event) => {
                    const parsed = parseTags(event.target.value)
                    updateEditor((snapshot) => ({
                      ...snapshot,
                      tagsInput: event.target.value,
                      form: {
                        ...snapshot.form,
                        tags: parsed,
                        tag: parsed[0] || "",
                      },
                    }))
                  }}
                  placeholder="Deep Dive, Guide, New Feature"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-[#1a1a1a]/65">
                <input
                  type="checkbox"
                  checked={form.featured ?? false}
                  onChange={(event) => updateForm("featured", event.target.checked)}
                  className="h-4 w-4 rounded border-[#d8d8d2]"
                />
                목록 상단 Featured로 노출
              </label>
            </div>
          </div>

          <div className="rounded-[28px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#111110]">비주얼</p>
            <div className="mt-4 space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="imageUrl">썸네일 이미지 URL</Label>
                <Input
                  id="imageUrl"
                  value={form.imageUrl}
                  onChange={(event) => updateForm("imageUrl", event.target.value)}
                  placeholder="/images/blog/thumb-01.png"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="thumbnailAlt">썸네일 대체 텍스트</Label>
                <Input
                  id="thumbnailAlt"
                  value={form.thumbnailAlt}
                  onChange={(event) => updateForm("thumbnailAlt", event.target.value)}
                  placeholder="대표 썸네일 설명"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="heroImageUrl">상단 배너 이미지 URL</Label>
                <Input
                  id="heroImageUrl"
                  value={form.heroImageUrl}
                  onChange={(event) => updateForm("heroImageUrl", event.target.value)}
                  placeholder="/images/blog/thumb-hero.png"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="heroImageAlt">배너 대체 텍스트</Label>
                <Input
                  id="heroImageAlt"
                  value={form.heroImageAlt}
                  onChange={(event) => updateForm("heroImageAlt", event.target.value)}
                  placeholder="상단 배너 설명"
                />
              </div>
              {(form.heroImageUrl || form.imageUrl) && (
                <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-[#f5f5f2]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.heroImageUrl || form.imageUrl}
                    alt={form.heroImageAlt || form.thumbnailAlt || "배너 미리보기"}
                    className="aspect-[16/9] w-full object-cover"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#111110]">작성자</p>
            <div className="mt-4 space-y-3">
              <Input
                value={form.author}
                onChange={(event) => updateForm("author", event.target.value)}
                placeholder="작성자 이름"
              />
              <Input
                value={form.authorRole}
                onChange={(event) => updateForm("authorRole", event.target.value)}
                placeholder="작성자 역할"
              />
              <Input
                value={form.authorAvatarUrl || ""}
                onChange={(event) => updateForm("authorAvatarUrl", event.target.value)}
                placeholder="아바타 이미지 URL"
              />
              <textarea
                rows={4}
                value={form.authorBio}
                onChange={(event) => updateForm("authorBio", event.target.value)}
                placeholder="작성자 소개"
                className="min-h-[100px] rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#084734]"
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#111110]">추천 글</p>
            <div className="mt-4 space-y-2">
              {filteredPosts.length === 0 ? (
                <p className="text-[13px] text-[#1a1a1a]/35">추천할 다른 글이 아직 없습니다.</p>
              ) : (
                filteredPosts.slice(0, 8).map((post) => (
                  <label
                    key={post.id}
                    className="flex items-start gap-3 rounded-2xl border border-[#f0f0ec] px-3 py-3 text-sm text-[#1a1a1a]/65"
                  >
                    <input
                      type="checkbox"
                      checked={form.relatedPostIds.includes(post.id)}
                      onChange={() => toggleRelatedPost(post.id)}
                      className="mt-0.5 h-4 w-4 rounded border-[#d8d8d2]"
                    />
                    <span className="line-clamp-2">{post.title}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#111110]">SEO</p>
            <div className="mt-4 space-y-3">
              <Input
                value={form.seoTitle}
                onChange={(event) => updateForm("seoTitle", event.target.value)}
                placeholder="SEO 제목"
              />
              <textarea
                rows={4}
                value={form.seoDescription}
                onChange={(event) => updateForm("seoDescription", event.target.value)}
                placeholder="검색 결과에 보일 설명"
                className="min-h-[100px] rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#084734]"
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#111110]">하단 CTA</p>
            <div className="mt-4 space-y-3">
              <Input
                value={form.cta.eyebrow}
                onChange={(event) => updateCta("eyebrow", event.target.value)}
                placeholder="CTA 상단 문구"
              />
              <Input
                value={form.cta.title}
                onChange={(event) => updateCta("title", event.target.value)}
                placeholder="CTA 제목"
              />
              <textarea
                rows={4}
                value={form.cta.description}
                onChange={(event) => updateCta("description", event.target.value)}
                placeholder="CTA 설명"
                className="min-h-[100px] rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#084734]"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  value={form.cta.buttonLabel}
                  onChange={(event) => updateCta("buttonLabel", event.target.value)}
                  placeholder="버튼 문구"
                />
                <Input
                  value={form.cta.buttonHref}
                  onChange={(event) => updateCta("buttonHref", event.target.value)}
                  placeholder="/contact"
                />
              </div>
            </div>
          </div>

          {notice && (
            <div className="rounded-[24px] border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-[#084734]">
              {notice}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
