"use client"

import React, { useEffect, useState, useCallback } from "react"
import type { PatchNote, PatchChange, ChangeType, NoteStatus } from "@/lib/patch-notes-data"
import { useRouter } from "next/navigation"

// ─── Types ───────────────────────────────────────────────
interface RoadmapFeature {
  id: string
  title: string
  status: "done" | "in-progress" | "planned"
  assignee: string
}

interface RoadmapVersion {
  id: string
  version: string
  title: string
  status: "done" | "in-progress" | "planned"
  startDate: string
  targetDate: string
  features: RoadmapFeature[]
}

interface BugReport {
  id: string
  title: string
  description: string
  severity: "low" | "medium" | "high" | "critical"
  status: "open" | "in-progress" | "resolved" | "closed"
  reporter: string
  assignee?: string
  createdAt: string
  updatedAt: string
  tags: string[]
  environment?: string
}

interface GitCommit {
  hash: string
  full: string
  author: string
  date: string
  message: string
  refs: string
}

// ─── Helpers ─────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
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

function fmtDate(str?: string): string {
  if (!str) return "—"
  const d = new Date(str)
  if (isNaN(d.getTime())) return str
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })
}

function trimRef(ref: string): string {
  return ref
    .replace(/^HEAD -> /, "")
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\/origin\//, "origin/")
    .trim()
}

// ─── Constants ───────────────────────────────────────────
const TABS = [
  { id: "roadmap", label: "로드맵" },
  { id: "bugs", label: "버그 리포트" },
  { id: "patchnotes", label: "패치노트" },
  { id: "architecture", label: "시스템 구조" },
  { id: "gitlog", label: "배포 이력" },
] as const

type Tab = typeof TABS[number]["id"]

