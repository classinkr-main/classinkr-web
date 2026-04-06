"use client"

import { useState, useEffect, useCallback } from "react"
import {
  RefreshCw, X, Copy, Check, Trash2,
  Phone, Mail, Building2, Users, Calendar,
  MessageSquare, Tag, Save, Loader2, Plus,
  PhoneCall, MessageCircle, ChevronDown, Bell,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { LeadRecord, LeadStatus } from "@/lib/repositories/leads"
import type { ContactLogRecord, ContactLogType, ContactLogResult } from "@/lib/repositories/contact-logs"

// ─── 상수 ──────────────────────────────────────────────────────
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

const LOG_TYPE_LABEL: Record<ContactLogType, string> = {
  call: "전화", sms: "문자", kakao: "카카오", email: "이메일",
}
const LOG_RESULT_LABEL: Record<ContactLogResult, string> = {
  answered: "연결됨", no_answer: "부재중", callback: "콜백 요청", meeting_set: "미팅 확정",
}
const LOG_RESULT_COLOR: Record<ContactLogResult, string> = {
  answered: "text-green-600",
  no_answer: "text-[#1a1a1a]/40",
  callback: "text-yellow-600",
  meeting_set: "text-blue-600",
}

// ─── 리드 스코어 계산 ───────────────────────────────────────────
function calcScore(lead: LeadRecord): number {
  let s = 0
  if (lead.source === "demo_modal")    s += 40
  else if (lead.source === "contact_page") s += 25
  else if (lead.source === "newsletter")   s += 10
  if (lead.phone) s += 20
  if (lead.email) s += 5
  if (lead.size) {
    const n = parseInt(lead.size)
    if (n >= 300) s += 20
    else if (n >= 100) s += 10
    else s += 5
  }
  if (lead.org) s += 10
  return Math.min(s, 100)
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-50 text-green-700 border-green-200"
    : score >= 40 ? "bg-yellow-50 text-yellow-700 border-yellow-200"
    : "bg-[#f0f0ec] text-[#1a1a1a]/50 border-[#e8e8e4]"
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${color}`}>
      ★ {score}
    </span>
  )
}

// ─── 인증 헬퍼 ─────────────────────────────────────────────────
function adminFetch(url: string, options?: RequestInit) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options?.headers },
  })
}

// ─── 복사 버튼 ─────────────────────────────────────────────────
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="p-1 rounded-md text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60 hover:bg-[#f0f0ec] transition-all"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// ─── 토스트 ────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-[13px] font-medium ${
      type === "success" ? "bg-[#111110] text-white" : "bg-red-500 text-white"
    }`}>
      {msg}
    </div>
  )
}

