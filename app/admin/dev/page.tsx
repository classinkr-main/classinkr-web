"use client"

import React, { useEffect, useState, useCallback } from "react"
import type { PatchNote, PatchChange, ChangeType, NoteStatus } from "@/lib/patch-notes-data"
import type {
  AdminIntegrationStatusResponse,
  AdminIntegrationHealth,
} from "@/lib/admin-integrations/types"
import { useRouter } from "next/navigation"
import DataQualityPanel from "@/components/admin/branch/sections/DataQualityPanel"

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
  stats?: { files: number; added: number; deleted: number }
}

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

// ─── Dev Cache ───────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000 // 5분

function getCached<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (new Date().getTime() - ts > CACHE_TTL) return null
    return data as T
  } catch { return null }
}

function setCache<T>(key: string, data: T) {
  try { sessionStorage.setItem(key, JSON.stringify({ data, ts: new Date().getTime() })) } catch {}
}

function RefreshBtn({ onClick, refreshing }: { onClick: () => void; refreshing: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={refreshing}
      className="flex items-center gap-1.5 text-[11px] text-[#1a1a1a]/50 hover:text-[#1a1a1a]/80 bg-[#f5f5f2] hover:bg-[#ededea] px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
    >
      <svg className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      {refreshing ? "갱신중" : "새로고침"}
    </button>
  )
}

// ─── Toast / Notify ──────────────────────────────────────
type ToastKind = "success" | "error"
type Notify = (msg: string, type?: ToastKind) => void

