"use client"

// 리드 보드 본체 — 조회·필터 상태와 벌크 작업 핸들러를 소유한다.
// 상세 드로어·연락 로그 폼·공용 아톰은 components/admin/crm/leads/board/* 로 분해했다(2026-08-28).

import { useState, useEffect, useCallback, useDeferredValue, useMemo, useRef } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  X,
  Building2,
  UserPlus, ExternalLink,
  Search, Check,
  Download,
  FileText, Layers, Megaphone, ArrowUpDown,
  Columns3, List as ListIcon,
} from "lucide-react"
import LeadRegisterModal from "@/components/admin/crm/LeadRegisterModal"
import DeleteConfirmDialog from "@/components/admin/DeleteConfirmDialog"
import CrmNoticeBanner, { type CrmNoticeTone } from "@/components/admin/crm/CrmNoticeBanner"
import FreshnessCaption from "@/components/admin/crm/FreshnessCaption"
import LeadTrackingPanel from "@/components/admin/crm/leads/LeadTrackingPanel"
import { useCrmOwners } from "@/components/admin/crm/useCrmOwners"
import { useVisibleCount } from "@/components/admin/ui/ShowMore"

import { adminFetch, adminFetchJsonCached, adminFetchJsonCachedWithMeta } from "@/lib/admin-client"
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import type { LeadActivity, LeadActivityBadge } from "@/lib/repositories/lead-activity"
import type { LeadRecord, LeadStatus } from "@/lib/repositories/leads"
import type { ContactLogRecord, ContactLogType, ContactLogResult } from "@/lib/repositories/contact-logs"
import type { PublicEvent } from "@/lib/types/public-events"
import {
  matchesLeadScopeFilters,
  selectScopedUnconfirmedLeads,
  type LeadScopeCriteria,
} from "@/lib/crm/leads-board-state"
import {
  STATUS_LABEL,
  LEAD_FILTER_KEYS,
  CONFIRMATION_GATE_EXEMPT_FILTERS,
  type LeadFilter,
  calcScore,
  readAdminResponse,
  toLocalDateKey,
  toFollowUpTimestamp,
  daysBetween,
  isActiveLead,
  isUnrespondedLead,
  isUnconfirmedLead,
  hoursBetween,
  getLeadOwner,
  getLeadSourceDetail,
  getLeadMagnetLabel,
  getLeadDisplayName,
  getLeadSourceGroup,
  SOURCE_GROUP_ORDER,
  SOURCE_GROUP_LABEL,
  SourceGroupDot,
  type LeadSourceGroup,
  Toast,
} from "@/components/admin/crm/leads/shared"
import {
  isMarketingLead,
  getLeadTrackingKey,
  TRACKING_DIMENSIONS,
  type TrackingDimension,
} from "@/lib/crm/lead-attribution"
import {
  LEAD_SORT_OPTIONS,
  calcLeadPriority,
  getEngagement,
  isLeadSortKey,
  sortLeads,
  tokenizeLeadSearch,
  type LeadPriority,
  type LeadSortKey,
} from "@/lib/crm/lead-ranking"
import {
  buildLeadAssignmentProfile,
  formatLeadAssignmentProfile,
} from "@/lib/crm/lead-assignment-profile"
import {
  applyLeadsViewParam,
  appliesAcrossBoardColumns,
  partitionLeadsToBoardColumns,
  readLeadsView,
  resolveBoardColumnFocus,
  type BoardColumnKey,
  type LeadsView,
} from "@/lib/crm/leads-board-state"
import { CompassBridgeDownNote } from "@/components/admin/compass/CompassLeadChip"
import { useCompassOverlay } from "@/components/admin/compass/use-compass-overlay"
import LeadsBoardView from "./LeadsBoardView"
import LeadDrawer from "./board/LeadDrawer"
import LeadsBulkBar from "./board/LeadsBulkBar"
import LeadsConsoleList from "./board/LeadsConsoleList"
import { PipelineRiskPanel, StageOwnerPanels, UnconfirmedInbox } from "./board/LeadsConsolePanels"
import {
  LEAD_BOARD_LIST_STEP,
  LENS_OPTIONS,
  NOW_TICK_MS,
  isLeadLens,
  type ConvertLeadResponse,
  type ConvertResultState,
  type LeadAssignmentPreviewResponse,
  type LeadLens,
} from "./board/shared"

// ─── 벌크 요청 공통기 ──────────────────────────────────────────
// 8건씩 끊어 보낸다. 수백 건을 한 번에 발사하면 브라우저 연결 한도와 서버가 같이 밀리고,
// 부분 실패 시 어디까지 갔는지도 알기 어렵다. PATCH(확인·상태)와 DELETE가 같은 동시성 정책을
// 쓰도록 여기 한 곳에 둔다. 실패한 id 목록(failedIds)을 함께 돌려줘 "실패 항목만 다시 선택"이
// 같은 벌크 작업을 처음부터 반복하지 않게 한다.
export const BULK_CHUNK_SIZE = 8

export async function runInChunks<T>(
  ids: string[],
  fn: (id: string) => Promise<T>,
  options?: { chunkSize?: number; fallbackMessage?: string }
): Promise<{ succeeded: T[]; failedIds: string[]; firstError: Error | null }> {
  const chunkSize = Math.max(1, options?.chunkSize ?? BULK_CHUNK_SIZE)
  const fallbackMessage = options?.fallbackMessage ?? "요청을 처리하지 못했습니다."
  const succeeded: T[] = []
  const failedIds: string[] = []
  let firstError: Error | null = null
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const settled = await Promise.allSettled(chunk.map((id) => fn(id)))
    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        succeeded.push(result.value)
        return
      }
      failedIds.push(chunk[index])
      if (!firstError) firstError = result.reason instanceof Error ? result.reason : new Error(fallbackMessage)
    })
  }
  return { succeeded, failedIds, firstError }
}

// 드로어 선택을 URL(?lead=)에 반영한다 — closeSelectedLead(파라미터 삭제)와 짝. 이미 같은 값이면
// 바꾸지 않아(false) 딥링크 진입 회차에 replaceState가 중복으로 나가지 않는다.
export function applySelectedLeadParam(url: URL, selectedId: string | null): boolean {
  if (!selectedId) return false
  if (url.searchParams.get("lead") === selectedId) return false
  url.searchParams.set("lead", selectedId)
  return true
}

// 확인 다이얼로그용 대상 요약 — 최대 5건의 표시 이름을 나열하고 나머지는 건수로 접는다.
export function summarizeLeadNames(leads: LeadRecord[], ids: string[], max = 5): string {
  const byId = new Map(leads.map((lead) => [lead.id, lead]))
  const names = ids.slice(0, max).map((id) => `"${getLeadDisplayName(byId.get(id))}"`)
  const rest = ids.length - names.length
  return rest > 0 ? `${names.join(", ")} 외 ${rest}건` : names.join(", ")
}

type BoardToast = {
  msg: string
  type: "success" | "error"
  action?: { label: string; onClick: () => void }
}

// 목록 상단 고정 배너 — 벌크 부분 실패처럼 토스트 3초로는 읽고 대응할 수 없는 결과를 닫기 전까지 남긴다.
type BulkNotice = {
  tone: CrmNoticeTone
  title: string
  message: string
  failedIds?: string[]
}

