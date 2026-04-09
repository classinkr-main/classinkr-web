"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, Plus, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { InstallScheduleWithRelations } from "@/lib/repositories/install-schedules"

type InstallStatus = "requested" | "confirmed" | "completed" | "cancelled"

const STATUS_LABEL: Record<InstallStatus, string> = { requested: "요청됨", confirmed: "확정", completed: "완료", cancelled: "취소" }
const STATUS_COLOR: Record<InstallStatus, string> = {
  requested: "bg-yellow-50 text-yellow-600",
  confirmed: "bg-[#ECFDF5] text-[#084734]",
  completed: "bg-green-50 text-green-600",
  cancelled: "bg-[#f0f0ec] text-[#1a1a1a]/40",
}
const NEXT: Partial<Record<InstallStatus, InstallStatus>> = { requested: "confirmed", confirmed: "completed" }

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" })
}
function dday(d: string) {
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  if (diff === 0) return "D-day"
  return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`
}

export default function PartnerSchedulePage() {
  const router = useRouter()
  const [schedules, setSchedules] = useState<InstallScheduleWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<InstallStatus | "all">("all")
  const [showForm, setShowForm] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const [form, setForm] = useState({ contract_id: "", scheduled_date: "", location: "", notes: "" })

  const load = useCallback(async () => {
    setLoading(true)
    const params = filter !== "all" ? `?status=${filter}` : ""
    const res = await fetch(`/api/partner/schedules${params}`)
    if (res.status === 401) { router.replace("/partner/login"); return }
    if (res.ok) setSchedules((await res.json()).schedules ?? [])
    setLoading(false)
  }, [filter, router])

  useEffect(() => {
    let alive = true

    const initialize = async () => {
      setLoading(true)
      const params = filter !== "all" ? `?status=${filter}` : ""
      const res = await fetch(`/api/partner/schedules${params}`)
      if (res.status === 401) {
        router.replace("/partner/login")
        return
      }
      if (!alive) return
      if (res.ok) setSchedules((await res.json()).schedules ?? [])
      if (alive) setLoading(false)
    }

    void initialize()

    return () => {
      alive = false
    }
  }, [filter, router])

  async function handleStatusChange(id: string, status: InstallStatus) {
    setUpdating(id)
    await fetch("/api/partner/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    })
    await load()
    setUpdating(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    await fetch("/api/partner/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    setShowForm(false)
    setForm({ contract_id: "", scheduled_date: "", location: "", notes: "" })
    await load()
  }

  const upcoming = schedules.filter((s) => s.status !== "completed" && s.status !== "cancelled")
  const done = schedules.filter((s) => s.status === "completed" || s.status === "cancelled")

  return (
    <div className="min-h-screen bg-[#f7f7f5]">
      <header className="bg-white border-b border-[#e8e8e4] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-[#1a1a1a]/40" />
            <h1 className="text-sm font-semibold text-[#1a1a1a]">설치 일정</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load}><RefreshCw className={`w-3.5 h-3.5 text-[#1a1a1a]/40 ${loading ? "animate-spin" : ""}`} /></button>
            <Button size="sm" onClick={() => setShowForm(true)} className="h-7 text-xs gap-1">
              <Plus className="w-3 h-3" />일정 요청
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["all", "requested", "confirmed", "completed", "cancelled"] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === s ? "bg-[#1a1a1a] text-white" : "bg-white border border-[#e8e8e4] text-[#1a1a1a]/50"
              }`}>
              {s === "all" ? "전체" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        {showForm && (
          <div className="bg-white rounded-2xl border border-[#e8e8e4] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#1a1a1a]">일정 요청</h3>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-[#1a1a1a]/40" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">계약 ID</label>
                <input required value={form.contract_id} onChange={(e) => setForm({ ...form, contract_id: e.target.value })}
                  placeholder="계약 ID" className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">설치 예정일</label>
                <input required type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                  className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">설치 장소</label>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="예: 서울시 강남구 OO초등학교" className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">메모</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a] resize-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" className="flex-1">요청 제출</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>취소</Button>
              </div>
            </form>
          </div>
        )}
        {loading ? (
          <div className="py-12 text-center text-sm text-[#1a1a1a]/30">불러오는 중...</div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden">
                <div className="px-5 py-3 border-b border-[#e8e8e4]">
                  <p className="text-xs font-semibold text-[#1a1a1a]/40 uppercase tracking-widest">진행 중 · {upcoming.length}건</p>
                </div>
                <ul className="divide-y divide-[#e8e8e4]">
                  {upcoming.map((s) => (
                    <li key={s.id} className="px-5 py-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLOR[s.status as InstallStatus]}`}>
                              {STATUS_LABEL[s.status as InstallStatus]}
                            </span>
                            <span className="text-xs font-semibold text-[#084734]">{dday(s.scheduled_date)}</span>
                          </div>
                          <p className="text-sm font-medium text-[#1a1a1a]">{fmtDate(s.scheduled_date)}</p>
                          {s.location && <p className="text-xs text-[#1a1a1a]/50 mt-0.5">{s.location}</p>}
                          {s.quote_item && <p className="text-xs text-[#1a1a1a]/40">{s.quote_item.product_name} · {s.quote_item.quantity}대</p>}
                          {s.team && <p className="text-xs text-[#1a1a1a]/40">{s.team.name}</p>}
                        </div>
                        {NEXT[s.status as InstallStatus] && (
                          <button disabled={updating === s.id}
                            onClick={() => handleStatusChange(s.id, NEXT[s.status as InstallStatus]!)}
                            className="shrink-0 text-xs border border-[#e8e8e4] rounded-lg px-3 py-1.5 text-[#1a1a1a]/60 hover:border-[#1a1a1a]/40 disabled:opacity-40">
                            {updating === s.id ? "처리중..." : s.status === "requested" ? "확정" : "완료 처리"}
                          </button>
                        )}
                      </div>
                      {s.notes && <p className="text-xs text-[#1a1a1a]/40 bg-[#fafafa] rounded-lg px-3 py-2">{s.notes}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {done.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden">
                <div className="px-5 py-3 border-b border-[#e8e8e4]">
                  <p className="text-xs font-semibold text-[#1a1a1a]/40 uppercase tracking-widest">완료/취소 · {done.length}건</p>
                </div>
                <ul className="divide-y divide-[#e8e8e4]">
                  {done.map((s) => (
                    <li key={s.id} className="px-5 py-4 opacity-60">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLOR[s.status as InstallStatus]}`}>
                        {STATUS_LABEL[s.status as InstallStatus]}
                      </span>
                      <p className="text-sm text-[#1a1a1a] mt-1">{fmtDate(s.scheduled_date)}</p>
                      {s.location && <p className="text-xs text-[#1a1a1a]/50">{s.location}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {schedules.length === 0 && (
              <div className="py-12 flex flex-col items-center gap-2">
                <CalendarDays className="w-7 h-7 text-[#1a1a1a]/15" />
                <p className="text-sm text-[#1a1a1a]/30">등록된 일정이 없습니다</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