function DevToast({ msg, type }: { msg: string; type: ToastKind }) {
  return (
    <div
      role="status"
      aria-live="polite"
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
const TABS = [
  { id: "roadmap", label: "로드맵", description: "버전별 개발 계획과 기능 진행률을 관리합니다." },
  { id: "bugs", label: "버그 리포트", description: "오픈 이슈, 심각도, 담당자와 처리 상태를 추적합니다." },
  { id: "releaseCriteria", label: "공개 기준", description: "기능을 공개하기 전에 책임자, 검증, 데이터와 복구 기준을 확인합니다." },
  { id: "dataQuality", label: "데이터 품질", description: "KR Team 데이터 동기화와 품질 규칙 결과를 점검합니다." },
  { id: "patchnotes", label: "패치노트", description: "공개/초안 릴리스 노트와 변경사항을 관리합니다." },
  { id: "architecture", label: "시스템 구조", description: "프론트엔드, 데이터 레이어, 외부 연동 구조를 확인합니다." },
  { id: "gitlog", label: "배포 이력", description: "최근 커밋, 브랜치 참조, 변경량을 빠르게 확인합니다." },
] as const

type Tab = typeof TABS[number]["id"]

const DEFAULT_TAB: Tab = "roadmap"

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

const FEATURE_STATUS = {
  done: { label: "완료", dot: "bg-emerald-500", text: "text-emerald-600" },
  "in-progress": { label: "진행중", dot: "bg-amber-400", text: "text-amber-600" },
  planned: { label: "예정", dot: "bg-[#A39E98]", text: "text-[#615D59]" },
}

const VERSION_STATUS = {
  done: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "완료" },
  "in-progress": { badge: "bg-amber-50 text-amber-700 border-amber-200", label: "진행중" },
  planned: { badge: "bg-[#f0f0ec] text-[#615D59] border-[#e8e8e4]", label: "예정" },
}

// ─── Roadmap Tab ─────────────────────────────────────────
const EMPTY_VER_FORM = {
  version: "",
  title: "",
  status: "planned" as RoadmapVersion["status"],
  startDate: "",
  targetDate: "",
}

function RoadmapTab({ token, notify }: { token: string; notify: Notify }) {
  const [versions, setVersions] = useState<RoadmapVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_VER_FORM })
  const [submitting, setSubmitting] = useState(false)
  const [addingFeat, setAddingFeat] = useState<string | null>(null)
  const [featForm, setFeatForm] = useState({ title: "", status: "planned" as RoadmapFeature["status"], assignee: "" })

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` }

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCached<RoadmapVersion[]>("dev_cache_roadmap")
      if (cached) {
        setVersions(cached)
        setExpanded(new Set(cached.filter((v) => v.status === "in-progress").map((v) => v.id)))
        setLoading(false)
        return
      }
    }
    if (force) setRefreshing(true)
    const data = await fetch("/api/admin/roadmap", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).catch(() => [])
    const list = Array.isArray(data) ? data : []
    setVersions(list)
    setExpanded(new Set(list.filter((v: RoadmapVersion) => v.status === "in-progress").map((v: RoadmapVersion) => v.id)))
    setCache("dev_cache_roadmap", list)
    setLoading(false)
    setRefreshing(false)
  }, [token])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const openCreate = () => { setEditId(null); setForm({ ...EMPTY_VER_FORM }); setShowForm(true) }
  const openEdit = (ver: RoadmapVersion) => {
    setEditId(ver.id)
    setForm({ version: ver.version, title: ver.title, status: ver.status, startDate: ver.startDate ?? "", targetDate: ver.targetDate ?? "" })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = editId
        ? await fetch("/api/admin/roadmap", { method: "PATCH", headers, body: JSON.stringify({ id: editId, ...form }) })
        : await fetch("/api/admin/roadmap", { method: "POST", headers, body: JSON.stringify({ ...form, features: [] }) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setShowForm(false); setEditId(null)
      notify(editId ? "버전을 수정했습니다." : "버전을 추가했습니다.")
      load(true)
    } catch {
      notify("버전 저장에 실패했습니다. 다시 시도해 주세요.", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const persistFeatures = async (ver: RoadmapVersion, updated: RoadmapFeature[], failMsg: string) => {
    const prev = ver.features
    setVersions((list) => list.map((v) => v.id === ver.id ? { ...v, features: updated } : v))
    try {
      const res = await fetch("/api/admin/roadmap", { method: "PATCH", headers, body: JSON.stringify({ id: ver.id, features: updated }) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      setVersions((list) => list.map((v) => v.id === ver.id ? { ...v, features: prev } : v))
      notify(failMsg, "error")
    }
  }

  const updateFeatureStatus = async (ver: RoadmapVersion, featId: string, status: RoadmapFeature["status"]) => {
    const updated = ver.features.map((f) => f.id === featId ? { ...f, status } : f)
    await persistFeatures(ver, updated, "기능 상태 변경을 저장하지 못했습니다.")
  }

  const deleteFeat = async (ver: RoadmapVersion, featId: string) => {
    const updated = ver.features.filter((f) => f.id !== featId)
    await persistFeatures(ver, updated, "기능 삭제를 저장하지 못했습니다.")
  }

  const addFeat = async (ver: RoadmapVersion) => {
    if (!featForm.title.trim()) return
    const newFeat: RoadmapFeature = { id: uid("f"), title: featForm.title.trim(), status: featForm.status, assignee: featForm.assignee.trim() }
    const updated = [...ver.features, newFeat]
    setAddingFeat(null); setFeatForm({ title: "", status: "planned", assignee: "" })
    await persistFeatures(ver, updated, "기능 추가를 저장하지 못했습니다.")
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
        <div className="flex items-center gap-2 shrink-0">
          <RefreshBtn onClick={() => load(true)} refreshing={refreshing} />
          <button onClick={openCreate} className="px-3 py-1.5 bg-[#111110] text-white text-[12px] font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors">
            + 버전 추가
          </button>
        </div>
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
        {[...versions].sort((a, b) => {
          const da = a.startDate ? new Date(a.startDate).getTime() : Infinity
          const db = b.startDate ? new Date(b.startDate).getTime() : Infinity
          return da - db
        }).map((ver, idx, sorted) => {
          const isExpanded = expanded.has(ver.id)
          const isLast = idx === sorted.length - 1
          const sc = VERSION_STATUS[ver.status]
          const vDone = ver.features.filter((f) => f.status === "done").length
          const vProgress = ver.features.length > 0 ? Math.round((vDone / ver.features.length) * 100) : 0

          return (
            <div key={ver.id} className="flex gap-4">
              {/* Stepper rail */}
              <div className="flex flex-col items-center w-10 shrink-0">
                {idx > 0 && <div className="w-px flex-none h-4 bg-[#e8e8e4]" />}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 border-2 ${
                  ver.status === "done" ? "bg-emerald-500 border-emerald-500" :
                  ver.status === "in-progress" ? "bg-amber-400 border-amber-400" :
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
                    <span className="text-[11px] font-medium text-[#615D59]">{vProgress}%</span>
                    <button onClick={() => openEdit(ver)} className="text-[10px] px-2 py-0.5 rounded-full border border-[#e8e8e4] text-[#1a1a1a]/40 hover:border-[#c8c8c4] hover:text-[#111110] transition-all">수정</button>
                  </div>
                  <svg className={`w-3.5 h-3.5 text-[#1a1a1a]/25 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>

                {isExpanded && (
                  <div className="border-t border-[#e8e8e4] px-5 py-4">
                    {ver.features.length > 0 && (
                      <div className="w-full bg-[#f0f0ec] rounded-full h-1.5 mb-4">
                        <div className={`h-1.5 rounded-full ${ver.status === "done" ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${vProgress}%` }} />
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
                            <button onClick={() => deleteFeat(ver, feat.id)} className="opacity-0 group-hover:opacity-100 text-[#1a1a1a]/20 hover:text-[#B85C33] transition-all p-0.5">
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
function BugsTab({ token, userName, notify, onCountChange }: { token: string; userName: string; notify: Notify; onCountChange?: (n: number) => void }) {
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

  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCached<BugReport[]>("dev_cache_bugs")
      if (cached) {
        setBugs(cached)
        onCountChange?.(cached.filter((b) => b.status === "open").length)
        setLoading(false)
        return
      }
    }
    if (force) setRefreshing(true)
    const data = await fetch("/api/admin/bugs", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).catch(() => [])
    const list = Array.isArray(data) ? data : []
    setBugs(list)
    onCountChange?.(list.filter((b: BugReport) => b.status === "open").length)
    setCache("dev_cache_bugs", list)
    setLoading(false)
    setRefreshing(false)
  }, [token, onCountChange])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch("/api/admin/bugs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
      const res = await fetch(`/api/admin/bugs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setCache("dev_cache_bugs", next)
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
      const res = await fetch(`/api/admin/bugs/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setCache("dev_cache_bugs", next)
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
                  <select value={bug.status} onChange={(e) => updateStatus(bug.id, e.target.value as BugReport["status"])} className="text-[11px] border border-[#e8e8e4] rounded-lg px-2 py-1 focus:outline-none bg-[#fafaf8] cursor-pointer">
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
                    <button onClick={() => setDeleteConfirm(bug.id)} className="text-[#1a1a1a]/20 hover:text-[#B85C33] transition-colors p-1">
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

function PatchNotesTab({ token, notify }: { token: string; notify: Notify }) {
  const [notes, setNotes] = React.useState<PatchNote[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showForm, setShowForm] = React.useState(false)
  const [editId, setEditId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState({ ...EMPTY_FORM })
  const [submitting, setSubmitting] = React.useState(false)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` }

  const [refreshing, setRefreshing] = React.useState(false)

  const load = React.useCallback(async (force = false) => {
    if (!force) {
      const cached = getCached<PatchNote[]>("dev_cache_patchnotes")
      if (cached) { setNotes(cached); setLoading(false); return }
    }
    if (force) setRefreshing(true)
    const data = await fetch("/api/admin/patch-notes", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).catch(() => [])
    const list = Array.isArray(data) ? data : []
    setNotes(list)
    setCache("dev_cache_patchnotes", list)
    setLoading(false)
    setRefreshing(false)
  }, [token])

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
        ? await fetch(`/api/admin/patch-notes/${editId}`, { method: "PATCH", headers, body: JSON.stringify(form) })
        : await fetch("/api/admin/patch-notes", { method: "POST", headers, body: JSON.stringify(form) })
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
      const res = await fetch(`/api/admin/patch-notes/${note.id}`, {
        method: "PATCH", headers, body: JSON.stringify({ status: next }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setCache("dev_cache_patchnotes", updated)
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
      const res = await fetch(`/api/admin/patch-notes/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setCache("dev_cache_patchnotes", next)
      notify("패치노트를 삭제했습니다.")
    } catch {
      setNotes(prev)
      notify("패치노트 삭제를 저장하지 못했습니다.", "error")
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-400">로딩 중...</div>

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
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
                    className="text-[#1a1a1a]/20 hover:text-[#B85C33] transition-colors p-1 shrink-0"
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
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#ECFDF5] text-[#084734] font-medium">feat {feats.length}</span>
                    )}
                    {fixes.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#FEF3EE] text-[#B85C33] font-medium">fix {fixes.length}</span>
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
                      className="text-[#1a1a1a]/20 hover:text-[#B85C33] transition-colors p-1"
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
const HEALTH_TONE: Record<AdminIntegrationHealth, { label: string; dot: string; chip: string }> = {
  ok:      { label: "정상",   dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  warning: { label: "주의",   dot: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 border-amber-200" },
  error:   { label: "오류",   dot: "bg-rose-500",    chip: "bg-rose-50 text-rose-700 border-rose-200" },
  unknown: { label: "미확인", dot: "bg-[#d0d0cc]",   chip: "bg-[#f0f0ec] text-[#615D59] border-[#e8e8e4]" },
}

const INTEGRATION_SOURCE_LABEL: Record<string, string> = {
  env: "환경변수",
  db: "DB 설정",
  mixed: "환경변수 + DB",
  not_configured: "미설정",
}

function getSupabaseHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function ArchitectureTab({ token }: { token: string }) {
  const [status, setStatus] = useState<AdminIntegrationStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusError, setStatusError] = useState("")

  const loadStatus = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCached<AdminIntegrationStatusResponse>("dev_cache_integrations")
      if (cached) { setStatus(cached); setLoading(false); return }
    }
    if (force) setRefreshing(true)
    try {
      const r = await fetch("/api/admin/settings/integrations/status", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = (await r.json()) as AdminIntegrationStatusResponse
      setStatus(data)
      setCache("dev_cache_integrations", data)
      setStatusError("")
    } catch {
      setStatusError("연동 상태를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [token])

  useEffect(() => { loadStatus() }, [loadStatus])

  const supabaseHost = getSupabaseHost()
  const items = status?.items ?? []
  const configuredCount = items.filter((item) => item.configured).length

  const sections = [
    {
      title: "Frontend (Next.js 16 App Router)",
      color: "bg-[#ECFDF5] border-[#D1FAE5]",
      headerColor: "bg-[#D1FAE5]",
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
        { name: "admin_profiles", desc: "Supabase 관리자 프로필을 계정 정본으로 사용" },
        { name: "역할 + 기능 권한", desc: "슈퍼 어드민 / 지사장 / 어드민 역할 위에 슈퍼 어드민이 기능별 권한을 부여" },
        { name: "데이터 범위", desc: "관리자는 전체 데이터를 조회하고, 내 리드·내 할 일은 담당자 매핑으로 별도 모아보기" },
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
      title: "인프라 & 배포",
      color: "bg-slate-50 border-slate-200",
      headerColor: "bg-slate-100",
      items: [
        { name: "Vercel", desc: "Next.js 배포 — Git 푸시 시 프리뷰 생성, 프로덕션 승격" },
        { name: "Supabase", desc: `PostgreSQL + Storage — ${supabaseHost ?? "NEXT_PUBLIC_SUPABASE_URL 미설정"}` },
        { name: "GitHub", desc: "소스 저장소 — 푸시 시 Vercel 자동 빌드·배포 트리거" },
      ],
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#f0f0ec] border border-[#e8e8e4] rounded-xl p-4 text-[12px] text-[#1a1a1a]/55">
        <span>
          <strong className="text-[#111110]">시스템 구조</strong> — Supabase(PostgreSQL) 백엔드 운영 중. 아래 연동 상태는 실시간으로 조회합니다.
        </span>
        {status?.generatedAt && (
          <span className="text-[11px] text-[#1a1a1a]/35">상태 조회 {fmtDate(status.generatedAt)} {new Date(status.generatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
        )}
      </div>

      {/* Live 연동 상태 */}
      <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#e8e8e4]">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-[#111110]">연동 상태</h3>
            {!loading && !statusError && (
              <span className="text-[11px] text-[#1a1a1a]/40">연결 {configuredCount} / {items.length}</span>
            )}
          </div>
          <RefreshBtn onClick={() => loadStatus(true)} refreshing={refreshing} />
        </div>
        <div className="p-4">
          {loading ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-[58px] rounded-xl border border-[#e8e8e4] bg-[#fafaf8] animate-pulse" />
              ))}
            </div>
          ) : statusError ? (
            <div className="rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-[12px] text-[#B85C33]">
              {statusError}
            </div>
          ) : items.length === 0 ? (
            <p className="text-[12px] text-[#1a1a1a]/40 py-2">표시할 연동 항목이 없습니다.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((item) => {
                const tone = HEALTH_TONE[item.health] ?? HEALTH_TONE.unknown
                return (
                  <div key={item.key} className="flex items-start gap-3 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2.5">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-medium text-[#111110] truncate">{item.label}</span>
                        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${tone.chip}`}>{tone.label}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
                        {item.configured ? (INTEGRATION_SOURCE_LABEL[item.source] ?? item.source) : "미설정"}
                        {item.lastErrorSummary ? ` · ${item.lastErrorSummary}` : ""}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
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
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [expandedCommits, setExpandedCommits] = useState<Set<string>>(new Set())

  const fetchCommits = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCached<GitCommit[]>("dev_cache_gitlog")
      if (cached) { setCommits(cached); setLoading(false); return }
    }
    if (force) setRefreshing(true)
    try {
      const r = await fetch("/api/admin/git-log", { headers: { Authorization: `Bearer ${token}` } })
      const data = await r.json()
      if (data.error) setError(data.error)
      else {
        const list = Array.isArray(data) ? data : []
        setCommits(list)
        setCache("dev_cache_gitlog", list)
        setLastUpdated(new Date())
        setError("")
      }
    } catch {
      setError("git log를 가져올 수 없습니다")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [token])

  useEffect(() => { fetchCommits() }, [fetchCommits])

  if (loading) return <div className="text-center py-12 text-[#1a1a1a]/40 text-[13px]">git log 로딩중...</div>
  if (error) return (
    <div className="bg-[#FEF3EE] border border-[#F6D5C5] rounded-xl p-5 text-[#B85C33] text-[13px]">{error}</div>
  )

  const getCommitType = (message: string) => {
    if (message.startsWith("feat"))     return { label: "feat",     bg: "bg-[#ECFDF5] text-[#084734]",   dot: "bg-[#084734]" }
    if (message.startsWith("fix"))      return { label: "fix",      bg: "bg-[#FEF3EE] text-[#B85C33]",  dot: "bg-[#B85C33]" }
    if (message.startsWith("refactor")) return { label: "refactor", bg: "bg-[#f0f0ec] text-[#615D59]",  dot: "bg-[#A39E98]" }
    if (message.startsWith("docs"))     return { label: "docs",     bg: "bg-[#F6F5F4] text-[#615D59]",  dot: "bg-[#A39E98]" }
    if (message.startsWith("chore"))    return { label: "chore",    bg: "bg-[#f0f0ec] text-[#615D59]",  dot: "bg-[#d0d0cc]" }
    if (message.startsWith("style"))    return { label: "style",    bg: "bg-[#D1FAE5] text-[#065c41]",  dot: "bg-[#6EE7B7]" }
    if (message.startsWith("test"))     return { label: "test",     bg: "bg-yellow-100 text-yellow-800", dot: "bg-yellow-400" }
    if (message.startsWith("design"))   return { label: "design",   bg: "bg-[#D1FAE5] text-[#065c41]",  dot: "bg-[#6EE7B7]" }
    if (message.startsWith("Merge"))    return { label: "merge",    bg: "bg-[#f0f0ec] text-[#615D59]",  dot: "bg-[#A39E98]" }
    return { label: "commit", bg: "bg-[#f0f0ec] text-[#615D59]", dot: "bg-[#d0d0cc]" }
  }

  const grouped = commits.reduce<{ date: string; items: GitCommit[] }[]>((acc, commit) => {
    const dateKey = new Date(commit.date).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
    const last = acc[acc.length - 1]
    if (last && last.date === dateKey) last.items.push(commit)
    else acc.push({ date: dateKey, items: [commit] })
    return acc
  }, [])

  const toggleCommit = (hash: string) =>
    setExpandedCommits((prev) => {
      const next = new Set(prev)
      if (next.has(hash)) next.delete(hash)
      else next.add(hash)
      return next
    })

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-[12px] text-[#1a1a1a]/40">최근 {commits.length}개 커밋</p>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[11px] text-[#1a1a1a]/30">
              {lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 갱신
            </span>
          )}
          <RefreshBtn onClick={() => fetchCommits(true)} refreshing={refreshing} />
        </div>
      </div>
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
                        {commit.stats && commit.stats.files > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-[#1a1a1a]/30">{commit.stats.files}파일</span>
                            {commit.stats.added > 0 && <span className="text-green-600/70">+{commit.stats.added}</span>}
                            {commit.stats.deleted > 0 && <span className="text-[#B85C33]/60">-{commit.stats.deleted}</span>}
                          </>
                        )}
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

// ─── Release Criteria Tab ─────────────────────────────────
const RELEASE_GATES = [
  {
    title: "범위와 책임",
    items: ["책임자와 목표일이 지정됨", "완료 조건이 사용자 행동으로 적혀 있음", "비범위와 후속 작업이 분리됨"],
    tab: "roadmap" as const,
  },
  {
    title: "품질과 복구",
    items: ["차단급 버그가 없음", "eslint·build·관련 테스트를 통과함", "삭제·상태 변경을 취소하거나 되돌릴 수 있음"],
    tab: "bugs" as const,
  },
  {
    title: "데이터와 권한",
    items: ["표시 숫자의 원천과 갱신 시점을 설명할 수 있음", "역할·기능 권한을 서버에서 검사함", "모바일 핵심 흐름을 확인함"],
    tab: "dataQuality" as const,
  },
  {
    title: "공개와 운영",
    items: ["한국어 UI와 합의된 고유 용어를 사용함", "공개 변경사항과 운영 영향이 기록됨", "롤백 또는 기능 비활성화 방법이 있음"],
    tab: "patchnotes" as const,
  },
] as const

function ReleaseCriteriaTab({
  openBugCount,
  onNavigate,
}: {
  openBugCount: number
  onNavigate: (tab: Tab) => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#e8e8e4] bg-[#ECFDF5] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#084734]/60">Release gate</p>
        <h2 className="mt-1 text-lg font-bold text-[#084734]">공개는 체크리스트가 아니라 증거로 승인합니다.</h2>
        <p className="mt-2 text-[13px] leading-6 text-[#084734]/75">
          아래 네 영역의 근거가 모두 있고 차단급 버그가 없을 때만 공개합니다. 현재 오픈 버그는 {openBugCount}건입니다.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {RELEASE_GATES.map((gate, index) => (
          <article key={gate.title} className="rounded-xl border border-[#e8e8e4] bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[14px] font-semibold text-[#111110]">{index + 1}. {gate.title}</h3>
              <button
                type="button"
                onClick={() => onNavigate(gate.tab)}
                className="rounded-lg border border-[#e8e8e4] bg-[#F6F5F4] px-2.5 py-1.5 text-[11px] font-medium text-[#615D59] hover:bg-white"
              >
                근거 확인
              </button>
            </div>
            <ul className="mt-4 space-y-2">
              {gate.items.map((item) => (
                <li key={item} className="flex gap-2 text-[12px] leading-5 text-[#615D59]">
                  <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#084734]" />
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-[12px] leading-5 text-[#B85C33]">
        차단 기준: 데이터 유실 가능성, 권한 우회, 핵심 저장 실패, 잘못된 매출·재고 확정값, 되돌릴 수 없는 연쇄 삭제.
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
        </div>
        <p className="text-sm text-gray-500">프로젝트 현황 · 공개 기준 · 버그 추적 · 데이터 품질 · 배포 이력</p>
      </div>

      {/* Tabs */}
      <div
        className="mb-4 grid gap-1 rounded-2xl border border-[#e8e8e4] bg-[#f0f0ec] p-1 sm:grid-cols-2 lg:grid-cols-7"
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
            onClick={() => selectTab(t.id)}
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
        {tab === "roadmap" && <RoadmapTab token={token} notify={notify} />}
        {tab === "bugs" && <BugsTab token={token} userName={userName} notify={notify} onCountChange={setOpenBugCount} />}
        {tab === "releaseCriteria" && <ReleaseCriteriaTab openBugCount={openBugCount} onNavigate={selectTab} />}
        {tab === "dataQuality" && <DataQualityPanel mode="dev" />}
        {tab === "patchnotes" && <PatchNotesTab token={token} notify={notify} />}
        {tab === "architecture" && <ArchitectureTab token={token} />}
        {tab === "gitlog" && <GitLogTab token={token} />}
      </section>

      {toast && <DevToast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
