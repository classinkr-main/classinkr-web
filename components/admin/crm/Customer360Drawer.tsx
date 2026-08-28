"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Coins,
  ExternalLink,
  ListChecks,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Sparkles,
  StickyNote,
  Tag,
  User2,
  X,
} from "lucide-react"

import { adminFetchJson, adminFetchJsonCached, clearAdminRequestCache } from "@/lib/admin-client"
import {
  CRM_CURRENCY_BADGE,
  formatCNY,
  formatCrmMoney,
  formatUSD,
  isCrmVipMoney,
  type CrmMoney,
} from "@/lib/crm/money-format"
import { pushRecentCustomer } from "@/lib/crm/recent-customers"
import {
  COMPASS_TIMELINE_SOURCE_LABEL,
  mergeCompassTimeline,
  type CompassTimelineEntry,
} from "@/lib/crm/compass-timeline"
import CrmCustomerFlags from "./CrmCustomerFlags"
import CrmContactValue from "./CrmContactValue"
import CrmCustomerPicker from "./CrmCustomerPicker"
import LeadMessageCard from "./LeadMessageCard"
import { eventSourceIcon, eventSourceLabel } from "./event-source-meta"
import ActivityQuickForm from "./rail/ActivityQuickForm"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"
import { deriveCustomerFlags } from "@/lib/crm/customer-flags"
import { LEAD_BADGE_TONE_CLASSES } from "@/lib/crm/lead-badges"
import { computeCustomerHealth, HEALTH_BAND_STYLE } from "@/lib/crm/customer-health"
import { buildCustomerNextActionRecommendation } from "@/lib/crm/customer-next-action"
import { CS_MOTIONS, type CsMotion } from "@/lib/crm/cs-motions"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"
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
  /** 컴포저 작성 중 여부 통지 — 부모의 URL 기반 닫기 경로(뒤로가기)가 같은 dirty 가드를 공유하게 한다. */
  onDirtyChange?: (dirty: boolean) => void
}

// 섹션 점프 탭 — 활동 승격 스펙: 탭 표시·DOM 등장 순서 모두 요약→활동→할일→딜→머니.
// 스크롤 스파이는 이 배열 순서로 '마지막 통과' 판정을 하므로 실제 렌더 순서와 함께 맞춘다.
const C360_SECTION_DOM_ORDER = ["c360-summary", "c360-activity", "c360-tasks", "c360-deal", "c360-money"] as const

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

// 활동 출처 라벨·아이콘 — event-source-meta.tsx SSOT(타임라인을 유형으로 빠르게 스캔).

// 고정 컴포저 본문 textarea id — 헤더 '활동 기록'·추천 '메모 남기기' CTA의 포커스 대상.
// 콜/문자/메모/회의록 입력은 전부 고정 컴포저(ActivityQuickForm)가 담당한다(구 인라인 폼 제거).
const COMPOSER_BODY_ID = "c360-composer-body"

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

