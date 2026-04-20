"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  ChevronRight,
  History,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { adminFetch } from "@/lib/admin-client"
import SubscriberTable from "@/components/admin/marketing/SubscriberTable"
import SubscriberForm from "@/components/admin/marketing/SubscriberForm"
import EmailComposer from "@/components/admin/marketing/EmailComposer"
import SmsComposer from "@/components/admin/marketing/SmsComposer"
import CampaignHistory from "@/components/admin/marketing/CampaignHistory"
import MarketingDashboard from "@/components/admin/marketing/MarketingDashboard"
import type { EmailCampaign, EmailDraft, SavedEmailSegment, Subscriber } from "@/lib/marketing-types"

type Tab = "subscribers" | "compose" | "history" | "dashboard"
type Channel = "email" | "sms"
type SubscriberStatusFilter = "all" | Subscriber["status"]
type SubscriberSourceFilter = "all" | Subscriber["source"]
type PreSendCheckStatus = "ok" | "warning" | "error" | "info"
type PreSendCheck = {
  key: string
  label: string
  detail: string
  status: PreSendCheckStatus
}

const EMPTY_DRAFT: EmailDraft = {
  subject: "",
  body: "",
  targetTags: [],
}

const SAVED_SEGMENTS_KEY = "classinkr.admin.email.savedSegments.v1"

function safeTime(value?: string) {
  if (!value) return 0
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? 0 : ts
}

function formatDateTime(value?: string) {
  if (!value) return "시간 정보 없음"
  const ts = new Date(value)
  if (Number.isNaN(ts.getTime())) return "시간 정보 없음"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts)
}

function countBy<T extends string>(items: T[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1
    return acc
  }, {})
}

function normalizeSubject(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase()
}

function bodyLength(body: string) {
  return body.replace(/\s+/g, " ").trim().length
}

function hasLikelyLink(body: string) {
  return /href\s*=|<a[\s>]|https?:\/\/|www\./i.test(body) || /\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/i.test(body)
}

function hasPlaceholderLink(body: string) {
  return /example\.com|your-domain|localhost|dummy|placeholder/i.test(body)
}

function checkToneClass(status: PreSendCheckStatus) {
  return status === "ok"
    ? "border-green-100 bg-green-50 text-green-700"
    : status === "warning"
      ? "border-amber-100 bg-amber-50 text-amber-700"
      : status === "error"
        ? "border-red-100 bg-red-50 text-red-600"
        : "border-[#e8e8e4] bg-[#f0f0ec] text-[#1a1a1a]/55"
}

function checkLabel(status: PreSendCheckStatus) {
  return status === "ok"
    ? "정상"
    : status === "warning"
      ? "주의"
      : status === "error"
        ? "미완료"
        : "정보"
}

function areTagsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const normalizedLeft = [...left].sort()
  const normalizedRight = [...right].sort()
  return normalizedLeft.every((tag, index) => tag === normalizedRight[index])
}

function readSavedSegmentsStorage() {
  if (typeof window === "undefined") return [] as SavedEmailSegment[]

  try {
    const raw = window.localStorage.getItem(SAVED_SEGMENTS_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is SavedEmailSegment => {
        return (
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          Array.isArray(item.targetTags) &&
          typeof item.createdAt === "string" &&
          typeof item.updatedAt === "string"
        )
      })
      .map((item) => ({
        ...item,
        targetTags: item.targetTags.filter((tag): tag is string => typeof tag === "string"),
      }))
      .sort((a, b) => safeTime(b.updatedAt) - safeTime(a.updatedAt))
  } catch {
    return []
  }
}

