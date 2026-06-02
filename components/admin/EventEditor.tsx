"use client"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  Eye,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  MapPin,
  Minus,
  Quote,
  Save,
  Sparkles,
  Tag as TagIcon,
  Type,
  Upload,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import RichMarkdownEditor, { type RichMarkdownEditorHandle } from "@/components/admin/RichMarkdownEditor"
import { getAdminToken } from "@/lib/admin-client"
import { extractMarkdownHeadings } from "@/lib/blog-markdown"
import type { PublicEvent, EventCategory, EventPublicationStatus, EventStatus } from "@/lib/types/public-events"
import { EVENT_CATEGORIES } from "@/lib/types/public-events"

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

type StatusOverrideOption = "auto" | EventStatus
type DraftState = "saved" | "saving" | "dirty"
const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024
const EVENT_POSTER_PREVIEWS = [
  { label: "상단 하이라이트", ratio: "7:5", className: "aspect-[7/5]" },
  { label: "목록 썸네일", ratio: "18:11", className: "aspect-[18/11]" },
  { label: "상세 포스터", ratio: "4:5", className: "aspect-[4/5]" },
] as const

interface FormState {
  title: string
  slug: string
  description: string
  category: EventCategory
  tag: string
  startsAt: string
  endsAt: string
  location: string
  ctaLabel: string
  ctaHref: string
  highlight: boolean
  statusOverride: StatusOverrideOption
  publicationStatus: EventPublicationStatus
}

interface EventEditorProps {
  mode?: "create" | "edit"
  event?: PublicEvent
}

const DEFAULT_FORM: FormState = {
  title: "",
  slug: "",
  description: "",
  category: "프로모션",
  tag: "",
  startsAt: "",
  endsAt: "",
  location: "",
  ctaLabel: "자세히 보기",
  ctaHref: "",
  highlight: false,
  statusOverride: "auto",
  publicationStatus: "draft",
}

function toLocalDatetime(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const offsetMs = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16)
}

function localDatetimeToIso(value: string): string {
  if (!value) return ""
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toISOString()
}

function formatKoreanDate(value: string): string {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")}`
}

function adminFetch(url: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAdminToken()}`,
      ...options?.headers,
    },
  })
}

function adminUpload(url: string, formData: FormData) {
  return fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${getAdminToken()}` },
    body: formData,
  })
}