const SEVERITY_CONFIG = {
  critical: { label: "Critical", bg: "bg-red-100 text-red-800 border-red-200" },
  high: { label: "High", bg: "bg-orange-100 text-orange-800 border-orange-200" },
  medium: { label: "Medium", bg: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  low: { label: "Low", bg: "bg-gray-100 text-gray-700 border-gray-200" },
}

const BUG_STATUS_CONFIG = {
  open: { label: "오픈", bg: "bg-red-50 text-red-700" },
  "in-progress": { label: "진행중", bg: "bg-blue-50 text-blue-700" },
  resolved: { label: "해결됨", bg: "bg-green-50 text-green-700" },
  closed: { label: "종료", bg: "bg-gray-100 text-gray-500" },
}

const FEATURE_STATUS = {
  done: { label: "완료", dot: "bg-green-500", text: "text-green-700" },
  "in-progress": { label: "진행중", dot: "bg-blue-500", text: "text-blue-700" },
  planned: { label: "예정", dot: "bg-gray-300", text: "text-gray-500" },
}

const VERSION_STATUS = {
  done: { badge: "bg-green-100 text-green-800 border-green-200", label: "완료" },
  "in-progress": { badge: "bg-blue-100 text-blue-800 border-blue-200", label: "진행중" },
  planned: { badge: "bg-gray-100 text-gray-600 border-gray-200", label: "예정" },
}

// ─── Roadmap Tab ─────────────────────────────────────────
const EMPTY_VER_FORM = {
  version: "",
  title: "",
  status: "planned" as RoadmapVersion["status"],
  startDate: "",
  targetDate: "",
}

function RoadmapTab({ token }: { token: string }) {
  const [versions, setVersions] = useState<RoadmapVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_VER_FORM })
  const [submitting, setSubmitting] = useState(false)
  const [addingFeat, setAddingFeat] = useState<string | null>(null)
  const [featForm, setFeatForm] = useState({ title: "", status: "planned" as RoadmapFeature["status"], assignee: "" })

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` }

  const load = useCallback(() => {
    fetch("/api/admin/roadmap", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        setVersions(Array.isArray(data) ? data : [])
        const inProgress = data.filter((v: RoadmapVersion) => v.status === "in-progress").map((v: RoadmapVersion) => v.id)
        setExpanded(new Set(inProgress))
      })
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => { load() }, [load])

  const toggleExpand = (id: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const openCreate = () => { setEditId(null); setForm({ ...EMPTY_VER_FORM }); setShowForm(true) }
  const openEdit = (ver: RoadmapVersion) => {
    setEditId(ver.id)
    setForm({ version: ver.version, title: ver.title, status: ver.status, startDate: ver.startDate ?? "", targetDate: ver.targetDate ?? "" })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    if (editId) {
      await fetch("/api/admin/roadmap", { method: "PATCH", headers, body: JSON.stringify({ id: editId, ...form }) })
    } else {
      await fetch("/api/admin/roadmap", { method: "POST", headers, body: JSON.stringify({ ...form, features: [] }) })
    }
    setSubmitting(false); setShowForm(false); setEditId(null); load()
  }

  const updateFeatureStatus = async (ver: RoadmapVersion, featId: string, status: RoadmapFeature["status"]) => {
    const updated = ver.features.map((f) => f.id === featId ? { ...f, status } : f)
    setVersions((prev) => prev.map((v) => v.id === ver.id ? { ...v, features: updated } : v))
    await fetch("/api/admin/roadmap", { method: "PATCH", headers, body: JSON.stringify({ id: ver.id, features: updated }) })
  }

  const deleteFeat = async (ver: RoadmapVersion, featId: string) => {
    const updated = ver.features.filter((f) => f.id !== featId)
    setVersions((prev) => prev.map((v) => v.id === ver.id ? { ...v, features: updated } : v))
    await fetch("/api/admin/roadmap", { method: "PATCH", headers, body: JSON.stringify({ id: ver.id, features: updated }) })
  }

  const addFeat = async (ver: RoadmapVersion) => {
    if (!featForm.title.trim()) return
    const newFeat: RoadmapFeature = { id: `f_${Date.now()}`, title: featForm.title.trim(), status: featForm.status, assignee: featForm.assignee.trim() }
    const updated = [...ver.features, newFeat]
    setVersions((prev) => prev.map((v) => v.id === ver.id ? { ...v, features: updated } : v))
    setAddingFeat(null); setFeatForm({ title: "", status: "planned", assignee: "" })
    await fetch("/api/admin/roadmap", { method: "PATCH", headers, body: JSON.stringify({ id: ver.id, features: updated }) })
  }

  if (loading) return <div className="text-center py-12 text-[#1a1a1a]/40 text-[13px]">로드맵 로딩중...</div>

  const totalFeatures = versions.flatMap((v) => v.features)
  const doneCount = totalFeatures.filter((f) => f.status === "done").length
  const progress = totalFeatures.length > 0 ? Math.round((doneCount / totalFeatures.length) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Progress + 버전 추가 */}
      <div className="bg-white rounded-2xl border border-[#e8e8e4] p-5 flex items-center gap-5">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-semibold text-[#111110]">전체 진행률</span>
            <span className="text-[12px] text-[#1a1a1a]/40">{doneCount} / {totalFeatures.length} 기능 완료</span>
          </div>
          <div className="w-full bg-[#f0f0ec] rounded-full h-2">
            <div className="bg-[#1e8aff] h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <span className="text-2xl font-bold text-[#111110] shrink-0">{progress}%</span>
        <button onClick={openCreate} className="shrink-0 px-3 py-1.5 bg-[#111110] text-white text-[12px] font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors">
          + 버전 추가
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#e8e8e4] p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-[#111110]">{editId ? "버전 수정" : "새 버전"}</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">버전</label>
              <input value={form.version} onChange={(e) => setForm(f => ({ ...f, version: e.target.value }))} placeholder="v2.0.0" required className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">상태</label>
              <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value as RoadmapVersion["status"] }))} className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]">
                <option value="planned">예정</option>
                <option value="in-progress">진행중</option>
                <option value="done">완료</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">타이틀</label>
            <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="예: Supabase 백엔드 전환" required className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">시작일</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))} className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">목표일</label>
              <input type="date" value={form.targetDate} onChange={(e) => setForm(f => ({ ...f, targetDate: e.target.value }))} className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-[13px] border border-[#e8e8e4] rounded-xl hover:bg-[#fafaf8] transition-colors">취소</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-[13px] bg-[#111110] text-white rounded-xl hover:bg-[#1a1a1a] disabled:opacity-40 transition-colors">{submitting ? "저장중..." : editId ? "수정 완료" : "추가"}</button>
          </div>
        </form>
      )}

      {versions.length === 0 && !showForm && (
        <div className="text-center py-16 bg-white rounded-2xl border border-[#e8e8e4]">
          <p className="text-[13px] text-[#1a1a1a]/40 mb-4">로드맵이 없습니다.</p>
          <button onClick={openCreate} className="text-[12px] text-[#111110] font-medium underline underline-offset-2">첫 버전 추가하기</button>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {versions.map((ver, idx) => {
          const isExpanded = expanded.has(ver.id)
          const isLast = idx === versions.length - 1
          const sc = VERSION_STATUS[ver.status]
          const vDone = ver.features.filter((f) => f.status === "done").length
          const vProgress = ver.features.length > 0 ? Math.round((vDone / ver.features.length) * 100) : 0

          return (
            <div key={ver.id} className="flex gap-4">
              {/* Stepper rail */}
              <div className="flex flex-col items-center w-10 shrink-0">
                {idx > 0 && <div className="w-px flex-none h-4 bg-[#e8e8e4]" />}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 border-2 ${
                  ver.status === "done" ? "bg-green-500 border-green-500" :
                  ver.status === "in-progress" ? "bg-[#1e8aff] border-[#1e8aff]" :
                  "bg-white border-[#d0d0cc]"
                }`}>
                  {ver.status === "done" ? (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  ) : ver.status === "in-progress" ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-white opacity-90" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-[#d0d0cc]" />
                  )}
                </div>
                {!isLast && <div className="w-px flex-1 min-h-[20px] bg-[#e8e8e4]" />}
              </div>

              {/* Card */}
              <div className="flex-1 mb-4 bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-[#fafaf8] transition-colors" onClick={() => toggleExpand(ver.id)}>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${sc.badge}`}>{sc.label}</span>
                  <span className="font-mono text-[12px] font-bold text-[#111110]">{ver.version}</span>
                  <span className="text-[13px] text-[#1a1a1a]/70 flex-1 min-w-0 truncate">{ver.title}</span>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {(ver.startDate || ver.targetDate) && (
                      <span className="text-[11px] text-[#1a1a1a]/30">{fmtDate(ver.startDate)} ~ {fmtDate(ver.targetDate)}</span>
                    )}
                    <span className="text-[11px] font-medium text-[#1e8aff]">{vProgress}%</span>
                    <button onClick={() => openEdit(ver)} className="text-[10px] px-2 py-0.5 rounded-full border border-[#e8e8e4] text-[#1a1a1a]/40 hover:border-[#c8c8c4] hover:text-[#111110] transition-all">수정</button>
                  </div>
                  <svg className={`w-3.5 h-3.5 text-[#1a1a1a]/25 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>

                {isExpanded && (
                  <div className="border-t border-[#e8e8e4] px-5 py-4">
                    {ver.features.length > 0 && (
                      <div className="w-full bg-[#f0f0ec] rounded-full h-1.5 mb-4">
                        <div className="bg-[#1e8aff] h-1.5 rounded-full" style={{ width: `${vProgress}%` }} />
                      </div>
                    )}
                    <div className="space-y-1">
                      {ver.features.map((feat) => {
                        const fs = FEATURE_STATUS[feat.status]
                        return (
                          <div key={feat.id} className="flex items-center gap-2.5 py-1.5 group">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${fs.dot}`} />
                            <span className="flex-1 text-[13px] text-[#1a1a1a]/80">{feat.title}</span>
                            {feat.assignee && <span className="text-[11px] text-[#1a1a1a]/30">{feat.assignee}</span>}
                            <select
                              value={feat.status}
                              onChange={(e) => updateFeatureStatus(ver, feat.id, e.target.value as RoadmapFeature["status"])}
                              className={`text-[11px] font-medium px-1 py-0.5 focus:outline-none cursor-pointer bg-transparent ${fs.text}`}
                            >
                              <option value="planned">예정</option>
                              <option value="in-progress">진행중</option>
                              <option value="done">완료</option>
                            </select>
                            <button onClick={() => deleteFeat(ver, feat.id)} className="opacity-0 group-hover:opacity-100 text-[#1a1a1a]/20 hover:text-red-400 transition-all p-0.5">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        )
                      })}
                      {ver.features.length === 0 && addingFeat !== ver.id && (
                        <p className="text-[12px] text-[#1a1a1a]/25 py-1">기능이 없습니다.</p>
                      )}
                    </div>

                    {addingFeat === ver.id ? (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#f0f0ec]">
                        <input autoFocus value={featForm.title} onChange={(e) => setFeatForm(f => ({ ...f, title: e.target.value }))} placeholder="기능명" className="flex-1 border border-[#e8e8e4] rounded-lg px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]" />
                        <input value={featForm.assignee} onChange={(e) => setFeatForm(f => ({ ...f, assignee: e.target.value }))} placeholder="담당자" className="w-20 border border-[#e8e8e4] rounded-lg px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]" />
                        <select value={featForm.status} onChange={(e) => setFeatForm(f => ({ ...f, status: e.target.value as RoadmapFeature["status"] }))} className="border border-[#e8e8e4] rounded-lg px-2 py-1.5 text-[12px] focus:outline-none bg-[#fafaf8]">
                          <option value="planned">예정</option>
                          <option value="in-progress">진행중</option>
                          <option value="done">완료</option>
                        </select>
                        <button type="button" onClick={() => addFeat(ver)} className="text-[11px] px-2.5 py-1.5 bg-[#111110] text-white rounded-lg hover:bg-[#1a1a1a] transition-colors">추가</button>
                        <button type="button" onClick={() => { setAddingFeat(null); setFeatForm({ title: "", status: "planned", assignee: "" }) }} className="text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => { setAddingFeat(ver.id); setExpanded(prev => new Set([...prev, ver.id])) }} className="text-[12px] text-[#1a1a1a]/30 hover:text-[#111110] transition-colors mt-3">
                        + 기능 추가
                      </button>
                    )}
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

// ─── Bug Report Tab ───────────────────────────────────────
function BugsTab({ token, userName, onCountChange }: { token: string; userName: string; onCountChange?: (n: number) => void }) {
  const [bugs, setBugs] = useState<BugReport[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<"all" | BugReport["status"]>("all")
  const [severityFilter, setSeverityFilter] = useState<"all" | BugReport["severity"]>("all")
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: "", description: "", severity: "medium" as BugReport["severity"],
    environment: "", tags: "", assignee: "",
  })

  const load = useCallback(() => {
    fetch("/api/admin/bugs", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setBugs(list)
        onCountChange?.(list.filter((b: BugReport) => b.status === "open").length)
      })
      .finally(() => setLoading(false))
  }, [token, onCountChange])

  useEffect(() => { load() }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    await fetch("/api/admin/bugs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...form, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), reporter: userName }),
    })
    setForm({ title: "", description: "", severity: "medium", environment: "", tags: "", assignee: "" })
    setShowForm(false); setSubmitting(false); load()
  }

  const updateStatus = async (id: string, status: BugReport["status"]) => {
    setBugs((prev) => prev.map((b) => b.id === id ? { ...b, status } : b))
    await fetch(`/api/admin/bugs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    })
  }

  const deleteBug = async (id: string) => {
    await fetch(`/api/admin/bugs/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
    setBugs((prev) => prev.filter((b) => b.id !== id))
    setDeleteConfirm(null)
  }

  const filtered = bugs
    .filter((b) => statusFilter === "all" || b.status === statusFilter)
    .filter((b) => severityFilter === "all" || b.severity === severityFilter)

  if (loading) return <div className="text-center py-12 text-[#1a1a1a]/40 text-[13px]">로딩중...</div>

  return (
    <div className="space-y-4">
      {/* Filters + 등록 버튼 */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["all", "open", "in-progress", "resolved", "closed"] as const).map((s) => {
              const count = s === "all" ? bugs.length : bugs.filter((b) => b.status === s).length
              return (
                <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 text-[12px] font-medium rounded-lg border transition-colors ${statusFilter === s ? "bg-[#111110] text-white border-[#111110]" : "bg-white text-[#1a1a1a]/60 border-[#e8e8e4] hover:border-[#c8c8c4]"}`}>
                  {s === "all" ? "전체" : BUG_STATUS_CONFIG[s].label}{count > 0 ? ` (${count})` : ""}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["all", "critical", "high", "medium", "low"] as const).map((sv) => (
              <button key={sv} onClick={() => setSeverityFilter(sv)} className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors ${severityFilter === sv ? "bg-[#111110] text-white border-[#111110]" : "bg-white text-[#1a1a1a]/50 border-[#e8e8e4] hover:border-[#c8c8c4]"}`}>
                {sv === "all" ? "전체 심각도" : SEVERITY_CONFIG[sv].label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="shrink-0 px-4 py-2 bg-[#111110] text-white text-[12px] font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors">
          + 버그 등록
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#e8e8e4] p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-[#111110]">새 버그 리포트</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">제목 *</label>
              <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="버그 제목을 입력하세요" className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#1a1a1a]/40 mb-1.5 uppercase tracking-wide">심각도</label>
              <select value={form.severity} onChange={(e) => setForm(f => ({ ...f, severity: e.target.value as BugReport["severity"] }))} className="w-full border border-[#e8e8e4] rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#c8c8c4] bg-[#fafaf8]">
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

      {filtered.length === 0 && (
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
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${sc.bg}`}>{sc.label}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${stc.bg}`}>{stc.label}</span>
                    {bug.environment && <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full">{bug.environment}</span>}
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
                  <select value={bug.status} onChange={(e) => updateStatus(bug.id, e.target.value as BugReport["status"])} className="text-[11px] border border-[#e8e8e4] rounded-lg px-2 py-1 focus:outline-none bg-[#fafaf8] cursor-pointer">
                    <option value="open">오픈</option>
                    <option value="in-progress">진행중</option>
                    <option value="resolved">해결됨</option>
                    <option value="closed">종료</option>
                  </select>
                  {isDeleting ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => deleteBug(bug.id)} className="text-[10px] px-2 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">삭제</button>
                      <button onClick={() => setDeleteConfirm(null)} className="text-[10px] px-2 py-1 border border-[#e8e8e4] rounded-lg hover:bg-[#fafaf8] transition-colors">취소</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(bug.id)} className="text-[#1a1a1a]/20 hover:text-red-400 transition-colors p-1">
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
  feat:     { label: "신기능",  bg: "bg-blue-50 text-blue-700 border-blue-200",    dot: "bg-blue-500" },
  fix:      { label: "버그수정", bg: "bg-red-50 text-red-700 border-red-200",      dot: "bg-red-500" },
  improve:  { label: "개선",    bg: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500" },
  breaking: { label: "주의",    bg: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500" },
}

const STATUS_CONFIG: Record<NoteStatus, { label: string; bg: string }> = {
  draft:     { label: "초안",   bg: "bg-gray-100 text-gray-500" },
  published: { label: "발행됨", bg: "bg-green-100 text-green-700" },
}

function uid() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
}

const EMPTY_FORM = {
  version: "",
  title: "",
  date: new Date().toISOString().slice(0, 10),
  status: "draft" as NoteStatus,
  changes: [] as PatchChange[],
}

function PatchNotesTab({ token }: { token: string }) {
  const [notes, setNotes] = React.useState<PatchNote[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showForm, setShowForm] = React.useState(false)
  const [editId, setEditId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState({ ...EMPTY_FORM })
  const [submitting, setSubmitting] = React.useState(false)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` }

  const load = React.useCallback(() => {
    fetch("/api/admin/patch-notes", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setNotes(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [token])

  React.useEffect(() => { load() }, [load])

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
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
    if (editId) {
      await fetch(`/api/admin/patch-notes/${editId}`, {
        method: "PATCH", headers, body: JSON.stringify(form),
      })
    } else {
      await fetch("/api/admin/patch-notes", {
        method: "POST", headers, body: JSON.stringify(form),
      })
    }
    setSubmitting(false)
    closeForm()
    load()
  }

  const toggleStatus = async (note: PatchNote) => {
    const next: NoteStatus = note.status === "draft" ? "published" : "draft"
    await fetch(`/api/admin/patch-notes/${note.id}`, {
      method: "PATCH", headers, body: JSON.stringify({ status: next }),
    })
    setNotes((prev) => prev.map((n) => n.id === note.id ? { ...n, status: next } : n))
  }

  const handleDelete = async (id: string) => {
    if (!confirm("패치노트를 삭제할까요?")) return
    await fetch(`/api/admin/patch-notes/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  if (loading) return <div className="text-center py-12 text-gray-400">로딩 중...</div>

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">릴리즈별 변경사항을 기록하고 관리합니다.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[#111110] text-white rounded-xl text-sm font-medium hover:bg-[#1a1a1a] transition-colors"
        >
          <span>+ 새 패치노트</span>
        </button>
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
            <button type="button" onClick={closeForm} className="text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 기본 정보 */}
          <div className="grid grid-cols-3 gap-3">
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
                <div key={c.id} className="flex items-center gap-2">
                  <select
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
                    onClick={() => removeChange(c.id)}
                    className="text-[#1a1a1a]/20 hover:text-red-400 transition-colors p-1 shrink-0"
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
      {notes.length === 0 && !showForm && (
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
                <div
                  className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-[#fafaf8] transition-colors"
                  onClick={() => toggleExpand(note.id)}
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
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">feat {feats.length}</span>
                    )}
                    {fixes.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">fix {fixes.length}</span>
                    )}
                    {improves.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">개선 {improves.length}</span>
                    )}
                  </div>
                  {/* 액션 */}
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => toggleStatus(note)}
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-all hover:opacity-80 ${sc.bg}`}
                    >
                      {sc.label}
                    </button>
                    <button
                      onClick={() => openEdit(note)}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-[#e8e8e4] text-[#1a1a1a]/50 hover:border-[#c8c8c4] hover:text-[#111110] transition-all"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(note.id)}
                      className="text-[#1a1a1a]/20 hover:text-red-400 transition-colors p-1"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <svg className={`w-3.5 h-3.5 text-[#1a1a1a]/25 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
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

// ─── Architecture Tab ─────────────────────────────────────
function ArchitectureTab() {
  const sections = [
    {
      title: "Frontend (Next.js 16 App Router)",
      color: "bg-blue-50 border-blue-200",
      headerColor: "bg-blue-100",
      items: [
        { name: "홈페이지", desc: "마케팅 랜딩 페이지 — Hero, Features, Pricing, Blog, FAQ, CTA 섹션별 컴포넌트" },
        { name: "Admin Dashboard", desc: "/admin/* — 미들웨어 쿠키 검증, admin/branch 역할 기반 라우팅" },
        { name: "API Routes", desc: "/api/* — 서버사이드 비즈니스 로직, Supabase Admin 클라이언트 사용" },
      ],
    },
    {
      title: "Auth 시스템",
      color: "bg-amber-50 border-amber-200",
      headerColor: "bg-amber-100",
      items: [
        { name: "Cookie Auth", desc: "httpOnly cookie (admin_session) — 미들웨어에서 검증" },
        { name: "Multi-role", desc: "admin (전체 접근) / branch (지사장 본인 데이터만)" },
        { name: "ADMIN_USERS", desc: "환경변수 JSON 배열로 계정 관리" },
      ],
    },
    {
      title: "데이터 레이어 (Supabase PostgreSQL)",
      color: "bg-emerald-50 border-emerald-200",
      headerColor: "bg-emerald-100",
      items: [
        { name: "blog_posts", desc: "블로그 글 — CRUD, 소프트 삭제(deleted_at), status: DRAFT / PUBLISHED" },
        { name: "leads", desc: "리드 데이터 — 공개 INSERT(RLS), 어드민 READ / UPDATE / DELETE" },
        { name: "roadmap_items", desc: "로드맵 버전 및 기능 — features JSONB 배열" },
        { name: "patch_notes", desc: "패치노트 — changes JSONB 배열, status: draft / published" },
        { name: "admin_settings", desc: "사이트 설정 — 싱글 row, PATCH 업데이트" },
      ],
    },
    {
      title: "외부 연동",
      color: "bg-purple-50 border-purple-200",
      headerColor: "bg-purple-100",
      items: [
        { name: "Google Sheets", desc: "리드 데이터 동기화 (GOOGLE_SHEET_WEBHOOK_URL)" },
        { name: "ChannelTalk", desc: "리드 이벤트 알림 (CHANNEL_TALK_WEBHOOK_URL)" },
        { name: "n8n / Make", desc: "외부 자동화 트리거 (LEAD_WEBHOOK_URL)" },
        { name: "Gemini API", desc: "블로그 에디터 AI 콘텐츠 변환 (GEMINI_API_KEY)" },
      ],
    },
    {
      title: "인프라 & 배포",
      color: "bg-slate-50 border-slate-200",
      headerColor: "bg-slate-100",
      items: [
        { name: "Vercel", desc: "Next.js 배포 — 자동 프리뷰 브랜치, Edge Runtime" },
        { name: "Supabase", desc: "PostgreSQL + Storage — kfoaodkgvhvmfrankeyu.supabase.co" },
        { name: "GitHub", desc: "classinkr-main/Classin_Home — codex/backend2-admin-blog-design 기준 브랜치" },
      ],
    },
  ]

  return (
    <div className="space-y-4">
      <div className="bg-[#f0f0ec] border border-[#e8e8e4] rounded-xl p-4 text-[12px] text-[#1a1a1a]/55">
        <strong className="text-[#111110]">시스템 구조 문서</strong> — Supabase 백엔드 전환 완료 기준 (2026-03-)
      </div>
      {sections.map((section) => (
        <div key={section.title} className={`rounded-xl border ${section.color} overflow-hidden`}>
          <div className={`px-5 py-3 ${section.headerColor}`}>
            <h3 className="text-[13px] font-semibold text-[#111110]">{section.title}</h3>
          </div>
          <div className="p-4 space-y-2.5">
            {section.items.map((item) => (
              <div key={item.name} className="flex gap-3">
                <span className="font-mono text-[11px] bg-white border border-white/70 rounded px-2 py-1 flex-shrink-0 self-start mt-0.5 shadow-sm">
                  {item.name}
                </span>
                <span className="text-[12px] text-[#1a1a1a]/65 leading-relaxed">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Data Flow */}
      <div className="bg-white rounded-xl border border-[#e8e8e4] p-5">
        <h3 className="text-[13px] font-semibold text-[#111110] mb-4">리드 데이터 플로우</h3>
        <div className="flex items-center gap-2 flex-wrap text-[12px]">
          {[
            "홈페이지 폼",
            "POST /api/lead",
            "Supabase leads 테이블",
            "Google Sheet 동기화",
            "Webhook 트리거",
            "ChannelTalk 알림",
          ].map((step, i, arr) => (
            <div key={step} className="flex items-center gap-2">
              <span className="bg-[#f5f5f2] border border-[#e8e8e4] rounded-lg px-3 py-1.5 text-[#1a1a1a]/65">{step}</span>
              {i < arr.length - 1 && <span className="text-[#d0d0cc]">→</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Git Log Tab ──────────────────────────────────────────
function GitLogTab({ token }: { token: string }) {
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/admin/git-log", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error)
        else setCommits(Array.isArray(data) ? data : [])
      })
      .catch(() => setError("git log를 가져올 수 없습니다"))
      .finally(() => setLoading(false))
  }, [token])

  const [expandedCommits, setExpandedCommits] = useState<Set<string>>(new Set())

  if (loading) return <div className="text-center py-12 text-[#1a1a1a]/40 text-[13px]">git log 로딩중...</div>
  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-[13px]">{error}</div>
  )

  const getCommitType = (message: string) => {
    if (message.startsWith("feat"))     return { label: "feat",     bg: "bg-blue-100 text-blue-800",    dot: "bg-[#1e8aff]" }
    if (message.startsWith("fix"))      return { label: "fix",      bg: "bg-red-100 text-red-800",      dot: "bg-red-400" }
    if (message.startsWith("refactor")) return { label: "refactor", bg: "bg-purple-100 text-purple-800", dot: "bg-purple-400" }
    if (message.startsWith("docs"))     return { label: "docs",     bg: "bg-sky-100 text-sky-800",      dot: "bg-sky-300" }
    if (message.startsWith("chore"))    return { label: "chore",    bg: "bg-gray-100 text-gray-600",    dot: "bg-[#d0d0cc]" }
    if (message.startsWith("style"))    return { label: "style",    bg: "bg-pink-100 text-pink-800",    dot: "bg-pink-300" }
    if (message.startsWith("test"))     return { label: "test",     bg: "bg-yellow-100 text-yellow-800", dot: "bg-yellow-400" }
    if (message.startsWith("design"))   return { label: "design",   bg: "bg-fuchsia-100 text-fuchsia-800", dot: "bg-fuchsia-400" }
    if (message.startsWith("Merge"))    return { label: "merge",    bg: "bg-indigo-100 text-indigo-800", dot: "bg-indigo-400" }
    return { label: "commit", bg: "bg-gray-100 text-gray-600", dot: "bg-[#d0d0cc]" }
  }

  const grouped = commits.reduce<{ date: string; items: GitCommit[] }[]>((acc, commit) => {
    const dateKey = new Date(commit.date).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
    const last = acc[acc.length - 1]
    if (last && last.date === dateKey) last.items.push(commit)
    else acc.push({ date: dateKey, items: [commit] })
    return acc
  }, [])

  const toggleCommit = (hash: string) =>
    setExpandedCommits((prev) => { const n = new Set(prev); n.has(hash) ? n.delete(hash) : n.add(hash); return n })

  return (
    <div>
      <p className="text-[12px] text-[#1a1a1a]/40 mb-5">최근 {commits.length}개 커밋</p>
      <div className="relative">
        {grouped.map((group, gIdx) => (
          <div key={group.date}>
            <div className="flex items-center gap-3 mb-3 mt-2">
              <div className="w-10 shrink-0" />
              <span className="text-[11px] font-semibold text-[#1a1a1a]/35 tracking-wide">{group.date}</span>
              <div className="flex-1 h-px bg-[#f0f0ec]" />
            </div>

            {group.items.map((commit, idx) => {
              const type = getCommitType(commit.message)
              const date = new Date(commit.date)
              const refs = commit.refs.split(",").map((r) => trimRef(r)).filter(Boolean)
              const isLastInGroup = idx === group.items.length - 1
              const isLastGroup = gIdx === grouped.length - 1
              const isExpanded = expandedCommits.has(commit.hash)

              return (
                <div key={commit.hash} className="flex gap-4">
                  <div className="flex flex-col items-center w-10 shrink-0">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 z-10 mt-[18px] ${type.dot}`} />
                    {!(isLastInGroup && isLastGroup) && <div className="w-px flex-1 min-h-[16px] bg-[#f0f0ec]" />}
                  </div>

                  <div
                    className="flex-1 flex items-start gap-3 py-2.5 border-b border-[#f5f5f2] last:border-0 cursor-pointer hover:bg-[#fafaf8] -mx-2 px-2 rounded-lg transition-colors"
                    onClick={() => toggleCommit(commit.hash)}
                  >
                    <span className="font-mono text-[11px] text-[#1a1a1a]/30 bg-[#f5f5f2] px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                      {commit.hash}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${type.bg}`}>{type.label}</span>
                        {refs.map((ref) => (
                          <span key={ref} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full max-w-[200px] truncate">
                            {ref}
                          </span>
                        ))}
                      </div>
                      <p className={`text-[13px] font-medium text-[#111110] ${isExpanded ? "whitespace-normal" : "truncate"}`}>
                        {commit.message}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#1a1a1a]/35">
                        <span>{commit.author}</span>
                        <span>·</span>
                        <span>{date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
                        <span>·</span>
                        <span>{relativeTime(commit.date)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Dev Page ────────────────────────────────────────
export default function DevPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("roadmap")
  const [token, setToken] = useState("")
  const [userName, setUserName] = useState("팀원")
  const [role, setRole] = useState("")
  const [openBugCount, setOpenBugCount] = useState(0)

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
    setToken(t)
    setUserName(n)
    setRole(r)
    if (!t) router.replace("/admin/login")
  }, [router])

  if (!token) return null

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
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Dev Mode</h1>
          <span className="text-xs font-medium bg-purple-100 text-purple-800 px-2.5 py-1 rounded-full border border-purple-200">
            Beta
          </span>
        </div>
        <p className="text-sm text-gray-500">개발 현황 · 버그 추적 · 시스템 구조 · 배포 이력</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#f0f0ec] p-1 rounded-xl mb-6 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative px-4 py-2 text-[13px] font-medium rounded-lg transition-colors ${
              tab === t.id
                ? "bg-white text-[#111110] shadow-sm"
                : "text-[#1a1a1a]/50 hover:text-[#111110]"
            }`}
          >
            {t.label}
            {t.id === "bugs" && openBugCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {openBugCount > 9 ? "9+" : openBugCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "roadmap" && <RoadmapTab token={token} />}
      {tab === "bugs" && <BugsTab token={token} userName={userName} onCountChange={setOpenBugCount} />}
      {tab === "patchnotes" && <PatchNotesTab token={token} />}
      {tab === "architecture" && <ArchitectureTab />}
      {tab === "gitlog" && <GitLogTab token={token} />}
    </div>
  )
}
