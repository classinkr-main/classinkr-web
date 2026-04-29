"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Bot, CheckCircle2, CircleAlert, ExternalLink, Save, Trash2, Wand2 } from "lucide-react"

import { adminFetch, adminFetchJson } from "@/lib/admin-client"
import type {
  DocsArticleDetail,
  DocsArticleDifficulty,
  DocsArticleDocType,
  DocsArticleProductArea,
  DocsArticleStatus,
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
  visibility: DocsArticleVisibility
  noindex: boolean
  featured: boolean
  orderIndex: number
  seoTitle: string
  seoDescription: string
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
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
    visibility: article.visibility,
    noindex: article.noindex,
    featured: article.featured,
    orderIndex: article.orderIndex,
    seoTitle: article.seoTitle ?? "",
    seoDescription: article.seoDescription ?? "",
  }
}

export default function DocsArticleEditor({ mode, categories, article }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(() =>
    initialForm(article, categories[0]?.id ?? "guides")
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

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

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }))
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

  function buildPayload(overrides: Partial<FormState> = {}): Record<string, unknown> {
    const next = { ...form, ...overrides }

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
      productArea: next.productArea,
      docType: next.docType,
      difficulty: next.difficulty,
      status: next.status,
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
    return null
  }

  async function save(overrides: Partial<FormState> = {}) {
    setError(null)
    setSavedMessage(null)
    const next = { ...form, ...overrides }
    const validationError = validate(next)
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    try {
      if (mode === "create") {
        const detail = await adminFetchJson<DocsArticleDetail>("/api/admin/docs/articles", {
          method: "POST",
          body: JSON.stringify(buildPayload(overrides)),
        })
        router.replace(`/admin/docs/${detail.id}/edit`)
        router.refresh()
        return
      }

      if (!article) return
      const detail = await adminFetchJson<DocsArticleDetail>(
        `/api/admin/docs/articles/${article.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(buildPayload(overrides)),
        }
      )
      setForm(initialForm(detail, detail.categoryId))
      setSavedMessage(
        overrides.status === "published" ? "게시 완료" : "저장 완료"
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
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/docs"
            className="inline-flex items-center gap-1.5 text-[13px] text-[#1a1a1a]/40 transition-colors hover:text-[#111110]"
          >
            <ArrowLeft className="h-4 w-4" />
            문서 센터
          </Link>
          <span className="text-[#1a1a1a]/15">/</span>
          <span className="line-clamp-1 max-w-[320px] text-[13px] font-medium text-[#111110]">
            {form.title || (mode === "create" ? "새 문서" : "문서 편집")}
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

          {error ? <span className="text-[12px] text-red-600">{error}</span> : null}
          {savedMessage ? (
            <span className="text-[12px] text-emerald-600">{savedMessage}</span>
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
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] font-medium text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "저장 중..." : "저장"}
          </button>

          <button
            type="button"
            onClick={() => void save({ status: "published" })}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#084734] px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#065c41] disabled:opacity-50"
          >
            {form.status === "published" ? "저장 + 스냅샷" : "게시"}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
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
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-6">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">
            기본 정보
          </h2>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
              제목 *
            </label>
            <input
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
                value={form.categoryId}
                onChange={(event) => update("categoryId", event.target.value)}
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
              <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                slug *
              </label>
              <input
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
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              rows={2}
              placeholder="문서 목록과 검색 결과에 노출되는 한 줄 요약"
              className="w-full resize-none rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                문서 유형
              </label>
              <select
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
              <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                제품 영역
              </label>
              <select
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

        <section className="space-y-4 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-6">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">
            검색·챗봇 메타
          </h2>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
              대상 (쉼표 구분)
            </label>
            <input
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
                type="text"
                value={form.tagsCsv}
                onChange={(event) => update("tagsCsv", event.target.value)}
                placeholder="온보딩, 체크리스트"
                className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                검색 키워드 (쉼표 구분)
              </label>
              <input
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
                type="text"
                value={form.symptomsCsv}
                onChange={(event) => update("symptomsCsv", event.target.value)}
                placeholder="검은 화면, 소리 안 나옴"
                className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
              챗봇 요약
            </label>
            <textarea
              value={form.chatbotSummary}
              onChange={(event) => update("chatbotSummary", event.target.value)}
              rows={3}
              placeholder="챗봇이 답변할 때 우선 참고하는 2~3문장 요약"
              className="w-full resize-none rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">
              본문 (Markdown)
            </h2>
            <p className="text-[11px] text-[#1a1a1a]/30">
              ## 헤딩 단위로 청킹됩니다
            </p>
          </div>
          <textarea
            value={form.contentMarkdown}
            onChange={(event) => update("contentMarkdown", event.target.value)}
            rows={24}
            placeholder={"# 제목\n\n설명 단락\n\n## 섹션 1\n\n본문..."}
            className="w-full resize-y rounded-lg border border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] px-3 py-3 font-mono text-[13px] leading-6 focus:border-[#111110]/30 focus:outline-none"
          />
        </section>

        <section className="space-y-4 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-6">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">
            게시 설정
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                상태
              </label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((option) => {
                  const active = form.status === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
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
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                가시성
              </label>
              <select
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
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                정렬 순서 (낮을수록 위)
              </label>
              <input
                type="number"
                value={form.orderIndex}
                onChange={(event) => update("orderIndex", Number(event.target.value) || 0)}
                className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="inline-flex items-center gap-2 text-[13px] text-[#1a1a1a]/60">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(event) => update("featured", event.target.checked)}
                className="h-4 w-4 rounded border-[rgba(0,0,0,0.15)]"
              />
              대표 문서
            </label>
            <label className="inline-flex items-center gap-2 text-[13px] text-[#1a1a1a]/60">
              <input
                type="checkbox"
                checked={form.noindex}
                onChange={(event) => update("noindex", event.target.checked)}
                className="h-4 w-4 rounded border-[rgba(0,0,0,0.15)]"
              />
              검색 엔진 색인 제외 (noindex)
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                SEO 제목
              </label>
              <input
                type="text"
                value={form.seoTitle}
                onChange={(event) => update("seoTitle", event.target.value)}
                placeholder="기본: 제목 | ClassIn 가이드"
                className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                SEO 설명
              </label>
              <input
                type="text"
                value={form.seoDescription}
                onChange={(event) => update("seoDescription", event.target.value)}
                placeholder="기본: 설명 필드"
                className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
              />
            </div>
          </div>

          {mode === "edit" && article ? (
            <div className="grid gap-3 rounded-xl bg-[#FAFAF8] px-4 py-3 text-[12px] text-[#1a1a1a]/45 sm:grid-cols-3">
              <span>
                게시일: {article.publishedAt ? new Date(article.publishedAt).toLocaleString("ko-KR") : "-"}
              </span>
              <span>
                최근 검수: {article.lastReviewedAt ? new Date(article.lastReviewedAt).toLocaleString("ko-KR") : "-"}
              </span>
              <span>
                업데이트: {new Date(article.updatedAt).toLocaleString("ko-KR")}
              </span>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
