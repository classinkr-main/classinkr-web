"use client"

import { useEffect, useState } from "react"
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

// ─── Constants ───────────────────────────────────────────
const TABS = [
  { id: "roadmap", label: "로드맵" },
  { id: "bugs", label: "버그 리포트" },
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
function RoadmapTab({ token }: { token: string }) {
  const [versions, setVersions] = useState<RoadmapVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch("/api/admin/roadmap", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        setVersions(Array.isArray(data) ? data : [])
        // Auto-expand in-progress versions
        const inProgress = data.filter((v: RoadmapVersion) => v.status === "in-progress").map((v: RoadmapVersion) => v.id)
        setExpanded(new Set(inProgress))
      })
      .finally(() => setLoading(false))
  }, [token])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (loading) return <div className="text-center py-12 text-gray-400">로드맵 로딩중...</div>

  const totalFeatures = versions.flatMap((v) => v.features)
  const doneCount = totalFeatures.filter((f) => f.status === "done").length
  const progress = totalFeatures.length > 0 ? Math.round((doneCount / totalFeatures.length) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">전체 진행률</h3>
          <span className="text-2xl font-bold text-[#1e8aff]">{progress}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className="bg-[#1e8aff] h-3 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mt-2">
          {doneCount} / {totalFeatures.length} 기능 완료
        </p>
      </div>

      {/* Version Cards */}
      {versions.map((ver) => {
        const vDone = ver.features.filter((f) => f.status === "done").length
        const vProgress = ver.features.length > 0 ? Math.round((vDone / ver.features.length) * 100) : 0
        const isExpanded = expanded.has(ver.id)
        const sc = VERSION_STATUS[ver.status]

        return (
          <div key={ver.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => toggleExpand(ver.id)}
              className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${sc.badge}`}>
                  {sc.label}
                </span>
                <span className="font-bold text-gray-900">{ver.version}</span>
                <span className="text-gray-600">{ver.title}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">
                  {ver.startDate} ~ {ver.targetDate}
                </span>
                <span className="text-sm font-medium text-[#1e8aff]">{vProgress}%</span>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 p-5">
                <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
                  <div className="bg-[#1e8aff] h-2 rounded-full" style={{ width: `${vProgress}%` }} />
                </div>
                <div className="space-y-2">
                  {ver.features.map((feat) => {
                    const fs = FEATURE_STATUS[feat.status]
                    return (
                      <div key={feat.id} className="flex items-center gap-3 py-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${fs.dot}`} />
                        <span className="flex-1 text-sm text-gray-800">{feat.title}</span>
                        <span className={`text-xs font-medium ${fs.text}`}>{fs.label}</span>
                        <span className="text-xs text-gray-400">{feat.assignee}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Bug Report Tab ───────────────────────────────────────
function BugsTab({ token, userName }: { token: string; userName: string }) {
  const [bugs, setBugs] = useState<BugReport[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | BugReport["status"]>("all")
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    title: "",
    description: "",
    severity: "medium" as BugReport["severity"],
    environment: "",
    tags: "",
  })

  const load = () => {
    fetch("/api/admin/bugs", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setBugs(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    await fetch("/api/admin/bugs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ...form,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        reporter: userName,
      }),
    })
    setForm({ title: "", description: "", severity: "medium", environment: "", tags: "" })
    setShowForm(false)
    setSubmitting(false)
    load()
  }

  const updateStatus = async (id: string, status: BugReport["status"]) => {
    await fetch(`/api/admin/bugs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    })
    load()
  }

  const deleteBug = async (id: string) => {
    if (!confirm("버그 리포트를 삭제할까요?")) return
    await fetch(`/api/admin/bugs/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    load()
  }

  const filtered = filter === "all" ? bugs : bugs.filter((b) => b.status === filter)

  const statusCounts = {
    all: bugs.length,
    open: bugs.filter((b) => b.status === "open").length,
    "in-progress": bugs.filter((b) => b.status === "in-progress").length,
    resolved: bugs.filter((b) => b.status === "resolved").length,
    closed: bugs.filter((b) => b.status === "closed").length,
  }

  if (loading) return <div className="text-center py-12 text-gray-400">로딩중...</div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["all", "open", "in-progress", "resolved", "closed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                filter === s
                  ? "bg-[#1e8aff] text-white border-[#1e8aff]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {s === "all" ? "전체" : BUG_STATUS_CONFIG[s].label} ({statusCounts[s]})
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-[#1e8aff] text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
        >
          <span>+ 버그 등록</span>
        </button>
      </div>

      {/* New Bug Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-blue-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">새 버그 리포트</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">제목 *</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
                placeholder="버그 제목을 입력하세요"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">심각도</label>
              <select
                value={form.severity}
                onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as BugReport["severity"] }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">설명 *</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              required
              rows={3}
              placeholder="재현 방법, 기대 동작, 실제 동작 등을 기술해주세요"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">환경</label>
              <input
                value={form.environment}
                onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))}
                placeholder="예: prod, staging, local"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">태그 (쉼표 구분)</label>
              <input
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="예: auth, UI, api"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-[#1e8aff] text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {submitting ? "등록중..." : "등록"}
            </button>
          </div>
        </form>
      )}

      {/* Bug List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="text-4xl mb-3">🐛</div>
          <p className="text-gray-500">버그 리포트가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((bug) => {
            const sc = SEVERITY_CONFIG[bug.severity]
            const stc = BUG_STATUS_CONFIG[bug.status]
            return (
              <div key={bug.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-mono text-gray-400">{bug.id}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${sc.bg}`}>
                        {sc.label}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${stc.bg}`}>
                        {stc.label}
                      </span>
                      {bug.environment && (
                        <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                          {bug.environment}
                        </span>
                      )}
                      {bug.tags.map((tag) => (
                        <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <p className="font-medium text-gray-900">{bug.title}</p>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{bug.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>{bug.reporter}</span>
                      <span>·</span>
                      <span>{new Date(bug.createdAt).toLocaleDateString("ko-KR")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={bug.status}
                      onChange={(e) => updateStatus(bug.id, e.target.value as BugReport["status"])}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none"
                    >
                      <option value="open">오픈</option>
                      <option value="in-progress">진행중</option>
                      <option value="resolved">해결됨</option>
                      <option value="closed">종료</option>
                    </select>
                    <button
                      onClick={() => deleteBug(bug.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
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
        { name: "홈페이지", desc: "마케팅 랜딩 페이지, 섹션별 컴포넌트" },
        { name: "Admin Dashboard", desc: "/admin/* — 미들웨어 보호, 역할 기반 라우팅" },
        { name: "API Routes", desc: "/api/* — 서버사이드 비즈니스 로직" },
      ],
    },
    {
      title: "Auth 시스템",
      color: "bg-yellow-50 border-yellow-200",
      headerColor: "bg-yellow-100",
      items: [
        { name: "Cookie Auth", desc: "httpOnly cookie (admin_session) — 미들웨어에서 검증" },
        { name: "Multi-role", desc: "admin (팀원 전체 접근) / branch (지사장 본인 데이터)" },
        { name: "ADMIN_USERS", desc: "환경변수 JSON 배열로 계정 관리 (Supabase 전 임시)" },
      ],
    },
    {
      title: "데이터 레이어 (임시 JSON DB)",
      color: "bg-green-50 border-green-200",
      headerColor: "bg-green-100",
      items: [
        { name: "data/leads.json", desc: "리드 데이터 — GET/POST/PATCH/DELETE" },
        { name: "data/settings.json", desc: "사이트 설정 토글 — GET/PATCH" },
        { name: "data/roadmap.json", desc: "로드맵 버전/기능 — GET/PATCH/POST" },
        { name: "data/bugs.json", desc: "버그 리포트 — GET/POST/PATCH/DELETE" },
      ],
    },
    {
      title: "외부 연동",
      color: "bg-purple-50 border-purple-200",
      headerColor: "bg-purple-100",
      items: [
        { name: "Google Sheets", desc: "리드 데이터 실시간 동기화 (Webhook)" },
        { name: "ChannelTalk", desc: "리드 이벤트 알림" },
        { name: "Webhook", desc: "외부 자동화 트리거" },
      ],
    },
    {
      title: "마이그레이션 계획 (v2.1+)",
      color: "bg-red-50 border-red-200",
      headerColor: "bg-red-100",
      items: [
        { name: "Supabase Auth", desc: "ADMIN_USERS 환경변수 → Supabase Auth + RLS" },
        { name: "PostgreSQL", desc: "JSON 파일 → Supabase PostgreSQL + Edge Functions" },
        { name: "Realtime", desc: "리드 실시간 알림, 대시보드 라이브 업데이트" },
      ],
    },
  ]

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <strong>시스템 구조 문서</strong> — 현재 Classin 홈페이지 및 Admin Dashboard 아키텍처 개요
      </div>
      {sections.map((section) => (
        <div key={section.title} className={`rounded-xl border ${section.color} overflow-hidden`}>
          <div className={`px-5 py-3 ${section.headerColor}`}>
            <h3 className="font-semibold text-gray-900 text-sm">{section.title}</h3>
          </div>
          <div className="p-4 space-y-2">
            {section.items.map((item) => (
              <div key={item.name} className="flex gap-3">
                <span className="font-mono text-xs bg-white border border-gray-200 rounded px-2 py-1 flex-shrink-0 self-start mt-0.5">
                  {item.name}
                </span>
                <span className="text-sm text-gray-600">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Data Flow */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">리드 데이터 플로우</h3>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {[
            "홈페이지 폼",
            "POST /api/lead",
            "JSON DB 저장",
            "Google Sheet 동기화",
            "Webhook 트리거",
            "ChannelTalk 알림",
          ].map((step, i, arr) => (
            <div key={step} className="flex items-center gap-2">
              <span className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700">
                {step}
              </span>
              {i < arr.length - 1 && <span className="text-gray-400">→</span>}
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

  if (loading) return <div className="text-center py-12 text-gray-400">git log 로딩중...</div>
  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
      {error}
    </div>
  )

  const getCommitType = (message: string) => {
    if (message.startsWith("feat")) return { label: "feat", bg: "bg-green-100 text-green-800" }
    if (message.startsWith("fix")) return { label: "fix", bg: "bg-red-100 text-red-800" }
    if (message.startsWith("refactor")) return { label: "refactor", bg: "bg-purple-100 text-purple-800" }
    if (message.startsWith("docs")) return { label: "docs", bg: "bg-blue-100 text-blue-800" }
    if (message.startsWith("chore")) return { label: "chore", bg: "bg-gray-100 text-gray-600" }
    if (message.startsWith("style")) return { label: "style", bg: "bg-pink-100 text-pink-800" }
    if (message.startsWith("test")) return { label: "test", bg: "bg-yellow-100 text-yellow-800" }
    if (message.startsWith("Merge")) return { label: "merge", bg: "bg-indigo-100 text-indigo-800" }
    return { label: "commit", bg: "bg-gray-100 text-gray-600" }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-500 mb-2">최근 {commits.length}개 커밋</div>
      {commits.map((commit) => {
        const type = getCommitType(commit.message)
        const date = new Date(commit.date)
        const refs = commit.refs.split(",").map((r) => r.trim()).filter(Boolean)
        return (
          <div key={commit.hash} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4">
            <div className="flex-shrink-0">
              <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                {commit.hash}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${type.bg}`}>
                  {type.label}
                </span>
                {refs.map((ref) => (
                  <span key={ref} className="text-xs bg-yellow-50 text-yellow-800 border border-yellow-200 px-2 py-0.5 rounded-full">
                    {ref}
                  </span>
                ))}
              </div>
              <p className="text-sm font-medium text-gray-900 truncate">{commit.message}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                <span>{commit.author}</span>
                <span>·</span>
                <span>{date.toLocaleDateString("ko-KR")} {date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
          </div>
        )
      })}
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

  useEffect(() => {
    const t = sessionStorage.getItem("admin_token") || ""
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
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "roadmap" && <RoadmapTab token={token} />}
      {tab === "bugs" && <BugsTab token={token} userName={userName} />}
      {tab === "architecture" && <ArchitectureTab />}
      {tab === "gitlog" && <GitLogTab token={token} />}
    </div>
  )
}
