"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Coins,
  ExternalLink,
  FileAudio,
  FileText,
  ListChecks,
  Loader2,
  Phone,
  PhoneCall,
  Plus,
  Receipt,
  RefreshCw,
  Sparkles,
  StickyNote,
  User2,
  X,
} from "lucide-react"

import { adminFetchJson, adminFetchJsonCached, clearAdminRequestCache } from "@/lib/admin-client"
import { pushRecentCustomer } from "@/lib/crm/recent-customers"
import CrmCustomerFlags from "./CrmCustomerFlags"
import { deriveCustomerFlags } from "@/lib/crm/customer-flags"
import { CS_MOTIONS, type CsMotion } from "@/lib/crm/cs-motions"
import type { Customer360, Customer360Severity } from "@/lib/repositories/crm-customer-360"
import type { CrmDealStage } from "@/lib/repositories/crm-deals"
import type { CrmTaskType } from "@/lib/repositories/crm-tasks"

const DEAL_STAGE_OPTIONS: Array<{ value: CrmDealStage; label: string }> = [
  { value: "consult", label: "상담" },
  { value: "demo", label: "데모" },
  { value: "quote", label: "견적" },
  { value: "decision", label: "의사결정" },
  { value: "order", label: "오더/설치" },
  { value: "won", label: "완료" },
  { value: "lost", label: "실패" },
]

const DEAL_STAGE_LABEL: Record<CrmDealStage, string> = {
  consult: "상담",
  demo: "데모",
  quote: "견적",
  decision: "의사결정",
  order: "오더/설치",
  won: "완료",
  lost: "실패",
}

interface Props {
  customerKey: string | null
  name?: string | null
  onClose: () => void
}

const SEVERITY_CLASS: Record<Customer360Severity, string> = {
  critical: "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]",
  high: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]",
  medium: "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]",
  low: "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55",
}

const SEVERITY_LABEL: Record<Customer360Severity, string> = {
  critical: "긴급",
  high: "높음",
  medium: "주의",
  low: "안정",
}

const SERVICE_RISK_LABEL: Record<string, string> = {
  urgent: "긴급",
  soon: "임박",
  watch: "주시",
  normal: "정상",
}

const SERVICE_RISK_CLASS: Record<string, string> = {
  urgent: "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]",
  soon: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]",
  watch: "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]",
  normal: "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55",
}

const CONFIDENCE_LABEL: Record<string, string> = { high: "신뢰 높음", medium: "신뢰 보통", low: "신뢰 낮음" }

const TASK_TYPE_OPTIONS: Array<{ value: CrmTaskType; label: string }> = [
  { value: "call", label: "전화" },
  { value: "kakao", label: "카카오" },
  { value: "email", label: "이메일" },
  { value: "meeting", label: "미팅" },
  { value: "quote", label: "견적" },
  { value: "demo", label: "데모" },
  { value: "install", label: "설치" },
  { value: "renewal", label: "갱신" },
  { value: "cs_checkin", label: "CS 점검" },
  { value: "data_fix", label: "데이터 정리" },
  { value: "other", label: "기타" },
]

const EVENT_SOURCE_LABEL: Record<string, string> = {
  manual_note: "메모",
  meeting_minutes: "회의록",
  recording: "녹음",
  calendar_event: "캘린더",
  lead_contact_log: "리드 연락",
  external_crm: "외부 CRM",
  sheet: "시트",
}

// 활동 출처별 아이콘 — 타임라인을 유형으로 빠르게 스캔.
const EVENT_SOURCE_ICON: Record<string, React.ReactNode> = {
  manual_note: <StickyNote className="h-3.5 w-3.5" />,
  meeting_minutes: <FileText className="h-3.5 w-3.5" />,
  recording: <FileAudio className="h-3.5 w-3.5" />,
  calendar_event: <CalendarClock className="h-3.5 w-3.5" />,
  lead_contact_log: <PhoneCall className="h-3.5 w-3.5" />,
  external_crm: <Building2 className="h-3.5 w-3.5" />,
  sheet: <ClipboardList className="h-3.5 w-3.5" />,
}

function sumAmounts(values: Array<number | null | undefined>): number | null {
  let total = 0
  let seen = false
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue
    total += value
    seen = true
  }
  return seen ? total : null
}

function focusSection(id: string) {
  if (typeof document === "undefined") return
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: "smooth", block: "center" })
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) el.focus()
}

