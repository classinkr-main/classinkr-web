"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Trash2, X, Upload, ImageIcon, ArrowRight, ClipboardPaste } from "lucide-react"
import { adminFetch, adminFetchJsonCached, getAdminToken } from "@/lib/admin-client"
import EventDateField from "@/components/admin/EventDateField"
import { formatPublicEventSchedule } from "@/lib/public-event-dates"
import type { PublicEvent, EventCategory, EventPublicationStatus, EventStatus } from "@/lib/types/public-events"
import { EVENT_CATEGORIES } from "@/lib/types/public-events"
import AdminErrorBanner from "@/components/admin/ui/AdminErrorBanner"

function adminUpload(url: string, formData: FormData) {
  return fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${getAdminToken()}` },
    body: formData,
  })
}

// signup-counts는 정규 키(slug ?? id)로 집계된다 — slug 없는 행사는 id 키로 조회
function eventSignupCount(counts: Record<string, number>, event: PublicEvent): number {
  return (event.slug ? counts[event.slug] : undefined) ?? counts[event.id] ?? 0
}

function localDatetimeToIso(value: string): string {
  if (!value) return ""
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toISOString()
}

type StatusOverrideOption = "auto" | EventStatus

interface FormState {
  title: string
  description: string
  category: EventCategory
  tag: string
  startsAt: string
  endsAt: string
  sessionDates: string[]
  location: string
  ctaLabel: string
  ctaHref: string
  highlight: boolean
  statusOverride: StatusOverrideOption
  publicationStatus: EventPublicationStatus
}

const DEFAULT_FORM: FormState = {
  title: "",
  description: "",
  category: "프로모션",
  tag: "",
  startsAt: "",
  endsAt: "",
  sessionDates: [],
  location: "",
  ctaLabel: "자세히 보기",
  ctaHref: "",
  highlight: false,
  statusOverride: "auto",
  publicationStatus: "draft",
}

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

export default function AdminEventsPage() {
  const router = useRouter()
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [savingDetail, setSavingDetail] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [signupCounts, setSignupCounts] = useState<Record<string, number>>({})

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEvents(await adminFetchJsonCached<PublicEvent[]>("/api/admin/events", undefined, { ttlMs: 60_000 }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패")
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSignupCounts = useCallback(async () => {
    try {
      const data = await adminFetchJsonCached<{ counts: Record<string, number> }>(
        "/api/admin/events/signup-counts",
        undefined,
        { ttlMs: 60_000 }
      )
      setSignupCounts(data.counts ?? {})
    } catch {
      // 집계 실패는 목록 표시를 막지 않는다
    }
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])
  useEffect(() => { fetchSignupCounts() }, [fetchSignupCounts])

  function openCreate() {
    setForm(DEFAULT_FORM)
    setImageFile(null)
    setImagePreview(null)
    setSaveError(null)
    setModalOpen(true)
  }

  function closeModal() {
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview)
    setModalOpen(false)
    setImageFile(null)
    setImagePreview(null)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    e.target.value = ""
  }

  async function handleSave({ continueToEditor }: { continueToEditor: boolean }) {
    if (!form.title || !form.category || !form.startsAt) {
      setSaveError("제목, 카테고리, 시작일시는 필수입니다.")
      return
    }
    if (continueToEditor) setSavingDetail(true)
    else setSaving(true)
    setSaveError(null)
    try {
      let imagePath: string | null = null
      if (imageFile) {
        const fd = new FormData()
        fd.append("file", imageFile)
        const uploadRes = await adminUpload("/api/admin/events/upload", fd)
        if (!uploadRes.ok) throw new Error("이미지 업로드 실패")
        const uploadData = (await uploadRes.json()) as { path: string }
        imagePath = uploadData.path
      }

      const payload = {
        title: form.title,
        description: form.description || null,
        category: form.category,
        tag: form.tag || null,
        startsAt: localDatetimeToIso(form.startsAt),
        endsAt: form.endsAt ? localDatetimeToIso(form.endsAt) : null,
        sessionDates: form.sessionDates.length > 0 ? form.sessionDates : null,
        location: form.location || null,
        ctaLabel: form.ctaLabel || "자세히 보기",
        ctaHref: form.ctaHref || "/contact#contact-form",
        imagePath,
        highlight: form.highlight,
        statusOverride: form.statusOverride === "auto" ? null : form.statusOverride,
        publicationStatus: form.publicationStatus,
      }

      const res = await adminFetch("/api/admin/events", {
        method: "POST",
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      const created = (await res.json()) as PublicEvent

      closeModal()
      if (continueToEditor) {
        router.push(`/admin/events/${created.id}/edit`)
        return
      }
      await fetchEvents()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setSaving(false)
      setSavingDetail(false)
    }
  }

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

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-20">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#111110]">공개 행사 관리</h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link
            href="/admin/crm/capture"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-4 py-2 text-[13px] font-medium text-[#111110] transition-colors hover:bg-[#F6F5F4]"
          >
            <ClipboardPaste className="h-4 w-4" />
            참석자 입력
          </Link>
          <button
            onClick={openCreate}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white px-4 py-2 text-[13px] font-medium text-[#111110] transition-colors hover:bg-[#F6F5F4]"
          >
            빠른 등록
          </button>
          <button
            onClick={() => router.push("/admin/events/new")}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#111110] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" />
            새 행사 작성
          </button>
        </div>
      </div>

      <div className="mb-4 flex justify-end rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3">
        <button
          onClick={() => router.push("/admin/events/new")}
          title="블로그 편집 화면처럼 포스터, 본문, 공개 상태, 미리보기를 한 화면에서 작성할 수 있습니다."
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] px-3 py-2 text-[12px] font-medium text-[#111110] transition-colors hover:bg-[#F6F5F4] md:w-auto"
        >
          에디터 바로 열기
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {error && <AdminErrorBanner message={error} className="mb-4" />}

      {loading ? (
        <div className="py-16 text-center text-[13px] text-[#1a1a1a]/30">불러오는 중...</div>
      ) : events.length === 0 ? (
        <div className="py-16 text-center text-[13px] text-[#1a1a1a]/30">
          등록된 행사가 없습니다. 새 행사 작성 버튼을 눌러 시작하세요.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)]">
          <div className="overflow-x-auto">
          <table className="min-w-[840px] w-full text-[13px]">
            <thead className="bg-[#F6F5F4] text-[#1a1a1a]/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">제목</th>
                <th className="px-4 py-3 font-medium">카테고리</th>
                <th className="px-4 py-3 font-medium">기간</th>
                <th className="px-4 py-3 font-medium">신청</th>
                <th className="px-4 py-3 font-medium">공개</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">Highlight</th>
                <th className="px-4 py-3 font-medium w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(0,0,0,0.06)]">
              {events.map((event) => (
                <tr key={event.id} className="bg-white hover:bg-[#F6F5F4]/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/events/${event.id}/edit`}
                      className="font-medium text-[#111110] line-clamp-1 hover:text-[#084734]"
                    >
                      {event.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[#1a1a1a]/50">{event.category}</td>
                  <td className="px-4 py-3 text-[#1a1a1a]/50">
                    {formatPublicEventSchedule(event.startsAt, event.endsAt, event.sessionDates)}
                  </td>
                  <td className="px-4 py-3">
                    {eventSignupCount(signupCounts, event) > 0 ? (
                      <span className="font-semibold text-[#084734]">{eventSignupCount(signupCounts, event)}명</span>
                    ) : (
                      <span className="text-[#1a1a1a]/25">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      event.publicationStatus === "published"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}>
                      {event.publicationStatus === "published" ? "공개" : "임시"}
                    </span>
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
                      <Link
                        href={`/admin/crm/capture?event=${encodeURIComponent(event.id)}`}
                        className="p-1.5 text-[#1a1a1a]/40 hover:text-[#084734] transition-colors"
                        title="이 행사 참석자 입력"
                        aria-label={`${event.title} 참석자 입력`}
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                      </Link>
                      <Link
                        href={`/admin/events/${event.id}/edit`}
                        className="p-1.5 text-[#1a1a1a]/40 hover:text-[#111110] transition-colors"
                        title="상세 편집"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Link>
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
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4 py-4 sm:px-6">
              <h2 className="text-base font-semibold text-[#111110]">행사 추가</h2>
              <button onClick={closeModal} className="text-[#1a1a1a]/40 hover:text-[#111110]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[calc(100dvh-9rem)] space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
              {saveError && <AdminErrorBanner message={saveError} />}

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

              <div className="grid gap-4 sm:grid-cols-2">
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
                <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">설명</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="행사 상세 설명"
                  rows={3}
                  className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30 resize-none"
                />
              </div>

              <EventDateField
                value={{ startsAt: form.startsAt, endsAt: form.endsAt, sessionDates: form.sessionDates }}
                onChange={(next) => setForm({ ...form, ...next })}
                inputClassName="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30"
                labelClassName="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5"
              />

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

              <div className="grid gap-4 sm:grid-cols-2">
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

              <div>
                <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">포스터 이미지</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative border-2 border-dashed border-[rgba(0,0,0,0.12)] rounded-xl overflow-hidden cursor-pointer hover:border-[#111110]/20 transition-colors"
                  style={{ minHeight: 120 }}
                >
                  {imagePreview ? (
                    <div className="relative w-full h-40">
                      <Image src={imagePreview} alt="미리보기" fill className="object-cover" unoptimized />
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
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">공개 상태</label>
                  <select
                    value={form.publicationStatus}
                    onChange={(e) => setForm({ ...form, publicationStatus: e.target.value as EventPublicationStatus })}
                    className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30 bg-white"
                  >
                    <option value="draft">임시저장</option>
                    <option value="published">공개</option>
                  </select>
                  <p className="mt-1 text-[11px] text-[#1a1a1a]/35">공개 선택 시 /events에 노출됩니다.</p>
                </div>
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

            <div className="flex flex-col-reverse gap-2 border-t border-[rgba(0,0,0,0.08)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-[13px] text-[#1a1a1a]/50 hover:text-[#111110] transition-colors"
              >
                취소
              </button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
                <button
                  onClick={() => handleSave({ continueToEditor: false })}
                  disabled={saving || savingDetail}
                  className="px-5 py-2 text-[13px] font-medium rounded-lg border border-[rgba(0,0,0,0.12)] text-[#111110] hover:bg-[#F6F5F4] transition-colors disabled:opacity-40"
                >
                  {saving ? "저장 중..." : "행사 등록"}
                </button>
                <button
                  onClick={() => handleSave({ continueToEditor: true })}
                  disabled={saving || savingDetail}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2 bg-[#111110] text-white text-[13px] font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40"
                >
                  {savingDetail ? "이동 중..." : (
                    <>
                      상세 편집
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