// ─── 연락 로그 폼 ──────────────────────────────────────────────
function ContactLogForm({
  onSave,
  onCancel,
}: {
  onSave: (entry: { type: ContactLogType; result?: ContactLogResult; notes?: string; contacted_by?: string }) => Promise<void>
  onCancel: () => void
}) {
  const [type, setType] = useState<ContactLogType>("call")
  const [result, setResult] = useState<ContactLogResult>("answered")
  const [notes, setNotes] = useState("")
  const [by, setBy] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave({ type, result, notes: notes || undefined, contacted_by: by || undefined })
    setSaving(false)
  }

  return (
    <div className="bg-[#fafaf8] border border-[#e8e8e4] rounded-xl p-3 space-y-2.5">
      {/* 채널 */}
      <div className="flex gap-1.5">
        {(["call", "sms", "kakao", "email"] as ContactLogType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
              type === t ? "bg-[#111110] text-white border-[#111110]" : "border-[#e8e8e4] text-[#1a1a1a]/50 hover:border-[#c8c8c4]"
            }`}
          >
            {LOG_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {/* 결과 (전화/문자만) */}
      {(type === "call" || type === "sms") && (
        <div className="flex gap-1.5">
          {(["answered", "no_answer", "callback", "meeting_set"] as ContactLogResult[]).map((r) => (
            <button
              key={r}
              onClick={() => setResult(r)}
              className={`flex-1 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                result === r ? "bg-[#084734] text-white border-[#084734]" : "border-[#e8e8e4] text-[#1a1a1a]/40 hover:border-[#c8c8c4]"
              }`}
            >
              {LOG_RESULT_LABEL[r]}
            </button>
          ))}
        </div>
      )}

      {/* 담당자 */}
      <input
        value={by}
        onChange={(e) => setBy(e.target.value)}
        placeholder="담당자 이름"
        className="w-full text-[12px] bg-white border border-[#e8e8e4] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c8c8c4] placeholder:text-[#1a1a1a]/25"
      />

      {/* 메모 */}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="메모 (선택)"
        rows={2}
        className="w-full text-[12px] bg-white border border-[#e8e8e4] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c8c8c4] resize-none placeholder:text-[#1a1a1a]/25"
      />

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-[12px] text-[#1a1a1a]/40 hover:text-[#1a1a1a]/60 px-2 py-1">취소</button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 text-[12px] font-medium bg-[#111110] text-white px-3 py-1.5 rounded-lg disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          저장
        </button>
      </div>
    </div>
  )
}

// ─── 드로어 ────────────────────────────────────────────────────
function LeadDrawer({
  lead,
  logs,
  logsLoading,
  onClose,
  onStatusChange,
  onNotesChange,
  onFollowUpChange,
  onAssignedToChange,
  onDelete,
  onAddLog,
  onDeleteLog,
}: {
  lead: LeadRecord
  logs: ContactLogRecord[]
  logsLoading: boolean
  onClose: () => void
  onStatusChange: (id: string, status: LeadStatus) => void
  onNotesChange: (id: string, notes: string) => Promise<void>
  onFollowUpChange: (id: string, date: string) => Promise<void>
  onAssignedToChange: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => void
  onAddLog: (entry: { type: ContactLogType; result?: ContactLogResult; notes?: string; contacted_by?: string }) => Promise<void>
  onDeleteLog: (logId: string) => Promise<void>
}) {
  const [notes, setNotes] = useState(lead.notes ?? "")
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [assignedTo, setAssignedTo] = useState(lead.assigned_to ?? "")
  const [followUp, setFollowUp] = useState(lead.follow_up_at ? lead.follow_up_at.slice(0, 10) : "")
  const [showLogForm, setShowLogForm] = useState(false)
  const score = calcScore(lead)

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

  const handleSaveLog = async (entry: Parameters<typeof onAddLog>[0]) => {
    await onAddLog(entry)
    setShowLogForm(false)
  }

  const initials = (lead.name ?? lead.email ?? "?")[0]?.toUpperCase()

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[440px] bg-white shadow-2xl flex flex-col overflow-hidden border-l border-[#e8e8e4]">

        {/* 헤더 */}
        <div className="flex items-start gap-4 px-6 pt-6 pb-5 border-b border-[#e8e8e4]">
          <div className="w-11 h-11 rounded-full bg-[#f0f0ec] flex items-center justify-center text-[16px] font-bold text-[#1a1a1a]/50 shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[16px] font-bold text-[#111110] truncate">{lead.name ?? "이름 없음"}</p>
            {lead.org && <p className="text-[13px] text-[#1a1a1a]/50 mt-0.5 truncate">{lead.org}</p>}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[lead.status]}`}>
                {STATUS_LABEL[lead.status]}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f0f0ec] text-[#1a1a1a]/50 font-medium">
                {SOURCE_LABEL[lead.source] ?? lead.source}
              </span>
              <ScoreBadge score={score} />
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60 hover:bg-[#f0f0ec] transition-all shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 스크롤 컨텐츠 */}
        <div className="flex-1 overflow-y-auto">

          {/* 연락처 + 전화 버튼 */}
          <div className="px-6 py-4 border-b border-[#e8e8e4]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide">연락처</p>
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#084734] text-white text-[12px] font-medium hover:bg-[#063d2a] transition-colors"
                >
                  <PhoneCall className="w-3.5 h-3.5" />전화걸기
                </a>
              )}
            </div>
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

          {/* 상태 + 담당자 + 팔로업 */}
          <div className="px-6 py-4 border-b border-[#e8e8e4] space-y-4">
            {/* 상태 변경 */}
            <div>
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide mb-2">상태</p>
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

            {/* 담당자 */}
            <div>
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide mb-2">담당자</p>
              <input
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                onBlur={() => { if (assignedTo !== (lead.assigned_to ?? "")) onAssignedToChange(lead.id, assignedTo) }}
                placeholder="담당자 이름 입력"
                className="w-full text-[13px] bg-[#fafaf8] border border-[#e8e8e4] rounded-xl px-3 py-2 outline-none focus:border-[#c8c8c4] focus:bg-white transition-all placeholder:text-[#1a1a1a]/25"
              />
            </div>

            {/* 팔로업 날짜 */}
            <div>
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Bell className="w-3 h-3" />다음 팔로업
              </p>
              <input
                type="date"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                onBlur={() => onFollowUpChange(lead.id, followUp)}
                className="w-full text-[13px] bg-[#fafaf8] border border-[#e8e8e4] rounded-xl px-3 py-2 outline-none focus:border-[#c8c8c4] focus:bg-white transition-all"
              />
              {followUp && new Date(followUp) <= new Date() && (
                <p className="text-[11px] text-yellow-600 mt-1">⚠ 팔로업 날짜가 지났습니다</p>
              )}
            </div>
          </div>

          {/* 연락 로그 */}
          <div className="px-6 py-4 border-b border-[#e8e8e4]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide">
                연락 기록 {logs.length > 0 && <span className="text-[#084734]">({logs.length})</span>}
              </p>
              <button
                onClick={() => setShowLogForm((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-medium text-[#084734] hover:text-[#063d2a] transition-colors"
              >
                <Plus className="w-3 h-3" />연락 추가
              </button>
            </div>

            {showLogForm && (
              <div className="mb-3">
                <ContactLogForm onSave={handleSaveLog} onCancel={() => setShowLogForm(false)} />
              </div>
            )}

            {logsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-[#1a1a1a]/30" />
              </div>
            ) : logs.length === 0 ? (
              <p className="text-[12px] text-[#1a1a1a]/25 py-2">연락 기록이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-2.5 group">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a]/20 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-semibold text-[#111110]">
                          {LOG_TYPE_LABEL[log.type]}
                        </span>
                        {log.result && (
                          <span className={`text-[11px] font-medium ${LOG_RESULT_COLOR[log.result]}`}>
                            — {LOG_RESULT_LABEL[log.result]}
                          </span>
                        )}
                        {log.contacted_by && (
                          <span className="text-[11px] text-[#1a1a1a]/40">{log.contacted_by}</span>
                        )}
                        <span className="text-[10px] text-[#1a1a1a]/30 ml-auto">
                          {new Date(log.contacted_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {log.notes && (
                        <p className="text-[12px] text-[#1a1a1a]/60 mt-0.5">{log.notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => onDeleteLog(log.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-[#1a1a1a]/25 hover:text-red-400 transition-all shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 제출 메시지 */}
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
              rows={3}
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

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-[#e8e8e4]">
          <button
            onClick={() => onDelete(lead.id)}
            className="flex items-center gap-2 text-[12px] text-red-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />이 리드 삭제
          </button>
        </div>
      </div>
    </>
  )
}

// ─── 메인 페이지 ───────────────────────────────────────────────
export default function CrmPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<LeadStatus | "all">("all")
  const [selected, setSelected] = useState<LeadRecord | null>(null)
  const [logs, setLogs] = useState<ContactLogRecord[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
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

  const fetchLogs = useCallback(async (leadId: string) => {
    setLogsLoading(true)
    try {
      const res = await adminFetch(`/api/admin/leads/${leadId}/logs`)
      if (res.ok) setLogs((await res.json()).logs)
    } finally { setLogsLoading(false) }
  }, [])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  useEffect(() => {
    if (selected) {
      const updated = leads.find((l) => l.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [leads]) // eslint-disable-line react-hooks/exhaustive-deps

  // 드로어 열릴 때 로그 로드
  useEffect(() => {
    if (selected) {
      fetchLogs(selected.id)
    } else {
      setLogs([])
    }
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatus = async (id: string, status: LeadStatus) => {
    await adminFetch(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify({ status }) })
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status } : l))
  }

  const handleNotes = async (id: string, notes: string) => {
    await adminFetch(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify({ notes }) })
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, notes } : l))
  }

  const handleFollowUp = async (id: string, date: string) => {
    const follow_up_at = date ? new Date(date).toISOString() : null
    await adminFetch(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify({ follow_up_at }) })
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, follow_up_at: follow_up_at ?? undefined } : l))
  }

  const handleAssignedTo = async (id: string, name: string) => {
    await adminFetch(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify({ assigned_to: name || null }) })
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, assigned_to: name || undefined } : l))
  }

  const handleAddLog = async (entry: { type: ContactLogType; result?: ContactLogResult; notes?: string; contacted_by?: string }) => {
    if (!selected) return
    const res = await adminFetch(`/api/admin/leads/${selected.id}/logs`, {
      method: "POST",
      body: JSON.stringify(entry),
    })
    if (res.ok) {
      await fetchLogs(selected.id)
      // 상태가 신규면 자동으로 연락중으로
      if (selected.status === "new") handleStatus(selected.id, "contacted")
      showToast("연락 기록이 저장되었습니다.")
    }
  }

  const handleDeleteLog = async (logId: string) => {
    if (!selected) return
    await adminFetch(`/api/admin/leads/${selected.id}/logs?logId=${logId}`, { method: "DELETE" })
    setLogs((prev) => prev.filter((l) => l.id !== logId))
  }

  const handleDelete = async (id: string) => {
    if (!confirm("이 리드를 삭제하시겠습니까?")) return
    await adminFetch(`/api/admin/leads/${id}`, { method: "DELETE" })
    setLeads((prev) => prev.filter((l) => l.id !== id))
    setSelected(null)
    showToast("리드가 삭제되었습니다.")
  }

  const today = new Date().toISOString().slice(0, 10)
  const filtered = filter === "all" ? leads : leads.filter((l) => l.status === filter)
  const counts = leads.reduce((acc, l) => { acc[l.status] = (acc[l.status] ?? 0) + 1; return acc }, {} as Record<string, number>)

  // 오늘 팔로업 리드
  const todayFollowUps = leads.filter((l) =>
    l.follow_up_at && l.follow_up_at.startsWith(today) && l.status !== "converted" && l.status !== "closed"
  )
  // 팔로업 기한 초과
  const overdueFollowUps = leads.filter((l) =>
    l.follow_up_at && l.follow_up_at < today + "T" && l.status !== "converted" && l.status !== "closed"
  )

  return (
    <div className="px-8 pt-10 pb-20">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">CRM / 리드</h1>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLeads} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />새로고침
        </Button>
      </div>

      {/* 오늘 팔로업 알림 */}
      {(todayFollowUps.length > 0 || overdueFollowUps.length > 0) && (
        <div className="mb-4 flex gap-3">
          {todayFollowUps.length > 0 && (
            <button
              onClick={() => setFilter("contacted")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[13px] text-blue-700 font-medium hover:bg-blue-100 transition-colors"
            >
              <Bell className="w-3.5 h-3.5" />
              오늘 팔로업 {todayFollowUps.length}건
            </button>
          )}
          {overdueFollowUps.length > 0 && (
            <button
              onClick={() => setFilter("contacted")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-[13px] text-red-600 font-medium hover:bg-red-100 transition-colors"
            >
              <Bell className="w-3.5 h-3.5" />
              기한 초과 {overdueFollowUps.length}건
            </button>
          )}
        </div>
      )}

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
                {["시간", "소스", "이름", "기관", "연락처", "팔로업", "상태"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-[#1a1a1a]/40 whitespace-nowrap text-[12px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => {
                const isOverdue = lead.follow_up_at && lead.follow_up_at < today + "T" && lead.status !== "converted" && lead.status !== "closed"
                const isTodayFollowUp = lead.follow_up_at?.startsWith(today)
                return (
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
                    <td className="px-4 py-3 font-medium text-[#111110]">
                      <div className="flex items-center gap-1.5">
                        {lead.name ?? "—"}
                        <ScoreBadge score={calcScore(lead)} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#1a1a1a]/60">{lead.org ?? "—"}</td>
                    <td className="px-4 py-3 text-[#1a1a1a]/60">{lead.phone ?? lead.email ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[12px]">
                      {lead.follow_up_at ? (
                        <span className={isOverdue ? "text-red-500 font-medium" : isTodayFollowUp ? "text-blue-600 font-medium" : "text-[#1a1a1a]/40"}>
                          {isOverdue ? "⚠ " : isTodayFollowUp ? "● " : ""}
                          {new Date(lead.follow_up_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                        </span>
                      ) : (
                        <span className="text-[#1a1a1a]/20">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[lead.status]}`}>
                          {STATUS_LABEL[lead.status]}
                        </span>
                        {lead.assigned_to && (
                          <span className="text-[11px] text-[#1a1a1a]/35">{lead.assigned_to}</span>
                        )}
                        {lead.notes && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a]/20 shrink-0" title="메모 있음" />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 드로어 */}
      {selected && (
        <LeadDrawer
          lead={selected}
          logs={logs}
          logsLoading={logsLoading}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatus}
          onNotesChange={handleNotes}
          onFollowUpChange={handleFollowUp}
          onAssignedToChange={handleAssignedTo}
          onDelete={handleDelete}
          onAddLog={handleAddLog}
          onDeleteLog={handleDeleteLog}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