// 견적/오더/수납 진행 — 공식 원천(NEO orders/collections) + 작업 캐시(Deal Lite)에서 파생.
function FunnelRow({
  icon,
  label,
  amount,
  currency = "KRW",
  meta,
  state,
}: {
  icon: React.ReactNode
  label: string
  amount: number | null
  currency?: "KRW" | "USD"
  meta?: string | null
  state: "done" | "warn" | "pending"
}) {
  const mark =
    state === "done" ? (
      <CheckCircle2 className="h-4 w-4 text-[#084734]" />
    ) : state === "warn" ? (
      <AlertTriangle className="h-4 w-4 text-[#B85C33]" />
    ) : (
      <span className="h-2 w-2 rounded-full bg-[#d8d8d2]" />
    )
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#fafaf8] text-[#1a1a1a]/45">
        {mark}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#111110]">
          <span className="text-[#1a1a1a]/40">{icon}</span>
          {label}
        </div>
        {meta ? (
          <p className={`text-[11px] ${state === "warn" ? "text-[#B85C33]" : "text-[#1a1a1a]/40"}`}>{meta}</p>
        ) : null}
      </div>
      <span className={`shrink-0 text-[13px] font-bold ${state === "warn" ? "text-[#B85C33]" : "text-[#111110]"}`}>
        {formatMoney(amount, currency)}
      </span>
    </div>
  )
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date)
}

function formatDay(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }).format(date)
}

function formatAmount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "-"
  return new Intl.NumberFormat("ko-KR").format(value)
}

// NEO 오더/수납은 USD 네이티브($), 견적(Deal Lite)은 KRW(₩) — 출처별 통화를 맞춘다.
function formatMoney(value: number | null | undefined, currency: "KRW" | "USD" = "KRW") {
  if (value == null || !Number.isFinite(value)) return "-"
  if (currency === "USD") return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  return `₩${value.toLocaleString("ko-KR")}`
}

