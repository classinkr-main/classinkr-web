"use client"

import React, { useEffect, useState, useCallback } from "react"
import type { PatchNote, PatchChange, ChangeType, NoteStatus } from "@/lib/patch-notes-data"
import { useRouter } from "next/navigation"
import { adminFetch, adminFetchJsonCached } from "@/lib/admin-client"

// ─── Types ───────────────────────────────────────────────
// BugReport는 로컬 재선언 대신 캐논 원천을 쓴다 — lib/bugs-data(overview 페이지와 동일 원천).
// import type라 fs 의존은 클라이언트 번들에 딸려오지 않는다.
import type { BugReport } from "@/lib/bugs-data"

// ─── Helpers ─────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = new Date().getTime() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "방금 전"
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}일 전`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}주 전`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}달 전`
  return `${Math.floor(mo / 12)}년 전`
}

// ─── Fetch/Cache ─────────────────────────────────────────
// 자체 sessionStorage 캐시 + raw fetch를 공용 어드민 클라이언트로 이관(감사 3-C).
// - 읽기: adminFetchJsonCached(60s TTL + SWR) — Bearer·타임아웃·401 리다이렉트 포함.
// - 변경: adminFetch — 성공 시 해당 URL prefix 캐시만 무효화(clearAdminRequestCache 스코프 경로)
//   + 60초간 브라우저 HTTP 캐시 우회 → bugs/patch-notes의 30s 캐시헤더로 인한 생성 직후 staleness 해소.
const DEV_CACHE_TTL_MS = 60_000

function RefreshBtn({ onClick, refreshing }: { onClick: () => void; refreshing: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={refreshing}
      aria-busy={refreshing}
      className="flex min-h-11 items-center gap-1.5 rounded-lg bg-[#f5f5f2] px-3 py-2 text-[11px] text-[#1a1a1a]/50 transition-colors hover:bg-[#ededea] hover:text-[#1a1a1a]/80 disabled:opacity-40"
    >
      <svg aria-hidden="true" className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      {refreshing ? "갱신중" : "새로고침"}
    </button>
  )
}

function DevLoadingState({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="rounded-xl border border-[#e8e8e4] bg-white py-12 text-center text-[13px] text-[#1a1a1a]/50"
    >
      {label}
    </div>
  )
}

function DevLoadError({
  message,
  onRetry,
  hasStaleData = false,
}: {
  message: string
  onRetry: () => void
  hasStaleData?: boolean
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-[13px] text-[#8F2C2C]"
    >
      <span>{message}{hasStaleData ? " 이전에 불러온 데이터를 유지합니다." : ""}</span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#F2B8B8] bg-white px-3 text-[12px] font-semibold text-[#8F2C2C] transition-colors hover:bg-[#FCE9E9]"
      >
        다시 시도
      </button>
    </div>
  )
}

// ─── Toast / Notify ──────────────────────────────────────
type ToastKind = "success" | "error"
type Notify = (msg: string, type?: ToastKind) => void

function DevToast({ msg, type }: { msg: string; type: ToastKind }) {
  return (
    <div
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] font-medium shadow-xl ${
        type === "success" ? "bg-[#111110] text-white" : "bg-[#B85C33] text-white"
      }`}
    >
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {type === "success" ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        )}
      </svg>
      {msg}
    </div>
  )
}

// ─── Constants ───────────────────────────────────────────
// 개발 도구는 버그 리포트·패치노트 두 축만 남긴다(2026-09-11) — 로드맵·공개 기준·데이터 품질·
// 시스템 구조·배포 이력 탭은 코드·API까지 정리했다. 데이터 품질 상세는
// components/admin/branch/IntegrityStrip.tsx(Branch 대시보드)에서 계속 쓴다.
const TABS = [
  { id: "bugs", label: "버그 리포트", description: "오픈 이슈, 심각도, 담당자와 처리 상태를 추적합니다." },
  { id: "patchnotes", label: "패치노트", description: "공개/초안 릴리스 노트와 변경사항을 관리합니다." },
] as const

