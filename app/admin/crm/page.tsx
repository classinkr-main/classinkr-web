"use client"

import { useState, useEffect, useCallback } from "react"
import {
  RefreshCw, X, Copy, Check, Trash2,
  ChevronDown, Phone, Mail, Building2, Users, Calendar,
  MessageSquare, Tag, Save, Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { LeadRecord, LeadStatus } from "@/lib/db"

// ─── 상수 ────────────────────────────────────────────────────────
const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "신규", contacted: "연락중", converted: "전환", closed: "종료",
}
const STATUS_COLOR: Record<LeadStatus, string> = {
  new: "bg-blue-50 text-blue-600",
  contacted: "bg-yellow-50 text-yellow-600",
  converted: "bg-green-50 text-green-600",
  closed: "bg-[#f0f0ec] text-[#1a1a1a]/40",
}
const SOURCE_LABEL: Record<string, string> = {
  demo_modal: "데모 신청", contact_page: "문의", newsletter: "뉴스레터",
}

function adminFetch(url: string, options?: RequestInit) {
  const token = sessionStorage.getItem("admin_password") ?? ""
  return fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options?.headers },
  })
}

// ─── 복사 버튼 ───────────────────────────────────────────────────
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={handleCopy} className="p-1 rounded-md text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60 hover:bg-[#f0f0ec] transition-all">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// ─── 토스트 ──────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-[13px] font-medium ${
      type === "success" ? "bg-[#111110] text-white" : "bg-red-500 text-white"
    }`}>
      {msg}
    </div>
  )
}

// ─── 드로어 ──────────────────────────────────────────────────────
function LeadDrawer({
  lead,
  onClose,
  onStatusChange,
  onNotesChange,
  onDelete,
}: {
  lead: LeadRecord
  onClose: () => void
  onStatusChange: (id: string, status: LeadStatus) => void
  onNotesChange: (id: string, notes: string) => Promise<void>
  onDelete: (id: string) => void
}) {
  const [notes, setNotes] = useState(lead.notes ?? "")
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)

  // ESC 닫기
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  const handleSaveNotes = async () => {
    setSavingNotes(true)
    await onNotesChange(lead.id, notes)
    setSavingNotes(false)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  const initials = (lead.name ?? lead.email ?? "?")[0]?.toUpperCase()

  return (
    <>
      {/* 백드롭 */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* 패널 */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[420px] bg-white shadow-2xl flex flex-col overflow-hidden border-l border-[#e8e8e4]">
        {/* 헤더 */}
        <div className="flex items-start gap-4 px-6 pt-6 pb-5 border-b border-[#e8e8e4]">
          <div className="w-11 h-11 rounded-full bg-[#f0f0ec] flex items-center justify-center text-[16px] font-bold text-[#1a1a1a]/50 shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[16px] font-bold text-[#111110] truncate">{lead.name ?? "이름 없음"}</p>
            {lead.org && <p className="text-[13px] text-[#1a1a1a]/50 mt-0.5 truncate">{lead.org}</p>}
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[lead.status]}`}>
                {STATUS_LABEL[lead.status]}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f0f0ec] text-[#1a1a1a]/50 font-medium">
                {SOURCE_LABEL[lead.source] ?? lead.source}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60 hover:bg-[#f0f0ec] transition-all shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 스크롤 컨텐츠 */}
        <div className="flex-1 overflow-y-auto">
          {/* 연락처 */}
          <div className="px-6 py-4 border-b border-[#e8e8e4]">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide mb-3">연락처</p>
            <div className="space-y-2">
              {lead.email && (
                <div className="flex items-center gap-2.5 group">
                  <Mail className="w-3.5 h-3.5 text-[#1a1a1a]/30 shrink-0" />
                  <span className="text-[13px] text-[#111110] flex-1 truncate">{lead.email}</span>
                  <CopyButton value={lead.email} />
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2.5 group">
                  <Phone className="w-3.5 h-3.5 text-[#1a1a1a]/30 shrink-0" />
                  <span className="text-[13px] text-[#111110] flex-1">{lead.phone}</span>
                  <CopyButton value={lead.phone} />
                </div>
              )}
              {lead.org && (
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-3.5 h-3.5 text-[#1a1a1a]/30 shrink-0" />
                  <span className="text-[13px] text-[#111110]">{lead.org}</span>
                </div>
              )}
              {lead.role && (
                <div className="flex items-center gap-2.5">
                  <Tag className="w-3.5 h-3.5 text-[#1a1a1a]/30 shrink-0" />
                  <span className="text-[13px] text-[#111110]">{lead.role}</span>
                </div>
              )}
              {lead.size && (
                <div className="flex items-center gap-2.5">
                  <Users className="w-3.5 h-3.5 text-[#1a1a1a]/30 shrink-0" />
                  <span className="text-[13px] text-[#111110]">원생 {lead.size}명</span>
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <Calendar className="w-3.5 h-3.5 text-[#1a1a1a]/30 shrink-0" />
                <span className="text-[13px] text-[#1a1a1a]/50">
                  {new Date(lead.timestamp).toLocaleDateString("ko-KR", {
                    year: "numeric", month: "long", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* 상태 변경 */}
          <div className="px-6 py-4 border-b border-[#e8e8e4]">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide mb-3">상태 변경</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => onStatusChange(lead.id, s)}
                  className={`py-2 px-3 rounded-xl text-[12px] font-medium border transition-all ${
                    lead.status === s
                      ? `${STATUS_COLOR[s]} border-current`
                      : "border-[#e8e8e4] text-[#1a1a1a]/40 hover:border-[#c8c8c4] hover:text-[#1a1a1a]/70"
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {/* 메시지 */}
          {lead.message && (
            <div className="px-6 py-4 border-b border-[#e8e8e4]">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide mb-3">제출 메시지</p>
              <div className="flex gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-[#1a1a1a]/30 mt-0.5 shrink-0" />
                <p className="text-[13px] text-[#1a1a1a]/70 leading-relaxed">{lead.message}</p>
              </div>
            </div>
          )}

          {/* 메모 */}
          <div className="px-6 py-4 border-b border-[#e8e8e4]">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide mb-3">메모</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="담당자 메모를 입력하세요..."
              rows={4}
              className="w-full text-[13px] text-[#111110] placeholder:text-[#1a1a1a]/30 bg-[#fafaf8] border border-[#e8e8e4] rounded-xl px-3 py-2.5 resize-none outline-none focus:border-[#c8c8c4] focus:bg-white transition-all"
            />
            <button
              onClick={handleSaveNotes}
              disabled={savingNotes || notes === (lead.notes ?? "")}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#111110] text-white disabled:opacity-30 hover:bg-[#1a1a1a] transition-all"
            >
              {savingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : notesSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
              {savingNotes ? "저장 중..." : notesSaved ? "저장됨" : "메모 저장"}
            </button>
          </div>
        </div>

        {/* 푸터 — 삭제 */}
        <div className="px-6 py-4 border-t border-[#e8e8e4]">
          <button
            onClick={() => onDelete(lead.id)}
            className="flex items-center gap-2 text-[12px] text-red-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            이 리드 삭제
          </button>
        </div>
      </div>
    </>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────────
export default function CrmPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<LeadStatus | "all">("all")
  const [selected, setSelected] = useState<LeadRecord | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminFetch("/api/admin/leads")
      if (res.ok) setLeads((await res.json()).leads)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  // 선택된 리드가 있으면 최신 상태로 동기화
  useEffect(() => {
    if (selected) {
      const updated = leads.find((l) => l.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [leads]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatus = async (id: string, status: LeadStatus) => {
    await adminFetch(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify({ status }) })
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status } : l))
  }

  const handleNotes = async (id: string, notes: string) => {
    await adminFetch(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify({ notes }) })
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, notes } : l))
  }

  const handleDelete = async (id: string) => {
    if (!confirm("이 리드를 삭제하시겠습니까?")) return
    await adminFetch(`/api/admin/leads/${id}`, { method: "DELETE" })
    setLeads((prev) => prev.filter((l) => l.id !== id))
    setSelected(null)
    showToast("리드가 삭제되었습니다.")
  }

  const filtered = filter === "all" ? leads : leads.filter((l) => l.status === filter)
  const counts = leads.reduce((acc, l) => { acc[l.status] = (acc[l.status] ?? 0) + 1; return acc }, {} as Record<string, number>)

  return (
    <div className="px-8 pt-10 pb-20">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">CRM / 리드</h1>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLeads} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      {/* 필터 카운트 카드 */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {([
          ["all", "전체", leads.length],
          ["new", "신규", counts.new ?? 0],
          ["contacted", "연락중", counts.contacted ?? 0],
          ["converted", "전환", counts.converted ?? 0],
          ["closed", "종료", counts.closed ?? 0],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`text-left p-4 rounded-2xl border transition-all ${
              filter === key ? "border-[#111110] bg-[#111110] text-white" : "border-[#e8e8e4] bg-white hover:border-[#c8c8c4] hover:shadow-sm"
            }`}
          >
            <p className={`text-[11px] font-medium mb-1 ${filter === key ? "text-white/60" : "text-[#1a1a1a]/40"}`}>{label}</p>
            <p className="text-2xl font-bold">{count}</p>
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[13px] text-[#1a1a1a]/30">
            {loading ? "불러오는 중..." : "리드가 없습니다."}
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#e8e8e4] bg-[#fafaf8]">
                {["시간", "소스", "이름", "기관", "이메일", "연락처", "상태"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-[#1a1a1a]/40 whitespace-nowrap text-[12px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => setSelected(lead)}
                  className={`border-b border-[#e8e8e4] last:border-0 cursor-pointer transition-colors ${
                    selected?.id === lead.id ? "bg-[#f0f0ec]" : "hover:bg-[#fafaf8]"
                  }`}
                >
                  <td className="px-4 py-3 text-[#1a1a1a]/40 whitespace-nowrap text-[12px]">
                    {new Date(lead.timestamp).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-md bg-[#f0f0ec] text-[#1a1a1a]/60 text-[11px]">
                      {SOURCE_LABEL[lead.source] ?? lead.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-[#111110]">{lead.name ?? "—"}</td>
                  <td className="px-4 py-3 text-[#1a1a1a]/60">{lead.org ?? "—"}</td>
                  <td className="px-4 py-3 text-[#1a1a1a]/60">{lead.email ?? "—"}</td>
                  <td className="px-4 py-3 text-[#1a1a1a]/60">{lead.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[lead.status]}`}>
                        {STATUS_LABEL[lead.status]}
                      </span>
                      {lead.notes && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a]/20 shrink-0" title="메모 있음" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 드로어 */}
      {selected && (
        <LeadDrawer
          lead={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatus}
          onNotesChange={handleNotes}
          onDelete={handleDelete}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
