"use client"

// 고객 360 드로어 본체 — 데이터 로더·mutation·닫기 게이트·파생값을 소유하고,
// 섹션 본문(연락처·활동·할일·딜·머니)과 공용 아톰은 components/admin/crm/drawer/* 로 분해했다(2026-08-28).
//
// 2026-09-15 c360 라운드:
//  - 로더는 세대 카운터(loadSeqRef)로 늦게 온 이전 고객 응답을 버린다(c360-02). 캐시 창은
//    lib/crm/client-cache SSOT, SWR 갱신은 onRevalidated로 화면에 반영한다(c360-06).
//  - 쓰기는 성공 응답 레코드로 로컬을 먼저 바꾸고(drawer/c360-local-patch) 재검증은 force 없이
//    백그라운드로 흘린다(c360-03). 실패는 하단 고정 CrmNoticeBanner + 딜 행 인라인 캡션(c360-08).
//  - 닫기 가드는 컴포저뿐 아니라 할 일/딜/라벨 입력까지 본다(c360-05).

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
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import { runOptimistic } from "@/lib/crm/optimistic-update"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import {
  CRM_CURRENCY_BADGE,
  formatCNY,
  formatCrmMoney,
  isCrmVipMoney,
  type CrmMoney,
} from "@/lib/crm/money-format"
import { pushRecentCustomer } from "@/lib/crm/recent-customers"
import { compassTimelineGroup, mergeCompassTimeline } from "@/lib/crm/compass-timeline"
import DeleteConfirmDialog from "@/components/admin/DeleteConfirmDialog"
import CrmNoticeBanner from "./CrmNoticeBanner"
import { SECONDARY_TEXT_CLASS } from "./home/shared"
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
import DrawerDealsSection, { type DealRowSaveState } from "./drawer/DrawerDealsSection"
import DrawerMoneySection from "./drawer/DrawerMoneySection"
import {
  C360_SECTION_DOM_ORDER,
  COMPOSER_BODY_ID,
  CollapsibleSection,
  SectionTitle,
  dueRelativeLabel,
  formatClock,
  formatDay,
  monthDayParts,
  sumAmounts,
} from "./drawer/shared"
import {
  TASKS_SECTION_HEADING_ID,
  applyC360Overrides,
  nextTaskIdAfterRemoval,
  patchDealRow,
  pruneC360Overrides,
  removeTaskRow,
  restoreTaskRow,
  taskCompleteButtonId,
  type C360LocalOverride,
} from "./drawer/c360-local-patch"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"
import { deriveCustomerFlags } from "@/lib/crm/customer-flags"
import { LEAD_BADGE_TONE_CLASSES } from "@/lib/crm/lead-badges"
import { computeCustomerHealth, HEALTH_BAND_STYLE } from "@/lib/crm/customer-health"
import { buildCustomerNextActionRecommendation } from "@/lib/crm/customer-next-action"
import type { CsMotion } from "@/lib/crm/cs-motions"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import type { CrmDealRecord, CrmDealStage } from "@/lib/repositories/crm-deals"
import type { CrmTaskRecord, CrmTaskType } from "@/lib/repositories/crm-tasks"

