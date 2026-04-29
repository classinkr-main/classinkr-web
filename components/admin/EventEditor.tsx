"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Bold,
  Calendar as CalendarIcon,
  Eye,
  Heading2,
  Heading3,
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
  Tag as TagIcon,
  Upload,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import RichMarkdownEditor, { type RichMarkdownEditorHandle } from "@/components/admin/RichMarkdownEditor"
import { getAdminToken } from "@/lib/admin-client"
import type { PublicEvent, EventCategory, EventStatus } from "@/lib/types/public-events"
import { EVENT_CATEGORIES } from "@/lib/types/public-events"

type StatusOverrideOption = "auto" | EventStatus
type DraftState = "saved" | "saving" | "dirty"

interface FormState {
  title: string
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
}

function toLocalDatetime(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toISOString().slice(0, 16)
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

export default function EventEditor({ event }: { event: PublicEvent }) {
  const editorRef = useRef<RichMarkdownEditorHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isFirstRenderRef = useRef(true)

  const [form, setForm] = useState<FormState>({
    title: event.title,
    description: event.description ?? "",
    category: event.category,
    tag: event.tag ?? "",
    startsAt: toLocalDatetime(event.startsAt),
    endsAt: toLocalDatetime(event.endsAt),
    location: event.location ?? "",
    ctaLabel: event.ctaLabel,
    ctaHref: event.ctaHref ?? "",
    highlight: event.highlight,
    statusOverride: (event.statusOverride as StatusOverrideOption) ?? "auto",
  })
  const [content, setContent] = useState(event.contentMarkdown ?? "")
  const [imagePath, setImagePath] = useState<string | null>(event.imagePath ?? null)
  const [imagePreview, setImagePreview] = useState<string | null>(event.imageUrl ?? null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [draftState, setDraftState] = useState<DraftState>("saved")
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
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview)
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
        description: form.description || null,
        category: form.category,
        tag: form.tag || null,
        startsAt: form.startsAt,
        endsAt: form.endsAt || null,
        location: form.location || null,
        ctaLabel: form.ctaLabel || "자세히 보기",
        ctaHref: form.ctaHref || "/contact",
        highlight: form.highlight,
        statusOverride: form.statusOverride === "auto" ? null : form.statusOverride,
        contentMarkdown: content || null,
        imagePath: currentImagePath,
      }
      const res = await adminFetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      setDraftState("saved")
      setLastSavedAt(new Date())
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장 실패")
      setDraftState("dirty")
    } finally {
      setSaving(false)
    }
  }

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
                /events/{event.slug ?? "—"}
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
                    <div className="overflow-hidden rounded-[28px] border border-[#e8e8e4] shadow-sm">
                      <div className="relative aspect-[4/3] overflow-hidden">
                        <Image
                          src={imagePreview}
                          alt={form.title}
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
                Event Editor
              </p>
              <h1 className="truncate text-base font-semibold tracking-[-0.02em] text-[#111110]">
                {form.title || "행사 편집"}
              </h1>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${indicatorClass}`}>
                {indicatorLabel}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {event.slug && (
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
              저장
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
                <div className="relative w-full" style={{ aspectRatio: "16/7" }}>
                  <Image src={imagePreview} alt="섬네일 미리보기" fill className="object-cover" unoptimized />
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
                    <p className="mt-0.5 text-[11px]">JPG, PNG, WebP, GIF · 최대 10MB</p>
                  </div>
                </div>
              )}
            </div>

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
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">본문 콘텐츠</h2>
              <p className="text-[11px] text-[#1a1a1a]/30">행사 상세 페이지에 표시됩니다</p>
            </div>

            {/* Toolbar */}
            <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-3 py-2">
              {[
                { icon: <Bold className="h-3.5 w-3.5" />, title: "굵게", action: () => editorRef.current?.toggleBold() },
                { icon: <Italic className="h-3.5 w-3.5" />, title: "기울임", action: () => editorRef.current?.toggleItalic() },
                { icon: <Heading2 className="h-3.5 w-3.5" />, title: "제목 2", action: () => editorRef.current?.setHeading(2) },
                { icon: <Heading3 className="h-3.5 w-3.5" />, title: "제목 3", action: () => editorRef.current?.setHeading(3) },
                { icon: <Quote className="h-3.5 w-3.5" />, title: "인용", action: () => editorRef.current?.toggleBlockquote() },
                { icon: <List className="h-3.5 w-3.5" />, title: "글머리", action: () => editorRef.current?.toggleBulletList() },
                { icon: <ListOrdered className="h-3.5 w-3.5" />, title: "번호 목록", action: () => editorRef.current?.toggleOrderedList() },
                { icon: <Link2 className="h-3.5 w-3.5" />, title: "링크", action: () => editorRef.current?.insertLink() },
                { icon: <Minus className="h-3.5 w-3.5" />, title: "구분선", action: () => editorRef.current?.insertDivider() },
              ].map(({ icon, title, action }) => (
                <button
                  key={title}
                  type="button"
                  title={title}
                  onClick={action}
                  className="rounded-md p-1.5 text-[#1a1a1a]/50 transition-all hover:bg-white hover:text-[#111110] hover:shadow-sm"
                >
                  {icon}
                </button>
              ))}
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
                <RichMarkdownEditor
                  ref={editorRef}
                  value={content}
                  onChange={setContent}
                  placeholder="행사 상세 내용을 작성하세요. 일정, 신청 방법, 주의사항 등을 포함할 수 있습니다."
                />
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
        <aside>
          <div className="sticky top-[68px] max-h-[calc(100vh-72px)] space-y-5 overflow-y-auto pb-10">
            {/* Basic info */}
            <div className="rounded-[24px] border border-[#e8e8e4] bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">기본 정보</h2>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">제목 *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="행사 제목"
                  className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
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
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">설명 (목록 표시용)</label>
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
