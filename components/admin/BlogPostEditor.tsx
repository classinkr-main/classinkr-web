"use client"

import Image from "next/image"
import dynamic from "next/dynamic"
import Link from "next/link"
import {
  startTransition,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Eye,
  Highlighter,
  Image as ImageIcon,
  Italic,
  LayoutTemplate,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Redo2,
  Save,
  SlidersHorizontal,
  Sparkles,
  Type,
  Undo2,
  Upload,
  Video,
  Wand2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import { SafeBlogImage } from "@/components/blog/SafeBlogImage"
import { type RichMarkdownEditorHandle } from "@/components/admin/RichMarkdownEditor"
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
import { leadMagnetOptions } from "@/lib/lead-magnets"
import { getLeadMagnetGateLabel, getLeadMagnetStatusLabel } from "@/lib/lead-magnets-helpers"
import { sanitizePublicImageUrl } from "@/lib/safe-public-url"
import { adminFetch, getAdminToken } from "@/lib/admin-client"

interface BlogPostEditorProps {
  mode: "create" | "edit"
  initialPost?: BlogPost
  allPosts: BlogPost[]
}

type DraftState = "saved" | "saving" | "dirty"
type AiAction = "card-news" | "reels" | "optimize" | "draft"

const TEMPLATE_STORAGE_KEY = "admin-blog-templates"

type BlogTemplate = {
  id: string
  name: string
  savedAt: string
  data: {
    contentMarkdown: string
    benefitItems: string[]
    targetReader: string
    category: string
    cta: BlogPostInput["cta"]
  }
}

const DEFAULT_TEMPLATES: BlogTemplate[] = [
  {
    id: "default-insight",
    name: "인사이트 기본형",
    savedAt: "2024-01-01T00:00:00.000Z",
    data: {
      category: "인사이트",
      targetReader: "운영 효율을 높이고 싶은 학원 원장·관리자",
      benefitItems: [
        "현장에서 바로 적용할 수 있는 핵심 포인트를 파악할 수 있습니다.",
        "문제의 근본 원인을 빠르게 진단하는 방법을 배울 수 있습니다.",
        "다음 액션을 구체적으로 잡아 실행력을 높일 수 있습니다.",
      ],
      cta: { ...DEFAULT_BLOG_CTA },
      contentMarkdown: [
        "## 지금 이 문제, 혼자만 겪는 게 아닙니다",
        "",
        "많은 학원 운영자들이 비슷한 고민을 안고 있습니다. 여기서는 그 문제를 구체적으로 짚고, 현장에서 바로 쓸 수 있는 해법을 정리합니다.",
        "",
        "## 핵심 인사이트",
        "",
        "### 첫 번째 포인트",
        "",
        "핵심 내용을 2–3문장으로 정리해보세요. 데이터나 사례가 있으면 설득력이 올라갑니다.",
        "",
        "### 두 번째 포인트",
        "",
        "실행 가능한 구체적인 방법을 설명해보세요. 단계나 리스트 형태가 읽기 좋습니다.",
        "",
        "- 실행 단계 1",
        "- 실행 단계 2",
        "- 실행 단계 3",
        "",
        "### 세 번째 포인트",
        "",
        "주의해야 할 점이나 흔히 저지르는 실수를 짚어주면 신뢰감이 생깁니다.",
        "",
        "> 핵심은 복잡한 기능을 늘리는 것이 아니라, 운영자가 바로 움직일 수 있는 흐름을 만드는 것입니다.",
        "",
        "## 오늘 바로 해볼 수 있는 것",
        "",
        "글을 읽고 나서 독자가 취할 수 있는 첫 번째 행동을 명확하게 제시해주세요. 작고 구체적일수록 실행률이 높아집니다.",
      ].join("\n"),
    },
  },
  {
    id: "default-case-study",
    name: "사례 연구",
    savedAt: "2024-01-01T00:00:00.000Z",
    data: {
      category: "성공 사례",
      targetReader: "비슷한 문제를 겪고 있는 학원 운영자",
      benefitItems: [
        "실제 현장 사례를 통해 문제 해결 과정을 구체적으로 파악할 수 있습니다.",
        "우리 학원에 적용 가능한 포인트를 빠르게 찾을 수 있습니다.",
        "시행착오 없이 검증된 방법으로 바로 실행할 수 있습니다.",
      ],
      cta: { ...DEFAULT_BLOG_CTA },
      contentMarkdown: [
        "## 배경",
        "",
        "어떤 학원인지, 어떤 상황이었는지 간략하게 소개해주세요. 독자가 공감할 수 있는 맥락을 잡아주는 게 중요합니다.",
        "",
        "- 학원 규모 / 운영 형태",
        "- 이전에 쓰던 방식",
        "- 변화가 필요했던 시점",
        "",
        "## 어떤 문제가 있었나",
        "",
        "구체적인 수치나 사례로 문제를 보여주세요. 숫자가 있으면 설득력이 올라갑니다.",
        "",
        "## 어떻게 접근했나",
        "",
        "문제를 해결하기 위해 어떤 방법을 선택했는지, 왜 그 방법을 골랐는지 설명해주세요.",
        "",
        "### 1단계",
        "",
        "첫 번째로 한 일을 구체적으로 설명해주세요.",
        "",
        "### 2단계",
        "",
        "두 번째로 한 일을 구체적으로 설명해주세요.",
        "",
        "## 결과",
        "",
        "수치, 변화, 현장 반응을 구체적으로 정리해주세요.",
        "",
        "| 항목 | 이전 | 이후 |",
        "|------|------|------|",
        "| 예시 지표 | - | - |",
        "",
        "## 이 사례에서 얻을 수 있는 것",
        "",
        "독자가 자신의 상황에 적용할 수 있도록 핵심 교훈을 2–3가지로 정리해주세요.",
      ].join("\n"),
    },
  },
  {
    id: "default-feature",
    name: "기능·제품 소개",
    savedAt: "2024-01-01T00:00:00.000Z",
    data: {
      category: "제품 업데이트",
      targetReader: "새로운 기능을 도입하려는 학원 담당자",
      benefitItems: [
        "기능의 핵심 가치와 어떤 문제를 해결하는지 명확하게 파악할 수 있습니다.",
        "실제 사용 시나리오를 통해 우리 학원에 맞는지 빠르게 판단할 수 있습니다.",
        "도입 전 준비사항과 시작 방법을 한눈에 파악할 수 있습니다.",
      ],
      cta: { ...DEFAULT_BLOG_CTA },
      contentMarkdown: [
        "## 왜 이 기능이 필요한가",
        "",
        "이 기능이 해결하는 문제를 독자가 공감할 수 있는 언어로 설명해주세요. 기능 설명보다 '이런 상황에서 도움이 됩니다'가 먼저입니다.",
        "",
        "## 주요 기능",
        "",
        "### 기능 1",
        "",
        "기능을 설명할 때는 '무엇을 할 수 있다'보다 '덕분에 어떤 게 달라진다'는 관점으로 써주세요.",
        "",
        "### 기능 2",
        "",
        "스크린샷이나 예시가 있으면 업로드한 뒤 여기에 삽입해주세요.",
        "",
        "### 기능 3",
        "",
        "세 번째 핵심 기능을 설명해주세요.",
        "",
        "## 실제 사용 시나리오",
        "",
        "구체적인 상황을 예로 들어 기능이 어떻게 작동하는지 보여주세요.",
        "",
        "> 예: 상담 당일 학생 정보를 미리 확인하고, 수업 후 피드백까지 자동으로 발송할 수 있습니다.",
        "",
        "## 시작하는 방법",
        "",
        "1. 첫 번째 단계",
        "2. 두 번째 단계",
        "3. 세 번째 단계",
        "",
        "처음 시작할 때 주의할 점이나 팁이 있으면 여기에 추가해주세요.",
      ].join("\n"),
    },
  },
]
type AiState = { action: AiAction; status: "loading" | "streaming" | "done" | "error"; result: string; topic?: string; tone?: string; length?: string; reference?: string; autoApplied?: boolean }
type EditorSnapshot = {
  form: BlogPostInput
  tagsInput: string
  slugEdited: boolean
}
type AiMediaReplacement = {
  token: string
  value: string
}

const HISTORY_LIMIT = 50
// 편집 내용은 700ms 디바운스로 localStorage(draftStorageKey)에 계속 남는다 — 서버 저장 실패를 알릴 때 함께 안내한다.
const LOCAL_DRAFT_NOTICE = "작성 중인 내용은 이 브라우저에 임시 보관돼 있습니다."
const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024
const SOFT_INPUT_CLASS =
  "shadow-[0_1px_2px_rgba(17,17,16,0.04)] transition-all duration-150 hover:border-[#D8D8D2] hover:shadow-[0_3px_10px_rgba(17,17,16,0.05)] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/10 focus:shadow-[0_0_0_3px_rgba(8,71,52,0.05)]"
const SOFT_TEXTAREA_CLASS =
  `w-full resize-none rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 text-sm outline-none placeholder:text-[#1a1a1a]/25 ${SOFT_INPUT_CLASS}`
const SOFT_SELECT_CLASS =
  `w-full rounded-xl border border-[#e8e8e4] bg-white px-3 text-sm outline-none ${SOFT_INPUT_CLASS}`
type LeadMagnetOption = (typeof leadMagnetOptions)[number]

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function protectAiMedia(content: string) {
  const replacements: AiMediaReplacement[] = []
  let protectedContent = content
  const protect = (pattern: RegExp) => {
    protectedContent = protectedContent.replace(pattern, (value) => {
      const token = `[[CLASSIN_MEDIA_${replacements.length + 1}]]`
      replacements.push({ token, value })
      return token
    })
  }

  protect(/<figure\b[\s\S]*?<\/figure>/gi)
  protect(/<picture\b[\s\S]*?<\/picture>/gi)
  protect(/<video\b[\s\S]*?<\/video>/gi)
  protect(/<iframe\b[\s\S]*?<\/iframe>/gi)
  protect(/<img\b[^>]*>/gi)
  protect(/!\[[^\]\n]*\]\([^\n)]*\)/g)

  return { content: protectedContent, replacements }
}

function normalizeAiMarkdownResult(result: string) {
  const trimmed = result.trim()
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i)
  return (fenced?.[1] ?? trimmed).trim()
}

function restoreAiMedia(content: string, replacements: AiMediaReplacement[]) {
  let restored = content
  replacements.forEach(({ token, value }) => {
    const escaped = escapeRegExp(token)
    restored = restored.replace(new RegExp(`\`${escaped}\``, "g"), value)
    restored = restored.replace(new RegExp(escaped, "g"), value)
  })

  const missingMedia = replacements
    .map(({ value }) => value)
    .filter((value) => !restored.includes(value))

  if (missingMedia.length === 0) return restored
  return `${restored.trimEnd()}\n\n${missingMedia.join("\n\n")}`.trim()
}

function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    form: JSON.parse(JSON.stringify(snapshot.form)) as BlogPostInput,
    tagsInput: snapshot.tagsInput,
    slugEdited: snapshot.slugEdited,
  }
}

// 새 글의 기본 본문. 본문이 이 값 그대로일 때만 "어떻게 시작할까요?" 안내(템플릿·AI 초안)를 띄운다.
const EMPTY_DRAFT_MARKDOWN = [
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

function createEmptyDraft(): BlogPostInput {
  const today = new Date()
    .toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\./g, ". ")
    .trim()

  const contentMarkdown = EMPTY_DRAFT_MARKDOWN

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
    leadMagnetSlug: "",
    publishedAt: "",
    pageLayout: "standard",
    cta: { ...DEFAULT_BLOG_CTA },
    status: "draft",
  }
}

function toEditablePostInput(post: BlogPost): BlogPostInput {
  const input = { ...post } as BlogPostInput & { id?: number }
  delete input.id
  return {
    ...input,
    tags: [...post.tags],
    benefitItems: [...post.benefitItems],
    relatedPostIds: [...post.relatedPostIds],
    cta: { ...post.cta },
    publishedAt: post.publishedAt ?? "",
  }
}

function shouldUseStoredDraft(savedDraft: BlogPostInput, initialPost?: BlogPost) {
  if (!initialPost) return true
  if (!savedDraft.updatedAt) return false

  const savedUpdatedAt = new Date(savedDraft.updatedAt).getTime()
  const serverUpdatedAt = initialPost.updatedAt ? new Date(initialPost.updatedAt).getTime() : NaN
  if (Number.isNaN(savedUpdatedAt) || Number.isNaN(serverUpdatedAt)) return true

  return serverUpdatedAt <= savedUpdatedAt
}

// ISO 문자열 ↔ datetime-local 입력값(로컬 시각, 타임존 없음) 변환
function isoToLocalInput(iso?: string) {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
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
      className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 py-1.5 text-xs font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#1a1a1a]/20 hover:text-[#111110] active:scale-[0.96] active:bg-[#f7f7f5] duration-75"
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}