interface Props {
  customerKey: string | null
  name?: string | null
  onClose: () => void
  /** 작성 중 여부 통지 — 부모의 URL 기반 닫기 경로(뒤로가기)가 같은 dirty 가드를 공유하게 한다. */
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * 하단 고정 알림. `key`로 출처를 구분해, 새 시도가 같은 출처의 이전 실패만 걷어내게 한다.
 *  - load: 360 조회 실패(danger) · mutation: 쓰기 실패(danger) · revalidate: SWR 갱신 실패(warning, 표시 값은 유지)
 *  - task-undo: 할 일 완료 성공 + 8초 되돌리기(success, UX 규약 3 — 비가역 전이).
 */
interface DrawerNotice {
  key: "load" | "mutation" | "revalidate" | "task-undo"
  tone: "danger" | "warning" | "success"
  title: string
  message: string
  retry?: () => void
  /** 8초 되돌리기 창 안에서만 채운다 — retry와 동시에 쓰지 않는다. */
  undo?: () => void
}

/** 비가역 전이(할 일 완료) 되돌리기 창(UX 규약 3) — CrmWeekAheadPanel.WEEK_AHEAD_UNDO_WINDOW_MS와 같은 값. */
const TASK_UNDO_WINDOW_MS = 8_000

/** 저장됨 캡션이 idle로 돌아가기까지. */
const DEAL_SAVED_RESET_MS = 2_200

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * 닫기 가드가 보는 '작성 중' — 컴포저 + 열린 할 일/딜 빠른 추가 폼의 입력 + 라벨 입력(c360-05).
 * 순수 함수(테스트 고정용).
 */
export function isDrawerFormDirty(input: {
  composerDirty: boolean
  taskFormOpen: boolean
  taskTitle: string
  taskDue: string
  dealFormOpen: boolean
  dealTitle: string
  dealAmount: number | null
  tagInput: string
}): boolean {
  if (input.composerDirty) return true
  if (input.taskFormOpen && (input.taskTitle.trim().length > 0 || input.taskDue.length > 0)) return true
  if (input.dealFormOpen && (input.dealTitle.trim().length > 0 || input.dealAmount != null)) return true
  return input.tagInput.trim().length > 0
}

/**
 * 고객 요약 한 문장 — LLM 아님. 위치·단계·위험·만료·잔액 신호를 규칙으로 합성한다(Derived).
 * c360-04: NEO money.totalBalance는 선불 '충전 잔액'이다(lib/crm/service-risk.ts는 같은 값의 소진(<=0)을
 * 위험으로 본다). '미수 잔액'으로 적으면 담당자가 수금 독촉을 하게 되므로 의미를 바로 적는다.
 */
export function buildDerivedSummary(data: Customer360, targetType: "lead" | "neo_account"): string | null {
  const header = data.header
  if (!data.found || !header) return null
  const money = data.money
  const segs: string[] = []
  if (header.region) segs.push(`${header.region} 소재`)
  if (targetType === "neo_account") segs.push("고객")
  else segs.push(`${header.statusLabel ?? "리드"} 단계`)
  if (header.ownerName) segs.push(`담당 ${header.ownerName}`)
  if (data.risk?.severity === "critical") segs.push("이탈 위험 긴급")
  else if (data.risk?.severity === "high") segs.push("이탈 위험 높음")
  if (data.serviceRisk && (data.serviceRisk.level === "urgent" || data.serviceRisk.level === "soon"))
    segs.push("계약 만료 임박")
  if ((money?.totalBalance ?? 0) > 0) segs.push(`충전 잔액 ${formatCNY(money?.totalBalance ?? null)}`)
  if (header.priorityReason) segs.push(header.priorityReason)
  return segs.length > 0 ? segs.join(" · ") : null
}

/**
 * 건강도 산식 입력(c360-04). hasOutstanding은 null — 충전 잔액(긍정 신호)을 미수로 읽어 12점을 깎던 것을
 * 멈춘다(헤더 배지의 outstanding=null 처리와 정합). 같은 통화의 확정 미수 원천이 360 페이로드에 없다.
 * 소진(depleted_balance)·재충전(recharge_due) 신호의 건강도 승격은 별도 변경으로 분리한다.
 */
export function buildDrawerHealthInput(data: Customer360, daysToExpire: number | null) {
  return {
    riskSeverity: data.risk?.severity ?? null,
    serviceLevel: data.serviceRisk?.level ?? null,
    hasOutstanding: null,
    daysToExpire,
    lastContactDays: null,
  }
}

// [major, 2026-09-15 리뷰] patchDeal이 override로 저장할 patch를 좁히는 순수 로직. pickConfirmed가
// 없으면 optimistic만 쓰고(딜 금액 변경 등 서버가 되돌려줄 파생 필드가 없는 경우), 있으면 그 필드만
// optimistic 위에 병합한다 — 서버 응답 레코드 전체(담당자·제목 등, 다른 경로로 바뀔 수 있는 필드)를
// 그대로 override에 담으면 배경 재검증(C360_OVERRIDE_MS 창)이 그 필드들을 계속 되돌려 버린다.
export function resolveDealPatch(
  optimistic: Partial<CrmDealRecord>,
  confirmedDeal: CrmDealRecord | undefined,
  pickConfirmed?: (deal: CrmDealRecord) => Partial<CrmDealRecord>
): Partial<CrmDealRecord> {
  if (!confirmedDeal) return optimistic
  return { ...optimistic, ...(pickConfirmed?.(confirmedDeal) ?? {}) }
}

export default function Customer360Drawer({ customerKey, name, onClose, onDirtyChange }: Props) {
  const [data, setData] = useState<Customer360 | null>(null)
  const [loading, setLoading] = useState(false)
  // 백그라운드 재검증(쓰기 뒤 재조회·SWR 갱신) 진행 중 — 스켈레톤·새로고침 비활성과 분리해 캡션에만 쓴다.
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<DrawerNotice | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [taskTitle, setTaskTitle] = useState("")
  const [taskType, setTaskType] = useState<CrmTaskType>("call")
  const [taskDue, setTaskDue] = useState("")
  const [dealTitle, setDealTitle] = useState("")
  const [dealStage, setDealStage] = useState<CrmDealStage>("consult")
  const [dealAmount, setDealAmount] = useState<number | null>(null)
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
  // 고정 컴포저 작성 중 여부 — ActivityQuickForm onDirtyChange가 플립 시점에만 통지.
  const [composerDirty, setComposerDirty] = useState(false)
  // 닫기 확인(작성 중 입력이 있을 때) — window.confirm 대신 공용 다이얼로그.
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  // 딜 행 인라인 저장 상태(단계·금액).
  const [dealSave, setDealSave] = useState<Record<string, DealRowSaveState>>({})
  // 할 일 완료 되돌리기(UX 규약 3) 진행 중 — 버튼 연타 방지.
  const [taskUndoPending, setTaskUndoPending] = useState(false)
  // 'NEO 등록됨' 수동 연결 패널 — 홈페이지 유입(site) 리드 전용.
  const [neoLinkOpen, setNeoLinkOpen] = useState(false)
  const [neoLinkBusy, setNeoLinkBusy] = useState(false)
  const [neoLinkError, setNeoLinkError] = useState<string | null>(null)
  const [neoPickerLabel, setNeoPickerLabel] = useState("")
  const [neoPickerId, setNeoPickerId] = useState("")
  const router = useRouter()
  const bodyRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  // 요청 세대 — load()/loadMoreEvents() 진입마다 올리고, 응답 뒤 세대가 바뀌었으면 결과를 버린다(c360-02).
  const loadSeqRef = useRef(0)
  // 방금 반영한 로컬 변경(C360_OVERRIDE_MS 창) — 재검증 응답 위에 덧씌운다. 명시 새로고침이 비운다.
  const overridesRef = useRef<C360LocalOverride[]>([])
  // 낙관 갱신 스냅샷용 최신 data — 핸들러 클로저가 낡은 data를 잡지 않게.
  const dataRef = useRef<Customer360 | null>(null)
  useEffect(() => {
    dataRef.current = data
  }, [data])
  const dealSavedTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // [blocker] 최신 customerKey — mutation 핸들러 클로저가 await 이후에도 여전히 '지금 화면에 떠 있는
  // 고객'을 향해 쓰는지 확인한다. loadSeqRef는 mutation 성공 뒤 revalidate()도 올려, 같은 고객에
  // 대한 동시 mutation끼리도 서로를 오탐(false-positive)으로 버리게 되므로 여기서는 쓰지 않고
  // customerKey identity로만 세대를 가른다 — 고객 전환에만 반응하고 배경 재검증에는 반응하지 않는다.
  const customerKeyRef = useRef(customerKey)
  useEffect(() => {
    customerKeyRef.current = customerKey
  })
  const isSameCustomer = useCallback((key: string | null) => customerKeyRef.current === key, [])
  // 할 일 완료 되돌리기(UX 규약 3) 배너의 8초 타이머 — showTaskUndoNotice 참조.
  const taskUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // dirty 통지는 ref 경유 — 부모가 인라인 함수를 넘겨도 콜백 재생성/재구독 루프가 없게.
  const onDirtyChangeRef = useRef(onDirtyChange)
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange
  })
  const handleComposerDirtyChange = useCallback((dirty: boolean) => {
    setComposerDirty(dirty)
  }, [])

  // c360-05 — 닫기 가드는 컴포저·할 일/딜 빠른 추가 폼·라벨 입력을 모두 본다. 부모(뒤로가기 가드)에도 같은 값을 통지.
  const anyDirty = isDrawerFormDirty({
    composerDirty,
    taskFormOpen,
    taskTitle,
    taskDue,
    dealFormOpen,
    dealTitle,
    dealAmount,
    tagInput,
  })
  useEffect(() => {
    onDirtyChangeRef.current?.(anyDirty)
  }, [anyDirty])

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

  // 닫기 게이트 — 작성 중인 입력이 있으면 '계속 작성 / 버리고 닫기'를 묻는다.
  // 배경 클릭·ESC·스와이프·닫기 버튼 등 모든 닫기 경로가 이 게이트를 지난다.
  const requestClose = useCallback(() => {
    if (anyDirty) {
      setCloseConfirmOpen(true)
      return
    }
    onClose()
  }, [anyDirty, onClose])

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

  // 재시도 클로저가 최신 load를 잡도록 ref 경유(useCallback 자기 참조 회피).
  const loadRef = useRef<(options?: { force?: boolean; expanded?: boolean; background?: boolean }) => Promise<void>>(
    async () => undefined
  )

  const load = useCallback(
    async (options?: { force?: boolean; expanded?: boolean; background?: boolean }) => {
      if (!url) return
      // 세대 가드 — 이 호출보다 나중에 시작된 load/loadMoreEvents가 있으면 이 응답은 버린다.
      const seq = ++loadSeqRef.current
      const isLive = () => seq === loadSeqRef.current
      if (options?.background) setSyncing(true)
      else {
        setLoading(true)
        // mutation 실패 배너·완료 되돌리기 배너(task-undo)는 명시 새로고침으로도 조건 없이 걷지 않는다.
        setNotice((prev) => (prev && prev.key !== "mutation" && prev.key !== "task-undo" ? null : prev))
      }
      // expanded일 때는 '전체 활동 보기'로 펼친 50건을 유지하도록 같은 URL/캐시키로 재조회한다.
      const base = options?.expanded ? `${url}?eventsLimit=50` : url
      const cacheKey = options?.expanded ? `${url}:all` : url
      const fetchUrl = options?.force ? `${base}${base.includes("?") ? "&" : "?"}_=${Date.now()}` : base
      try {
        const next = await adminFetchJsonCached<Customer360>(fetchUrl, undefined, {
          cacheKey,
          ttlMs: CRM_CACHE_TTL_MS,
          staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
          force: options?.force,
          // SWR 고속 경로로 낡은 캐시를 먼저 그린 회차 — 백그라운드 갱신 결과를 화면에 반영한다(c360-06).
          onRevalidated: ({ data: fresh, error }) => {
            if (!isLive()) return
            if (fresh) {
              setData(applyC360Overrides(fresh, overridesRef.current, Date.now()))
              setNotice((prev) => (prev?.key === "revalidate" ? null : prev))
              return
            }
            if (error !== undefined) {
              // [major] 방금 뜬 mutation 실패 배너(재시도 액션 포함)를 이 배경 갱신 지연 경고가
              // 덮어쓰지 않는다 — 313행의 foreground 가드와 같은 보호.
              setNotice((prev) =>
                prev?.key === "mutation" || prev?.key === "task-undo"
                  ? prev
                  : {
                      key: "revalidate",
                      tone: "warning",
                      title: "최신 정보를 받지 못했습니다",
                      message: `${toErrorMessage(error, "네트워크 오류")} · 표시 중인 값은 마지막 조회 시각 기준입니다.`,
                      retry: () => void loadRef.current({ expanded: options?.expanded, background: true }),
                    }
              )
            }
          },
        })
        if (!isLive()) return
        setData(applyC360Overrides(next, overridesRef.current, Date.now()))
      } catch (err) {
        if (!isLive()) return
        // [major] adminFetchJsonCachedInternal은 캐시가 비어 있으면(clearAdminRequestCache 직후인
        // revalidate() 재조회가 그렇다) stale-serve 경로(onRevalidated)를 타지 않고 곧장 이 catch로
        // 온다. background(=revalidate() 경유)면 방금 성공한 mutation을 실패로 오인하게 만드는
        // 무거운 danger '고객 정보를 불러오지 못했습니다' 대신, load()의 onRevalidated 실패와 같은
        // 톤(warning/revalidate)으로 낮춘다. 두 분기 모두 mutation·task-undo 배너는 덮어쓰지 않는다.
        setNotice((prev) => {
          if (prev?.key === "mutation" || prev?.key === "task-undo") return prev
          if (options?.background) {
            return {
              key: "revalidate",
              tone: "warning",
              title: "최신 정보를 받지 못했습니다",
              message: `${toErrorMessage(err, "네트워크 오류")} · 표시 중인 값은 마지막 조회 시각 기준입니다.`,
              retry: () => void loadRef.current(options),
            }
          }
          return {
            key: "load",
            tone: "danger",
            title: "고객 정보를 불러오지 못했습니다",
            message: toErrorMessage(err, "네트워크 오류"),
            retry: () => void loadRef.current(options),
          }
        })
      } finally {
        if (isLive()) {
          setLoading(false)
          setSyncing(false)
        }
      }
    },
    [url]
  )
  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    // 고객이 바뀌면 이전 고객의 데이터/폼 입력이 새 드로어에 잔존하지 않게 초기화한다.
    // 세대를 올려 이전 고객의 inflight 응답이 새 고객 화면·쓰기 대상을 덮어쓰지 못하게 한다(c360-02).
    loadSeqRef.current += 1
    overridesRef.current = []
    setData(null)
    setNotice(null)
    setLoading(false)
    setSyncing(false)
    setDealSave({})
    setCloseConfirmOpen(false)
    setTaskTitle("")
    setTaskType("call")
    setTaskDue("")
    setDealTitle("")
    setDealStage("consult")
    setDealAmount(null)
    setActivityTab("timeline")
    setActivitySource("all")
    setEventsExpanded(false)
    setDealFormOpen(false)
    setTaskFormOpen(false)
    // 고객 전환 시 컴포저는 새 대상으로 리마운트되므로 dirty 가드도 초기화(anyDirty 효과가 부모에 통지).
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

  // 언마운트 시 '저장됨' 캡션 타이머 정리.
  useEffect(() => {
    const timers = dealSavedTimersRef.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  // 언마운트 시 할 일 완료 되돌리기 타이머 정리.
  useEffect(
    () => () => {
      if (taskUndoTimerRef.current) clearTimeout(taskUndoTimerRef.current)
    },
    []
  )

  // Escape 닫기 + Tab 포커스 트랩 + 이전 포커스 복귀를 공용 훅에 위임한다.
  // 직접 만든 ESC 리스너에는 트랩이 없어, aria-modal="true"를 선언해 놓고도 Tab이 백드롭 뒤
  // 배경 페이지 컨트롤로 새어 나갔다. 훅은 focusRef의 role="dialog" 조상을 트랩 범위로 잡는다.
  // 닫기 확인 다이얼로그(포털)가 열린 동안은 트랩·ESC를 내려놓는다 — 두 다이얼로그가 포커스를 뺏고 되뺏지 않게.
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(closeConfirmOpen ? null : customerKey, requestClose, closeButtonRef)

  // [minor] 닫기 확인을 '계속 작성'으로 취소하면 위 훅의 openKey가 null→customerKey로 되돌아가며
  // 두 번째 effect(포커스 이동)가 다시 실행돼 focusRef(닫기 X 버튼)로 포커스를 강제 이동시킨다.
  // use-dialog-focus.ts는 다른 다이얼로그 다수가 함께 쓰는 공용 훅이라 시그니처를 바꾸지 않고,
  // 이 컴포넌트 안에서 확인 다이얼로그가 열리기 직전의 포커스를 잡아 뒀다가 취소 시 되돌린다.
  // 이 effect는 useDialogFocus 호출 다음에 선언돼 있어(같은 컴포넌트의 훅은 선언 순서대로 effect가
  // 실행된다) 훅의 강제 포커스 이동 뒤에 실행되어 그 결과를 덮어쓴다. Radix Dialog 자체의 비동기
  // onCloseAutoFocus와의 경쟁까지는 여기서 보장하지 못한다(리뷰 확신도 중간 — 실기기 확인 필요).
  const preConfirmFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (closeConfirmOpen) {
      preConfirmFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      return
    }
    const target = preConfirmFocusRef.current
    preConfirmFocusRef.current = null
    if (target && document.contains(target)) target.focus()
  }, [closeConfirmOpen])

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

  // 쓰기 뒤 재검증 — 이 고객의 360 캐시만 비우고(감사#1: 전역 아님) force 없이 백그라운드로 다시 받는다.
  // clearAdminRequestCache가 같은 prefix의 브라우저 HTTP 캐시 우회(60초)도 걸어 주므로 force는 불필요하다.
  // 화면은 이미 로컬 patch로 바뀌어 있고, 응답은 overridesRef 창 안의 로컬 변경 위에 덧씌워진다.
  const revalidate = useCallback(() => {
    if (!url) return
    clearAdminRequestCache(url)
    void load({ expanded: eventsExpanded, background: true })
  }, [url, load, eventsExpanded])

  // 명시 새로고침(헤더 버튼) — 유일한 force 재조회. 로컬 덧씌우기도 버리고 서버 값을 그대로 믿는다.
  const refetch = useCallback(async () => {
    if (url) clearAdminRequestCache(url)
    overridesRef.current = []
    await load({ force: true, expanded: eventsExpanded })
  }, [load, url, eventsExpanded])

  // 로컬 patch 한 건을 화면과 덧씌우기 목록에 동시에 반영한다.
  // [blocker] forKey — 이 patch를 만든 mutation이 시작된 customerKey. 호출 시점에 이미 다른
  // 고객으로 전환돼 있으면(await 도중 전환) overridesRef에도 쌓지 않고 setData도 건너뛴다 —
  // 그러지 않으면 이 override가 120초(C360_OVERRIDE_MS) 동안 새 고객 화면 위에 남아 배경
  // 재검증마다 이전 고객의 레코드를 계속 재덧씌운다.
  const applyLocal = useCallback((item: C360LocalOverride, forKey: string | null) => {
    if (!isSameCustomer(forKey)) return
    overridesRef.current = [...pruneC360Overrides(overridesRef.current, Date.now()), item]
    setData((prev) => (prev ? applyC360Overrides(prev, [item], Date.now()) : prev))
  }, [isSameCustomer])

  const failMutation = useCallback((title: string, error: unknown, retry?: () => void, note?: string) => {
    const cause = toErrorMessage(error, "네트워크 오류")
    setNotice({ key: "mutation", tone: "danger", title, message: note ? `${cause} · ${note}` : cause, retry })
  }, [])
  const clearMutationNotice = useCallback(() => {
    setNotice((prev) => (prev?.key === "mutation" ? null : prev))
  }, [])

  const setDealSaveState = useCallback((dealId: string, next: DealRowSaveState) => {
    setDealSave((prev) => ({ ...prev, [dealId]: next }))
  }, [])
  const markDealSaved = useCallback(
    (dealId: string) => {
      setDealSaveState(dealId, { state: "saved" })
      const timers = dealSavedTimersRef.current
      const existing = timers.get(dealId)
      if (existing) clearTimeout(existing)
      timers.set(
        dealId,
        setTimeout(() => {
          timers.delete(dealId)
          setDealSave((prev) => (prev[dealId]?.state === "saved" ? { ...prev, [dealId]: { state: "idle" } } : prev))
        }, DEAL_SAVED_RESET_MS)
      )
    },
    [setDealSaveState]
  )

  // NEO 등록 액션·발송허브 딥링크용 파생값 — 등록 액션은 홈페이지 유입(site) 리드에만 노출.
  const contactPhone = data?.contacts?.phone ?? null
  const isSiteLead = Boolean(data?.found) && targetType === "lead" && data?.origin === "site"
  const crmRegistered = data?.crmRegistered ?? false

  // 리드 → NEO 계정 수동 등록 확정. 성공 응답 즉시 pill('정식 리드')로 바꾸고 360은 백그라운드 재검증.
  const submitNeoLink = useCallback(
    async (pick: { targetId: string; targetLabel: string }) => {
      if (targetType !== "lead" || !entityId) return
      // [blocker와 같은 근본 원인] await 도중 다른 고객으로 전환되면 이 setData가 새 고객의 crmRegistered를
      // 잘못 뒤집을 수 있다 — 나머지 mutation 경로와 같은 방식으로 시작 시점 customerKey를 캡처해 지킨다.
      const mutationKey = customerKey
      setNeoLinkBusy(true)
      setNeoLinkError(null)
      try {
        await adminFetchJson("/api/admin/crm/leads/neo-link", {
          method: "POST",
          body: JSON.stringify({ leadId: entityId, neoAccountId: pick.targetId, name: pick.targetLabel }),
        })
        if (!isSameCustomer(mutationKey)) return
        setData((prev) => (prev ? { ...prev, crmRegistered: true, neoAccountId: pick.targetId } : prev))
        setSavedMsg("정식 리드로 전환되었습니다")
        setNeoLinkOpen(false)
        setNeoPickerLabel("")
        setNeoPickerId("")
        revalidate()
      } catch (err) {
        if (!isSameCustomer(mutationKey)) return
        // 실패 시 피커 선택을 되돌린다 — '연결됨' 표시가 에러 문구와 모순되지 않게.
        setNeoPickerLabel("")
        setNeoPickerId("")
        // 409(이미 다른 타깃으로 확정)는 API가 원인 메시지를 담아 돌려준다 — 그대로 노출.
        setNeoLinkError(err instanceof Error ? err.message : "NEO 등록 연결에 실패했습니다.")
      } finally {
        // busy 플래그는 화면 공용 상태라 고객이 바뀌었어도 항상 걷는다(actingId와 같은 원칙).
        setNeoLinkBusy(false)
      }
    },
    [targetType, entityId, revalidate, customerKey, isSameCustomer]
  )

  // 컴포저로 포커스 — 구 인라인 메모 폼을 대체한 CTA(헤더 '활동 기록'·추천 '메모 남기기').
  // 컴포저는 스크롤 본문 밖에 고정돼 있어, 본문 스크롤만 최상단으로 되돌리고 입력에 포커스를 준다.
  const focusComposer = useCallback(() => {
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    document.getElementById(COMPOSER_BODY_ID)?.focus()
  }, [])

  // ---- 쓰기(mutation) — 성공 응답 레코드로 로컬을 먼저 바꾸고 재검증은 백그라운드(c360-03).
  // 재시도 클로저가 자기 자신을 참조하므로 useCallback 대신 일반 함수로 둔다(자식에는 이미 인라인 래퍼로 넘긴다).

  // forKey — 호출한 핸들러가 시작 시점에 캡처한 customerKey. applyLocal에 그대로 넘겨 세대를 확인한다.
  async function createTaskLocally(body: Record<string, unknown>, forKey: string | null): Promise<CrmTaskRecord | null> {
    const result = await adminFetchJson<{ task?: CrmTaskRecord }>("/api/admin/crm/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    })
    const task = result?.task ?? null
    if (task) applyLocal({ kind: "task_added", id: task.id, at: Date.now(), record: task }, forKey)
    return task
  }

  async function handleAddTask() {
    const title = taskTitle.trim()
    if (!title || !customerKey) return
    const mutationKey = customerKey
    setActingId("task")
    clearMutationNotice()
    try {
      await createTaskLocally(
        {
          title,
          taskType,
          targetType,
          targetId: entityId,
          targetLabel: displayName,
          dueAt: taskDue ? new Date(taskDue).toISOString() : undefined,
          assignToMe: true,
        },
        mutationKey
      )
      // [blocker] await 도중 다른 고객으로 전환됐으면 폼 리셋·토스트·재검증 모두 이 화면(새 고객)의
      // 몫이 아니다 — revalidate()도 이 핸들러 클로저에 묶인 옛 url을 다시 살려 화면을 덮어쓸 수 있다.
      if (!isSameCustomer(mutationKey)) return
      setTaskTitle("")
      setTaskDue("")
      setTaskFormOpen(false)
      setSavedMsg("할 일을 추가했어요")
      revalidate()
    } catch (err) {
      if (!isSameCustomer(mutationKey)) return
      failMutation("할 일을 저장하지 못했습니다", err, () => void handleAddTask(), "입력은 그대로 남아 있습니다.")
    } finally {
      setActingId(null)
    }
  }

  async function handleCsMotion(motion: CsMotion) {
    if (!customerKey) return
    const mutationKey = customerKey
    setActingId(`cs:${motion.key}`)
    clearMutationNotice()
    try {
      await createTaskLocally(
        {
          title: motion.title,
          taskType: motion.taskType,
          targetType,
          targetId: entityId,
          targetLabel: displayName,
          assignToMe: true,
        },
        mutationKey
      )
      if (!isSameCustomer(mutationKey)) return
      setSavedMsg("CS 할 일을 만들었어요")
      revalidate()
    } catch (err) {
      if (!isSameCustomer(mutationKey)) return
      failMutation("CS 할 일을 만들지 못했습니다", err, () => void handleCsMotion(motion))
    } finally {
      setActingId(null)
    }
  }

  // 완료 되돌리기 — reopen PATCH 뒤 override를 걷고 서버가 돌려준(또는 스냅샷) 행으로 복원한다.
  // [blocker] mutationKey — 이 완료가 시작된 고객. await 이후 다른 고객으로 전환됐으면 되돌린
  // 행을 그 화면에 얹지 않는다(서버 쪽 reopen 자체는 그대로 반영된다 — 다음 조회 때 보인다).
  async function undoCompleteTask(
    taskId: string,
    fallback: CrmTaskRecord | null,
    index: number,
    mutationKey: string | null
  ) {
    setTaskUndoPending(true)
    try {
      const result = await adminFetchJson<{ task?: CrmTaskRecord }>(
        `/api/admin/crm/tasks/${encodeURIComponent(taskId)}`,
        { method: "PATCH", body: JSON.stringify({ action: "reopen" }) }
      )
      setTaskUndoPending(false)
      overridesRef.current = overridesRef.current.filter((item) => !(item.kind === "task_removed" && item.id === taskId))
      if (!isSameCustomer(mutationKey)) return
      const reopened = result?.task ?? fallback
      if (reopened) setData((prev) => (prev ? restoreTaskRow(prev, reopened, index) : prev))
      setNotice((prev) => (prev?.key === "task-undo" ? null : prev))
      setSavedMsg("완료를 되돌렸어요")
      revalidate()
    } catch (err) {
      setTaskUndoPending(false)
      if (!isSameCustomer(mutationKey)) return
      failMutation("완료를 되돌리지 못했습니다", err, () => void undoCompleteTask(taskId, fallback, index, mutationKey))
    }
  }

  // 성공 배너 + 8초 되돌리기(UX 규약 3 — 비가역 전이). CrmWeekAheadPanel.undoTaskAction과 같은 패턴:
  // 창이 지나면 되돌리기 버튼만 거두고 문구는 다음 알림이 대체하거나 닫을 때까지 남긴다.
  function showTaskUndoNotice(taskId: string, record: CrmTaskRecord | null, index: number, mutationKey: string | null) {
    if (!record) {
      setSavedMsg("할 일을 완료했어요")
      return
    }
    if (taskUndoTimerRef.current) clearTimeout(taskUndoTimerRef.current)
    const next: DrawerNotice = {
      key: "task-undo",
      tone: "success",
      title: "할 일을 완료했어요",
      message: `'${record.title}' — 8초 안에 되돌릴 수 있습니다.`,
      undo: () => void undoCompleteTask(taskId, record, index, mutationKey),
    }
    setNotice(next)
    taskUndoTimerRef.current = setTimeout(() => {
      setNotice((current) => (current === next ? { ...current, undo: undefined } : current))
    }, TASK_UNDO_WINDOW_MS)
  }

  // 완료 — 행을 먼저 지우고(낙관) 포커스를 다음 행 첫 액션 또는 섹션 heading으로 옮긴다. 실패하면 제자리에 되돌린다.
  async function handleCompleteTask(taskId: string) {
    // [blocker] await 이후 rollback·성공 후속(override·되돌리기 배너·revalidate)이 다른 고객으로
    // 전환된 화면에 적용되지 않도록 시작 시점의 customerKey를 캡처해 끝까지 들고 다닌다.
    const mutationKey = customerKey
    const current = dataRef.current
    const index = current ? current.tasks.rows.findIndex((row) => row.id === taskId) : -1
    const record = current && index >= 0 ? current.tasks.rows[index] : null
    const focusNextId = current ? nextTaskIdAfterRemoval(current.tasks.rows, taskId) : null
    setActingId(`task:${taskId}`)
    clearMutationNotice()
    const result = await runOptimistic<{ record: CrmTaskRecord | null; index: number }>({
      snapshot: () => ({ record, index }),
      apply: () => {
        setData((prev) => (prev ? removeTaskRow(prev, taskId) : prev))
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            document.getElementById(focusNextId ? taskCompleteButtonId(focusNextId) : TASKS_SECTION_HEADING_ID)?.focus()
          })
        }
      },
      commit: () =>
        adminFetchJson(`/api/admin/crm/tasks/${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "complete", outcome: "고객 360에서 완료" }),
        }),
      rollback: (saved) => {
        if (!isSameCustomer(mutationKey) || !saved.record) return
        const restored = saved.record
        setData((prev) => (prev ? restoreTaskRow(prev, restored, saved.index) : prev))
      },
      onError: (err) => {
        if (!isSameCustomer(mutationKey)) return
        failMutation("할 일을 완료하지 못했습니다", err, () => void handleCompleteTask(taskId), "목록에 되돌려 놓았습니다.")
      },
    })
    setActingId(null)
    if (result.ok) {
      if (!isSameCustomer(mutationKey)) return
      overridesRef.current = [...pruneC360Overrides(overridesRef.current, Date.now()), { kind: "task_removed", id: taskId, at: Date.now() }]
      showTaskUndoNotice(taskId, record, index, mutationKey)
      revalidate()
    }
  }

  async function handleAddDeal() {
    const title = dealTitle.trim()
    if (!title || !customerKey) return
    const mutationKey = customerKey
    setActingId("deal")
    clearMutationNotice()
    try {
      const result = await adminFetchJson<{ deal?: CrmDealRecord }>("/api/admin/crm/deals-lite", {
        method: "POST",
        body: JSON.stringify({
          title,
          stage: dealStage,
          targetType,
          targetId: entityId,
          targetLabel: displayName,
          expectedAmount: dealAmount ?? undefined,
          assignToMe: true,
        }),
      })
      const deal = result?.deal ?? null
      if (deal) applyLocal({ kind: "deal_added", id: deal.id, at: Date.now(), record: deal }, mutationKey)
      // [blocker] await 도중 다른 고객으로 전환됐으면 폼 리셋·토스트·revalidate() 모두 건너뛴다 —
      // revalidate()도 이 클로저에 묶인 옛 url을 되살려 화면 전체를 옛 고객 데이터로 덮어쓸 수 있다.
      if (!isSameCustomer(mutationKey)) return
      setDealTitle("")
      setDealAmount(null)
      setDealStage("consult")
      setDealFormOpen(false)
      setSavedMsg("딜을 추가했어요")
      revalidate()
    } catch (err) {
      if (!isSameCustomer(mutationKey)) return
      failMutation("딜을 저장하지 못했습니다", err, () => void handleAddDeal(), "입력은 그대로 남아 있습니다.")
    } finally {
      setActingId(null)
    }
  }

  // 딜 행 patch(단계·금액) 공통 — 낙관 반영 → PATCH → 응답 레코드로 확정, 실패 시 이전 행으로 복원 + 인라인 실패 캡션.
  // pickConfirmed — [major] 서버 응답 레코드 전체를 override로 저장하면(예전 코드) 120초 창 동안 이
  // 딜의 다른 필드(담당자·제목 등, 다른 경로로 바뀌었을 수 있는)를 배경 재검증이 계속 되돌려 버린다.
  // 이 액션이 실제로 파생시키는 필드만 호출부가 좁게 골라 optimistic 위에 병합한다.
  async function patchDeal(
    dealId: string,
    body: Record<string, unknown>,
    optimistic: Partial<CrmDealRecord>,
    failTitle: string,
    retry: () => void,
    pickConfirmed?: (deal: CrmDealRecord) => Partial<CrmDealRecord>
  ) {
    const mutationKey = customerKey
    const previous = dataRef.current?.deals.rows.find((row) => row.id === dealId) ?? null
    if (!previous) return
    setActingId(`deal:${dealId}`)
    clearMutationNotice()
    setDealSaveState(dealId, { state: "saving" })
    const result = await runOptimistic<CrmDealRecord>({
      snapshot: () => previous,
      apply: () => setData((prev) => (prev ? patchDealRow(prev, dealId, optimistic) : prev)),
      commit: async () => {
        const response = await adminFetchJson<{ deal?: CrmDealRecord }>(
          `/api/admin/crm/deals-lite/${encodeURIComponent(dealId)}`,
          { method: "PATCH", body: JSON.stringify(body) }
        )
        const patch = resolveDealPatch(optimistic, response?.deal, pickConfirmed)
        applyLocal({ kind: "deal_patched", id: dealId, at: Date.now(), patch }, mutationKey)
      },
      rollback: (saved) => {
        if (!isSameCustomer(mutationKey)) return
        setData((prev) => (prev ? patchDealRow(prev, dealId, saved) : prev))
      },
      onError: (err) => {
        if (!isSameCustomer(mutationKey)) return
        setDealSaveState(dealId, { state: "failed", onRetry: retry })
        failMutation(failTitle, err, retry, "이전 값으로 되돌려 놓았습니다.")
      },
    })
    setActingId(null)
    if (result.ok) {
      if (!isSameCustomer(mutationKey)) return
      markDealSaved(dealId)
      revalidate()
    }
  }

  async function handleDealStage(dealId: string, stage: CrmDealStage) {
    await patchDeal(
      dealId,
      { action: "stage", stage },
      { stage },
      "딜 단계를 변경하지 못했습니다",
      () => void handleDealStage(dealId, stage),
      // setCrmDealStage(app/api/.../deals-lite/[id]/route.ts)는 stage로부터 status·closedAt·closedBy를
      // 서버에서 파생한다 — optimistic({stage})이 예측 못하는 이 세 필드만 응답에서 좁게 가져온다.
      (deal) => ({ status: deal.status, closedAt: deal.closedAt, closedBy: deal.closedBy })
    )
  }

  // 감사 2026-09-07 §2 — 생성된 딜의 예상금액을 어떤 화면에서도 못 고치던 결함 수리.
  // 서버는 이미 지원한다(app/api/admin/crm/deals-lite/[id]/route.ts의 action:"update").
  // 단계 변경과 같은 actingId(`deal:${dealId}`)를 공유해 같은 딜의 동시 편집을 자연히 직렬화한다.
  async function handleDealAmountChange(dealId: string, amount: number | null) {
    await patchDeal(
      dealId,
      { action: "update", expectedAmount: amount },
      { expectedAmount: amount },
      "딜 예상금액을 변경하지 못했습니다",
      () => void handleDealAmountChange(dealId, amount)
    )
  }

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
    // 메모 = Compass note·memo(고객관리 메모), 회의록 = meeting — lib/crm/compass-timeline.ts 묶음.
    if (activitySource === "manual_note") return entries.filter((entry) => compassTimelineGroup(entry.kind) === "memo")
    if (activitySource === "meeting_minutes") return entries.filter((entry) => compassTimelineGroup(entry.kind) === "meeting")
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

  // 고객 요약 — LLM 아님. 규칙 합성(buildDerivedSummary, c360-04 참조).
  const derivedSummary = useMemo(() => (data ? buildDerivedSummary(data, targetType) : null), [data, targetType])

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
    return computeCustomerHealth(buildDrawerHealthInput(data, daysToExpire))
  }, [data, daysToExpire])

  async function handleRunRecommendation() {
    if (!recommendation || !customerKey) return
    const mutationKey = customerKey
    setActingId("rec")
    clearMutationNotice()
    try {
      await createTaskLocally(
        {
          title: recommendation.title,
          taskType: recommendation.taskType,
          targetType,
          targetId: entityId,
          targetLabel: displayName,
          assignToMe: true,
        },
        mutationKey
      )
      if (!isSameCustomer(mutationKey)) return
      setSavedMsg("추천 할 일을 만들었어요")
      revalidate()
    } catch (err) {
      if (!isSameCustomer(mutationKey)) return
      failMutation("추천 할 일을 만들지 못했습니다", err, () => void handleRunRecommendation())
    } finally {
      setActingId(null)
    }
  }

  const loadMoreEvents = useCallback(async () => {
    if (!url) return
    // 성공한 뒤에만 펼침으로 표시한다. 요청 전에 켜 두면 실패했을 때 목록은 그대로인데
    // "전체 활동 보기" 버튼(!eventsExpanded 조건)만 사라져, 잘린 목록에 재시도 수단 없이 갇힌다.
    // 세대 가드(c360-02): 이 사이 고객이 바뀌거나 새 load가 시작되면 이 응답은 버린다.
    const seq = ++loadSeqRef.current
    const isLive = () => seq === loadSeqRef.current
    setEventsLoading(true)
    setNotice((prev) => (prev?.key === "load" ? null : prev))
    try {
      const next = await adminFetchJsonCached<Customer360>(`${url}?eventsLimit=50`, undefined, {
        cacheKey: `${url}:all`,
        ttlMs: CRM_CACHE_TTL_MS,
        staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
        onRevalidated: ({ data: fresh }) => {
          if (!isLive() || !fresh) return
          setData(applyC360Overrides(fresh, overridesRef.current, Date.now()))
        },
      })
      if (!isLive()) return
      setData(applyC360Overrides(next, overridesRef.current, Date.now()))
      setEventsExpanded(true)
    } catch (err) {
      if (!isLive()) return
      setNotice({
        key: "load",
        tone: "danger",
        title: "전체 활동을 불러오지 못했습니다",
        message: toErrorMessage(err, "네트워크 오류"),
        retry: () => void loadMoreEventsRef.current(),
      })
    } finally {
      if (isLive()) setEventsLoading(false)
    }
  }, [url])
  const loadMoreEventsRef = useRef(loadMoreEvents)
  useEffect(() => {
    loadMoreEventsRef.current = loadMoreEvents
  }, [loadMoreEvents])

  async function handleAddTag() {
    const clean = tagInput.trim()
    // url은 customerKey와 함께 나오는 파생값이라 !customerKey 만으로는 TS가 string으로 좁혀
    // 주지 않는다 — !url도 같이 걸어 아래에서 non-null 단언 없이 clearAdminRequestCache(url)을 쓴다.
    if (!clean || !customerKey || !url) return
    const mutationKey = customerKey
    setTagBusy(true)
    clearMutationNotice()
    try {
      const result = await adminFetchJson<{ tags: string[] }>(
        `/api/admin/crm/customers/${encodeURIComponent(customerKey)}/tags`,
        { method: "POST", body: JSON.stringify({ tag: clean }) }
      )
      // 태그가 360 페이로드에 동승하므로, 캐시를 비워 재오픈 시 편집 전 태그가 되살아나지 않게 한다.
      // 감사#1: 전역 스코프 대신 이 고객의 360 캐시(url)만 좁혀서 지운다 — 다른 탭 캐시는 보존.
      clearAdminRequestCache(url)
      // [blocker와 같은 근본 원인] await 도중 다른 고객으로 전환되면 이 setTags가 새 고객 화면에
      // 옛 고객의 라벨 목록을 얹는다 — 나머지 mutation 경로와 같은 가드.
      if (!isSameCustomer(mutationKey)) return
      setTags(result.tags ?? [])
      setTagInput("")
      setSavedMsg("라벨을 추가했어요")
    } catch (err) {
      if (!isSameCustomer(mutationKey)) return
      failMutation("라벨을 추가하지 못했습니다", err, () => void handleAddTag(), "입력은 그대로 남아 있습니다.")
    } finally {
      setTagBusy(false)
    }
  }

  async function handleRemoveTag(tag: string) {
    // url은 customerKey와 함께 나오는 파생값이라 !customerKey 만으로는 TS가 string으로
    // 좁혀 주지 않는다 — !url도 같이 걸어 non-null 단언 없이 clearAdminRequestCache(url)을 쓴다.
    if (!customerKey || !url) return
    const mutationKey = customerKey
    setTagBusy(true)
    clearMutationNotice()
    try {
      const result = await adminFetchJson<{ tags: string[] }>(
        `/api/admin/crm/customers/${encodeURIComponent(customerKey)}/tags?tag=${encodeURIComponent(tag)}`,
        { method: "DELETE" }
      )
      // 태그가 360 페이로드에 동승하므로, 캐시를 비워 재오픈 시 편집 전 태그가 되살아나지 않게 한다.
      // 감사#1: 전역 스코프 대신 이 고객의 360 캐시(url)만 좁혀서 지운다 — 다른 탭 캐시는 보존.
      clearAdminRequestCache(url)
      if (!isSameCustomer(mutationKey)) return
      setTags(result.tags ?? [])
      setSavedMsg("라벨을 지웠어요")
    } catch (err) {
      if (!isSameCustomer(mutationKey)) return
      failMutation("라벨을 지우지 못했습니다", err, () => void handleRemoveTag(tag))
    } finally {
      setTagBusy(false)
    }
  }

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

  // 기준 시각 캡션(UX 규약 4) — 서버가 360을 조립한 시각. 갱신 중/갱신 지연을 함께 적는다.
  const basisCaption = data
    ? `${syncing ? "갱신 중 · " : notice?.key === "revalidate" ? "갱신 지연 · " : ""}조회 ${formatClock(data.generatedAt)} 기준 · NEO·원장·Compass 합성`
    : null

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
                : syncing
                  ? `${displayName} 고객 정보를 최신으로 갱신하는 중입니다.`
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
                  title="규칙 기반 건강도 점수(0~100) — 리스크·서비스 위험·만료 신호 합성 (충전 잔액은 감점하지 않음)"
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
            {/* 기준 시각·출처 캡션(UX 규약 4) — 항상 마운트된 aria-live 영역이라 '갱신 중 → 조회 HH:MM' 전이가 통지된다. */}
            <p className={`mt-0.5 text-[11px] ${SECONDARY_TEXT_CLASS}`} role="status" aria-live="polite" data-testid="c360-basis-caption">
              {basisCaption ?? (loading ? "불러오는 중…" : "")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={loading}
              aria-busy={loading ? true : undefined}
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
                <p role="alert" className={`mt-1.5 text-[11px] font-medium ${STATUS_TONE_TEXT_CLASS.danger}`}>{neoLinkError}</p>
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

        {/* 2.2초 뒤 사라지는 토스트라 시각적으로 놓치면 끝이다 — 항상 마운트된 aria-live 영역으로 보조기술에도 알린다. */}
        <div role="status" aria-live="polite" className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
          {savedMsg ? (
            <div className="flex items-center gap-1.5 rounded-full bg-[#084734] px-3.5 py-2 text-[12px] font-semibold text-white shadow-lg">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {savedMsg}
            </div>
          ) : null}
        </div>

        {/* body */}
        <div ref={bodyRef} className="flex-1 space-y-3 overflow-y-auto bg-[#f5f5f2] p-4">
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
                  {/* hover:text-[#B43E3E] === STATUS_TONE.danger.text(lib/crm/status-tone.ts) — Tailwind
                      정적 스캔 때문에 hover: variant는 리터럴이어야 한다(동적 템플릿 불가). STATUS_TONE.danger.text가
                      바뀌면 이 리터럴도 같이 고친다(같은 패턴: LeadDrawer.tsx, CrmPriorityQueuePanel.tsx). */}
                  <button
                    type="button"
                    onClick={() => void handleRemoveTag(tag)}
                    disabled={tagBusy}
                    className="text-[#1a1a1a]/35 transition-colors hover:text-[#B43E3E] disabled:opacity-50"
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
                  // 감사 2026-09-07 §12 — isComposing 없이 Enter만 보면, 한글 조합을 막 끝내고
                  // (또는 후보 선택으로) 누른 Enter까지 태그 제출로 잡아 미완성 값을 보낸다.
                  // AdminMoneyInput과 같은 가드(e.nativeEvent.isComposing)를 그대로 쓴다.
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
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
              onDealAmountCommit={(dealId, amount) => void handleDealAmountChange(dealId, amount)}
              dealSave={dealSave}
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
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">충전 잔액 합계 · NEO 선불</p>
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

        {/* 하단 고정 알림(c360-08) — 실패는 danger·role=alert·닫기·재시도, 자동 소멸 없음. 갱신 지연은 warning으로 분리.
            task-undo(성공)는 8초 되돌리기 액션을 실는다(UX 규약 3). */}
        {notice ? (
          <div className="shrink-0 border-t border-[#e8e8e4] bg-white px-3 py-2">
            <CrmNoticeBanner
              tone={notice.tone}
              title={notice.title}
              message={notice.message}
              action={
                notice.undo
                  ? { label: "되돌리기", onClick: notice.undo, pending: taskUndoPending }
                  : notice.retry
                    ? { label: "다시 시도", onClick: notice.retry, pending: actingId !== null || loading || syncing }
                    : undefined
              }
              onDismiss={() => setNotice(null)}
            />
          </div>
        ) : null}
      </div>

      {/* 닫기 확인(c360-05) — 작성 중인 기록·할 일·딜·라벨 입력이 있을 때만. */}
      <DeleteConfirmDialog
        open={closeConfirmOpen}
        onClose={() => setCloseConfirmOpen(false)}
        onConfirm={() => {
          setCloseConfirmOpen(false)
          onClose()
        }}
        title="작성 중인 내용이 있습니다"
        description={`${displayName} 드로어를 닫으면 작성 중인 기록·할 일·딜·라벨 입력이 사라집니다.`}
        confirmLabel="버리고 닫기"
        cancelLabel="계속 작성"
        destructive={false}
      />
    </div>
  )
}
