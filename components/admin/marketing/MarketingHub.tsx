"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  History,
  Plus,
  Search,
  Send,
  Sparkles,
  Users,
  XCircle,
  Zap,
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
import { adminFetch, adminFetchJsonCached, getAdminToken } from "@/lib/admin-client"
import ShowMore, { useVisibleCount } from "@/components/admin/ui/ShowMore"
import SubscriberTable from "@/components/admin/marketing/SubscriberTable"
import SubscriberForm from "@/components/admin/marketing/SubscriberForm"
import CampaignHistory from "@/components/admin/marketing/CampaignHistory"
import MessageLogTable from "@/components/admin/marketing/MessageLogTable"
import SendCenter from "@/components/admin/marketing/SendCenter"
import SendCenterHeader from "@/components/admin/marketing/SendCenterHeader"
import AutomationRuleList from "@/components/admin/marketing/AutomationRuleList"
import AutomationRuleDetail from "@/components/admin/marketing/AutomationRuleDetail"
import AutomationRuleSlideOver from "@/components/admin/marketing/AutomationRuleSlideOver"
import AutomationLogTable from "@/components/admin/marketing/AutomationLogTable"
import TemplateCard from "@/components/admin/marketing/TemplateCard"
import TemplateEditorDrawer from "@/components/admin/marketing/TemplateEditorDrawer"
import type { PreSendCheck } from "@/components/admin/marketing/send-center-types"
import { unwrapMessagingData, type MessagingStatus } from "@/lib/messaging-client-types"
import type { EmailCampaign, EmailDraft, SavedEmailSegment, Subscriber } from "@/lib/marketing-types"
import type {
  AutomationRule,
  AutomationLog,
  EmailTemplate,
  CreateRuleRequest,
  CreateTemplateRequest,
} from "@/lib/automation-types"
import type { MessagePrefill } from "@/lib/message-prefill"

// 발송 상태 캐시 TTL — 60초 stale 허용(같은 URL을 쓰는 다른 화면과 캐시 키 공유, CMP-2).
const MESSAGING_STATUS_CACHE_TTL_MS = 60_000

type Tab = "subscribers" | "compose" | "history" | "automation"
type SubscriberStatusFilter = "all" | Subscriber["status"]
type SubscriberSourceFilter = "all" | Subscriber["source"]

const EMPTY_DRAFT: EmailDraft = {
  subject: "",
  body: "",
  targetTags: [],
}

const SAVED_SEGMENTS_KEY = "classinkr.admin.email.savedSegments.v1"

// 구독자 목록 무한스크롤 대체 — 검색어(query)는 서버 미지원(클라측 전용) 필터라 서버
// offset 페이징을 도입하면 필터와 충돌한다(뒤 페이지에 검색어 일치 행이 남아있어도
// 안 보임). 그래서 클라 배열 슬라이싱(ShowMore)으로 안전하게 처리한다 — 초기 50, step 50.
const SUBSCRIBER_LIST_STEP = 50

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

