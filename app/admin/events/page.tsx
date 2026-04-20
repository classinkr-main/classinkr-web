"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Image from "next/image"
import { Plus, Pencil, Trash2, X, Upload, ImageIcon } from "lucide-react"
import { getAdminToken } from "@/lib/admin-client"
import type { PublicEvent, EventCategory, EventStatus } from "@/lib/types/public-events"
import { EVENT_CATEGORIES } from "@/lib/types/public-events"

// ─── helpers ──────────────────────────────────────────────────────────────────

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

function toLocalDatetime(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toISOString().slice(0, 16)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")}`
}

// ─── types ────────────────────────────────────────────────────────────────────

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

const DEFAULT_FORM: FormState = {
  title: "",
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
}

function eventToForm(event: PublicEvent): FormState {
  return {
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
    statusOverride: event.statusOverride ?? "auto",
  }
}

// ─── status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: EventStatus }) {
  const styles: Record<EventStatus, string> = {
    "진행 중": "bg-emerald-50 text-emerald-700 border border-emerald-200",
    "예정": "bg-blue-50 text-blue-700 border border-blue-200",
    "마감": "bg-gray-50 text-gray-400 border border-gray-200",
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${styles[status]}`}>
      {status}
    </span>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function AdminEventsPage() {
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PublicEvent | null>(null)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ── fetch ──────────────────────────────────────────────────────────────────

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminFetch("/api/admin/events")
      if (!res.ok) throw new Error(await res.text())
      setEvents(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  // ── modal helpers ──────────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null)
    setForm(DEFAULT_FORM)
    setImageFile(null)
    setImagePreview(null)
    setSaveError(null)
    setModalOpen(true)
  }

  function openEdit(event: PublicEvent) {
    setEditing(event)
    setForm(eventToForm(event))
    setImageFile(null)
    setImagePreview(event.imageUrl)
    setSaveError(null)
    setModalOpen(true)
  }

  function closeModal() {
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview)
    setModalOpen(false)
    setEditing(null)
    setImageFile(null)
    setImagePreview(null)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  // ── save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.title || !form.category || !form.startsAt) {
      setSaveError("제목, 카테고리, 시작일시는 필수입니다.")
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      let imagePath: string | undefined = editing?.imagePath ?? undefined

      // 이미지 업로드
      if (imageFile) {
        const fd = new FormData()
        fd.append("file", imageFile)
        const uploadRes = await adminUpload("/api/admin/events/upload", fd)
        if (!uploadRes.ok) throw new Error("이미지 업로드 실패")
        const uploadData = await uploadRes.json() as { path: string }
        imagePath = uploadData.path
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
        imagePath: imagePath ?? null,
        highlight: form.highlight,
        statusOverride: form.statusOverride === "auto" ? null : form.statusOverride,
      }

      if (editing) {
        const res = await adminFetch(`/api/admin/events/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(await res.text())
      } else {
        const res = await adminFetch("/api/admin/events", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(await res.text())
      }

      closeModal()
      await fetchEvents()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setSaving(false)
    }
  }

  // ── delete ─────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!window.confirm("이 행사를 삭제하시겠습니까?")) return
    setDeletingId(id)
    try {
      const res = await adminFetch(`/api/admin/events/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(await res.text())
      await fetchEvents()
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패")
    } finally {
      setDeletingId(null)
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#111110]">공개 행사 관리</h1>
          <p className="text-[13px] text-[#1a1a1a]/40 mt-0.5">/events 페이지에 표시되는 행사를 등록·수정합니다.</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-[#111110] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          행사 추가
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 text-[13px] rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-[13px] text-[#1a1a1a]/30">불러오는 중...</div>
      ) : events.length === 0 ? (
        <div className="py-16 text-center text-[13px] text-[#1a1a1a]/30">
          등록된 행사가 없습니다. 행사 추가 버튼을 눌러 시작하세요.
        </div>
      ) : (
        <div className="border border-[rgba(0,0,0,0.08)] rounded-xl overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-[#F6F5F4] text-[#1a1a1a]/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">제목</th>
                <th className="px-4 py-3 font-medium">카테고리</th>
                <th className="px-4 py-3 font-medium">기간</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">Highlight</th>
                <th className="px-4 py-3 font-medium w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(0,0,0,0.06)]">
              {events.map((event) => (
                <tr key={event.id} className="bg-white hover:bg-[#F6F5F4]/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-[#111110] line-clamp-1">{event.title}</span>
                  </td>
                  <td className="px-4 py-3 text-[#1a1a1a]/50">{event.category}</td>
                  <td className="px-4 py-3 text-[#1a1a1a]/50">
                    {formatDate(event.startsAt)}
                    {event.endsAt ? ` ~ ${formatDate(event.endsAt)}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={event.status} />
                  </td>
                  <td className="px-4 py-3">
                    {event.highlight ? (
                      <span className="text-emerald-600 font-medium">ON</span>
                    ) : (
                      <span className="text-[#1a1a1a]/25">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(event)}
                        className="p-1.5 text-[#1a1a1a]/40 hover:text-[#111110] transition-colors"
                        title="수정"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(event.id)}
                        disabled={deletingId === event.id}
                        className="p-1.5 text-[#1a1a1a]/40 hover:text-red-600 transition-colors disabled:opacity-30"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(0,0,0,0.08)]">
              <h2 className="text-base font-semibold text-[#111110]">
                {editing ? "행사 수정" : "행사 추가"}
              </h2>
              <button onClick={closeModal} className="text-[#1a1a1a]/40 hover:text-[#111110]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-4">
              {saveError && (
                <div className="px-4 py-3 bg-red-50 text-red-700 text-[13px] rounded-lg border border-red-200">
                  {saveError}
                </div>
              )}

              {/* 제목 */}
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

              {/* 카테고리 + 태그 */}
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

              {/* 설명 */}
              <div>
                <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">설명</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="행사 상세 설명"
                  rows={3}
                  className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30 resize-none"
                />
              </div>

              {/* 시작일시 + 종료일시 */}
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

              {/* 장소 */}
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

              {/* CTA */}
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

              {/* 이미지 업로드 */}
              <div>
                <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">포스터 이미지</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative border-2 border-dashed border-[rgba(0,0,0,0.12)] rounded-xl overflow-hidden cursor-pointer hover:border-[#111110]/20 transition-colors"
                  style={{ minHeight: 120 }}
                >
                  {imagePreview ? (
                    <div className="relative w-full h-40">
                      <Image
                        src={imagePreview}
                        alt="미리보기"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <Upload className="w-6 h-6 text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[120px] gap-2 text-[#1a1a1a]/30">
                      <ImageIcon className="w-8 h-8" />
                      <span className="text-[12px]">클릭하여 이미지 업로드</span>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Highlight + 상태 override */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.highlight}
                    onClick={() => setForm({ ...form, highlight: !form.highlight })}
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      form.highlight ? "bg-emerald-500" : "bg-[#e0e0dc]"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        form.highlight ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span className="text-[13px] text-[#1a1a1a]/60">대표 노출 (Highlight)</span>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">상태 설정</label>
                  <select
                    value={form.statusOverride}
                    onChange={(e) => setForm({ ...form, statusOverride: e.target.value as StatusOverrideOption })}
                    className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30 bg-white"
                  >
                    <option value="auto">자동 (날짜 기준)</option>
                    <option value="진행 중">진행 중</option>
                    <option value="예정">예정</option>
                    <option value="마감">마감</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[rgba(0,0,0,0.08)]">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-[13px] text-[#1a1a1a]/50 hover:text-[#111110] transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-[#111110] text-white text-[13px] font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40"
              >
                {saving ? "저장 중..." : editing ? "수정 완료" : "행사 등록"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
