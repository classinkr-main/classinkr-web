"use client"

// 고객 360 드로어 본체 — 데이터 로더·mutation·닫기 게이트·파생값을 소유하고,
// 섹션 본문(연락처·활동·할일·딜·머니)과 공용 아톰은 components/admin/crm/drawer/* 로 분해했다(2026-08-28).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  MessageSquare,
  Phone,
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
  isCrmVipMoney,
  type CrmMoney,
} from "@/lib/crm/money-format"
import { pushRecentCustomer } from "@/lib/crm/recent-customers"
import { mergeCompassTimeline } from "@/lib/crm/compass-timeline"
import CrmCustomerFlags from "./CrmCustomerFlags"
import CrmContactValue from "./CrmContactValue"
import CrmCustomerPicker from "./CrmCustomerPicker"
import ActivityQuickForm from "./rail/ActivityQuickForm"
import DrawerContactsSection from "./drawer/DrawerContactsSection"
import DrawerActivitySection, {
  type C360ActivitySource,
  type C360ActivityTab,
} from "./drawer/DrawerActivitySection"
import DrawerTasksSection from "./drawer/DrawerTasksSection"
import DrawerDealsSection from "./drawer/DrawerDealsSection"
import DrawerMoneySection from "./drawer/DrawerMoneySection"
import {
  C360_SECTION_DOM_ORDER,
  COMPOSER_BODY_ID,
  CollapsibleSection,
  SectionTitle,
  dueRelativeLabel,
  formatDay,
  monthDayParts,
  sumAmounts,
} from "./drawer/shared"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"
import { deriveCustomerFlags } from "@/lib/crm/customer-flags"
import { LEAD_BADGE_TONE_CLASSES } from "@/lib/crm/lead-badges"
import { computeCustomerHealth, HEALTH_BAND_STYLE } from "@/lib/crm/customer-health"
import { buildCustomerNextActionRecommendation } from "@/lib/crm/customer-next-action"
import type { CsMotion } from "@/lib/crm/cs-motions"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import type { CrmDealStage } from "@/lib/repositories/crm-deals"
import type { CrmTaskType } from "@/lib/repositories/crm-tasks"

interface Props {
  customerKey: string | null
  name?: string | null
  onClose: () => void
  /** 컴포저 작성 중 여부 통지 — 부모의 URL 기반 닫기 경로(뒤로가기)가 같은 dirty 가드를 공유하게 한다. */
  onDirtyChange?: (dirty: boolean) => void
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
  const [activityTab, setActivityTab] = useState<C360ActivityTab>("timeline")
  const [activitySource, setActivitySource] = useState<C360ActivitySource>("all")
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
          {data ? <DrawerContactsSection data={data} /> : null}

          {/* activity timeline + 특이사항 피드 + quick note/회의록 */}
          {data ? (
            <DrawerActivitySection
              data={data}
              activityTab={activityTab}
              onActivityTabChange={setActivityTab}
              activitySource={activitySource}
              onActivitySourceChange={setActivitySource}
              feedRows={feedRows}
              mergedActivity={mergedActivity}
              eventsExpanded={eventsExpanded}
              eventsLoading={eventsLoading}
              onLoadMoreEvents={() => void loadMoreEvents()}
              targetType={targetType}
              entityId={entityId}
            />
          ) : null}

          {/* open tasks + quick add */}
          {data ? (
            <DrawerTasksSection
              data={data}
              actingId={actingId}
              taskFormOpen={taskFormOpen}
              onTaskFormOpenChange={setTaskFormOpen}
              taskTitle={taskTitle}
              onTaskTitleChange={setTaskTitle}
              taskType={taskType}
              onTaskTypeChange={setTaskType}
              taskDue={taskDue}
              onTaskDueChange={setTaskDue}
              onAddTask={() => void handleAddTask()}
              onCompleteTask={(taskId) => void handleCompleteTask(taskId)}
              onCsMotion={(motion) => void handleCsMotion(motion)}
            />
          ) : null}

          {/* deals (Deal Lite) */}
          {data ? (
            <DrawerDealsSection
              data={data}
              actingId={actingId}
              dealFormOpen={dealFormOpen}
              onDealFormOpenChange={setDealFormOpen}
              dealTitle={dealTitle}
              onDealTitleChange={setDealTitle}
              dealAmount={dealAmount}
              onDealAmountChange={setDealAmount}
              dealStage={dealStage}
              onDealStageChange={setDealStage}
              onAddDeal={() => void handleAddDeal()}
              onDealStage={(dealId, stage) => void handleDealStage(dealId, stage)}
            />
          ) : null}

          {/* 머니 — 제품 매출(REV/HW 원장 계정키 조인) + NEO 수금·성과 상세 */}
          {data ? (
            <DrawerMoneySection
              data={data}
              displayName={displayName}
              moneyVisible={moneyVisible}
              orderTotal={orderTotal}
              collectionTotal={collectionTotal}
              performanceTotal={performanceTotal}
              recentPerformances={recentPerformances}
            />
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