// 비핵심 섹션 — 기본 접힘. 첫 화면은 핵심만, 필요할 때 펼쳐 보는 컴팩트 패턴.
function CollapsibleSection({
  icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode
  title: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[#1a1a1a]/45">
          {icon}
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#1a1a1a]/35 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </section>
  )
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[#1a1a1a]/45">
      {icon}
      {children}
    </h3>
  )
}

export default function Customer360Drawer({ customerKey, name, onClose }: Props) {
  const [data, setData] = useState<Customer360 | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [taskTitle, setTaskTitle] = useState("")
  const [taskType, setTaskType] = useState<CrmTaskType>("call")
  const [taskDue, setTaskDue] = useState("")
  const [dealTitle, setDealTitle] = useState("")
  const [dealStage, setDealStage] = useState<CrmDealStage>("consult")
  const [dealAmount, setDealAmount] = useState("")
  const [activityTab, setActivityTab] = useState<"timeline" | "feed">("timeline")
  const [eventsExpanded, setEventsExpanded] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [noteKind, setNoteKind] = useState<"manual_note" | "meeting_minutes">("manual_note")
  const [dealFormOpen, setDealFormOpen] = useState(false)
  const [taskFormOpen, setTaskFormOpen] = useState(false)

  const url = customerKey ? `/api/admin/crm/customers/${encodeURIComponent(customerKey)}/360` : null

  const load = useCallback(
    async (options?: { force?: boolean; expanded?: boolean }) => {
      if (!url) return
      setLoading(true)
      setError(null)
      // expanded일 때는 '전체 활동 보기'로 펼친 50건을 유지하도록 같은 URL/캐시키로 재조회한다.
      const base = options?.expanded ? `${url}?eventsLimit=50` : url
      const cacheKey = options?.expanded ? `${url}:all` : url
      const fetchUrl = options?.force ? `${base}${base.includes("?") ? "&" : "?"}_=${Date.now()}` : base
      try {
        const next = await adminFetchJsonCached<Customer360>(fetchUrl, undefined, {
          cacheKey,
          ttlMs: 15_000,
          staleWhileRevalidateMs: 60_000,
          force: options?.force,
        })
        setData(next)
      } catch (err) {
        setError(err instanceof Error ? err.message : "고객 정보를 불러오지 못했습니다.")
      } finally {
        setLoading(false)
      }
    },
    [url]
  )

  useEffect(() => {
    // 고객이 바뀌면 이전 고객의 데이터/폼 입력이 새 드로어에 잔존하지 않게 초기화한다.
    setData(null)
    setError(null)
    setNote("")
    setTaskTitle("")
    setTaskType("call")
    setTaskDue("")
    setDealTitle("")
    setDealStage("consult")
    setDealAmount("")
    setActivityTab("timeline")
    setEventsExpanded(false)
    setNoteKind("manual_note")
    setDealFormOpen(false)
    setTaskFormOpen(false)
    if (customerKey) void load()
  }, [customerKey, load])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => {
    if (data?.found && data.header && customerKey) {
      pushRecentCustomer({
        key: customerKey,
        name: data.header.name,
        sourceLabel: data.header.sourceLabel,
        source: data.source,
      })
    }
  }, [data, customerKey])

  // 저장/처리 성공 시 잠깐 '저장됨' 토스트를 띄우고 자동 해제 — 작업대 보상 즉시성.
  useEffect(() => {
    if (!savedMsg) return
    const timer = setTimeout(() => setSavedMsg(null), 2200)
    return () => clearTimeout(timer)
  }, [savedMsg])

  const header = data?.header
  const displayName = header?.name ?? name ?? "고객"
  const targetType = data?.source ?? (customerKey?.startsWith("neo:") ? "neo_account" : "lead")
  const entityId = data?.entityId ?? (customerKey ? customerKey.slice(customerKey.indexOf(":") + 1) : "")

  const refetch = useCallback(async () => {
    if (url) clearAdminRequestCache()
    await load({ force: true, expanded: eventsExpanded })
  }, [load, url, eventsExpanded])

  const handleAddNote = useCallback(async () => {
    const body = note.trim()
    if (!body || !customerKey) return
    setActingId("note")
    setError(null)
    try {
      await adminFetchJson("/api/admin/crm/events", {
        method: "POST",
        body: JSON.stringify({ targetType, targetId: entityId, targetLabel: displayName, sourceType: noteKind, body }),
      })
      setNote("")
      setSavedMsg("기록을 저장했어요")
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : "메모 저장에 실패했습니다.")
    } finally {
      setActingId(null)
    }
  }, [note, noteKind, customerKey, targetType, entityId, displayName, refetch])

  const handleAddTask = useCallback(async () => {
    const title = taskTitle.trim()
    if (!title || !customerKey) return
    setActingId("task")
    setError(null)
    try {
      await adminFetchJson("/api/admin/crm/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          taskType,
          targetType,
          targetId: entityId,
          targetLabel: displayName,
          dueAt: taskDue ? new Date(taskDue).toISOString() : undefined,
          assignToMe: true,
        }),
      })
      setTaskTitle("")
      setTaskDue("")
      setTaskFormOpen(false)
      setSavedMsg("할 일을 추가했어요")
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : "할 일 저장에 실패했습니다.")
    } finally {
      setActingId(null)
    }
  }, [taskTitle, taskType, customerKey, targetType, entityId, displayName, taskDue, refetch])

  const handleCsMotion = useCallback(
    async (motion: CsMotion) => {
      if (!customerKey) return
      setActingId(`cs:${motion.key}`)
      setError(null)
      try {
        await adminFetchJson("/api/admin/crm/tasks", {
          method: "POST",
          body: JSON.stringify({
            title: motion.title,
            taskType: motion.taskType,
            targetType,
            targetId: entityId,
            targetLabel: displayName,
            assignToMe: true,
          }),
        })
        setSavedMsg("CS 할 일을 만들었어요")
        await refetch()
      } catch (err) {
        setError(err instanceof Error ? err.message : "CS 할 일 생성에 실패했습니다.")
      } finally {
        setActingId(null)
      }
    },
    [customerKey, targetType, entityId, displayName, refetch]
  )

  const handleCompleteTask = useCallback(
    async (taskId: string) => {
      setActingId(`task:${taskId}`)
      setError(null)
      try {
        await adminFetchJson(`/api/admin/crm/tasks/${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "complete", outcome: "고객 360에서 완료" }),
        })
        setSavedMsg("할 일을 완료했어요")
        await refetch()
      } catch (err) {
        setError(err instanceof Error ? err.message : "할 일 완료에 실패했습니다.")
      } finally {
        setActingId(null)
      }
    },
    [refetch]
  )

  const handleAddDeal = useCallback(async () => {
    const title = dealTitle.trim()
    if (!title || !customerKey) return
    setActingId("deal")
    setError(null)
    try {
      await adminFetchJson("/api/admin/crm/deals-lite", {
        method: "POST",
        body: JSON.stringify({
          title,
          stage: dealStage,
          targetType,
          targetId: entityId,
          targetLabel: displayName,
          expectedAmount: dealAmount ? Number(dealAmount.replace(/[^\d.-]/g, "")) : undefined,
          assignToMe: true,
        }),
      })
      setDealTitle("")
      setDealAmount("")
      setDealStage("consult")
      setDealFormOpen(false)
      setSavedMsg("딜을 추가했어요")
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : "딜 저장에 실패했습니다.")
    } finally {
      setActingId(null)
    }
  }, [dealTitle, dealStage, dealAmount, customerKey, targetType, entityId, displayName, refetch])

  const handleDealStage = useCallback(
    async (dealId: string, stage: CrmDealStage) => {
      setActingId(`deal:${dealId}`)
      setError(null)
      try {
        await adminFetchJson(`/api/admin/crm/deals-lite/${encodeURIComponent(dealId)}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "stage", stage }),
        })
        await refetch()
      } catch (err) {
        setError(err instanceof Error ? err.message : "딜 단계 변경에 실패했습니다.")
      } finally {
        setActingId(null)
      }
    },
    [refetch]
  )

  const money = data?.money
  const moneyVisible = useMemo(() => money?.available ?? false, [money])

  // 견적 → 오더 → 수납 파생. 견적=Deal Lite(작업 캐시), 오더·수납=NEO(공식 원천).
  const quoteTotal = useMemo(() => sumAmounts((data?.deals.rows ?? []).map((d) => d.expectedAmount)), [data])
  const orderTotal = money?.totalOrderAmount ?? null
  const collectionTotal = useMemo(() => sumAmounts((money?.collections ?? []).map((c) => c.amount)), [money])
  const outstanding = orderTotal != null && collectionTotal != null ? orderTotal - collectionTotal : null
  const ltv = collectionTotal ?? orderTotal ?? quoteTotal ?? null

  // 헤더 스캔 플래그 — 리스트와 동일 어휘(VIP·만료·미수·핫·업셀…), 360 데이터로 파생.
  const headerFlags = useMemo(
    () =>
      data?.found
        ? deriveCustomerFlags({
            source: targetType === "neo_account" ? "neo_account" : "lead",
            score: header?.score ?? null,
            expireAt: data.risk.nearestExpireAt,
            outstanding,
            updatedAt: header?.updatedAt ?? null,
            balance: money?.totalBalance ?? null,
            vip: (ltv ?? 0) >= 30_000_000,
            lifecycle:
              data.serviceRisk && (data.serviceRisk.level === "urgent" || data.serviceRisk.level === "soon")
                ? "account_risk"
                : undefined,
          })
        : [],
    [data, header, targetType, outstanding, money, ltv]
  )

  // 특이사항 피드 = 위험 신호가 있는 활동만.
  const feedRows = useMemo(() => (data?.activity.rows ?? []).filter((event) => event.sentiment === "risk"), [data])
  const timelineRows = data?.activity.rows ?? []
  const visibleActivity = activityTab === "feed" ? feedRows : timelineRows

  // 다음 액션 추천 — 규칙 기반(nextAction·우선순위 사유·서비스 위험 합성). AI 아님, 출처 표시.
  const recommendation = useMemo(() => {
    if (!data?.found) return null
    const title =
      header?.nextActionLabel ??
      (data.serviceRisk?.level === "urgent" || data.serviceRisk?.level === "soon"
        ? "재계약·갱신 확인"
        : header?.priorityReason
          ? "후속 연락"
          : null)
    if (!title) return null
    const reasons: string[] = []
    if (header?.priorityReason) reasons.push(header.priorityReason)
    if (data.serviceRisk?.reasons.length) reasons.push(...data.serviceRisk.reasons.map((r) => r.label))
    if (data.risk.reasons.length) reasons.push(...data.risk.reasons)
    return { title, reason: reasons.slice(0, 3).join(" · ") || "우선순위 신호 기준 추천" }
  }, [data, header])

  const handleRunRecommendation = useCallback(async () => {
    if (!recommendation || !customerKey) return
    setActingId("rec")
    setError(null)
    try {
      await adminFetchJson("/api/admin/crm/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: recommendation.title,
          taskType: "call",
          targetType,
          targetId: entityId,
          targetLabel: displayName,
          assignToMe: true,
        }),
      })
      setSavedMsg("추천 할 일을 만들었어요")
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : "추천 실행에 실패했습니다.")
    } finally {
      setActingId(null)
    }
  }, [recommendation, customerKey, targetType, entityId, displayName, refetch])

  const loadMoreEvents = useCallback(async () => {
    if (!url) return
    setEventsExpanded(true)
    try {
      const next = await adminFetchJsonCached<Customer360>(`${url}?eventsLimit=50`, undefined, {
        cacheKey: `${url}:all`,
        ttlMs: 15_000,
      })
      setData(next)
    } catch {
      // 실패 시 현재 데이터 유지
    }
  }, [url])

  if (!customerKey) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl">
        {/* header */}
        <div className="sticky top-0 z-10 border-b border-[#e8e8e4] bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-[#111110] px-2 py-0.5 text-[11px] font-semibold text-white">
                {header?.sourceLabel ?? (targetType === "neo_account" ? "고객" : "리드")}
              </span>
              {header?.statusLabel ? (
                <span className="rounded-full bg-[#fafaf8] px-2 py-0.5 text-[11px] font-semibold text-[#1a1a1a]/55">
                  {header.statusLabel}
                </span>
              ) : null}
              {data?.risk ? (
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_CLASS[data.risk.severity]}`}>
                  리스크 {SEVERITY_LABEL[data.risk.severity]}
                </span>
              ) : null}
              {headerFlags.length > 0 ? <CrmCustomerFlags flags={headerFlags} max={5} /> : null}
            </div>
            <h2 className="truncate text-[18px] font-bold text-[#111110]">{displayName}</h2>
            <p className="mt-0.5 truncate text-[12px] text-[#1a1a1a]/45">
              <User2 className="mr-1 inline h-3 w-3" />
              {data?.contacts?.phone ? `${data.contacts.phone} · ` : ""}
              {header?.ownerName ?? "담당 미배정"}
              {targetType === "neo_account" ? ` · ${header?.region ?? "지역 미지정"}` : ""}
              {header?.priorityReason ? ` · ${header.priorityReason}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2]"
              aria-label="새로고침"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2]"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {data?.contacts?.phone ? (
              <a
                href={`tel:${data.contacts.phone}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#111110] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Phone className="h-3.5 w-3.5" />콜
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setDealFormOpen(true)
                focusSection("c360-deal")
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
            >
              <CircleDollarSign className="h-3.5 w-3.5" />견적
            </button>
            <button
              type="button"
              onClick={() => focusSection("c360-note")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
            >
              <ClipboardList className="h-3.5 w-3.5" />활동 기록
            </button>
          </div>
        </div>

        {savedMsg ? (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
            <div className="flex items-center gap-1.5 rounded-full bg-[#084734] px-3.5 py-2 text-[12px] font-semibold text-white shadow-lg">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {savedMsg}
            </div>
          </div>
        ) : null}

        {/* body */}
        <div className="flex-1 space-y-3 overflow-y-auto bg-[#f5f5f2] p-4">
          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] font-medium text-[#B85C33]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {data?.health.warnings.length ? (
            <div className="flex items-start gap-2 rounded-xl border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[12px] text-[#7A520F]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{data.health.warnings.join(" ")}</span>
            </div>
          ) : null}

          {/* 다음 액션 추천 — 규칙 기반 파생(Derived). 공식 데이터를 대체하지 않는다. */}
          {recommendation ? (
            <section className="rounded-2xl border border-[#D7EBDD] bg-[#ECFDF5] p-4">
              <div className="mb-1 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#084734]" />
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#084734]">
                  다음 액션 추천 · 규칙 기반
                </span>
              </div>
              <h3 className="text-[15px] font-bold text-[#111110]">{recommendation.title}</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/55">{recommendation.reason}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleRunRecommendation()}
                  disabled={actingId === "rec"}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  실행 · 할 일 추가
                </button>
                <button
                  type="button"
                  onClick={() => focusSection("c360-note")}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#D7EBDD] bg-white px-3 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#D7EBDD]"
                >
                  <StickyNote className="h-3.5 w-3.5" />
                  메모 남기기
                </button>
              </div>
            </section>
          ) : null}

          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-[#1a1a1a]/40">
              <Loader2 className="h-4 w-4 animate-spin" />
              고객 정보를 불러오는 중입니다...
            </div>
          ) : null}

          {/* contacts + risk */}
          {data ? (
            <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <SectionTitle icon={<User2 className="h-3.5 w-3.5" />}>연락처 · 리스크</SectionTitle>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">전화</p>
                  <p className="font-medium text-[#111110]">{data.contacts?.phone ?? "-"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">이메일</p>
                  <p className={`truncate font-medium ${data.contacts?.email ? "text-[#111110]" : "text-[#1a1a1a]/35"}`}>
                    {data.contacts?.email ?? "이메일 미확인"}
                  </p>
                </div>
                {data.contacts?.extra.map((field) => (
                  <div key={`${field.label}:${field.value}`} className="col-span-2">
                    <p className="text-[11px] font-semibold text-[#1a1a1a]/35">{field.label}</p>
                    <p className="font-medium text-[#111110]">{field.value}</p>
                  </div>
                ))}
              </div>
              {data.serviceRisk ? (
                <div className="mt-3 rounded-xl border border-[#f0f0ec] bg-[#fafaf8] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-[#1a1a1a]/45">서비스(NEO)</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          SERVICE_RISK_CLASS[data.serviceRisk.level] ?? SERVICE_RISK_CLASS.normal
                        }`}
                      >
                        {SERVICE_RISK_LABEL[data.serviceRisk.level] ?? data.serviceRisk.level}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#1a1a1a]/35">
                      {data.serviceRisk.freshnessLabel ?? "NEO 정보 없음"} · {CONFIDENCE_LABEL[data.serviceRisk.confidence]}
                    </span>
                  </div>
                  {data.serviceRisk.reasons.length ? (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {data.serviceRisk.reasons.map((reason) => (
                        <li key={reason.code} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#7A520F]">
                          {reason.label}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {data.risk.reasons.length ? (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {data.risk.reasons.map((reason) => (
                    <li key={reason} className="rounded-full bg-[#FEF3EE] px-2 py-0.5 text-[11px] font-medium text-[#B85C33]">
                      {reason}
                    </li>
                  ))}
                </ul>
              ) : data.serviceRisk ? null : (
                <p className="mt-3 text-[12px] text-[#1a1a1a]/40">특이 리스크 신호 없음</p>
              )}
            </section>
          ) : null}

          {/* money — 견적 → 오더 → 수납 */}
          {data ? (
            <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <SectionTitle icon={<Coins className="h-3.5 w-3.5" />}>돈 흐름 · 견적 → 오더 → 수납</SectionTitle>
              {targetType === "lead" ? (
                <p className="text-[12px] text-[#1a1a1a]/40">리드 단계 · 연결된 딜 없음</p>
              ) : moneyVisible || quoteTotal != null ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <FunnelRow
                      icon={<CircleDollarSign className="h-3.5 w-3.5" />}
                      label="견적"
                      amount={quoteTotal}
                      meta={quoteTotal != null ? `Deal Lite ${data.deals.summary.total}건 · 작업 캐시` : "연결된 견적 없음"}
                      state={quoteTotal != null && quoteTotal > 0 ? "done" : "pending"}
                    />
                    <ArrowRight className="ml-2.5 h-3.5 w-3.5 rotate-90 text-[#d8d8d2]" />
                    <FunnelRow
                      icon={<Receipt className="h-3.5 w-3.5" />}
                      label="오더"
                      amount={orderTotal}
                      currency="USD"
                      meta={orderTotal != null ? "NEO 오더 · 공식 원천" : "오더 없음"}
                      state={orderTotal != null && orderTotal > 0 ? "done" : "pending"}
                    />
                    <ArrowRight className="ml-2.5 h-3.5 w-3.5 rotate-90 text-[#d8d8d2]" />
                    <FunnelRow
                      icon={<Coins className="h-3.5 w-3.5" />}
                      label="수납"
                      amount={collectionTotal}
                      currency="USD"
                      meta={
                        outstanding != null && outstanding > 0
                          ? `미수 ${formatMoney(outstanding, "USD")}`
                          : collectionTotal != null
                            ? "NEO 수납 · 공식 원천"
                            : "수납 기록 없음"
                      }
                      state={
                        outstanding != null && outstanding > 0
                          ? "warn"
                          : collectionTotal != null && collectionTotal > 0
                            ? "done"
                            : "pending"
                      }
                    />
                    {(data.serviceRisk?.level === "urgent" || data.serviceRisk?.level === "soon") &&
                    orderTotal != null &&
                    orderTotal > 0 ? (
                      <>
                        <ArrowRight className="ml-2.5 h-3.5 w-3.5 rotate-90 text-[#d8d8d2]" />
                        <FunnelRow
                          icon={<Sparkles className="h-3.5 w-3.5" />}
                          label="갱신 예상"
                          amount={orderTotal}
                          currency="USD"
                          meta="직전 계약 기준 추정 · 만료 임박(파생)"
                          state="pending"
                        />
                      </>
                    ) : null}
                  </div>
                  {money?.eeoAccounts.length ? (
                    <div className="space-y-1.5 border-t border-[#f0f0ec] pt-3">
                      {money.eeoAccounts.slice(0, 4).map((eeo) => (
                        <div key={eeo.id} className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="truncate font-medium text-[#111110]">{eeo.name}</span>
                          <span className="shrink-0 text-[#1a1a1a]/45">
                            잔액 {formatAmount(eeo.balance)} · 만료 {formatDay(eeo.expireAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-[12px] text-[#1a1a1a]/40">표시할 돈흐름 데이터가 없습니다.</p>
              )}
            </section>
          ) : null}

          {/* 핵심 정보 — 참고 데이터, 기본 접힘 */}
          {data ? (
            <CollapsibleSection icon={<Sparkles className="h-3.5 w-3.5" />} title="핵심 정보">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12px]">
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">고객 가치 (LTV) · 추정</p>
                  <p className="text-[15px] font-bold text-[#111110]">{ltv == null ? "-" : `₩${formatAmount(ltv)}`}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">잔액 합계</p>
                  <p className="text-[15px] font-bold text-[#111110]">
                    {money?.totalBalance == null ? "-" : `₩${formatAmount(money.totalBalance)}`}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">담당</p>
                  <p className="font-medium text-[#111110]">{header?.ownerName ?? "미배정"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">
                    {targetType === "neo_account" ? "지역" : "상태"}
                  </p>
                  <p className="font-medium text-[#111110]">
                    {targetType === "neo_account" ? header?.region ?? "지역 미지정" : header?.statusLabel ?? "-"}
                  </p>
                </div>
                {data.risk.nearestExpireAt ? (
                  <div>
                    <p className="text-[11px] font-semibold text-[#1a1a1a]/35">최근접 만료</p>
                    <p className="font-medium text-[#111110]">{formatDay(data.risk.nearestExpireAt)}</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">생성일</p>
                  <p className="font-medium text-[#111110]">{header?.createdAt ? formatDay(header.createdAt) : "-"}</p>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-[#1a1a1a]/35">LTV는 수납·오더 기준 추정값 · 공식 잔액/만료는 NEO 원천</p>
            </CollapsibleSection>
          ) : null}

          {/* deals (Deal Lite) */}
          {data ? (
            <section id="c360-deal" className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <SectionTitle icon={<Briefcase className="h-3.5 w-3.5" />}>
                딜 {data.deals.summary.total > 0 ? `(${data.deals.summary.total})` : ""}
              </SectionTitle>
              <div className="mb-3 space-y-1.5">
                {data.deals.rows.length === 0 ? (
                  <p className="text-[12px] text-[#1a1a1a]/40">진행 중인 딜이 없습니다.</p>
                ) : (
                  data.deals.rows.map((deal) => (
                    <div key={deal.id} className="rounded-xl bg-[#fafaf8] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[12px] font-semibold text-[#111110]">{deal.title}</p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            deal.status === "won"
                              ? "bg-[#ECFDF5] text-[#084734]"
                              : deal.status === "lost"
                                ? "bg-[#FEF3EE] text-[#B85C33]"
                                : "bg-white text-[#1a1a1a]/55"
                          }`}
                        >
                          {DEAL_STAGE_LABEL[deal.stage]}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-[#1a1a1a]/45">
                          {deal.expectedAmount != null ? `${formatAmount(deal.expectedAmount)} · ` : ""}
                          {deal.expectedCloseAt ? `예상 ${formatDay(deal.expectedCloseAt)}` : "종료일 미정"}
                        </p>
                        {deal.status === "open" ? (
                          <select
                            value={deal.stage}
                            onChange={(event) => void handleDealStage(deal.id, event.target.value as CrmDealStage)}
                            disabled={actingId === `deal:${deal.id}`}
                            className="h-7 rounded-lg border border-[#e8e8e4] bg-white px-1.5 text-[11px] font-semibold text-[#111110] outline-none disabled:opacity-50"
                            aria-label="딜 단계"
                          >
                            {DEAL_STAGE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-[#f0f0ec] pt-3">
                {dealFormOpen ? (
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={dealTitle}
                      onChange={(event) => setDealTitle(event.target.value)}
                      placeholder="새 딜 제목"
                      autoFocus
                      className="h-9 min-w-[140px] flex-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
                    />
                    <input
                      value={dealAmount}
                      onChange={(event) => setDealAmount(event.target.value)}
                      inputMode="numeric"
                      placeholder="예상금액"
                      className="h-9 w-24 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
                    />
                    <select
                      value={dealStage}
                      onChange={(event) => setDealStage(event.target.value as CrmDealStage)}
                      className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                    >
                      {DEAL_STAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleAddDeal()}
                      disabled={!dealTitle.trim() || actingId === "deal"}
                      className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[#111110] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      딜 추가
                    </button>
                    <button
                      type="button"
                      onClick={() => setDealFormOpen(false)}
                      className="inline-flex h-9 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2]"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDealFormOpen(true)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-[#dcdcd6] px-3 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:border-[#111110] hover:text-[#111110]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    딜 추가
                  </button>
                )}
              </div>
            </section>
          ) : null}

          {/* open tasks + quick add */}
          {data ? (
            <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <SectionTitle icon={<ListChecks className="h-3.5 w-3.5" />}>
                열린 할 일 {data.tasks.summary.total > 0 ? `(${data.tasks.summary.total})` : ""}
              </SectionTitle>
              <div className="mb-3 space-y-1.5">
                {data.tasks.rows.length === 0 ? (
                  <p className="text-[12px] text-[#1a1a1a]/40">열린 할 일이 없습니다.</p>
                ) : (
                  data.tasks.rows.map((task) => (
                    <div key={task.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#fafaf8] px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-[#111110]">{task.title}</p>
                        <p className="text-[11px] text-[#1a1a1a]/40">
                          <CalendarClock className="mr-1 inline h-3 w-3" />
                          {task.dueAt ? formatDay(task.dueAt) : "기한 없음"}
                          {task.ownerNameSnapshot ? ` · ${task.ownerNameSnapshot}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCompleteTask(task.id)}
                        disabled={actingId === `task:${task.id}`}
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-[#D7EBDD] bg-[#ECFDF5] px-2 text-[11px] font-semibold text-[#084734] transition-colors hover:bg-[#D7EBDD] disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        완료
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-[#f0f0ec] pt-3">
                {taskFormOpen ? (
                  <div className="flex flex-col gap-2">
                    <input
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                      placeholder="새 할 일 제목"
                      autoFocus
                      className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
                    />
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={taskType}
                        onChange={(event) => setTaskType(event.target.value as CrmTaskType)}
                        className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                      >
                        {TASK_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={taskDue}
                        onChange={(event) => setTaskDue(event.target.value)}
                        className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#111110] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddTask()}
                        disabled={!taskTitle.trim() || actingId === "task"}
                        className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-[#111110] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        내 할 일로 추가
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaskFormOpen(false)}
                        className="inline-flex h-9 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2]"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setTaskFormOpen(true)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-[#dcdcd6] px-3 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:border-[#111110] hover:text-[#111110]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    할 일 추가
                  </button>
                )}
              </div>
              <div className="mt-3 border-t border-[#f0f0ec] pt-3">
                <p className="mb-1.5 text-[11px] font-semibold text-[#1a1a1a]/45">고객 성공(CS) 동선 · 원클릭</p>
                <div className="flex flex-wrap gap-1.5">
                  {CS_MOTIONS.map((motion) => (
                    <button
                      key={motion.key}
                      type="button"
                      onClick={() => void handleCsMotion(motion)}
                      disabled={actingId === `cs:${motion.key}`}
                      className="inline-flex h-7 items-center gap-1 rounded-full border border-[#e8e8e4] bg-white px-2.5 text-[11px] font-semibold text-[#1a1a1a]/65 transition-colors hover:border-[#084734] hover:text-[#084734] disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" />
                      {motion.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {/* activity timeline + 특이사항 피드 + quick note/회의록 */}
          {data ? (
            <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <div className="mb-3 inline-flex rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-0.5">
                {(
                  [
                    { key: "timeline", label: `타임라인${data.activity.summary.total > 0 ? ` ${data.activity.summary.total}` : ""}` },
                    { key: "feed", label: `특이사항 피드${feedRows.length > 0 ? ` ${feedRows.length}` : ""}` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActivityTab(tab.key)}
                    className={`h-7 rounded-md px-3 text-[12px] font-semibold transition-colors ${
                      activityTab === tab.key ? "bg-[#111110] text-white" : "text-[#1a1a1a]/55 hover:text-[#111110]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="mb-3 flex flex-col gap-2 border-b border-[#f0f0ec] pb-3">
                <div className="inline-flex w-fit rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-0.5">
                  {(
                    [
                      { key: "manual_note", label: "메모", icon: <StickyNote className="h-3 w-3" /> },
                      { key: "meeting_minutes", label: "회의록", icon: <FileText className="h-3 w-3" /> },
                    ] as const
                  ).map((kind) => (
                    <button
                      key={kind.key}
                      type="button"
                      onClick={() => setNoteKind(kind.key)}
                      className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold transition-colors ${
                        noteKind === kind.key ? "bg-white text-[#111110] shadow-sm" : "text-[#1a1a1a]/50 hover:text-[#111110]"
                      }`}
                    >
                      {kind.icon}
                      {kind.label}
                    </button>
                  ))}
                </div>
                <textarea
                  id="c360-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={noteKind === "meeting_minutes" ? "회의록 붙여넣기/입력 후 저장" : "빠른 메모 입력 후 저장"}
                  rows={noteKind === "meeting_minutes" ? 4 : 2}
                  className="rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-2 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
                />
                <button
                  type="button"
                  onClick={() => void handleAddNote()}
                  disabled={!note.trim() || actingId === "note"}
                  className="inline-flex h-9 items-center justify-center gap-1 self-end rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-40"
                >
                  {noteKind === "meeting_minutes" ? <FileText className="h-3.5 w-3.5" /> : <StickyNote className="h-3.5 w-3.5" />}
                  {noteKind === "meeting_minutes" ? "회의록 저장" : "메모 저장"}
                </button>
              </div>

              {visibleActivity.length === 0 ? (
                <p className="text-[12px] text-[#1a1a1a]/40">
                  {activityTab === "feed" ? "특이사항(위험) 기록이 없습니다." : "기록된 활동이 없습니다."}
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {visibleActivity.map((event) => (
                    <li key={event.id} className="flex gap-2.5">
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                          event.sentiment === "risk" ? "bg-[#FEF3EE] text-[#B85C33]" : "bg-[#fafaf8] text-[#1a1a1a]/45"
                        }`}
                      >
                        {EVENT_SOURCE_ICON[event.sourceType] ?? <ClipboardList className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1 border-b border-[#f5f5f2] pb-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-[#1a1a1a]/45">
                            {EVENT_SOURCE_LABEL[event.sourceType] ?? event.sourceType}
                          </span>
                          <span className="text-[11px] text-[#1a1a1a]/35">{formatDate(event.occurredAt)}</span>
                          {event.sentiment === "risk" ? (
                            <span className="rounded bg-[#FEF3EE] px-1.5 py-0.5 text-[10px] font-semibold text-[#B85C33]">위험</span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[12px] font-semibold text-[#111110]">{event.title}</p>
                        {event.summary || event.body ? (
                          <p className="mt-0.5 line-clamp-2 text-[12px] text-[#1a1a1a]/55">{event.summary ?? event.body}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {activityTab === "timeline" &&
              !eventsExpanded &&
              data.activity.summary.total > data.activity.rows.length ? (
                <button
                  type="button"
                  onClick={() => void loadMoreEvents()}
                  className="mt-2.5 inline-flex w-full items-center justify-center rounded-lg border border-[#e8e8e4] bg-white py-2 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
                >
                  전체 활동 보기 (최대 50)
                </button>
              ) : null}
            </section>
          ) : null}

          {/* escape hatch to full source screen */}
          {header || name ? (
            <Link
              href={
                targetType === "neo_account"
                  ? `/admin/crm/customers/accounts?account=${encodeURIComponent(entityId)}`
                  : `/admin/crm/customers/leads?lead=${encodeURIComponent(entityId)}`
              }
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
            >
              원본 화면 열기
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