// 글 머리 속성 표(문서형 편집) — 평소엔 텍스트처럼 보이고 hover·focus 때만 입력칸 테두리가 드러난다.
// PropertyRow는 컨테이너 폭으로 배치를 바꾼다(@container): 본문 칼럼에선 라벨 | 값 두 칸, 좁은 상세 설정 패널에선 위아래.
const PROP_INPUT_CLASS =
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[14px] text-[#111110] outline-none transition-colors placeholder:text-[#A39E98] hover:bg-[#F6F5F4] focus:border-[#084734] focus:bg-white"
const SETTINGS_TABS = [
  { id: "classify", label: "분류" },
  { id: "seo", label: "검색 노출" },
  { id: "convert", label: "전환" },
  { id: "display", label: "표시 · 발행" },
] as const
type SettingsTab = (typeof SETTINGS_TABS)[number]["id"]

const PROP_INPUT_INVALID_CLASS = "border-[#F2B8B8] bg-[#FCE9E9] text-[#8F2C2C] hover:bg-[#FCE9E9]"

function PropertyRow({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  error?: string
  hint?: ReactNode
  children: ReactNode
}) {
  const labelText = (
    <>
      {label}
      {required && <span className="ml-1 text-[11px]">· 필수</span>}
    </>
  )
  return (
    <div className="grid gap-0.5 py-1 @lg:grid-cols-[120px_minmax(0,1fr)] @lg:items-start @lg:gap-3">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="px-2 text-[13px] text-[#615D59] @lg:px-0 @lg:pt-2">
          {labelText}
        </label>
      ) : (
        <span className="px-2 text-[13px] text-[#615D59] @lg:px-0 @lg:pt-2">{labelText}</span>
      )}
      <div className="min-w-0">
        {children}
        {error ? (
          <p id={htmlFor ? `${htmlFor}-error` : undefined} className="px-2 pt-1 text-[12px] text-[#8F2C2C]">
            {error}
          </p>
        ) : hint ? (
          <p className="px-2 pt-1 text-[11px] leading-relaxed text-[#615D59]">{hint}</p>
        ) : null}
      </div>
    </div>
  )
}

const RichMarkdownEditor = dynamic(() => import("@/components/admin/RichMarkdownEditor"), {
  loading: () => <div className="h-[600px] animate-pulse rounded-xl bg-[#f0f0ec]" />,
  ssr: false,
})

