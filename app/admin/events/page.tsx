"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { getAdminToken } from "@/lib/admin-client"
import type { PublicEvent, EventStatus } from "@/lib/types/public-events"

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

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")}`
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
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
          <p className="text-[13px] text-[#1a1a1a]/40 mt-0.5">/events 페이지에 표시되는 행사를 등록·수정합니다.</p>
        </div>
        <Link
          href="/admin/events/new"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#111110] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" />
          행사 추가
        </Link>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 text-[13px] rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-[13px] text-[#1a1a1a]/30">불러오는 중...</div>
      ) : events.length === 0 ? (
        <div className="py-16 text-center text-[13px] text-[#1a1a1a]/30">
          등록된 행사가 없습니다. 행사 추가 버튼을 눌러 시작하세요.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)]">
          <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-[13px]">
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
                    <Link
                      href={`/admin/events/${event.id}/edit`}
                      className="font-medium text-[#111110] line-clamp-1 hover:text-[#084734]"
                    >
                      {event.title}
                    </Link>
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
                      <Link
                        href={`/admin/events/${event.id}/edit`}
                        className="p-1.5 text-[#1a1a1a]/40 hover:text-[#111110] transition-colors"
                        title="편집"
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
    </div>
  )
}
