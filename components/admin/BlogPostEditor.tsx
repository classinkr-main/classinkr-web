"use client"

import Image from "next/image"
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
  ArrowLeft,
  Check,
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
  Search,
  Sparkles,
  Type,
  Undo2,
  Video,
  Wand2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import RichMarkdownEditor, { type RichMarkdownEditorHandle } from "@/components/admin/RichMarkdownEditor"
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
type AiState = { action: AiAction; status: "loading" | "streaming" | "done" | "error"; result: string; topic?: string; tone?: string; length?: string; reference?: string }
type EditorSnapshot = {
  form: BlogPostInput
  tagsInput: string
  slugEdited: boolean
}

const HISTORY_LIMIT = 50

function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    form: JSON.parse(JSON.stringify(snapshot.form)) as BlogPostInput,
    tagsInput: snapshot.tagsInput,
    slugEdited: snapshot.slugEdited,
  }
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
    pageLayout: "standard",
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
      className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 py-1.5 text-xs font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#1a1a1a]/20 hover:text-[#111110] active:scale-[0.96] active:bg-[#f7f7f5] duration-75"
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
  const editorRef = useRef<RichMarkdownEditorHandle | null>(null)
  const initialForm = initialPost ? { ...initialPost } : createEmptyDraft()

  const [form, setForm] = useState<BlogPostInput>(initialForm)
  const [tagsInput, setTagsInput] = useState(initialForm.tags.join(", "))
  const [draftState, setDraftState] = useState<DraftState>("saved")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState("")
  const [aiState, setAiState] = useState<AiState | null>(null)
  const [draftInput, setDraftInput] = useState({ topic: "", tone: "전문적", length: "medium", reference: "" })
  const [showPreview, setShowPreview] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templates, setTemplates] = useState<BlogTemplate[]>([])
  const [templateTab, setTemplateTab] = useState<"load" | "save">("load")
  const [templateName, setTemplateName] = useState("")
  const [slugEdited, setSlugEdited] = useState(Boolean(initialPost?.slug))
  const formRef = useRef(form)
  const tagsInputRef = useRef(tagsInput)
  const slugEditedRef = useRef(slugEdited)
  const undoStackRef = useRef<EditorSnapshot[]>([])
  const redoStackRef = useRef<EditorSnapshot[]>([])

  const draftStorageKey = `admin-blog-editor-${initialPost?.id ?? "new"}`
  const filteredPosts = allPosts.filter((post) => post.id !== initialPost?.id)
  const computedReadTime = estimateReadTime(form.contentMarkdown)
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
    ]

    const passed = checks.filter((c) => c.ok).length
    const score = Math.round((passed / checks.length) * 100)
    const scoreLabel = score >= 80 ? "좋음" : score >= 50 ? "보통" : "개선 필요"
    const scoreColor = score >= 80 ? "#084734" : score >= 50 ? "#b45309" : "#b91c1c"
    const scoreBg = score >= 80 ? "#f0fdf4" : score >= 50 ? "#fffbeb" : "#fef2f2"
    const scoreBorder = score >= 80 ? "#bbf7d0" : score >= 50 ? "#fde68a" : "#fecaca"

    return { score, checks, scoreLabel, scoreColor, scoreBg, scoreBorder, effectiveTitle, effectiveDesc }
  }, [form, headings])

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
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return
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
  }, [applySnapshot, draftStorageKey])

  useEffect(() => {
    setDraftState("dirty")
    const timer = window.setTimeout(() => {
      setDraftState("saving")
      localStorage.setItem(draftStorageKey, JSON.stringify(form))
      setDraftState("saved")
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
      const url = initialPost ? `/api/admin/blog/${initialPost.id}` : "/api/admin/blog"
      const method = initialPost ? "PUT" : "POST"
      const response = await adminFetch(url, { method, body: JSON.stringify(payload) })
      if (response.status === 401) { startTransition(() => router.replace("/admin/login")); return }
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        setNotice(data?.error || "저장 중 문제가 발생했습니다.")
        return
      }
      const data = (await response.json()) as { post: BlogPost }
      localStorage.removeItem(draftStorageKey)
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

  const handleAiAction = async (action: AiAction, params?: { topic: string; tone: string; length: string; reference?: string }) => {
    setAiState({ action, status: "loading", result: "", ...(params ?? {}) })
    try {
      const res = await adminFetch("/api/admin/blog/ai", {
        method: "POST",
        body: JSON.stringify(
          action === "draft" && params
            ? { action, category: form.category, topic: params.topic, tone: params.tone, length: params.length, reference: params.reference ?? "" }
            : { action, title: form.title, content: form.contentMarkdown, category: form.category }
        ),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "AI 처리 중 오류가 발생했습니다." })) as { error?: string }
        setAiState({ action, status: "error", result: "AI 응답 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." })
        return
      }
      setAiState({ action, status: "streaming", result: "" })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setAiState((prev) => prev ? { ...prev, result: prev.result + chunk } : null)
      }
      setAiState((prev) => prev ? { ...prev, status: "done" } : null)
    } catch {
      setAiState({ action, status: "error", result: "AI 응답 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." })
    }
  }

  const AI_LABELS: Record<AiAction, string> = {
    "card-news": "카드뉴스 생성",
    "reels": "릴스 스크립트",
    "optimize": "블로그 최적화",
    "draft": "초안 생성",
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">

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
                onClick={() => { setShowTemplateModal(false); setTemplateName("") }}
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
                templates.length === 0 ? (
                  <div className="py-12 text-center text-[13px] text-[#1a1a1a]/30">
                    저장된 템플릿이 없습니다
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {templates.map((t) => (
                      <div
                        key={t.id}
                        className="rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[13px] text-[#111110]">{t.name}</p>
                            <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
                              {new Date(t.savedAt).toLocaleDateString("ko-KR")}
                              {t.data.category && ` · ${t.data.category}`}
                            </p>
                            {t.data.contentMarkdown && (
                              <p className="mt-1.5 text-xs text-[#1a1a1a]/40 line-clamp-2">
                                {t.data.contentMarkdown.slice(0, 60)}…
                              </p>
                            )}
                          </div>
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
                                setNotice("템플릿을 불러왔습니다.")
                              }}
                              className="text-[12px] font-medium text-[#084734] hover:text-[#084734]/70 transition-colors"
                            >
                              불러오기
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = templates.filter((item) => item.id !== t.id)
                                setTemplates(next)
                                localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next))
                              }}
                              className="text-[#1a1a1a]/25 hover:text-red-500 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
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
                  aiState.action === "card-news" ? "bg-blue-50" :
                  aiState.action === "reels" ? "bg-purple-50" :
                  aiState.action === "draft" ? "bg-amber-50" : "bg-emerald-50"
                }`}>
                  {aiState.action === "card-news" && <LayoutTemplate className="h-4 w-4 text-blue-500" />}
                  {aiState.action === "reels" && <Video className="h-4 w-4 text-purple-500" />}
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
                  <p className="text-sm">Claude가 분석 중입니다…</p>
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
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                    <X className="h-5 w-5 text-red-400" />
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
                          {form.authorAvatarUrl ? (
                            <Image src={form.authorAvatarUrl} alt={form.author} fill className="object-cover" unoptimized />
                          ) : (
                            <div className="flex h-full items-center justify-center text-lg font-semibold text-[#084734]">
                              {form.author.slice(0, 1)}
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

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-20 border-b border-[#e8e8e4] bg-[#FAFAF8]/95 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="shrink-0">
              <Link href="/admin/blog">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                목록
              </Link>
            </Button>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-[#1a1a1a]/30">
                Blog Editor
              </p>
              <h1 className="truncate text-base font-semibold tracking-[-0.02em] text-[#111110]">
                {mode === "create" ? "새 글 작성" : form.title || "글 수정"}
              </h1>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                draftState === "dirty" ? "border-amber-100 bg-amber-50 text-amber-600" :
                draftState === "saving" ? "border-[#e8e8e4] bg-white text-[#1a1a1a]/40" :
                "border-emerald-100 bg-emerald-50 text-emerald-600"
              }`}>
                {draftState === "dirty" ? "수정됨" : draftState === "saving" ? "저장 중…" : "자동저장됨"}
              </span>
              <span className="rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] text-[#1a1a1a]/40">
                {computedReadTime}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost" size="sm"
              onClick={handleUndo}
              disabled={isSubmitting || undoStackRef.current.length === 0}
              title="되돌리기 (Ctrl/Cmd + Z)"
              className="h-8 w-8 p-0"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={handleRedo}
              disabled={isSubmitting || redoStackRef.current.length === 0}
              title="다시 실행 (Ctrl/Cmd + Shift + Z)"
              className="h-8 w-8 p-0"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowTemplateModal(true)} title="템플릿" className="h-8 w-8 p-0">
              <LayoutTemplate className="h-3.5 w-3.5" />
            </Button>
            <div className="mx-1.5 h-4 w-px bg-[#e8e8e4]" />
            <Button variant="ghost" size="sm" onClick={() => setShowPreview(true)}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              미리보기
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleSubmit()} disabled={isSubmitting}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              저장
            </Button>
            <Button size="sm" onClick={() => handleSubmit("published")} disabled={isSubmitting}
              className="bg-[#084734] hover:bg-[#084734]/90 text-white active:scale-[0.97] transition-all duration-75">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              발행
            </Button>
          </div>
        </div>

        {notice && (() => {
          const isError = /문제|오류|필수|입력/.test(notice)
          return (
            <div className={`flex items-center justify-between border-t px-6 py-2 ${isError ? "border-red-100 bg-red-50" : "border-emerald-100 bg-emerald-50"}`}>
              <span className={`text-[13px] ${isError ? "text-red-700" : "text-emerald-800"}`}>{notice}</span>
              <button type="button" onClick={() => setNotice("")} className={`${isError ? "text-red-400 hover:text-red-700" : "text-emerald-500 hover:text-emerald-800"}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })()}
      </header>

      {/* ── Main layout ── */}
      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_380px]">

        {/* Left: content */}
        <section className="min-w-0 space-y-5">

          {/* 기본 정보 */}
          <div className="rounded-[24px] border border-[#e8e8e4] bg-white p-6 shadow-sm">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="title">제목</Label>
                  <span className={`text-[11px] tabular-nums ${
                    form.title.length > 60 ? "text-red-500" :
                    form.title.length >= 30 ? "text-emerald-600" :
                    "text-[#1a1a1a]/30"
                  }`}>
                    {form.title.length} / 60
                  </span>
                </div>
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
                        slug: snapshot.slugEdited ? snapshot.form.slug : slugify(nextTitle),
                      },
                    }))
                  }}
                  placeholder="독자가 클릭하고 싶어지는 제목을 적어주세요"
                  className="text-[15px]"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="excerpt">한 줄 요약</Label>
                    <span className={`text-[11px] tabular-nums ${
                      form.excerpt.length > 160 ? "text-red-500" :
                      form.excerpt.length >= 80 ? "text-emerald-600" :
                      "text-[#1a1a1a]/30"
                    }`}>
                      {form.excerpt.length} / 160
                    </span>
                  </div>
                  <textarea
                    id="excerpt"
                    rows={3}
                    value={form.excerpt}
                    onChange={(event) => updateForm("excerpt", event.target.value)}
                    placeholder="글을 읽기 전에 핵심 메시지를 한 번에 파악할 수 있도록 적어주세요"
                    className="w-full min-h-[88px] resize-none rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#084734]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">URL 슬러그</Label>
                  <Input
                    id="slug"
                    value={form.slug}
                    onChange={(event) => {
                      updateEditor((snapshot) => ({
                        ...snapshot,
                        slugEdited: true,
                        form: { ...snapshot.form, slug: slugify(event.target.value) },
                      }))
                    }}
                    placeholder="blog-v2-guide"
                  />
                  <p className="text-[11px] text-[#1a1a1a]/35">
                    /blog/{form.slug || "your-slug"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Benefits */}
          <div className="rounded-[24px] border border-[#e8e8e4] bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#111110]">이 글을 읽으면 좋은 점</p>
                <p className="mt-0.5 text-[12px] text-[#1a1a1a]/40">상세 페이지 상단에 노출되는 포인트</p>
              </div>
              <span className="rounded-full bg-[#f5f6f1] px-3 py-1 text-[12px] text-[#084734]">최대 3개</span>
            </div>
            <div className="space-y-2.5">
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
                placeholder="추천 독자: 예) 상담 전환율을 높이고 싶은 학원 원장"
              />
            </div>
          </div>

          {/* Editor */}
          <div className="rounded-[24px] border border-[#e8e8e4] bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#111110]">본문 작성</p>
                <p className="mt-0.5 text-[12px] text-[#1a1a1a]/40">
                  Markdown 기반 · 상세 페이지에 동일하게 렌더링됩니다
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <ToolbarButton onClick={() => editorRef.current?.setHeading(2)}>H2</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.setHeading(3)}>H3</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.toggleBold()} icon={<Type className="h-3 w-3" />}>굵게</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.toggleItalic()} icon={<Italic className="h-3 w-3" />}>기울이기</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.toggleBlockquote()} icon={<Quote className="h-3 w-3" />}>인용</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.toggleBulletList()} icon={<List className="h-3 w-3" />}>리스트</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.toggleOrderedList()} icon={<ListOrdered className="h-3 w-3" />}>번호</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.toggleHighlight()} icon={<Highlighter className="h-3 w-3" />}>강조색</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.wrapBrandColor()} icon={<Sparkles className="h-3 w-3" />}>브랜드색</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.insertLink()} icon={<Link2 className="h-3 w-3" />}>링크</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.insertImage()} icon={<ImageIcon className="h-3 w-3" />}>이미지</ToolbarButton>
                <ToolbarButton onClick={() => editorRef.current?.insertDivider()} icon={<Minus className="h-3 w-3" />}>구분선</ToolbarButton>
              </div>
            </div>

            <Tabs defaultValue="write">
              <TabsList className="mb-4 bg-[#f5f5f2]">
                <TabsTrigger value="write">작성</TabsTrigger>
                <TabsTrigger value="preview">
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  미리보기
                </TabsTrigger>
              </TabsList>

              <TabsContent value="write" className="mt-0">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <RichMarkdownEditor
                    ref={editorRef}
                    value={form.contentMarkdown}
                    onChange={(markdown) => updateForm("contentMarkdown", markdown)}
                    placeholder="본문을 작성해주세요"
                  />
                  <div className="space-y-4 rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4">
                    <div>
                      <p className="text-sm font-semibold text-[#111110]">자동 목차</p>
                      <p className="mt-1 text-[11px] text-[#1a1a1a]/40">
                        H2, H3가 상세 페이지 사이드바에 표시됩니다.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      {headings.length === 0 ? (
                        <p className="text-[12px] text-[#1a1a1a]/30">
                          ## 소제목을 추가하면 목차가 생성됩니다.
                        </p>
                      ) : (
                        headings.map((heading) => (
                          <div
                            key={heading.id}
                            className={`text-[12px] text-[#1a1a1a]/60 ${
                              heading.level === 3 ? "pl-3 text-[#1a1a1a]/40" : "font-medium"
                            }`}
                          >
                            {heading.level === 3 ? "└ " : "· "}
                            {heading.text}
                          </div>
                        ))
                      )}
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5">
                      <p className="text-[12px] font-semibold text-[#084734]">문법 팁</p>
                      <div className="mt-2 space-y-1.5 text-[11px] leading-5 text-[#084734]/75">
                        <p>**굵게** · *기울임* · ==강조==</p>
                        <p>{"{{green:브랜드색}} · [링크](url)"}</p>
                        <p>![설명](이미지URL) · {">"} 인용</p>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="mt-0">
                <div className="rounded-[24px] border border-[#e8e8e4] bg-[#fcfcfb] p-8">
                  <BlogMarkdownRenderer markdown={form.contentMarkdown} />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </section>

        {/* Right: tabbed sidebar */}
        <aside>
          <div className="sticky top-[65px] max-h-[calc(100vh-65px)] overflow-y-auto pb-10">
            <Tabs defaultValue="settings" className="w-full">
              <div className="sticky top-0 z-10 bg-[#FAFAF8] pb-3">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="settings">설정</TabsTrigger>
                  <TabsTrigger value="seo" className="gap-1.5">
                    <Search className="h-3.5 w-3.5" />
                    SEO
                    {seoAnalysis.score > 0 && (
                      <span
                        className="ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                        style={{ backgroundColor: seoAnalysis.scoreBg, color: seoAnalysis.scoreColor }}
                      >
                        {seoAnalysis.score}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="ai" className="gap-1.5">
                    <Wand2 className="h-3.5 w-3.5" />
                    AI
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ── Settings Tab ── */}
              <TabsContent value="settings" className="mt-0 space-y-4">

                {/* 페이지 레이아웃 템플릿 */}
                <div className="rounded-[20px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
                  <div className="mb-3.5 flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#111110]">페이지 레이아웃</p>
                    <button
                      type="button"
                      onClick={() => setShowPreview(true)}
                      className="flex items-center gap-1 text-[12px] text-[#084734] hover:text-[#084734]/70 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      미리보기
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        {
                          value: "standard" as const,
                          label: "기본",
                          desc: "사이드 목차 + 콘텐츠",
                          preview: (
                            <div className="mb-2.5 flex gap-1">
                              <div className="h-10 w-[28%] rounded-md bg-[#f0f0ec]" />
                              <div className="flex h-10 flex-1 flex-col gap-1 rounded-md bg-[#f0f0ec] p-1.5">
                                <div className="h-1.5 w-3/4 rounded bg-[#d8d8d2]" />
                                <div className="h-1.5 w-full rounded bg-[#d8d8d2]" />
                                <div className="h-1.5 w-2/3 rounded bg-[#d8d8d2]" />
                              </div>
                            </div>
                          ),
                        },
                        {
                          value: "minimal" as const,
                          label: "미니멀",
                          desc: "중앙 정렬 단일 컬럼",
                          preview: (
                            <div className="mb-2.5 mx-auto w-3/4 rounded-md bg-[#f0f0ec] p-1.5 flex flex-col gap-1">
                              <div className="h-1.5 w-3/4 rounded bg-[#d8d8d2]" />
                              <div className="h-1.5 w-full rounded bg-[#d8d8d2]" />
                              <div className="h-1.5 w-5/6 rounded bg-[#d8d8d2]" />
                              <div className="h-1.5 w-2/3 rounded bg-[#d8d8d2]" />
                            </div>
                          ),
                        },
                      ] as const
                    ).map(({ value, label, desc, preview }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateForm("pageLayout", value)}
                        className={`rounded-2xl border p-3 text-left transition-colors ${
                          form.pageLayout === value
                            ? "border-[#084734] bg-[#f0f7f4]"
                            : "border-[#e8e8e4] bg-white hover:border-[#084734]/30"
                        }`}
                      >
                        {preview}
                        <p className={`text-[13px] font-semibold ${form.pageLayout === value ? "text-[#084734]" : "text-[#111110]"}`}>{label}</p>
                        <p className="text-[11px] text-[#1a1a1a]/45">{desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 발행 설정 */}
                <div className="rounded-[20px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
                  <p className="mb-3.5 text-sm font-semibold text-[#111110]">발행 설정</p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="status" className="text-[12px]">상태</Label>
                        <select
                          id="status"
                          value={form.status}
                          onChange={(event) => updateForm("status", event.target.value as BlogPostStatus)}
                          className="h-9 w-full rounded-xl border border-[#e8e8e4] bg-white px-3 text-sm outline-none focus:border-[#084734]"
                        >
                          {BLOG_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="category" className="text-[12px]">카테고리</Label>
                        <select
                          id="category"
                          value={form.category}
                          onChange={(event) => updateForm("category", event.target.value)}
                          className="h-9 w-full rounded-xl border border-[#e8e8e4] bg-white px-3 text-sm outline-none focus:border-[#084734]"
                        >
                          {CATEGORIES.filter((c) => c !== "전체").map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="tags" className="text-[12px]">태그 (쉼표로 구분)</Label>
                      <Input
                        id="tags"
                        value={tagsInput}
                        onChange={(event) => {
                          const parsed = parseTags(event.target.value)
                          updateEditor((snapshot) => ({
                            ...snapshot,
                            tagsInput: event.target.value,
                            form: { ...snapshot.form, tags: parsed, tag: parsed[0] || "" },
                          }))
                        }}
                        placeholder="Deep Dive, Guide, New Feature"
                      />
                    </div>
                    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[#1a1a1a]/65">
                      <input
                        type="checkbox"
                        checked={form.featured ?? false}
                        onChange={(event) => updateForm("featured", event.target.checked)}
                        className="h-4 w-4 rounded border-[#d8d8d2] accent-[#084734]"
                      />
                      목록 상단 Featured로 노출
                    </label>
                  </div>
                </div>

                {/* 비주얼 */}
                <div className="rounded-[20px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
                  <p className="mb-3.5 text-sm font-semibold text-[#111110]">비주얼</p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-[12px]">썸네일 이미지 URL</Label>
                      <Input
                        value={form.imageUrl}
                        onChange={(event) => updateForm("imageUrl", event.target.value)}
                        placeholder="/images/blog/thumb.png"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[12px]">상단 배너 이미지 URL</Label>
                      <Input
                        value={form.heroImageUrl}
                        onChange={(event) => updateForm("heroImageUrl", event.target.value)}
                        placeholder="/images/blog/hero.png"
                      />
                    </div>
                    {(form.heroImageUrl || form.imageUrl) && (
                      <div className="overflow-hidden rounded-xl border border-[#e8e8e4]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={form.heroImageUrl || form.imageUrl}
                          alt="미리보기"
                          className="aspect-[16/9] w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-[12px]">썸네일 alt</Label>
                        <Input
                          value={form.thumbnailAlt}
                          onChange={(event) => updateForm("thumbnailAlt", event.target.value)}
                          placeholder="이미지 설명"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[12px]">배너 alt</Label>
                        <Input
                          value={form.heroImageAlt}
                          onChange={(event) => updateForm("heroImageAlt", event.target.value)}
                          placeholder="이미지 설명"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 작성자 */}
                <div className="rounded-[20px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
                  <p className="mb-3.5 text-sm font-semibold text-[#111110]">작성자</p>
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={form.author}
                        onChange={(event) => updateForm("author", event.target.value)}
                        placeholder="이름"
                      />
                      <Input
                        value={form.authorRole}
                        onChange={(event) => updateForm("authorRole", event.target.value)}
                        placeholder="역할 / 직책"
                      />
                    </div>
                    <Input
                      value={form.authorAvatarUrl || ""}
                      onChange={(event) => updateForm("authorAvatarUrl", event.target.value)}
                      placeholder="아바타 이미지 URL"
                    />
                    <textarea
                      rows={3}
                      value={form.authorBio}
                      onChange={(event) => updateForm("authorBio", event.target.value)}
                      placeholder="작성자 소개"
                      className="w-full min-h-[80px] resize-none rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#084734]"
                    />
                  </div>
                </div>

                {/* 추천 글 */}
                <div className="rounded-[20px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
                  <p className="mb-3.5 text-sm font-semibold text-[#111110]">추천 글</p>
                  <div className="space-y-1.5">
                    {filteredPosts.length === 0 ? (
                      <p className="text-[12px] text-[#1a1a1a]/35">추천할 다른 글이 아직 없습니다.</p>
                    ) : (
                      filteredPosts.slice(0, 8).map((post) => (
                        <label
                          key={post.id}
                          className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[#f0f0ec] px-3 py-2.5 transition-colors hover:border-[#e0e0da] hover:bg-[#fafafa]"
                        >
                          <input
                            type="checkbox"
                            checked={form.relatedPostIds.includes(post.id)}
                            onChange={() => toggleRelatedPost(post.id)}
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d2] accent-[#084734]"
                          />
                          <span className="line-clamp-2 text-[13px] text-[#1a1a1a]/65">{post.title}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* 하단 CTA */}
                <div className="rounded-[20px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
                  <p className="mb-3.5 text-sm font-semibold text-[#111110]">하단 CTA</p>
                  <div className="space-y-2.5">
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
                      rows={3}
                      value={form.cta.description}
                      onChange={(event) => updateCta("description", event.target.value)}
                      placeholder="CTA 설명"
                      className="w-full min-h-[80px] resize-none rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#084734]"
                    />
                    <div className="grid grid-cols-2 gap-2">
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
              </TabsContent>

              {/* ── SEO Tab ── */}
              <TabsContent value="seo" className="mt-0 space-y-4">

                {/* Score card */}
                <div
                  className="rounded-[20px] border p-5 shadow-sm"
                  style={{ borderColor: seoAnalysis.scoreBorder, backgroundColor: seoAnalysis.scoreBg }}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] text-xl font-bold tracking-[-0.02em] tabular-nums"
                      style={{ borderColor: seoAnalysis.scoreColor, color: seoAnalysis.scoreColor }}
                    >
                      {seoAnalysis.score}
                    </div>
                    <div>
                      <p className="text-base font-semibold" style={{ color: seoAnalysis.scoreColor }}>
                        SEO {seoAnalysis.scoreLabel}
                      </p>
                      <p className="text-[13px] text-[#1a1a1a]/50">
                        {seoAnalysis.checks.filter((c) => c.ok).length} / {seoAnalysis.checks.length} 항목 통과
                      </p>
                    </div>
                  </div>
                </div>

                {/* Search previews */}
                <div className="rounded-[20px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
                  <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-[#1a1a1a]/35">
                    검색 결과 미리보기
                  </p>

                  {/* Google */}
                  <div className="mb-4">
                    <div className="mb-2 flex items-center gap-1.5">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      <span className="text-[11px] font-medium text-[#1a1a1a]/40">Google</span>
                    </div>
                    <div className="rounded-xl border border-[#e8e8e4] bg-[#fafafa] px-4 py-3 space-y-0.5">
                      <p className="text-[12px] text-[#202124]/60">
                        classin.co.kr › blog › {form.slug || "your-slug"}
                      </p>
                      <p className="text-[15px] font-medium leading-snug text-[#1a0dab] line-clamp-2">
                        {seoAnalysis.effectiveTitle || "SEO 제목을 입력하세요"}
                      </p>
                      <p className="text-[13px] leading-relaxed text-[#4d5156] line-clamp-3">
                        {seoAnalysis.effectiveDesc || "메타 설명을 입력하세요. 요약문이 없으면 이곳에 설명이 표시됩니다."}
                      </p>
                    </div>
                  </div>

                  {/* Naver */}
                  <div>
                    <div className="mb-2 flex items-center gap-1.5">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
                        <path fill="#03C75A" d="M13.75 12.6L10.12 7H7v10h3.25V11.4L14.88 17H18V7h-3.25z"/>
                      </svg>
                      <span className="text-[11px] font-medium text-[#1a1a1a]/40">Naver</span>
                    </div>
                    <div className="rounded-xl border border-[#e8e8e4] bg-[#fafafa] px-4 py-3 space-y-1">
                      <p className="text-[15px] font-medium leading-snug text-[#1a6edb] line-clamp-2">
                        {seoAnalysis.effectiveTitle || "SEO 제목을 입력하세요"}
                      </p>
                      <p className="text-[13px] leading-relaxed text-[#555] line-clamp-2">
                        {seoAnalysis.effectiveDesc || "메타 설명을 입력하세요."}
                      </p>
                      <p className="text-[12px] text-[#888]">
                        classin.co.kr › blog › {form.slug || "your-slug"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Checklist */}
                <div className="rounded-[20px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
                  <p className="mb-3.5 text-sm font-semibold text-[#111110]">SEO 체크리스트</p>
                  <div className="space-y-3">
                    {seoAnalysis.checks.map((check) => (
                      <div key={check.id} className="flex items-start gap-3 transition-colors duration-100">
                        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          check.ok ? "bg-emerald-100" : "bg-red-50"
                        }`}>
                          {check.ok
                            ? <Check className="h-3 w-3 text-emerald-600" />
                            : <X className="h-3 w-3 text-red-400" />
                          }
                        </div>
                        <div className="min-w-0">
                          <p className={`text-[13px] font-medium ${check.ok ? "text-[#111110]" : "text-[#1a1a1a]/60"}`}>
                            {check.label}
                          </p>
                          <p className="text-[11px] text-[#1a1a1a]/40">{check.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SEO inputs */}
                <div className="rounded-[20px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
                  <p className="mb-3.5 text-sm font-semibold text-[#111110]">SEO 메타 태그</p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[12px]">SEO 제목</Label>
                        <span className={`text-[11px] tabular-nums ${
                          form.seoTitle.length > 60 ? "text-red-500" :
                          form.seoTitle.length >= 30 ? "text-emerald-600" :
                          "text-[#1a1a1a]/30"
                        }`}>
                          {form.seoTitle.length} / 60
                        </span>
                      </div>
                      <Input
                        value={form.seoTitle}
                        onChange={(event) => updateForm("seoTitle", event.target.value)}
                        placeholder={form.title || "SEO 제목 (비워두면 제목으로 대체)"}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[12px]">메타 설명</Label>
                        <span className={`text-[11px] tabular-nums ${
                          form.seoDescription.length > 160 ? "text-red-500" :
                          form.seoDescription.length >= 120 ? "text-emerald-600" :
                          "text-[#1a1a1a]/30"
                        }`}>
                          {form.seoDescription.length} / 160
                        </span>
                      </div>
                      <textarea
                        rows={4}
                        value={form.seoDescription}
                        onChange={(event) => updateForm("seoDescription", event.target.value)}
                        placeholder={form.excerpt || "검색 결과에 보일 설명 (비워두면 요약문으로 대체)"}
                        className="w-full min-h-[100px] resize-none rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#084734]"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ── AI Tab ── */}
              <TabsContent value="ai" className="mt-0 space-y-4">

                {/* 초안 빠른 생성 */}
                <div className="rounded-[20px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
                  <p className="text-sm font-semibold text-[#111110]">초안 빠른 생성</p>
                  <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
                    주제와 스타일을 입력하면 블로그 초안을 처음부터 작성해드립니다.
                  </p>
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="text-[12px] font-medium text-[#1a1a1a]/60">주제</label>
                      <input
                        type="text"
                        placeholder="예: 학원 운영 효율화 방법, 학부모 소통 노하우…"
                        value={draftInput.topic}
                        onChange={(e) => setDraftInput((prev) => ({ ...prev, topic: e.target.value }))}
                        className="mt-1.5 w-full rounded-xl border border-[#e8e8e4] bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[#084734] placeholder:text-[#1a1a1a]/25"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[12px] font-medium text-[#1a1a1a]/60">톤</label>
                        <select
                          value={draftInput.tone}
                          onChange={(e) => setDraftInput((prev) => ({ ...prev, tone: e.target.value }))}
                          className="mt-1.5 w-full rounded-xl border border-[#e8e8e4] bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[#084734] appearance-none"
                        >
                          <option value="전문적">전문적</option>
                          <option value="친근한">친근한</option>
                          <option value="스토리텔링">스토리텔링</option>
                          <option value="설득형">설득형</option>
                          <option value="정보형">정보형</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[12px] font-medium text-[#1a1a1a]/60">분량</label>
                        <select
                          value={draftInput.length}
                          onChange={(e) => setDraftInput((prev) => ({ ...prev, length: e.target.value }))}
                          className="mt-1.5 w-full rounded-xl border border-[#e8e8e4] bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[#084734] appearance-none"
                        >
                          <option value="short">짧게 (~500자)</option>
                          <option value="medium">보통 (~1200자)</option>
                          <option value="long">길게 (~2500자)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[12px] font-medium text-[#1a1a1a]/60">
                        참고 자료
                        <span className="ml-1 font-normal text-[#1a1a1a]/35">(선택)</span>
                      </label>
                      <textarea
                        rows={4}
                        placeholder={"세부 내용, 통계, 링크, 핵심 포인트 등을 자유롭게 붙여넣으세요.\n예) 클래스인 사용 학원 85%가 출석 관리 시간 50% 단축\nhttps://example.com/article"}
                        value={draftInput.reference}
                        onChange={(e) => setDraftInput((prev) => ({ ...prev, reference: e.target.value }))}
                        className="mt-1.5 w-full resize-none rounded-xl border border-[#e8e8e4] bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[#084734] placeholder:text-[#1a1a1a]/25 leading-relaxed"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!draftInput.topic.trim() || (aiState?.action === "draft" && aiState.status !== "done" && aiState.status !== "error")}
                      onClick={() => handleAiAction("draft", { topic: draftInput.topic, tone: draftInput.tone, length: draftInput.length, reference: draftInput.reference })}
                      className="group mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#084734] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#084734]/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {aiState?.action === "draft" && aiState.status !== "done" && aiState.status !== "error"
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Sparkles className="h-4 w-4" />
                      }
                      초안 생성
                    </button>
                  </div>
                </div>

                <div className="rounded-[20px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
                  <p className="text-sm font-semibold text-[#111110]">AI 콘텐츠 변환</p>
                  <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
                    블로그 내용을 다양한 포맷으로 자동 변환합니다.
                  </p>
                  <div className="mt-4 space-y-2.5">

                    {(
                      [
                        {
                          action: "card-news" as AiAction,
                          label: "카드뉴스 생성",
                          desc: "표지 + 6~8장 슬라이드 구성안 자동 생성",
                          icon: <LayoutTemplate className="h-[18px] w-[18px] text-blue-500" />,
                          bg: "bg-blue-50",
                        },
                        {
                          action: "reels" as AiAction,
                          label: "릴스 스크립트",
                          desc: "Hook 3초 + 핵심 포인트 + CTA 자막 생성",
                          icon: <Video className="h-[18px] w-[18px] text-purple-500" />,
                          bg: "bg-purple-50",
                        },
                        {
                          action: "optimize" as AiAction,
                          label: "블로그 최적화",
                          desc: "제목 개선 · SEO 키워드 · 구조 재편 제안",
                          icon: <Wand2 className="h-[18px] w-[18px] text-emerald-600" />,
                          bg: "bg-emerald-50",
                        },
                      ] as const
                    ).map(({ action, label, desc, icon, bg }) => {
                      const isRunning = aiState?.action === action && aiState.status !== "done" && aiState.status !== "error"
                      const noContent = !form.title && !form.contentMarkdown
                      return (
                        <button
                          key={action}
                          type="button"
                          onClick={() => handleAiAction(action)}
                          disabled={isRunning || noContent}
                          className="group w-full rounded-2xl border border-[#e8e8e4] bg-white p-4 text-left transition-colors hover:border-[#084734]/25 hover:bg-[#f9faf8] active:scale-[0.97] duration-75 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg}`}>
                              {isRunning ? <Loader2 className="h-[18px] w-[18px] animate-spin text-[#084734]" /> : icon}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[#111110]">{label}</p>
                              <p className="text-[12px] text-[#1a1a1a]/45">{desc}</p>
                            </div>
                            <Sparkles className="h-4 w-4 shrink-0 text-[#1a1a1a]/20 transition-colors group-hover:text-[#084734]/40" />
                          </div>
                        </button>
                      )
                    })}

                  </div>

                  {(!form.title && !form.contentMarkdown) && (
                    <p className="mt-3 text-center text-[11px] text-[#1a1a1a]/35">
                      제목과 본문을 먼저 작성해주세요.
                    </p>
                  )}
                </div>
              </TabsContent>

            </Tabs>
          </div>
        </aside>
      </div>
    </div>
  )
}