function persistSavedSegmentsStorage(segments: SavedEmailSegment[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(SAVED_SEGMENTS_KEY, JSON.stringify(segments))
}

function createSavedSegmentId() {
  return `segment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white shadow-[0_1px_0_rgba(17,17,16,0.02)]">
      <div className="flex flex-col gap-3 border-b border-[#e8e8e4] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">{title}</h2>
          {description && <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  )
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: ReactNode
  label: string
  value: string | number
  hint?: string
  tone?: "neutral" | "success" | "warning" | "danger"
}) {
  const toneClass =
    tone === "success"
      ? "bg-green-50 text-green-700"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700"
        : tone === "danger"
          ? "bg-red-50 text-red-600"
          : "bg-[#f0f0ec] text-[#1a1a1a]/50"

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className={`inline-flex rounded-xl p-2 ${toneClass}`}>{icon}</div>
      </div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#1a1a1a]/40">{label}</p>
      <p className="text-[28px] font-bold leading-none tracking-[-0.03em] text-[#111110]">{value}</p>
      {hint && <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">{hint}</p>}
    </div>
  )
}

function TabButton({
  active,
  icon,
  label,
  desc,
  count,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  desc: string
  count?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex min-w-[180px] flex-1 items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-all sm:min-w-0 ${
        active
          ? "border-[#111110] bg-[#111110] text-white shadow-sm"
          : "border-[#e8e8e4] bg-white text-[#1a1a1a]/65 hover:border-[#c8c8c4] hover:bg-[#fafaf8] hover:text-[#111110]"
      }`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? "bg-white/10" : "bg-[#f0f0ec]"}`}>
        <span className={active ? "text-white" : "text-[#1a1a1a]/45"}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold">{label}</p>
          {typeof count === "number" && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${active ? "bg-white/10 text-white" : "bg-[#e8e8e4] text-[#1a1a1a]/50"}`}>
              {count}
            </span>
          )}
        </div>
        <p className={`mt-0.5 text-[11px] ${active ? "text-white/70" : "text-[#1a1a1a]/40"}`}>{desc}</p>
      </div>
      <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${active ? "opacity-70" : "opacity-40 group-hover:translate-x-0.5"}`} />
    </button>
  )
}


function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-5 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#1a1a1a]/35 shadow-[0_1px_0_rgba(17,17,16,0.03)]">
        <Sparkles className="h-5 w-5" />
      </div>
      <p className="mt-4 text-[14px] font-medium text-[#111110]">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-[#1a1a1a]/40">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function EmptyInline({ message }: { message: string }) {
  return <p className="py-8 text-center text-[12px] text-[#1a1a1a]/30">{message}</p>
}

function MiniBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const className =
    tone === "success"
      ? "bg-green-50 text-green-700"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700"
        : tone === "danger"
          ? "bg-red-50 text-red-600"
          : "bg-[#f0f0ec] text-[#1a1a1a]/55"
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>
}

export default function AdminMarketingPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>("subscribers")
  const [channel, setChannel] = useState<Channel>("email")
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [composerDraft, setComposerDraft] = useState<EmailDraft>(EMPTY_DRAFT)
  const [savedSegments, setSavedSegments] = useState<SavedEmailSegment[]>(() => readSavedSegmentsStorage())
  const [loading, setLoading] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Subscriber | null>(null)
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null)
  const [draftNotice, setDraftNotice] = useState<string | null>(null)
  const [showClearDraftConfirm, setShowClearDraftConfirm] = useState(false)
  const [segmentName, setSegmentName] = useState("")
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<SubscriberStatusFilter>("all")
  const [sourceFilter, setSourceFilter] = useState<SubscriberSourceFilter>("all")
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<"all" | EmailCampaign["status"]>("all")

  const contentRef = useRef<HTMLDivElement>(null)
  const isInitialMount = useRef(true)

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    requestAnimationFrame(() => {
      contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [activeTab])

  const handleUnauthorized = useCallback(() => {
    sessionStorage.removeItem("admin_password")
    sessionStorage.removeItem("admin_token")
    sessionStorage.removeItem("admin_role")
    sessionStorage.removeItem("admin_name")
    sessionStorage.removeItem("admin_email")
    router.replace("/admin/login")
  }, [router])

  const showToast = useCallback((kind: "success" | "error", message: string) => {
    setToast({ kind, message })
    window.setTimeout(() => setToast(null), 2600)
  }, [])

  const fetchSubscribers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminFetch("/api/admin/subscribers")
      if (res.status === 401) {
        handleUnauthorized()
        return
      }
      if (res.ok) {
        const data = await res.json()
        setSubscribers(data.subscribers ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [handleUnauthorized])

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/email")
      if (res.status === 401) {
        handleUnauthorized()
        return
      }
      if (res.ok) {
        const data = await res.json()
        setCampaigns(data.campaigns ?? [])
      }
    } catch {
      // silent
    }
  }, [handleUnauthorized])

  useEffect(() => {
    void fetchSubscribers()
    void fetchCampaigns()
  }, [fetchSubscribers, fetchCampaigns])

  const activeCount = subscribers.filter((s) => s.status === "active").length
  const unsubscribedCount = subscribers.length - activeCount
  const sentCount = campaigns.filter((c) => c.status === "sent").length
  const draftCount = campaigns.filter((c) => c.status === "draft").length
  const failedCount = campaigns.filter((c) => c.status === "failed").length

  const latestCampaign = useMemo(
    () => [...campaigns].sort((a, b) => safeTime(b.sentAt ?? b.createdAt) - safeTime(a.sentAt ?? a.createdAt))[0],
    [campaigns]
  )
  const latestSubscriber = useMemo(
    () => [...subscribers].sort((a, b) => safeTime(b.createdAt) - safeTime(a.createdAt))[0],
    [subscribers]
  )
  const { recentSentCampaigns, recentFailedCampaigns, recentDraftCampaigns, recentSuccessRate, recentAudienceAverage } = useMemo(() => {
    const windowStart = Date.now() - 30 * 24 * 60 * 60 * 1000
    const window30d = campaigns.filter((c) => safeTime(c.sentAt ?? c.createdAt) >= windowStart)
    const sent = window30d.filter((c) => c.status === "sent")
    const failed = window30d.filter((c) => c.status === "failed")
    const draft = window30d.filter((c) => c.status === "draft")
    const successRate = sent.length + failed.length > 0
      ? Math.round((sent.length / (sent.length + failed.length)) * 100)
      : null
    const audienceAvg = sent.length > 0
      ? Math.round(sent.reduce((s, c) => s + c.recipientCount, 0) / sent.length)
      : 0
    return {
      recentSentCampaigns: sent,
      recentFailedCampaigns: failed,
      recentDraftCampaigns: draft,
      recentSuccessRate: successRate,
      recentAudienceAverage: audienceAvg,
    }
  }, [campaigns])

  const { sourceRows, topSource } = useMemo(() => {
    const counts = countBy(subscribers.map((s) => s.source))
    const order = ["demo_modal", "contact_page", "newsletter", "manual"] as const
    const rows = order
      .map((source) => ({ source, count: counts[source] ?? 0 }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count)
    return { sourceRows: rows, topSource: rows[0] }
  }, [subscribers])

  const recentCampaigns = useMemo(
    () => [...campaigns].sort((a, b) => safeTime(b.sentAt ?? b.createdAt) - safeTime(a.sentAt ?? a.createdAt)).slice(0, 4),
    [campaigns]
  )

  const filteredSubscribers = subscribers.filter((subscriber) => {
    const matchesQuery =
      !query.trim() ||
      [subscriber.name, subscriber.email, subscriber.org, subscriber.role, subscriber.phone, subscriber.tags.join(" ")]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(query.toLowerCase()))

    const matchesStatus = statusFilter === "all" || subscriber.status === statusFilter
    const matchesSource = sourceFilter === "all" || subscriber.source === sourceFilter
    return matchesQuery && matchesStatus && matchesSource
  })

  const filteredCampaigns = campaigns.filter((campaign) => campaignStatusFilter === "all" || campaign.status === campaignStatusFilter)

  // 태그별 active 구독자 수 맵 (TagSelector countMap용)
  const tagCountMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of subscribers) {
      if (s.status !== "active") continue
      for (const tag of s.tags) {
        map[tag] = (map[tag] ?? 0) + 1
      }
    }
    return map
  }, [subscribers])

  const activeSegment = useMemo(
    () => savedSegments.find((segment) => areTagsEqual(segment.targetTags, composerDraft.targetTags)) ?? null,
    [composerDraft.targetTags, savedSegments]
  )

  const updateSavedSegments = useCallback((segments: SavedEmailSegment[]) => {
    const sorted = [...segments].sort((a, b) => safeTime(b.updatedAt) - safeTime(a.updatedAt))
    setSavedSegments(sorted)
    persistSavedSegmentsStorage(sorted)
  }, [])

  const countSelectedAudience = useCallback(
    (targetTags: string[]) => {
      if (targetTags.length === 0) return activeCount
      return subscribers.filter(
        (subscriber) =>
          subscriber.status === "active" &&
          subscriber.tags.some((tag) => targetTags.includes(tag))
      ).length
    },
    [activeCount, subscribers]
  )

  const evaluateDraft = useCallback(
    (draft: EmailDraft) => {
      const normalizedSubject = normalizeSubject(draft.subject)
      const length = bodyLength(draft.body)
      const selectedAudience = countSelectedAudience(draft.targetTags)

      const recentDuplicateCampaign = [...campaigns]
        .sort((a, b) => safeTime(b.sentAt ?? b.createdAt) - safeTime(a.sentAt ?? a.createdAt))
        .find((campaign) => {
          if (normalizeSubject(campaign.subject) !== normalizedSubject) return false
          const sentTime = safeTime(campaign.sentAt ?? campaign.createdAt)
          return sentTime > 0 && Date.now() - sentTime <= 30 * 24 * 60 * 60 * 1000
        })

      const ctaMatch = draft.body.match(/(https?:\/\/[^\s<)"]+|www\.[^\s<)"]+|#\w+)/i)
      const ctaDetected = hasLikelyLink(draft.body)
      const ctaPlaceholder = hasPlaceholderLink(draft.body)

      const checks: PreSendCheck[] = [
        {
          key: "subject",
          label: "제목",
          status: draft.subject.trim() ? "ok" : "error",
          detail: draft.subject.trim()
            ? `제목이 입력되었습니다. (${draft.subject.trim().length}자)`
            : "제목을 입력해야 발송할 수 있습니다.",
        },
        {
          key: "body",
          label: "본문",
          status:
            length >= 120
              ? "ok"
              : length >= 60
                ? "warning"
                : "error",
          detail:
            length >= 120
              ? `본문 길이가 충분합니다. (${length}자)`
              : length >= 60
                ? `본문이 짧은 편입니다. (${length}자, 120자 이상 권장)`
                : `본문이 너무 짧습니다. (${length}자, 최소 60자 권장)`,
        },
        {
          key: "audience",
          label: "대상",
          status: selectedAudience > 0 ? "ok" : "error",
          detail:
            draft.targetTags.length === 0
              ? `전체 active 구독자 ${activeCount}명에게 발송됩니다.`
              : `선택 태그 기준 예상 발송 인원 ${selectedAudience}명`,
        },
        {
          key: "unsubscribe",
          label: "수신거부",
          status: unsubscribedCount > 0 ? "info" : "ok",
          detail: unsubscribedCount > 0
            ? `수신거부 ${unsubscribedCount}명은 자동 제외됩니다.`
            : "현재 수신거부 대상이 없습니다.",
        },
        {
          key: "cta",
          label: "CTA",
          status: ctaDetected ? (ctaPlaceholder ? "warning" : "ok") : "warning",
          detail: ctaDetected
            ? ctaPlaceholder
              ? "링크는 보이지만 예시/플레이스홀더로 보입니다."
              : `본문에서 CTA 링크를 찾았습니다. (${ctaMatch?.[1] ?? "확인됨"})`
            : "본문에서 CTA 링크를 찾지 못했습니다.",
        },
        {
          key: "duplicate",
          label: "중복 제목",
          status: recentDuplicateCampaign ? "warning" : "ok",
          detail: recentDuplicateCampaign
            ? `최근 30일 내 동일 제목이 이미 발송되었습니다. (${formatDateTime(recentDuplicateCampaign.sentAt ?? recentDuplicateCampaign.createdAt)})`
            : "최근 동일 제목 발송 이력이 없습니다.",
        },
      ]

      const errorCount = checks.filter((check) => check.status === "error").length
      const warningCount = checks.filter((check) => check.status === "warning").length
      const okCount = checks.filter((check) => check.status === "ok").length
      const readiness =
        errorCount > 0
          ? {
              status: "error" as const,
              label: "발송 불가",
              detail: "필수 항목을 먼저 채워주세요.",
            }
          : warningCount > 0
            ? {
                status: "warning" as const,
                label: "검토 필요",
                detail: "경고 항목을 한 번 더 보고 발송하세요.",
              }
            : {
                status: "ok" as const,
                label: "발송 가능",
                detail: "필수 체크를 모두 통과했습니다.",
              }

      const readinessScore = Math.round(((okCount + warningCount * 0.45) / checks.length) * 100)

      return {
        checks,
        readiness,
        readinessScore,
        selectedAudience,
        duplicateCampaign: recentDuplicateCampaign,
        hasCta: ctaDetected,
        hasPlaceholderLink: ctaPlaceholder,
        bodyLength: length,
      }
    },
    [activeCount, campaigns, countSelectedAudience, unsubscribedCount]
  )

  const composerReview = useMemo(() => evaluateDraft(composerDraft), [composerDraft, evaluateDraft])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(t)
  }, [toast])

  const handleAddSubscriber = async (data: {
    name: string
    email: string
    org?: string
    role?: string
    phone?: string
    tags: string[]
  }) => {
    setFormLoading(true)
    try {
      const res = await adminFetch("/api/admin/subscribers", {
        method: "POST",
        body: JSON.stringify(data),
      })
      if (res.status === 401) {
        handleUnauthorized()
        return
      }
      if (!res.ok) {
        showToast("error", "구독자 추가에 실패했습니다.")
        return
      }
      setIsFormOpen(false)
      await fetchSubscribers()
      showToast("success", "구독자가 추가되었습니다.")
    } catch {
      showToast("error", "구독자 추가에 실패했습니다.")
    } finally {
      setFormLoading(false)
    }
  }

  const handleDeleteSubscriber = async () => {
    if (!deleteTarget) return
    setFormLoading(true)
    try {
      const res = await adminFetch(`/api/admin/subscribers?id=${deleteTarget.id}`, { method: "DELETE" })
      if (res.status === 401) {
        handleUnauthorized()
        return
      }
      if (!res.ok) {
        showToast("error", "구독자 삭제에 실패했습니다.")
        return
      }
      setDeleteTarget(null)
      await fetchSubscribers()
      showToast("success", "구독자가 삭제되었습니다.")
    } catch {
      showToast("error", "구독자 삭제에 실패했습니다.")
    } finally {
      setFormLoading(false)
    }
  }

  const handleBulkDelete = async (ids: string[]) => {
    try {
      const res = await adminFetch("/api/admin/subscribers/bulk", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      })
      if (res.status === 401) {
        handleUnauthorized()
        return
      }
      if (!res.ok) {
        showToast("error", "일괄 삭제에 실패했습니다.")
        return
      }
      await fetchSubscribers()
      showToast("success", `${ids.length}명의 구독자가 삭제되었습니다.`)
    } catch {
      showToast("error", "일괄 삭제에 실패했습니다.")
    }
  }

  const handleBulkTagAdd = async (ids: string[], tags: string[]) => {
    try {
      const res = await adminFetch("/api/admin/subscribers/bulk", {
        method: "PATCH",
        body: JSON.stringify({ ids, tags }),
      })
      if (res.status === 401) {
        handleUnauthorized()
        return
      }
      if (!res.ok) {
        showToast("error", "태그 일괄 추가에 실패했습니다.")
        return
      }
      await fetchSubscribers()
      showToast("success", `${ids.length}명에게 태그가 추가되었습니다.`)
    } catch {
      showToast("error", "태그 일괄 추가에 실패했습니다.")
    }
  }

  const clearComposerDraft = useCallback(() => {
    const hasDraft = composerDraft.subject.trim() || composerDraft.body.trim() || composerDraft.targetTags.length > 0
    if (!hasDraft) {
      setComposerDraft({ ...EMPTY_DRAFT })
      setDraftNotice(null)
    } else {
      setShowClearDraftConfirm(true)
    }
  }, [composerDraft])

  const confirmClearDraft = useCallback(() => {
    setComposerDraft({ ...EMPTY_DRAFT })
    setDraftNotice(null)
    setShowClearDraftConfirm(false)
  }, [])

  const handleSaveSegment = useCallback(() => {
    const trimmedName = segmentName.trim()
    if (!trimmedName) {
      showToast("error", "세그먼트 이름을 입력해주세요.")
      return
    }

    if (composerDraft.targetTags.length === 0) {
      showToast("error", "저장할 태그를 하나 이상 선택해주세요.")
      return
    }

    const now = new Date().toISOString()
    const existing = savedSegments.find(
      (segment) => normalizeSubject(segment.name) === normalizeSubject(trimmedName)
    )

    const nextSegment: SavedEmailSegment = existing
      ? {
          ...existing,
          name: trimmedName,
          targetTags: [...composerDraft.targetTags],
          updatedAt: now,
        }
      : {
          id: createSavedSegmentId(),
          name: trimmedName,
          targetTags: [...composerDraft.targetTags],
          createdAt: now,
          updatedAt: now,
        }

    updateSavedSegments(
      existing
        ? savedSegments.map((segment) => (segment.id === existing.id ? nextSegment : segment))
        : [nextSegment, ...savedSegments]
    )
    setSegmentName(trimmedName)
    showToast("success", existing ? "저장 세그먼트를 업데이트했습니다." : "저장 세그먼트를 만들었습니다.")
  }, [composerDraft.targetTags, savedSegments, segmentName, showToast, updateSavedSegments])

  const handleApplySegment = useCallback((segment: SavedEmailSegment) => {
    setComposerDraft((current) => ({
      ...current,
      targetTags: [...segment.targetTags],
    }))
    updateSavedSegments(
      savedSegments.map((item) =>
        item.id === segment.id
          ? {
              ...item,
              updatedAt: new Date().toISOString(),
            }
          : item
      )
    )
    setSegmentName(segment.name)
    setDraftNotice(`저장 세그먼트 '${segment.name}'를 적용했습니다.`)
    setActiveTab("compose")
    showToast("success", `"${segment.name}" 세그먼트를 적용했습니다.`)
  }, [savedSegments, showToast, updateSavedSegments])

  const handleDeleteSegment = useCallback((segment: SavedEmailSegment) => {
    if (!window.confirm(`"${segment.name}" 세그먼트를 삭제할까요?`)) return
    updateSavedSegments(savedSegments.filter((item) => item.id !== segment.id))
    if (segmentName === segment.name) {
      setSegmentName("")
    }
    showToast("success", "세그먼트를 삭제했습니다.")
  }, [savedSegments, segmentName, showToast, updateSavedSegments])

  const handleDuplicateCampaign = useCallback((campaign: EmailCampaign) => {
    setComposerDraft({
      subject: `[복제] ${campaign.subject}`,
      body: campaign.body,
      targetTags: [...campaign.targetTags],
    })
    const linkedSegment = savedSegments.find((segment) => areTagsEqual(segment.targetTags, campaign.targetTags))
    setSegmentName(linkedSegment?.name ?? "")
    setDraftNotice(`'${campaign.subject}' 캠페인을 복제해 새 초안으로 불러왔습니다.`)
    setActiveTab("compose")
    showToast("success", `"${campaign.subject}" 캠페인을 작성기로 가져왔습니다.`)
  }, [savedSegments, showToast])

  const handleCopyCampaign = useCallback((campaign: EmailCampaign) => {
    setComposerDraft({
      subject: campaign.subject,
      body: campaign.body,
      targetTags: [...campaign.targetTags],
    })
    const linkedSegment = savedSegments.find((segment) => areTagsEqual(segment.targetTags, campaign.targetTags))
    setSegmentName(linkedSegment?.name ?? "")
    setDraftNotice(`'${campaign.subject}' 캠페인을 그대로 불러왔습니다. 수정 후 발송하세요.`)
    setActiveTab("compose")
    showToast("success", `"${campaign.subject}" 캠페인을 편집기로 가져왔습니다.`)
  }, [savedSegments, showToast])

  const handleComposeFromSubscriber = useCallback((subscriber: Subscriber) => {
    setComposerDraft((current) => ({
      ...current,
      targetTags: [...subscriber.tags],
    }))
    setDraftNotice(`${subscriber.name} 구독자를 기준으로 초안을 열었습니다.`)
    setActiveTab("compose")
    showToast("success", `${subscriber.name} 기준으로 발송 초안을 열었습니다.`)
  }, [showToast])

  const handleSendEmail = async (data: EmailDraft & { directEmails?: string[] }) => {
    // 직접 입력 모드면 audience 체크 스킵
    const isDirectMode = Array.isArray(data.directEmails) && data.directEmails.length > 0

    if (!isDirectMode) {
      const evaluated = evaluateDraft(data)
      const blockingErrors = evaluated.checks.filter((check) => check.status === "error")

      if (blockingErrors.length > 0) {
        showToast("error", blockingErrors[0]?.detail || "발송 전 체크를 확인해주세요.")
        return
      }

      if (evaluated.selectedAudience === 0) {
        showToast("error", "발송 대상이 없습니다. 태그 조건을 확인해주세요.")
        return
      }
    }

    setSendLoading(true)
    try {
      const res = await adminFetch("/api/admin/email/send", {
        method: "POST",
        body: JSON.stringify(data),
      })
      if (res.status === 401) {
        handleUnauthorized()
        return
      }
      const result = await res.json()
      if (result.ok && result.status !== "failed") {
        await fetchCampaigns()
        setComposerDraft({ ...EMPTY_DRAFT })
        setDraftNotice(null)
        setActiveTab("history")
        showToast("success", `${result.recipientCount}명에게 발송되었습니다.`)
      } else if (result.status === "failed") {
        await fetchCampaigns()
        setActiveTab("history")
        showToast("error", "발송은 시도했지만 웹훅 처리에 실패했습니다. 이력에서 상태를 확인해주세요.")
      } else {
        showToast("error", result.error || "발송에 실패했습니다.")
      }
    } catch {
      showToast("error", "발송 중 오류가 발생했습니다.")
    } finally {
      setSendLoading(false)
    }
  }

  const topActions: Array<{ key: Tab; label: string; icon: ReactNode }> = [
    { key: "subscribers", label: "구독자 추가", icon: <Plus className="h-4 w-4" /> },
    { key: "compose", label: "이메일 작성", icon: <Send className="h-4 w-4" /> },
    { key: "history", label: "이력 확인", icon: <History className="h-4 w-4" /> },
  ]

  const hasComposerDraft =
    composerDraft.subject.trim() ||
    composerDraft.body.trim() ||
    composerDraft.targetTags.length > 0

  const savedSegmentViews = useMemo(
    () => savedSegments.slice(0, 6).map((segment) => ({
      ...segment,
      recipientCount: countSelectedAudience(segment.targetTags),
    })),
    [savedSegments, countSelectedAudience]
  )

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-10">
        <div className="mb-8 flex flex-col gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-3">
                <p className="text-[12px] font-medium uppercase tracking-wide text-[#1a1a1a]/30">Admin</p>
                <a href="/admin/blog" className="inline-flex items-center gap-1 text-[11px] font-medium text-[#084734] hover:underline">
                  <ArrowLeft className="h-3 w-3" />
                  블로그 관리
                </a>
              </div>
              <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">캠페인</h1>
              <p className="mt-2 text-[13px] leading-relaxed text-[#1a1a1a]/45">
                구독자 관리, 이메일 발송, 발송 이력을 한 흐름으로 묶어 운영합니다. 지금 상태를 빠르게 보고, 다음 액션까지 바로 이어지도록 정리했습니다.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button variant="outline" size="sm" onClick={() => { fetchSubscribers(); fetchCampaigns() }} disabled={loading} className="w-full sm:w-auto">
                <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                새로고침
              </Button>
              {topActions
                .filter((action) => action.key !== activeTab)
                .map((action) => (
                  <Button
                    key={action.key}
                    size="sm"
                    variant={action.key === "compose" ? "default" : "outline"}
                    onClick={() => setActiveTab(action.key)}
                    className={`w-full sm:w-auto ${action.key === "compose" ? "bg-[#084734] hover:bg-[#084734]/90" : ""}`}
                  >
                    <span className="mr-1.5">{action.icon}</span>
                    {action.label}
                  </Button>
                ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={<Users className="h-4 w-4" />} label="전체 구독자" value={subscribers.length} hint="수동 추가 포함" />
            <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="활성 구독자" value={activeCount} hint="발송 대상" tone="success" />
            <StatCard icon={<XCircle className="h-4 w-4" />} label="수신거부" value={unsubscribedCount} hint="보존 중인 상태" tone="warning" />
            <StatCard icon={<Send className="h-4 w-4" />} label="발송 캠페인" value={campaigns.length} hint={`발송 ${sentCount} · 초안 ${draftCount}`} />
            <StatCard icon={<AlertCircle className="h-4 w-4" />} label="실패 캠페인" value={failedCount} hint="즉시 확인 필요" tone="danger" />
          </div>

          <Panel
            title="운영 요약"
            description="최근 30일 발송 결과와 현재 초안 상태를 한 번에 봅니다."
            action={
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setActiveTab("compose")}>
                  <Send className="mr-1.5 h-4 w-4" />
                  이메일 작성
                </Button>
                <Button variant="outline" size="sm" onClick={() => setActiveTab("history")}>
                  <History className="mr-1.5 h-4 w-4" />
                  발송 이력
                </Button>
              </div>
            }
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">최근 30일 발송</p>
                <p className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-[#111110]">{recentSentCampaigns.length}건</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                  {recentSentCampaigns.length + recentFailedCampaigns.length + recentDraftCampaigns.length > 0
                    ? `실패 ${recentFailedCampaigns.length}건 · 초안 ${recentDraftCampaigns.length}건`
                    : "아직 최근 발송 기록이 없습니다."}
                </p>
              </div>
              <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">발송 성공률</p>
                <p className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-[#111110]">
                  {recentSuccessRate === null ? "—" : `${recentSuccessRate}%`}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                  {recentSuccessRate === null
                    ? "발송과 실패가 쌓이면 자동으로 보입니다."
                    : "최근 발송 기준으로 성공/실패를 단순화해 봅니다."}
                </p>
              </div>
              <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">평균 대상 규모</p>
                <p className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-[#111110]">
                  {recentSentCampaigns.length > 0 ? `${recentAudienceAverage}명` : "대기"}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                  {recentSentCampaigns.length > 0
                    ? "최근 발송의 예상 도달 규모입니다."
                    : "세그먼트가 잡히면 평균 대상이 표시됩니다."}
                </p>
              </div>
              <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">현재 초안</p>
                <p className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-[#111110]">{composerReview.readiness.label}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                  {composerReview.selectedAudience}명 대상 · {composerReview.readiness.detail}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-[#1a1a1a]/45">
              <MiniBadge tone={failedCount > 0 ? "warning" : "success"}>
                {failedCount > 0 ? `확인 필요 ${failedCount}건` : "운영 안정"}
              </MiniBadge>
              <span>{latestCampaign ? `최근 발송: ${latestCampaign.subject}` : "최근 발송 없음"}</span>
              {topSource && <span>주요 유입: {topSource.source === "demo_modal" ? "데모 신청" : topSource.source === "contact_page" ? "문의" : topSource.source === "newsletter" ? "뉴스레터" : "수동 추가"}</span>}
            </div>
          </Panel>

          <div className="sticky top-0 z-20 -mx-4 px-4 pt-2 pb-3 sm:-mx-6 sm:px-6" style={{ background: "linear-gradient(to bottom, #FAFAF8 85%, transparent)" }}>
            <div className="flex flex-wrap gap-3 rounded-2xl border border-[#e8e8e4] bg-white p-3 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <TabButton
                active={activeTab === "subscribers"}
                icon={<Users className="h-4 w-4" />}
                label="구독자 관리"
                desc="목록 조회, 필터, 수동 추가"
                count={subscribers.length}
                onClick={() => setActiveTab("subscribers")}
              />
              <TabButton
                active={activeTab === "compose"}
                icon={<Send className="h-4 w-4" />}
                label="이메일 발송"
                desc="캠페인 작성과 대상 선택"
                count={draftCount}
                onClick={() => setActiveTab("compose")}
              />
              <TabButton
                active={activeTab === "history"}
                icon={<History className="h-4 w-4" />}
                label="발송 이력"
                desc="최근 발송 결과와 대상 확인"
                count={campaigns.length}
                onClick={() => setActiveTab("history")}
              />
              <TabButton
                active={activeTab === "dashboard"}
                icon={<BarChart2 className="h-4 w-4" />}
                label="현황 대시보드"
                desc="구독자·캠페인·자동화 한눈에"
                onClick={() => setActiveTab("dashboard")}
              />
            </div>
          </div>
        </div>

        <div ref={contentRef} className="scroll-mt-4">
        {activeTab === "subscribers" && (
          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
            <div className="space-y-6">
              <Panel
                title="구독자 관리"
                description="검색, 상태, 유입 경로를 빠르게 좁혀서 후속 작업으로 이어갑니다."
                action={
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setActiveTab("compose")}>
                      이메일 작성
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={() => setIsFormOpen(true)} className="bg-[#084734] hover:bg-[#084734]/90">
                      <Plus className="mr-1.5 h-4 w-4" />
                      구독자 추가
                    </Button>
                  </div>
                }
              >
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/30" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="이름, 이메일, 학원명, 태그 검색"
                      className="pl-10"
                    />
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {(["all", "active", "unsubscribed"] as const).map((value) => (
                      <button
                        key={value}
                        onClick={() => setStatusFilter(value)}
                        className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap ${
                          statusFilter === value
                            ? "border-[#111110] bg-[#111110] text-white"
                            : "border-[#e8e8e4] bg-white text-[#1a1a1a]/55 hover:border-[#c8c8c4] hover:text-[#111110]"
                        }`}
                      >
                        {value === "all" ? "전체" : value === "active" ? "수신중" : "거부"}
                      </button>
                    ))}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {(["all", "demo_modal", "contact_page", "newsletter", "manual"] as const).map((value) => (
                      <button
                        key={value}
                        onClick={() => setSourceFilter(value)}
                        className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap ${
                          sourceFilter === value
                            ? "border-[#084734] bg-[#084734]/10 text-[#084734]"
                            : "border-[#e8e8e4] bg-white text-[#1a1a1a]/55 hover:border-[#c8c8c4] hover:text-[#111110]"
                        }`}
                      >
                        {value === "all" ? "소스 전체" : value === "demo_modal" ? "데모" : value === "contact_page" ? "문의" : value === "newsletter" ? "뉴스레터" : "수동"}
                      </button>
                    ))}
                  </div>
                </div>

                {loading ? (
                  <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-6 py-12 text-center text-[13px] text-[#1a1a1a]/35">
                    구독자 정보를 불러오는 중...
                  </div>
                ) : subscribers.length === 0 ? (
                  <EmptyState
                    title="아직 구독자가 없습니다."
                    description="뉴스레터 구독, 데모 신청, 문의 유입이 들어오면 이곳에서 바로 정리할 수 있습니다."
                    action={
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button size="sm" onClick={() => setIsFormOpen(true)} className="bg-[#084734] hover:bg-[#084734]/90">
                          <Plus className="mr-1.5 h-4 w-4" />
                          첫 구독자 추가
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setActiveTab("compose")}>
                          이메일 먼저 작성
                        </Button>
                      </div>
                    }
                  />
                ) : filteredSubscribers.length === 0 ? (
                  <EmptyState
                    title="조건에 맞는 구독자가 없습니다."
                    description="검색어나 상태 필터를 조금 넓혀보세요. 태그와 유입 경로를 함께 보면 더 빨리 찾을 수 있습니다."
                    action={
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setQuery("")
                            setStatusFilter("all")
                            setSourceFilter("all")
                          }}
                        >
                          필터 초기화
                        </Button>
                        <Button size="sm" onClick={() => setIsFormOpen(true)} className="bg-[#084734] hover:bg-[#084734]/90">
                          <Plus className="mr-1.5 h-4 w-4" />
                          구독자 추가
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setActiveTab("compose")}>
                          이메일 작성
                        </Button>
                      </div>
                    }
                  />
                ) : (
                  <SubscriberTable
                    subscribers={filteredSubscribers}
                    onDelete={setDeleteTarget}
                    onCompose={handleComposeFromSubscriber}
                    onAddSubscriber={() => setIsFormOpen(true)}
                    onComposeCampaign={() => setActiveTab("compose")}
                    onBulkDelete={handleBulkDelete}
                    onBulkTagAdd={handleBulkTagAdd}
                  />
                )}
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel title="채널 믹스" description="어느 유입 경로가 실제로 쌓이고 있는지 확인합니다.">
                {sourceRows.length === 0 ? (
                  <EmptyInline message="아직 유입 경로 데이터가 없습니다." />
                ) : (
                  <div className="space-y-3">
                    {sourceRows.map((row) => {
                      const label =
                        row.source === "demo_modal"
                          ? "데모 신청"
                          : row.source === "contact_page"
                            ? "문의"
                            : row.source === "newsletter"
                              ? "뉴스레터"
                              : "수동 추가"
                      const width = Math.max(10, Math.min(100, (row.count / Math.max(subscribers.length, 1)) * 100))
                      return (
                        <div key={row.source} className="space-y-1.5 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[13px] font-medium text-[#111110]">{label}</p>
                            <span className="text-[12px] text-[#1a1a1a]/45">{row.count}명</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#e8e8e4]">
                            <div className="h-1.5 rounded-full bg-[#084734]" style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Panel>

              <Panel title="운영 메모" description="지금 이 탭에서 바로 할 수 있는 일만 보여줍니다.">
                <div className="space-y-3">
                  <div className="rounded-2xl bg-[#fafaf8] border border-[#e8e8e4] p-4">
                    <p className="text-[12px] font-medium text-[#111110]">발송 대상</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                      활성 구독자 {activeCount}명 기준으로 이메일 발송이 진행됩니다.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#fafaf8] border border-[#e8e8e4] p-4">
                    <p className="text-[12px] font-medium text-[#111110]">최근 등록</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                      {latestSubscriber ? `${latestSubscriber.name} · ${formatDateTime(latestSubscriber.createdAt)}` : "아직 등록된 구독자가 없습니다."}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#fafaf8] border border-[#e8e8e4] p-4">
                    <p className="text-[12px] font-medium text-[#111110]">추천 다음 액션</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                      태그별 대상이 잡히면 곧바로 이메일 작성 탭으로 넘어가 발송 초안을 만들어보세요.
                    </p>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        )}

        {activeTab === "compose" && (
          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-4">
              {/* 채널 토글 */}
              <div className="flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-white p-1.5">
                <button
                  onClick={() => setChannel("email")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-all ${
                    channel === "email"
                      ? "bg-[#111110] text-white shadow-sm"
                      : "text-[#1a1a1a]/55 hover:text-[#111110]"
                  }`}
                >
                  <Send className="h-3.5 w-3.5" />
                  이메일
                </button>
                <button
                  onClick={() => setChannel("sms")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-all ${
                    channel === "sms"
                      ? "bg-[#111110] text-white shadow-sm"
                      : "text-[#1a1a1a]/55 hover:text-[#111110]"
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  문자 (SMS/LMS)
                </button>
              </div>

              {/* 초안 상태 배너 (이메일 채널 + 초안 있을 때만) */}
              {channel === "email" && (activeSegment || hasComposerDraft) && (
                <div className="flex flex-col gap-2 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[12px] text-[#1a1a1a]/55">
                    {draftNotice
                      ? draftNotice
                      : activeSegment
                        ? `"${activeSegment.name}" 세그먼트 기준`
                        : "초안이 유지됩니다 — 탭 이동 후 돌아와도 내용이 남아있습니다."}
                  </p>
                  <Button variant="outline" size="sm" onClick={clearComposerDraft} className="shrink-0 text-[12px]">
                    초안 비우기
                  </Button>
                </div>
              )}

              {activeCount === 0 && channel === "email" && (
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                  활성 구독자가 없습니다. 발송 대상이 비어 있을 수 있으니 먼저 구독자를 확인하세요.
                </div>
              )}

              {channel === "email" ? (
                <EmailComposer
                  value={composerDraft}
                  onChange={setComposerDraft}
                  onSend={handleSendEmail}
                  loading={sendLoading}
                  subscriberCount={activeCount}
                  countMap={tagCountMap}
                  presendWarnings={composerReview.checks.filter((c) => c.status === "warning").map((c) => c.detail)}
                  presendErrors={composerReview.checks.filter((c) => c.status === "error").map((c) => c.detail)}
                  selectedAudience={composerReview.selectedAudience}
                  subscribers={subscribers}
                />
              ) : (
                <SmsComposer
                  subscriberCount={activeCount}
                  countMap={tagCountMap}
                />
              )}
            </div>

            <div className="space-y-6">
              <Panel
                title="발송 전 체크"
                description="실제 발송 전에 꼭 봐야 하는 항목들입니다."
                action={
                  <MiniBadge
                    tone={composerReview.readiness.status === "ok" ? "success" : composerReview.readiness.status === "warning" ? "warning" : "danger"}
                  >
                    {composerReview.readiness.label}
                  </MiniBadge>
                }
              >
                <div className="space-y-1">
                  {composerReview.checks.map((check) => (
                    <div key={check.key} className={`rounded-lg border px-3 py-2 ${checkToneClass(check.status)}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold leading-tight">{check.label}</p>
                        <span className="shrink-0 rounded-full border border-current/15 px-2 py-0.5 text-[10px] font-medium">
                          {checkLabel(check.status)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-snug opacity-70">{check.detail}</p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel
                title="저장 세그먼트"
                description="자주 쓰는 발송 대상을 이름으로 저장해 다음 캠페인에서 바로 불러옵니다."
                action={activeSegment ? <MiniBadge tone="success">적용 중</MiniBadge> : undefined}
              >
                <div className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Input
                      value={segmentName}
                      onChange={(event) => setSegmentName(event.target.value)}
                      placeholder="예) 원장 + VIP"
                    />
                    <Button
                      type="button"
                      onClick={handleSaveSegment}
                      className="bg-[#084734] hover:bg-[#084734]/90"
                      disabled={composerDraft.targetTags.length === 0}
                    >
                      세그먼트 저장
                    </Button>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[#1a1a1a]/40">
                    현재는 태그 조합만 저장합니다. 전체 발송은 저장하지 않고 바로 사용하도록 두었습니다.
                  </p>

                  {savedSegmentViews.length === 0 ? (
                    <EmptyInline message="저장된 세그먼트가 없습니다. 태그를 고른 뒤 이름을 붙여 저장해보세요." />
                  ) : (
                    <div className="space-y-3">
                      {savedSegmentViews.map((segment) => {
                        const isActive = activeSegment?.id === segment.id
                        return (
                          <div key={segment.id} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-[13px] font-semibold text-[#111110]">{segment.name}</p>
                                  {isActive && <MiniBadge tone="success">적용됨</MiniBadge>}
                                </div>
                                <p className="mt-1 text-[12px] text-[#1a1a1a]/40">
                                  예상 발송 {segment.recipientCount}명 · {formatDateTime(segment.updatedAt)}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {segment.targetTags.map((tag) => (
                                    <MiniBadge key={tag}>#{tag}</MiniBadge>
                                  ))}
                                </div>
                              </div>
                              <div className="flex gap-2 sm:shrink-0">
                                <Button variant="outline" size="sm" onClick={() => handleApplySegment(segment)}>
                                  적용
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleDeleteSegment(segment)}>
                                  삭제
                                </Button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </Panel>

            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-6">
              <Panel
                title="발송 이력"
                description="최근 캠페인 결과를 상태 중심으로 확인하고, 바로 복제해서 새 초안으로 이어갑니다."
                action={
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCampaignStatusFilter("all")}>
                      전체
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setActiveTab("compose")}>
                      <Send className="mr-1.5 h-4 w-4" />
                      이메일 작성
                    </Button>
                  </div>
                }
              >
                <div className="mb-4 flex flex-wrap gap-2">
                  {(["all", "sent", "draft", "failed"] as const).map((value) => (
                    <button
                      key={value}
                      onClick={() => setCampaignStatusFilter(value)}
                      className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                        campaignStatusFilter === value
                          ? "border-[#111110] bg-[#111110] text-white"
                          : "border-[#e8e8e4] bg-white text-[#1a1a1a]/55 hover:border-[#c8c8c4] hover:text-[#111110]"
                      }`}
                    >
                      {value === "all" ? "전체" : value === "sent" ? "발송됨" : value === "draft" ? "초안" : "실패"}
                    </button>
                  ))}
                </div>

                {campaigns.length === 0 ? (
                  <EmptyState
                    title="아직 발송된 캠페인이 없습니다."
                    description="첫 발송을 만들면 이력과 요약이 동시에 쌓입니다."
                    action={
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button size="sm" onClick={() => setActiveTab("compose")} className="bg-[#084734] hover:bg-[#084734]/90">
                          발송 만들기
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setActiveTab("subscribers")}>
                          구독자 확인
                        </Button>
                      </div>
                    }
                  />
                ) : filteredCampaigns.length === 0 ? (
                  <EmptyState
                    title="필터에 맞는 캠페인이 없습니다."
                    description="상태 필터를 조금 넓혀보세요. 초안, 발송됨, 실패를 각각 따로 볼 수 있습니다."
                    action={
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setCampaignStatusFilter("all")}>
                          필터 초기화
                        </Button>
                        <Button size="sm" onClick={() => setActiveTab("compose")} className="bg-[#084734] hover:bg-[#084734]/90">
                          <Send className="mr-1.5 h-4 w-4" />
                          발송 만들기
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setActiveTab("subscribers")}>
                          구독자 보기
                        </Button>
                      </div>
                    }
                  />
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-[#e8e8e4]">
                    <CampaignHistory
                      campaigns={filteredCampaigns}
                      onDuplicate={handleDuplicateCampaign}
                      onCopy={handleCopyCampaign}
                      onCreateCampaign={() => setActiveTab("compose")}
                      onViewSubscribers={() => setActiveTab("subscribers")}
                    />
                  </div>
                )}
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel title="상태 요약" description="최근 발송의 운영 맥락을 바로 보여줍니다.">
                {recentCampaigns.length === 0 ? (
                  <EmptyInline message="최근 캠페인 정보가 없습니다." />
                ) : (
                  <div className="space-y-3">
                    {recentCampaigns.map((campaign) => (
                      <div key={campaign.id} className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-[#111110]">{campaign.subject}</p>
                            <p className="mt-1 text-[12px] text-[#1a1a1a]/40">
                              {formatDateTime(campaign.sentAt ?? campaign.createdAt)} · 대상 {campaign.recipientCount}명
                            </p>
                          </div>
                          <MiniBadge
                            tone={
                              campaign.status === "sent"
                                ? "success"
                                : campaign.status === "failed"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {campaign.status === "sent" ? "발송됨" : campaign.status === "failed" ? "실패" : "초안"}
                          </MiniBadge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {campaign.targetTags.length > 0 ? (
                              campaign.targetTags.map((tag) => (
                                <MiniBadge key={tag}>#{tag}</MiniBadge>
                              ))
                            ) : (
                              <MiniBadge>전체 발송</MiniBadge>
                            )}
                        </div>
                        <div className="mt-3 flex justify-end">
                          <Button variant="outline" size="sm" onClick={() => handleDuplicateCampaign(campaign)}>
                            복제해서 작성
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="추천 다음 액션" description="이력 데이터 기반으로 바로 할 수 있는 것을 제안합니다.">
                <div className="space-y-2">
                  {recentDraftCampaigns.length > 0 && (
                    <button
                      onClick={() => setActiveTab("compose")}
                      className="w-full rounded-xl border border-amber-100 bg-amber-50 p-3 text-left transition-colors hover:bg-amber-100/60"
                    >
                      <p className="text-[12px] font-semibold text-amber-700">
                        미완성 초안 {recentDraftCampaigns.length}개
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-amber-600/80">
                        작성 탭에서 제목과 대상 태그를 확정하고 발송을 완료하세요.
                      </p>
                    </button>
                  )}
                  {recentFailedCampaigns.length > 0 && (
                    <button
                      onClick={() => setCampaignStatusFilter("failed")}
                      className="w-full rounded-xl border border-red-100 bg-red-50 p-3 text-left transition-colors hover:bg-red-100/60"
                    >
                      <p className="text-[12px] font-semibold text-red-700">
                        실패 캠페인 {recentFailedCampaigns.length}개 점검 필요
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-red-600/80">
                        발송 설정 또는 웹훅 상태를 확인하세요.
                      </p>
                    </button>
                  )}
                  {recentSuccessRate !== null && recentSuccessRate > 0 && recentSuccessRate < 80 && (
                    <button
                      onClick={() => setActiveTab("subscribers")}
                      className="w-full rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3 text-left transition-colors hover:bg-[#f0f0ec]"
                    >
                      <p className="text-[12px] font-semibold text-[#111110]">
                        최근 성공률 {recentSuccessRate}% — 구독자 점검
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[#1a1a1a]/45">
                        거부 상태 구독자나 잘못된 이메일을 정리하면 개선됩니다.
                      </p>
                    </button>
                  )}
                  {latestCampaign && (
                    <button
                      onClick={() => handleDuplicateCampaign(latestCampaign)}
                      className="w-full rounded-xl border border-[#084734]/15 bg-[#ECFDF5] p-3 text-left transition-colors hover:bg-[#D1FAE5]"
                    >
                      <p className="text-[12px] font-semibold text-[#084734]">
                        최근 캠페인 복제해서 재활용
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[#084734]/60 truncate">
                        &ldquo;{latestCampaign.subject}&rdquo; 기반으로 새 발송 시작
                      </p>
                    </button>
                  )}
                  {recentDraftCampaigns.length === 0 && recentFailedCampaigns.length === 0 && !latestCampaign && (
                    <div className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3">
                      <p className="text-[12px] text-[#1a1a1a]/40">발송 이력이 쌓이면 맞춤 제안이 나타납니다.</p>
                    </div>
                  )}
                </div>
              </Panel>
            </div>
          </div>
        )}

        {activeTab === "dashboard" && (
          <MarketingDashboard />
        )}
        </div>
      </div>

      <Dialog open={isFormOpen} onOpenChange={(v) => !v && setIsFormOpen(false)}>
        <DialogContent className="sm:max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle>구독자 수동 추가</DialogTitle>
            <DialogDescription>운영 중 바로 잡아 넣어야 하는 구독자를 등록합니다.</DialogDescription>
          </DialogHeader>
          <SubscriberForm
            onSave={handleAddSubscriber}
            onCancel={() => setIsFormOpen(false)}
            loading={formLoading}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>구독자 삭제</DialogTitle>
            <DialogDescription>
              <strong>{deleteTarget?.name}</strong>
              {deleteTarget ? ` (${deleteTarget.email})` : ""} 구독자를 삭제하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={formLoading}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleDeleteSubscriber} disabled={formLoading}>
              {formLoading ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showClearDraftConfirm} onOpenChange={setShowClearDraftConfirm}>
        <DialogContent className="sm:max-w-sm bg-white">
          <DialogHeader>
            <DialogTitle>초안 비우기</DialogTitle>
            <DialogDescription>작성 중인 내용을 모두 지우고 새로 시작합니다.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDraftConfirm(false)}>취소</Button>
            <Button variant="destructive" onClick={confirmClearDraft}>비우기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-[13px] font-medium shadow-xl ${
            toast.kind === "success" ? "bg-[#111110] text-white" : "bg-red-500 text-white"
          }`}
        >
          {toast.kind === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
    </div>
  )
}
