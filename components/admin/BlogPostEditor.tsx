"use client"

import Link from "next/link"
import { startTransition, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
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
      className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-2 text-xs font-medium text-[#1a1a1a]/65 transition-colors hover:border-[#111110]/15 hover:text-[#111110]"
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

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="sticky top-0 z-20 border-b border-[#e8e8e4] bg-[#FAFAF8]/90 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-8 py-4">
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

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#e8e8e4] bg-white px-3 py-1 text-[12px] text-[#1a1a1a]/45">
              로컬 자동저장: {draftState === "dirty" ? "수정됨" : draftState === "saving" ? "저장 중" : "저장됨"}
            </span>
            <span className="rounded-full border border-[#e8e8e4] bg-white px-3 py-1 text-[12px] text-[#1a1a1a]/45">
              예상 읽기 시간 {computedReadTime}
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

      <div className="grid gap-8 px-8 py-8 lg:grid-cols-[minmax(0,1fr)_340px]">
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
