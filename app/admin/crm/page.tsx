"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import {
  RefreshCw, X, Copy, Check, Trash2,
  Phone, Mail, Building2, Users, Calendar,
  MessageSquare, Tag, Save, Loader2, Plus,
  PhoneCall, Bell, UserPlus, Link2, ExternalLink,
} from "lucide-react"
import { adminFetch, adminFetchJsonCached } from "@/lib/admin-client"
import { Button } from "@/components/ui/button"
import type { LeadRecord, LeadStatus } from "@/lib/repositories/leads"
import type { ContactLogRecord, ContactLogType, ContactLogResult } from "@/lib/repositories/contact-logs"
import type { PublicEvent } from "@/lib/types/public-events"
import { parseEventToken, setEventToken } from "@/lib/types/event-metrics"

// ─── 상수 ──────────────────────────────────────────────────────
const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "신규", contacted: "연락중", converted: "전환", closed: "종료",
}
const STATUS_COLOR: Record<LeadStatus, string> = {
  new: "bg-[#ECFDF5] text-[#084734]",
  contacted: "bg-yellow-50 text-yellow-600",
  converted: "bg-green-50 text-green-600",
  closed: "bg-[#f0f0ec] text-[#1a1a1a]/40",
}
const SOURCE_LABEL: Record<string, string> = {
  demo_modal: "데모 신청", contact_page: "문의", newsletter: "뉴스레터", meta_lead_ads: "Meta 리드",
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
  meeting_set: "text-[#084734]",
}

// ─── 리드 스코어 계산 ───────────────────────────────────────────
function calcScore(lead: LeadRecord): number {
  let s = 0
  if (lead.source === "demo_modal")    s += 40
  else if (lead.source === "contact_page") s += 25
  else if (lead.source === "meta_lead_ads") s += 25
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
  const color = score >= 70 ? "text-[#084734]/70"
    : score >= 40 ? "text-[#1a1a1a]/40"
    : "text-[#1a1a1a]/25"
  return (
    <span className={`text-[10px] font-medium tabular-nums ${color}`}>
      ★{score}
    </span>
  )
}

// ─── 인증 헬퍼 ─────────────────────────────────────────────────
async function readAdminResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || fallbackMessage)
  }
  return data as T
}

function toLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

function toFollowUpTimestamp(date: string) {
  return `${date}T12:00:00.000Z`
}

function daysBetween(from: string | Date, to: string | Date = new Date()) {
  const fromDate = from instanceof Date ? from : new Date(from)
  const toDate = to instanceof Date ? to : new Date(to)
  const diff = toDate.getTime() - fromDate.getTime()
  return Math.max(0, Math.floor(diff / 86_400_000))
}

function isActiveLead(status: LeadStatus) {
  return status !== "converted" && status !== "closed"
}