// ─── 리드 보드 ─────────────────────────────────────────────────
// 현황(/admin/crm)에서 추출한 리드 관리 보드 전체. ?filter=·?focus=risk 딥링크 지원.
export default function LeadsBoardClient() {
  const searchParams = useSearchParams()
  const initialFilter = ((): LeadFilter => {
    const raw = searchParams.get("filter")
    return raw && (LEAD_FILTER_KEYS as string[]).includes(raw) ? (raw as LeadFilter) : "all"
  })()
  const focusRisk = searchParams.get("focus") === "risk"
  const deepLinkedLeadId = searchParams.get("lead")?.trim() ?? ""
  const deepLinkedContactAction = searchParams.get("action") === "contact"
  const initialLens: LeadLens = isLeadLens(searchParams.get("lens")) ? (searchParams.get("lens") as LeadLens) : "all"
  const initialSort: LeadSortKey = isLeadSortKey(searchParams.get("sort"))
    ? (searchParams.get("sort") as LeadSortKey)
    : "priority"
  // 뷰 축 — 콘솔이 기본이라 URL에서 생략된다. 전환은 어떤 상태도 리셋하지 않는다(설계 §2).
  const initialView: LeadsView = readLeadsView(searchParams.get("view"))

  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [leadModalOpen, setLeadModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<LeadFilter>(initialFilter)
  const [view, setView] = useState<LeadsView>(initialView)
  // 모아보기 렌즈 · 정렬 — URL에 남겨 공유·뒤로가기가 같은 화면을 재현하게 한다.
  const [lens, setLens] = useState<LeadLens>(initialLens)
  const [sortKey, setSortKey] = useState<LeadSortKey>(initialSort)
  // 확인 게이트 우회 토글. 기본은 기존 규칙(미확인 숨김) 그대로 두되, 한 번의 클릭으로
  // "정말 전부" 볼 수 있게 한다 — 모아보기의 전제.
  //
  // ?unconfirmed=1 로 열어 둔 채 착지할 수 있다. Overview '홈페이지 유입' 타일처럼 게이트를
  // 안 걸고 센 숫자에서 넘어오는 링크가 게이트 걸린 목록에 떨어지면, 타일과 목록 건수가
  // 아무 설명 없이 어긋난다.
  const [includeUnconfirmed, setIncludeUnconfirmed] = useState(
    searchParams.get("unconfirmed") === "1"
  )
  const [trackingDimension, setTrackingDimension] = useState<TrackingDimension>("channel")
  const [trackingKey, setTrackingKey] = useState<string | null>(null)
  // 검색어·유입 그룹도 URL에서 복원한다 — 렌즈·정렬처럼 공유·새로고침에서 같은 화면.
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q")?.trim() ?? "")
  const [sourceDetailFilter, setSourceDetailFilter] = useState("all")
  // 인사이트 '채널별 전환율'에서 ?source=로 진입하는 유입경로(source) 필터.
  const [channelSource, setChannelSource] = useState(searchParams.get("source")?.trim() ?? "")
  const [leadMagnetFilter, setLeadMagnetFilter] = useState("all")
  // 상단 유입 칩 필터 — source를 7묶음으로 접어 거른다(상태/SLA 필터와 직교 AND 결합).
  const [sourceGroup, setSourceGroup] = useState<LeadSourceGroup | "all">(() => {
    const raw = searchParams.get("group")
    return raw && (SOURCE_GROUP_ORDER as readonly string[]).includes(raw) ? (raw as LeadSourceGroup) : "all"
  })
  const [selected, setSelected] = useState<LeadRecord | null>(null)
  const [contactDraft, setContactDraft] = useState<{ leadId: string; type: ContactLogType } | null>(null)
  const [logs, setLogs] = useState<ContactLogRecord[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [activity, setActivity] = useState<LeadActivity | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [toast, setToast] = useState<BoardToast | null>(null)
  // 벌크 작업 부분 실패 배너(목록 상단, 닫기 전까지 유지) — 실패 id를 들고 있어 재선택이 가능하다.
  const [bulkNotice, setBulkNotice] = useState<BulkNotice | null>(null)
  // 연락 기록 저장은 됐지만 리드 상태 동기화가 실패한 경우의 경고 — 저장 성공 토스트와 분리해
  // 낮은 강도(warning)로 병기한다(leads-04). 드로어(z-50) 위에 보이도록 고정 배치한다.
  const [syncWarning, setSyncWarning] = useState<string | null>(null)
  // CRM 전환 직후 동선 — 딜/고객 딥링크 패널 (토스트와 달리 닫기 전까지 유지).
  const [convertResult, setConvertResult] = useState<ConvertResultState | null>(null)
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [activitySummary, setActivitySummary] = useState<Record<string, LeadActivityBadge>>({})
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(() => new Set())
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set())
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(() => new Set())
  const [statusUpdatingIds, setStatusUpdatingIds] = useState<Set<string>>(() => new Set())
  const [convertingIds, setConvertingIds] = useState<Set<string>>(() => new Set())
  // 감사 2026-09-07 §3 — 리드 '확인'·'전환'은 confirmed_at을 되돌릴 API 없이 즉시 찍거나
  // 고객·거래 레코드를 만드는 비가역 동작인데 UI 경고가 없었다(단건 확인은 length>1 분기라 항상
  // 우회). 공용 확인 다이얼로그(components/admin/DeleteConfirmDialog)로 모든 진입점을 통일한다.
  const [confirmLeadsRequest, setConfirmLeadsRequest] = useState<{ ids: string[] } | null>(null)
  const [confirmLeadsBusy, setConfirmLeadsBusy] = useState(false)
  const [convertLeadRequest, setConvertLeadRequest] = useState<LeadRecord | null>(null)
  const [convertLeadBusy, setConvertLeadBusy] = useState(false)
  const [bulkWorking, setBulkWorking] = useState(false)
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false)
  const [bulkOwnerKey, setBulkOwnerKey] = useState("")
  const [assignmentPreview, setAssignmentPreview] = useState<LeadAssignmentPreviewResponse | null>(null)
  const [assignmentPreviewLoading, setAssignmentPreviewLoading] = useState(false)
  const [assignmentPreviewError, setAssignmentPreviewError] = useState<string | null>(null)
  // 목록 로드 실패를 빈 목록과 구분한다 — 장애 중에 "등록된 리드가 없습니다"로 오인되면 안 된다.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null)
  // SWR 고속 경로로 옛 목록을 먼저 그린 뒤 배경 갱신이 도는 중 — 신선도 캡션이 "갱신 중"으로 표시한다(P2).
  const [revalidating, setRevalidating] = useState(false)
  const [dismissedDeepLinkedLeadId, setDismissedDeepLinkedLeadId] = useState<string | null>(null)
  // 감사 2026-09-07 §3 후속 — 하드 삭제만 브라우저 confirm()에 남아 있었다. 확인·전환과 같은
  // 요청 상태 패턴으로 공용 확인 다이얼로그를 거친다(대상 이름·영향 범위·비가역 경고 표시).
  const [deleteLeadsRequest, setDeleteLeadsRequest] = useState<{ ids: string[]; successMessage?: string } | null>(null)
  const [deleteLeadsBusy, setDeleteLeadsBusy] = useState(false)
  // 벌크 "종료"·"배정"도 같은 요청 상태 패턴 — window.confirm 을 이 화면에서 완전히 걷는다(UX 규약 1).
  const [closeLeadsRequest, setCloseLeadsRequest] = useState<{ ids: string[] } | null>(null)
  // 종료·배정 확인 다이얼로그 전용 busy — bulkWorking과 분리한다. onConfirm이 요청 상태를
  // finally에서만 비워 처리가 끝날 때까지 다이얼로그가 열려 있고, 그 사이 loading이 실제로
  // 화면에 보인다(리뷰 발견 2 — 예전엔 onConfirm이 즉시 request를 null로 비워 다이얼로그가
  // bulkWorking(true)이 찍히기 전에 닫혀 loading이 보일 기회가 없었다).
  const [closeLeadsBusy, setCloseLeadsBusy] = useState(false)
  const [bulkAssignRequest, setBulkAssignRequest] = useState<{
    ids: string[]
    ownerKey: string
    preview: LeadAssignmentPreviewResponse | undefined
    ownerLabel: string
    profileText: string
  } | null>(null)
  const [bulkAssignBusy, setBulkAssignBusy] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  // 행·카드가 사라지는 처리(삭제) 뒤 포커스를 목록 섹션으로 옮긴다(UX 규약 7).
  const listSectionRef = useRef<HTMLDivElement>(null)
  // 우하단 고정 스택(전환 완료 패널·토스트) 실측용 — syncWarning 배너를 bottom-44/28/24/6 같은
  // 추정치가 아니라 실제 렌더된 상단 좌표 위에 얹기 위해 각 패널의 DOM 노드를 잡는다(리뷰 발견 3).
  const convertResultPanelRef = useRef<HTMLDivElement>(null)
  const toastMeasureRef = useRef<HTMLDivElement>(null)
  const { owners: crmOwners, health: crmOwnerHealth } = useCrmOwners()
  // Compass(마케팅팀 앱) 콜 상태 병기 — 읽기 전용 오버레이. 우리 리드 상태는 건드리지 않는다.
  const compass = useCompassOverlay(leads)

  // "/" 로 검색창 포커스 — 목록을 훑다가 손을 옮기지 않고 바로 좁힐 수 있게.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      event.preventDefault()
      searchInputRef.current?.focus()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await adminFetchJsonCached<PublicEvent[]>("/api/admin/events", undefined, { ttlMs: CRM_CACHE_TTL_MS })
        if (!cancelled) setEvents(Array.isArray(data) ? data : [])
      } catch {
        /* noop — 행사 연결 UI는 events 없어도 동작 */
      }
    })()
    return () => { cancelled = true }
  }, [])

  // 리드별 활동 배지 맵 — 1회 로드, 실패해도 배지만 비운다.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await adminFetchJsonCached<{ summary: Record<string, LeadActivityBadge> }>(
          "/api/admin/leads/activity-summary",
          undefined,
          { ttlMs: CRM_CACHE_TTL_MS }
        )
        if (!cancelled) setActivitySummary(data?.summary ?? {})
      } catch {
        /* noop — 배지는 보조 정보 */
      }
    })()
    return () => { cancelled = true }
  }, [])

  // 백그라운드 갱신(SWR) 결과가 화면이 사라진 뒤 도착할 수 있다 — 언마운트 후 setState 방지.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // 언마운트 후 setState(경고) 방지 + 토스트가 연달아 뜰 때 이전 타이머가 새 토스트를 지우지 않게.
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  // syncWarning 배너의 세로 오프셋 — bottom-44/28/24/6 네 값 중 하나를 토스트·전환 패널의
  // "있음/없음" 조합만으로 고르면, 토스트가 action 버튼·긴 메시지로 여러 줄이 되거나 전환
  // 패널 높이가 늘어날 때 두 고정 패널이 겹칠 수 있었다(리뷰 발견 3). 실제 렌더된 두 패널의
  // 상단 좌표를 재서 그 위에 얹는 값으로 대체한다.
  const [syncWarningOffsetPx, setSyncWarningOffsetPx] = useState(24)
  useEffect(() => {
    if (!syncWarning) return
    const GAP_PX = 12
    const FALLBACK_PX = 24
    const measure = () => {
      const tops: number[] = []
      const toastEl = toastMeasureRef.current?.firstElementChild as HTMLElement | null
      if (toastEl) tops.push(toastEl.getBoundingClientRect().top)
      if (convertResultPanelRef.current) tops.push(convertResultPanelRef.current.getBoundingClientRect().top)
      if (tops.length === 0) {
        setSyncWarningOffsetPx(FALLBACK_PX)
        return
      }
      setSyncWarningOffsetPx(Math.max(FALLBACK_PX, window.innerHeight - Math.min(...tops) + GAP_PX))
    }
    measure()
    const observedEls = [toastMeasureRef.current?.firstElementChild, convertResultPanelRef.current].filter(
      (el): el is HTMLElement => Boolean(el)
    )
    const observer = new ResizeObserver(measure)
    observedEls.forEach((el) => observer.observe(el))
    window.addEventListener("resize", measure)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [syncWarning, toast, convertResult])

  // 성공은 3초 뒤 자동으로 걷고, 실패는 원인을 읽고 닫을 때까지 남긴다(UX 규약 3 — 실패는 자동
  // 소멸하지 않는다). 둘 다 X 닫기를 갖고, action(재시도·되돌리기)은 선택.
  const showToast = (
    msg: string,
    type: "success" | "error" = "success",
    options?: { action?: BoardToast["action"] }
  ) => {
    setToast({ msg, type, action: options?.action })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = null
    if (type === "success") {
      toastTimerRef.current = setTimeout(() => setToast(null), 3000)
    }
  }
  const dismissToast = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = null
    setToast(null)
  }

  const fetchLeads = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true)
    try {
      // WithMeta를 쓰는 이유: staleIfError 폴백(갱신 실패 → 예전 캐시)이 조용히 성공처럼
      // 보이면 안 된다. 실패로 대체된 경우에만 배너를 띄우고, 갱신 시각도 실제 저장 시각으로 적는다.
      const result = await adminFetchJsonCachedWithMeta<{ leads: LeadRecord[] }>("/api/admin/leads", undefined, {
        ttlMs: CRM_CACHE_TTL_MS,
        force: options?.force,
        persist: false,
        staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
        // SWR 고속 경로로 옛 목록을 먼저 그린 회차는 여기로 갱신 결과가 온다. 이 화면은
        // 마운트 시 1회만 로드하므로 이 콜백이 없으면 갱신분이 화면에 도달하지 못하고
        // 세션 내내 최대 TTL+SWR 창만큼 옛 목록이 남는다.
        onRevalidated: ({ data, error }) => {
          if (!mountedRef.current) return
          setRevalidating(false)
          if (error || !data) {
            setLoadError("리드 목록을 새로 받지 못했습니다.")
            return
          }
          setLeads(data.leads)
          setLoadError(null)
          setLastLoadedAt(new Date())
        },
      })
      setLeads(result.data.leads)
      setLoadError(result.staleReason === "error" ? "리드 목록을 새로 받지 못했습니다." : null)
      setLastLoadedAt(result.staleSince === null ? new Date() : new Date(result.staleSince))
      setRevalidating(result.staleReason === "revalidate")
    } catch (err) {
      setRevalidating(false)
      const message = err instanceof Error ? err.message : "리드를 불러오지 못했습니다."
      setLoadError(message)
      showToast(message, "error")
    } finally { setLoading(false) }
  }, [])

  const fetchLogs = useCallback(async (leadId: string) => {
    setLogsLoading(true)
    try {
      const res = await adminFetch(`/api/admin/leads/${leadId}/logs`)
      const data = await readAdminResponse<{ logs: ContactLogRecord[] }>(res, "연락 기록을 불러오지 못했습니다.")
      setLogs(data.logs)
    } catch (err) {
      setLogs([])
      showToast(err instanceof Error ? err.message : "연락 기록을 불러오지 못했습니다.", "error")
    } finally { setLogsLoading(false) }
  }, [])

  // 활동 인텔리전스는 보조 정보 — 실패해도 토스트로 방해하지 않고 빈 상태로 둔다.
  const fetchActivity = useCallback(async (leadId: string) => {
    setActivityLoading(true)
    try {
      const res = await adminFetch(`/api/admin/leads/${leadId}/activity`)
      const data = await readAdminResponse<LeadActivity>(res, "활동 데이터를 불러오지 못했습니다.")
      setActivity(data)
    } catch {
      setActivity(null)
    } finally { setActivityLoading(false) }
  }, [])

  useEffect(() => {
    void fetchLeads()
  }, [fetchLeads])

  // ?focus=risk 딥링크 — 데이터 로드 후 리스크 밴드로 스크롤
  useEffect(() => {
    if (!focusRisk || loading || leads.length === 0) return
    document.getElementById("pipeline-risk")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [focusRisk, loading, leads.length])

  useEffect(() => {
    if (selected) {
      const updated = leads.find((l) => l.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [leads]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      !deepLinkedLeadId ||
      loading ||
      leads.length === 0 ||
      selected?.id === deepLinkedLeadId ||
      dismissedDeepLinkedLeadId === deepLinkedLeadId
    )
      return
    const match = leads.find((lead) => lead.id === deepLinkedLeadId)
    if (match) {
      setSelected(match)
      if (deepLinkedContactAction) setContactDraft({ leadId: match.id, type: "call" })
    }
  }, [deepLinkedContactAction, deepLinkedLeadId, dismissedDeepLinkedLeadId, leads, loading, selected?.id])

  useEffect(() => {
    if (!selected || !deepLinkedContactAction) return
    const url = new URL(window.location.href)
    url.searchParams.delete("action")
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [deepLinkedContactAction, selected])

  const closeSelectedLead = useCallback(() => {
    setSelected(null)
    setContactDraft(null)
    if (deepLinkedLeadId) setDismissedDeepLinkedLeadId(deepLinkedLeadId)
    const url = new URL(window.location.href)
    if (!url.searchParams.has("lead")) return
    url.searchParams.delete("lead")
    url.searchParams.delete("action")
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [deepLinkedLeadId])

  // closeSelectedLead와 짝 — 행 클릭으로 연 드로어도 ?lead= 에 남겨 새로고침·링크 공유·뒤로가기
  // 복귀에서 같은 리드가 다시 열리게 한다. 딥링크로 들어온 회차(이미 ?lead=같은 id)는 헬퍼가
  // false를 돌려 replaceState를 중복으로 부르지 않는다. 딥링크와 다른 리드를 클릭했으면 그
  // 딥링크는 소비된 것으로 표시해, 위 딥링크 effect가 원래 리드로 되돌리지 않게 한다.
  const selectedId = selected?.id ?? null
  useEffect(() => {
    if (!selectedId) return
    if (deepLinkedLeadId && selectedId !== deepLinkedLeadId) setDismissedDeepLinkedLeadId(deepLinkedLeadId)
    const url = new URL(window.location.href)
    if (!applySelectedLeadParam(url, selectedId)) return
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [selectedId, deepLinkedLeadId])

  // 검색어만 300ms 눌러서 URL에 반영한다 — 나머지 축은 클릭 단위라 즉시 반영해도 되지만,
  // 검색은 키 입력마다 replaceState를 불러 타이핑 중 히스토리 API를 초당 수십 번 두드렸다.
  const [urlSearchQuery, setUrlSearchQuery] = useState(searchQuery)
  useEffect(() => {
    const timer = window.setTimeout(() => setUrlSearchQuery(searchQuery), 300)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  // 렌즈·정렬·상태 필터·검색어·유입 그룹을 URL에 반영한다(히스토리를 늘리지 않는 replace) —
  // 링크 공유·새로고침에서 같은 화면. 읽기 쪽(useState 초기값)과 키가 짝을 이룬다.
  useEffect(() => {
    const url = new URL(window.location.href)
    const apply = (key: string, value: string, fallback: string) => {
      if (value === fallback) url.searchParams.delete(key)
      else url.searchParams.set(key, value)
    }
    applyLeadsViewParam(url, view)
    apply("lens", lens, "all")
    apply("sort", sortKey, "priority")
    apply("filter", filter, "all")
    apply("q", urlSearchQuery.trim(), "")
    apply("group", sourceGroup, "all")
    apply("unconfirmed", includeUnconfirmed ? "1" : "0", "0")
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [view, lens, sortKey, filter, urlSearchQuery, sourceGroup, includeUnconfirmed])

  // 렌즈나 축이 바뀌면 이전 축의 트래킹 선택은 의미를 잃는다 — 조용히 남겨두면 빈 목록이 된다.
  useEffect(() => {
    setTrackingKey(null)
  }, [lens, trackingDimension])

  // 드로어 열릴 때 로그 + 활동 인텔리전스 로드
  useEffect(() => {
    if (selected) {
      fetchLogs(selected.id)
      fetchActivity(selected.id)
    } else {
      setLogs([])
      setActivity(null)
    }
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const requestAssignmentPreview = useCallback(async (ids: string[]) => {
    const res = await adminFetch("/api/admin/leads/assignment-preview", {
      method: "POST",
      adminReadOnly: true,
      body: JSON.stringify({ ids }),
    })
    return readAdminResponse<LeadAssignmentPreviewResponse>(
      res,
      "배정 안전성을 확인하지 못했습니다."
    )
  }, [])

  useEffect(() => {
    if (!bulkAssignOpen || selectedLeadIds.size === 0) {
      setAssignmentPreview(null)
      setAssignmentPreviewError(null)
      setAssignmentPreviewLoading(false)
      return
    }

    let cancelled = false
    setAssignmentPreviewLoading(true)
    setAssignmentPreviewError(null)
    void requestAssignmentPreview(Array.from(selectedLeadIds))
      .then((preview) => {
        if (!cancelled) setAssignmentPreview(preview)
      })
      .catch((error) => {
        if (cancelled) return
        setAssignmentPreview(null)
        setAssignmentPreviewError(error instanceof Error ? error.message : "배정 안전성을 확인하지 못했습니다.")
      })
      .finally(() => {
        if (!cancelled) setAssignmentPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [bulkAssignOpen, requestAssignmentPreview, selectedLeadIds])

  const applyLeadAssignment = async (
    ids: string[],
    ownerKey: string | null,
    preview?: LeadAssignmentPreviewResponse
  ) => {
    const res = await adminFetch("/api/admin/leads/bulk-assign", {
      method: "PATCH",
      body: JSON.stringify(
        ownerKey
          ? {
              ids,
              assigned_to: ownerKey,
              snapshotToken: preview?.snapshotToken,
              mode: "manual_reviewed",
              reasonCode: "operator_reviewed",
            }
          : { ids, assigned_to: null }
      ),
    })
    const data = await readAdminResponse<{
      leads: LeadRecord[]
      updated: number
      missing: number
      assignedTo: string | null
    }>(res, "담당자를 저장하지 못했습니다.")
    const updated = new Map(data.leads.map((lead) => [lead.id, lead]))
    setLeads((prev) => prev.map((lead) => updated.get(lead.id) ?? lead))
    setSelected((prev) => (prev ? updated.get(prev.id) ?? prev : prev))
    return data
  }

  // 감사 2026-09-07 §8 — leads/[id]는 동시 편집 충돌 검증이 전혀 없어 마지막 저장이 무조건
  // 이겼다. 이 화면이 알고 있는 리드의 updated_at을 함께 보내 서버 낙관적 잠금을 태운다 —
  // 그사이 다른 사람이 먼저 저장했으면 서버가 409로 알려준다(row 단위 비교라 다른 필드를
  // 고쳤어도 걸릴 수 있음 — 그 리드를 새로고침해야 한다는 정확한 신호다).
  const getExpectedUpdatedAt = (id: string) => leads.find((lead) => lead.id === id)?.updated_at ?? null

  const handleStatus = async (id: string, status: LeadStatus, options?: { silent?: boolean }) => {
    setStatusUpdatingIds((prev) => new Set(prev).add(id))
    try {
      const res = await adminFetch(`/api/admin/leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, expectedUpdatedAt: getExpectedUpdatedAt(id) }),
      })
      // 서버 응답 리드를 그대로 반영한다 — 상태 전이 때 서버가 함께 채우는 confirmed_at을
      // 버리면 "미확인" 배지·수신함 카운트가 새로고침 전까지 어긋난다.
      const data = await readAdminResponse<{ lead: LeadRecord }>(res, "상태를 변경하지 못했습니다.")
      setLeads((prev) => prev.map((l) => (l.id === id ? data.lead : l)))
      if (!options?.silent) showToast(`"${STATUS_LABEL[status]}" 상태로 변경했습니다.`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : "상태를 변경하지 못했습니다.", "error")
    } finally {
      setStatusUpdatingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleNotes = async (id: string, notes: string) => {
    try {
      const res = await adminFetch(`/api/admin/leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes, expectedUpdatedAt: getExpectedUpdatedAt(id) }),
      })
      await readAdminResponse(res, "메모를 저장하지 못했습니다.")
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, notes } : l))
    } catch (err) {
      const error = err instanceof Error ? err : new Error("메모를 저장하지 못했습니다.")
      showToast(error.message, "error")
      throw error
    }
  }

  const handleFollowUp = async (id: string, date: string) => {
    const follow_up_at = date ? toFollowUpTimestamp(date) : null
    try {
      const res = await adminFetch(`/api/admin/leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ follow_up_at, expectedUpdatedAt: getExpectedUpdatedAt(id) }),
      })
      await readAdminResponse(res, "팔로업 일정을 저장하지 못했습니다.")
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, follow_up_at: follow_up_at ?? undefined } : l))
    } catch (err) {
      showToast(err instanceof Error ? err.message : "팔로업 일정을 저장하지 못했습니다.", "error")
    }
  }

  const handleAssignedTo = async (id: string, name: string) => {
    try {
      const preview = name ? await requestAssignmentPreview([id]) : undefined
      if (preview && preview.blockedLeadIds.length > 0) {
        throw new Error("이 리드는 확인·테스트·중복·최근성 조건 중 하나를 충족하지 않아 바로 배정할 수 없습니다.")
      }
      await applyLeadAssignment([id], name || null, preview)
      showToast(name ? "담당자를 배정했습니다." : "담당자 배정을 해제했습니다.")
    } catch (err) {
      const error = err instanceof Error ? err : new Error("담당자를 저장하지 못했습니다.")
      showToast(error.message, "error")
      throw error
    }
  }

  const handleAddLog = async (entry: { type: ContactLogType; result?: ContactLogResult; notes?: string; contacted_by?: string }) => {
    if (!selected) return
    try {
      const res = await adminFetch(`/api/admin/leads/${selected.id}/logs`, {
        method: "POST",
        body: JSON.stringify(entry),
      })
      const data = await readAdminResponse<{
        statusSync: "updated" | "unchanged" | "failed"
        warning?: string
      }>(res, "연락 기록을 저장하지 못했습니다.")
      await fetchLogs(selected.id)
      if (selected.status === "new" && data.statusSync === "updated") {
        const next = { ...selected, status: "contacted" as const, confirmed_at: new Date().toISOString() }
        setLeads((prev) => prev.map((lead) => (lead.id === selected.id ? next : lead)))
        setSelected(next)
      }
      // 저장 성공과 상태 동기화 경고를 분리한다 — 경고를 실패 톤 토스트로 내면 "저장 실패"로
      // 오인해 같은 기록을 다시 넣는다(leads-04). 저장은 성공 토스트, 경고는 warning 배너.
      showToast("연락 기록이 저장되었습니다.")
      // 새 경고가 있을 때만 갱신한다 — 이번 저장에 경고가 없다고 해서 아직 사용자가 닫지 않은
      // 이전 경고를 조용히 지우지 않는다(UX 규약 3: 실패·경고는 자동 소멸하지 않는다. 리뷰 발견 4).
      if (data.warning) setSyncWarning(`상태 동기화 실패: ${data.warning}`)
    } catch (err) {
      const error = err instanceof Error ? err : new Error("연락 기록을 저장하지 못했습니다.")
      showToast(error.message, "error")
      throw error
    }
  }

  const handleDeleteLog = async (logId: string) => {
    if (!selected) return
    try {
      const res = await adminFetch(`/api/admin/leads/${selected.id}/logs?logId=${logId}`, { method: "DELETE" })
      await readAdminResponse(res, "연락 기록을 삭제하지 못했습니다.")
      setLogs((prev) => prev.filter((l) => l.id !== logId))
    } catch (err) {
      showToast(err instanceof Error ? err.message : "연락 기록을 삭제하지 못했습니다.", "error")
    }
  }

  const handleConvert = async (lead: LeadRecord) => {
    if (convertingIds.has(lead.id)) return
    setConvertingIds((prev) => new Set(prev).add(lead.id))
    try {
      const res = await adminFetch(`/api/admin/leads/${lead.id}/convert-v2`, { method: "POST" })
      const { customer, deal, lead: updatedLead, links, reusedExisting } = await readAdminResponse<ConvertLeadResponse>(
        res,
        "V2 고객사·거래 등록에 실패했습니다."
      )

      setLeads((prev) => prev.map((l) => l.id === lead.id ? updatedLead : l))
      setConvertResult({
        customerName: customer.name,
        dealCode: deal.deal_code ?? null,
        reused: Boolean(reusedExisting?.customer || reusedExisting?.deal),
        dealUrl:
          links?.deal ??
          (deal.id ? `/admin/crm/deals/orders?deal=${encodeURIComponent(deal.id)}` : null),
        customerUrl:
          links?.customer ?? `/admin/crm/customers/unified?q=${encodeURIComponent(customer.name)}`,
        // 딜 컨텍스트를 견적 작성기로 프리필 — 고객 재입력 없이 견적 생성으로 이어짐.
        quoteUrl: deal.id
          ? `/admin/quotes?tab=hardware&action=new&dealId=${encodeURIComponent(deal.id)}`
          : null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "고객사·거래 등록에 실패했습니다."
      showToast(message, "error")
    } finally {
      setConvertingIds((prev) => {
        const next = new Set(prev)
        next.delete(lead.id)
        return next
      })
    }
  }

  // 벌크 PATCH 공통기 — 동시성 정책은 runInChunks(파일 상단) 한 곳. 성공 행은 서버 응답
  // 리드로 병합한다(낙관적 덮어쓰기 금지 — confirmed_at 등 서버 산출 필드 보존).
  const patchLeadsInChunks = async (ids: string[], body: Record<string, unknown>, fallbackMessage: string) => {
    const { succeeded, failedIds, firstError } = await runInChunks(
      ids,
      async (id) => {
        const res = await adminFetch(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify(body) })
        const data = await readAdminResponse<{ lead: LeadRecord }>(res, fallbackMessage)
        return data.lead
      },
      { fallbackMessage }
    )
    if (succeeded.length > 0) {
      const merged = new Map(succeeded.map((lead) => [lead.id, lead]))
      setLeads((prev) => prev.map((lead) => merged.get(lead.id) ?? lead))
    }
    return { succeeded, failedIds, failedCount: failedIds.length, firstError }
  }

  // 벌크 부분 실패 → 목록 상단 고정 배너. 토스트 3초로는 원인을 읽고 어떤 리드가 실패했는지
  // 확인할 수 없었다(leads-02). '실패 항목만 다시 선택'으로 같은 작업을 실패분에만 반복한다.
  const reportBulkFailure = (
    verb: string,
    succeededCount: number,
    failedIds: string[],
    firstError: Error | null,
    fallbackMessage: string
  ) => {
    const reason = firstError?.message ?? fallbackMessage
    setBulkNotice({
      tone: "danger",
      title: succeededCount > 0 ? `일부 리드를 ${verb}하지 못했습니다` : `리드를 ${verb}하지 못했습니다`,
      message:
        succeededCount > 0
          ? `${succeededCount}건 ${verb}, ${failedIds.length}건 실패 · ${reason}`
          : `${failedIds.length}건 실패 · ${reason}`,
      failedIds,
    })
  }

  const reselectFailedLeads = () => {
    if (!bulkNotice?.failedIds?.length) return
    const failed = new Set(bulkNotice.failedIds)
    setSelectedLeadIds(new Set(leads.filter((lead) => failed.has(lead.id)).map((lead) => lead.id)))
    setView("console")
    setBulkNotice(null)
  }

  // "확인" 실행기 — 공개 채널 리드를 기본 리드 화면으로 승격한다. 단건(드로어) · 다건(수신함
  // 배너·벌크 바) 공용. 감사 2026-09-07 §3 — 되돌릴 API가 없는 비가역 동작이라 실제 실행은
  // 항상 requestConfirmMany가 띄우는 확인 다이얼로그를 거친 뒤에만 호출된다(이 함수 자체는
  // 더 이상 window.confirm을 갖지 않는다 — 단건이 length>1 분기를 우회하던 버그의 근본 원인).
  const handleConfirmMany = async (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return

    setConfirmingIds((prev) => {
      const next = new Set(prev)
      uniqueIds.forEach((id) => next.add(id))
      return next
    })
    try {
      const { succeeded, failedIds, firstError } = await patchLeadsInChunks(
        uniqueIds,
        { confirmed: true },
        "리드를 확인 처리하지 못했습니다."
      )
      if (failedIds.length > 0) {
        reportBulkFailure("확인 처리", succeeded.length, failedIds, firstError, "리드를 확인 처리하지 못했습니다.")
        return
      }
      showToast(`${succeeded.length}건 확인 처리했습니다.`)
    } finally {
      setConfirmingIds((prev) => {
        const next = new Set(prev)
        uniqueIds.forEach((id) => next.delete(id))
        return next
      })
    }
  }

  // "확인" 진입점 — 단건(드로어)·다건(수신함 "모두 확인"·벌크 바) 전부 여기를 거친다.
  // 다이얼로그의 onConfirm이 실제 handleConfirmMany를 호출한다.
  const requestConfirmMany = (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return
    setConfirmLeadsRequest({ ids: uniqueIds })
  }

  const runConfirmLeadsRequest = async () => {
    if (!confirmLeadsRequest) return
    setConfirmLeadsBusy(true)
    try {
      await handleConfirmMany(confirmLeadsRequest.ids)
    } finally {
      setConfirmLeadsBusy(false)
      setConfirmLeadsRequest(null)
    }
  }

  // "고객·거래 등록" 진입점 — LeadsConsoleList·LeadDrawer 공용. 전환은 되돌릴 수 없어(리드로
  // 되돌리는 API 없음) 매번 확인 다이얼로그를 띄운다(감사 2026-09-07 §3 — 기존에는 경고가 전혀 없었다).
  const requestConvert = (lead: LeadRecord) => {
    if (convertingIds.has(lead.id)) return
    setConvertLeadRequest(lead)
  }

  const runConvertLeadRequest = async () => {
    if (!convertLeadRequest) return
    const lead = convertLeadRequest
    setConvertLeadBusy(true)
    try {
      await handleConvert(lead)
    } finally {
      setConvertLeadBusy(false)
      setConvertLeadRequest(null)
    }
  }

  // 벌크 상태 변경 — 선택한 신규 리드를 "연락중"으로 넘기거나 선택 전체를 "종료"로 정리한다.
  // "종료"는 활성 파이프라인에서 빠지는 단계 전환이라 requestBulkStatus 의 확인 다이얼로그를 거친다.
  const handleBulkStatus = async (ids: string[], status: LeadStatus) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return
    setBulkWorking(true)
    try {
      const { succeeded, failedIds, firstError } = await patchLeadsInChunks(
        uniqueIds,
        { status },
        "상태를 변경하지 못했습니다."
      )
      if (failedIds.length > 0) {
        reportBulkFailure("변경", succeeded.length, failedIds, firstError, "상태를 변경하지 못했습니다.")
        return
      }
      showToast(`${succeeded.length}건을 "${STATUS_LABEL[status]}" 상태로 변경했습니다.`)
    } finally {
      setBulkWorking(false)
    }
  }

  // 벌크 담당자 지정 — 검증된 CRM 담당자를 서버 한 번의 UPDATE로 배정한다.
  // 수백 건을 리드별 PATCH로 보내던 흐름은 부분 실패·긴 대기·비정규 이름 입력을 만들었다.
  const handleBulkAssign = async (ids: string[], ownerKey: string | null) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return
    let preview: LeadAssignmentPreviewResponse | undefined
    if (ownerKey) {
      try {
        preview = await requestAssignmentPreview(uniqueIds)
      } catch (err) {
        showToast(err instanceof Error ? err.message : "배정 안전성을 확인하지 못했습니다.", "error")
        return
      }
      if (preview.blockedLeadIds.length > 0) {
        showToast(
          `안전 조건을 충족하지 않은 ${preview.blockedLeadIds.length}건이 포함되어 있습니다. 안전 대상만 다시 선택해 주세요.`,
          "error"
        )
        setAssignmentPreview(preview)
        return
      }
      const selectedIds = new Set(uniqueIds)
      const profile = buildLeadAssignmentProfile(leads.filter((lead) => selectedIds.has(lead.id)))
      const ownerLabel = crmOwners.find((owner) => owner.ownerKey === ownerKey)?.displayName ?? ownerKey
      // 배정 확인은 공용 다이얼로그로 — 실행은 runBulkAssignRequest 가 이어받는다.
      setBulkAssignRequest({
        ids: uniqueIds,
        ownerKey,
        preview,
        ownerLabel,
        profileText: formatLeadAssignmentProfile(profile),
      })
      return
    }
    await runBulkAssign(uniqueIds, ownerKey, preview)
  }

  const runBulkAssign = async (
    uniqueIds: string[],
    ownerKey: string | null,
    preview: LeadAssignmentPreviewResponse | undefined
  ) => {
    setBulkWorking(true)
    try {
      const data = await applyLeadAssignment(uniqueIds, ownerKey, preview)
      setSelectedLeadIds(new Set())
      setBulkAssignOpen(false)
      setBulkOwnerKey("")

      const ownerLabel = crmOwners.find((owner) => owner.ownerKey === data.assignedTo)?.displayName ?? data.assignedTo
      showToast(
        data.assignedTo
          ? `${data.updated}건을 "${ownerLabel}" 담당자에게 배정했습니다.`
          : `${data.updated}건의 담당자 배정을 해제했습니다.`
      )
    } catch (err) {
      // 서버 한 번의 UPDATE라 전량 실패다 — 선택은 그대로 남아 있으니 배너에서 바로 재시도할 수 있다.
      reportBulkFailure(
        "배정",
        0,
        uniqueIds,
        err instanceof Error ? err : null,
        "담당자를 저장하지 못했습니다."
      )
    } finally {
      setBulkWorking(false)
    }
  }

  // 삭제 실행기 — 단건(행·드로어)·다건(벌크 바) 공용. 실제 실행은 항상 requestDeleteMany가 띄우는
  // 확인 다이얼로그를 거친 뒤에만 호출된다(이 함수 자체는 confirm을 갖지 않는다). DELETE도
  // PATCH와 같은 runInChunks(8건) 정책을 쓴다 — 전량 동시 발사로 연결을 밀어내지 않는다.
  // 소프트 삭제·복구(C3)는 기획안 §6 결정5 대기 항목이라 여기 넣지 않는다.
  const handleDeleteMany = async (ids: string[], options?: { successMessage?: string }) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return

    setDeletingIds((prev) => {
      const next = new Set(prev)
      uniqueIds.forEach((id) => next.add(id))
      return next
    })

    try {
      const { succeeded: deletedIds, failedIds, firstError } = await runInChunks(
        uniqueIds,
        async (id) => {
          const res = await adminFetch(`/api/admin/leads/${id}`, { method: "DELETE" })
          await readAdminResponse<{ ok: true }>(res, "리드를 삭제하지 못했습니다.")
          return id
        },
        { fallbackMessage: "리드를 삭제하지 못했습니다." }
      )

      if (deletedIds.length > 0) {
        const deletedIdSet = new Set(deletedIds)
        setLeads((prev) => prev.filter((lead) => !deletedIdSet.has(lead.id)))
        // 드로어가 보여주던 리드가 삭제 대상에 포함되면 closeSelectedLead()로 닫는다 — 그냥
        // setSelected(null)만 하면 closeSelectedLead의 url.searchParams.delete("lead")를 타지
        // 않아 이미 삭제된 리드를 가리키는 ?lead= 가 주소창에 남는다(리뷰 발견 1). selected가
        // (드물게) 이 클로저와 어긋나는 경우를 대비해 함수형 폴백도 유지한다.
        if (selected && deletedIdSet.has(selected.id)) {
          closeSelectedLead()
        } else {
          setSelected((prev) => (prev && deletedIdSet.has(prev.id) ? null : prev))
        }
        setSelectedLeadIds((prev) => {
          const next = new Set(prev)
          deletedIds.forEach((id) => next.delete(id))
          return next
        })
        // 행이 사라졌으니 포커스를 목록 섹션으로 옮긴다 — 사라진 버튼에 남은 포커스는 body로 떨어진다.
        listSectionRef.current?.focus({ preventScroll: true })
      }

      if (failedIds.length > 0) {
        reportBulkFailure("삭제", deletedIds.length, failedIds, firstError, "리드를 삭제하지 못했습니다.")
        return
      }

      showToast(options?.successMessage ?? `${deletedIds.length}개 리드를 삭제했습니다.`)
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        uniqueIds.forEach((id) => next.delete(id))
        return next
      })
    }
  }

  const requestBulkStatus = (ids: string[], status: LeadStatus) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return
    if (status === "closed") {
      setCloseLeadsRequest({ ids: uniqueIds })
      return
    }
    void handleBulkStatus(uniqueIds, status)
  }

  const runCloseLeadsRequest = async () => {
    if (!closeLeadsRequest || closeLeadsBusy) return
    setCloseLeadsBusy(true)
    try {
      await handleBulkStatus(closeLeadsRequest.ids, "closed")
    } finally {
      // 삭제 플로우와 동일하게 finally에서만 요청을 비운다 — 다이얼로그가 처리가 끝날 때까지
      // 열려 있어야 그 사이의 loading={closeLeadsBusy}이 실제로 화면에 보인다(리뷰 발견 2).
      setCloseLeadsBusy(false)
      setCloseLeadsRequest(null)
    }
  }

  const runBulkAssignRequest = async () => {
    if (!bulkAssignRequest || bulkAssignBusy) return
    const request = bulkAssignRequest
    setBulkAssignBusy(true)
    try {
      await runBulkAssign(request.ids, request.ownerKey, request.preview)
    } finally {
      setBulkAssignBusy(false)
      setBulkAssignRequest(null)
    }
  }

  // 삭제 진입점 — 행 액션·드로어·벌크 바 전부 여기를 거친다. 다이얼로그의 onConfirm이 실제 실행.
  const requestDeleteMany = (ids: string[], options?: { successMessage?: string }) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return
    setDeleteLeadsRequest({ ids: uniqueIds, successMessage: options?.successMessage })
  }

  const runDeleteLeadsRequest = async () => {
    if (!deleteLeadsRequest || deleteLeadsBusy) return
    setDeleteLeadsBusy(true)
    try {
      await handleDeleteMany(deleteLeadsRequest.ids, { successMessage: deleteLeadsRequest.successMessage })
    } finally {
      setDeleteLeadsBusy(false)
      setDeleteLeadsRequest(null)
    }
  }

  const handleDelete = (id: string) => {
    requestDeleteMany([id], { successMessage: "리드가 삭제되었습니다." })
  }

  const deferredSearch = useDeferredValue(searchQuery)

  // 시간 버킷(24h/48h·오늘/지연 판정)이 렌더마다 흔들리지 않도록 now를 틱으로 고정한다.
  // 숨은 탭에서는 아무도 안 보는 재계산이므로 틱을 멈추고, 돌아오면 즉시 한 번 맞춘 뒤 재개한다.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const stop = () => {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }
    const start = () => {
      if (timer) return
      timer = setInterval(() => setNowMs(Date.now()), NOW_TICK_MS)
    }
    const handleVisibility = () => {
      if (document.hidden) {
        stop()
        return
      }
      setNowMs(Date.now())
      start()
    }

    if (!document.hidden) start()
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [])

  // 리드 파생 집계 — 렌더마다 재계산하지 않도록 입력(리드·필터·지연검색·now틱)에만 반응해 memo한다.
  // 계산 내용·필터 의미·유입 패싯 카운트 규칙은 이전과 동일. 선택(selectedLeadIds)·삭제중(deletingIds)
  // 상태 의존 값만 memo 밖에서 계산해, 체크박스 토글이 보드 전체 재계산을 유발하지 않게 한다.
  const {
    now,
    today,
    unconfirmedLeads,
    activeLeads,
    sourceDetailOptions,
    leadMagnetOptions,
    sourceGroupChips,
    sourceChipTotal,
    filtered,
    filteredIds,
    overdueFollowUps,
    stalledLeads,
    pipelineRiskLeads,
    stageSummaries,
    stageTotal,
    ownerSummaries,
    filterCards,
    todayFollowUpCount,
    priorityMap,
    lensCounts,
    trackingScopeLeads,
    hiddenUnconfirmedCount,
    boardColumns,
    boardTotals,
    boardFocus,
    boardCrossFilter,
  } = useMemo(() => {
    const now = new Date(nowMs)
    const today = toLocalDateKey(now)
    // 우선순위는 리드 전체에 대해 한 번만 계산하고 정렬·행 표시·요약이 같은 Map을 본다.
    // (activitySummary가 늦게 도착하면 그때 한 번 더 계산 — 그 사이에도 유입 신호만으로 순서가 선다.)
    const priorityMap = new Map<string, LeadPriority>()
    for (const lead of leads) {
      priorityMap.set(lead.id, calcLeadPriority(lead, getEngagement(activitySummary, lead.id), nowMs))
    }
    // 렌즈가 모집단을 먼저 자른다 — 아래 상태·유입·검색 필터는 전부 이 집합 위에서 돈다.
    const marketingLeads = leads.filter(isMarketingLead)
    const lensCounts = { all: leads.length, marketing: marketingLeads.length }
    const lensLeads = lens === "marketing" ? marketingLeads : leads
    // 미확인(공개 채널, 검토 전) 리드는 별도 수신함으로 취급 — "활성/단계별" 집계에서 제외해
    // 실제로 다루고 있는 리드 수만 반영한다. 응대 SLA(미응답 큐)는 확인 여부와 무관하게 잡는다.
    const confirmedLeads = lensLeads.filter((l) => !isUnconfirmedLead(l))
    const activeLeads = confirmedLeads.filter((l) => isActiveLead(l.status))
    const sourceDetailOptions = Array.from(
      new Set(lensLeads.map((lead) => getLeadSourceDetail(lead)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "ko"))
    const leadMagnetOptions = Array.from(
      new Set(lensLeads.map((lead) => lead.lead_magnet?.trim()).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b, "ko"))
    const searchTokens = tokenizeLeadSearch(deferredSearch)
    // 상태와 직교하는 범위 축 한 벌. 유입 칩·트래킹 롤업·미확인 수신함이 같은 판정을 본다
    // (규칙 정본: lib/crm/leads-board-state.matchesLeadScopeFilters).
    const scopeCriteria: LeadScopeCriteria = {
      sourceGroup,
      sourceDetail: sourceDetailFilter,
      channelSource,
      leadMagnet: leadMagnetFilter,
      trackingDimension,
      trackingKey,
      searchTokens,
    }
    // 수신함·게이트 배지가 세는 모집단 — 지금 화면이 보고 있는 범위 그대로.
    const unconfirmedLeads = selectScopedUnconfirmedLeads(lensLeads, scopeCriteria)
    // 상태별 필터 술어 — 목록·필터 카드 카운트가 같은 판정을 공유한다(카운트≠목록 어긋남 방지).
    const matchesStatusFilter = (lead: LeadRecord, key: LeadFilter) => {
      if (key === "all") return true
      if (key === "unconfirmed") return isUnconfirmedLead(lead)
      if (key === "unresponded") return isUnrespondedLead(lead)
      if (key === "unresponded_24h") return isUnrespondedLead(lead) && hoursBetween(lead.timestamp, now) >= 24
      if (key === "unresponded_48h") return isUnrespondedLead(lead) && hoursBetween(lead.timestamp, now) >= 48
      if (key === "unassigned") return isActiveLead(lead.status) && !lead.assigned_to?.trim()
      return lead.status === key
    }
    // 상태 외 필터(유입·세부유입·채널·마그넷·트래킹·검색) 술어 — 필터 카드·유입 칩 카운트가
    // "그 카드를 눌렀을 때 실제로 보게 될 건수"를 보여주기 위해 공유한다.
    const matchesSubFilters = (lead: LeadRecord, options?: { skipSourceGroup?: boolean }) =>
      matchesLeadScopeFilters(lead, scopeCriteria, options)
    // 상태/SLA 필터까지만 적용한 중간 집합 — 아래 유입·검색 필터는 이 집합 위에서 돈다.
    const statusFiltered = lensLeads.filter((lead) => {
      // 응대 SLA 큐·미확인 큐가 아니면 검토 전 리드는 기본 화면에서 숨긴다("미확인 포함"으로 해제).
      if (!includeUnconfirmed && !CONFIRMATION_GATE_EXEMPT_FILTERS.has(filter) && isUnconfirmedLead(lead))
        return false
      return matchesStatusFilter(lead, filter)
    })
    // 유입 칩 — 자신(유입 그룹)을 뺀 나머지 활성 필터를 모두 적용한 패싯 카운트.
    // 칩 숫자와 "그 칩을 눌렀을 때의 목록 건수"가 일치한다(검색 중 과대 집계 방지).
    const chipScope = statusFiltered.filter((lead) => matchesSubFilters(lead, { skipSourceGroup: true }))
    const sourceGroupCounts = new Map<LeadSourceGroup, number>()
    for (const lead of chipScope) {
      const group = getLeadSourceGroup(lead)
      sourceGroupCounts.set(group, (sourceGroupCounts.get(group) ?? 0) + 1)
    }
    const sourceChipTotal = chipScope.length
    const sourceGroupChips = SOURCE_GROUP_ORDER
      .map((group) => ({ group, label: SOURCE_GROUP_LABEL[group], count: sourceGroupCounts.get(group) ?? 0 }))
      // 현재 상태 뷰에 존재하는 묶음만 노출하되, 이미 선택한 그룹은 0건이어도 남겨 해제할 수 있게 한다.
      .filter((chip) => chip.count > 0 || chip.group === sourceGroup)
    // 트래킹 롤업이 보는 집합 — 렌즈+상태+유입+검색까지. 롤업 행을 고르면 여기서 한 겹 더 좁힌다.
    // (트래킹 키 자체는 제외 — 롤업 표가 키별 건수를 보여주는 모집단이므로.)
    const trackingScopeLeads = statusFiltered.filter((lead) =>
      matchesLeadScopeFilters(lead, scopeCriteria, { skipTracking: true })
    )
    const filtered = sortLeads(
      trackingKey
        ? trackingScopeLeads.filter(
            (lead) => getLeadTrackingKey(lead, trackingDimension) === trackingKey
          )
        : trackingScopeLeads,
      sortKey,
      { engagements: activitySummary, priorities: priorityMap, nowMs }
    )
    const todayFollowUps = lensLeads.filter((l) =>
      l.follow_up_at && toLocalDateKey(l.follow_up_at) === today && isActiveLead(l.status)
    )
    const overdueFollowUps = lensLeads.filter((l) =>
      l.follow_up_at && toLocalDateKey(l.follow_up_at) < today && isActiveLead(l.status)
    )
    const stalledLeads = activeLeads.filter((lead) => {
      const createdDays = daysBetween(lead.timestamp)
      const followUpKey = lead.follow_up_at ? toLocalDateKey(lead.follow_up_at) : null
      return createdDays >= 7 && (!followUpKey || followUpKey < today)
    })
    // 두 배열을 매 리드마다 선형 탐색하면 활성 리드 수의 제곱으로 늘어난다(3천 건이면 수백만 비교).
    // 이 memo는 60초 틱과 모든 필터 변경마다 다시 도므로 id Set으로 한 번만 색인한다.
    const riskIds = new Set<string>()
    for (const lead of stalledLeads) riskIds.add(lead.id)
    for (const lead of overdueFollowUps) riskIds.add(lead.id)
    const pipelineRiskLeads = [...activeLeads]
      .filter((lead) => riskIds.has(lead.id))
      .sort((a, b) => {
        const aFollowUp = a.follow_up_at ? toLocalDateKey(a.follow_up_at) : null
        const bFollowUp = b.follow_up_at ? toLocalDateKey(b.follow_up_at) : null
        const aOverdueDays = aFollowUp && aFollowUp < today ? daysBetween(a.follow_up_at!) : 0
        const bOverdueDays = bFollowUp && bFollowUp < today ? daysBetween(b.follow_up_at!) : 0
        return bOverdueDays - aOverdueDays || daysBetween(b.timestamp) - daysBetween(a.timestamp)
      })
      .slice(0, 5)
    const stageSummaries = (Object.keys(STATUS_LABEL) as LeadStatus[]).map((status) => {
      const stageLeads = confirmedLeads.filter((lead) => lead.status === status)
      const stageOverdue = stageLeads.filter((lead) => lead.follow_up_at && toLocalDateKey(lead.follow_up_at) < today && isActiveLead(lead.status)).length
      const highScore = stageLeads.filter((lead) => calcScore(lead) >= 70).length
      return { status, count: stageLeads.length, stageOverdue, highScore }
    })
    const ownerSummaries = Array.from(
      activeLeads.reduce((acc, lead) => {
        const owner = getLeadOwner(lead)
        const current = acc.get(owner) ?? { owner, total: 0, newCount: 0, contactedCount: 0, unrespondedCount: 0, overdueCount: 0, highScoreCount: 0 }
        current.total += 1
        if (lead.status === "new") current.newCount += 1
        if (lead.status === "contacted") current.contactedCount += 1
        if (isUnrespondedLead(lead)) current.unrespondedCount += 1
        if (lead.follow_up_at && toLocalDateKey(lead.follow_up_at) < today) current.overdueCount += 1
        if (calcScore(lead) >= 70) current.highScoreCount += 1
        acc.set(owner, current)
        return acc
      }, new Map<string, { owner: string; total: number; newCount: number; contactedCount: number; unrespondedCount: number; overdueCount: number; highScoreCount: number }>())
        .values()
    ).sort((a, b) => b.total - a.total || b.overdueCount - a.overdueCount)
    // 카드 숫자는 "그 카드를 눌렀을 때 목록에 실제로 뜨는 건수" — 검색어·유입·마그넷 등
    // 나머지 활성 필터를 그대로 얹어 센다. 카드별 확인 게이트도 클릭 후와 같은 규칙을 쓴다.
    const countForFilter = (key: LeadFilter) =>
      lensLeads.filter((lead) => {
        if (!includeUnconfirmed && !CONFIRMATION_GATE_EXEMPT_FILTERS.has(key) && isUnconfirmedLead(lead)) return false
        return matchesStatusFilter(lead, key) && matchesSubFilters(lead)
      }).length
    const filterCards: Array<{ key: LeadFilter; label: string; count: number }> = [
      { key: "all", label: "전체", count: countForFilter("all") },
      { key: "unconfirmed", label: "미확인", count: countForFilter("unconfirmed") },
      { key: "new", label: "신규", count: countForFilter("new") },
      { key: "unresponded", label: "응대 전", count: countForFilter("unresponded") },
      { key: "unresponded_24h", label: "24h+", count: countForFilter("unresponded_24h") },
      { key: "unresponded_48h", label: "48h+", count: countForFilter("unresponded_48h") },
      { key: "unassigned", label: "미배정", count: countForFilter("unassigned") },
      { key: "contacted", label: "연락중", count: countForFilter("contacted") },
      { key: "converted", label: "전환", count: countForFilter("converted") },
      { key: "closed", label: "종료", count: countForFilter("closed") },
    ]
    // ─── 보드 뷰 ────────────────────────────────────────────────
    // 상태 축 필터(신규·연락중·전환·종료·미확인)는 보드에서 행을 지우지 않고 컬럼 포커스로
    // 강등한다 — 그대로 AND로 걸면 5컬럼 중 4개가 설명 없이 빈다(설계 §2).
    // 그래서 컬럼 모집단은 상태 필터를 뺀 집합이고, 직교 필터(시간·배정)만 그 위에 AND로 걸린다.
    //
    // 확인 게이트는 여기서 걸지 않는다. 미확인 리드는 resolveBoardColumn 이 '미확인' 컬럼으로
    // 보내고 그 컬럼만 게이트 밖이라는 배지를 단다 — 콘솔의 includeUnconfirmed 토글은 건드리지 않는다.
    const boardPopulation = lensLeads.filter((lead) => matchesSubFilters(lead))
    const boardCrossFilter = appliesAcrossBoardColumns(filter)
    const boardTotals = (() => {
      const partitioned = partitionLeadsToBoardColumns(boardPopulation)
      return Object.fromEntries(
        (Object.keys(partitioned) as BoardColumnKey[]).map((key) => [key, partitioned[key].length])
      ) as Record<BoardColumnKey, number>
    })()
    const boardColumns = partitionLeadsToBoardColumns(
      sortLeads(
        boardCrossFilter
          ? boardPopulation.filter((lead) => matchesStatusFilter(lead, filter))
          : boardPopulation,
        sortKey,
        { engagements: activitySummary, priorities: priorityMap, nowMs }
      )
    )
    const boardFocus = resolveBoardColumnFocus(filter)

    // 숫자 진입점은 아래 필터 카운트 카드로 단일화 — 여기서 별도 카드 배열을 만들지 않는다.
    // 필터 카드에 없는 "오늘 예정"(팔로업)만 큐 패널 헤더 배지로 노출한다.
    // 비율 바의 분모 — 네 단계 합(= 확인 완료 리드 수). activeLeads 는 전환·종료를 빼므로 분모가 아니다.
    const stageTotal = stageSummaries.reduce((sum, stage) => sum + stage.count, 0)
    const todayFollowUpCount = todayFollowUps.length
    const filteredIds = filtered.map((lead) => lead.id)
    // 지금 게이트에 걸려 안 보이는 미확인 리드 수 — 숫자를 숨기지 않고 토글 옆에 그대로 붙인다.
    const hiddenUnconfirmedCount =
      !includeUnconfirmed && !CONFIRMATION_GATE_EXEMPT_FILTERS.has(filter)
        ? unconfirmedLeads.length
        : 0
    return {
      now,
      today,
      unconfirmedLeads,
      activeLeads,
      sourceDetailOptions,
      leadMagnetOptions,
      sourceGroupChips,
      sourceChipTotal,
      filtered,
      filteredIds,
      overdueFollowUps,
      stalledLeads,
      pipelineRiskLeads,
      stageSummaries,
      stageTotal,
      ownerSummaries,
      filterCards,
      todayFollowUpCount,
      priorityMap,
      lensCounts,
      trackingScopeLeads,
      hiddenUnconfirmedCount,
      boardColumns,
      boardTotals,
      boardFocus,
      boardCrossFilter,
    }
  }, [
    leads,
    activitySummary,
    lens,
    sortKey,
    includeUnconfirmed,
    trackingDimension,
    trackingKey,
    filter,
    sourceGroup,
    sourceDetailFilter,
    channelSource,
    leadMagnetFilter,
    deferredSearch,
    nowMs,
  ])

  // 더보기(클라 배열 슬라이싱) — 모바일 카드·데스크톱 테이블이 공유한다.
  const {
    visible: visibleLeadCount,
    showMore: showMoreLeads,
    collapse: collapseLeads,
    canMore: canMoreLeads,
    canCollapse: canCollapseLeads,
  } = useVisibleCount(filtered.length, LEAD_BOARD_LIST_STEP)

  // 필터(응대 큐/소스/채널/리드마그넷/검색어)가 바뀌면 새 결과셋의 맨 위(초기 50건)부터
  // 다시 보여준다 — 이전 필터에서 펼친 범위가 무관한 결과에 남지 않도록.
  useEffect(() => {
    collapseLeads()
  }, [
    lens,
    includeUnconfirmed,
    trackingKey,
    filter,
    sourceGroup,
    sourceDetailFilter,
    channelSource,
    leadMagnetFilter,
    searchQuery,
    collapseLeads,
  ])

  // 벌크 선택은 전량 초기화 대신 "현재 결과에 남아 있는 것"만 남긴다 — 검색으로 좁혀 몇 건
  // 고른 뒤 조건을 되돌려도 선택이 살아남되, 필터 밖으로 사라진 리드가 벌크 삭제/전환 대상에
  // 남는 일(데이터 손실 위험)은 없다. next ⊆ prev이므로 크기가 같으면 내용도 같다.
  useEffect(() => {
    setSelectedLeadIds((prev) => {
      if (prev.size === 0) return prev
      const allowed = new Set(filteredIds)
      const next = new Set(Array.from(prev).filter((id) => allowed.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [filteredIds])

  // 헤더 체크박스는 "화면에 그려진 행"만 다룬다 — 더보기로 잘린 화면 밖 수백 건이
  // 보이지 않게 선택되는 함정을 막는다. 결과 전체 선택은 벌크 바의 명시 버튼으로만.
  const visibleIds = useMemo(
    () => filtered.slice(0, visibleLeadCount).map((lead) => lead.id),
    [filtered, visibleLeadCount]
  )
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedLeadIds.has(id))
  const selectedVisibleCount = visibleIds.filter((id) => selectedLeadIds.has(id)).length
  const selectedFilteredCount = filteredIds.filter((id) => selectedLeadIds.has(id)).length
  const selectedAssignmentProfile = useMemo(() => {
    if (selectedLeadIds.size === 0) return null
    return buildLeadAssignmentProfile(
      filtered.filter((lead) => selectedLeadIds.has(lead.id)),
      nowMs
    )
  }, [filtered, nowMs, selectedLeadIds])
  const assignmentPreviewOtherBlockers = assignmentPreview
    ? assignmentPreview.blockerCounts.test_lead +
      assignmentPreview.blockerCounts.partial_duplicate_cohort +
      assignmentPreview.blockerCounts.stale_30d +
      assignmentPreview.blockerCounts.missing_contact +
      assignmentPreview.blockerCounts.already_assigned +
      assignmentPreview.blockerCounts.inactive +
      assignmentPreview.blockerCounts.missing
    : 0
  const assignmentApplyReady = Boolean(
    assignmentPreview &&
      assignmentPreview.rosterHealthy &&
      assignmentPreview.requested === selectedLeadIds.size &&
      assignmentPreview.blockedLeadIds.length === 0 &&
      crmOwnerHealth?.ok === true
  )
  // 선택됐지만 현재 화면(더보기 상한) 밖에 있는 건수 — 벌크 바에 그대로 드러낸다.
  const selectedBeyondVisibleCount = selectedFilteredCount - selectedVisibleCount
  const selectedDeleting = Array.from(selectedLeadIds).some((id) => deletingIds.has(id))
  const selectedUnconfirmedIds = useMemo(() => {
    if (selectedLeadIds.size === 0) return [] as string[]
    const byId = new Map(filtered.map((lead) => [lead.id, lead]))
    return Array.from(selectedLeadIds).filter((id) => {
      const lead = byId.get(id)
      return lead ? isUnconfirmedLead(lead) : false
    })
  }, [selectedLeadIds, filtered])
  const handleToggleLeadSelection = (id: string, checked: boolean) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleToggleVisibleSelection = (checked: boolean) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev)
      visibleIds.forEach((id) => {
        if (checked) next.add(id)
        else next.delete(id)
      })
      return next
    })
  }

  const handleToggleFilteredSelection = (checked: boolean) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev)
      filteredIds.forEach((id) => {
        if (checked) next.add(id)
        else next.delete(id)
      })
      return next
    })
  }

  // 현재 필터·검색 결과를 CSV로 — 시트로 옮겨 돌리던 수작업(전화 리스트, 캠페인 보고)의 출구.
  const handleExportCsv = () => {
    if (filtered.length === 0) {
      showToast("내보낼 리드가 없습니다.", "error")
      return
    }
    const headers = ["이름", "기관", "전화", "이메일", "상태", "유입 그룹", "세부 유입", "리드마그넷", "담당자", "등록일", "팔로업", "점수", "메모"]
    const escapeCsv = (value: unknown) => {
      const text = value == null ? "" : String(value)
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }
    const lines = [headers.join(",")]
    for (const lead of filtered) {
      lines.push(
        [
          lead.name,
          lead.org,
          lead.phone,
          lead.email,
          STATUS_LABEL[lead.status],
          SOURCE_GROUP_LABEL[getLeadSourceGroup(lead)],
          getLeadSourceDetail(lead),
          lead.lead_magnet ? getLeadMagnetLabel(lead.lead_magnet) : "",
          lead.assigned_to,
          new Date(lead.timestamp).toLocaleString("ko-KR"),
          lead.follow_up_at ? new Date(lead.follow_up_at).toLocaleDateString("ko-KR") : "",
          calcScore(lead),
          lead.notes,
        ]
          .map(escapeCsv)
          .join(",")
      )
    }
    // BOM — 한글 헤더가 Excel에서 깨지지 않게.
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `leads-${toLocalDateKey(new Date())}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    showToast(`${filtered.length}건을 CSV로 내보냈습니다.`)
  }

  // 보드에서는 상태 축 카드(미확인·신규·연락중·전환·종료)를 내린다 — 바로 아래 컬럼이 같은 축을
  // 이미 그리고 있어 한 화면에 두 번 나온다. 그 자리는 컬럼 헤더 클릭(포커스)이 대신하고,
  // 카드로 남는 건 컬럼을 가로지르는 직교 축(응대·배정)뿐이다.
  const visibleFilterCards =
    view === "console"
      ? filterCards
      : filterCards.filter((item) => item.key === "all" || appliesAcrossBoardColumns(item.key))

  return (
    <div
      data-admin-crm
      aria-busy={
        loading ||
        bulkWorking ||
        deletingIds.size > 0 ||
        confirmingIds.size > 0 ||
        statusUpdatingIds.size > 0 ||
        convertingIds.size > 0
      }
      className="[&_a]:min-h-11 [&_a]:focus-visible:outline-none [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-[#084734] [&_a]:focus-visible:ring-offset-2 [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-[#084734] [&_button]:focus-visible:ring-offset-2 [&_input:not([type=checkbox])]:min-h-11 [&_input]:focus-visible:outline-none [&_input]:focus-visible:ring-2 [&_input]:focus-visible:ring-[#084734] [&_input]:focus-visible:ring-offset-1 [&_select]:min-h-11 [&_select]:focus-visible:outline-none [&_select]:focus-visible:ring-2 [&_select]:focus-visible:ring-[#084734] [&_select]:focus-visible:ring-offset-1 [&_textarea]:min-h-11 [&_textarea]:focus-visible:outline-none [&_textarea]:focus-visible:ring-2 [&_textarea]:focus-visible:ring-[#084734] [&_textarea]:focus-visible:ring-offset-1 sm:[&_a]:min-h-0 sm:[&_button]:min-h-0 sm:[&_button]:min-w-0 sm:[&_input:not([type=checkbox])]:min-h-0 sm:[&_select]:min-h-0"
    >
      <div className="sr-only" role="status" aria-live="polite">
        {loading
          ? "리드 목록을 불러오는 중입니다."
          : bulkWorking ||
              deletingIds.size > 0 ||
              confirmingIds.size > 0 ||
              statusUpdatingIds.size > 0 ||
              convertingIds.size > 0
            ? "리드 변경사항을 저장하는 중입니다."
            : ""}
      </div>
      {/* 헤더 */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">리드</h1>
          {/* 뷰 축은 제목 아래 — 액션 줄에 섞으면 CSV·리드 등록과 같은 무게가 된다.
              전환은 어떤 상태도 리셋하지 않고, 같은 filter 를 뷰마다 다르게 해석할 뿐이다. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="리드 보기 방식"
            className="inline-flex rounded-lg border border-[#e8e8e4] bg-white p-0.5"
          >
            {([
              { key: "console", label: "콘솔", icon: <ListIcon className="h-3.5 w-3.5" /> },
              { key: "board", label: "보드", icon: <Columns3 className="h-3.5 w-3.5" /> },
            ] as const).map((option) => (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={view === option.key}
                onClick={() => setView(option.key)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors ${
                  view === option.key ? "bg-[#111110] text-white" : "text-[#1a1a1a]/55 hover:text-[#111110]"
                }`}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
          {/* 보드에서만: 모집단 축(전체/마케팅)을 헤더로 끌어올린다. */}
          {view === "board" ? (
            <div className="inline-flex rounded-lg border border-[#e8e8e4] bg-white p-0.5">
              {LENS_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  title={option.hint}
                  aria-pressed={lens === option.key}
                  onClick={() => setLens(option.key)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors ${
                    lens === option.key ? "bg-[#f0f0ec] text-[#111110]" : "text-[#1a1a1a]/45 hover:text-[#111110]"
                  }`}
                >
                  {option.label}
                  <span className="tabular-nums text-[#1a1a1a]/40">
                  {lensCounts[option.key].toLocaleString("ko-KR")}
                  </span>
                  </button>
              ))}
            </div>
          ) : null}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* 갱신 시각·새로고침은 목록 위 신선도 캡션(FreshnessCaption)으로 옮겼다(P2) — 같은 동작을 두 곳에 두지 않는다. */}
          <button
            type="button"
            onClick={() => setLeadModalOpen(true)}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 sm:flex-none"
          >
            <UserPlus className="h-3.5 w-3.5" />
            리드 등록
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            title="현재 필터·검색 조건의 결과를 CSV 파일로 내려받습니다."
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:border-[#c8c8c4] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* 로드 실패 배너 — 이전 데이터가 화면에 남아 있어도 지금 실패했음을 숨기지 않는다. */}
      {loadError && leads.length > 0 ? (
        <div role="alert" aria-live="assertive" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-2.5">
          <p className="text-[12px] font-medium text-[#B85C33]">
            새로고침 실패 — 표시 중인 목록은 이전에 불러온 데이터입니다. ({loadError})
          </p>
          <button
            type="button"
            onClick={() => void fetchLeads({ force: true })}
            className="rounded-lg border border-[#F6D5C5] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#B85C33] transition-colors hover:bg-[#FEF8F5]"
          >
            다시 시도
          </button>
        </div>
      ) : null}

      {/* 모아보기 렌즈 — 목록의 모집단을 정하는 최상위 축. 아래 상태·유입·검색 필터가 이 위에서 돈다.
          보드에서는 전폭 바 대신 헤더의 컴팩트 컨트롤이 같은 일을 한다 — 넓은 면을 채우는 요소를
          컬럼과 경쟁시키지 않는다(DESIGN.md: 넓은 면은 뉴트럴, 채움은 액센트에만). */}
      {view === "console" && (
      <div className="mb-4 flex flex-col gap-1.5 rounded-2xl border border-[#e8e8e4] bg-white p-2 sm:flex-row sm:items-stretch">
        {LENS_OPTIONS.map((option) => {
          const active = lens === option.key
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setLens(option.key)}
              aria-pressed={active}
              className={`flex flex-1 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left transition-colors ${
                active ? "bg-[#111110] text-white" : "hover:bg-[#fafaf8]"
              }`}
            >
              <span className={active ? "text-white" : "text-[#1a1a1a]/35"}>
                {option.key === "all" ? <Layers className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold">{option.label}</span>
                  <span className="text-[14px] font-bold tabular-nums">
                    {lensCounts[option.key].toLocaleString("ko-KR")}
                  </span>
                </span>
                <span className={`mt-0.5 block truncate text-[11px] ${active ? "text-white/55" : "text-[#1a1a1a]/40"}`}>
                  {option.hint}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      )}

      {/* 마케팅 렌즈에서는 단계·담당자 카드 자리를 트래킹 롤업이 대신한다(패널을 더하지 않고 바꿔 끼운다). */}
      {/* 보드 뷰에서는 단계가 컬럼으로 서므로 이 패널들을 내린다 — 같은 축을 두 번 그리지 않는다. */}
      {view !== "console" ? null : lens === "marketing" ? (
        <LeadTrackingPanel
          leads={trackingScopeLeads}
          dimension={trackingDimension}
          onDimensionChange={setTrackingDimension}
          activeKey={trackingKey}
          onSelectKey={setTrackingKey}
        />
      ) : (
      <StageOwnerPanels
        stageSummaries={stageSummaries}
        stageTotal={stageTotal}
        activeCount={activeLeads.length}
        ownerSummaries={ownerSummaries}
        todayFollowUpCount={todayFollowUpCount}
        onSelectStage={(status) => setFilter(status)}
      />
      )}

      {/* 미확인 수신함 — 공개 폼(문의·데모·뉴스레터 등) 원본 유입. 확인해야 아래 리드 목록에 반영된다. */}
      {view === "console" && unconfirmedLeads.length > 0 && (
        <UnconfirmedInbox
          unconfirmedLeads={unconfirmedLeads}
          confirmingIds={confirmingIds}
          onShowAll={() => setFilter("unconfirmed")}
          onConfirmMany={(ids) => requestConfirmMany(ids)}
          onSelect={setSelected}
        />
      )}

      {view === "console" && pipelineRiskLeads.length > 0 && (
        <PipelineRiskPanel
          pipelineRiskLeads={pipelineRiskLeads}
          overdueCount={overdueFollowUps.length}
          stalledCount={stalledLeads.length}
          today={today}
          onFilterContacted={() => setFilter("contacted")}
          onSelect={setSelected}
        />
      )}

      {/* 필터 카운트 카드 — 숫자로 들어가는 단일 창구 */}
      <div
        className={
          view === "console"
            ? "mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5 xl:grid-cols-10"
            : // 보드에서는 5분할이라 셀 하나가 콘솔의 두 배 폭이 된다 — 활성 셀의 검은 채움이
              // 컬럼보다 넓어지므로, 늘리지 않고 내용 폭(140px)에 맞춘 스트립으로 둔다.
              "mb-4 flex flex-wrap gap-2"
        }
      >
        {visibleFilterCards.map((item) => {
          const isActive = filter === item.key
          // 게이트 면제 필터는 미확인 리드까지 세므로 '전체'와 분모가 다르다 — 그래서
          // 전체 107 옆에 응대 전 188 이 설 수 있다. 숫자만 키우면 고장으로 읽히니 표식을 단다.
          // '미확인 포함'이 켜지면 모든 카드가 같은 모집단을 세므로 표식도 사라진다.
          const offGate = !includeUnconfirmed && CONFIRMATION_GATE_EXEMPT_FILTERS.has(item.key)
          // 숫자 색이 곧 위계 — 응대 지연은 붉게, 미검토는 노랗게, 나머지는 중립.
          const tone =
            item.count === 0
              ? "text-[#1a1a1a]/30"
              : item.key === "unresponded" || item.key === "unresponded_24h" || item.key === "unresponded_48h"
                ? "text-[#B85C33]"
                : item.key === "unconfirmed"
                  ? "text-[#7A520F]"
                  : "text-[#111110]"
          return (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              aria-pressed={isActive}
              title={offGate ? `${item.label} — 확인 게이트 밖(미확인) 리드까지 포함한 수` : undefined}
              className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                view === "console" ? "min-h-[72px]" : "min-h-[64px] w-[140px]"
              } ${
                isActive ? "border-[#111110] bg-[#111110] text-white" : "border-[#e8e8e4] bg-white hover:border-[#c8c8c4] hover:shadow-sm"
              }`}
            >
              <p className={`text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums ${isActive ? "text-white" : tone}`}>
                {item.count.toLocaleString("ko-KR")}
              </p>
              <p className={`mt-1.5 flex items-center gap-1 text-[11px] font-medium ${isActive ? "text-white/60" : "text-[#1a1a1a]/45"}`}>
                {item.label}
                {offGate ? (
                  <span
                    aria-hidden
                    className="inline-block h-[5px] w-[5px] shrink-0 rounded-full"
                    style={{ backgroundColor: isActive ? "rgba(255,255,255,0.55)" : "#ECD29C" }}
                  />
                ) : null}
              </p>
            </button>
          )
        })}
      </div>

      {/* 유입 칩 + 검색/정렬 — 보드에서는 박스 크롬을 걷어 컬럼과 상자가 겹쳐 보이지 않게 한다. */}
      <div
        className={`mb-4 ${
          view === "console" ? "rounded-2xl border border-[#e8e8e4] bg-white p-3" : "border-b border-[#e8e8e4] pb-3"
        }`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {sourceGroupChips.length > 0 && (
          <>
            <span className="mr-1 text-[11px] font-medium text-[#1a1a1a]/40">유입</span>
            <button
              type="button"
              onClick={() => setSourceGroup("all")}
              aria-pressed={sourceGroup === "all"}
              className={`inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors ${
                sourceGroup === "all"
                  ? "bg-[#111110] text-white"
                  : "border border-[#e8e8e4] bg-white text-[#111110] hover:border-[#c8c8c4]"
              }`}
            >
              전체
              <span className={`tabular-nums ${sourceGroup === "all" ? "text-white/55" : "text-[#1a1a1a]/40"}`}>
                {sourceChipTotal}
              </span>
            </button>
            {sourceGroupChips.map((chip) => {
              const active = sourceGroup === chip.group
              return (
                <button
                  key={chip.group}
                  type="button"
                  onClick={() => setSourceGroup(active ? "all" : chip.group)}
                  aria-pressed={active}
                  className={`inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors ${
                    active
                      ? "bg-[#111110] text-white"
                      : "border border-[#e8e8e4] bg-white text-[#111110] hover:border-[#c8c8c4]"
                  }`}
                >
                  <SourceGroupDot group={chip.group} />
                  {chip.label}
                  <span className={`tabular-nums ${active ? "text-white/55" : "text-[#1a1a1a]/40"}`}>{chip.count}</span>
                </button>
              )
            })}
          </>
        )}
          {/* 확인 게이트 우회 — 기본은 규칙대로 숨기되, 가려진 건수를 옆에 붙여 한 번에 열 수 있게 한다. */}
          <button
            type="button"
            onClick={() => setIncludeUnconfirmed((prev) => !prev)}
            aria-pressed={includeUnconfirmed}
            title="공개 폼에서 들어와 아직 확인하지 않은 리드를 목록에 함께 표시합니다."
            className={`ml-auto inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors ${
              includeUnconfirmed
                ? "bg-[#7A520F] text-white"
                : "border border-[#e8e8e4] bg-white text-[#1a1a1a]/60 hover:border-[#c8c8c4]"
            }`}
          >
            <Check className="h-3 w-3" />
            미확인 포함
            {hiddenUnconfirmedCount > 0 ? (
              <span className="tabular-nums text-[#1a1a1a]/40">{hiddenUnconfirmedCount}</span>
            ) : null}
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_200px_200px_200px]">
          <label className="relative block md:col-span-2 xl:col-span-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/35" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              aria-label="리드 검색"
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && searchQuery) {
                  event.preventDefault()
                  setSearchQuery("")
                }
              }}
              placeholder="이름·기관·연락처·캠페인 검색 (띄어쓰기로 조건 AND, / 로 포커스)"
              className="h-11 w-full rounded-xl border border-[#e8e8e4] bg-[#fafaf8] pl-10 pr-16 text-[13px] text-[#111110] outline-none transition-colors placeholder:text-[#1a1a1a]/30 focus:border-[#c8c8c4] focus:bg-white"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("")
                  searchInputRef.current?.focus()
                }}
                aria-label="검색어 지우기"
                className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[#1a1a1a]/35 transition-colors hover:bg-[#f0f0ec] hover:text-[#111110]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>
          <div
            title={LEAD_SORT_OPTIONS.find((option) => option.key === sortKey)?.hint}
            className="flex h-11 items-center gap-2 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 transition-colors focus-within:border-[#c8c8c4] focus-within:bg-white"
          >
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/35" />
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as LeadSortKey)}
              aria-label="정렬 기준"
              className="h-full w-full bg-transparent text-[13px] text-[#111110] outline-none"
            >
              {LEAD_SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </div>
          <select
            value={sourceDetailFilter}
            aria-label="세부 유입 필터"
            onChange={(event) => setSourceDetailFilter(event.target.value)}
            className="h-11 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 text-[13px] text-[#111110] outline-none transition-colors focus:border-[#c8c8c4] focus:bg-white"
          >
            <option value="all">세부 유입 전체</option>
            {sourceDetailOptions.map((sourceDetail) => (
              <option key={sourceDetail} value={sourceDetail}>{sourceDetail}</option>
            ))}
          </select>
          <select
            value={leadMagnetFilter}
            aria-label="리드마그넷 필터"
            onChange={(event) => setLeadMagnetFilter(event.target.value)}
            className="h-11 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 text-[13px] text-[#111110] outline-none transition-colors focus:border-[#c8c8c4] focus:bg-white"
          >
            <option value="all">리드마그넷 전체</option>
            {leadMagnetOptions.map((leadMagnet) => (
              <option key={leadMagnet} value={leadMagnet}>{getLeadMagnetLabel(leadMagnet) || leadMagnet}</option>
            ))}
          </select>
        </div>
        {(sourceGroup !== "all" ||
          sourceDetailFilter !== "all" ||
          leadMagnetFilter !== "all" ||
          channelSource ||
          trackingKey ||
          searchQuery.trim()) && (
          <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-[#1a1a1a]/45">
            <span>
              현재 조건 {filtered.length}건
              {sourceGroup !== "all" ? ` · 유입 ‘${SOURCE_GROUP_LABEL[sourceGroup]}’` : ""}
              {channelSource ? ` · 채널 ‘${channelSource}’` : ""}
              {trackingKey
                ? ` · ${TRACKING_DIMENSIONS.find((item) => item.key === trackingDimension)?.label} ‘${trackingKey}’`
                : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("")
                setSourceGroup("all")
                setSourceDetailFilter("all")
                setLeadMagnetFilter("all")
                setChannelSource("")
                setTrackingKey(null)
              }}
              className="font-medium text-[#084734] hover:text-[#065c41]"
            >
              필터 초기화
            </button>
          </div>
        )}
      </div>

      {/* 목록 섹션 — 삭제 등으로 행이 사라진 뒤 포커스 착지점(tabIndex=-1). */}
      <div ref={listSectionRef} tabIndex={-1} aria-label="리드 목록" className="outline-none">
      {/* 신선도 캡션 — 필터 아래·목록 위에서 "갱신 N초 전"(P2). /api/admin/leads 는 generatedAt 이 없어 받은 시각만 적는다.
          강제 재조회(force)는 이 버튼이 유일하다. */}
      <FreshnessCaption
        className="mb-2 px-0.5"
        receivedAt={lastLoadedAt?.getTime() ?? null}
        refreshing={loading || revalidating}
        staleReason={loadError && leads.length > 0 ? "error" : null}
        onRefresh={() => void fetchLeads({ force: true })}
      />
      {/* 벌크 부분 실패 배너 — 닫기 전까지 남고, 실패한 리드만 다시 선택해 재시도할 수 있다. */}
      {bulkNotice ? (
        <CrmNoticeBanner
          tone={bulkNotice.tone}
          title={bulkNotice.title}
          message={bulkNotice.message}
          className="mb-4"
          action={
            bulkNotice.failedIds && bulkNotice.failedIds.length > 0
              ? { label: "실패 항목만 다시 선택", onClick: reselectFailedLeads, pending: bulkWorking || deletingIds.size > 0 }
              : undefined
          }
          onDismiss={() => setBulkNotice(null)}
        />
      ) : null}

      {view === "console" && selectedLeadIds.size > 0 && (
        <LeadsBulkBar
          selectedFilteredCount={selectedFilteredCount}
          selectedBeyondVisibleCount={selectedBeyondVisibleCount}
          filteredCount={filtered.length}
          selectedUnconfirmedIds={selectedUnconfirmedIds}
          selectedDeleting={selectedDeleting}
          bulkWorking={bulkWorking}
          bulkAssignOpen={bulkAssignOpen}
          bulkOwnerKey={bulkOwnerKey}
          crmOwners={crmOwners}
          crmOwnerHealth={crmOwnerHealth}
          assignmentPreview={assignmentPreview}
          assignmentPreviewLoading={assignmentPreviewLoading}
          assignmentPreviewError={assignmentPreviewError}
          assignmentPreviewOtherBlockers={assignmentPreviewOtherBlockers}
          assignmentApplyReady={assignmentApplyReady}
          selectedAssignmentProfile={selectedAssignmentProfile}
          onSelectAllFiltered={() => handleToggleFilteredSelection(true)}
          onClearSelection={() => setSelectedLeadIds(new Set())}
          onConfirmSelectedUnconfirmed={() => requestConfirmMany(selectedUnconfirmedIds)}
          onToggleAssignOpen={() => setBulkAssignOpen((open) => !open)}
          onOwnerKeyChange={setBulkOwnerKey}
          onAssign={() => void handleBulkAssign(Array.from(selectedLeadIds), bulkOwnerKey)}
          onUnassign={() => void handleBulkAssign(Array.from(selectedLeadIds), null)}
          onCloseSelected={() => requestBulkStatus(Array.from(selectedLeadIds), "closed")}
          onDeleteSelected={() => requestDeleteMany(Array.from(selectedLeadIds))}
          onSelectSafeTargets={(safeLeadIds) => setSelectedLeadIds(new Set(safeLeadIds))}
        />
      )}

      {/* Compass 브리지 장애 — 칩이 사라진 이유를 말한다(칩 없음 ≠ 마케팅팀 미접촉). */}
      {compass.down && leads.length > 0 ? <CompassBridgeDownNote className="mb-2 px-0.5" /> : null}

      {/* 목록(콘솔) ↔ 보드 — 같은 모집단을 다른 축으로 눕힌다. */}
      {view === "console" ? (
        <LeadsConsoleList
          filtered={filtered}
          totalLeadCount={leads.length}
          loading={loading}
          loadError={loadError}
          visibleLeadCount={visibleLeadCount}
          canMoreLeads={canMoreLeads}
          canCollapseLeads={canCollapseLeads}
          onShowMore={showMoreLeads}
          onCollapse={collapseLeads}
          selectedId={selected?.id}
          selectedLeadIds={selectedLeadIds}
          deletingIds={deletingIds}
          convertingIds={convertingIds}
          activitySummary={activitySummary}
          priorityMap={priorityMap}
          today={today}
          now={now}
          compassLookup={compass.lookup}
          allVisibleSelected={allVisibleSelected}
          selectedVisibleCount={selectedVisibleCount}
          visibleIds={visibleIds}
          onSelect={setSelected}
          onToggleLeadSelection={handleToggleLeadSelection}
          onToggleVisibleSelection={handleToggleVisibleSelection}
          onDelete={(id) => void handleDelete(id)}
          onConvert={(lead) => requestConvert(lead)}
          onContactAction={(lead, type) => {
            setContactDraft({ leadId: lead.id, type })
            setSelected(lead)
          }}
          onRetry={() => void fetchLeads({ force: true })}
          onOpenLeadModal={() => setLeadModalOpen(true)}
          onResetAllFilters={() => {
            setLens("all")
            setFilter("all")
            setSearchQuery("")
            setSourceGroup("all")
            setSourceDetailFilter("all")
            setLeadMagnetFilter("all")
            setChannelSource("")
            setTrackingKey(null)
          }}
        />
      ) : (
        <LeadsBoardView
          columns={boardColumns}
          totals={boardTotals}
          focus={boardFocus}
          crossColumnFilter={boardCrossFilter}
          selectedId={selected?.id}
          onSelect={setSelected}
          onFocusColumn={(key) => setFilter(key ?? "all")}
          now={now}
          compassOverlay={compass.overlay}
        />
      )}
      </div>

      {/* 드로어 */}
      {selected && (
        <LeadDrawer
          // 드로어가 열린 채로 다른 행을 클릭하면 인스턴스가 재사용된다 — 메모·담당자·팔로업이
          // useState 초기값으로만 시드되므로 A의 값이 B에 남고, 닫기 경로의 강제 blur가
          // 그 값을 B에 저장해 버린다. 리드 id를 key로 걸어 리드마다 상태를 격리한다.
          key={selected.id}
          lead={selected}
          logs={logs}
          logsLoading={logsLoading}
          events={events}
          activity={activity}
          activityLoading={activityLoading}
          initialContactForm={contactDraft?.leadId === selected.id}
          initialContactType={contactDraft?.leadId === selected.id ? contactDraft.type : undefined}
          crmOwners={crmOwners}
          crmOwnerHealth={crmOwnerHealth}
          onClose={closeSelectedLead}
          onStatusChange={handleStatus}
          onNotesChange={handleNotes}
          onFollowUpChange={handleFollowUp}
          onAssignedToChange={handleAssignedTo}
          onDelete={handleDelete}
          onAddLog={handleAddLog}
          onDeleteLog={handleDeleteLog}
          onConvert={async (lead) => { requestConvert(lead) }}
          onConfirm={async (lead) => { requestConfirmMany([lead.id]) }}
        />
      )}

      <LeadRegisterModal
        open={leadModalOpen}
        onClose={() => setLeadModalOpen(false)}
        onDone={() => void fetchLeads({ force: true })}
      />

      {/* 전환 완료 패널 — 생성/재사용된 딜·고객으로 바로 이동 */}
      {convertResult && (
        <div
          ref={convertResultPanelRef}
          className="fixed bottom-6 right-6 z-[60] w-[320px] rounded-xl border border-black/[0.08] bg-white p-4 shadow-xl"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#1a1a1a]">
                {convertResult.reused ? "이미 전환된 리드 — 기존 기록 재사용" : "CRM 전환 완료"}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/60">
                {convertResult.customerName} 고객사
                {convertResult.dealCode ? ` · ${convertResult.dealCode}` : ""}
                {convertResult.reused ? "에 연결되었습니다." : "가 등록되었습니다."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConvertResult(null)}
              aria-label="전환 결과 닫기"
              className="shrink-0 rounded-md p-1 text-[#1a1a1a]/40 transition-colors hover:bg-[#f0f0ec] hover:text-[#1a1a1a]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {convertResult.quoteUrl && (
              <Link
                href={convertResult.quoteUrl}
                onClick={() => setConvertResult(null)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#084734] px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#065c41]"
              >
                <FileText className="h-3 w-3" />
                견적 만들기
              </Link>
            )}
            <div className="flex gap-2">
              {convertResult.dealUrl && (
                <Link
                  href={convertResult.dealUrl}
                  onClick={() => setConvertResult(null)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[12px] font-semibold text-[#1a1a1a] transition-colors hover:bg-[#f6f5f4]"
                >
                  <ExternalLink className="h-3 w-3" />
                  딜 열기
                </Link>
              )}
              <Link
                href={convertResult.customerUrl}
                onClick={() => setConvertResult(null)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[12px] font-semibold text-[#1a1a1a] transition-colors hover:bg-[#f6f5f4]"
              >
                <Building2 className="h-3 w-3" />
                고객 보기
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 감사 2026-09-07 §3 — 리드 확인·전환은 되돌릴 수 없다. 단건·다건 모든 진입점을
          공용 확인 다이얼로그로 통일한다. */}
      <DeleteConfirmDialog
        open={confirmLeadsRequest !== null}
        onClose={() => setConfirmLeadsRequest(null)}
        onConfirm={() => void runConfirmLeadsRequest()}
        loading={confirmLeadsBusy}
        destructive={false}
        title="리드 확인 처리"
        description={
          confirmLeadsRequest && confirmLeadsRequest.ids.length > 1
            ? `${confirmLeadsRequest.ids.length}건을 모두 확인 처리할까요? 확인된 리드는 기본 목록에 합류합니다.`
            : "이 리드를 확인 처리할까요? 확인된 리드는 기본 목록에 합류합니다."
        }
        confirmLabel="확인 처리"
        confirmLoadingLabel="처리 중..."
        irreversibleNote="되돌릴 수 없습니다 — 확인 처리를 취소하는 기능은 없습니다."
      />
      <DeleteConfirmDialog
        open={convertLeadRequest !== null}
        onClose={() => setConvertLeadRequest(null)}
        onConfirm={() => void runConvertLeadRequest()}
        loading={convertLeadBusy}
        destructive={false}
        title="고객·거래 등록"
        description={
          convertLeadRequest
            ? `"${getLeadDisplayName(convertLeadRequest)}" 리드를 고객·거래로 전환할까요?`
            : "이 리드를 고객·거래로 전환할까요?"
        }
        confirmLabel="전환"
        confirmLoadingLabel="전환 중..."
        irreversibleNote="되돌릴 수 없습니다 — 전환 후에는 리드로 되돌릴 수 없습니다."
      />
      <DeleteConfirmDialog
        open={deleteLeadsRequest !== null}
        onClose={() => {
          if (!deleteLeadsBusy) setDeleteLeadsRequest(null)
        }}
        onConfirm={() => void runDeleteLeadsRequest()}
        loading={deleteLeadsBusy}
        title={deleteLeadsRequest && deleteLeadsRequest.ids.length > 1 ? "리드 여러 건 삭제" : "리드 삭제"}
        description={
          deleteLeadsRequest
            ? deleteLeadsRequest.ids.length > 1
              ? `${deleteLeadsRequest.ids.length}건을 완전히 삭제할까요? 대상: ${summarizeLeadNames(leads, deleteLeadsRequest.ids)}. 실수·스팸 리드 정리용입니다.`
              : `${summarizeLeadNames(leads, deleteLeadsRequest.ids)} 리드를 완전히 삭제할까요?`
            : "이 리드를 완전히 삭제할까요?"
        }
        confirmLabel={deleteLeadsRequest && deleteLeadsRequest.ids.length > 1 ? `${deleteLeadsRequest.ids.length}건 삭제` : "삭제"}
        confirmLoadingLabel="삭제 중..."
        irreversibleNote="연락 기록도 함께 삭제되며 되돌릴 수 없습니다."
      />
      <DeleteConfirmDialog
        open={closeLeadsRequest !== null}
        onClose={() => {
          if (!closeLeadsBusy) setCloseLeadsRequest(null)
        }}
        onConfirm={() => void runCloseLeadsRequest()}
        loading={closeLeadsBusy}
        destructive={false}
        title="리드 종료 처리"
        description={
          closeLeadsRequest
            ? `${closeLeadsRequest.ids.length}건을 "종료" 상태로 변경할까요? 대상: ${summarizeLeadNames(leads, closeLeadsRequest.ids)}. 활성 파이프라인에서 빠집니다.`
            : "선택한 리드를 종료 상태로 변경할까요?"
        }
        confirmLabel="종료 처리"
        confirmLoadingLabel="처리 중..."
      />
      <DeleteConfirmDialog
        open={bulkAssignRequest !== null}
        onClose={() => {
          if (!bulkAssignBusy) setBulkAssignRequest(null)
        }}
        onConfirm={() => void runBulkAssignRequest()}
        loading={bulkAssignBusy}
        destructive={false}
        title="담당자 일괄 배정"
        description={
          bulkAssignRequest ? (
            <>
              {bulkAssignRequest.ids.length}건을 &ldquo;{bulkAssignRequest.ownerLabel}&rdquo; 담당자에게 배정할까요?
              <span className="mt-2 block whitespace-pre-line">{bulkAssignRequest.profileText}</span>
            </>
          ) : (
            "선택한 리드를 배정할까요?"
          )
        }
        confirmLabel="배정"
        confirmLoadingLabel="배정 중..."
      />

      {/* 연락 기록 저장 성공 + 상태 동기화 경고 병기(leads-04) — 드로어 위(z-70), warning 톤, 닫기 전까지 유지.
          위치는 bottom-44/28/24/6 추정치가 아니라 toastMeasureRef·convertResultPanelRef로 실측한
          syncWarningOffsetPx — 토스트·전환 패널이 길어져도 겹치지 않는다(리뷰 발견 3). */}
      {syncWarning ? (
        <div
          className="fixed left-4 right-4 z-[70] sm:left-auto sm:right-6 sm:w-[360px]"
          style={{ bottom: syncWarningOffsetPx }}
        >
          <CrmNoticeBanner
            tone="warning"
            title="연락 기록은 저장되었습니다"
            message={syncWarning}
            className="shadow-xl"
            onDismiss={() => setSyncWarning(null)}
          />
        </div>
      ) : null}

      {/* 항상 마운트된 라이브 리전 — 성공 토스트(role=status)는 뜨는 순간 노드가 생겨 첫 알림을
          스크린리더가 놓칠 수 있다. 텍스트만 갈아끼워 통지한다(실패는 Toast 자체가 role=alert). */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {toast?.type === "success" ? toast.msg : ""}
      </div>
      {toast && (
        <div ref={toastMeasureRef}>
          <Toast
            msg={toast.msg}
            type={toast.type}
            raised={Boolean(convertResult)}
            action={toast.action}
            onDismiss={dismissToast}
          />
        </div>
      )}
    </div>
  )
}