function TabButton({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  count?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex min-w-[164px] flex-1 items-center gap-2 rounded-xl border px-3 py-3 text-left transition-all sm:min-w-0 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-4 ${
        active
          ? "border-[#111110] bg-[#111110] text-white shadow-sm"
          : "border-[#e8e8e4] bg-white text-[#1a1a1a]/65 hover:border-[#c8c8c4] hover:bg-[#fafaf8] hover:text-[#111110]"
      }`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl ${active ? "bg-white/10" : "bg-[#f0f0ec]"}`}>
        <span className={active ? "text-white" : "text-[#1a1a1a]/45"}>{icon}</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <p className="text-[13px] font-semibold">{label}</p>
        {typeof count === "number" && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${active ? "bg-white/10 text-white" : "bg-[#e8e8e4] text-[#1a1a1a]/50"}`}>
            {count}
          </span>
        )}
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

interface MarketingHubProps {
  /** 고객 360 딥링크(?message_to=)에서 온 수신자 프리필 — 마운트 시 1회만 캡처한다. */
  recipientPrefill?: MessagePrefill | null
  /** 프리필을 적용(소모)한 직후 호출 — 부모가 상태를 비워 허브 재마운트 시 재적용을 막는다. */
  onRecipientPrefillConsumed?: () => void
}

export default function MarketingHub({
  recipientPrefill: recipientPrefillProp,
  onRecipientPrefillConsumed,
}: MarketingHubProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>("subscribers")
  // 수신자 프리필은 마운트 시점 값만 캡처한다(one-shot). 이후 부모가 비워도 배너·초기값은 유지되고,
  // 사용자가 "지우기"를 누르면 여기서 함께 사라진다.
  const [recipientPrefill, setRecipientPrefill] = useState<MessagePrefill | null>(
    () => recipientPrefillProp ?? null
  )
  const recipientPrefillAppliedRef = useRef(false)

  // 늦게 도착한 프리필 흡수 — ?tab=email 직링크에서는 허브(dynamic) 마운트가 부모의 프리필
  // 캡처 effect보다 먼저 끝날 수 있다. 아직 한 번도 적용하지 않았을 때만 prop을 받아들이므로
  // "지우기" 이후나 적용 완료 후에 다시 채워지는 일은 없다.
  useEffect(() => {
    if (!recipientPrefillProp || recipientPrefillAppliedRef.current) return
    setRecipientPrefill(recipientPrefillProp)
  }, [recipientPrefillProp])

  // 프리필 1회 적용: 발송 작성(단체 발송 센터) 탭으로 이동한다.
  // 전화번호 수신자 입력이 존재하는 곳은 알림톡 테스트 발송뿐이므로, 센터(SendCenter)가
  // 프리필을 보고 알림톡 테스트 패널을 자동으로 열고 번호를 미리 채운다.
  // ref 가드로 마운트 후 딱 한 번만 실행 — 이후 사용자의 탭 이동을 다시 덮지 않는다.
  useEffect(() => {
    if (!recipientPrefill || recipientPrefillAppliedRef.current) return
    recipientPrefillAppliedRef.current = true
    setActiveTab("compose")
    onRecipientPrefillConsumed?.()
  }, [recipientPrefill, onRecipientPrefillConsumed])
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [messagingStatus, setMessagingStatus] = useState<MessagingStatus | null>(null)
  const [messagingStatusLoaded, setMessagingStatusLoaded] = useState(false)
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
  // 헤더 DB 스트립 표기용 — 구독자 목록을 마지막으로 가져온 시각(실제 fetch 완료 기준)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  // ── 자동화(규칙·템플릿·로그) — 자동화 탭 최초 진입 시 lazy-load ──
  const [autoRules, setAutoRules] = useState<AutomationRule[]>([])
  const [autoTemplates, setAutoTemplates] = useState<EmailTemplate[]>([])
  const [autoLogs, setAutoLogs] = useState<AutomationLog[]>([])
  const [autoSubTab, setAutoSubTab] = useState<"rules" | "templates" | "logs">("rules")
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)
  const [slideOverOpen, setSlideOverOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [triggeringId, setTriggeringId] = useState<string | null>(null)
  const [autoLoading, setAutoLoading] = useState(false) // 최초 GET 로드 표시용
  const [autoSaving, setAutoSaving] = useState(false) // 슬라이드오버·에디터 저장 버튼용
  const [autoLoaded, setAutoLoaded] = useState(false) // lazy-load 1회 가드
  const [autoError, setAutoError] = useState(false) // GET 실패 상태(화이트스크린 방지)

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
        setLastSyncedAt(new Date())
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

  const fetchMessagingStatus = useCallback(async () => {
    try {
      // 같은 URL을 조회하는 다른 화면(예: ChannelStatusStrip을 쓰는 곳)과 캐시 키가
      // 같아 동시 마운트 시 in-flight dedupe로 왕복 1회에 수렴한다(CMP-2).
      const json = await adminFetchJsonCached<unknown>("/api/admin/messaging/status", undefined, {
        ttlMs: MESSAGING_STATUS_CACHE_TTL_MS,
      })
      const status = unwrapMessagingData<MessagingStatus>(json)
      if (status && status.provider === "solapi") {
        setMessagingStatus(status)
      }
    } catch {
      // 백엔드 트랙 미배포/401 등 — 채널 작성기는 status 없이도 안전하게 강등된다(401은 adminFetch가 전역 리다이렉트 처리).
    } finally {
      setMessagingStatusLoaded(true)
    }
  }, [])

  useEffect(() => {
    void fetchSubscribers()
    void fetchCampaigns()
    void fetchMessagingStatus()
  }, [fetchSubscribers, fetchCampaigns, fetchMessagingStatus])

  // ── 자동화 데이터 로더 — 실패해도 빈 상태로 강등하고 boolean으로 성공 여부만 알린다
  //    (탭 화이트스크린 방지 · 온서브밋/크론 경로는 에러를 삼키므로 방어적 UI 필수) ──
  const fetchAutoRules = useCallback(async (): Promise<boolean> => {
    try {
      const res = await adminFetch("/api/admin/automation/rules")
      if (res.status === 401) {
        handleUnauthorized()
        return false
      }
      if (!res.ok) {
        setAutoRules([])
        return false
      }
      const data = await res.json()
      setAutoRules(data.rules ?? [])
      return true
    } catch {
      setAutoRules([])
      return false
    }
  }, [handleUnauthorized])

  const fetchAutoTemplates = useCallback(async (): Promise<boolean> => {
    try {
      const res = await adminFetch("/api/admin/automation/templates")
      if (res.status === 401) {
        handleUnauthorized()
        return false
      }
      if (!res.ok) {
        setAutoTemplates([])
        return false
      }
      const data = await res.json()
      setAutoTemplates(data.templates ?? [])
      return true
    } catch {
      setAutoTemplates([])
      return false
    }
  }, [handleUnauthorized])

  const fetchAutoLogs = useCallback(async (): Promise<boolean> => {
    try {
      const res = await adminFetch("/api/admin/automation/logs")
      if (res.status === 401) {
        handleUnauthorized()
        return false
      }
      if (!res.ok) {
        setAutoLogs([])
        return false
      }
      const data = await res.json()
      setAutoLogs(data.logs ?? [])
      return true
    } catch {
      setAutoLogs([])
      return false
    }
  }, [handleUnauthorized])

  // 자동화 탭 최초 진입 시 1회 로드(그 외 탭은 건드리지 않는다). "다시 시도"는 autoLoaded를 풀어 재실행.
  useEffect(() => {
    if (activeTab !== "automation" || autoLoaded) return
    setAutoLoaded(true)
    setAutoLoading(true)
    void (async () => {
      const results = await Promise.all([fetchAutoRules(), fetchAutoTemplates(), fetchAutoLogs()])
      if (results.includes(false)) {
        setAutoError(true)
        showToast("error", "자동화 데이터를 불러오지 못했습니다.")
      } else {
        setAutoError(false)
      }
      setAutoLoading(false)
    })()
  }, [activeTab, autoLoaded, fetchAutoRules, fetchAutoTemplates, fetchAutoLogs, showToast])

  const selectedRule = useMemo(
    () => autoRules.find((r) => r.id === selectedRuleId) ?? null,
    [autoRules, selectedRuleId]
  )

  // ── 규칙 핸들러 ──
  const openCreateRule = () => {
    setEditingRule(null)
    setSlideOverOpen(true)
  }

  const handleSaveRule = async (data: CreateRuleRequest) => {
    const target = editingRule
    const isEdit = !!target
    setAutoSaving(true)
    try {
      const res = await adminFetch(
        isEdit ? `/api/admin/automation/rules/${target!.id}` : "/api/admin/automation/rules",
        { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(data) }
      )
      if (res.status === 401) {
        handleUnauthorized()
        return
      }
      if (!res.ok) {
        showToast("error", "규칙 저장에 실패했습니다.")
        return
      }
      const json = await res.json().catch(() => null)
      setSlideOverOpen(false)
      setEditingRule(null)
      await fetchAutoRules()
      await fetchAutoLogs()
      if (!isEdit && json?.rule?.id) setSelectedRuleId(json.rule.id as string)
      showToast("success", isEdit ? "규칙을 수정했습니다." : "규칙을 만들었습니다.")
    } catch {
      showToast("error", "규칙 저장에 실패했습니다.")
    } finally {
      setAutoSaving(false)
    }
  }

  const handleDeleteRule = async (rule: AutomationRule) => {
    try {
      const res = await adminFetch(`/api/admin/automation/rules/${rule.id}`, { method: "DELETE" })
      if (res.status === 401) {
        handleUnauthorized()
        return
      }
      if (!res.ok) {
        showToast("error", "규칙 삭제에 실패했습니다.")
        return
      }
      if (selectedRuleId === rule.id) setSelectedRuleId(null)
      await fetchAutoRules()
      showToast("success", "규칙을 삭제했습니다.")
    } catch {
      showToast("error", "규칙 삭제에 실패했습니다.")
    }
  }

  const handleToggleRuleStatus = async (rule: AutomationRule) => {
    const next = rule.status === "active" ? "paused" : "active"
    try {
      const res = await adminFetch(`/api/admin/automation/rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      })
      if (res.status === 401) {
        handleUnauthorized()
        return
      }
      if (!res.ok) {
        showToast("error", "상태 변경에 실패했습니다.")
        return
      }
      await fetchAutoRules()
      showToast("success", next === "active" ? "규칙을 활성화했습니다." : "규칙을 일시정지했습니다.")
    } catch {
      showToast("error", "상태 변경에 실패했습니다.")
    }
  }

  const handleTriggerRule = async (rule: AutomationRule) => {
    setTriggeringId(rule.id)
    try {
      const res = await adminFetch(`/api/admin/automation/rules/${rule.id}/trigger`, { method: "POST" })
      if (res.status === 401) {
        handleUnauthorized()
        return
      }
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        showToast("error", data?.error ? `발송 실패 — ${data.error}` : "즉시 실행에 실패했습니다.")
      } else {
        showToast("success", `${data.recipientCount ?? 0}명에게 발송했습니다.`)
      }
      await fetchAutoLogs()
      await fetchAutoRules()
    } catch {
      showToast("error", "즉시 실행에 실패했습니다.")
    } finally {
      setTriggeringId(null)
    }
  }

  // ── 템플릿 핸들러 ──
  const openCreateTemplate = () => {
    setEditingTemplate(null)
    setEditorOpen(true)
  }

  const handleSaveTemplate = async (data: CreateTemplateRequest) => {
    const target = editingTemplate
    const isEdit = !!target
    setAutoSaving(true)
    try {
      const res = await adminFetch(
        isEdit
          ? `/api/admin/automation/templates/${target!.id}`
          : "/api/admin/automation/templates",
        { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(data) }
      )
      if (res.status === 401) {
        handleUnauthorized()
        return
      }
      if (!res.ok) {
        showToast("error", "템플릿 저장에 실패했습니다.")
        return
      }
      setEditorOpen(false)
      setEditingTemplate(null)
      await fetchAutoTemplates()
      showToast("success", isEdit ? "템플릿을 수정했습니다." : "템플릿을 만들었습니다.")
    } catch {
      showToast("error", "템플릿 저장에 실패했습니다.")
    } finally {
      setAutoSaving(false)
    }
  }

  const handleDuplicateTemplate = async (t: EmailTemplate) => {
    try {
      const res = await adminFetch("/api/admin/automation/templates", {
        method: "POST",
        body: JSON.stringify({
          name: `${t.name} 사본`,
          subject: t.subject,
          body: t.body,
          variables: t.variables,
        }),
      })
      if (res.status === 401) {
        handleUnauthorized()
        return
      }
      if (!res.ok) {
        showToast("error", "템플릿 복제에 실패했습니다.")
        return
      }
      await fetchAutoTemplates()
      showToast("success", "템플릿을 복제했습니다.")
    } catch {
      showToast("error", "템플릿 복제에 실패했습니다.")
    }
  }

  const handleDeleteTemplate = async (t: EmailTemplate) => {
    try {
      const res = await adminFetch(`/api/admin/automation/templates/${t.id}`, { method: "DELETE" })
      if (res.status === 401) {
        handleUnauthorized()
        return
      }
      if (!res.ok) {
        showToast("error", "템플릿 삭제에 실패했습니다.")
        return
      }
      await fetchAutoTemplates()
      showToast("success", "템플릿을 삭제했습니다.")
    } catch {
      showToast("error", "템플릿 삭제에 실패했습니다.")
    }
  }

  const activeCount = subscribers.filter((s) => s.status === "active").length
  const unsubscribedCount = subscribers.length - activeCount
  const draftCount = campaigns.filter((c) => c.status === "draft").length

  // 헤더 "도달 채널" 스탯 — 활성 구독자 중 실제로 이메일/휴대폰이 채워진 수(실데이터 집계)
  const { headerEmailReach, headerPhoneReach } = useMemo(() => {
    const active = subscribers.filter((s) => s.status === "active")
    return {
      headerEmailReach: active.filter((s) => (s.email ?? "").trim().length > 0).length,
      headerPhoneReach: active.filter((s) => (s.phone ?? "").trim().length > 0).length,
    }
  }, [subscribers])

  const latestCampaign = useMemo(
    () => [...campaigns].sort((a, b) => safeTime(b.sentAt ?? b.createdAt) - safeTime(a.sentAt ?? a.createdAt))[0],
    [campaigns]
  )
  const latestSubscriber = useMemo(
    () => [...subscribers].sort((a, b) => safeTime(b.createdAt) - safeTime(a.createdAt))[0],
    [subscribers]
  )
  const { recentFailedCampaigns, recentDraftCampaigns, recentSuccessRate } = useMemo(() => {
    const windowStart = Date.now() - 30 * 24 * 60 * 60 * 1000
    const window30d = campaigns.filter((c) => safeTime(c.sentAt ?? c.createdAt) >= windowStart)
    const sent = window30d.filter((c) => c.status === "sent")
    const failed = window30d.filter((c) => c.status === "failed")
    const draft = window30d.filter((c) => c.status === "draft")
    const successRate = sent.length + failed.length > 0
      ? Math.round((sent.length / (sent.length + failed.length)) * 100)
      : null
    return {
      recentFailedCampaigns: failed,
      recentDraftCampaigns: draft,
      recentSuccessRate: successRate,
    }
  }, [campaigns])

  const sourceRows = useMemo(() => {
    const counts = countBy(subscribers.map((s) => s.source))
    const order = ["demo_modal", "contact_page", "newsletter", "meta_lead_ads", "manual"] as const
    return order
      .map((source) => ({ source, count: counts[source] ?? 0 }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count)
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

  const {
    visible: visibleSubscriberCount,
    showMore: showMoreSubscribers,
    collapse: collapseSubscribers,
    canMore: canMoreSubscribers,
    canCollapse: canCollapseSubscribers,
  } = useVisibleCount(filteredSubscribers.length, SUBSCRIBER_LIST_STEP)

  // 검색어/상태/유입 필터가 바뀌면 새 결과셋의 맨 위(초기 50건)부터 다시 보여준다 —
  // 이전 필터에서 펼쳐둔 범위가 무관한 새 결과에 그대로 남지 않도록.
  useEffect(() => {
    collapseSubscribers()
  }, [query, statusFilter, sourceFilter, collapseSubscribers])

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

      // 변수 치환 가능성 — 발송 백엔드(replacePlaceholders)는 {name}/{org}/{role}만 치환한다.
      // 그 밖의 {token}과 {ai:} 블록은 글자 그대로 나가므로 경고, org/role 빈 값은
      // 공백("")으로 발송되므로 대상 기준 빈 값 수를 정직하게 알린다.
      const knownVariableKeys = ["name", "org", "role"] as const
      const draftText = `${draft.subject} ${draft.body}`
      const tokenKeys = Array.from(draftText.matchAll(/\{([a-zA-Z_]+)\}/g)).map((m) => m[1])
      const usedKnown = knownVariableKeys.filter((key) => tokenKeys.includes(key))
      const unknownTokens = Array.from(new Set(tokenKeys.filter((key) => !knownVariableKeys.includes(key as (typeof knownVariableKeys)[number]))))
      const hasAiBlock = /\{ai:/i.test(draftText)
      const draftRecipients =
        draft.targetTags.length === 0
          ? subscribers.filter((s) => s.status === "active")
          : subscribers.filter(
              (s) => s.status === "active" && s.tags.some((tag) => draft.targetTags.includes(tag))
            )
      const emptyValueNotes: string[] = []
      if (usedKnown.includes("org")) {
        const empties = draftRecipients.filter((s) => !(s.org ?? "").trim()).length
        if (empties > 0) emptyValueNotes.push(`{org} 빈 값 ${empties}명`)
      }
      if (usedKnown.includes("role")) {
        const empties = draftRecipients.filter((s) => !(s.role ?? "").trim()).length
        if (empties > 0) emptyValueNotes.push(`{role} 빈 값 ${empties}명`)
      }
      const variableCheck: PreSendCheck = {
        key: "variables",
        label: "변수 치환",
        status: unknownTokens.length > 0 || hasAiBlock ? "warning" : usedKnown.length === 0 ? "info" : "ok",
        detail:
          unknownTokens.length > 0
            ? `치환되지 않는 변수 ${unknownTokens.map((t) => `{${t}}`).join(", ")} — 글자 그대로 발송됩니다.`
            : hasAiBlock
              ? "AI 블록({ai:})은 이 발송 경로에서 치환되지 않습니다."
              : usedKnown.length === 0
                ? "변수 미사용 — 모든 수신자에게 동일한 내용이 발송됩니다."
                : emptyValueNotes.length > 0
                  ? `변수 ${usedKnown.length}종 치환 가능 · ${emptyValueNotes.join(" · ")} — 빈 값은 공백으로 발송됩니다.`
                  : `사용한 변수 ${usedKnown.length}종 모두 치환 가능합니다.`,
      }

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
        variableCheck,
        {
          key: "audience",
          label: "대상",
          status: selectedAudience > 0 ? "ok" : "error",
          detail:
            draft.targetTags.length === 0
              ? `전체 active 구독자 ${activeCount}명`
              : `태그 중 하나라도 일치 · 예상 ${selectedAudience}명`,
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

      // info 체크(수신거부 안내 등)는 준비도 분모에서 제외 — 포함하면 정상 초안도 100%에 못 미친다.
      const scored = checks.filter((check) => check.status !== "info")
      const readinessScore =
        scored.length > 0
          ? Math.round(((okCount + warningCount * 0.45) / scored.length) * 100)
          : 100

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
    [activeCount, campaigns, countSelectedAudience, subscribers, unsubscribedCount]
  )

  const composerReview = useMemo(() => evaluateDraft(composerDraft), [composerDraft, evaluateDraft])

  // 알림톡·문자 준비 상태 체크는 채널 캐스케이드 카드(ChannelCascadeCard)와
  // KakaoComposer가 각자 소유한다 — 우측 레일 "최종 확인"은 실제 발송 경로인
  // 이메일 초안 체크(composerReview)만 쓴다.

  // 헤더 CTA는 발송 로직을 중복하지 않는다 — 우측 레일의 실제 CTA/테스트 박스로 스크롤만.
  const scrollToRailSection = useCallback((id: string) => {
    if (typeof document === "undefined") return
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const handleRefreshAll = useCallback(() => {
    void fetchSubscribers()
    void fetchCampaigns()
    void fetchMessagingStatus()
  }, [fetchSubscribers, fetchCampaigns, fetchMessagingStatus])

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
    <div>
      <div>
        <div className="mb-8 flex flex-col gap-6">
          {/* 상단 스탯 헤더 — 옛 5 StatCard + 운영 요약 패널 + 채널 스트립을 대체·압축 */}
          <SendCenterHeader
            composeActive={activeTab === "compose"}
            totalSubscribers={subscribers.length}
            activeCount={activeCount}
            unsubscribedCount={unsubscribedCount}
            emailReach={headerEmailReach}
            phoneReach={headerPhoneReach}
            selectedAudience={composerReview.selectedAudience}
            messagingStatus={messagingStatus}
            messagingStatusLoaded={messagingStatusLoaded}
            lastSyncedAt={lastSyncedAt}
            refreshing={loading}
            onRefresh={handleRefreshAll}
            onGoCompose={() => setActiveTab("compose")}
            onScrollToSend={() => scrollToRailSection("send-rail-cta")}
            onScrollToTest={() => scrollToRailSection("send-rail-test")}
          />

          <div className="sticky top-16 z-20 -mx-4 px-4 pt-2 pb-3 sm:-mx-6 sm:px-6 lg:top-0" style={{ background: "linear-gradient(to bottom, #FAFAF8 85%, transparent)" }}>
            <div className="admin-scroll-snap-x no-scrollbar -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
              <div className="flex w-max min-w-full flex-nowrap gap-2 rounded-xl border border-[#e8e8e4] bg-white p-2 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:w-full sm:flex-wrap sm:gap-3 sm:rounded-2xl sm:p-3">
                <TabButton
                  active={activeTab === "subscribers"}
                  icon={<Users className="h-4 w-4" />}
                  label="구독자 관리"
                  count={subscribers.length}
                  onClick={() => setActiveTab("subscribers")}
                />
                <TabButton
                  active={activeTab === "compose"}
                  icon={<Send className="h-4 w-4" />}
                  label="발송 작성"
                  count={draftCount}
                  onClick={() => setActiveTab("compose")}
                />
                <TabButton
                  active={activeTab === "history"}
                  icon={<History className="h-4 w-4" />}
                  label="발송 이력"
                  count={campaigns.length}
                  onClick={() => setActiveTab("history")}
                />
                <TabButton
                  active={activeTab === "automation"}
                  icon={<Zap className="h-4 w-4" />}
                  label="자동화"
                  onClick={() => setActiveTab("automation")}
                />
              </div>
            </div>
          </div>
        </div>

        <div ref={contentRef} className="scroll-mt-4">
        {activeTab === "subscribers" && (
          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
            <div className="space-y-6">
              <Panel
                title="구독자 관리"
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
                        className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap ${
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
                    {(["all", "demo_modal", "contact_page", "newsletter", "meta_lead_ads", "manual"] as const).map((value) => (
                      <button
                        key={value}
                        onClick={() => setSourceFilter(value)}
                        className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap ${
                          sourceFilter === value
                            ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                            : "border-[#e8e8e4] bg-white text-[#1a1a1a]/55 hover:border-[#c8c8c4] hover:text-[#111110]"
                        }`}
                      >
                        {value === "all" ? "소스 전체" : value === "demo_modal" ? "데모" : value === "contact_page" ? "문의" : value === "newsletter" ? "뉴스레터" : value === "meta_lead_ads" ? "Meta" : "수동"}
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
                  <>
                    <SubscriberTable
                      subscribers={filteredSubscribers}
                      visibleCount={visibleSubscriberCount}
                      filterSignature={`${query}|${statusFilter}|${sourceFilter}`}
                      onDelete={setDeleteTarget}
                      onCompose={handleComposeFromSubscriber}
                      onAddSubscriber={() => setIsFormOpen(true)}
                      onComposeCampaign={() => setActiveTab("compose")}
                      onBulkDelete={handleBulkDelete}
                      onBulkTagAdd={handleBulkTagAdd}
                    />
                    {(canMoreSubscribers || canCollapseSubscribers) && (
                      <div className="mt-5 flex flex-col items-center gap-2 border-t border-[#e8e8e4] pt-4">
                        <p role="status" className="text-[11px] font-medium tabular-nums text-[#1a1a1a]/45">
                          {visibleSubscriberCount.toLocaleString("ko-KR")} / 총{" "}
                          {filteredSubscribers.length.toLocaleString("ko-KR")}명 표시
                        </p>
                        <ShowMore
                          visible={visibleSubscriberCount}
                          total={filteredSubscribers.length}
                          step={SUBSCRIBER_LIST_STEP}
                          onMore={showMoreSubscribers}
                          onCollapse={canCollapseSubscribers ? collapseSubscribers : undefined}
                        />
                      </div>
                    )}
                  </>
                )}
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel title="채널 믹스">
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
                              : row.source === "meta_lead_ads"
                                ? "Meta 리드"
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

              <Panel title="운영 메모">
                <dl className="space-y-2 text-[12px]">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[#1a1a1a]/45">발송 대상</dt>
                    <dd className="font-semibold text-[#111110]">활성 {activeCount}명</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[#1a1a1a]/45">최근 등록</dt>
                    <dd className="min-w-0 truncate text-right font-semibold text-[#111110]">
                      {latestSubscriber ? `${latestSubscriber.name} · ${formatDateTime(latestSubscriber.createdAt)}` : "—"}
                    </dd>
                  </div>
                </dl>
              </Panel>
            </div>
          </div>
        )}

        {activeTab === "compose" && (
          <SendCenter
            draft={composerDraft}
            onDraftChange={setComposerDraft}
            subscribers={subscribers}
            activeCount={activeCount}
            unsubscribedCount={unsubscribedCount}
            tagCountMap={tagCountMap}
            checks={composerReview.checks}
            readiness={composerReview.readiness}
            selectedAudience={composerReview.selectedAudience}
            messagingStatus={messagingStatus}
            messagingStatusLoaded={messagingStatusLoaded}
            recipientPrefill={recipientPrefill}
            onClearRecipientPrefill={() => setRecipientPrefill(null)}
            draftNotice={draftNotice}
            activeSegment={activeSegment}
            hasDraft={!!hasComposerDraft}
            onClearDraft={clearComposerDraft}
            savedSegmentViews={savedSegmentViews}
            segmentName={segmentName}
            onSegmentNameChange={setSegmentName}
            onSaveSegment={handleSaveSegment}
            onApplySegment={handleApplySegment}
            onDeleteSegment={handleDeleteSegment}
            onSend={handleSendEmail}
            sendLoading={sendLoading}
          />
        )}

        {activeTab === "history" && (
          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-6">
              <Panel
                title="발송 이력"
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

              <Panel title="문자·카카오 발송 로그">
                <MessageLogTable />
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel title="상태 요약">
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

              <Panel title="추천 다음 액션">
                <div className="space-y-2">
                  {recentDraftCampaigns.length > 0 && (
                    <button
                      onClick={() => setActiveTab("compose")}
                      className="w-full rounded-xl border border-amber-100 bg-amber-50 p-3 text-left transition-colors hover:bg-amber-100/60"
                    >
                      <p className="text-[12px] font-semibold text-amber-700">
                        미완성 초안 {recentDraftCampaigns.length}개
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
                    </button>
                  )}
                  {latestCampaign && (
                    <button
                      onClick={() => handleDuplicateCampaign(latestCampaign)}
                      className="w-full rounded-xl border border-[#084734]/15 bg-[#ECFDF5] p-3 text-left transition-colors hover:bg-[#D1FAE5]"
                    >
                      <p className="truncate text-[12px] font-semibold text-[#084734]">
                        최근 캠페인 복제 · &ldquo;{latestCampaign.subject}&rdquo;
                      </p>
                    </button>
                  )}
                  {recentDraftCampaigns.length === 0 && recentFailedCampaigns.length === 0 && !latestCampaign && (
                    <EmptyInline message="발송 이력이 쌓이면 제안이 나타납니다." />
                  )}
                </div>
              </Panel>
            </div>
          </div>
        )}

        {activeTab === "automation" && (
          <div className="space-y-4">
            {/* 서브탭 헤더 (규칙 / 템플릿 / 로그) + 우측 생성 액션 */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex items-center gap-1 self-start rounded-xl border border-[#e8e8e4] bg-white p-1">
                {([
                  ["rules", "규칙", autoRules.length],
                  ["templates", "템플릿", autoTemplates.length],
                  ["logs", "로그", autoLogs.length],
                ] as const).map(([key, label, count]) => (
                  <button
                    key={key}
                    onClick={() => setAutoSubTab(key)}
                    className={`rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
                      autoSubTab === key
                        ? "bg-[#111110] text-white"
                        : "text-[#1a1a1a]/55 hover:text-[#111110]"
                    }`}
                  >
                    {label}
                    <span className={`ml-1.5 ${autoSubTab === key ? "text-white/60" : "text-[#1a1a1a]/30"}`}>
                      {count}
                    </span>
                  </button>
                ))}
              </div>

              {autoSubTab === "rules" && (
                <Button size="sm" onClick={openCreateRule} className="self-start bg-[#084734] hover:bg-[#084734]/90 sm:self-auto">
                  <Plus className="mr-1.5 h-4 w-4" />새 규칙
                </Button>
              )}
              {autoSubTab === "templates" && (
                <Button size="sm" onClick={openCreateTemplate} className="self-start bg-[#084734] hover:bg-[#084734]/90 sm:self-auto">
                  <Plus className="mr-1.5 h-4 w-4" />새 템플릿
                </Button>
              )}
            </div>

            {/* 본문 — 로딩 / 에러 / 서브뷰 */}
            {autoLoading ? (
              <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-6 py-16 text-center text-[13px] text-[#1a1a1a]/35">
                자동화 데이터를 불러오는 중...
              </div>
            ) : autoError && autoRules.length === 0 && autoTemplates.length === 0 && autoLogs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-6 py-16 text-center">
                <p className="text-[13px] text-[#1a1a1a]/40">자동화 데이터를 불러오지 못했습니다.</p>
                <div className="mt-3">
                  <Button size="sm" variant="outline" onClick={() => setAutoLoaded(false)}>
                    다시 시도
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* 규칙 — 좌 목록 / 우 상세 2-pane */}
                {autoSubTab === "rules" && (
                  <div className="grid gap-4 lg:h-[620px] lg:grid-cols-[360px_1fr]">
                    <div className="h-[440px] lg:h-auto">
                      <AutomationRuleList
                        rules={autoRules}
                        logs={autoLogs}
                        selectedId={selectedRuleId ?? undefined}
                        onSelect={(rule) => setSelectedRuleId(rule.id)}
                      />
                    </div>
                    <div className="flex min-h-[520px] lg:min-h-0">
                      <AutomationRuleDetail
                        rule={selectedRule}
                        logs={autoLogs}
                        triggeringId={triggeringId ?? undefined}
                        onEdit={(rule) => {
                          setEditingRule(rule)
                          setSlideOverOpen(true)
                        }}
                        onDelete={handleDeleteRule}
                        onToggleStatus={handleToggleRuleStatus}
                        onTrigger={handleTriggerRule}
                        onShowAllLogs={() => setAutoSubTab("logs")}
                        onCreateFirst={openCreateRule}
                      />
                    </div>
                  </div>
                )}

                {/* 템플릿 — 카드 그리드 */}
                {autoSubTab === "templates" && (
                  autoTemplates.length === 0 ? (
                    <EmptyState
                      title="등록된 템플릿이 없습니다."
                      description="변수 치환 이메일 템플릿을 만들어 자동화 규칙에 연결하세요."
                      action={
                        <Button size="sm" onClick={openCreateTemplate} className="bg-[#084734] hover:bg-[#084734]/90">
                          <Plus className="mr-1.5 h-4 w-4" />새 템플릿
                        </Button>
                      }
                    />
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {autoTemplates.map((t) => (
                        <TemplateCard
                          key={t.id}
                          template={t}
                          rules={autoRules}
                          onEdit={(tpl) => {
                            setEditingTemplate(tpl)
                            setEditorOpen(true)
                          }}
                          onDuplicate={handleDuplicateTemplate}
                          onDelete={handleDeleteTemplate}
                        />
                      ))}
                    </div>
                  )
                )}

                {/* 로그 — 실행 이력 테이블 */}
                {autoSubTab === "logs" && (
                  <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
                    <AutomationLogTable logs={autoLogs} rules={autoRules} />
                  </div>
                )}
              </>
            )}

            {/* 오버레이 — 열릴 때마다 새로 마운트해 initial을 반영 */}
            {slideOverOpen && (
              <AutomationRuleSlideOver
                open={slideOverOpen}
                templates={autoTemplates}
                initial={editingRule ?? undefined}
                onSave={handleSaveRule}
                onClose={() => {
                  setSlideOverOpen(false)
                  setEditingRule(null)
                }}
                adminToken={getAdminToken()}
                loading={autoSaving}
              />
            )}
            {editorOpen && (
              <TemplateEditorDrawer
                open={editorOpen}
                initial={editingTemplate ?? undefined}
                onSave={handleSaveTemplate}
                onClose={() => {
                  setEditorOpen(false)
                  setEditingTemplate(null)
                }}
                loading={autoSaving}
              />
            )}
          </div>
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