function getLeadOwner(lead: LeadRecord) {
  return lead.assigned_to?.trim() || "미배정"
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
      type === "success" ? "bg-[#111110] text-white" : "bg-[#B85C33] text-white"
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
  events,
  onClose,
  onStatusChange,
  onNotesChange,
  onFollowUpChange,
  onAssignedToChange,
  onDelete,
  onAddLog,
  onDeleteLog,
  onConvert,
}: {
  lead: LeadRecord
  logs: ContactLogRecord[]
  logsLoading: boolean
  events: PublicEvent[]
  onClose: () => void
  onStatusChange: (id: string, status: LeadStatus) => void
  onNotesChange: (id: string, notes: string) => Promise<void>
  onFollowUpChange: (id: string, date: string) => Promise<void>
  onAssignedToChange: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => void
  onAddLog: (entry: { type: ContactLogType; result?: ContactLogResult; notes?: string; contacted_by?: string }) => Promise<void>
  onDeleteLog: (logId: string) => Promise<void>
  onConvert: (lead: LeadRecord) => Promise<void>
}) {
  const initial = parseEventToken(lead.notes)
  const [notes, setNotes] = useState(initial.body)
  const [linkedEventId, setLinkedEventId] = useState<string>(initial.token ?? "")
  const linkedEvent = useMemo(() => {
    if (!linkedEventId) return null
    return events.find((e) => e.id === linkedEventId || e.slug === linkedEventId) ?? null
  }, [events, linkedEventId])
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [assignedTo, setAssignedTo] = useState(lead.assigned_to ?? "")
  const [followUp, setFollowUp] = useState(lead.follow_up_at ? lead.follow_up_at.slice(0, 10) : "")
  const [showLogForm, setShowLogForm] = useState(false)
  const [converting, setConverting] = useState(false)
  const score = calcScore(lead)
  const attributionItems = [
    { label: "UTM Source", value: lead.utm_source },
    { label: "UTM Medium", value: lead.utm_medium },
    { label: "UTM Campaign", value: lead.utm_campaign },
  ].filter((item) => item.value)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  const handleSaveNotes = async () => {
    setSavingNotes(true)
    const combined = setEventToken(notes, linkedEventId || null)
    await onNotesChange(lead.id, combined)
    setSavingNotes(false)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  const linkedTokenInLead = parseEventToken(lead.notes).token ?? ""
  const dirty = notes !== initial.body || linkedEventId !== linkedTokenInLead

  const handleSaveLog = async (entry: Parameters<typeof onAddLog>[0]) => {
    await onAddLog(entry)
    setShowLogForm(false)
  }

  const initials = (lead.name ?? lead.email ?? "?")[0]?.toUpperCase()

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col overflow-hidden rounded-t-2xl border-t border-[#e8e8e4] bg-white shadow-2xl sm:top-0 sm:right-0 sm:left-auto sm:w-[440px] sm:rounded-none sm:border-l sm:border-t-0">

        {/* 헤더 */}
        <div className="flex items-start gap-4 border-b border-[#e8e8e4] px-4 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5">
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
          <div className="border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
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

          {attributionItems.length > 0 && (
            <div className="border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">
                Attribution
              </p>
              <div className="grid gap-2">
                {attributionItems.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl bg-[#fafaf8] px-3 py-2">
                    <span className="text-[11px] font-medium text-[#1a1a1a]/35">{item.label}</span>
                    <span className="truncate text-right text-[12px] font-medium text-[#111110]">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                      className="opacity-0 group-hover:opacity-100 p-1 text-[#1a1a1a]/25 hover:text-[#B85C33] transition-all shrink-0"
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

          {/* 행사 연결 */}
          <div className="px-6 py-4 border-b border-[#e8e8e4]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide">연결된 행사</p>
              {linkedEvent && (
                <Link
                  href="/admin/campaigns"
                  className="inline-flex items-center gap-1 text-[11px] text-[#1a1a1a]/40 hover:text-[#111110]"
                >
                  대시보드 보기
                  <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
            {linkedEvent ? (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-[#e8e8e4] bg-[#ECFDF5]/40 px-3 py-2">
                <div className="min-w-0 flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 shrink-0 text-[#084734]" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[#111110]">{linkedEvent.title}</p>
                    <p className="text-[11px] text-[#1a1a1a]/40">{linkedEvent.category} · {linkedEvent.status}</p>
                  </div>
                </div>
                <button
                  onClick={() => setLinkedEventId("")}
                  className="shrink-0 rounded-md p-1 text-[#1a1a1a]/40 hover:bg-white hover:text-[#B85C33]"
                  title="연결 해제"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : linkedEventId ? (
              <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-700">
                토큰 <code className="rounded bg-white px-1 font-mono text-[11px]">event:{linkedEventId}</code>에 해당하는 행사가 없습니다.
              </div>
            ) : null}
            <select
              value={linkedEventId}
              onChange={(e) => setLinkedEventId(e.target.value)}
              className="w-full text-[13px] text-[#111110] bg-[#fafaf8] border border-[#e8e8e4] rounded-xl px-3 py-2.5 outline-none focus:border-[#c8c8c4] focus:bg-white transition-all"
            >
              <option value="">— 행사 선택 (선택) —</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  [{ev.status}] {ev.title} · {ev.category}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">
              선택 시 메모 첫 줄에 <code className="rounded bg-[#f0f0ec] px-1 font-mono text-[10px] text-[#111110]">[event:&lt;id&gt;]</code> 토큰이 자동 저장됩니다.
            </p>
          </div>

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
              disabled={savingNotes || !dirty}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#111110] text-white disabled:opacity-30 hover:bg-[#1a1a1a] transition-all"
            >
              {savingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : notesSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
              {savingNotes ? "저장 중..." : notesSaved ? "저장됨" : "메모·행사 저장"}
            </button>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-[#e8e8e4] flex items-center justify-between gap-3">
          <button
            onClick={() => onDelete(lead.id)}
            className="flex items-center gap-2 text-[12px] text-[#B85C33] hover:text-[#9A4A27] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />이 리드 삭제
          </button>

          {lead.status !== "converted" && (
            <button
              onClick={async () => {
                setConverting(true)
                await onConvert(lead)
                setConverting(false)
              }}
              disabled={converting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-[#084734] text-[#084734] hover:bg-[#084734] hover:text-white disabled:opacity-40 transition-all"
            >
              {converting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              고객사 등록
            </button>
          )}
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
  const [events, setEvents] = useState<PublicEvent[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await adminFetchJsonCached<PublicEvent[]>("/api/admin/events", undefined, { ttlMs: 60_000 })
        if (!cancelled) setEvents(Array.isArray(data) ? data : [])
      } catch {
        /* noop — 행사 연결 UI는 events 없어도 동작 */
      }
    })()
    return () => { cancelled = true }
  }, [])

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchLeads = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true)
    try {
      const data = await adminFetchJsonCached<{ leads: LeadRecord[] }>("/api/admin/leads", undefined, {
        ttlMs: 45_000,
        force: options?.force,
      })
      setLeads(data.leads)
    } catch (err) {
      showToast(err instanceof Error ? err.message : "리드를 불러오지 못했습니다.", "error")
    } finally { setLoading(false) }
  }, [])

  const fetchLogs = useCallback(async (leadId: string) => {
    setLogsLoading(true)
    try {
      const res = await adminFetch(`/api/admin/leads/${leadId}/logs`)
      const data = await readAdminResponse<{ logs: ContactLogRecord[] }>(res, "연락 기록을 불러오지 못했습니다.")
      setLogs(data.logs)
    } catch (err) {
      setLogs([])
      showToast(err instanceof Error ? err.message : "연락 기록을 불러오지 못했습니다.", "error")
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
    try {
      const res = await adminFetch(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify({ status }) })
      await readAdminResponse(res, "상태를 변경하지 못했습니다.")
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status } : l))
    } catch (err) {
      showToast(err instanceof Error ? err.message : "상태를 변경하지 못했습니다.", "error")
    }
  }

  const handleNotes = async (id: string, notes: string) => {
    try {
      const res = await adminFetch(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify({ notes }) })
      await readAdminResponse(res, "메모를 저장하지 못했습니다.")
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, notes } : l))
    } catch (err) {
      showToast(err instanceof Error ? err.message : "메모를 저장하지 못했습니다.", "error")
    }
  }

  const handleFollowUp = async (id: string, date: string) => {
    const follow_up_at = date ? toFollowUpTimestamp(date) : null
    try {
      const res = await adminFetch(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify({ follow_up_at }) })
      await readAdminResponse(res, "팔로업 일정을 저장하지 못했습니다.")
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, follow_up_at: follow_up_at ?? undefined } : l))
    } catch (err) {
      showToast(err instanceof Error ? err.message : "팔로업 일정을 저장하지 못했습니다.", "error")
    }
  }

  const handleAssignedTo = async (id: string, name: string) => {
    try {
      const res = await adminFetch(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify({ assigned_to: name || null }) })
      await readAdminResponse(res, "담당자를 저장하지 못했습니다.")
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, assigned_to: name || undefined } : l))
    } catch (err) {
      showToast(err instanceof Error ? err.message : "담당자를 저장하지 못했습니다.", "error")
    }
  }

  const handleAddLog = async (entry: { type: ContactLogType; result?: ContactLogResult; notes?: string; contacted_by?: string }) => {
    if (!selected) return
    try {
      const res = await adminFetch(`/api/admin/leads/${selected.id}/logs`, {
        method: "POST",
        body: JSON.stringify(entry),
      })
      await readAdminResponse(res, "연락 기록을 저장하지 못했습니다.")
      await fetchLogs(selected.id)
      if (selected.status === "new") {
        await handleStatus(selected.id, "contacted")
      }
      showToast("연락 기록이 저장되었습니다.")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "연락 기록을 저장하지 못했습니다.", "error")
    }
  }

  const handleDeleteLog = async (logId: string) => {
    if (!selected) return
    try {
      const res = await adminFetch(`/api/admin/leads/${selected.id}/logs?logId=${logId}`, { method: "DELETE" })
      await readAdminResponse(res, "연락 기록을 삭제하지 못했습니다.")
      setLogs((prev) => prev.filter((l) => l.id !== logId))
    } catch (err) {
      showToast(err instanceof Error ? err.message : "연락 기록을 삭제하지 못했습니다.", "error")
    }
  }

  const handleConvert = async (lead: LeadRecord) => {
    const partnerData = {
      name: lead.org || lead.name || "",
      contact_name: lead.name || "",
      phone: lead.phone || "",
      email: lead.email || "",
      address: "",
      pipeline_stage: "prospect",
    }

    try {
      const res = await adminFetch("/api/admin/partners", {
        method: "POST",
        body: JSON.stringify(partnerData),
      })
      await readAdminResponse(res, "고객사 등록에 실패했습니다.")

      const patchRes = await adminFetch(`/api/admin/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "converted" }),
      })
      await readAdminResponse(patchRes, "리드 상태 변경에 실패했습니다.")

      setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, status: "converted" } : l))
      showToast(`${partnerData.name || "고객사"}이(가) 고객사로 등록되었습니다.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : "고객사 등록에 실패했습니다."
      showToast(message, "error")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("이 리드를 삭제하시겠습니까?")) return
    try {
      const res = await adminFetch(`/api/admin/leads/${id}`, { method: "DELETE" })
      await readAdminResponse(res, "리드를 삭제하지 못했습니다.")
      setLeads((prev) => prev.filter((l) => l.id !== id))
      setSelected(null)
      showToast("리드가 삭제되었습니다.")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "리드를 삭제하지 못했습니다.", "error")
    }
  }

  const today = toLocalDateKey(new Date())
  const filtered = filter === "all" ? leads : leads.filter((l) => l.status === filter)
  const counts = leads.reduce((acc, l) => { acc[l.status] = (acc[l.status] ?? 0) + 1; return acc }, {} as Record<string, number>)
  const activeLeads = leads.filter((l) => isActiveLead(l.status))

  const todayFollowUps = leads.filter((l) =>
    l.follow_up_at && toLocalDateKey(l.follow_up_at) === today && isActiveLead(l.status)
  )
  const overdueFollowUps = leads.filter((l) =>
    l.follow_up_at && toLocalDateKey(l.follow_up_at) < today && isActiveLead(l.status)
  )
  const unassignedLeads = activeLeads.filter((l) => !l.assigned_to?.trim())
  const stalledLeads = activeLeads.filter((lead) => {
    const createdDays = daysBetween(lead.timestamp)
    const followUpKey = lead.follow_up_at ? toLocalDateKey(lead.follow_up_at) : null
    return createdDays >= 7 && (!followUpKey || followUpKey < today)
  })
  const pipelineRiskLeads = [...activeLeads]
    .filter((lead) => stalledLeads.some((stalled) => stalled.id === lead.id) || overdueFollowUps.some((overdue) => overdue.id === lead.id))
    .sort((a, b) => {
      const aFollowUp = a.follow_up_at ? toLocalDateKey(a.follow_up_at) : null
      const bFollowUp = b.follow_up_at ? toLocalDateKey(b.follow_up_at) : null
      const aOverdueDays = aFollowUp && aFollowUp < today ? daysBetween(a.follow_up_at!) : 0
      const bOverdueDays = bFollowUp && bFollowUp < today ? daysBetween(b.follow_up_at!) : 0
      return bOverdueDays - aOverdueDays || daysBetween(b.timestamp) - daysBetween(a.timestamp)
    })
    .slice(0, 5)
  const stageSummaries = (Object.keys(STATUS_LABEL) as LeadStatus[]).map((status) => {
    const stageLeads = leads.filter((lead) => lead.status === status)
    const stageOverdue = stageLeads.filter((lead) => lead.follow_up_at && toLocalDateKey(lead.follow_up_at) < today && isActiveLead(lead.status)).length
    const highScore = stageLeads.filter((lead) => calcScore(lead) >= 70).length
    return { status, count: stageLeads.length, stageOverdue, highScore }
  })
  const ownerSummaries = Array.from(
    activeLeads.reduce((acc, lead) => {
      const owner = getLeadOwner(lead)
      const current = acc.get(owner) ?? { owner, total: 0, newCount: 0, contactedCount: 0, overdueCount: 0, highScoreCount: 0 }
      current.total += 1
      if (lead.status === "new") current.newCount += 1
      if (lead.status === "contacted") current.contactedCount += 1
      if (lead.follow_up_at && toLocalDateKey(lead.follow_up_at) < today) current.overdueCount += 1
      if (calcScore(lead) >= 70) current.highScoreCount += 1
      acc.set(owner, current)
      return acc
    }, new Map<string, { owner: string; total: number; newCount: number; contactedCount: number; overdueCount: number; highScoreCount: number }>())
      .values()
  ).sort((a, b) => b.total - a.total || b.overdueCount - a.overdueCount)

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">리드 관리</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchLeads({ force: true })} disabled={loading} className="w-full gap-1.5 sm:w-auto">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />새로고침
        </Button>
      </div>

      {/* 운영 현황 */}
      <div className="mb-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Team Pipeline</p>
              <h2 className="mt-1 text-[17px] font-bold text-[#111110]">팀 전체 파이프라인 현황</h2>
            </div>
            <span className="rounded-full bg-[#f0f0ec] px-3 py-1 text-[12px] font-medium text-[#1a1a1a]/55">
              활성 {activeLeads.length}건
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {[
              { label: "신규 유입", value: counts.new ?? 0, tone: "text-[#111110]" },
              { label: "연락 진행", value: counts.contacted ?? 0, tone: "text-yellow-700" },
              { label: "오늘 예정", value: todayFollowUps.length, tone: "text-[#084734]" },
              { label: "지연 리드", value: overdueFollowUps.length, tone: "text-[#B85C33]" },
              { label: "미배정", value: unassignedLeads.length, tone: "text-[#1a1a1a]/60" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-[#fafaf8] px-3 py-3">
                <p className="text-[11px] font-medium text-[#1a1a1a]/40">{item.label}</p>
                <p className={`mt-1 text-2xl font-bold ${item.tone}`}>{item.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {stageSummaries.map((stage) => (
              <button
                key={stage.status}
                type="button"
                onClick={() => setFilter(stage.status)}
                className="rounded-xl border border-[#e8e8e4] px-3 py-3 text-left transition-colors hover:border-[#c8c8c4] hover:bg-[#fafaf8]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[stage.status]}`}>
                    {STATUS_LABEL[stage.status]}
                  </span>
                  <span className="text-[18px] font-bold text-[#111110]">{stage.count}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-[#1a1a1a]/40">
                  <span>고득점 {stage.highScore}</span>
                  {stage.stageOverdue > 0 && <span className="font-medium text-[#B85C33]">지연 {stage.stageOverdue}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Owners</p>
              <h2 className="mt-1 text-[17px] font-bold text-[#111110]">담당자별 보유 리드</h2>
            </div>
            <span className="text-[12px] font-medium text-[#1a1a1a]/40">{ownerSummaries.length}명</span>
          </div>
          {ownerSummaries.length === 0 ? (
            <p className="rounded-xl bg-[#fafaf8] px-3 py-8 text-center text-[13px] text-[#1a1a1a]/30">활성 리드가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {ownerSummaries.slice(0, 6).map((owner) => (
                <div key={owner.owner} className="rounded-xl border border-[#f0f0ec] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[13px] font-semibold text-[#111110]">{owner.owner}</p>
                    <p className="text-[15px] font-bold tabular-nums text-[#111110]">{owner.total}</p>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-[#1a1a1a]/40">
                    <span>신규 {owner.newCount}</span>
                    <span>연락중 {owner.contactedCount}</span>
                    <span>고득점 {owner.highScoreCount}</span>
                    {owner.overdueCount > 0 && <span className="font-medium text-[#B85C33]">지연 {owner.overdueCount}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {pipelineRiskLeads.length > 0 && (
        <div className="mb-6 rounded-2xl border border-[#F6D5C5] bg-[#FEF8F5] p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#B85C33]/70">Pipeline Risk</p>
              <h2 className="text-[16px] font-bold text-[#111110]">오래 멈춘 리드 / 지연 리드</h2>
            </div>
            <button
              onClick={() => setFilter("contacted")}
              className="text-left text-[12px] font-medium text-[#B85C33] hover:text-[#9A4A27]"
            >
              지연 {overdueFollowUps.length}건 · 7일 이상 정체 {stalledLeads.length}건
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {pipelineRiskLeads.map((lead) => {
              const followUpKey = lead.follow_up_at ? toLocalDateKey(lead.follow_up_at) : null
              const overdueDays = followUpKey && followUpKey < today ? daysBetween(lead.follow_up_at!) : 0
              const ageDays = daysBetween(lead.timestamp)
              return (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => setSelected(lead)}
                  className="rounded-xl border border-[#F6D5C5] bg-white px-3 py-3 text-left transition-colors hover:bg-[#fffaf7]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold text-[#111110]">{lead.name ?? lead.org ?? "이름 없음"}</p>
                    <ScoreBadge score={calcScore(lead)} />
                  </div>
                  <p className="mt-1 truncate text-[12px] text-[#1a1a1a]/45">{lead.org ?? getLeadOwner(lead)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-md bg-[#FEF3EE] px-2 py-0.5 font-medium text-[#B85C33]">
                      {overdueDays > 0 ? `${overdueDays}일 지연` : `${ageDays}일 정체`}
                    </span>
                    <span className="rounded-md bg-[#f0f0ec] px-2 py-0.5 text-[#1a1a1a]/45">{getLeadOwner(lead)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 필터 카운트 카드 */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
            className={`min-h-[88px] rounded-xl border p-3 text-left transition-all sm:rounded-2xl sm:p-4 ${
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
          <>
          <div className="divide-y divide-[#f0f0ec] sm:hidden">
            {filtered.map((lead) => {
              const followUpDateKey = lead.follow_up_at ? toLocalDateKey(lead.follow_up_at) : null
              const isOverdue = Boolean(followUpDateKey && followUpDateKey < today && lead.status !== "converted" && lead.status !== "closed")
              const isTodayFollowUp = followUpDateKey === today
              const ageDays = daysBetween(lead.timestamp)

              return (
                <button
                  key={`mobile-${lead.id}`}
                  type="button"
                  onClick={() => setSelected(lead)}
                  className={`block w-full px-4 py-4 text-left transition-colors ${
                    selected?.id === lead.id ? "bg-[#f0f0ec]" : "hover:bg-[#fafaf8]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[14px] font-semibold text-[#111110]">
                          {lead.name ?? "No name"}
                        </p>
                        <ScoreBadge score={calcScore(lead)} />
                      </div>
                      <p className="mt-1 truncate text-[12px] text-[#1a1a1a]/50">
                        {lead.org ?? lead.phone ?? lead.email ?? "-"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[lead.status]}`}>
                      {STATUS_LABEL[lead.status]}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#1a1a1a]/45">
                    <span className="rounded-md bg-[#f0f0ec] px-2 py-1">
                      {SOURCE_LABEL[lead.source] ?? lead.source}
                    </span>
                    <span>
                      {new Date(lead.timestamp).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                    </span>
                    {lead.follow_up_at ? (
                      <span className={isOverdue ? "font-medium text-[#B85C33]" : isTodayFollowUp ? "font-medium text-[#084734]" : ""}>
                        {isOverdue ? "지연 " : isTodayFollowUp ? "오늘 " : ""}
                        {new Date(lead.follow_up_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                      </span>
                    ) : null}
                    {lead.assigned_to ? <span>{lead.assigned_to}</span> : null}
                    {ageDays >= 7 && isActiveLead(lead.status) ? (
                      <span className="font-medium text-[#B85C33]">{ageDays}일 정체</span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex gap-2">
                    {lead.phone ? (
                      <a
                        href={`tel:${lead.phone}`}
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-[#084734] px-3 text-[12px] font-medium text-white"
                      >
                        <PhoneCall className="h-3.5 w-3.5" />
                        Call
                      </a>
                    ) : null}
                    {lead.email ? (
                      <a
                        href={`mailto:${lead.email}`}
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-3 text-[12px] font-medium text-[#111110]"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Email
                      </a>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
          <div className="hidden overflow-x-auto sm:block">
          <table className="min-w-[1040px] w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#e8e8e4] bg-[#fafaf8]">
                {["시간", "소스", "이름", "기관", "담당자", "연락처", "팔로업", "정체", "상태"].map((h) => (
                  <th key={h} className="text-left px-5 py-3.5 font-medium text-[#1a1a1a]/40 whitespace-nowrap text-[12px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => {
                const followUpDateKey = lead.follow_up_at ? toLocalDateKey(lead.follow_up_at) : null
                const isOverdue = Boolean(followUpDateKey && followUpDateKey < today && lead.status !== "converted" && lead.status !== "closed")
                const isTodayFollowUp = followUpDateKey === today
                const ageDays = daysBetween(lead.timestamp)
                return (
                  <tr
                    key={lead.id}
                    onClick={() => setSelected(lead)}
                    className={`border-b border-[#e8e8e4] last:border-0 cursor-pointer transition-colors ${
                      selected?.id === lead.id ? "bg-[#f0f0ec]" : "hover:bg-[#fafaf8]"
                    }`}
                  >
                    <td className="px-5 py-4 text-[#1a1a1a]/40 whitespace-nowrap text-[12px]">
                      {new Date(lead.timestamp).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md bg-[#f0f0ec] text-[#1a1a1a]/50 text-[11px]">
                        {SOURCE_LABEL[lead.source] ?? lead.source}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-medium text-[#111110]">
                      <div className="flex items-center gap-1.5">
                        {lead.name ?? "—"}
                        <ScoreBadge score={calcScore(lead)} />
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[#1a1a1a]/55">{lead.org ?? "—"}</td>
                    <td className="px-5 py-4 whitespace-nowrap text-[#1a1a1a]/55">
                      {lead.assigned_to ? (
                        <span className="rounded-md bg-[#f0f0ec] px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/55">
                          {lead.assigned_to}
                        </span>
                      ) : (
                        <span className="rounded-md bg-[#FEF3EE] px-2 py-0.5 text-[11px] font-medium text-[#B85C33]">미배정</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-[#1a1a1a]/55">{lead.phone ?? lead.email ?? "—"}</td>
                    <td className="px-5 py-4 whitespace-nowrap text-[12px]">
                      {lead.follow_up_at ? (
                        <span className={isOverdue ? "text-[#B85C33] font-medium" : isTodayFollowUp ? "text-[#084734] font-medium" : "text-[#1a1a1a]/40"}>
                          {isOverdue ? "지연 " : isTodayFollowUp ? "오늘 " : ""}
                          {new Date(lead.follow_up_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                        </span>
                      ) : (
                        <span className="text-[#1a1a1a]/20">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-[12px]">
                      {isActiveLead(lead.status) && ageDays >= 7 ? (
                        <span className="font-medium text-[#B85C33]">{ageDays}일</span>
                      ) : (
                        <span className="text-[#1a1a1a]/25">{ageDays}일</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[lead.status]}`}>
                          {STATUS_LABEL[lead.status]}
                        </span>
                        {lead.status === "converted" && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700 border border-green-200">
                            고객사 전환
                          </span>
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
          </div>
          </>
        )}
      </div>

      {/* 드로어 */}
      {selected && (
        <LeadDrawer
          lead={selected}
          logs={logs}
          logsLoading={logsLoading}
          events={events}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatus}
          onNotesChange={handleNotes}
          onFollowUpChange={handleFollowUp}
          onAssignedToChange={handleAssignedTo}
          onDelete={handleDelete}
          onAddLog={handleAddLog}
          onDeleteLog={handleDeleteLog}
          onConvert={handleConvert}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