// 제품 매출 타일 — SW/HW 결제 누적(¥ CNY)·칠판 대수(대). REV/HW 원장을 계정키로 조인한 값.
// matched=false면 "—"로 흐리게 표기(연결 없음). 통화 칩(¥/대)으로 SW·HW·대수 오독을 막는다.
function ProductTile({
  label,
  chip,
  display,
  matched,
}: {
  label: string
  chip: string
  display: string
  matched: boolean
}) {
  return (
    <div className="rounded-xl bg-[#fafaf8] px-3 py-2.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold text-[#1a1a1a]/45">{label}</span>
        <span className="rounded-full bg-white px-1 py-0.5 text-[9px] font-bold text-[#1a1a1a]/40">{chip}</span>
      </div>
      <p className={`mt-1 text-[15px] font-bold ${matched ? "text-[#111110]" : "text-[#1a1a1a]/30"}`}>
        {matched ? display : "—"}
      </p>
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

// 다가오는 일정 — 예정 콜/미팅 날짜 상대 표기.
function dueRelativeLabel(value: string | null | undefined): string {
  if (!value) return "기한 미정"
  const due = new Date(value)
  if (Number.isNaN(due.getTime())) return "기한 미정"
  const now = new Date()
  const dayMs = 86_400_000
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diff = Math.round((dueDay - todayDay) / dayMs)
  if (diff === 0) return "오늘"
  if (diff === 1) return "내일"
  return `D-${diff}`
}

function monthDayParts(value: string | null | undefined): { month: string; day: string } {
  if (!value) return { month: "", day: "-" }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { month: "", day: "-" }
  return { month: `${date.getMonth() + 1}월`, day: String(date.getDate()) }
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
  const contentId = useId()
  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2"
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[#1a1a1a]/45">
          {icon}
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#1a1a1a]/35 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open ? <div id={contentId} className="mt-3">{children}</div> : null}
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

/**
 * Compass(마케팅팀 앱) 활동 한 줄. 우리 원장 기록과 섞이므로 소스 라벨을 항상 붙인다.
 * actor 는 표시용 문자열 — Compass는 공용 계정 앱이라 신원 증거가 아니다(매핑 금지).
 * 장문은 3줄로 접고 펼칠 수 있게 한다.
 */
function CompassTimelineRow({ entry }: { entry: CompassTimelineEntry }) {
  const [expanded, setExpanded] = useState(false)
  const body = entry.body
  const isLong = Boolean(body && (body.length > 120 || body.split("\n").length > 3))

  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-[#2F5D8C]/25 text-[10px] font-bold text-[#2F5D8C]">
        C
      </span>
      <div className="min-w-0 flex-1 border-b border-[#f5f5f2] pb-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-[#2F5D8C]">
            {COMPASS_TIMELINE_SOURCE_LABEL} · {entry.kindLabel}
          </span>
          <span className="text-[11px] text-[#1a1a1a]/35">{formatDate(entry.occurredAt)}</span>
          {entry.actor ? <span className="text-[11px] text-[#1a1a1a]/35">· {entry.actor}</span> : null}
        </div>
        {body ? (
          <>
            <p
              className={`mt-0.5 whitespace-pre-wrap text-[12px] text-[#1a1a1a]/55 ${
                isLong && !expanded ? "line-clamp-3" : ""
              }`}
            >
              {body}
            </p>
            {isLong ? (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
                className="mt-0.5 text-[11px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
              >
                {expanded ? "접기" : "펼치기"}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  )
}

export default function Customer360Drawer({ customerKey, name, onClose, onDirtyChange }: Props) {
  const [data, setData] = useState<Customer360 | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [taskTitle, setTaskTitle] = useState("")
  const [taskType, setTaskType] = useState<CrmTaskType>("call")
  const [taskDue, setTaskDue] = useState("")
  const [dealTitle, setDealTitle] = useState("")
  const [dealStage, setDealStage] = useState<CrmDealStage>("consult")
  const [dealAmount, setDealAmount] = useState("")
  const [activityTab, setActivityTab] = useState<"timeline" | "feed">("timeline")
  const [activitySource, setActivitySource] = useState<"all" | "manual_note" | "meeting_minutes">("all")
  const [eventsExpanded, setEventsExpanded] = useState(false)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [tagBusy, setTagBusy] = useState(false)
  const [dealFormOpen, setDealFormOpen] = useState(false)
  const [taskFormOpen, setTaskFormOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<string>("c360-summary")
  // 고정 컴포저 작성 중 여부 — 닫기 가드용(ActivityQuickForm onDirtyChange가 플립 시점에만 통지).
  const [composerDirty, setComposerDirty] = useState(false)
  // 'NEO 등록됨' 수동 연결 패널 — 홈페이지 유입(site) 리드 전용.
  const [neoLinkOpen, setNeoLinkOpen] = useState(false)
  const [neoLinkBusy, setNeoLinkBusy] = useState(false)
  const [neoLinkError, setNeoLinkError] = useState<string | null>(null)
  const [neoPickerLabel, setNeoPickerLabel] = useState("")
  const [neoPickerId, setNeoPickerId] = useState("")
  const router = useRouter()
  const bodyRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  // dirty 통지는 ref 경유 — 부모가 인라인 함수를 넘겨도 콜백 재생성/재구독 루프가 없게.
  const onDirtyChangeRef = useRef(onDirtyChange)
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange
  })
  const handleComposerDirtyChange = useCallback((dirty: boolean) => {
    setComposerDirty(dirty)
    onDirtyChangeRef.current?.(dirty)
  }, [])

  const url = customerKey ? `/api/admin/crm/customers/${encodeURIComponent(customerKey)}/360` : null

  // 섹션으로 점프 — 요약은 최상단으로, 나머지는 sticky 탭 높이만큼 여백을 두고 정렬.
  const scrollToSection = useCallback((id: string) => {
    const root = bodyRef.current
    if (!root) return
    setActiveSection(id)
    if (id === "c360-summary") {
      root.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    const el = document.getElementById(id)
    if (!el) return
    const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 8
    root.scrollTo({ top: Math.max(0, top), behavior: "smooth" })
  }, [])

  // 닫기 게이트 — 컴포저에 작성 중인 기록이 있으면 확인 후 닫는다.
  // 배경 클릭·ESC·스와이프·닫기 버튼 등 모든 닫기 경로가 이 게이트를 지난다.
  const requestClose = useCallback(() => {
    if (composerDirty && !window.confirm("작성 중인 기록이 있습니다. 닫을까요?")) return
    onClose()
  }, [composerDirty, onClose])

  // 모바일 스와이프-닫기 — 오른쪽으로 충분히 밀면 닫는다(수평 제스처만).
  const onTouchStart = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0]
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }, [])
  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      const start = touchStartRef.current
      touchStartRef.current = null
      if (!start) return
      const touch = event.changedTouches[0]
      if (!touch) return
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      if (dx > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) requestClose()
    },
    [requestClose]
  )

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
    setTaskTitle("")
    setTaskType("call")
    setTaskDue("")
    setDealTitle("")
    setDealStage("consult")
    setDealAmount("")
    setActivityTab("timeline")
    setActivitySource("all")
    setEventsExpanded(false)
    setDealFormOpen(false)
    setTaskFormOpen(false)
    // 고객 전환 시 컴포저는 새 대상으로 리마운트되므로 dirty 가드도 초기화(부모에도 통지).
    handleComposerDirtyChange(false)
    // NEO 연결 패널도 이전 고객의 입력·에러가 남지 않게 닫는다.
    setNeoLinkOpen(false)
    setNeoLinkBusy(false)
    setNeoLinkError(null)
    setNeoPickerLabel("")
    setNeoPickerId("")
    // 고객 전환 시 이전 고객의 스크롤 위치·활성 섹션 탭이 남지 않게 최상단으로 리셋.
    setActiveSection("c360-summary")
    bodyRef.current?.scrollTo({ top: 0 })
    if (customerKey) void load()
  }, [customerKey, load, handleComposerDirtyChange])

  // Escape 닫기 + Tab 포커스 트랩 + 이전 포커스 복귀를 공용 훅에 위임한다.
  // 직접 만든 ESC 리스너에는 트랩이 없어, aria-modal="true"를 선언해 놓고도 Tab이 백드롭 뒤
  // 배경 페이지 컨트롤로 새어 나갔다. 훅은 focusRef의 role="dialog" 조상을 트랩 범위로 잡는다.
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(customerKey, requestClose, closeButtonRef)

  // 배경 스크롤 잠금 — 드로어는 fixed라 배경 목록이 그대로 스크롤된다. 백드롭 위에서 휠·스와이프하면
  // 뒤 목록이 드로어 밑에서 밀려나가고, 닫았을 때 원래 자리가 아닌 곳에 서 있게 된다.
  useEffect(() => {
    if (!customerKey) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [customerKey])


  // 스크롤 스파이 — 본문 스크롤 위치로 현재 섹션 탭을 활성화한다(DOM 순서로 '마지막 통과' 판정).
  useEffect(() => {
    const root = bodyRef.current
    if (!root || !data) return
    const compute = () => {
      const rootTop = root.getBoundingClientRect().top
      let current: string = C360_SECTION_DOM_ORDER[0]
      for (const id of C360_SECTION_DOM_ORDER) {
        const el = document.getElementById(id)
        if (!el) continue
        if (el.getBoundingClientRect().top - rootTop <= 80) current = id
      }
      setActiveSection(current)
    }
    compute()
    root.addEventListener("scroll", compute, { passive: true })
    return () => root.removeEventListener("scroll", compute)
  }, [data])

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

  // 라벨(수기 태그) — 360 페이로드에 동승하므로 온-오픈 별도 fetch는 없다. 고객 전환 시 리셋만.
  useEffect(() => {
    setTags([])
    setTagInput("")
  }, [customerKey])

  // 360 도착/갱신 시 페이로드의 라벨로 동기화. 태그 편집 직후에는 mutation 응답이 setTags로
  // 이미 최신이고 data는 그대로라 이 효과가 되돌리지 않는다(이후 refetch 페이로드도 같은 값).
  useEffect(() => {
    if (data) setTags(data.tags ?? [])
  }, [data])

  const header = data?.header
  const displayName = header?.name ?? name ?? "고객"
  const targetType = data?.source ?? (customerKey?.startsWith("neo:") ? "neo_account" : "lead")
  const entityId = data?.entityId ?? (customerKey ? customerKey.slice(customerKey.indexOf(":") + 1) : "")

  const refetch = useCallback(async () => {
    if (url) clearAdminRequestCache()
    await load({ force: true, expanded: eventsExpanded })
  }, [load, url, eventsExpanded])

  // NEO 등록 액션·발송허브 딥링크용 파생값 — 등록 액션은 홈페이지 유입(site) 리드에만 노출.
  const contactPhone = data?.contacts?.phone ?? null
  const isSiteLead = Boolean(data?.found) && targetType === "lead" && data?.origin === "site"
  const crmRegistered = data?.crmRegistered ?? false

  // 리드 → NEO 계정 수동 등록 확정. 성공 시 360 재조회로 pill('정식 리드')로 전환된다.
  const submitNeoLink = useCallback(
    async (pick: { targetId: string; targetLabel: string }) => {
      if (targetType !== "lead" || !entityId) return
      setNeoLinkBusy(true)
      setNeoLinkError(null)
      try {
        await adminFetchJson("/api/admin/crm/leads/neo-link", {
          method: "POST",
          body: JSON.stringify({ leadId: entityId, neoAccountId: pick.targetId, name: pick.targetLabel }),
        })
        setSavedMsg("정식 리드로 전환되었습니다")
        setNeoLinkOpen(false)
        setNeoPickerLabel("")
        setNeoPickerId("")
        await refetch()
      } catch (err) {
        // 실패 시 피커 선택을 되돌린다 — '연결됨' 표시가 에러 문구와 모순되지 않게.
        setNeoPickerLabel("")
        setNeoPickerId("")
        // 409(이미 다른 타깃으로 확정)는 API가 원인 메시지를 담아 돌려준다 — 그대로 노출.
        setNeoLinkError(err instanceof Error ? err.message : "NEO 등록 연결에 실패했습니다.")
      } finally {
        setNeoLinkBusy(false)
      }
    },
    [targetType, entityId, refetch]
  )

  // 컴포저로 포커스 — 구 인라인 메모 폼을 대체한 CTA(헤더 '활동 기록'·추천 '메모 남기기').
  // 컴포저는 스크롤 본문 밖에 고정돼 있어, 본문 스크롤만 최상단으로 되돌리고 입력에 포커스를 준다.
  const focusComposer = useCallback(() => {
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    document.getElementById(COMPOSER_BODY_ID)?.focus()
  }, [])

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
  // 제품 매출 요약(REV/HW 원장 계정키 조인) — SW·HW 결제 누적(¥), 칠판 대수, 매칭 여부.
  const productSummary = data?.productSummary
  const productMatched = productSummary?.matched ?? false

  // 견적 → 오더 → 수납 파생. 견적=Deal Lite(작업 캐시), 오더·수납=NEO(공식 원천).
  const quoteTotal = useMemo(() => sumAmounts((data?.deals.rows ?? []).map((d) => d.expectedAmount)), [data])
  const orderTotal = money?.totalOrderAmount ?? null
  const collectionTotal = useMemo(() => sumAmounts((money?.collections ?? []).map((c) => c.amount)), [money])
  const performanceTotal = useMemo(() => sumAmounts((money?.performances ?? []).map((p) => p.amount)), [money])
  // 최근 성과 몇 건만 노출(드로어는 요약). 발생일 desc 정렬 후 상위 3건.
  const recentPerformances = useMemo(
    () =>
      [...(money?.performances ?? [])]
        .sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""))
        .slice(0, 3),
    [money]
  )
  // 오더는 USD($), 수금은 CNY(¥)다. 두 값을 빼면 통화가 다른 수를 뺀 무의미한 결과가 나오는데,
  // 그게 "미수" 배지의 근거로 쓰이고 있었다(수금이 크면 미수 없음, 반대면 허위 미수).
  // 같은 통화의 미수 원천이 360 페이로드에 없으므로, 틀린 신호를 만들어 내는 대신 배지를 끈다.
  // 통화별 금액은 아래 '수금·성과 요약'과 상세 화면에서 분리해 그대로 보여준다.
  const outstanding = null
  // LTV도 같은 문제였다 — ¥수금 / $오더 / ₩견적 중 아무거나 골라 한 숫자로 쓰고 항상 "₩"를 붙였다.
  // 통화를 값과 함께 들고 다녀 표기와 VIP 기준선이 출처를 따라가게 한다.
  const ltv: CrmMoney | null = useMemo(() => {
    if (collectionTotal != null) return { amount: collectionTotal, currency: "CNY" }
    if (orderTotal != null) return { amount: orderTotal, currency: "USD" }
    if (quoteTotal != null) return { amount: quoteTotal, currency: "KRW" }
    return null
  }, [collectionTotal, orderTotal, quoteTotal])

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
            vip: isCrmVipMoney(ltv),
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
  // 타임라인은 출처(메모/회의록) 필터를 적용. 피드는 위험 신호 전용이라 필터 비적용.
  const visibleActivity = useMemo(() => {
    const base = activityTab === "feed" ? feedRows : data?.activity.rows ?? []
    if (activityTab === "feed" || activitySource === "all") return base
    return base.filter((event) => event.sourceType === activitySource)
  }, [activityTab, activitySource, feedRows, data])

  // Compass(마케팅팀 앱) 활동을 같은 타임라인에 시간순으로 얹는다. 피드 탭은 위험 신호
  // 전용인데 Compass 기록에는 sentiment 축이 없어서 넣지 않는다(없는 판정을 지어내지 않는다).
  const visibleCompass = useMemo(() => {
    const entries = data?.compass.entries ?? []
    if (activityTab === "feed") return []
    if (activitySource === "manual_note") return entries.filter((entry) => entry.kind === "note")
    if (activitySource === "meeting_minutes") return entries.filter((entry) => entry.kind === "meeting")
    return entries
  }, [activityTab, activitySource, data])

  const mergedActivity = useMemo(
    () => mergeCompassTimeline(visibleActivity, visibleCompass),
    [visibleActivity, visibleCompass]
  )

  // 다음 액션 추천 — 규칙 기반(nextAction·우선순위 사유·서비스 위험 합성). AI 아님, 출처 표시.
  const recommendation = useMemo(() => {
    if (!data?.found) return null
    return buildCustomerNextActionRecommendation({
      nextActionLabel: header?.nextActionLabel,
      priorityReason: header?.priorityReason,
      serviceRisk: data.serviceRisk,
      riskReasons: data.risk.reasons,
    })
  }, [data, header])

  // 고객 요약 — LLM 아님. 위치·단계·위험·만료·미수 신호를 규칙으로 합성한 한 문장(Derived).
  const derivedSummary = useMemo(() => {
    if (!data?.found || !header) return null
    const segs: string[] = []
    if (header.region) segs.push(`${header.region} 소재`)
    if (targetType === "neo_account") segs.push("고객")
    else segs.push(`${header.statusLabel ?? "리드"} 단계`)
    if (header.ownerName) segs.push(`담당 ${header.ownerName}`)
    if (data.risk?.severity === "critical") segs.push("이탈 위험 긴급")
    else if (data.risk?.severity === "high") segs.push("이탈 위험 높음")
    if (data.serviceRisk && (data.serviceRisk.level === "urgent" || data.serviceRisk.level === "soon"))
      segs.push("계약 만료 임박")
    if ((money?.totalBalance ?? 0) > 0) segs.push(`미수 잔액 ${formatCNY(money?.totalBalance ?? null)}`)
    if (header.priorityReason) segs.push(header.priorityReason)
    return segs.length > 0 ? segs.join(" · ") : null
  }, [data, header, targetType, money])

  // 최근접 만료까지 일수 — 건강도 산식 입력.
  const daysToExpire = useMemo(() => {
    const iso = data?.risk?.nearestExpireAt
    if (!iso) return null
    const due = new Date(iso)
    if (Number.isNaN(due.getTime())) return null
    return Math.round((due.getTime() - Date.now()) / 86_400_000)
  }, [data])

  // 고객 건강도 — 규칙 기반 단일 점수(lib/crm/customer-health SSOT). 헤더 배지로 노출.
  const health = useMemo(() => {
    if (!data?.found) return null
    return computeCustomerHealth({
      riskSeverity: data.risk?.severity ?? null,
      serviceLevel: data.serviceRisk?.level ?? null,
      hasOutstanding: (money?.totalBalance ?? 0) > 0,
      daysToExpire,
      lastContactDays: null,
    })
  }, [data, money, daysToExpire])

  const handleRunRecommendation = useCallback(async () => {
    if (!recommendation || !customerKey) return
    setActingId("rec")
    setError(null)
    try {
      await adminFetchJson("/api/admin/crm/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: recommendation.title,
          taskType: recommendation.taskType,
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
    // 성공한 뒤에만 펼침으로 표시한다. 요청 전에 켜 두면 실패했을 때 목록은 그대로인데
    // "전체 활동 보기" 버튼(!eventsExpanded 조건)만 사라져, 잘린 목록에 재시도 수단 없이 갇힌다.
    setEventsLoading(true)
    setError(null)
    try {
      const next = await adminFetchJsonCached<Customer360>(`${url}?eventsLimit=50`, undefined, {
        cacheKey: `${url}:all`,
        ttlMs: 15_000,
      })
      setData(next)
      setEventsExpanded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "전체 활동을 불러오지 못했습니다.")
    } finally {
      setEventsLoading(false)
    }
  }, [url])

  const handleAddTag = useCallback(async () => {
    const clean = tagInput.trim()
    if (!clean || !customerKey) return
    setTagBusy(true)
    try {
      const result = await adminFetchJson<{ tags: string[] }>(
        `/api/admin/crm/customers/${encodeURIComponent(customerKey)}/tags`,
        { method: "POST", body: JSON.stringify({ tag: clean }) }
      )
      setTags(result.tags ?? [])
      setTagInput("")
      // 태그가 360 페이로드에 동승하므로, 캐시를 비워 재오픈 시 편집 전 태그가 되살아나지 않게 한다.
      clearAdminRequestCache()
      setSavedMsg("라벨을 추가했어요")
    } catch (err) {
      setError(err instanceof Error ? err.message : "라벨 추가에 실패했습니다.")
    } finally {
      setTagBusy(false)
    }
  }, [tagInput, customerKey])

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      if (!customerKey) return
      setTagBusy(true)
      try {
        const result = await adminFetchJson<{ tags: string[] }>(
          `/api/admin/crm/customers/${encodeURIComponent(customerKey)}/tags?tag=${encodeURIComponent(tag)}`,
          { method: "DELETE" }
        )
        setTags(result.tags ?? [])
        // 태그가 360 페이로드에 동승하므로, 캐시를 비워 재오픈 시 편집 전 태그가 되살아나지 않게 한다.
        clearAdminRequestCache()
        setSavedMsg("라벨을 지웠어요")
      } catch (err) {
        setError(err instanceof Error ? err.message : "라벨 삭제에 실패했습니다.")
      } finally {
        setTagBusy(false)
      }
    },
    [customerKey]
  )

  // 다가오는 일정 — 기한 있는 열린 할 일 중 오늘 이후만, 가까운 순. (전체 할 일은 아래 목록.)
  const upcomingTasks = useMemo(() => {
    const rows = data?.tasks?.rows ?? []
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    return rows
      .filter((task) => task.dueAt && new Date(task.dueAt).getTime() >= todayStart)
      .slice()
      .sort((a, b) => new Date(a.dueAt as string).getTime() - new Date(b.dueAt as string).getTime())
      .slice(0, 4)
  }, [data])

  if (!customerKey) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={requestClose} aria-hidden />
      <div
        className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl [&_a]:min-h-11 [&_a]:focus-visible:outline-none [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-[#084734] [&_a]:focus-visible:ring-offset-2 [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-[#084734] [&_button]:focus-visible:ring-offset-2 [&_input]:min-h-11 [&_input]:focus-visible:outline-none [&_input]:focus-visible:ring-2 [&_input]:focus-visible:ring-[#084734] [&_input]:focus-visible:ring-offset-1 [&_select]:min-h-11 [&_select]:focus-visible:outline-none [&_select]:focus-visible:ring-2 [&_select]:focus-visible:ring-[#084734] [&_select]:focus-visible:ring-offset-1 sm:[&_a]:min-h-0 sm:[&_button]:min-h-0 sm:[&_button]:min-w-0 sm:[&_input]:min-h-0 sm:[&_select]:min-h-0"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-customer-drawer-title"
        aria-busy={loading || eventsLoading || tagBusy || neoLinkBusy || actingId !== null}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="sr-only" role="status" aria-live="polite">
          {loading
            ? `${displayName} 고객 정보를 불러오는 중입니다.`
            : eventsLoading
              ? `${displayName} 고객의 활동을 더 불러오는 중입니다.`
              : tagBusy || neoLinkBusy || actingId !== null
                ? `${displayName} 고객 정보를 저장하는 중입니다.`
                : ""}
        </div>
        {/* 모바일 스와이프-닫기 힌트 — 왼쪽 그랩바(전체 화면 덮는 패널의 탭-투-클로즈 대체) */}
        <button
          type="button"
          onClick={requestClose}
          aria-label="닫기"
          className="absolute left-0 top-1/2 z-20 flex h-16 w-11 -translate-y-1/2 items-center justify-start bg-transparent pl-1 sm:hidden"
        >
          <span aria-hidden className="h-10 w-1.5 rounded-full bg-[#1a1a1a]/12" />
        </button>
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
              {health ? (
                <span
                  className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    color: HEALTH_BAND_STYLE[health.band].fc,
                    backgroundColor: HEALTH_BAND_STYLE[health.band].bg,
                    borderColor: HEALTH_BAND_STYLE[health.band].bd,
                  }}
                  title="규칙 기반 건강도 점수(0~100) — 리스크·서비스 위험·미수·만료 신호 합성"
                >
                  건강도 {health.score} · {health.label}
                </span>
              ) : null}
              {headerFlags.length > 0 ? <CrmCustomerFlags flags={headerFlags} max={5} /> : null}
            </div>
            <h2 id="crm-customer-drawer-title" className="truncate text-[18px] font-bold text-[#111110]">
              {displayName}
            </h2>
            <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] text-[#1a1a1a]/45">
              <User2 className="h-3 w-3 shrink-0" />
              {contactPhone ? (
                <>
                  <CrmContactValue value={contactPhone} className="shrink-0" />
                  <span aria-hidden>·</span>
                </>
              ) : null}
              <span className="truncate">
                {header?.ownerName ?? "담당 미배정"}
                {` · ${header?.region ?? "지역 미지정"}`}
                {header?.priorityReason ? ` · ${header.priorityReason}` : ""}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={loading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2]"
              aria-label={loading ? "고객 정보 새로고침 중" : "고객 정보 새로고침"}
            >
              <RefreshCw aria-hidden className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={requestClose}
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
            {/* 발송허브 딥링크 — 수신자 프리필 파라미터. 연락처 없으면 비활성 표기만. */}
            {contactPhone ? (
              <Link
                href={`/admin/campaigns?message_to=${encodeURIComponent(contactPhone)}&message_name=${encodeURIComponent(displayName)}`}
                title="알림톡/문자 발송허브로 이동"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
              >
                <MessageSquare className="h-3.5 w-3.5" />알림톡/문자
              </Link>
            ) : (
              <span
                aria-disabled="true"
                title="연락처가 없어 발송할 수 없습니다"
                className="pointer-events-none inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] opacity-40"
              >
                <MessageSquare className="h-3.5 w-3.5" />알림톡/문자
              </span>
            )}
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/admin/quotes?tab=hardware&action=new&customerName=${encodeURIComponent(displayName)}`
                )
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
              title="이 고객명으로 하드웨어 견적서를 새로 작성합니다"
            >
              <CircleDollarSign className="h-3.5 w-3.5" />견적
            </button>
            <button
              type="button"
              onClick={focusComposer}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
            >
              <ClipboardList className="h-3.5 w-3.5" />활동 기록
            </button>
            {/* NEO 등록 상태 — 홈페이지 유입 리드만: 등록 확정이면 pill, 아니면 수동 연결 액션. */}
            {isSiteLead ? (
              crmRegistered ? (
                <span
                  className={`inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px] font-bold ${LEAD_BADGE_TONE_CLASSES.green}`}
                >
                  정식 리드 · NEO 등록
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNeoLinkOpen((value) => !value)
                    setNeoLinkError(null)
                  }}
                  aria-expanded={neoLinkOpen}
                  className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#1a1a1a]/60 transition-colors hover:bg-[#fafaf8]"
                >
                  NEO 등록 연결…
                </button>
              )
            ) : null}
          </div>

          {/* NEO 연결 패널 — NEO 계정만 검색해 선택 즉시 확정 링크를 만든다. */}
          {isSiteLead && !crmRegistered && neoLinkOpen ? (
            <div className="mt-2 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3">
              <p className="mb-1.5 text-[12px] font-semibold text-[#111110]">NEO 고객 계정과 연결</p>
              <CrmCustomerPicker
                sources="neo_account"
                label={neoPickerLabel}
                linkedId={neoPickerId}
                onPick={(pick) => {
                  setNeoPickerLabel(pick.targetLabel)
                  setNeoPickerId(pick.targetId)
                  void submitNeoLink(pick)
                }}
                onFreeText={(text) => {
                  setNeoPickerLabel(text)
                  setNeoPickerId("")
                }}
                onClear={() => {
                  setNeoPickerLabel("")
                  setNeoPickerId("")
                }}
              />
              {neoLinkBusy ? <p className="mt-1.5 text-[11px] text-[#1a1a1a]/45">연결 중...</p> : null}
              {neoLinkError ? (
                <p className="mt-1.5 text-[11px] font-medium text-[#B85C33]">{neoLinkError}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* 섹션 점프 탭 — sticky 헤더 아래 고정, 스크롤에 따라 활성 탭 표시 */}
        {data ? (
          <div className="no-scrollbar flex shrink-0 gap-0.5 overflow-x-auto border-b border-[#e8e8e4] bg-white px-3">
            {[
              { id: "c360-summary", label: "요약" },
              { id: "c360-activity", label: `활동${data.activity.summary.total ? ` ${data.activity.summary.total}` : ""}` },
              { id: "c360-tasks", label: `할일${data.tasks.summary.total ? ` ${data.tasks.summary.total}` : ""}` },
              { id: "c360-deal", label: `딜${data.deals.summary.total ? ` ${data.deals.summary.total}` : ""}` },
              { id: "c360-money", label: "머니" },
            ].map((tab) => {
              const active = activeSection === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => scrollToSection(tab.id)}
                  aria-current={active ? "true" : undefined}
                  aria-controls={tab.id}
                  className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-[12px] font-semibold transition-colors ${
                    active
                      ? "border-[#084734] text-[#111110]"
                      : "border-transparent text-[#1a1a1a]/45 hover:text-[#111110]"
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        ) : null}

        {/* 간단 로그 — 고객 데이터 조회 성공 여부와 분리해 패널이 열린 동안 항상 유지한다.
            스크롤 본문(body) 밖 형제라 고정되고, 고객 전환 시 key로 폼을 새로 만들어 이전 메모가 섞이지 않는다. */}
        {entityId ? (
          <section
            aria-label={`${displayName} 간단 로그`}
            data-testid="customer-quick-log"
            className="shrink-0 border-b border-[#f0f0ec] bg-white px-4 py-2.5"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#111110]">
                <StickyNote className="h-3.5 w-3.5 text-[#084734]" />
                간단 로그
              </p>
              <p className="text-[11px] text-[#1a1a1a]/35">메모·통화·문자를 바로 기록합니다.</p>
            </div>
            <ActivityQuickForm
              key={customerKey}
              variant="composer"
              lockTarget
              defaultTargetType={targetType}
              defaultTargetId={entityId}
              defaultTargetLabel={displayName}
              bodyFieldId={COMPOSER_BODY_ID}
              onSaved={() => void refetch()}
              onDirtyChange={handleComposerDirtyChange}
            />
          </section>
        ) : null}

        {savedMsg ? (
          // 2.2초 뒤 사라지는 토스트라 시각적으로 놓치면 끝이다 — 보조기술에도 결과를 알린다.
          <div role="status" aria-live="polite" className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
            <div className="flex items-center gap-1.5 rounded-full bg-[#084734] px-3.5 py-2 text-[12px] font-semibold text-white shadow-lg">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {savedMsg}
            </div>
          </div>
        ) : null}

        {/* body */}
        <div ref={bodyRef} className="flex-1 space-y-3 overflow-y-auto bg-[#f5f5f2] p-4">
          {error ? (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] font-medium text-[#B85C33]">
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

          {/* 고객 요약 — 규칙 기반 한 문장(Derived). AI/LLM 아님 — 신호 합성. */}
          {derivedSummary ? (
            <section className="rounded-2xl border border-[#D7EBDD] bg-[#ECFDF5] p-4">
              <div className="mb-1 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#084734]" />
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#084734]" title="규칙 기반 파생 — AI/LLM 아님">고객 요약</span>
              </div>
              <p className="text-[13px] leading-relaxed text-[#1d1d1b]">{derivedSummary}</p>
            </section>
          ) : null}

          {/* 라벨 — 수기 분류(시스템 파생 플래그와 별개) · '요약' 탭 앵커 */}
          <section id="c360-summary" className="scroll-mt-2 rounded-2xl border border-[#e8e8e4] bg-white p-4">
            <SectionTitle icon={<Tag className="h-3.5 w-3.5" />}>라벨</SectionTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-2.5 py-1 text-[12px] font-medium text-[#111110]"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => void handleRemoveTag(tag)}
                    disabled={tagBusy}
                    className="text-[#1a1a1a]/35 transition-colors hover:text-[#B85C33] disabled:opacity-50"
                    aria-label={`${tag} 라벨 삭제`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                aria-label="새 고객 라벨"
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void handleAddTag()
                  }
                }}
                placeholder={tags.length ? "라벨 추가" : "라벨 추가 (예: VIP·강남·재계약 대상)"}
                className="h-7 min-w-[120px] flex-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] text-[#111110] outline-none focus:border-[#084734]"
              />
              {tagInput.trim() ? (
                <button
                  type="button"
                  onClick={() => void handleAddTag()}
                  disabled={tagBusy}
                  className="inline-flex h-7 shrink-0 items-center rounded-lg bg-[#084734] px-2.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  추가
                </button>
              ) : null}
            </div>
            <p className="mt-1.5 text-[10px] text-[#1a1a1a]/35">수기 라벨 — 자동 플래그와 별개</p>
          </section>

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
                  onClick={focusComposer}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#D7EBDD] bg-white px-3 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#D7EBDD]"
                >
                  <StickyNote className="h-3.5 w-3.5" />
                  메모 남기기
                </button>
              </div>
            </section>
          ) : null}

          {loading && !data ? (
            // 콜드로드 스켈레톤 — 실제 섹션(연락처 → 머니 3타일 → 딜 → 할일) 골격과 일치.
            <>
              <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4" aria-hidden>
                <div className="h-3.5 w-24 animate-pulse rounded bg-[#f0f0ec]" />
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-[#f5f5f2]" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-[#f5f5f2]" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-[#f5f5f2]" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-[#f5f5f2]" />
                </div>
              </section>
              <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4" aria-hidden>
                <div className="h-3.5 w-28 animate-pulse rounded bg-[#f0f0ec]" />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {["¥", "¥", "대"].map((chip, index) => (
                    <div key={index} className="rounded-xl bg-[#fafaf8] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-1">
                        <div className="h-3 w-14 animate-pulse rounded bg-[#f0f0ec]" />
                        <span className="rounded-full bg-white px-1 py-0.5 text-[9px] font-bold text-[#1a1a1a]/40">
                          {chip}
                        </span>
                      </div>
                      <div className="mt-2 h-5 w-16 animate-pulse rounded bg-[#f0f0ec]" />
                    </div>
                  ))}
                </div>
              </section>
              {[0, 1].map((index) => (
                <section key={index} className="rounded-2xl border border-[#e8e8e4] bg-white p-4" aria-hidden>
                  <div className="h-3.5 w-20 animate-pulse rounded bg-[#f0f0ec]" />
                  <div className="mt-3 h-9 animate-pulse rounded-xl bg-[#fafaf8]" />
                  <div className="mt-1.5 h-9 animate-pulse rounded-xl bg-[#fafaf8]" />
                </section>
              ))}
            </>
          ) : null}

          {/* 다가오는 일정 — 기한 있는 열린 할 일 */}
          {data && upcomingTasks.length > 0 ? (
            <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <SectionTitle icon={<CalendarClock className="h-3.5 w-3.5" />}>다가오는 일정</SectionTitle>
                <ul className="space-y-1.5">
                  {upcomingTasks.map((task) => {
                    const parts = monthDayParts(task.dueAt)
                    return (
                      <li key={task.id} className="flex items-center gap-2.5">
                        <span className="flex h-9 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-[#ECFDF5] text-[#084734]">
                          <span className="text-[9px] font-semibold leading-none">{parts.month}</span>
                          <span className="text-[13px] font-bold leading-tight">{parts.day}</span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-[#111110]">{task.title}</p>
                          <p className="text-[11px] text-[#1a1a1a]/45">
                            {dueRelativeLabel(task.dueAt)}
                            {task.ownerNameSnapshot ? ` · ${task.ownerNameSnapshot}` : ""}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
            </section>
          ) : null}

          {/* contacts + risk */}
          {data ? (
            <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <SectionTitle icon={<User2 className="h-3.5 w-3.5" />}>연락처 · 리스크</SectionTitle>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">전화</p>
                  <CrmContactValue value={data.contacts?.phone} className="font-medium text-[#111110]" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">이메일</p>
                  <p className={`truncate font-medium ${data.contacts?.email ? "text-[#111110]" : "text-[#1a1a1a]/35"}`}>
                    {data.contacts?.email ?? "이메일 미확인"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">지역</p>
                  <p className="inline-flex items-center gap-1 font-semibold text-[#084734]">
                    <MapPin className="h-3.5 w-3.5" />
                    {header?.region ?? "지역 미지정"}
                  </p>
                </div>
                {data.contacts?.extra.map((field) => (
                  <div key={`${field.label}:${field.value}`} className="col-span-2">
                    <p className="text-[11px] font-semibold text-[#1a1a1a]/35">{field.label}</p>
                    <p className="font-medium text-[#111110]">{field.value}</p>
                  </div>
                ))}
              </div>
              {data.contacts?.message ? (
                <div className="mt-3 border-t border-[#f0f0ec] pt-3">
                  <p className="mb-2 text-[11px] font-semibold text-[#1a1a1a]/35">제출 메시지</p>
                  <LeadMessageCard message={data.contacts.message} />
                </div>
              ) : null}
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

          {/* activity timeline + 특이사항 피드 + quick note/회의록 */}
          {data ? (
            <section id="c360-activity" className="scroll-mt-2 rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <div role="tablist" aria-label="고객 활동 보기" className="mb-3 inline-flex rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-0.5">
                {(
                  [
                    {
                      key: "timeline",
                      // Compass 병합분까지 세야 탭 숫자와 실제로 보이는 줄 수가 어긋나지 않는다.
                      label: `타임라인${
                        data.activity.summary.total + data.compass.entries.length > 0
                          ? ` ${data.activity.summary.total + data.compass.entries.length}`
                          : ""
                      }`,
                    },
                    { key: "feed", label: `특이사항 피드${feedRows.length > 0 ? ` ${feedRows.length}` : ""}` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={activityTab === tab.key}
                    onClick={() => setActivityTab(tab.key)}
                    className={`h-7 rounded-md px-3 text-[12px] font-semibold transition-colors ${
                      activityTab === tab.key ? "bg-[#111110] text-white" : "text-[#1a1a1a]/55 hover:text-[#111110]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* 출처 필터 — 타임라인에서 메모/회의록만 빠르게 추림. 피드(위험 전용)에는 비표시. */}
              {activityTab === "timeline" ? (
                <div role="group" aria-label="고객 활동 출처 필터" className="mb-3 inline-flex flex-wrap gap-1">
                  {(
                    [
                      { key: "all", label: "전체" },
                      { key: "manual_note", label: "메모" },
                      { key: "meeting_minutes", label: "회의록" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      aria-pressed={activitySource === opt.key}
                      onClick={() => setActivitySource(opt.key)}
                      className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-semibold transition-colors ${
                        activitySource === opt.key
                          ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                          : "border-[#e8e8e4] bg-white text-[#1a1a1a]/55 hover:border-[#111110] hover:text-[#111110]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* 연결이 끊긴 것과 활동이 없는 것을 구분해 말한다 */}
              {data.compass.down ? (
                <p className="mb-2 border-l-2 border-[#B85C33] px-2.5 py-1.5 text-[12px] text-[#1a1a1a]/55">
                  Compass 연결이 끊겨 마케팅 활동을 병합하지 못했습니다.
                </p>
              ) : null}

              {mergedActivity.length === 0 ? (
                <p className="text-[12px] text-[#1a1a1a]/40">
                  {activityTab === "feed"
                    ? "특이사항(위험) 기록이 없습니다."
                    : activitySource === "manual_note"
                      ? "메모가 없습니다."
                      : activitySource === "meeting_minutes"
                        ? "회의록이 없습니다."
                        : "기록된 활동이 없습니다."}
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {mergedActivity.map((item) => {
                    if (item.kind === "compass") {
                      return <CompassTimelineRow key={item.entry.id} entry={item.entry} />
                    }
                    const event = item.event
                    // 메모·회의록은 본문이 핵심 — 클램프 없이 펼쳐 보여주고, 그 외는 요약 2줄로 압축.
                    const isMemo = event.sourceType === "manual_note" || event.sourceType === "meeting_minutes"
                    const memoText = event.body ?? event.summary
                    const author = event.ownerName ?? event.createdBy
                    return (
                      <li key={event.id} className="flex gap-2.5">
                        <span
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                            event.sentiment === "risk" ? "bg-[#FEF3EE] text-[#B85C33]" : "bg-[#fafaf8] text-[#1a1a1a]/45"
                          }`}
                        >
                          {eventSourceIcon(event.sourceType)}
                        </span>
                        <div className="min-w-0 flex-1 border-b border-[#f5f5f2] pb-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-[#1a1a1a]/45">
                              {eventSourceLabel(event.sourceType)}
                            </span>
                            <span className="text-[11px] text-[#1a1a1a]/35">{formatDate(event.occurredAt)}</span>
                            {author ? <span className="text-[11px] text-[#1a1a1a]/35">· {author}</span> : null}
                            {event.sentiment === "risk" ? (
                              <span className="rounded bg-[#FEF3EE] px-1.5 py-0.5 text-[10px] font-semibold text-[#B85C33]">위험</span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-[12px] font-semibold text-[#111110]">{event.title}</p>
                          {isMemo ? (
                            memoText ? (
                              <p className="mt-0.5 whitespace-pre-wrap text-[12px] text-[#1a1a1a]/55">{memoText}</p>
                            ) : null
                          ) : event.summary || event.body ? (
                            <p className="mt-0.5 line-clamp-2 text-[12px] text-[#1a1a1a]/55">{event.summary ?? event.body}</p>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {activityTab === "timeline" &&
              !eventsExpanded &&
              data.activity.summary.total > data.activity.rows.length ? (
                <button
                  type="button"
                  onClick={() => void loadMoreEvents()}
                  disabled={eventsLoading}
                  aria-busy={eventsLoading}
                  className="mt-2.5 inline-flex w-full items-center justify-center rounded-lg border border-[#e8e8e4] bg-white py-2 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] disabled:opacity-50"
                >
                  {eventsLoading ? "불러오는 중..." : "전체 활동 보기 (최대 50)"}
                </button>
              ) : null}
              {/* 활동 페이지 딥링크 — 이 고객으로 필터된 전체 활동(드로어 밖 상세 동선) */}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <Link
                  href={`/admin/crm/activity?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(entityId)}`}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#084734] transition-colors hover:underline"
                >
                  이 고객 활동 전체보기
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                {/* 전화가 일치한 Compass 리드가 있을 때만 — 없으면 링크를 지어내지 않는다. */}
                {data.compass.href ? (
                  <a
                    href={data.compass.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#2F5D8C] transition-colors hover:underline"
                  >
                    Compass 리드 열기
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* open tasks + quick add */}
          {data ? (
            <section id="c360-tasks" className="scroll-mt-2 rounded-2xl border border-[#e8e8e4] bg-white p-4">
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
                        aria-label={`${task.title} 할 일 완료`}
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
                      aria-label="새 할 일 제목"
                      onChange={(event) => setTaskTitle(event.target.value)}
                      placeholder="새 할 일 제목"
                      autoFocus
                      className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
                    />
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={taskType}
                        aria-label="새 할 일 유형"
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
                        aria-label="새 할 일 기한"
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
                    aria-expanded={taskFormOpen}
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
                      aria-label="새 딜 제목"
                      onChange={(event) => setDealTitle(event.target.value)}
                      placeholder="새 딜 제목"
                      autoFocus
                      className="h-9 min-w-[140px] flex-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
                    />
                    <input
                      value={dealAmount}
                      aria-label="새 딜 예상 금액"
                      onChange={(event) => setDealAmount(event.target.value)}
                      inputMode="numeric"
                      placeholder="예상금액"
                      className="h-9 w-24 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
                    />
                    <select
                      value={dealStage}
                      aria-label="새 딜 단계"
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
                    aria-expanded={dealFormOpen}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-[#dcdcd6] px-3 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:border-[#111110] hover:text-[#111110]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    딜 추가
                  </button>
                )}
              </div>
            </section>
          ) : null}

          {/* 머니 — 제품 매출(REV/HW 원장 계정키 조인) + NEO 수금·성과 상세 */}
          {data ? (
            <section id="c360-money" className="scroll-mt-2 rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <SectionTitle icon={<Coins className="h-3.5 w-3.5" />}>머니 · 제품 매출</SectionTitle>
              {/* SW 결제 누적 · HW 결제 누적(¥ CNY) · HW 대수(칠판, 대) */}
              <div className="grid grid-cols-3 gap-2">
                <ProductTile
                  label="SW 결제 누적"
                  chip="¥"
                  display={formatCNY(productSummary?.swCumulativeCNY ?? null)}
                  matched={productMatched}
                />
                <ProductTile
                  label="HW 결제 누적"
                  chip="¥"
                  display={formatCNY(productSummary?.hwCumulativeCNY ?? null)}
                  matched={productMatched}
                />
                <ProductTile
                  label="HW 대수 · 칠판"
                  chip="대"
                  display={`${(productSummary?.hwBoardCount ?? 0).toLocaleString("ko-KR")}대`}
                  matched={productMatched}
                />
              </div>
              {productMatched ? (
                <p className="mt-1.5 text-[10px] text-[#1a1a1a]/35">
                  REV 원장 결제 누적 · 칠판 대수는 HW 출고(배송예정 제외) · 계정키 조인
                </p>
              ) : (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-[#fafaf8] px-2.5 py-1.5">
                  <span className="text-[11px] text-[#1a1a1a]/45">REV/HW 원장과 매칭된 기록이 없습니다.</span>
                  <Link
                    href={`/admin/crm/matching?name=${encodeURIComponent(displayName)}`}
                    className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-[#084734] hover:underline"
                  >
                    매칭 연결
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              )}

              {/* NEO 수금·성과 상세(공식 원천, ¥ CNY) — 데이터 있을 때만 유지 */}
              {moneyVisible ? (
                <div className="mt-3 space-y-3 border-t border-[#f0f0ec] pt-3">
                  {(data.serviceRisk?.level === "urgent" || data.serviceRisk?.level === "soon") &&
                  orderTotal != null &&
                  orderTotal > 0 ? (
                    <div className="flex items-center gap-1.5 rounded-lg bg-[#FBF1E0] px-2.5 py-1.5 text-[11px] font-medium text-[#7A520F]">
                      <Sparkles className="h-3 w-3 shrink-0" />
                      갱신 예상 {formatUSD(orderTotal)} · 직전 계약 기준 추정(만료 임박)
                    </div>
                  ) : null}

                  {/* 수금 · 성과 합계 — 둘 다 CNY(¥). */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
                      <p className="text-[11px] font-semibold text-[#1a1a1a]/35">수금 합계</p>
                      <p className="text-[15px] font-bold text-[#111110]">{formatCNY(collectionTotal)}</p>
                    </div>
                    <div className="rounded-xl bg-[#ECFDF5] px-3 py-2">
                      <p className="text-[11px] font-semibold text-[#084734]/70">성과 합계</p>
                      <p className="text-[15px] font-bold text-[#084734]">{formatCNY(performanceTotal)}</p>
                    </div>
                  </div>
                  {recentPerformances.length ? (
                    <div className="space-y-1.5">
                      {recentPerformances.map((perf) => (
                        <div key={perf.id} className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="min-w-0 truncate font-medium text-[#111110]">{perf.title}</span>
                          <span className="shrink-0 text-[#1a1a1a]/45">
                            {formatCNY(perf.amount)}
                            {perf.occurredAt ? ` · ${formatDay(perf.occurredAt)}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {money?.eeoAccounts.length ? (
                    <div className="space-y-1.5 border-t border-[#f0f0ec] pt-3">
                      {money.eeoAccounts.slice(0, 4).map((eeo) => (
                        <div key={eeo.id} className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="truncate font-medium text-[#111110]">{eeo.name}</span>
                          <span className="shrink-0 text-[#1a1a1a]/45">
                            잔액 {formatCNY(eeo.balance)} · 만료 {formatDay(eeo.expireAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {/* 핵심 정보 — 참고 데이터, 기본 접힘 */}
          {data ? (
            <CollapsibleSection icon={<Sparkles className="h-3.5 w-3.5" />} title="핵심 정보">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12px]">
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">
                    고객 가치 (LTV) · 추정
                    {ltv ? (
                      <span className="ml-1 font-medium text-[#1a1a1a]/30">
                        {CRM_CURRENCY_BADGE[ltv.currency].label}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[15px] font-bold text-[#111110]">{formatCrmMoney(ltv)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">잔액 합계</p>
                  <p className="text-[15px] font-bold text-[#111110]">{formatCNY(money?.totalBalance ?? null)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">담당</p>
                  <p className="font-medium text-[#111110]">{header?.ownerName ?? "미배정"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">
                    지역
                  </p>
                  <p className="font-medium text-[#111110]">
                    {header?.region ?? "지역 미지정"}
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
              <p className="mt-2 text-[10px] text-[#1a1a1a]/35">
                LTV는 수납·오더 기준 추정값 · 수금/성과/잔액은 위안화(¥), 오더는 달러($) · 공식 원천 NEO
              </p>
            </CollapsibleSection>
          ) : null}

          {/* escape hatch — 신규 360 상세 페이지가 주 동선, 원본 화면은 보조 */}
          {header || name ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link
                href={`/admin/crm/customers/${encodeURIComponent(customerKey)}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#084734] px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                자세히 보기
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href={
                  targetType === "neo_account"
                    ? `/admin/crm/customers/accounts?account=${encodeURIComponent(entityId)}`
                    : `/admin/crm/customers/leads?lead=${encodeURIComponent(entityId)}`
                }
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1a1a1a]/40 transition-colors hover:text-[#111110]"
              >
                원본 화면 열기
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
