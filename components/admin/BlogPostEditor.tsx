"use client"

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
type AiAction = "card-news" | "reels" | "optimize"
type AiState = { action: AiAction; status: "loading" | "streaming" | "done" | "error"; result: string }
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
      className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 py-1.5 text-xs font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#111110]/20 hover:text-[#111110]"
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
  const initialForm = initialPost ? { ...initialPost } : createEmptyDraft()

  const [form, setForm] = useState<BlogPostInput>(initialForm)
  const [tagsInput, setTagsInput] = useState(initialForm.tags.join(", "))
  const [draftState, setDraftState] = useState<DraftState>("saved")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState("")
  const [aiState, setAiState] = useState<AiState | null>(null)
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

  const replaceSelection = (
    nextTextFactory: (selected: string) => { text: string; selectionStart: number; selectionEnd: number }
  ) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = form.contentMarkdown.slice(start, end)
    const { text, selectionStart, selectionEnd } = nextTextFactory(selected)
    const nextMarkdown = form.contentMarkdown.slice(0, start) + text + form.contentMarkdown.slice(end)
    updateEditor((snapshot) => ({ ...snapshot, form: { ...snapshot.form, contentMarkdown: nextMarkdown } }))
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
      return { text, selectionStart: prefix.length, selectionEnd: prefix.length + target.length }
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
        selectionEnd: selectionIndex >= 0 ? selectionIndex + target.length : text.length,
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

  const handleAiAction = async (action: AiAction) => {
    setAiState({ action, status: "loading", result: "" })
    try {
      const res = await adminFetch("/api/admin/blog/ai", {
        method: "POST",
        body: JSON.stringify({
          action,
          title: form.title,
          content: form.contentMarkdown,
          category: form.category,
        }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "AI 처리 중 오류가 발생했습니다." })) as { error?: string }
        setAiState({ action, status: "error", result: err.error ?? "AI 처리 중 오류가 발생했습니다." })
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
      setAiState({ action, status: "error", result: "네트워크 오류가 발생했습니다." })
    }
  }

  const AI_LABELS: Record<AiAction, string> = {
    "card-news": "카드뉴스 생성",
    "reels": "릴스 스크립트",
    "optimize": "블로그 최적화",
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">

      {/* ── AI Result Modal ── */}
      {aiState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-2xl flex-col rounded-[28px] border border-[#e8e8e4] bg-white shadow-2xl" style={{ maxHeight: "85vh" }}>
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-[#e8e8e4] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                  aiState.action === "card-news" ? "bg-blue-50" :
                  aiState.action === "reels" ? "bg-purple-50" : "bg-emerald-50"
                }`}>
                  {aiState.action === "card-news" && <LayoutTemplate className="h-4 w-4 text-blue-500" />}
                  {aiState.action === "reels" && <Video className="h-4 w-4 text-purple-500" />}
                  {aiState.action === "optimize" && <Wand2 className="h-4 w-4 text-emerald-600" />}
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
                <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
                  {aiState.result}
                </div>
              )}
            </div>

            {/* Modal footer */}
            {aiState.status === "done" && (
              <div className="border-t border-[#e8e8e4] px-6 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-[#1a1a1a]/40">결과를 복사해서 활용해보세요.</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAiAction(aiState.action)}
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
              <span className="rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] text-[#1a1a1a]/40">
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
            <div className="mx-1.5 h-4 w-px bg-[#e8e8e4]" />
            <Button variant="outline" size="sm" onClick={() => handleSubmit()} disabled={isSubmitting}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              저장
            </Button>
            <Button size="sm" onClick={() => handleSubmit("published")} disabled={isSubmitting}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              발행
            </Button>
          </div>
        </div>

        {notice && (
          <div className="flex items-center justify-between border-t border-emerald-100 bg-emerald-50 px-6 py-2">
            <span className="text-[13px] text-emerald-800">{notice}</span>
            <button type="button" onClick={() => setNotice("")} className="text-emerald-500 hover:text-emerald-800">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
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
                <ToolbarButton onClick={() => insertBlock("## __TEXT__\n", "소제목")}>H2</ToolbarButton>
                <ToolbarButton onClick={() => insertBlock("### __TEXT__\n", "세부 제목")}>H3</ToolbarButton>
                <ToolbarButton onClick={() => wrapSelection("**", "**", "강조 텍스트")} icon={<Type className="h-3 w-3" />}>굵게</ToolbarButton>
                <ToolbarButton onClick={() => wrapSelection("*", "*", "기울임 텍스트")} icon={<Italic className="h-3 w-3" />}>기울이기</ToolbarButton>
                <ToolbarButton onClick={() => insertBlock("> __TEXT__", "인용할 문장")} icon={<Quote className="h-3 w-3" />}>인용</ToolbarButton>
                <ToolbarButton onClick={() => insertBlock("- __TEXT__", "포인트")} icon={<List className="h-3 w-3" />}>리스트</ToolbarButton>
                <ToolbarButton onClick={() => insertBlock("1. __TEXT__", "순서 설명")} icon={<ListOrdered className="h-3 w-3" />}>번호</ToolbarButton>
                <ToolbarButton onClick={() => wrapSelection("==", "==", "하이라이트")} icon={<Highlighter className="h-3 w-3" />}>강조색</ToolbarButton>
                <ToolbarButton onClick={() => wrapSelection("{{green:", "}}", "브랜드 컬러 텍스트")} icon={<Sparkles className="h-3 w-3" />}>브랜드색</ToolbarButton>
                <ToolbarButton onClick={() => insertBlock("[__TEXT__](https://example.com)", "링크 텍스트")} icon={<Link2 className="h-3 w-3" />}>링크</ToolbarButton>
                <ToolbarButton onClick={() => insertBlock("![이미지 설명](https://example.com/image.jpg)\n", "")} icon={<ImageIcon className="h-3 w-3" />}>이미지</ToolbarButton>
                <ToolbarButton onClick={() => insertBlock("---\n", "")} icon={<Minus className="h-3 w-3" />}>구분선</ToolbarButton>
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
                  <textarea
                    ref={textareaRef}
                    value={form.contentMarkdown}
                    onChange={(event) => updateForm("contentMarkdown", event.target.value)}
                    className="min-h-[600px] resize-y rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] px-5 py-4 font-mono text-[14px] leading-7 text-[#111110] outline-none transition-colors focus:border-[#084734]"
                    placeholder="본문을 작성해주세요"
                    spellCheck={false}
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
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] text-2xl font-bold tabular-nums"
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
                      <div key={check.id} className="flex items-start gap-3">
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
                          className="group w-full rounded-2xl border border-[#e8e8e4] bg-white p-4 text-left transition-colors hover:border-[#084734]/25 hover:bg-[#f9faf8] disabled:cursor-not-allowed disabled:opacity-60"
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