export default function EventEditor({ event, mode }: EventEditorProps) {
  const router = useRouter()
  const editorRef = useRef<RichMarkdownEditorHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isFirstRenderRef = useRef(true)
  const isCreate = mode === "create" || !event

  const [form, setForm] = useState<FormState>({
    title: event?.title ?? DEFAULT_FORM.title,
    slug: event?.slug ?? DEFAULT_FORM.slug,
    description: event?.description ?? DEFAULT_FORM.description,
    category: event?.category ?? DEFAULT_FORM.category,
    tag: event?.tag ?? DEFAULT_FORM.tag,
    startsAt: toLocalDatetime(event?.startsAt ?? null),
    endsAt: toLocalDatetime(event?.endsAt ?? null),
    location: event?.location ?? DEFAULT_FORM.location,
    ctaLabel: event?.ctaLabel ?? DEFAULT_FORM.ctaLabel,
    ctaHref: event?.ctaHref ?? DEFAULT_FORM.ctaHref,
    highlight: event?.highlight ?? DEFAULT_FORM.highlight,
    statusOverride: (event?.statusOverride as StatusOverrideOption | null) ?? DEFAULT_FORM.statusOverride,
    publicationStatus: event?.publicationStatus ?? DEFAULT_FORM.publicationStatus,
  })
  const [content, setContent] = useState(event?.contentMarkdown ?? "")
  const [imagePath, setImagePath] = useState<string | null>(event?.imagePath ?? null)
  const [imagePreview, setImagePreview] = useState<string | null>(event?.imageUrl ?? null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [draftState, setDraftState] = useState<DraftState>(isCreate ? "dirty" : "saved")
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Mark dirty whenever form/content/image changes (skip first render)
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return
    }
    setDraftState("dirty")
  }, [form, content, imageFile, imagePath])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setSaveError("이미지 파일은 5MB 이하만 업로드할 수 있습니다.")
      e.target.value = ""
      return
    }
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview)
    setSaveError(null)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    e.target.value = ""
  }

  function handleRemoveImage() {
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview(null)
    setImagePath(null)
  }

  async function handleSave() {
    if (!form.title || !form.category || !form.startsAt) {
      setSaveError("제목, 카테고리, 시작일시는 필수입니다.")
      return
    }
    setSaving(true)
    setDraftState("saving")
    setSaveError(null)
    try {
      let currentImagePath = imagePath

      if (imageFile) {
        const fd = new FormData()
        fd.append("file", imageFile)
        const uploadRes = await adminUpload("/api/admin/events/upload", fd)
        if (!uploadRes.ok) throw new Error("이미지 업로드 실패")
        const uploadData = (await uploadRes.json()) as { path: string }
        currentImagePath = uploadData.path
        setImagePath(uploadData.path)
        setImageFile(null)
      }

      const payload = {
        title: form.title,
        slug: form.slug.trim() || null,
        description: form.description || null,
        category: form.category,
        tag: form.tag || null,
        startsAt: localDatetimeToIso(form.startsAt),
        endsAt: form.endsAt ? localDatetimeToIso(form.endsAt) : null,
        location: form.location || null,
        ctaLabel: form.ctaLabel || "자세히 보기",
        ctaHref: form.ctaHref || "/contact#contact-form",
        highlight: form.highlight,
        statusOverride: form.statusOverride === "auto" ? null : form.statusOverride,
        publicationStatus: form.publicationStatus,
        contentMarkdown: content || null,
        imagePath: currentImagePath,
      }
      const saveUrl = isCreate ? "/api/admin/events" : `/api/admin/events/${event?.id}`
      const res = await adminFetch(saveUrl, {
        method: isCreate ? "POST" : "PATCH",
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      const savedEvent = (await res.json()) as PublicEvent
      setDraftState("saved")
      setLastSavedAt(new Date())
      if (isCreate) {
        router.replace(`/admin/events/${savedEvent.id}/edit`)
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장 실패")
      setDraftState("dirty")
    } finally {
      setSaving(false)
    }
  }

  const headings = useMemo(() => extractMarkdownHeadings(content || ""), [content])

  // Computed preview status (mirrors lib/repositories/public-events status logic, simplified)
  const previewStatus: EventStatus = (() => {
    if (form.statusOverride !== "auto") return form.statusOverride
    if (!form.startsAt) return "예정"
    const now = new Date()
    const starts = new Date(form.startsAt)
    const ends = form.endsAt ? new Date(form.endsAt) : null
    if (now < starts) return "예정"
    if (ends && now > ends) return "마감"
    return "진행 중"
  })()

  const indicatorClass =
    draftState === "dirty"
      ? "border-amber-100 bg-amber-50 text-amber-600"
      : draftState === "saving"
      ? "border-[#e8e8e4] bg-white text-[#1a1a1a]/40"
      : "border-emerald-100 bg-emerald-50 text-emerald-600"

  const indicatorLabel =
    draftState === "dirty"
      ? "수정됨"
      : draftState === "saving"
      ? "저장 중…"
      : lastSavedAt
      ? `${String(lastSavedAt.getHours()).padStart(2, "0")}:${String(lastSavedAt.getMinutes()).padStart(2, "0")} 저장됨`
      : "저장됨"

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* ── Page Preview Modal ── */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#FAFAF8] overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-[#e8e8e4] bg-white px-6 py-3">
            <div className="flex items-center gap-3">
              <Eye className="h-4 w-4 text-[#084734]" />
              <span className="text-sm font-semibold text-[#111110]">페이지 미리보기</span>
              <span className="rounded-full border border-[#e8e8e4] px-2.5 py-0.5 text-[11px] text-[#1a1a1a]/40">
                /events/{form.slug || event?.slug || "—"}
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

          <div className="min-h-0 flex-1 overflow-y-auto text-[#111110]">
            {/* Hero */}
            <section className="px-6 pb-10 pt-16">
              <div className="mx-auto max-w-[1100px]">
                <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
                  <div>
                    <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]">
                      <span className="rounded-full bg-[#111110] px-3 py-1 font-medium text-white">
                        {form.category}
                      </span>
                      {form.tag && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                          <TagIcon className="h-3 w-3" />
                          {form.tag}
                        </span>
                      )}
                    </div>
                    <h1 className="max-w-2xl text-[2.2rem] font-bold leading-[1.1] tracking-[-0.04em] text-[#111110] md:text-[3.5rem]">
                      {form.title || "제목이 여기에 표시됩니다"}
                    </h1>
                    {form.description && (
                      <p className="mt-5 max-w-xl text-[16px] leading-7 text-[#1a1a1a]/55 md:text-[17px] md:leading-8">
                        {form.description}
                      </p>
                    )}
                    <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[#1a1a1a]/40">
                      {form.startsAt && (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarIcon className="h-4 w-4" />
                          {formatKoreanDate(form.startsAt)}
                          {form.endsAt ? ` ~ ${formatKoreanDate(form.endsAt)}` : ""}
                        </span>
                      )}
                      {form.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-4 w-4" />
                          {form.location}
                        </span>
                      )}
                    </div>
                    {form.ctaHref && previewStatus !== "마감" ? (
                      <span className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#111110] px-6 py-3 text-[14px] font-semibold text-white">
                        {form.ctaLabel || "자세히 보기"}
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    ) : previewStatus === "마감" ? (
                      <span className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#f0f0ec] px-6 py-3 text-[14px] font-semibold text-[#1a1a1a]/40">
                        마감되었습니다
                      </span>
                    ) : null}
                  </div>

                  {imagePreview && (
                    <div className="overflow-hidden rounded-[28px] border border-[#e8e8e4] bg-white shadow-sm">
                      <div className="relative aspect-[4/5] overflow-hidden bg-[#f7f7f4]">
                        <Image
                          src={imagePreview}
                          alt={form.title}
                          fill
                          className="object-contain p-4"
                          sizes="(min-width: 1024px) 420px, 100vw"
                          unoptimized
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Body */}
            <section className="px-6 pb-24">
              <div className="mx-auto max-w-[1100px]">
                {content && (
                  <div className="rounded-[36px] border border-[#e8e8e4] bg-white px-6 py-8 shadow-sm md:px-10 md:py-12">
                    <BlogMarkdownRenderer markdown={content} />
                  </div>
                )}
                {form.ctaHref && previewStatus !== "마감" && (
                  <div className="mt-8 overflow-hidden rounded-[32px] bg-[#111110] p-8 text-white shadow-sm md:p-10">
                    <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-white/35">
                      {form.category}
                    </p>
                    <h2 className="mt-3 text-[1.8rem] font-semibold tracking-[-0.03em] text-white">
                      {form.title || "행사 제목"}
                    </h2>
                    <div className="mt-6">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#111110]">
                        {form.ctaLabel || "자세히 보기"}
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-30 border-b border-[#e8e8e4] bg-[#FAFAF8]/95 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="shrink-0">
              <Link href="/admin/events">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                목록
              </Link>
            </Button>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-[#1a1a1a]/30">
                {isCreate ? "New Event" : "Event Editor"}
              </p>
              <h1 className="truncate text-base font-semibold tracking-[-0.02em] text-[#111110]">
                {form.title || (isCreate ? "새 행사 작성" : "행사 편집")}
              </h1>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${indicatorClass}`}>
                {indicatorLabel}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {!isCreate && event?.slug && (
              <Button variant="ghost" size="sm" asChild className="h-8">
                <Link href={`/events/${event.slug}`} target="_blank">
                  실제 페이지 →
                </Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowPreview(true)}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              미리보기
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-[#084734] text-white hover:bg-[#084734]/90"
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isCreate ? "등록" : "저장"}
            </Button>
          </div>
        </div>
        {saveError && (
          <div className="flex items-center justify-between border-t border-[#F6D5C5] bg-[#FEF3EE] px-6 py-2">
            <span className="text-[13px] text-[#B85C33]">{saveError}</span>
            <button
              type="button"
              onClick={() => setSaveError(null)}
              className="text-[#B85C33] hover:text-[#9A4A27]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </header>

      {/* ── Main 2-column layout ── */}
      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_380px]">

        {/* Left: thumbnail + content */}
        <section className="min-w-0 space-y-5">
          {/* Thumbnail */}
          <div className="rounded-[24px] border border-[#e8e8e4] bg-white p-6 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">섬네일 이미지</h2>
              {imagePreview && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="inline-flex items-center gap-1 text-[12px] text-[#1a1a1a]/35 transition-colors hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                  이미지 제거
                </button>
              )}
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="group relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-[rgba(0,0,0,0.10)] transition-colors hover:border-[#084734]/40"
            >
              {imagePreview ? (
                <div className="relative mx-auto aspect-[4/5] w-full max-w-[380px] bg-[#f7f7f4]">
                  <Image
                    src={imagePreview}
                    alt="섬네일 미리보기"
                    fill
                    className="object-contain p-4"
                    sizes="(min-width: 1024px) 380px, 100vw"
                    unoptimized
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
                    <div className="flex items-center gap-2 rounded-lg bg-white/90 px-4 py-2 text-[13px] font-medium text-[#111110] opacity-0 shadow transition-opacity group-hover:opacity-100">
                      <Upload className="h-4 w-4" />
                      이미지 교체
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-14 text-[#1a1a1a]/30">
                  <ImageIcon className="h-10 w-10" />
                  <div className="text-center">
                    <p className="text-[13px] font-medium text-[#1a1a1a]/50">클릭하여 이미지 업로드</p>
                    <p className="mt-0.5 text-[11px]">JPG, PNG, WebP, GIF · 최대 5MB</p>
                  </div>
                </div>
              )}
            </div>

            {imagePreview && (
              <div className="mt-4 rounded-xl border border-[#e8e8e4] bg-[#fcfcfb] p-3">
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#1a1a1a]/35">
                  공개 화면 포스터 미리보기
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {EVENT_POSTER_PREVIEWS.map((preview) => (
                    <div key={preview.label} className="min-w-0">
                      <div className={`relative overflow-hidden rounded-lg bg-white ring-1 ring-[#e8e8e4] ${preview.className}`}>
                        <Image
                          src={imagePreview}
                          alt={`${preview.label} 미리보기`}
                          fill
                          className="object-contain p-1.5"
                          sizes="(min-width: 1024px) 110px, 33vw"
                          unoptimized
                        />
                      </div>
                      <p className="mt-1 truncate text-[10px] font-medium text-[#1a1a1a]/45">
                        {preview.label}
                      </p>
                      <p className="text-[10px] text-[#1a1a1a]/28">{preview.ratio}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileChange}
              className="hidden"
            />

            {imageFile && (
              <p className="mt-2 text-[12px] text-[#084734]/70">
                {imageFile.name} — 저장 시 업로드됩니다.
              </p>
            )}
          </div>

          {/* Content */}
          <div className="rounded-[24px] border border-[#e8e8e4] bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#111110]">본문 작성</p>
                <p className="mt-0.5 text-[12px] text-[#1a1a1a]/40">
                  Markdown 기반 · 행사 상세 페이지에 동일하게 렌더링됩니다
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
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
                    value={content}
                    onChange={setContent}
                    placeholder="행사 상세 내용을 작성하세요. 일정, 신청 방법, 주의사항 등을 포함할 수 있습니다."
                    imageUploadEndpoint="/api/admin/events/upload"
                  />
                  <div className="space-y-4 rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4">
                    <div>
                      <p className="text-sm font-semibold text-[#111110]">자동 목차</p>
                      <p className="mt-1 text-[11px] text-[#1a1a1a]/40">
                        H2, H3가 행사 상세 페이지 내비게이션에 사용됩니다.
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

                    <div className="h-px bg-[#e8e8e4]" />

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
                <div className="rounded-[20px] border border-[#e8e8e4] bg-[#fcfcfb] p-8">
                  {content ? (
                    <BlogMarkdownRenderer markdown={content} />
                  ) : (
                    <p className="text-[13px] text-[#1a1a1a]/30">본문이 비어 있습니다. 작성 탭에서 내용을 입력해 보세요.</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </section>

        {/* Right: settings sidebar */}
        <aside className="self-start">
          <div className="sticky top-[68px] space-y-5 pb-10">
            {/* Basic info */}
            <div className="rounded-[24px] border border-[#e8e8e4] bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">기본 정보</h2>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-[12px] font-medium text-[#1a1a1a]/50">제목 *</label>
                  <span className={`text-[11px] tabular-nums ${
                    form.title.length > 60 ? "text-[#B85C33]" :
                    form.title.length >= 30 ? "text-emerald-600" :
                    "text-[#1a1a1a]/30"
                  }`}>
                    {form.title.length} / 60
                  </span>
                </div>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="행사 제목"
                  className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">슬러그 (URL)</label>
                <div className="flex items-center gap-1 rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-2 py-1.5 focus-within:border-[#111110]/30">
                  <span className="shrink-0 text-[12px] text-[#1a1a1a]/35">/events/</span>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    placeholder="비워두면 제목 기반으로 자동 생성"
                    className="min-w-0 flex-1 bg-transparent text-[13px] focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-[11px] text-[#1a1a1a]/35">
                  카드 클릭 시 이동하는 상세 페이지 주소입니다. 비워두고 저장하면 자동 생성돼요.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">카테고리 *</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as EventCategory })}
                  className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                >
                  {EVENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">태그</label>
                <input
                  type="text"
                  value={form.tag}
                  onChange={(e) => setForm({ ...form, tag: e.target.value })}
                  placeholder="예: HOT, 한정 100개"
                  className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-[12px] font-medium text-[#1a1a1a]/50">설명 (목록 표시용)</label>
                  <span className={`text-[11px] tabular-nums ${
                    form.description.length > 160 ? "text-[#B85C33]" :
                    form.description.length >= 80 ? "text-emerald-600" :
                    "text-[#1a1a1a]/30"
                  }`}>
                    {form.description.length} / 160
                  </span>
                </div>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="행사 목록 카드에 보여지는 짧은 설명"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
            </div>

            {/* Schedule */}
            <div className="rounded-[24px] border border-[#e8e8e4] bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">일정 · 장소</h2>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">시작일시 *</label>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                  className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">종료일시</label>
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                  className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">장소</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="예: 온라인 (Zoom), COEX 서울"
                  className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
            </div>

            {/* CTA & Status */}
            <div className="rounded-[24px] border border-[#e8e8e4] bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">신청 · 상태</h2>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">신청 버튼 텍스트</label>
                <input
                  type="text"
                  value={form.ctaLabel}
                  onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
                  placeholder="신청하기"
                  className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">신청 URL</label>
                <input
                  type="text"
                  value={form.ctaHref}
                  onChange={(e) => setForm({ ...form, ctaHref: e.target.value })}
                  placeholder="/contact 또는 외부 신청 폼 URL"
                  className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-[#1a1a1a]/35">
                  상세 페이지에서 사용자가 클릭하는 신청 링크입니다.
                </p>
              </div>

              <div className="h-px bg-[#e8e8e4]" />

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">공개 상태</label>
                <select
                  value={form.publicationStatus}
                  onChange={(e) => setForm({ ...form, publicationStatus: e.target.value as EventPublicationStatus })}
                  className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                >
                  <option value="draft">임시저장</option>
                  <option value="published">공개</option>
                </select>
                <p className="mt-1 text-[11px] text-[#1a1a1a]/35">
                  공개로 바꿔 저장해야 /events와 상세 페이지에 노출됩니다.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-[#111110]">대표 노출</p>
                  <p className="text-[11px] text-[#1a1a1a]/35">행사 페이지 상단 hero 영역에 노출됩니다.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.highlight}
                  onClick={() => setForm({ ...form, highlight: !form.highlight })}
                  className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full p-1 transition-colors ${
                    form.highlight ? "bg-emerald-500" : "bg-[#e0e0dc]"
                  }`}
                >
                  <span
                    className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      form.highlight ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">상태</label>
                <select
                  value={form.statusOverride}
                  onChange={(e) => setForm({ ...form, statusOverride: e.target.value as StatusOverrideOption })}
                  className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                >
                  <option value="auto">자동 (날짜 기준)</option>
                  <option value="진행 중">진행 중</option>
                  <option value="예정">예정</option>
                  <option value="마감">마감</option>
                </select>
                <p className="mt-1 text-[11px] text-[#1a1a1a]/35">
                  현재: <span className="font-medium text-[#1a1a1a]/55">{previewStatus}</span>
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