type Tab = typeof TABS[number]["id"]

const DEFAULT_TAB: Tab = "bugs"

function isDevTab(value: string | null): value is Tab {
  return TABS.some((tab) => tab.id === value)
}

function readDevTabFromLocation(): Tab {
  if (typeof window === "undefined") return DEFAULT_TAB
  const tab = new URLSearchParams(window.location.search).get("tab")
  return isDevTab(tab) ? tab : DEFAULT_TAB
}

const SEVERITY_CONFIG = {
  critical: { label: "Critical", bg: "bg-[#FEF3EE] text-[#9A4A27] border-[#F6D5C5]" },
  high: { label: "High", bg: "bg-orange-100 text-orange-800 border-orange-200" },
  medium: { label: "Medium", bg: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  low: { label: "Low", bg: "bg-[#f0f0ec] text-[#615D59] border-[#e8e8e4]" },
}

const BUG_STATUS_CONFIG = {
  open: { label: "오픈", bg: "bg-[#FEF3EE] text-[#B85C33]" },
  "in-progress": { label: "진행중", bg: "bg-[#ECFDF5] text-[#084734]" },
  resolved: { label: "해결됨", bg: "bg-emerald-50 text-emerald-700" },
  closed: { label: "종료", bg: "bg-[#f0f0ec] text-[#A39E98]" },
}

// ─── Bug Report Tab ───────────────────────────────────────
function BugsTab({ userName, notify, onCountChange }: { userName: string; notify: Notify; onCountChange?: (n: number) => void }) {
  const [bugs, setBugs] = useState<BugReport[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | BugReport["status"]>("all")
  const [severityFilter, setSeverityFilter] = useState<"all" | BugReport["severity"]>("all")
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: "", description: "", severity: "medium" as BugReport["severity"],
    environment: "", tags: "", assignee: "",
  })

  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true)
    try {
      const data = await adminFetchJsonCached<BugReport[]>("/api/admin/bugs", undefined, {
        ttlMs: DEV_CACHE_TTL_MS,
        force,
      })
      if (!Array.isArray(data)) throw new Error("Invalid bugs response")
      setBugs(data)
      onCountChange?.(data.filter((b: BugReport) => b.status === "open").length)
      setLoadError("")
    } catch {
      setLoadError("버그 리포트를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [onCountChange])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await adminFetch("/api/admin/bugs", {
        method: "POST",
        body: JSON.stringify({ ...form, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), reporter: userName }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setForm({ title: "", description: "", severity: "medium", environment: "", tags: "", assignee: "" })
      setShowForm(false)
      notify("버그 리포트를 등록했습니다.")
      load(true)
    } catch {
      notify("버그 등록에 실패했습니다. 다시 시도해 주세요.", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const updateStatus = async (id: string, status: BugReport["status"]) => {
    const prev = bugs
    const next = bugs.map((b) => b.id === id ? { ...b, status } : b)
    setBugs(next)
    onCountChange?.(next.filter((b) => b.status === "open").length)
    try {
      const res = await adminFetch(`/api/admin/bugs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      setBugs(prev)
      onCountChange?.(prev.filter((b) => b.status === "open").length)
      notify("상태 변경을 저장하지 못했습니다.", "error")
    }
  }

  const deleteBug = async (id: string) => {
    const prev = bugs
    const next = bugs.filter((b) => b.id !== id)
    setBugs(next)
    setDeleteConfirm(null)
    onCountChange?.(next.filter((b) => b.status === "open").length)
    try {
      const res = await adminFetch(`/api/admin/bugs/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      notify("버그 리포트를 삭제했습니다.")
    } catch {
      setBugs(prev)
      onCountChange?.(prev.filter((b) => b.status === "open").length)
      notify("버그 삭제를 저장하지 못했습니다.", "error")
    }
  }

  const filtered = bugs
    .filter((b) => statusFilter === "all" || b.status === statusFilter)
    .filter((b) => severityFilter === "all" || b.severity === severityFilter)

  if (loading) return <DevLoadingState label="버그 리포트를 불러오는 중입니다." />

  return (
    <div className="space-y-4">
      {loadError ? (
        <DevLoadError
          message={loadError}
          onRetry={() => void load(true)}
          hasStaleData={bugs.length > 0}
        />
      ) : null}
      {/* Filters + 등록 버튼 */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["all", "open", "in-progress", "resolved", "closed"] as const).map((s) => {
              const count = s === "all" ? bugs.length : bugs.filter((b) => b.status === s).length
              return (
                <button key={s} type="button" aria-pressed={statusFilter === s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 text-[12px] font-medium rounded-lg border transition-colors ${statusFilter === s ? "bg-[#111110] text-white border-[#111110]" : "bg-white text-[#1a1a1a]/60 border-[#e8e8e4] hover:border-[#c8c8c4]"}`}>
                  {s === "all" ? "전체" : BUG_STATUS_CONFIG[s].label}{count > 0 ? ` (${count})` : ""}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["all", "critical", "high", "medium", "low"] as const).map((sv) => (
              <button key={sv} type="button" aria-pressed={severityFilter === sv} onClick={() => setSeverityFilter(sv)} className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors ${severityFilter === sv ? "bg-[#111110] text-white border-[#111110]" : "bg-white text-[#1a1a1a]/50 border-[#e8e8e4] hover:border-[#c8c8c4]"}`}>
                {sv === "all" ? "전체 심각도" : SEVERITY_CONFIG[sv].label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RefreshBtn onClick={() => load(true)} refreshing={refreshing} />
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-[#111110] text-white text-[12px] font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors">
            + 버그 등록
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#e8e8e4] p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-[#111110]">새 버그 리포트</h3>
            <button type="button" aria-label="버그 작성 폼 닫기" onClick={() => setShowForm(false)} className="min-w-11 text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">제목 *</label>
              <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="버그 제목을 입력하세요" className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">심각도</label>
              <select aria-label="버그 심각도" value={form.severity} onChange={(e) => setForm(f => ({ ...f, severity: e.target.value as BugReport["severity"] }))} className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">환경</label>
              <input value={form.environment} onChange={(e) => setForm(f => ({ ...f, environment: e.target.value }))} placeholder="prod / staging / local" className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">담당자</label>
              <input value={form.assignee} onChange={(e) => setForm(f => ({ ...f, assignee: e.target.value }))} placeholder="이름 또는 @handle" className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">태그</label>
              <input value={form.tags} onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="auth, ui, api (쉼표 구분)" className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]" />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">설명 *</label>
              <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} required rows={3} placeholder="재현 방법, 기대 동작, 실제 동작을 기술해주세요" className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8] resize-none" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-[13px] border border-[#e8e8e4] rounded-xl hover:bg-[#fafaf8] transition-colors">취소</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-[13px] bg-[#111110] text-white rounded-xl hover:bg-[#1a1a1a] disabled:opacity-40 transition-colors">{submitting ? "등록중..." : "등록"}</button>
          </div>
        </form>
      )}

      {filtered.length === 0 && !loadError && (
        <div className="text-center py-16 bg-white rounded-2xl border border-[#e8e8e4]">
          <p className="text-[13px] text-[#1a1a1a]/40">{bugs.length === 0 ? "버그 리포트가 없습니다" : "해당 조건의 버그가 없습니다"}</p>
        </div>
      )}

      <div className="space-y-2.5">
        {filtered.map((bug) => {
          const sc = SEVERITY_CONFIG[bug.severity]
          const stc = BUG_STATUS_CONFIG[bug.status]
          const isDeleting = deleteConfirm === bug.id
          return (
            <div key={bug.id} className="bg-white rounded-2xl border border-[#e8e8e4] p-4">
              <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${sc.bg}`}>{sc.label}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${stc.bg}`}>{stc.label}</span>
                    {bug.environment && <span className="text-[10px] bg-[#f0f0ec] text-[#615D59] px-1.5 py-0.5 rounded-full">{bug.environment}</span>}
                    {bug.tags.map((tag) => (
                      <span key={tag} className="text-[10px] bg-[#f5f5f2] text-[#1a1a1a]/50 px-1.5 py-0.5 rounded-full">#{tag}</span>
                    ))}
                  </div>
                  <p className="text-[13px] font-semibold text-[#111110]">{bug.title}</p>
                  <p className="text-[12px] text-[#1a1a1a]/50 mt-1 line-clamp-2">{bug.description}</p>
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-[#1a1a1a]/30">
                    <span>{bug.reporter}</span>
                    {bug.assignee && <><span>·</span><span>담당 {bug.assignee}</span></>}
                    <span>·</span>
                    <span title={new Date(bug.createdAt).toLocaleString("ko-KR")}>{relativeTime(bug.createdAt)}</span>
                    {bug.updatedAt && bug.updatedAt !== bug.createdAt && (
                      <><span>·</span><span className="text-[#1a1a1a]/20">수정 {relativeTime(bug.updatedAt)}</span></>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select aria-label={`${bug.title} 상태`} value={bug.status} onChange={(e) => updateStatus(bug.id, e.target.value as BugReport["status"])} className="text-[11px] border border-[#e8e8e4] rounded-lg px-2 py-1 focus:outline-none bg-[#fafaf8] cursor-pointer">
                    <option value="open">오픈</option>
                    <option value="in-progress">진행중</option>
                    <option value="resolved">해결됨</option>
                    <option value="closed">종료</option>
                  </select>
                  {isDeleting ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => deleteBug(bug.id)} className="text-[10px] px-2 py-1 bg-[#B85C33] text-white rounded-lg hover:bg-[#9A4A27] transition-colors">삭제</button>
                      <button onClick={() => setDeleteConfirm(null)} className="text-[10px] px-2 py-1 border border-[#e8e8e4] rounded-lg hover:bg-[#fafaf8] transition-colors">취소</button>
                    </div>
                  ) : (
                    <button type="button" aria-label={`${bug.title} 삭제 확인 열기`} onClick={() => setDeleteConfirm(bug.id)} className="min-w-11 p-1 text-[#1a1a1a]/35 transition-colors hover:text-[#B85C33]">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Patch Notes Tab ──────────────────────────────────────
const CHANGE_CONFIG: Record<ChangeType, { label: string; bg: string; dot: string }> = {
  feat:     { label: "신기능",  bg: "bg-[#ECFDF5] text-[#084734] border-[#D1FAE5]",    dot: "bg-[#084734]" },
  fix:      { label: "버그수정", bg: "bg-[#FEF3EE] text-[#B85C33] border-[#F6D5C5]",   dot: "bg-[#B85C33]" },
  improve:  { label: "개선",    bg: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  breaking: { label: "주의",    bg: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500" },
}

const STATUS_CONFIG: Record<NoteStatus, { label: string; bg: string }> = {
  draft:     { label: "초안",   bg: "bg-gray-100 text-gray-500" },
  published: { label: "발행됨", bg: "bg-green-100 text-green-700" },
}

function uid(prefix = "c") {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

const EMPTY_FORM = {
  version: "",
  title: "",
  date: new Date().toISOString().slice(0, 10),
  status: "draft" as NoteStatus,
  changes: [] as PatchChange[],
}

function PatchNotesTab({ notify }: { notify: Notify }) {
  const [notes, setNotes] = React.useState<PatchNote[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState("")
  const [showForm, setShowForm] = React.useState(false)
  const [editId, setEditId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState({ ...EMPTY_FORM })
  const [submitting, setSubmitting] = React.useState(false)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())

  const [refreshing, setRefreshing] = React.useState(false)

  const load = React.useCallback(async (force = false) => {
    if (force) setRefreshing(true)
    try {
      const data = await adminFetchJsonCached<PatchNote[]>("/api/admin/patch-notes", undefined, {
        ttlMs: DEV_CACHE_TTL_MS,
        force,
      })
      if (!Array.isArray(data)) throw new Error("Invalid patch notes response")
      setNotes(data)
      setLoadError("")
    } catch {
      setLoadError("패치노트를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const openCreate = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
    setShowForm(true)
  }

  const openEdit = (note: PatchNote) => {
    setEditId(note.id)
    setForm({
      version: note.version,
      title: note.title,
      date: note.date.slice(0, 10),
      status: note.status,
      changes: note.changes.map((c) => ({ ...c })),
    })
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditId(null) }

  const addChange = () =>
    setForm((f) => ({
      ...f,
      changes: [...f.changes, { id: uid(), type: "feat" as ChangeType, text: "" }],
    }))

  const updateChange = (id: string, patch: Partial<PatchChange>) =>
    setForm((f) => ({
      ...f,
      changes: f.changes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))

  const removeChange = (id: string) =>
    setForm((f) => ({ ...f, changes: f.changes.filter((c) => c.id !== id) }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = editId
        ? await adminFetch(`/api/admin/patch-notes/${editId}`, { method: "PATCH", body: JSON.stringify(form) })
        : await adminFetch("/api/admin/patch-notes", { method: "POST", body: JSON.stringify(form) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      notify(editId ? "패치노트를 수정했습니다." : "패치노트를 등록했습니다.")
      closeForm()
      load(true)
    } catch {
      notify("패치노트 저장에 실패했습니다. 다시 시도해 주세요.", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const toggleStatus = async (note: PatchNote) => {
    const next: NoteStatus = note.status === "draft" ? "published" : "draft"
    const prev = notes
    const updated = notes.map((n) => n.id === note.id ? { ...n, status: next } : n)
    setNotes(updated)
    try {
      const res = await adminFetch(`/api/admin/patch-notes/${note.id}`, {
        method: "PATCH", body: JSON.stringify({ status: next }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      notify(next === "published" ? "발행 처리했습니다." : "초안으로 되돌렸습니다.")
    } catch {
      setNotes(prev)
      notify("상태 변경을 저장하지 못했습니다.", "error")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("패치노트를 삭제할까요?")) return
    const prev = notes
    const next = notes.filter((n) => n.id !== id)
    setNotes(next)
    try {
      const res = await adminFetch(`/api/admin/patch-notes/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      notify("패치노트를 삭제했습니다.")
    } catch {
      setNotes(prev)
      notify("패치노트 삭제를 저장하지 못했습니다.", "error")
    }
  }

  if (loading) return <DevLoadingState label="패치노트를 불러오는 중입니다." />

  return (
    <div className="space-y-4">
      {loadError ? (
        <DevLoadError
          message={loadError}
          onRetry={() => void load(true)}
          hasStaleData={notes.length > 0}
        />
      ) : null}
      {/* 헤더 */}
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-gray-500">릴리즈별 변경사항을 기록하고 관리합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshBtn onClick={() => load(true)} refreshing={refreshing} />
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-[#111110] text-white rounded-xl text-sm font-medium hover:bg-[#1a1a1a] transition-colors"
          >
            <span>+ 새 패치노트</span>
          </button>
        </div>
      </div>

      {/* 작성/수정 폼 */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-[#e8e8e4] p-6 space-y-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-[#111110]">
              {editId ? "패치노트 수정" : "새 패치노트"}
            </h3>
            <button type="button" aria-label="패치노트 작성 폼 닫기" onClick={closeForm} className="min-w-11 text-[#1a1a1a]/30 transition-colors hover:text-[#1a1a1a]/60">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 기본 정보 */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">버전</label>
              <input
                value={form.version}
                onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                placeholder="v1.2.0"
                required
                className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">릴리즈 날짜</label>
              <input
                aria-label="릴리즈 날짜"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
                className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">상태</label>
              <select
                aria-label="패치노트 상태"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as NoteStatus }))}
                className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]"
              >
                <option value="draft">초안</option>
                <option value="published">발행</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">타이틀</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="예: 어드민 대시보드 고도화 업데이트"
              required
              className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]"
            />
          </div>

          {/* 변경사항 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-medium text-[#1a1a1a]/40 uppercase tracking-wide">변경사항</label>
              <button
                type="button"
                onClick={addChange}
                className="text-[12px] text-[#1a1a1a]/40 hover:text-[#111110] flex items-center gap-1 transition-colors"
              >
                + 항목 추가
              </button>
            </div>
            <div className="space-y-2">
              {form.changes.length === 0 && (
                <p className="text-[12px] text-[#1a1a1a]/30 text-center py-3 border border-dashed border-[#e8e8e4] rounded-xl">
                  변경사항을 추가해보세요
                </p>
              )}
              {form.changes.map((c) => (
                <div key={c.id} className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_44px] sm:items-center">
                  <select
                    aria-label="변경사항 유형"
                    value={c.type}
                    onChange={(e) => updateChange(c.id, { type: e.target.value as ChangeType })}
                    className="border border-[#e8e8e4] rounded-lg px-2 py-1.5 text-[12px] focus:outline-none bg-[#fafaf8] shrink-0"
                  >
                    <option value="feat">신기능</option>
                    <option value="fix">버그수정</option>
                    <option value="improve">개선</option>
                    <option value="breaking">주의</option>
                  </select>
                  <input
                    value={c.text}
                    onChange={(e) => updateChange(c.id, { text: e.target.value })}
                    placeholder="변경 내용을 입력하세요"
                    className="flex-1 border border-[#e8e8e4] rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]"
                  />
                  <button
                    type="button"
                    aria-label="변경사항 항목 삭제"
                    onClick={() => removeChange(c.id)}
                    className="min-w-11 shrink-0 p-1 text-[#1a1a1a]/35 transition-colors hover:text-[#B85C33]"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 액션 버튼 */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeForm}
              className="px-4 py-2 text-[13px] border border-[#e8e8e4] rounded-xl hover:bg-[#fafaf8] transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-[13px] bg-[#111110] text-white rounded-xl hover:bg-[#1a1a1a] disabled:opacity-40 transition-colors"
            >
              {submitting ? "저장 중..." : editId ? "수정 완료" : "등록"}
            </button>
          </div>
        </form>
      )}

      {/* 빈 상태 */}
      {notes.length === 0 && !showForm && !loadError && (
        <div className="text-center py-16 bg-white rounded-2xl border border-[#e8e8e4]">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-[13px] text-[#1a1a1a]/40 mb-4">아직 패치노트가 없습니다.</p>
          <button onClick={openCreate} className="text-[12px] text-[#111110] font-medium underline underline-offset-2">
            첫 패치노트 작성하기
          </button>
        </div>
      )}

      {/* 패치노트 타임라인 */}
      <div className="relative">
        {notes.map((note, idx) => {
          const isExpanded = expandedIds.has(note.id)
          const sc = STATUS_CONFIG[note.status]
          const isLast = idx === notes.length - 1
          const feats     = note.changes.filter((c) => c.type === "feat")
          const fixes     = note.changes.filter((c) => c.type === "fix")
          const improves  = note.changes.filter((c) => c.type === "improve")
          const breakings = note.changes.filter((c) => c.type === "breaking")
          const isPublished = note.status === "published"

          return (
            <div key={note.id} className="flex gap-4">
              {/* 스테퍼 레일 */}
              <div className="flex flex-col items-center w-10 shrink-0">
                {/* 상단 연결선 */}
                {idx > 0 && <div className="w-px flex-none h-5 bg-[#e8e8e4]" />}
                {/* 노드 dot */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 border-2 transition-colors ${
                  isPublished
                    ? "bg-[#111110] border-[#111110]"
                    : "bg-white border-[#d0d0cc]"
                }`}>
                  {isPublished ? (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-[#d0d0cc]" />
                  )}
                </div>
                {/* 하단 연결선 */}
                {!isLast && <div className="w-px flex-1 min-h-[24px] bg-[#e8e8e4]" />}
              </div>

              {/* 카드 */}
              <div className={`flex-1 mb-4 bg-white rounded-2xl border overflow-hidden transition-colors ${
                isPublished ? "border-[#e8e8e4]" : "border-dashed border-[#d0d0cc]"
              }`}>
                {/* 헤더 */}
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap sm:px-5">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-label={`${note.version} ${note.title} 변경사항 ${isExpanded ? "접기" : "펼치기"}`}
                    onClick={() => toggleExpand(note.id)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-[#fafaf8]"
                  >
                  <span className="font-mono text-[12px] font-bold text-[#111110] bg-[#f0f0ec] px-2 py-0.5 rounded-md shrink-0">
                    {note.version}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#111110] truncate">{note.title}</p>
                    <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5">
                      {new Date(note.date).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
                      {" · "}{relativeTime(note.date)}
                      {" · "}{note.changes.length}개 변경사항
                    </p>
                  </div>
                  {/* 타입 요약 */}
                  <div className="flex items-center gap-1 shrink-0">
                    {breakings.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 font-medium">⚠ {breakings.length}</span>
                    )}
                    {feats.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#ECFDF5] text-[#084734] font-medium">feat {feats.length}</span>
                    )}
                    {fixes.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#FEF3EE] text-[#B85C33] font-medium">fix {fixes.length}</span>
                    )}
                    {improves.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">개선 {improves.length}</span>
                    )}
                  </div>
                  <svg aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/35 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  </button>
                  {/* 액션 */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleStatus(note)}
                      className={`rounded-lg px-3 text-[10px] font-medium transition-all hover:opacity-80 ${sc.bg}`}
                    >
                      {sc.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(note)}
                      className="rounded-lg border border-[#e8e8e4] px-3 text-[10px] text-[#1a1a1a]/50 transition-all hover:border-[#c8c8c4] hover:text-[#111110]"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      aria-label={`${note.title} 패치노트 삭제`}
                      onClick={() => handleDelete(note.id)}
                      className="min-w-11 p-1 text-[#1a1a1a]/35 transition-colors hover:text-[#B85C33]"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* 변경사항 상세 */}
                {isExpanded && note.changes.length > 0 && (
                  <div className="border-t border-[#e8e8e4] px-5 py-4 space-y-3">
                    {(["breaking", "feat", "improve", "fix"] as ChangeType[]).map((type) => {
                      const items = note.changes.filter((c) => c.type === type)
                      if (items.length === 0) return null
                      const cc = CHANGE_CONFIG[type]
                      return (
                        <div key={type}>
                          <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border mb-1.5 ${cc.bg}`}>
                            {cc.label}
                          </span>
                          <ul className="space-y-1">
                            {items.map((c) => (
                              <li key={c.id} className="flex items-start gap-2 text-[12px] text-[#1a1a1a]/65">
                                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${cc.dot}`} />
                                {c.text}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                )}
                {isExpanded && note.changes.length === 0 && (
                  <div className="border-t border-[#e8e8e4] px-5 py-3 text-[12px] text-[#1a1a1a]/30">
                    변경사항이 없습니다.
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Dev Page ────────────────────────────────────────
export default function DevPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(DEFAULT_TAB)
  const [token, setToken] = useState("")
  const [userName, setUserName] = useState("팀원")
  const [role, setRole] = useState("")
  const [openBugCount, setOpenBugCount] = useState(0)
  const [toast, setToast] = useState<{ msg: string; type: ToastKind } | null>(null)
  const activeTab = TABS.find((item) => item.id === tab) ?? TABS[0]

  const notify = useCallback<Notify>((msg, type = "success") => {
    setToast({ msg, type })
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const selectTab = useCallback((nextTab: Tab) => {
    setTab(nextTab)
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    url.searchParams.set("tab", nextTab)
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [])

  const handleTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, currentTab: Tab) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    event.preventDefault()

    const currentIndex = TABS.findIndex((item) => item.id === currentTab)
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? TABS.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length
    const nextTab = TABS[nextIndex].id
    selectTab(nextTab)
    requestAnimationFrame(() => document.getElementById(`dev-tab-${nextTab}`)?.focus())
  }, [selectTab])

  useEffect(() => {
    // dev 환경 자동 스킵
    if (process.env.NEXT_PUBLIC_SKIP_ADMIN_AUTH === "true") {
      sessionStorage.setItem("admin_password", "dev-skip")
      sessionStorage.setItem("admin_role", "admin")
      sessionStorage.setItem("admin_name", "Dev")
    }
    const t = sessionStorage.getItem("admin_password") || ""
    const n = sessionStorage.getItem("admin_name") || "팀원"
    const r = sessionStorage.getItem("admin_role") || ""
    queueMicrotask(() => {
      setToken(t)
      setUserName(n)
      setRole(r)
    })
    if (!t) router.replace("/admin/login")
  }, [router])

  useEffect(() => {
    queueMicrotask(() => setTab(readDevTabFromLocation()))
    const handlePopState = () => setTab(readDevTabFromLocation())
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  if (!token) return <DevLoadingState label="개발 도구 접근 권한을 확인하는 중입니다." />

  // Branch users can't access dev mode
  if (role === "branch") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">접근 권한 없음</h2>
        <p className="text-gray-500">Dev Mode는 팀원(admin)만 접근할 수 있습니다.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-0 [&_button]:min-h-11 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-[#084734] [&_button]:focus-visible:ring-offset-2 [&_input]:min-h-11 [&_input]:focus-visible:outline-none [&_input]:focus-visible:ring-2 [&_input]:focus-visible:ring-[#084734] [&_input]:focus-visible:ring-offset-2 [&_select]:min-h-11 [&_select]:focus-visible:outline-none [&_select]:focus-visible:ring-2 [&_select]:focus-visible:ring-[#084734] [&_select]:focus-visible:ring-offset-2 [&_textarea]:focus-visible:outline-none [&_textarea]:focus-visible:ring-2 [&_textarea]:focus-visible:ring-[#084734] [&_textarea]:focus-visible:ring-offset-2">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">Dev Mode</h1>
        </div>
        <p className="text-[13px] text-[#1a1a1a]/45">버그 추적 · 업데이트 내역</p>
      </div>

      {/* Tabs */}
      <div
        className="mb-4 grid grid-cols-2 gap-1 rounded-2xl border border-[#e8e8e4] bg-[#f0f0ec] p-1"
        role="tablist"
        aria-label="Dev Mode sections"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`dev-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`dev-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => selectTab(t.id)}
            onKeyDown={(event) => handleTabKeyDown(event, t.id)}
            className={`relative min-h-11 rounded-xl px-3 py-2 text-left text-[13px] font-semibold transition-colors ${
              tab === t.id
                ? "bg-white text-[#111110] shadow-sm"
                : "text-[#1a1a1a]/50 hover:bg-white/45 hover:text-[#111110]"
            }`}
          >
            {t.label}
            {t.id === "bugs" && openBugCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#B85C33] text-[9px] font-bold text-white">
                {openBugCount > 9 ? "9+" : openBugCount}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="mb-6 rounded-xl border border-[#e8e8e4] bg-white px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#084734]/60">
          {activeTab.label}
        </p>
        <p className="mt-1 text-[13px] leading-5 text-[#615D59]">{activeTab.description}</p>
      </div>

      {/* Tab Content */}
      <section id={`dev-panel-${tab}`} role="tabpanel" aria-labelledby={`dev-tab-${tab}`}>
        {tab === "bugs" && <BugsTab userName={userName} notify={notify} onCountChange={setOpenBugCount} />}
        {tab === "patchnotes" && <PatchNotesTab notify={notify} />}
      </section>

      {toast && <DevToast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
