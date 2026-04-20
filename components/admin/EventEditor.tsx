"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Save,
} from "lucide-react"
import RichMarkdownEditor, { type RichMarkdownEditorHandle } from "@/components/admin/RichMarkdownEditor"
import { getAdminToken } from "@/lib/admin-client"
import type { PublicEvent, EventCategory, EventStatus } from "@/lib/types/public-events"
import { EVENT_CATEGORIES } from "@/lib/types/public-events"

type StatusOverrideOption = "auto" | EventStatus

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

export default function EventEditor({ event }: { event: PublicEvent }) {
  const editorRef = useRef<RichMarkdownEditorHandle>(null)

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
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    if (!form.title || !form.category || !form.startsAt) {
      setSaveError("제목, 카테고리, 시작일시는 필수입니다.")
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
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
      }
      const res = await adminFetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[rgba(0,0,0,0.08)] bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/events"
            className="inline-flex items-center gap-1.5 text-[13px] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            공개 행사
          </Link>
          <span className="text-[#1a1a1a]/15">/</span>
          <span className="text-[13px] font-medium text-[#111110] line-clamp-1 max-w-[260px]">
            {form.title || "행사 편집"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {event.slug && (
            <Link
              href={`/events/${event.slug}`}
              target="_blank"
              className="text-[13px] text-[#1a1a1a]/40 hover:text-[#084734] transition-colors"
            >
              미리보기 →
            </Link>
          )}
          {saveError && (
            <span className="text-[12px] text-red-600">{saveError}</span>
          )}
          {saved && (
            <span className="text-[12px] text-emerald-600">저장됨</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#111110] px-4 py-2 text-[13px] font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {/* Metadata */}
        <section className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-6 space-y-4">
          <h2 className="text-[13px] font-semibold text-[#1a1a1a]/40 uppercase tracking-wide">기본 정보</h2>

          <div>
            <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">제목 *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="행사 제목"
              className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">카테고리 *</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as EventCategory })}
                className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30 bg-white"
              >
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">태그</label>
              <input
                type="text"
                value={form.tag}
                onChange={(e) => setForm({ ...form, tag: e.target.value })}
                placeholder="예: HOT, 한정 100개"
                className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">설명 (목록 표시용)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="행사 간단 설명 (행사 목록에서 보여지는 텍스트)"
              rows={2}
              className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">시작일시 *</label>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">종료일시</label>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">장소</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="예: 온라인 (Zoom), COEX 서울"
              className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">CTA 버튼 텍스트</label>
              <input
                type="text"
                value={form.ctaLabel}
                onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
                placeholder="자세히 보기"
                className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">CTA URL</label>
              <input
                type="text"
                value={form.ctaHref}
                onChange={(e) => setForm({ ...form, ctaHref: e.target.value })}
                placeholder="/contact"
                className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.highlight}
                onClick={() => setForm({ ...form, highlight: !form.highlight })}
                className={`relative inline-flex items-center w-10 h-6 rounded-full p-1 transition-colors ${
                  form.highlight ? "bg-emerald-500" : "bg-[#e0e0dc]"
                }`}
              >
                <span
                  className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    form.highlight ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-[13px] text-[#1a1a1a]/60">대표 노출 (Highlight)</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[12px] font-medium text-[#1a1a1a]/50">상태:</label>
              <select
                value={form.statusOverride}
                onChange={(e) => setForm({ ...form, statusOverride: e.target.value as StatusOverrideOption })}
                className="px-3 py-1.5 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30 bg-white"
              >
                <option value="auto">자동 (날짜 기준)</option>
                <option value="진행 중">진행 중</option>
                <option value="예정">예정</option>
                <option value="마감">마감</option>
              </select>
            </div>
          </div>
        </section>

        {/* Content editor */}
        <section className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#1a1a1a]/40 uppercase tracking-wide">본문 콘텐츠</h2>
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
                className="rounded-md p-1.5 text-[#1a1a1a]/50 hover:bg-white hover:text-[#111110] hover:shadow-sm transition-all"
              >
                {icon}
              </button>
            ))}
          </div>

          <RichMarkdownEditor
            ref={editorRef}
            value={content}
            onChange={setContent}
            placeholder="행사 상세 내용을 작성하세요. 일정, 신청 방법, 주의사항 등을 포함할 수 있습니다."
          />
        </section>
      </div>
    </div>
  )
}