export default function BlogPostEditor({
  mode,
  initialPost,
  allPosts,
}: BlogPostEditorProps) {
  const router = useRouter()
  const editorRef = useRef<RichMarkdownEditorHandle | null>(null)
  const initialForm = initialPost ? toEditablePostInput(initialPost) : createEmptyDraft()

  const [form, setForm] = useState<BlogPostInput>(initialForm)
  const [tagsInput, setTagsInput] = useState(initialForm.tags.join(", "))
  const [draftState, setDraftState] = useState<DraftState>("saved")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadingField, setUploadingField] = useState<"imageUrl" | "heroImageUrl" | null>(null)
  const [notice, setNotice] = useState("")
  const [aiState, setAiState] = useState<AiState | null>(null)
  const [draftInput, setDraftInput] = useState({ topic: "", tone: "전문적", length: "medium", reference: "" })
  const [showPreview, setShowPreview] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templates, setTemplates] = useState<BlogTemplate[]>([])
  const [templateTab, setTemplateTab] = useState<"load" | "save">("load")
  const [templateName, setTemplateName] = useState("")
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null)
  const [confirmDeleteTemplateId, setConfirmDeleteTemplateId] = useState<string | null>(null)
  const [slugEdited, setSlugEdited] = useState(Boolean(initialPost?.slug))
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [showPublishPanel, setShowPublishPanel] = useState(false)
  const [publishTiming, setPublishTiming] = useState<"now" | "schedule">(() =>
    initialPost?.publishedAt && new Date(initialPost.publishedAt).getTime() > Date.now() ? "schedule" : "now"
  )
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("classify")
  const settingsTriggerRef = useRef<HTMLButtonElement>(null)
  const [showValidation, setShowValidation] = useState(false)
  const [showAiTools, setShowAiTools] = useState(false)
  const [startPanelDismissed, setStartPanelDismissed] = useState(false)
  const publishPanelRef = useRef<HTMLDivElement>(null)
  // 상세 설정 패널 안의 칸으로 "고치기"·"보기"를 누르면 패널·탭을 연 뒤 다음 렌더에서 포커스한다.
  const pendingFocusIdRef = useRef<string | null>(null)
  const [leadOptions, setLeadOptions] = useState<readonly LeadMagnetOption[]>(leadMagnetOptions)
  const formRef = useRef(form)
  const tagsInputRef = useRef(tagsInput)
  const slugEditedRef = useRef(slugEdited)
  const undoStackRef = useRef<EditorSnapshot[]>([])
  const redoStackRef = useRef<EditorSnapshot[]>([])
  const skipNextAutosaveRef = useRef(false)
  // Cmd+S 전역 keydown은 1회만 등록되므로, 항상 최신 렌더의 handleSubmit을 부르도록 ref로 노출한다.
  const handleSubmitRef = useRef<
    ((nextStatus?: BlogPostStatus, options?: { publishNow?: boolean }) => Promise<void>) | null
  >(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    const header = headerRef.current
    if (!wrapper || !header) return

    const update = () => {
      wrapper.style.setProperty("--editor-header-h", `${header.offsetHeight}px`)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let ignore = false
    adminFetch("/api/admin/lead-magnets")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { leadMagnets?: LeadMagnetOption[] } | null) => {
        if (!ignore && Array.isArray(data?.leadMagnets)) {
          setLeadOptions(
            data.leadMagnets.map((item) => ({
              slug: item.slug,
              title: item.title,
              status: item.status,
              gate: item.gate,
              published: item.published,
            }))
          )
        }
      })
      .catch(() => undefined)
    return () => {
      ignore = true
    }
  }, [])

  const draftStorageKey = `admin-blog-editor-${initialPost?.id ?? "new"}`
  const filteredPosts = useMemo(
    () => allPosts.filter((post) => post.id !== initialPost?.id),
    [allPosts, initialPost?.id]
  )
  const computedReadTime = useMemo(
    () => estimateReadTime(form.contentMarkdown),
    [form.contentMarkdown]
  )
  const coverPreviewUrl = form.heroImageUrl || form.imageUrl
  const authorAvatarSrc = sanitizePublicImageUrl(form.authorAvatarUrl, "")
  const authorInitial = form.author.trim().slice(0, 1) || "C"
  const tagKeywords = useMemo(() => parseTags(tagsInput), [tagsInput])
  const requiredItems = [
    { label: "제목", fieldId: "title", done: Boolean(form.title.trim()) },
    { label: "요약", fieldId: "excerpt", done: Boolean(form.excerpt.trim()) },
    { label: "카테고리", fieldId: "category", done: Boolean(form.category.trim()) },
  ]
  const contentCharacterCount = form.contentMarkdown.trim().length
  const blogStatusLabel = BLOG_STATUS_OPTIONS.find((option) => option.value === form.status)?.label ?? form.status
  const blogStatusTone =
    form.status === "published"
      ? "bg-[#ECFDF5] text-[#084734]"
      : form.status === "draft"
      ? "bg-[#FBF1E0] text-[#7A520F]"
      : "bg-[#F6F5F4] text-[#615D59]"
  // 저장 시 서버가 같은 slug를 거절한다(lib/repositories/blog.ts assertBlogSlugAvailable).
  // 발행 창에서 미리 막고 대체 주소를 제안하기 위해 화면에 있는 글 목록으로 먼저 확인한다.
  const effectiveSlug = form.slug.trim() || form.title.trim() ? slugify(form.slug.trim() || form.title.trim()) : ""
  const slugConflictPost = effectiveSlug
    ? filteredPosts.find((post) => post.slug === effectiveSlug)
    : undefined
  const suggestedSlug = useMemo(() => {
    if (!slugConflictPost) return ""
    const taken = new Set(filteredPosts.map((post) => post.slug))
    let suffix = 2
    while (taken.has(`${effectiveSlug}-${suffix}`)) suffix += 1
    return `${effectiveSlug}-${suffix}`
  }, [effectiveSlug, filteredPosts, slugConflictPost])
  const headings = useMemo(
    () => extractMarkdownHeadings(form.contentMarkdown),
    [form.contentMarkdown]
  )

  // Real-time SEO analysis
  const seoAnalysis = useMemo(() => {
    const effectiveTitle = form.seoTitle.trim() || form.title.trim()
    const effectiveDesc = form.seoDescription.trim() || form.excerpt.trim()
    const titleLen = effectiveTitle.length
    const descLen = effectiveDesc.length
    const h2Count = headings.filter((h) => h.level === 2).length
    const hasImage = Boolean(form.imageUrl.trim() || form.heroImageUrl.trim())
    const hasSlug = Boolean(form.slug.trim())
    const hasExcerpt = form.excerpt.trim().length >= 30
    const hasKeyword = tagKeywords.length > 0

    const checks = [
      {
        id: "title",
        label: "제목 길이",
        detail: titleLen > 0 ? `${titleLen}자 · 권장 30~60자` : "미입력",
        ok: titleLen >= 30 && titleLen <= 60,
      },
      {
        id: "desc",
        label: "메타 설명",
        detail: descLen > 0 ? `${descLen}자 · 권장 120~160자` : "미입력",
        ok: descLen >= 120 && descLen <= 160,
      },
      {
        id: "slug",
        label: "URL 슬러그",
        detail: hasSlug ? `/blog/${form.slug}` : "미설정",
        ok: hasSlug,
      },
      {
        id: "h2",
        label: "H2 소제목",
        detail: h2Count > 0 ? `${h2Count}개` : "없음",
        ok: h2Count > 0,
      },
      {
        id: "image",
        label: "대표 이미지",
        detail: hasImage ? "설정됨" : "없음",
        ok: hasImage,
      },
      {
        id: "excerpt",
        label: "요약문",
        detail: form.excerpt.trim().length > 0 ? `${form.excerpt.trim().length}자` : "미입력",
        ok: hasExcerpt,
      },
      {
        id: "keyword",
        label: "키워드/태그",
        detail: hasKeyword ? `${tagKeywords.length}개` : "없음",
        ok: hasKeyword,
      },
    ]

    const passed = checks.filter((c) => c.ok).length
    const score = Math.round((passed / checks.length) * 100)
    const scoreLabel = score >= 80 ? "좋음" : score >= 50 ? "보통" : "개선 필요"
    const scoreColor = score >= 80 ? "#084734" : score >= 50 ? "#b45309" : "#b91c1c"
    const scoreBg = score >= 80 ? "#f0fdf4" : score >= 50 ? "#fffbeb" : "#fef2f2"
    const scoreBorder = score >= 80 ? "#bbf7d0" : score >= 50 ? "#fde68a" : "#fecaca"

    return { score, checks, scoreLabel, scoreColor, scoreBg, scoreBorder, effectiveTitle, effectiveDesc }
  }, [
    form.seoTitle,
    form.title,
    form.seoDescription,
    form.excerpt,
    form.imageUrl,
    form.heroImageUrl,
    form.slug,
    headings,
    tagKeywords.length,
  ])

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() === "s") {
        event.preventDefault()
        // 직접 호출하면 이 effect가 등록 시점(첫 렌더)의 handleSubmit 클로저를 캡처해
        // 스테일 상태를 저장하게 된다 — ref를 통해 최신 클로저를 부른다.
        void handleSubmitRef.current?.()
        return
      }
      if (event.key.toLowerCase() !== "z") return
      // Tiptap 에디터(contenteditable)에 포커스가 있을 때는 Tiptap이 자체 처리
      if ((event.target as HTMLElement).isContentEditable) return
      event.preventDefault()
      if (event.shiftKey) { handleRedo(); return }
      handleUndo()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleRedo, handleUndo])

  useEffect(() => {
    const rawDraft = localStorage.getItem(draftStorageKey)
    if (!rawDraft) return
    try {
      const savedDraft = JSON.parse(rawDraft) as BlogPostInput
      if (!shouldUseStoredDraft(savedDraft, initialPost)) {
        localStorage.removeItem(draftStorageKey)
        return
      }
      applySnapshot({
        form: savedDraft,
        tagsInput: savedDraft.tags.join(", "),
        slugEdited: Boolean(savedDraft.slug),
      })
      undoStackRef.current = []
      redoStackRef.current = []
      setDraftState("saved")
    } catch {
      // Ignore malformed local drafts.
    }
  }, [applySnapshot, draftStorageKey, initialPost])

  useEffect(() => {
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false
      setDraftState("saved")
      return
    }

    setDraftState("dirty")
    const timer = window.setTimeout(() => {
      setDraftState("saving")
      localStorage.setItem(draftStorageKey, JSON.stringify(form))
      setDraftState("saved")
      setLastSavedAt(new Date())
    }, 700)
    return () => window.clearTimeout(timer)
  }, [draftStorageKey, form])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY)
      if (raw) setTemplates(JSON.parse(raw) as BlogTemplate[])
    } catch {
      // Ignore malformed template data.
    }
  }, [])

  const updateForm = <K extends keyof BlogPostInput>(key: K, value: BlogPostInput[K]) => {
    updateEditor((snapshot) => ({
      ...snapshot,
      form: { ...snapshot.form, [key]: value },
    }))
  }

  const updateBenefit = (index: number, value: string) => {
    updateEditor((snapshot) => {
      const nextBenefits = [...snapshot.form.benefitItems]
      nextBenefits[index] = value
      return { ...snapshot, form: { ...snapshot.form, benefitItems: nextBenefits } }
    })
  }

  const updateCta = <K extends keyof BlogPostInput["cta"]>(key: K, value: BlogPostInput["cta"][K]) => {
    updateEditor((snapshot) => ({
      ...snapshot,
      form: { ...snapshot.form, cta: { ...snapshot.form.cta, [key]: value } },
    }))
  }

  const updateTagsInput = useCallback(
    (value: string) => {
      const parsed = parseTags(value)
      updateEditor((snapshot) => ({
        ...snapshot,
        tagsInput: value,
        form: { ...snapshot.form, tags: parsed, tag: parsed[0] || "" },
      }))
    },
    [updateEditor]
  )

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

  const buildPayload = (
    nextStatus?: BlogPostStatus,
    options: { publishNow?: boolean } = {}
  ): BlogPostInput => {
    // 클로저 state 대신 ref를 읽는다. applySnapshot이 ref를 동기 갱신하므로
    // 저장 직전 editorRef.flush()로 전파한 디바운스 대기 본문이 같은 틱에서 바로 보인다.
    const form = formRef.current
    const tagsInput = tagsInputRef.current
    const authorAvatarSrc = sanitizePublicImageUrl(form.authorAvatarUrl, "")
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
      readTime: estimateReadTime(form.contentMarkdown),
      imageUrl: form.imageUrl.trim() || form.heroImageUrl.trim(),
      heroImageUrl: form.heroImageUrl.trim() || form.imageUrl.trim(),
      thumbnailAlt: form.thumbnailAlt.trim() || `${finalTitle} 썸네일`,
      heroImageAlt: form.heroImageAlt.trim() || `${finalTitle} 배너 이미지`,
      benefitItems: form.benefitItems.map((item) => item.trim()).filter(Boolean).slice(0, 3),
      authorBio:
        form.authorBio.trim() ||
        `${form.author.trim() || "Classin 팀"}은 교육 운영과 전환 경험을 정리합니다.`,
      authorAvatarUrl: authorAvatarSrc,
      seoTitle: form.seoTitle.trim() || finalTitle,
      seoDescription: form.seoDescription.trim() || finalExcerpt,
      cta: {
        eyebrow: form.cta.eyebrow.trim() || DEFAULT_BLOG_CTA.eyebrow,
        title: form.cta.title.trim() || DEFAULT_BLOG_CTA.title,
        description: form.cta.description.trim() || DEFAULT_BLOG_CTA.description,
        buttonLabel: form.cta.buttonLabel.trim() || DEFAULT_BLOG_CTA.buttonLabel,
        buttonHref: form.cta.buttonHref.trim() || DEFAULT_BLOG_CTA.buttonHref,
      },
      publishedAt:
        options.publishNow && nextStatus === "published"
          ? new Date().toISOString()
          : form.publishedAt,
      status: nextStatus ?? form.status,
    }
  }

  const handleImageUpload = async (field: "imageUrl" | "heroImageUrl", file: File) => {
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setNotice("이미지 파일은 5MB 이하만 업로드할 수 있습니다.")
      return
    }
    setUploadingField(field)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${getAdminToken()}` },
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setNotice(err.error ?? "업로드에 실패했습니다.")
        return
      }
      const { url } = await res.json() as { url: string }
      updateForm(field, url)
      if (field === "imageUrl" && !form.heroImageUrl) updateForm("heroImageUrl", url)
      if (field === "heroImageUrl" && !form.imageUrl) updateForm("imageUrl", url)
    } catch {
      setNotice("업로드 중 오류가 발생했습니다.")
    } finally {
      setUploadingField(null)
    }
  }

  const handleSubmit = async (
    nextStatus?: BlogPostStatus,
    options: { publishNow?: boolean } = {}
  ) => {
    if (isSubmitting) return
    // 트레일링 디바운스로 대기 중인 마지막 <200ms 타이핑을 저장 전에 동기 전파한다.
    // (onChange → updateEditor → applySnapshot이 formRef를 동기 갱신 → buildPayload가 ref를 읽음)
    editorRef.current?.flush()
    const payload = buildPayload(nextStatus, options)
    if (!payload.title || !payload.excerpt || !payload.category) {
      setShowValidation(true)
      setNotice("제목, 요약, 카테고리는 꼭 입력해주세요.")
      return
    }
    if ((formRef.current.authorAvatarUrl ?? "").trim() && !payload.authorAvatarUrl) {
      setNotice("작성자 아바타는 사이트 내부 경로, Supabase Storage, Unsplash 이미지만 사용할 수 있습니다.")
      return
    }
    setIsSubmitting(true)
    setNotice("")
    try {
      const postId = initialPost?._uuid ?? initialPost?.id
      const url = postId ? `/api/admin/blog/${postId}` : "/api/admin/blog"
      const method = initialPost ? "PUT" : "POST"
      const response = await adminFetch(url, { method, body: JSON.stringify(payload) })
      if (response.status === 401) { startTransition(() => router.replace("/admin/login")); return }
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        setNotice(`${data?.error || "저장 중 문제가 발생했습니다."} ${LOCAL_DRAFT_NOTICE}`)
        return
      }
      const data = (await response.json()) as { post: BlogPost }
      const nextForm = toEditablePostInput(data.post)
      skipNextAutosaveRef.current = true
      applySnapshot({
        form: nextForm,
        tagsInput: nextForm.tags.join(", "),
        slugEdited: Boolean(nextForm.slug),
      })
      undoStackRef.current = []
      redoStackRef.current = []
      localStorage.removeItem(draftStorageKey)
      setDraftState("saved")
      setLastSavedAt(new Date())
      setNotice(nextStatus === "published" ? "발행까지 완료했습니다." : "저장했습니다.")
      const savedPostId = data.post._uuid ?? data.post.id
      startTransition(() => {
        router.push(`/admin/blog/${savedPostId}/edit`)
        router.refresh()
      })
    } catch {
      setNotice(`저장 중 문제가 발생했습니다. 네트워크 연결을 확인해주세요. ${LOCAL_DRAFT_NOTICE}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    handleSubmitRef.current = handleSubmit
  })

  const handleAiAction = async (action: AiAction, params?: { topic: string; tone: string; length: string; reference?: string }, contentOverride?: string) => {
    setAiState({ action, status: "loading", result: "", ...(params ?? {}) })
    const sourceContent = contentOverride ?? form.contentMarkdown
    const mediaGuard = action === "optimize" ? protectAiMedia(sourceContent) : null
    const requestContent = mediaGuard?.content ?? sourceContent
    const shouldAutoApplyOptimize = action === "optimize" && contentOverride === undefined
    try {
      const res = await adminFetch("/api/admin/blog/ai", {
        method: "POST",
        body: JSON.stringify(
          action === "draft" && params
            ? { action, category: form.category, topic: params.topic, tone: params.tone, length: params.length, reference: params.reference ?? "" }
            : { action, title: form.title, content: requestContent, category: form.category }
        ),
      })
      if (res.status === 401) {
        setAiState({
          action,
          status: "error",
          result: "인증이 만료되었습니다. 다시 로그인해 주세요.",
          ...(params ?? {}),
        })
        startTransition(() => router.replace("/admin/login"))
        return
      }
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "AI 처리 중 오류가 발생했습니다." })) as { error?: string }
        setAiState({
          action,
          status: "error",
          result: err.error || "AI 응답 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
          ...(params ?? {}),
        })
        return
      }
      setAiState({ action, status: "streaming", result: "", ...(params ?? {}) })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let streamedResult = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        streamedResult += chunk
        setAiState((prev) => prev ? { ...prev, result: prev.result + chunk } : null)
      }
      const finalResult =
        action === "optimize" && mediaGuard
          ? restoreAiMedia(normalizeAiMarkdownResult(streamedResult), mediaGuard.replacements)
          : streamedResult
      if (shouldAutoApplyOptimize && finalResult.trim()) {
        updateForm("contentMarkdown", finalResult)
        setNotice(
          mediaGuard?.replacements.length
            ? "AI 다듬기를 본문에 바로 적용했습니다. 기존 이미지와 미디어 블록은 유지했습니다."
            : "AI 다듬기를 본문에 바로 적용했습니다."
        )
      }
      setAiState((prev) => prev ? { ...prev, status: "done", result: finalResult, autoApplied: shouldAutoApplyOptimize } : null)
    } catch {
      setAiState({
        action,
        status: "error",
        result: "AI 응답 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        ...(params ?? {}),
      })
    }
  }

  const AI_LABELS: Record<AiAction, string> = {
    "card-news": "카드뉴스 생성",
    "reels": "릴스 스크립트",
    "optimize": "본문 다듬기",
    "draft": "초안 생성",
  }
  const isAiBusy = aiState?.status === "loading" || aiState?.status === "streaming"

  const applyTemplate = (template: BlogTemplate) => {
    updateEditor((snapshot) => ({
      ...snapshot,
      form: {
        ...snapshot.form,
        contentMarkdown: template.data.contentMarkdown,
        benefitItems: template.data.benefitItems,
        targetReader: template.data.targetReader,
        category: template.data.category,
        cta: { ...template.data.cta },
      },
    }))
    setNotice("템플릿을 불러왔습니다.")
  }

  const removeCoverImage = () => {
    updateEditor((snapshot) => ({
      ...snapshot,
      form: { ...snapshot.form, imageUrl: "", heroImageUrl: "" },
    }))
  }

  const closeSettings = () => {
    setShowSettings(false)
    settingsTriggerRef.current?.focus()
  }

  const focusField = (fieldId: string, options: { settingsTab?: SettingsTab } = {}) => {
    setShowPublishPanel(false)
    setShowValidation(true)
    const target = document.getElementById(fieldId)
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "smooth" })
      target.focus({ preventScroll: true })
      return
    }
    if (options.settingsTab) {
      pendingFocusIdRef.current = fieldId
      setSettingsTab(options.settingsTab)
      setShowSettings(true)
    }
  }

  // 패널을 열면 선택된 탭으로 포커스를 옮긴다. 특정 칸으로 가는 중(pendingFocusIdRef)이면 그 칸이 우선이라
  // 아래 포커스 effect보다 먼저 선언한다.
  useEffect(() => {
    if (!showSettings || pendingFocusIdRef.current) return
    document.getElementById(`settings-tab-${settingsTab}`)?.focus()
    // 탭을 바꿀 때마다 포커스를 옮기지 않도록 열릴 때만 실행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings])

  useEffect(() => {
    if (!showSettings) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || showPublishPanel) return
      setShowSettings(false)
      settingsTriggerRef.current?.focus()
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [showSettings, showPublishPanel])

  useEffect(() => {
    const fieldId = pendingFocusIdRef.current
    if (!fieldId) return
    const target = document.getElementById(fieldId)
    if (!target) return
    pendingFocusIdRef.current = null
    target.scrollIntoView({ block: "center", behavior: "smooth" })
    target.focus({ preventScroll: true })
  })

  useEffect(() => {
    if (!showPublishPanel) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!publishPanelRef.current?.contains(event.target as Node)) setShowPublishPanel(false)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowPublishPanel(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [showPublishPanel])

  type PublishCheck = {
    id: string
    label: string
    detail?: string
    state: "ok" | "blocker" | "advice"
    action?: { label: string; fieldId: string; settingsTab?: SettingsTab }
  }
  const seoPassedCount = seoAnalysis.checks.filter((check) => check.ok).length
  const publishChecks: PublishCheck[] = [
    ...requiredItems.map((item): PublishCheck => ({
      id: item.fieldId,
      label: item.label,
      detail: item.done ? undefined : "필수",
      state: item.done ? "ok" : "blocker",
      action: item.done ? undefined : { label: "고치기", fieldId: item.fieldId },
    })),
    {
      id: "slug",
      label: "URL",
      detail: slugConflictPost ? "다른 글과 겹침" : effectiveSlug ? `/blog/${effectiveSlug}` : undefined,
      state: slugConflictPost ? "blocker" : "ok",
      action: slugConflictPost ? { label: "고치기", fieldId: "slug" } : undefined,
    },
    {
      id: "cover",
      label: "대표 이미지",
      detail: coverPreviewUrl ? undefined : "권장",
      state: coverPreviewUrl ? "ok" : "advice",
      action: coverPreviewUrl ? undefined : { label: "추가", fieldId: "blog-cover-upload" },
    },
    {
      id: "seo",
      label: `SEO ${seoAnalysis.score}`,
      detail: `${seoPassedCount}/${seoAnalysis.checks.length} 통과`,
      state: seoAnalysis.score >= 80 ? "ok" : "advice",
      action:
        seoAnalysis.score >= 80
          ? undefined
          : { label: "보기", fieldId: "seoTitle", settingsTab: "seo" },
    },
  ]
  const publishBlockerCount = publishChecks.filter((check) => check.state === "blocker").length
  const scheduledLabel = form.publishedAt
    ? new Date(form.publishedAt).toLocaleString("ko-KR", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : ""
  const publishButtonLabel =
    publishBlockerCount > 0
      ? "필수 항목을 채우면 발행할 수 있어요"
      : publishTiming === "schedule"
      ? scheduledLabel
        ? `${scheduledLabel}에 발행 예약`
        : "공개 시각을 정해주세요"
      : "지금 발행"

  const handlePublish = () => {
    if (publishBlockerCount > 0) {
      setShowValidation(true)
      return
    }
    if (publishTiming === "schedule") {
      const scheduledAt = formRef.current.publishedAt
      if (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now()) {
        setNotice("예약 시각을 다시 입력해주세요. 지금 이후여야 합니다.")
        return
      }
      setShowPublishPanel(false)
      void handleSubmit("published")
      return
    }
    setShowPublishPanel(false)
    void handleSubmit("published", { publishNow: true })
  }

  const draftStatusText =
    draftState === "dirty"
      ? "수정됨"
      : draftState === "saving"
      ? "저장 중…"
      : lastSavedAt
      ? `${lastSavedAt.getHours().toString().padStart(2, "0")}:${lastSavedAt.getMinutes().toString().padStart(2, "0")} 임시 저장`
      : "임시 저장됨"
  const showStartPanel =
    mode === "create" && !startPanelDismissed && form.contentMarkdown === EMPTY_DRAFT_MARKDOWN
  const invalid = {
    title: showValidation && !form.title.trim(),
    excerpt: showValidation && !form.excerpt.trim(),
    category: showValidation && !form.category.trim(),
  }

  return (
    <div
      ref={wrapperRef}
      className="min-h-screen bg-[#FAFAF8]"
      style={{ ["--editor-header-h" as string]: "64px" }}
    >

      {/* ── Template Modal ── */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[24px] border border-[#e8e8e4] shadow-2xl w-full max-w-xl flex flex-col" style={{ maxHeight: "85vh" }}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#e8e8e4] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <LayoutTemplate className="h-4 w-4 text-[#084734]" />
                <p className="text-sm font-semibold text-[#111110]">템플릿</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowTemplateModal(false); setTemplateName(""); setExpandedTemplateId(null); setConfirmDeleteTemplateId(null) }}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#e8e8e4] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="px-5 pt-4 shrink-0">
              <div className="bg-[#f7f7f5] rounded-xl p-1 w-fit flex gap-0.5">
                <button
                  type="button"
                  onClick={() => setTemplateTab("load")}
                  className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                    templateTab === "load"
                      ? "bg-white text-[#111110] shadow-sm"
                      : "text-[#1a1a1a]/50 hover:text-[#111110]"
                  }`}
                >
                  불러오기
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateTab("save")}
                  className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                    templateTab === "save"
                      ? "bg-white text-[#111110] shadow-sm"
                      : "text-[#1a1a1a]/50 hover:text-[#111110]"
                  }`}
                >
                  현재 내용 저장
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {templateTab === "save" && (
                <div className="space-y-3">
                  <p className="text-[13px] text-[#1a1a1a]/50">
                    본문, 혜택 포인트, 독자 대상, 카테고리, CTA를 템플릿으로 저장합니다.
                  </p>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="예) 제품 소개 기본형"
                    className="w-full rounded-xl border border-[#e8e8e4] bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-[#084734]"
                  />
                  <button
                    type="button"
                    disabled={!templateName.trim()}
                    onClick={() => {
                      const newTemplate: BlogTemplate = {
                        id: crypto.randomUUID(),
                        name: templateName.trim(),
                        savedAt: new Date().toISOString(),
                        data: {
                          contentMarkdown: form.contentMarkdown,
                          benefitItems: form.benefitItems,
                          targetReader: form.targetReader,
                          category: form.category,
                          cta: { ...form.cta },
                        },
                      }
                      const next = [newTemplate, ...templates].slice(0, 10)
                      setTemplates(next)
                      localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next))
                      setTemplateName("")
                      setTemplateTab("load")
                    }}
                    className="w-full rounded-xl bg-[#084734] px-4 py-2.5 text-[13px] font-medium text-white transition-opacity disabled:opacity-40 hover:opacity-90"
                  >
                    저장
                  </button>
                </div>
              )}

              {templateTab === "load" && (
                <div className="space-y-5">
                  {/* 저장한 템플릿 */}
                  {templates.length > 0 && (
                    <div>
                      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-[#1a1a1a]/30">내 템플릿</p>
                      <div className="space-y-2.5">
                        {templates.map((t) => {
                      const isExpanded = expandedTemplateId === t.id
                      const isPendingDelete = confirmDeleteTemplateId === t.id
                      return (
                        <div
                          key={t.id}
                          className="rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => setExpandedTemplateId(isExpanded ? null : t.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="font-semibold text-[13px] text-[#111110]">{t.name}</p>
                              <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
                                {new Date(t.savedAt).toLocaleDateString("ko-KR")}
                                {t.data.category && ` · ${t.data.category}`}
                              </p>
                              {!isExpanded && t.data.contentMarkdown && (
                                <p className="mt-1.5 text-xs text-[#1a1a1a]/40 line-clamp-1">
                                  {t.data.contentMarkdown.replace(/#{1,6}\s|[*_`>-]/g, "").slice(0, 80)}…
                                </p>
                              )}
                            </button>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  updateEditor((snapshot) => ({
                                    ...snapshot,
                                    form: {
                                      ...snapshot.form,
                                      contentMarkdown: t.data.contentMarkdown,
                                      benefitItems: t.data.benefitItems,
                                      targetReader: t.data.targetReader,
                                      category: t.data.category,
                                      cta: { ...t.data.cta },
                                    },
                                  }))
                                  setShowTemplateModal(false)
                                  setConfirmDeleteTemplateId(null)
                                  setExpandedTemplateId(null)
                                  setNotice("템플릿을 불러왔습니다.")
                                }}
                                className="text-[12px] font-medium text-[#084734] hover:text-[#084734]/70 transition-colors"
                              >
                                불러오기
                              </button>
                              {isPendingDelete ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = templates.filter((item) => item.id !== t.id)
                                      setTemplates(next)
                                      localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next))
                                      setConfirmDeleteTemplateId(null)
                                    }}
                                    className="text-[11px] font-medium text-[#B85C33] hover:text-[#9A4A27] transition-colors"
                                  >
                                    삭제 확인
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteTemplateId(null)}
                                    className="text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60 transition-colors"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteTemplateId(t.id)}
                                  className="text-[#1a1a1a]/25 hover:text-[#B85C33] transition-colors"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          {isExpanded && t.data.contentMarkdown && (
                            <div className="mt-3 rounded-xl border border-[#e8e8e4] bg-white px-4 py-3">
                              <p className="text-[11px] font-medium uppercase tracking-wider text-[#1a1a1a]/30 mb-2">본문 미리보기</p>
                              <pre className="whitespace-pre-wrap font-sans text-[12px] leading-6 text-[#1a1a1a]/55 line-clamp-6">
                                {t.data.contentMarkdown.slice(0, 400)}{t.data.contentMarkdown.length > 400 ? "…" : ""}
                              </pre>
                            </div>
                          )}
                        </div>
                      )
                        })}
                      </div>
                    </div>
                  )}

                  {/* 기본 제공 템플릿 */}
                  <div>
                    <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-[#1a1a1a]/30">기본 제공</p>
                    <div className="space-y-2.5">
                      {DEFAULT_TEMPLATES.map((t) => {
                        const isExpanded = expandedTemplateId === t.id
                        return (
                          <div
                            key={t.id}
                            className="rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => setExpandedTemplateId(isExpanded ? null : t.id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <p className="font-semibold text-[13px] text-[#111110]">{t.name}</p>
                                <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">{t.data.category} · 기본 제공</p>
                                {!isExpanded && (
                                  <p className="mt-1.5 text-xs text-[#1a1a1a]/40 line-clamp-1">
                                    {t.data.contentMarkdown.replace(/#{1,6}\s|[*_`>-]/g, "").slice(0, 80)}…
                                  </p>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  updateEditor((snapshot) => ({
                                    ...snapshot,
                                    form: {
                                      ...snapshot.form,
                                      contentMarkdown: t.data.contentMarkdown,
                                      benefitItems: t.data.benefitItems,
                                      targetReader: t.data.targetReader,
                                      category: t.data.category,
                                      cta: { ...t.data.cta },
                                    },
                                  }))
                                  setShowTemplateModal(false)
                                  setExpandedTemplateId(null)
                                  setNotice("템플릿을 불러왔습니다.")
                                }}
                                className="shrink-0 text-[12px] font-medium text-[#084734] hover:text-[#084734]/70 transition-colors"
                              >
                                불러오기
                              </button>
                            </div>
                            {isExpanded && (
                              <div className="mt-3 rounded-xl border border-[#e8e8e4] bg-white px-4 py-3">
                                <p className="text-[11px] font-medium uppercase tracking-wider text-[#1a1a1a]/30 mb-2">본문 미리보기</p>
                                <pre className="whitespace-pre-wrap font-sans text-[12px] leading-6 text-[#1a1a1a]/55 line-clamp-6">
                                  {t.data.contentMarkdown.slice(0, 400)}{t.data.contentMarkdown.length > 400 ? "…" : ""}
                                </pre>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── AI Result Modal ── */}
      {aiState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-2xl flex-col rounded-[28px] border border-[#e8e8e4] bg-white shadow-2xl" style={{ maxHeight: "85vh" }}>
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-[#e8e8e4] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                  aiState.action === "card-news" ? "bg-[#ECFDF5]" :
                  aiState.action === "reels" ? "bg-[#F6F5F4]" :
                  aiState.action === "draft" ? "bg-amber-50" : "bg-emerald-50"
                }`}>
                  {aiState.action === "card-news" && <LayoutTemplate className="h-4 w-4 text-[#084734]" />}
                  {aiState.action === "reels" && <Video className="h-4 w-4 text-[#615D59]" />}
                  {aiState.action === "optimize" && <Wand2 className="h-4 w-4 text-emerald-600" />}
                  {aiState.action === "draft" && <Sparkles className="h-4 w-4 text-amber-500" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#111110]">{AI_LABELS[aiState.action]}</p>
                  <p className="text-[11px] text-[#1a1a1a]/40">
                    {aiState.status === "loading" ? "분석 중…" :
                     aiState.status === "streaming" ? "생성 중…" :
                     aiState.status === "done" ? "완료" : "오류"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {aiState.status === "done" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(aiState.result)}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    전체 복사
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => setAiState(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#e8e8e4] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {(aiState.status === "loading") && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-[#1a1a1a]/40">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm">AI가 분석 중입니다…</p>
                </div>
              )}
              {(aiState.status === "streaming" || aiState.status === "done") && (
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-[13px] leading-7 text-[#1a1a1a]/80">
                    {aiState.result}
                    {aiState.status === "streaming" && (
                      <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[#084734]" />
                    )}
                  </pre>
                </div>
              )}
              {aiState.status === "error" && (
                <div className="flex flex-col items-center gap-4 py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FEF3EE]">
                    <X className="h-5 w-5 text-[#B85C33]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#111110]">오류가 발생했습니다</p>
                    <p className="mt-1 text-[13px] text-[#1a1a1a]/45">잠시 후 다시 시도해주세요.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            {aiState.status === "done" && (
              <div className="border-t border-[#e8e8e4] px-6 py-4">
                <div className="flex items-center justify-between">
                  {aiState.action === "draft" ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        const lines = aiState.result.split("\n")
                        const titleLine = lines.find((l) => l.startsWith("# "))
                        const extractedTitle = titleLine ? titleLine.replace(/^#\s+/, "").trim() : ""
                        const body = lines
                          .filter((l) => !l.startsWith("# ") || l !== titleLine)
                          .join("\n")
                          .trimStart()
                        updateForm("contentMarkdown", body)
                        if (extractedTitle) updateForm("title", extractedTitle)
                        setAiState(null)
                      }}
                      className="bg-[#084734] text-white hover:bg-[#084734]/90"
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      에디터에 적용
                    </Button>
                  ) : aiState.action === "optimize" ? (
                    <p className="text-[12px] text-[#1a1a1a]/40">
                      {aiState.autoApplied
                        ? "본문에 바로 적용했습니다. 기존 이미지는 유지됩니다."
                        : "선택 구간 결과를 복사해서 필요한 위치에 반영해보세요."}
                    </p>
                  ) : (
                    <p className="text-[12px] text-[#1a1a1a]/40">결과를 복사해서 활용해보세요.</p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAiAction(
                      aiState.action,
                      aiState.action === "draft" && aiState.topic
                        ? { topic: aiState.topic, tone: aiState.tone ?? "전문적", length: aiState.length ?? "medium", reference: aiState.reference ?? "" }
                        : undefined
                    )}
                    className="text-[#1a1a1a]/50"
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    다시 생성
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Page Preview Modal ── */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#FAFAF8] overflow-hidden">
          {/* Preview header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[#e8e8e4] bg-white px-6 py-3">
            <div className="flex items-center gap-3">
              <Eye className="h-4 w-4 text-[#084734]" />
              <span className="text-sm font-semibold text-[#111110]">페이지 미리보기</span>
              <span className="rounded-full border border-[#e8e8e4] px-2.5 py-0.5 text-[11px] text-[#1a1a1a]/40">
                {form.pageLayout === "minimal" ? "미니멀" : "기본"} 레이아웃
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#e8e8e4] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Preview content */}
          <div className="min-h-0 flex-1 overflow-y-auto text-[#111110]">
            {/* Hero */}
            <section className="px-6 pb-10 pt-16">
              <div className="mx-auto max-w-[1200px]">
                <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
                  <div>
                    <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]">
                      {form.category && (
                        <span className="rounded-full bg-[#111110] px-3 py-1 font-medium text-white">
                          {form.category}
                        </span>
                      )}
                      {form.tags.slice(0, 2).filter(Boolean).map((tag) => (
                        <span key={tag} className="rounded-full border border-[#dfe3d4] bg-white px-3 py-1 text-[#084734]">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h1 className="max-w-4xl text-[2.4rem] font-bold leading-[1.05] tracking-[-0.05em] text-[#111110] md:text-[4.2rem]">
                      {form.title || "제목이 여기에 표시됩니다"}
                    </h1>
                    <p className="mt-6 max-w-3xl text-[18px] leading-8 text-[#1a1a1a]/55">
                      {form.excerpt || "요약문이 여기에 표시됩니다."}
                    </p>
                    <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-[#1a1a1a]/40">
                      <span>{form.date}</span>
                      <span>•</span>
                      <span>{computedReadTime}</span>
                      {form.author && <><span>•</span><span>{form.author}{form.authorRole && ` · ${form.authorRole}`}</span></>}
                    </div>
                  </div>

                  {(form.heroImageUrl || form.imageUrl) && (
                    <div className="overflow-hidden rounded-[32px] border border-[#e8e8e4] bg-white shadow-sm">
                      <div className="relative aspect-[16/10] overflow-hidden">
                        <Image
                          src={form.heroImageUrl || form.imageUrl}
                          alt={form.heroImageAlt || form.title || ""}
                          fill
                          className="object-cover"
                          sizes="(min-width: 1024px) 420px, 100vw"
                          unoptimized
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Benefits */}
            {form.benefitItems.some(Boolean) && (
              <section className="px-6 pb-8">
                <div className="mx-auto max-w-[1200px] rounded-[32px] border border-[#dcebd9] bg-white p-6 shadow-sm md:p-8">
                  <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
                    <div>
                      <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-[#084734]/55">Why Read This</p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#111110]">이 글을 읽으면 좋은 점</h2>
                      {form.targetReader && (
                        <p className="mt-3 text-sm leading-6 text-[#1a1a1a]/45">추천 대상: {form.targetReader}</p>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      {form.benefitItems.filter(Boolean).map((benefit, i) => (
                        <div key={i} className="rounded-[24px] border border-[#e8e8e4] bg-[#fcfcfb] p-5">
                          <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-[#084734]/45">Point {i + 1}</p>
                          <p className="mt-3 text-[15px] leading-7 text-[#1a1a1a]/75">{benefit}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Content */}
            <section className="px-6 pb-20 pt-10">
              <div className={`mx-auto max-w-[1200px] gap-12 ${
                form.pageLayout === "minimal"
                  ? "flex flex-col"
                  : "grid lg:grid-cols-[220px_minmax(0,1fr)]"
              }`}>
                {form.pageLayout !== "minimal" && headings.length > 0 && (
                  <aside className="hidden lg:block">
                    <div className="sticky top-8 rounded-[28px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
                      <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-[#084734]/45">On This Page</p>
                      <div className="mt-4 space-y-3">
                        {headings.map((h) => (
                          <p key={h.id} className={`text-sm leading-6 text-[#1a1a1a]/45 ${h.level === 3 ? "pl-4" : ""}`}>{h.text}</p>
                        ))}
                      </div>
                    </div>
                  </aside>
                )}
                <div className={form.pageLayout === "minimal" ? "mx-auto w-full max-w-3xl" : "min-w-0"}>
                  <div className="rounded-[36px] border border-[#e8e8e4] bg-white px-6 py-8 shadow-sm md:px-10 md:py-12">
                    {form.contentMarkdown
                      ? <BlogMarkdownRenderer markdown={form.contentMarkdown} />
                      : <p className="text-[#1a1a1a]/30">본문이 여기에 표시됩니다.</p>
                    }
                  </div>

                  {/* Author */}
                  {form.author && (
                    <div className="mt-10 rounded-[32px] border border-[#e8e8e4] bg-white p-6 shadow-sm md:p-8">
                      <div className="flex flex-col gap-6 md:flex-row md:items-center">
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[#f0f0ec]">
                          {authorAvatarSrc ? (
                            <SafeBlogImage
                              src={authorAvatarSrc}
                              alt={form.author}
                              fill
                              className="object-cover"
                              sizes="64px"
                              fallbackIndex={initialPost?.id ?? 0}
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-lg font-semibold text-[#084734]">
                              {authorInitial}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-[#111110]">{form.author}</p>
                          <p className="text-sm text-[#1a1a1a]/45">{form.authorRole}</p>
                          {form.authorBio && <p className="mt-3 text-[15px] leading-7 text-[#1a1a1a]/65">{form.authorBio}</p>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CTA */}
                  <div className="mt-12 overflow-hidden rounded-[36px] bg-[#111110] p-8 text-white shadow-sm md:p-10">
                    <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-white/35">{form.cta.eyebrow}</p>
                    <div className="mt-4 max-w-2xl">
                      <h2 className="text-[2rem] font-semibold tracking-[-0.04em] text-white md:text-[2.4rem]">{form.cta.title}</h2>
                      <p className="mt-4 text-[15px] leading-7 text-white/60">{form.cta.description}</p>
                    </div>
                    <div className="mt-8">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#111110]">
                        {form.cta.buttonLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ── Sticky header ──
          backdrop-blur를 쓰지 않는다: backdrop-filter가 fixed 자식의 기준 박스를 헤더로 바꿔
          모바일 발행 바텀시트(fixed bottom-0)가 헤더 안에 갇힌다.
          lg 미만에서는 문서가 스크롤되고 어드민 셸의 고정 상단바(h-16, z-40)가 위에 있으므로 top-16에 붙인다.
          발행 창이 열리면 셸의 상단바·하단 탭(z-40)보다 위로 올린다 — 바텀시트가 헤더의 쌓임 맥락 안에 있다. */}
      <header
        ref={headerRef}
        className={`sticky top-16 border-b border-[#e8e8e4] bg-[#FAFAF8] lg:top-0 ${showPublishPanel ? "z-[70]" : "z-30"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
          <div className="flex w-full min-w-0 items-center gap-2 text-[13px] text-[#615D59] sm:w-auto sm:flex-1">
            <Link
              href="/admin/blog"
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-2 transition-colors hover:bg-[#F6F5F4] hover:text-[#111110]"
            >
              <ArrowLeft className="h-4 w-4" />
              블로그
            </Link>
            <span aria-hidden="true">/</span>
            <h1 className="min-w-0 truncate text-[14px] font-semibold text-[#111110]">
              {form.title.trim() || (mode === "create" ? "새 글" : "제목 없음")}
            </h1>
            <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline-flex ${blogStatusTone}`}>
              {blogStatusLabel}
            </span>
            <span className="hidden shrink-0 items-center gap-1.5 text-[12px] sm:inline-flex" role="status">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${draftState === "saved" ? "bg-[#084734]" : "bg-[#A8741A]"}`}
              />
              {draftStatusText}
            </span>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              variant="ghost" size="sm"
              onClick={handleUndo}
              disabled={isSubmitting || undoStackRef.current.length === 0}
              title="되돌리기 (Ctrl/Cmd + Z)"
              aria-label="되돌리기"
              className="hidden h-9 w-9 p-0 sm:inline-flex"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={handleRedo}
              disabled={isSubmitting || redoStackRef.current.length === 0}
              title="다시 실행 (Ctrl/Cmd + Shift + Z)"
              aria-label="다시 실행"
              className="hidden h-9 w-9 p-0 sm:inline-flex"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => { setTemplateTab("load"); setShowTemplateModal(true) }}
              title="템플릿"
              aria-label="템플릿"
              className="relative hidden h-9 w-9 p-0 sm:inline-flex"
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              {templates.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#084734] text-[9px] font-bold leading-none text-white">
                  {templates.length}
                </span>
              )}
            </Button>
            <span className="mx-1 hidden h-4 w-px bg-[#e8e8e4] sm:block" aria-hidden="true" />
            <Button variant="ghost" size="sm" onClick={() => setShowPreview(true)} className="h-9">
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              미리보기
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleSubmit()} disabled={isSubmitting} title="저장 (Ctrl/Cmd + S)" className="h-9">
              {isSubmitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              저장
            </Button>

            <div ref={publishPanelRef} className="relative">
              <Button
                size="sm"
                onClick={() => setShowPublishPanel((open) => !open)}
                disabled={isSubmitting}
                aria-haspopup="dialog"
                aria-expanded={showPublishPanel}
                aria-controls="blog-publish-panel"
                className="h-9 bg-[#084734] text-white transition-colors hover:bg-[#065c41]"
              >
                {isSubmitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                발행
                <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>

              {showPublishPanel && (
                <>
                  {/* 모바일에서는 바텀시트 + 배경, sm 이상에서는 버튼 아래 팝오버. */}
                  <button
                    type="button"
                    aria-label="발행 창 닫기"
                    onClick={() => setShowPublishPanel(false)}
                    className="fixed inset-0 z-40 bg-[#111110]/35 sm:hidden"
                  />
                  <div
                    id="blog-publish-panel"
                    role="dialog"
                    aria-label="발행"
                    className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-[#e8e8e4] bg-white p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:pb-5 shadow-[0_-8px_24px_rgba(17,17,16,0.12)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[380px] sm:rounded-xl sm:shadow-[0_12px_32px_rgba(17,17,16,0.12)]"
                  >
                    <div aria-hidden="true" className="mx-auto mb-3 h-1 w-9 rounded-full bg-[#D5D2CB] sm:hidden" />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[15px] font-semibold text-[#111110]">
                        {publishBlockerCount > 0 ? "발행 전 확인" : "발행 준비"}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                          publishBlockerCount > 0 ? "bg-[#FCE9E9] text-[#8F2C2C]" : "bg-[#ECFDF5] text-[#084734]"
                        }`}
                      >
                        {publishBlockerCount > 0 ? `${publishBlockerCount}개 남음` : "모두 준비됨"}
                      </span>
                    </div>

                    <ul className="mt-3">
                      {publishChecks.map((check) => (
                        <li key={check.id} className="flex min-h-11 items-center gap-2.5 border-t border-[#F0F0EC] text-[13px]">
                          {check.state === "ok" ? (
                            <Check className="h-4 w-4 shrink-0 text-[#084734]" aria-label="완료" />
                          ) : check.state === "blocker" ? (
                            <X className="h-4 w-4 shrink-0 text-[#B43E3E]" aria-label="필요" />
                          ) : (
                            <AlertCircle className="h-4 w-4 shrink-0 text-[#A8741A]" aria-label="권장" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-[#111110]">
                            {check.label}
                            {check.detail && (
                              <span
                                className={`ml-1.5 text-[12px] ${
                                  check.state === "blocker" ? "text-[#8F2C2C]" : "text-[#615D59]"
                                }`}
                              >
                                {check.detail}
                              </span>
                            )}
                          </span>
                          {check.action && (
                            <button
                              type="button"
                              onClick={() => focusField(check.action!.fieldId, { settingsTab: check.action!.settingsTab })}
                              className={`inline-flex min-h-8 shrink-0 items-center rounded-md border bg-white px-2.5 text-[12px] font-semibold transition-colors ${
                                check.state === "blocker"
                                  ? "border-[#F2B8B8] text-[#8F2C2C] hover:bg-[#FCE9E9]"
                                  : "border-[#ECD29C] text-[#7A520F] hover:bg-[#FBF1E0]"
                              }`}
                            >
                              {check.action.label}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>

                    <fieldset className="mt-4">
                      <legend className="mb-2 text-[12px] font-medium text-[#615D59]">공개 시점</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {(["now", "schedule"] as const).map((value) => (
                          <label
                            key={value}
                            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-[13px] ${
                              publishTiming === value
                                ? "border-2 border-[#084734] font-semibold text-[#111110]"
                                : "border border-[#e8e8e4] text-[#31302E]"
                            }`}
                          >
                            <input
                              type="radio"
                              name="blog-publish-timing"
                              value={value}
                              checked={publishTiming === value}
                              onChange={() => setPublishTiming(value)}
                              className="accent-[#084734]"
                            />
                            {value === "now" ? "지금" : "예약"}
                          </label>
                        ))}
                      </div>
                      {publishTiming === "schedule" ? (
                        <div className="mt-3">
                          <label htmlFor="publish-schedule-at" className="mb-1 block text-[12px] text-[#615D59]">
                            공개 시각
                          </label>
                          <input
                            id="publish-schedule-at"
                            type="datetime-local"
                            value={isoToLocalInput(form.publishedAt)}
                            onChange={(event) =>
                              updateForm(
                                "publishedAt",
                                event.target.value ? new Date(event.target.value).toISOString() : ""
                              )
                            }
                            className={`h-10 ${SOFT_SELECT_CLASS}`}
                          />
                          <p className="mt-1.5 text-[11px] leading-relaxed text-[#615D59]">
                            발행 상태로 저장되지만 이 시각 전까지 공개 화면에 보이지 않습니다.
                          </p>
                        </div>
                      ) : form.status === "published" ? (
                        <p className="mt-2 text-[11px] leading-relaxed text-[#615D59]">
                          이미 공개된 글입니다. 지금 발행하면 공개일이 현재 시각으로 바뀝니다. 날짜를 유지하려면 ‘저장’을 쓰세요.
                        </p>
                      ) : null}
                    </fieldset>

                    <button
                      type="button"
                      onClick={handlePublish}
                      disabled={
                        isSubmitting ||
                        publishBlockerCount > 0 ||
                        (publishTiming === "schedule" && !form.publishedAt)
                      }
                      className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-[#084734] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {publishButtonLabel}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {notice && (() => {
          const isError = /문제|오류|필수|입력/.test(notice)
          return (
            <div
              role="status"
              className={`flex animate-in items-center justify-between gap-3 border-t px-4 py-2.5 fade-in-0 slide-in-from-top-1 duration-200 sm:px-6 ${
                isError ? "border-[#F2B8B8] bg-[#FCE9E9]" : "border-[#BDEFD8] bg-[#ECFDF5]"
              }`}
            >
              <span className={`inline-flex items-center gap-2 text-[13px] ${isError ? "text-[#8F2C2C]" : "text-[#084734]"}`}>
                {isError ? <X className="h-3.5 w-3.5 shrink-0" /> : <Check className="h-3.5 w-3.5 shrink-0" />}
                {notice}
              </span>
              <button
                type="button"
                aria-label="알림 닫기"
                onClick={() => setNotice("")}
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                  isError ? "text-[#8F2C2C] hover:bg-[#F2B8B8]/40" : "text-[#084734] hover:bg-[#BDEFD8]/50"
                }`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })()}
      </header>

      {/* ── Document layout: 왼쪽 목차 레일 + 가운데 한 칼럼(대표 이미지 → 제목 → 속성 표 → 본문) ── */}
      <div className="flex gap-8 px-4 pb-24 pt-8 sm:px-6">
        <nav aria-label="목차" className="hidden w-[200px] shrink-0 xl:block">
          <div className="sticky top-[calc(var(--editor-header-h)+32px)] space-y-4">
            <div>
              <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#615D59]">목차</p>
              {headings.length === 0 ? (
                <p className="text-[12px] leading-5 text-[#615D59]">
                  ## 소제목을 추가하면 목차가 생깁니다. 상세 페이지 사이드바에도 같은 목차가 나옵니다.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {headings.map((heading) => (
                    <li
                      key={heading.id}
                      className={`text-[12px] leading-5 ${
                        heading.level === 3 ? "pl-3 text-[#615D59]" : "font-medium text-[#31302E]"
                      }`}
                    >
                      {heading.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-[#e8e8e4] pt-3 text-[12px] leading-6 text-[#615D59]">
              <p>{contentCharacterCount.toLocaleString("ko-KR")}자 · {computedReadTime}</p>
              <p>SEO {seoAnalysis.score} · {seoAnalysis.scoreLabel}</p>
            </div>
          </div>
        </nav>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-[760px]">

            {/* 대표 이미지 */}
            <section aria-label="대표 이미지" className="mb-7">
              {coverPreviewUrl ? (
                <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-[#f0f0ec]">
                  <Image
                    src={coverPreviewUrl}
                    alt={form.heroImageAlt || "대표 이미지 미리보기"}
                    fill
                    className="object-cover"
                    sizes="(min-width: 768px) 760px, 100vw"
                    unoptimized
                  />
                  <div className="absolute right-3 top-3 flex items-center gap-1.5">
                    <label className="relative inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-white/95 px-3 text-[12px] font-semibold text-[#084734] shadow-sm transition-colors focus-within:ring-2 focus-within:ring-[#084734] hover:bg-white">
                      {uploadingField ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      바꾸기
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        disabled={uploadingField !== null}
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (file) void handleImageUpload("heroImageUrl", file)
                          event.target.value = ""
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={removeCoverImage}
                      className="inline-flex min-h-9 items-center justify-center rounded-md bg-white/95 px-3 text-[12px] font-medium text-[#615D59] shadow-sm transition-colors hover:bg-[#FCE9E9] hover:text-[#8F2C2C]"
                    >
                      제거
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor="blog-cover-upload"
                  className="flex min-h-16 cursor-pointer flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl border border-dashed border-[#D5D2CB] bg-[#FAFAF8] px-4 py-3 text-center text-[13px] text-[#615D59] transition-colors focus-within:border-[#084734] hover:border-[#084734] hover:text-[#084734]"
                >
                  {uploadingField ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                  <span className="font-medium">대표 이미지 추가</span>
                  <span className="text-[12px]">상세 16:10 · 추천 4:3 · 목록 16:11로 자동 크롭 · JPG·PNG·WebP·GIF 최대 5MB</span>
                  <input
                    id="blog-cover-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    disabled={uploadingField !== null}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void handleImageUpload("heroImageUrl", file)
                      event.target.value = ""
                    }}
                  />
                </label>
              )}
            </section>

            {/* 제목 */}
            <label htmlFor="title" className="sr-only">제목</label>
            <textarea
              id="title"
              rows={1}
              value={form.title}
              onChange={(event) => {
                const nextTitle = event.target.value.replace(/\n/g, " ")
                updateEditor((snapshot) => ({
                  ...snapshot,
                  form: {
                    ...snapshot.form,
                    title: nextTitle,
                    seoTitle: snapshot.form.seoTitle || nextTitle,
                    slug: snapshot.slugEdited ? snapshot.form.slug : slugify(nextTitle),
                  },
                }))
              }}
              onKeyDown={(event) => {
                // 제목은 한 줄이다. 한글 IME 조합 중 Enter는 조합 확정이므로 건드리지 않는다.
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return
                event.preventDefault()
                document.getElementById("excerpt")?.focus()
              }}
              placeholder="제목 없음"
              aria-invalid={invalid.title || undefined}
              aria-describedby="title-meta"
              className={`block w-full resize-none rounded-md border-0 bg-transparent px-0 text-[30px] font-bold leading-[1.3] tracking-[-0.03em] text-[#111110] outline-none [field-sizing:content] placeholder:text-[#A39E98] sm:text-[40px] ${
                invalid.title ? "bg-[#FCE9E9] px-2" : ""
              }`}
            />
            <p
              id="title-meta"
              className={`mt-2 text-[12px] ${
                invalid.title
                  ? "text-[#8F2C2C]"
                  : form.title.length > 60
                  ? "text-[#7A520F]"
                  : "text-[#615D59]"
              }`}
            >
              {invalid.title
                ? "발행하려면 제목이 필요합니다."
                : `${form.title.length} / 60 · 검색과 공유 카드에 노출됩니다`}
            </p>

            {/* 글 속성 */}
            <section aria-label="글 속성" className="@container mt-6 border-y border-[#F0F0EC] py-2">
              <PropertyRow
                label="카테고리"
                htmlFor="category"
                required
                error={invalid.category ? "발행하려면 카테고리가 필요합니다." : undefined}
              >
                <select
                  id="category"
                  value={form.category}
                  onChange={(event) => updateForm("category", event.target.value)}
                  aria-invalid={invalid.category || undefined}
                  aria-describedby={invalid.category ? "category-error" : undefined}
                  className={`${PROP_INPUT_CLASS} ${invalid.category ? PROP_INPUT_INVALID_CLASS : ""}`}
                >
                  {CATEGORIES.filter((c) => c !== "전체").map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </PropertyRow>

              <PropertyRow
                label="요약"
                htmlFor="excerpt"
                required
                error={invalid.excerpt ? "발행하려면 요약이 필요합니다." : undefined}
                hint={`${form.excerpt.length} / 160 · 목록 카드와 검색 설명의 기본값으로 쓰입니다`}
              >
                <textarea
                  id="excerpt"
                  rows={2}
                  value={form.excerpt}
                  onChange={(event) => updateForm("excerpt", event.target.value)}
                  placeholder="글을 읽기 전에 핵심 메시지를 한 번에 파악할 수 있게 적어주세요"
                  aria-invalid={invalid.excerpt || undefined}
                  aria-describedby={invalid.excerpt ? "excerpt-error" : undefined}
                  className={`resize-none leading-relaxed [field-sizing:content] ${PROP_INPUT_CLASS} ${
                    invalid.excerpt ? PROP_INPUT_INVALID_CLASS : ""
                  }`}
                />
              </PropertyRow>

              <PropertyRow
                label="태그"
                htmlFor="tags"
                hint={tagKeywords.length > 0 ? undefined : "쉼표로 구분 · SEO 체크와 목록 필터에 바로 반영됩니다"}
              >
                <input
                  id="tags"
                  value={tagsInput}
                  onChange={(event) => updateTagsInput(event.target.value)}
                  placeholder="학원 운영, 상담 전환"
                  className={PROP_INPUT_CLASS}
                />
                {tagKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-2 pt-1">
                    {tagKeywords.slice(0, 8).map((tag) => (
                      <span key={tag} className="rounded bg-[#ECFDF5] px-2 py-0.5 text-[12px] font-semibold text-[#084734]">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </PropertyRow>

              <PropertyRow label="URL" htmlFor="slug">
                <div
                  className={`flex items-center rounded-md border transition-colors focus-within:border-[#084734] focus-within:bg-white ${
                    slugConflictPost ? "border-[#F2B8B8] bg-[#FCE9E9]" : "border-transparent hover:bg-[#F6F5F4]"
                  }`}
                >
                  <span className="shrink-0 pl-2 text-[14px] text-[#615D59]">/blog/</span>
                  <input
                    id="slug"
                    value={form.slug}
                    onChange={(event) => {
                      updateEditor((snapshot) => ({
                        ...snapshot,
                        slugEdited: true,
                        form: { ...snapshot.form, slug: slugify(event.target.value) },
                      }))
                    }}
                    placeholder="제목에서 자동 생성"
                    aria-invalid={slugConflictPost ? true : undefined}
                    aria-describedby={slugConflictPost ? "slug-error" : undefined}
                    className="w-full min-w-0 bg-transparent py-1.5 pr-2 text-[14px] text-[#111110] outline-none placeholder:text-[#A39E98]"
                  />
                </div>
                {slugConflictPost && (
                  <p id="slug-error" className="px-2 pt-1 text-[12px] text-[#8F2C2C]">
                    이미 「{slugConflictPost.title}」에서 쓰는 주소입니다.
                  </p>
                )}
                {slugConflictPost && suggestedSlug && (
                  <button
                    type="button"
                    onClick={() =>
                      updateEditor((snapshot) => ({
                        ...snapshot,
                        slugEdited: true,
                        form: { ...snapshot.form, slug: suggestedSlug },
                      }))
                    }
                    className="ml-2 mt-1 inline-flex min-h-8 items-center rounded-md border border-[#BDEFD8] bg-white px-2.5 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5]"
                  >
                    {suggestedSlug}로 바꾸기
                  </button>
                )}
              </PropertyRow>

              <PropertyRow label="작성자" htmlFor="author">
                <div className="grid grid-cols-2 gap-1">
                  <input
                    id="author"
                    value={form.author}
                    onChange={(event) => updateForm("author", event.target.value)}
                    placeholder="이름"
                    className={PROP_INPUT_CLASS}
                  />
                  <input
                    aria-label="작성자 역할"
                    value={form.authorRole}
                    onChange={(event) => updateForm("authorRole", event.target.value)}
                    placeholder="역할 / 직책"
                    className={PROP_INPUT_CLASS}
                  />
                </div>
              </PropertyRow>

              <PropertyRow label="하단 CTA" htmlFor="cta-button-label">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1">
                  <input
                    id="cta-button-label"
                    value={form.cta.buttonLabel}
                    onChange={(event) => updateCta("buttonLabel", event.target.value)}
                    placeholder={DEFAULT_BLOG_CTA.buttonLabel}
                    className={PROP_INPUT_CLASS}
                  />
                  <input
                    aria-label="하단 CTA 이동 경로"
                    value={form.cta.buttonHref}
                    onChange={(event) => updateCta("buttonHref", event.target.value)}
                    placeholder={DEFAULT_BLOG_CTA.buttonHref}
                    className={PROP_INPUT_CLASS}
                  />
                </div>
              </PropertyRow>

              <button
                ref={settingsTriggerRef}
                type="button"
                onClick={() => setShowSettings(true)}
                aria-haspopup="dialog"
                aria-expanded={showSettings}
                aria-controls="blog-settings-panel"
                className="mt-1 inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-left text-[12px] font-medium text-[#31302E] transition-colors hover:bg-[#F6F5F4] hover:text-[#111110]"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-[#084734]" />
                상세 설정
                <span className="font-normal text-[#615D59]">
                  · 상태 · SEO {seoAnalysis.score} · 리드 마그넷 · 추천 글 · 레이아웃 · 발행일 · 이미지
                </span>
              </button>
            </section>

            {/* 새 글 시작 안내 — 기본 본문 그대로일 때만 */}
            {showStartPanel && (
              <section aria-labelledby="blog-start-heading" className="mt-8 rounded-xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id="blog-start-heading" className="text-[14px] font-semibold text-[#111110]">어떻게 시작할까요?</h2>
                    <p className="mt-0.5 text-[12px] text-[#615D59]">
                      템플릿을 고르거나 AI 초안으로 시작하세요. 아래 기본 구조에 바로 써도 됩니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStartPanelDismissed(true)}
                    aria-label="시작 안내 닫기"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#111110]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {DEFAULT_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => {
                        applyTemplate(template)
                        setStartPanelDismissed(true)
                      }}
                      className="flex min-h-[88px] flex-col items-start gap-1 rounded-lg border border-[#e8e8e4] bg-white p-3 text-left transition-colors hover:border-[#BDEFD8] hover:bg-[#ECFDF5]"
                    >
                      <span className="text-[13px] font-semibold text-[#111110]">{template.name}</span>
                      <span className="line-clamp-2 text-[11px] leading-relaxed text-[#615D59]">
                        {template.data.category} · {template.data.contentMarkdown.replace(/#{1,6}\s|[*_`>|-]/g, "").slice(0, 60)}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setTemplateTab("load"); setShowTemplateModal(true) }}
                    className="flex min-h-[88px] flex-col items-start gap-1 rounded-lg border border-dashed border-[#D5D2CB] bg-[#FAFAF8] p-3 text-left transition-colors hover:border-[#084734]"
                  >
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#111110]">
                      <LayoutTemplate className="h-3.5 w-3.5 text-[#084734]" />
                      내 템플릿
                    </span>
                    <span className="text-[11px] leading-relaxed text-[#615D59]">
                      {templates.length > 0 ? `저장한 템플릿 ${templates.length}개 보기` : "지금 글을 템플릿으로 저장하고 다시 쓰기"}
                    </span>
                  </button>
                </div>
                <form
                  className="mt-4 rounded-lg bg-[#F6F5F4] p-3 sm:p-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (!draftInput.topic.trim() || isAiBusy) return
                    void handleAiAction("draft", { ...draftInput })
                  }}
                >
                  <p className="mb-2 text-[13px] font-semibold text-[#111110]">AI 초안으로 시작</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-[999_1_240px]">
                      <label htmlFor="start-draft-topic" className="mb-1 block text-[12px] text-[#615D59]">주제</label>
                      <input
                        id="start-draft-topic"
                        type="text"
                        value={draftInput.topic}
                        onChange={(event) => setDraftInput((prev) => ({ ...prev, topic: event.target.value }))}
                        placeholder="예: 학원 운영 효율화 방법, 학부모 소통 노하우"
                        className={`h-10 px-3 ${SOFT_SELECT_CLASS}`}
                      />
                    </div>
                    <div className="min-w-0 flex-[1_1_120px]">
                      <label htmlFor="start-draft-tone" className="mb-1 block text-[12px] text-[#615D59]">톤</label>
                      <select
                        id="start-draft-tone"
                        value={draftInput.tone}
                        onChange={(event) => setDraftInput((prev) => ({ ...prev, tone: event.target.value }))}
                        className={`h-10 ${SOFT_SELECT_CLASS}`}
                      >
                        <option value="전문적">전문적</option>
                        <option value="친근한">친근한</option>
                        <option value="스토리텔링">스토리텔링</option>
                        <option value="설득형">설득형</option>
                        <option value="정보형">정보형</option>
                      </select>
                    </div>
                    <div className="min-w-0 flex-[1_1_140px]">
                      <label htmlFor="start-draft-length" className="mb-1 block text-[12px] text-[#615D59]">분량</label>
                      <select
                        id="start-draft-length"
                        value={draftInput.length}
                        onChange={(event) => setDraftInput((prev) => ({ ...prev, length: event.target.value }))}
                        className={`h-10 ${SOFT_SELECT_CLASS}`}
                      >
                        <option value="short">짧게 (~500자)</option>
                        <option value="medium">보통 (~1200자)</option>
                        <option value="long">길게 (~2500자)</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={!draftInput.topic.trim() || isAiBusy}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-[#084734] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {aiState?.action === "draft" && isAiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      초안 만들기
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-[#615D59]">
                    결과를 창에서 확인한 뒤 ‘에디터에 적용’을 눌러야 본문에 들어갑니다.
                  </p>
                </form>
              </section>
            )}

            {/* 본문 */}
            <section aria-label="본문" className="mt-8">
              <div
                role="toolbar"
                aria-label="본문 서식"
                className="sticky top-[calc(var(--editor-header-h)+4rem)] z-20 -mx-2 mb-3 lg:top-[var(--editor-header-h)] flex flex-wrap items-center gap-1.5 bg-[#FAFAF8] px-2 py-2"
              >
                <ToolbarButton onClick={() => editorRef.current?.setHeading(2)}>H2</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.setHeading(3)}>H3</ToolbarButton>
                <span className="mx-0.5 h-4 w-px bg-[#e8e8e4]" aria-hidden="true" />
                <ToolbarButton onClick={() => editorRef.current?.toggleBold()} icon={<Type className="h-3 w-3" />}>굵게</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.toggleItalic()} icon={<Italic className="h-3 w-3" />}>기울이기</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.toggleHighlight()} icon={<Highlighter className="h-3 w-3" />}>강조색</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.wrapBrandColor()} icon={<Sparkles className="h-3 w-3" />}>브랜드색</ToolbarButton>
                <span className="mx-0.5 h-4 w-px bg-[#e8e8e4]" aria-hidden="true" />
                <ToolbarButton onClick={() => editorRef.current?.toggleBlockquote()} icon={<Quote className="h-3 w-3" />}>인용</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.toggleBulletList()} icon={<List className="h-3 w-3" />}>리스트</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.toggleOrderedList()} icon={<ListOrdered className="h-3 w-3" />}>번호</ToolbarButton>
                <span className="mx-0.5 h-4 w-px bg-[#e8e8e4]" aria-hidden="true" />
                <ToolbarButton onClick={() => editorRef.current?.insertLink()} icon={<Link2 className="h-3 w-3" />}>링크</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.insertImage()} icon={<ImageIcon className="h-3 w-3" />}>이미지</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.insertDivider()} icon={<Minus className="h-3 w-3" />}>구분선</ToolbarButton>
                <button
                  type="button"
                  onClick={() => setShowAiTools((open) => !open)}
                  aria-expanded={showAiTools}
                  aria-controls="blog-ai-tools"
                  className={`ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    showAiTools
                      ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                      : "border-[#e8e8e4] bg-white text-[#31302E] hover:border-[#084734]/30"
                  }`}
                >
                  <Wand2 className="h-3 w-3" />
                  AI 도구
                </button>
              </div>

              {showAiTools && (
                <div id="blog-ai-tools" className="mb-4 grid gap-4 rounded-xl border border-[#e8e8e4] bg-white p-4 md:grid-cols-2">
                  <form
                    className="space-y-2.5"
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (!draftInput.topic.trim() || isAiBusy) return
                      void handleAiAction("draft", { ...draftInput })
                    }}
                  >
                    <p className="text-[13px] font-semibold text-[#111110]">초안 생성</p>
                    <div>
                      <label htmlFor="ai-draft-topic" className="mb-1 block text-[12px] text-[#615D59]">주제</label>
                      <input
                        id="ai-draft-topic"
                        type="text"
                        value={draftInput.topic}
                        onChange={(event) => setDraftInput((prev) => ({ ...prev, topic: event.target.value }))}
                        placeholder="예: 학원 운영 효율화 방법, 학부모 소통 노하우…"
                        className={`h-10 px-3 ${SOFT_SELECT_CLASS}`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="ai-draft-tone" className="mb-1 block text-[12px] text-[#615D59]">톤</label>
                        <select
                          id="ai-draft-tone"
                          value={draftInput.tone}
                          onChange={(event) => setDraftInput((prev) => ({ ...prev, tone: event.target.value }))}
                          className={`h-10 ${SOFT_SELECT_CLASS}`}
                        >
                          <option value="전문적">전문적</option>
                          <option value="친근한">친근한</option>
                          <option value="스토리텔링">스토리텔링</option>
                          <option value="설득형">설득형</option>
                          <option value="정보형">정보형</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="ai-draft-length" className="mb-1 block text-[12px] text-[#615D59]">분량</label>
                        <select
                          id="ai-draft-length"
                          value={draftInput.length}
                          onChange={(event) => setDraftInput((prev) => ({ ...prev, length: event.target.value }))}
                          className={`h-10 ${SOFT_SELECT_CLASS}`}
                        >
                          <option value="short">짧게 (~500자)</option>
                          <option value="medium">보통 (~1200자)</option>
                          <option value="long">길게 (~2500자)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="ai-draft-reference" className="mb-1 block text-[12px] text-[#615D59]">
                        참고 자료 <span className="text-[#A39E98]">(선택)</span>
                      </label>
                      <textarea
                        id="ai-draft-reference"
                        rows={3}
                        value={draftInput.reference}
                        onChange={(event) => setDraftInput((prev) => ({ ...prev, reference: event.target.value }))}
                        placeholder={"세부 내용, 통계, 링크, 핵심 포인트 등을 붙여넣으세요."}
                        className={`min-h-[84px] px-3 py-2 leading-relaxed ${SOFT_TEXTAREA_CLASS}`}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!draftInput.topic.trim() || isAiBusy}
                      className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-[#084734] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {aiState?.action === "draft" && isAiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      초안 생성
                    </button>
                  </form>

                  <div className="space-y-2">
                    <p className="text-[13px] font-semibold text-[#111110]">이 글로 만들기</p>
                    {(
                      [
                        {
                          action: "optimize" as AiAction,
                          label: "본문 다듬기",
                          desc: "기존 이미지 유지 · 전체 본문에 바로 적용됩니다",
                          icon: <Wand2 className="h-4 w-4 text-[#084734]" />,
                        },
                        {
                          action: "card-news" as AiAction,
                          label: "카드뉴스 생성",
                          desc: "표지 + 6~8장 슬라이드 구성안",
                          icon: <LayoutTemplate className="h-4 w-4 text-[#084734]" />,
                        },
                        {
                          action: "reels" as AiAction,
                          label: "릴스 스크립트",
                          desc: "Hook 3초 + 핵심 포인트 + CTA 자막",
                          icon: <Video className="h-4 w-4 text-[#615D59]" />,
                        },
                      ] as const
                    ).map(({ action, label, desc, icon }) => {
                      const isRunning = aiState?.action === action && isAiBusy
                      const noContent = !form.title && !form.contentMarkdown
                      return (
                        <button
                          key={action}
                          type="button"
                          onClick={() => handleAiAction(action)}
                          disabled={isRunning || noContent}
                          className="flex w-full items-center gap-3 rounded-lg border border-[#e8e8e4] bg-white p-3 text-left transition-colors hover:border-[#084734]/25 hover:bg-[#FAFAF8] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F6F5F4]">
                            {isRunning ? <Loader2 className="h-4 w-4 animate-spin text-[#084734]" /> : icon}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-[#111110]">{label}</span>
                            <span className="block text-[11px] text-[#615D59]">{desc}</span>
                          </span>
                        </button>
                      )
                    })}
                    <p className="text-[11px] leading-relaxed text-[#615D59]">
                      구간만 다듬으려면 본문에서 텍스트를 선택한 뒤 아래 ‘선택 구간 다듬기’를 쓰세요.
                    </p>
                  </div>
                </div>
              )}

              <RichMarkdownEditor
                ref={editorRef}
                value={form.contentMarkdown}
                onChange={(markdown) => updateForm("contentMarkdown", markdown)}
                placeholder="본문을 작성해주세요"
                imageUploadEndpoint="/api/admin/upload"
                onTemplateClick={() => { setTemplateTab("load"); setShowTemplateModal(true) }}
                onAiDraftClick={() => setShowAiTools(true)}
                onSelectionOptimize={(text) => handleAiAction("optimize", undefined, text || undefined)}
              />
              <p className="mt-3 px-1 text-[11px] leading-5 text-[#615D59]">
                문법 · **굵게** · *기울임* · ==강조== · {"{{green:브랜드색}}"} · [링크](url) · ![설명](/images/example.png) · {">"} 인용
              </p>
            </section>
          </div>
        </main>
      </div>

      {/* ── 상세 설정 패널 — 오른쪽에서 열리는 탭형 패널. 글 머리 속성 표에는 자주 쓰는 6개만 둔다. ── */}
      {showSettings && (
        <>
          <button
            type="button"
            aria-label="상세 설정 닫기"
            onClick={closeSettings}
            className="fixed inset-0 z-[65] bg-[#111110]/25 lg:hidden"
          />
          <aside
            id="blog-settings-panel"
            role="dialog"
            aria-labelledby="blog-settings-title"
            className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-[440px] flex-col border-l border-[#e8e8e4] bg-white shadow-[-12px_0_32px_rgba(17,17,16,0.10)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#F0F0EC] px-5 py-3">
              <h2 id="blog-settings-title" className="text-[15px] font-semibold text-[#111110]">상세 설정</h2>
              <button
                type="button"
                onClick={closeSettings}
                aria-label="상세 설정 닫기"
                className="flex h-9 w-9 items-center justify-center rounded-md text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#111110]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div
              role="tablist"
              aria-label="상세 설정 항목"
              className="flex gap-1 overflow-x-auto border-b border-[#F0F0EC] px-3"
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
                event.preventDefault()
                const index = SETTINGS_TABS.findIndex((tab) => tab.id === settingsTab)
                const step = event.key === "ArrowRight" ? 1 : -1
                const next = SETTINGS_TABS[(index + step + SETTINGS_TABS.length) % SETTINGS_TABS.length]
                setSettingsTab(next.id)
                document.getElementById(`settings-tab-${next.id}`)?.focus()
              }}
            >
              {SETTINGS_TABS.map((tab) => {
                const selected = settingsTab === tab.id
                return (
                  <button
                    key={tab.id}
                    id={`settings-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls="blog-settings-tabpanel"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setSettingsTab(tab.id)}
                    className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-[13px] font-semibold transition-colors ${
                      selected
                        ? "text-[#084734] shadow-[inset_0_-2px_0_#084734]"
                        : "text-[#615D59] hover:text-[#111110]"
                    }`}
                  >
                    {tab.label}
                    {tab.id === "seo" && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                          seoAnalysis.score >= 80 ? "bg-[#ECFDF5] text-[#084734]" : "bg-[#FBF1E0] text-[#7A520F]"
                        }`}
                      >
                        {seoAnalysis.score}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div
              id="blog-settings-tabpanel"
              role="tabpanel"
              aria-labelledby={`settings-tab-${settingsTab}`}
              className="@container min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-3"
            >
              {settingsTab === "classify" && (
                <>
              <PropertyRow label="상태" htmlFor="status">
                <select
                  id="status"
                  value={form.status}
                  onChange={(event) => updateForm("status", event.target.value as BlogPostStatus)}
                  className={PROP_INPUT_CLASS}
                >
                  {BLOG_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </PropertyRow>
              <PropertyRow label="목록 노출" htmlFor="featured">
                <label className="flex min-h-9 cursor-pointer items-center gap-2.5 px-2 text-[14px] text-[#31302E]">
                  <input
                    id="featured"
                    type="checkbox"
                    checked={form.featured ?? false}
                    onChange={(event) => updateForm("featured", event.target.checked)}
                    className="h-4 w-4 rounded border-[#d8d8d2] accent-[#084734]"
                  />
                  목록 상단 Featured로 노출
                </label>
              </PropertyRow>
              <PropertyRow label="추천 독자" htmlFor="targetReader">
                <input
                  id="targetReader"
                  value={form.targetReader || ""}
                  onChange={(event) => updateForm("targetReader", event.target.value)}
                  placeholder="예) 상담 전환율을 높이고 싶은 학원 원장"
                  className={PROP_INPUT_CLASS}
                />
              </PropertyRow>
              <PropertyRow label="읽으면 좋은 점" htmlFor="benefit-0" hint="상세 페이지 상단에 노출 · 최대 3개">
                <div className="space-y-0.5">
                  {form.benefitItems.map((benefit, index) => (
                    <input
                      key={index}
                      id={`benefit-${index}`}
                      aria-label={`좋은 점 ${index + 1}`}
                      value={benefit}
                      onChange={(event) => updateBenefit(index, event.target.value)}
                      placeholder={`좋은 점 ${index + 1}`}
                      className={PROP_INPUT_CLASS}
                    />
                  ))}
                </div>
              </PropertyRow>
                </>
              )}
              {settingsTab === "seo" && (
                <>
              <PropertyRow
                label="SEO 제목"
                htmlFor="seoTitle"
                hint={`${form.seoTitle.length} / 60 · 비우면 제목을 씁니다`}
              >
                <input
                  id="seoTitle"
                  value={form.seoTitle}
                  onChange={(event) => updateForm("seoTitle", event.target.value)}
                  placeholder={form.title || "SEO 제목"}
                  className={PROP_INPUT_CLASS}
                />
              </PropertyRow>
              <PropertyRow
                label="메타 설명"
                htmlFor="seoDescription"
                hint={`${form.seoDescription.length} / 160 · 비우면 요약을 씁니다 · 권장 120~160자`}
              >
                <textarea
                  id="seoDescription"
                  rows={2}
                  value={form.seoDescription}
                  onChange={(event) => updateForm("seoDescription", event.target.value)}
                  placeholder={form.excerpt || "검색 결과에 보일 설명"}
                  className={`resize-none leading-relaxed [field-sizing:content] ${PROP_INPUT_CLASS}`}
                />
              </PropertyRow>
              <div className="py-2">
                <div className="min-w-0 space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (form.title) updateForm("seoTitle", form.title.slice(0, 60))
                      if (form.excerpt) updateForm("seoDescription", form.excerpt.slice(0, 160))
                    }}
                    disabled={!form.title && !form.excerpt}
                    className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-[#084734] transition-colors hover:bg-[#ECFDF5] disabled:opacity-40"
                  >
                    <Sparkles className="h-3 w-3" />
                    제목·요약에서 자동완성
                  </button>
                  <div className="rounded-lg border border-[#e8e8e4] bg-white px-4 py-3">
                    <p className="text-[11px] text-[#615D59]">classin.co.kr › blog › {effectiveSlug || "your-slug"}</p>
                    <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-[#084734]">
                      {seoAnalysis.effectiveTitle || "SEO 제목을 입력하세요"}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[#615D59]">
                      {seoAnalysis.effectiveDesc || "메타 설명을 입력하세요. 비우면 요약이 표시됩니다."}
                    </p>
                  </div>
                  <ul>
                    {seoAnalysis.checks.map((check) => (
                      <li key={check.id} className="flex min-h-8 items-center gap-2 text-[12px]">
                        {check.ok ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-[#084734]" aria-label="통과" />
                        ) : (
                          <X className="h-3.5 w-3.5 shrink-0 text-[#B43E3E]" aria-label="미통과" />
                        )}
                        <span className="text-[#31302E]">{check.label}</span>
                        <span className="truncate text-[#615D59]">{check.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
                </>
              )}
              {settingsTab === "convert" && (
                <>
              <PropertyRow
                label="리드 마그넷"
                htmlFor="leadMagnet"
                hint="선택하면 본문 하단에 이메일 수집 블록이 노출되고, 신청자는 해당 마그넷 태그로 구독자 DB에 기록됩니다."
              >
                <select
                  id="leadMagnet"
                  value={form.leadMagnetSlug ?? ""}
                  onChange={(event) => updateForm("leadMagnetSlug", event.target.value)}
                  className={PROP_INPUT_CLASS}
                >
                  <option value="">표시 안 함</option>
                  {leadOptions.map((opt) => (
                    <option key={opt.slug} value={opt.slug}>
                      {opt.title} · {getLeadMagnetGateLabel(opt.gate)} · {getLeadMagnetStatusLabel(opt.status)}
                      {opt.published ? "" : " · 검토 중"}
                    </option>
                  ))}
                </select>
              </PropertyRow>
              <PropertyRow label="CTA 문구" htmlFor="cta-eyebrow">
                <div className="space-y-0.5">
                  <input
                    id="cta-eyebrow"
                    value={form.cta.eyebrow}
                    onChange={(event) => updateCta("eyebrow", event.target.value)}
                    placeholder={`상단 문구 · ${DEFAULT_BLOG_CTA.eyebrow}`}
                    className={PROP_INPUT_CLASS}
                  />
                  <input
                    aria-label="CTA 제목"
                    value={form.cta.title}
                    onChange={(event) => updateCta("title", event.target.value)}
                    placeholder={`제목 · ${DEFAULT_BLOG_CTA.title}`}
                    className={PROP_INPUT_CLASS}
                  />
                  <textarea
                    aria-label="CTA 설명"
                    rows={2}
                    value={form.cta.description}
                    onChange={(event) => updateCta("description", event.target.value)}
                    placeholder={`설명 · ${DEFAULT_BLOG_CTA.description}`}
                    className={`resize-none leading-relaxed [field-sizing:content] ${PROP_INPUT_CLASS}`}
                  />
                </div>
              </PropertyRow>
              <PropertyRow label="추천 글">
                {filteredPosts.length === 0 ? (
                  <p className="px-2 py-1.5 text-[13px] text-[#615D59]">추천할 다른 글이 아직 없습니다.</p>
                ) : (
                  <div className="space-y-0.5">
                    {filteredPosts.slice(0, 8).map((post) => (
                      <label
                        key={post.id}
                        className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-[#F6F5F4]"
                      >
                        <input
                          type="checkbox"
                          checked={form.relatedPostIds.includes(post.id)}
                          onChange={() => toggleRelatedPost(post.id)}
                          className="h-4 w-4 shrink-0 rounded border-[#d8d8d2] accent-[#084734]"
                        />
                        <span className="line-clamp-1 text-[13px] text-[#31302E]">{post.title}</span>
                      </label>
                    ))}
                  </div>
                )}
              </PropertyRow>
                </>
              )}
              {settingsTab === "display" && (
                <>
              <PropertyRow label="레이아웃">
                <div className="flex flex-wrap gap-1.5 px-2 py-1">
                  {(
                    [
                      { value: "standard" as const, label: "기본", desc: "사이드 목차 + 콘텐츠" },
                      { value: "minimal" as const, label: "미니멀", desc: "중앙 정렬 단일 컬럼" },
                    ] as const
                  ).map(({ value, label, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateForm("pageLayout", value)}
                      aria-pressed={form.pageLayout === value}
                      className={`min-h-9 rounded-md border px-3 text-left text-[13px] transition-colors ${
                        form.pageLayout === value
                          ? "border-[#084734] bg-[#ECFDF5] font-semibold text-[#084734]"
                          : "border-[#e8e8e4] bg-white text-[#31302E] hover:border-[#084734]/30"
                      }`}
                    >
                      {label}
                      <span className="ml-1.5 text-[11px] font-normal text-[#615D59]">{desc}</span>
                    </button>
                  ))}
                </div>
              </PropertyRow>
              <PropertyRow
                label="발행일"
                htmlFor="advanced-published-at"
                hint="과거 시각은 공개 화면의 발행일로 쓰이고, 미래 시각은 발행 상태여도 그 시각 전까지 숨깁니다. 발행 창의 ‘지금’은 현재 시각으로 덮어씁니다."
              >
                <div className="flex flex-wrap items-center gap-1">
                  <input
                    id="advanced-published-at"
                    type="datetime-local"
                    value={isoToLocalInput(form.publishedAt)}
                    onChange={(event) =>
                      updateForm(
                        "publishedAt",
                        event.target.value ? new Date(event.target.value).toISOString() : ""
                      )
                    }
                    className={`w-auto ${PROP_INPUT_CLASS}`}
                  />
                  <button
                    type="button"
                    onClick={() => updateForm("publishedAt", new Date().toISOString())}
                    className="inline-flex min-h-8 items-center rounded-md px-2 text-[12px] font-medium text-[#31302E] transition-colors hover:bg-[#F6F5F4]"
                  >
                    지금으로
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!initialPost?.publishedAt) return
                      updateForm("publishedAt", initialPost.publishedAt)
                    }}
                    disabled={!initialPost?.publishedAt}
                    className="inline-flex min-h-8 items-center rounded-md px-2 text-[12px] font-medium text-[#31302E] transition-colors hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    기존 날짜 복원
                  </button>
                  {form.publishedAt ? (
                    <button
                      type="button"
                      onClick={() => updateForm("publishedAt", "")}
                      className="inline-flex min-h-8 items-center rounded-md px-2 text-[12px] font-medium text-[#615D59] transition-colors hover:bg-[#FCE9E9] hover:text-[#8F2C2C]"
                    >
                      비우기
                    </button>
                  ) : null}
                </div>
              </PropertyRow>
              {(["imageUrl", "heroImageUrl"] as const).map((field) => (
                <PropertyRow
                  key={field}
                  label={field === "imageUrl" ? "썸네일 이미지" : "상단 배너 이미지"}
                  htmlFor={`blog-${field}`}
                >
                  <div className="flex items-center gap-1">
                    <input
                      id={`blog-${field}`}
                      value={form[field]}
                      onChange={(event) => updateForm(field, event.target.value)}
                      placeholder="/images/blog/thumb.png"
                      className={PROP_INPUT_CLASS}
                    />
                    <label className="relative inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-medium text-[#615D59] transition-colors focus-within:border-[#084734] hover:bg-[#F6F5F4]">
                      {uploadingField === field ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      업로드
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        disabled={uploadingField !== null}
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (file) void handleImageUpload(field, file)
                          event.target.value = ""
                        }}
                      />
                    </label>
                  </div>
                </PropertyRow>
              ))}
              <PropertyRow label="이미지 설명" htmlFor="thumbnailAlt" hint="비우면 제목으로 채웁니다">
                <div className="grid grid-cols-2 gap-1">
                  <input
                    id="thumbnailAlt"
                    value={form.thumbnailAlt}
                    onChange={(event) => updateForm("thumbnailAlt", event.target.value)}
                    placeholder="썸네일 설명"
                    className={PROP_INPUT_CLASS}
                  />
                  <input
                    aria-label="배너 이미지 설명"
                    value={form.heroImageAlt}
                    onChange={(event) => updateForm("heroImageAlt", event.target.value)}
                    placeholder="배너 설명"
                    className={PROP_INPUT_CLASS}
                  />
                </div>
              </PropertyRow>
              <PropertyRow
                label="작성자 프로필"
                htmlFor="authorAvatarUrl"
                hint={
                  form.authorAvatarUrl && !authorAvatarSrc
                    ? "표시할 수 없는 이미지 URL입니다. 사이트 내부 경로, Supabase Storage, Unsplash 이미지만 쓸 수 있습니다."
                    : undefined
                }
              >
                <div className="flex items-start gap-2">
                  <div className="relative mt-1 h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[#f0f0ec]">
                    {authorAvatarSrc ? (
                      <SafeBlogImage
                        src={authorAvatarSrc}
                        alt={`${form.author || "작성자"} 아바타 미리보기`}
                        fill
                        className="object-cover"
                        sizes="36px"
                        fallbackIndex={initialPost?.id ?? 0}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[13px] font-semibold text-[#084734]">
                        {authorInitial}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <input
                      id="authorAvatarUrl"
                      value={form.authorAvatarUrl || ""}
                      onChange={(event) => updateForm("authorAvatarUrl", event.target.value)}
                      placeholder="아바타 이미지 URL"
                      className={PROP_INPUT_CLASS}
                    />
                    <textarea
                      aria-label="작성자 소개"
                      rows={2}
                      value={form.authorBio}
                      onChange={(event) => updateForm("authorBio", event.target.value)}
                      placeholder="작성자 소개"
                      className={`resize-none leading-relaxed [field-sizing:content] ${PROP_INPUT_CLASS}`}
                    />
                  </div>
                </div>
              </PropertyRow>
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
