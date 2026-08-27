"use client"

import { useSearchParams } from "next/navigation"
import {
  Archive,
  BookOpen,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  MessageSquare,
  RotateCcw,
  Search,
} from "lucide-react"
import {
  Suspense,
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"

import CsConsoleNav from "@/components/admin/cs/CsConsoleNav"
import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import { useUrlState } from "@/lib/use-url-state"

import WorkspaceHeader from "./components/WorkspaceHeader"
import {
  ACCEPTED_ASSET_TYPES,
  INITIAL_CHECKS,
  LEGACY_ARCHIVE_TAB,
  resolveInitialQueueFilter,
  MAX_ASSET_BYTES,
  MAX_PENDING_ASSETS,
  QUEUE_STATUS_CHIPS,
  UUID_PATTERN,
  WORKSPACE_TAB_VALUES,
  type QueueStatusFilter,
} from "./constants"
import { DEMO_CONVERSATION, DEMO_DETAIL, DEMO_MESSAGES } from "./demo-data"
import {
  buildCustomerHoldingTemplate,
  buildHqTemplate,
  buildInternalHandoffTemplate,
  fileKey,
  formatMetricHours,
  formatMetricRate,
  integrationState,
} from "./formatters"
import {
  HQ_PENDING_TAG,
  isHqPending,
  putHqDetail,
  selectHqPending,
  withHqConfirmed,
  withHqPending,
} from "./hq-desk"
import { summarizeDocsGaps, type DocsGapsDeskSummary } from "./ops-desk"
import ChatPanel from "./panels/ChatPanel"
import HqPanel from "./panels/HqPanel"
import QueuePanel from "./panels/QueuePanel"
import ReviewDrawer from "./panels/ReviewDrawer"
import ToolsPanel from "./panels/ToolsPanel"
import type {
  AsyncLoadState,
  ConversationDetailResponse,
  ConversationListResponse,
  ConversationStatus,
  DocGapsSummaryResponse,
  GenerateResponse,
  IntegrationStatusResponse,
  InternalCsAsset,
  InternalCsConversation,
  InternalCsIntegrationEvent,
  InternalCsMessage,
  InternalCsMetricsResponse,
  ModelMode,
  PromoteKnowledgeResponse,
  PromotionResult,
  RegressionCandidateItem,
  RegressionCandidatesResponse,
  RegressionEvalItem,
  RegressionEvalResponse,
  RegressionEvalRunState,
  RegressionEvalSkippedItem,
  RegressionOutcome,
  ReviewChecks,
  WorkspaceTab,
} from "./types"

// 목록성 GET(대화 목록·회귀 후보·독스 갭·지표) 캐시 TTL — 실시간성 표면이라 짧게 둔다.
// 대화 목록·회귀 후보 URL은 AdminSidebar.tsx:168-171의 hover 예열과 문자열이 같아야
// 캐시 키(GET:input)가 일치해 예열된 응답을 그대로 소비한다.
const LIST_CACHE_TTL_MS = 20_000

function InternalCsChatWorkspaceInner() {
  // 이 화면에는 URL을 보는 눈이 둘이고, 둘은 서로 다른 순간에 진실이다.
  //
  //  · useSearchParams()  — 라우터가 커밋한 값. 콘솔 내비 <Link>는 라우터 상태를 먼저 바꾸고
  //    실제 pushState는 커밋 이후(HistoryUpdater 이펙트)에 적용한다. 그래서 Link 이동 직후의
  //    렌더에서는 window.location이 아직 옛 값이고 이쪽만 새 값을 안다.
  //  · useUrlState("tab") — window.location.search를 렌더마다 다시 읽는 값이자 쓰기 창구.
  //    내부 setTab은 replaceState라 location이 먼저 바뀌고 라우터는 트랜지션으로 뒤따른다.
  //
  // 그래서 읽기는 "라우터 값 우선, 없으면 location 값"으로 합친다.
  //  - Link 이동: 라우터 값이 즉시 새 값 → 지연 없음.
  //  - 내부 setTab: 기존 tab 파라미터가 없었으면(대화 탭) 라우터 값이 null이라 location 값이 바로 이긴다.
  //    파라미터가 있었으면 라우터 트랜지션 한 틱만큼 뒤따라온다(값이 어긋난 채 굳는 상태는 없다).
  // 두 눈이 같은 키(`tab`)만 보므로 어긋나도 항상 같은 값으로 수렴한다.
  const searchParams = useSearchParams()
  const [tabParam, setTabParam] = useUrlState("tab", "chat")
  const rawTab = searchParams.get("tab") ?? tabParam
  // 미지원 값(?tab=hq · 오타)은 조용히 대화 탭으로 되돌린다 — 빈 화면을 만들지 않는다.
  const activeTab: WorkspaceTab = WORKSPACE_TAB_VALUES.includes(rawTab as WorkspaceTab)
    ? (rawTab as WorkspaceTab)
    : rawTab === LEGACY_ARCHIVE_TAB
      ? "queue"
      : "chat"
  const setActiveTab = useCallback((tab: WorkspaceTab) => setTabParam(tab), [setTabParam])
  // 본사 확인 화면의 펼친 행을 `conversation` 딥링크로 되비춘다(§5는 이 키를 그대로 두라고 규약한다).
  // 읽기는 위의 searchParams(라우터 값)가 맡고, 여기서는 쓰기만 쓴다 — 같은 replaceState 창구라
  // tab과 순서대로 호출하면 두 파라미터가 한 주소에 함께 실린다.
  const [, setConversationParam] = useUrlState("conversation", "")
  // 상태 칩은 목록 안쪽 필터라 URL로 올리지 않는다(§5는 `tab`만 규약한다).
  // 옛 ?tab=archive 북마크만 마운트 시 종료·보관 칩으로 착지시켜 행 집합을 그대로 재현한다.
  const [queueFilter, setQueueFilter] = useState<QueueStatusFilter>(() =>
    resolveInitialQueueFilter(rawTab)
  )
  const [conversations, setConversations] = useState<InternalCsConversation[]>([])
  const [detail, setDetail] = useState<ConversationDetailResponse | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composer, setComposer] = useState("")
  const [modelMode, setModelMode] = useState<ModelMode>("auto")
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewChecks, setReviewChecks] = useState<ReviewChecks>(INITIAL_CHECKS)
  const [finalDraft, setFinalDraft] = useState("")
  const [reviewNote, setReviewNote] = useState("")
  const [regressionCandidate, setRegressionCandidate] = useState(false)
  const [excludeFromGapQueue, setExcludeFromGapQueue] = useState(false)
  const [expanded, setExpanded] = useState<"sources" | "hq" | "regression" | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // 개발 전용 폴백 — loadConversations()가 실패했을 때만 켜진다(아래 catch).
  // demoMode를 읽는 분기 중 demo-data를 실제로 참조하는 네 곳은 조건에
  // `process.env.NODE_ENV === "development"`를 함께 둔다. 번들러가 이 리터럴 비교를 정적으로
  // 접어 프로덕션에서는 분기째 사라지고, 데모 데이터 문자열도 클라이언트 번들에서 빠진다.
  // (상수로 빼면 접히지 않을 수 있어 조건에 직접 쓴다.)
  const [demoMode, setDemoMode] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [assetError, setAssetError] = useState<string | null>(null)
  const [uploadingAssets, setUploadingAssets] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [assetReviewingId, setAssetReviewingId] = useState<string | null>(null)
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(null)
  const [integrationLoading, setIntegrationLoading] = useState(false)
  const [integrationAttempted, setIntegrationAttempted] = useState(false)
  const [integrationError, setIntegrationError] = useState<string | null>(null)
  const [includeOriginal, setIncludeOriginal] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [docsGapsSummary, setDocsGapsSummary] = useState<DocsGapsDeskSummary | null>(null)
  const [docsGapsAttempted, setDocsGapsAttempted] = useState(false)
  const [regressionCandidates, setRegressionCandidates] = useState<RegressionCandidateItem[]>([])
  const [regressionLoadState, setRegressionLoadState] = useState<AsyncLoadState>("idle")
  const [regressionError, setRegressionError] = useState<string | null>(null)
  // 운영 데스크 — 브리지 전송 옵션/최근 기록 펼침.
  // 스탯 스트립 → 회귀 섹션 스크롤 ref는 트리거·타깃이 둘 다 ToolsPanel 안이라 그쪽 로컬에 산다.
  const [bridgeDetailOpen, setBridgeDetailOpen] = useState(false)
  // 계약 1 — 운영 데스크 지표 카드 행.
  const [csMetrics, setCsMetrics] = useState<InternalCsMetricsResponse | null>(null)
  const [metricsLoadState, setMetricsLoadState] = useState<AsyncLoadState>("idle")
  // 계약 2 — 회귀 자동 평가는 제안만 저장한다(messageId로 색인, DB 미변경).
  const [regressionEvalRunState, setRegressionEvalRunState] = useState<RegressionEvalRunState>("idle")
  const [regressionEvalError, setRegressionEvalError] = useState<string | null>(null)
  const [regressionSuggestions, setRegressionSuggestions] = useState<Record<string, RegressionEvalItem>>({})
  const [regressionEvalSkipped, setRegressionEvalSkipped] = useState<RegressionEvalSkippedItem[]>([])
  // 계약 3 — 지식 승격. 회귀 패널 항목·대화 스레드 두 노출 지점이 messageId로 결과를 공유한다.
  const [promotingMessageId, setPromotingMessageId] = useState<string | null>(null)
  const [promotionResults, setPromotionResults] = useState<Record<string, PromotionResult>>({})
  const [deepLinkChecked, setDeepLinkChecked] = useState(false)
  // 본사 확인(tab=hq) — 목록은 이미 받아 둔 conversations를 태그로 거른 것이고,
  // 행을 펼칠 때만 상세를 가져온다(buildHqTemplate이 messages·assets를 요구한다).
  // 상세는 여기 캐시에 따로 담는다 — 대화 탭의 detail/finalDraft 상태를 건드리지 않기 위함이다.
  // 적재는 putHqDetail만 거친다(HQ_DETAIL_CACHE_LIMIT 상한, 오래된 것부터 폐기).
  const [hqExpandedId, setHqExpandedId] = useState<string | null>(null)
  const [hqDetails, setHqDetails] = useState<Record<string, ConversationDetailResponse>>({})
  const [hqDetailError, setHqDetailError] = useState<string | null>(null)
  const [hqPendingActionId, setHqPendingActionId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  const loadConversation = useCallback(async (id: string) => {
    if (process.env.NODE_ENV === "development" && demoMode && id === DEMO_CONVERSATION.id) {
      setDetail(DEMO_DETAIL)
      setSelectedId(id)
      setFinalDraft(DEMO_MESSAGES[1].content)
      setReviewChecks(INITIAL_CHECKS)
      setReviewNote("")
      setExcludeFromGapQueue(false)
      return DEMO_DETAIL
    }
    const loaded = await adminFetchJson<ConversationDetailResponse>(`/api/admin/cs-chat/conversations/${id}`)
    setDetail(loaded)
    setSelectedId(id)
    const pending = [...loaded.messages].reverse().find(
      (message) => message.role === "assistant" && message.review_state === "pending"
    )
    setFinalDraft(pending?.corrected_content ?? pending?.content ?? "")
    setReviewChecks(INITIAL_CHECKS)
    setReviewNote("")
    setRegressionCandidate(pending?.regression_candidate ?? false)
    setExcludeFromGapQueue(false)
    return loaded
  }, [demoMode])

  const loadIntegrationStatus = useCallback(async () => {
    setIntegrationAttempted(true)
    if (demoMode) {
      setIntegrationStatus({
        configured: true,
        status: "ready",
        label: "AI 브리지 미리보기",
        message: "현재 대화와 이미지 분석을 내부 AI 협업 채널로 전달할 수 있습니다.",
      })
      setIntegrationError(null)
      return
    }
    setIntegrationLoading(true)
    setIntegrationError(null)
    try {
      const response = await adminFetchJson<IntegrationStatusResponse>("/api/admin/cs-chat/integrations/status")
      setIntegrationStatus(response)
    } catch (statusError) {
      setIntegrationError(statusError instanceof Error ? statusError.message : "AI 브리지 상태를 불러오지 못했습니다.")
    } finally {
      setIntegrationLoading(false)
    }
  }, [demoMode])

  // 스탯 스트립 — 기존 GET /api/admin/docs/gaps 응답을 소스별로 집계한다(신규 API 없음).
  // 실패 시 null을 유지해 숫자 대신 "—" 플레이스홀더로 폴백한다.
  const loadDocsGapsSummary = useCallback(async () => {
    setDocsGapsAttempted(true)
    if (demoMode) {
      setDocsGapsSummary(null)
      return
    }
    try {
      const response = await adminFetchJsonCached<DocGapsSummaryResponse>("/api/admin/docs/gaps", undefined, {
        ttlMs: LIST_CACHE_TTL_MS,
        persist: false,
      })
      setDocsGapsSummary(summarizeDocsGaps(response))
    } catch {
      setDocsGapsSummary(null)
    }
  }, [demoMode])

  // 회귀 검수 미니 패널 — 미판정 우선 목록. 실패 시 섹션 자체에 재시도 폴백을 보여준다.
  // demoMode는 "다시 시도" 루프 대신 깨끗한 빈 상태로 처리한다.
  // 재조회 진입 시 직전 자동 평가의 잔상(실행 상태·에러·건너뜀 경고)을 리셋하고,
  // 성공 시 새 목록에 없는 메시지의 제안을 prune해 stale 배지를 막는다.
  // promotionResults는 대화 스레드와 공유하는 맵이라 여기서 prune하지 않는다 —
  // 스레드 메시지가 회귀 목록에 없으면 승격 성공 배지가 사라지는 부작용이 있고, 세션 한정 누적은 무해.
  const loadRegressionCandidates = useCallback(async () => {
    setRegressionEvalRunState("idle")
    setRegressionEvalError(null)
    setRegressionEvalSkipped([])
    if (demoMode) {
      setRegressionCandidates([])
      setRegressionSuggestions({})
      setRegressionLoadState("loaded")
      return
    }
    setRegressionLoadState("loading")
    try {
      const response = await adminFetchJsonCached<RegressionCandidatesResponse>(
        "/api/admin/cs-chat/regression-candidates",
        undefined,
        { ttlMs: LIST_CACHE_TTL_MS, persist: false }
      )
      const items = Array.isArray(response.items) ? response.items : []
      setRegressionCandidates(items)
      const liveIds = new Set(items.map((item) => item.id))
      setRegressionSuggestions((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => liveIds.has(id)))
      )
      setRegressionLoadState("loaded")
    } catch {
      setRegressionCandidates([])
      setRegressionSuggestions({})
      setRegressionLoadState("failed")
    }
  }, [demoMode])

  // tools 탭 지표 카드 행(계약 1). regressionLoadState와 동일한 idle→loading→loaded/failed
  // 상태기계를 공유해 실패 시 자동 재시도 루프 없이 수동 "다시 시도"만 제공한다.
  const loadCsMetrics = useCallback(async () => {
    if (demoMode) {
      setCsMetrics(null)
      setMetricsLoadState("loaded")
      return
    }
    setMetricsLoadState("loading")
    try {
      const response = await adminFetchJsonCached<InternalCsMetricsResponse>(
        "/api/admin/cs-chat/metrics?days=7",
        undefined,
        { ttlMs: LIST_CACHE_TTL_MS, persist: false }
      )
      setCsMetrics(response)
      setMetricsLoadState("loaded")
    } catch {
      setCsMetrics(null)
      setMetricsLoadState("failed")
    }
  }, [demoMode])

  const loadConversations = useCallback(async (preferredId?: string | null) => {
    setLoading(true)
    try {
      const response = await adminFetchJsonCached<ConversationListResponse>(
        "/api/admin/cs-chat/conversations?status=all&limit=100",
        undefined,
        { ttlMs: LIST_CACHE_TTL_MS, persist: false }
      )
      setConversations(response.conversations)
      const nextId = preferredId ?? selectedId ?? response.conversations.find((item) => item.status !== "archived")?.id
      if (nextId) await loadConversation(nextId)
      setError(null)
    } catch (loadError) {
      if (process.env.NODE_ENV === "development") {
        setDemoMode(true)
        setConversations([DEMO_CONVERSATION])
        setDetail(DEMO_DETAIL)
        setSelectedId(DEMO_CONVERSATION.id)
        setFinalDraft(DEMO_MESSAGES[1].content)
        setError(null)
        setNotice(null)
      } else {
        setError(loadError instanceof Error ? loadError.message : "내부 CS 대화를 불러오지 못했습니다.")
      }
    } finally {
      setLoading(false)
    }
  }, [loadConversation, selectedId])

  useEffect(() => {
    if (loading && conversations.length === 0 && !detail && !error) {
      void loadConversations()
    }
  }, [conversations.length, detail, error, loadConversations, loading])

  // 레거시 ?tab=archive URL 정규화 — 화면은 이미 대기열 + 종료·보관 칩으로 착지해 있고,
  // 주소만 새 값으로 바꿔 콘솔 내비 하이라이트(`대기열`)까지 일치시킨다.
  useEffect(() => {
    if (tabParam === LEGACY_ARCHIVE_TAB) setTabParam("queue")
  }, [tabParam, setTabParam])

  // 딥링크 수신 — ?conversation=<uuid>. 최초 목록 부트스트랩(loading→false)이 끝난 뒤
  // 한 번만 시도해 기본 선택과의 경합을 피한다. 없는/접근 불가한 id는 조용히 무시하고
  // 부트스트랩이 이미 고른 기본 화면을 그대로 둔다.
  useEffect(() => {
    if (deepLinkChecked || loading) return
    setDeepLinkChecked(true)
    const deepLinkId = searchParams.get("conversation")
    // UUID 형태가 아니면(오타·조작된 값) fetch 경로에 꽂지 않고 조용히 무시한다.
    if (!deepLinkId || !UUID_PATTERN.test(deepLinkId)) return
    loadConversation(deepLinkId)
      .then(() => {
        // §5 — tab이 명시되지 않은 채 conversation만 오면 대화 탭으로 강제한다.
        // 명시된 tab(예: ?tab=tools&conversation=)은 존중한다: 대화는 뒤에서 열려 있고
        // 그 탭으로 돌아오면 그대로 보인다.
        if (!new URLSearchParams(window.location.search).get("tab")) setActiveTab("chat")
      })
      .catch(() => {
        // 존재하지 않거나 조회 실패한 대화 id — 기본 화면 유지
      })
  }, [deepLinkChecked, loading, loadConversation, searchParams, setActiveTab])

  // ?tab=hq&conversation=<id> — 본사 확인 목록에서 그 행을 펼친 채로 착지시킨다.
  // 위 승계 로직(tab 미지정일 때만 chat 강제)과 겹치지 않는다: 여기서는 탭을 건드리지 않고
  // 펼침 대상만 정한다. tab=hq면 아래 목록이 펼쳐진 채로 그려지고, 다른 탭이면 아무 일도 없다.
  useEffect(() => {
    const deepLinkId = searchParams.get("conversation")
    if (!deepLinkId || !UUID_PATTERN.test(deepLinkId)) return
    setHqExpandedId((current) => current ?? deepLinkId)
  }, [searchParams])

  // 펼친 행의 상세 로드 — buildHqTemplate은 messages·assets를 읽으므로 목록 응답만으로는 부족하다.
  // 대화 탭이 이미 같은 대화를 들고 있으면(딥링크 승계 포함) 그 detail을 재사용해 중복 요청을 만들지 않는다.
  useEffect(() => {
    const id = hqExpandedId
    if (!id || hqDetails[id]) return
    if (detail && detail.conversation.id === id) {
      setHqDetails((current) => putHqDetail(current, id, detail))
      return
    }
    if (demoMode || !UUID_PATTERN.test(id)) return
    let cancelled = false
    adminFetchJson<ConversationDetailResponse>(`/api/admin/cs-chat/conversations/${id}`)
      .then((loaded) => {
        if (cancelled) return
        setHqDetails((current) => putHqDetail(current, id, loaded))
        setHqDetailError(null)
      })
      .catch((loadError) => {
        if (cancelled) return
        setHqDetailError(loadError instanceof Error ? loadError.message : "본사 확인 초안을 불러오지 못했습니다.")
      })
    return () => {
      cancelled = true
    }
  }, [demoMode, detail, hqDetails, hqExpandedId])

  useEffect(() => {
    if (activeTab === "tools" && !integrationAttempted && !integrationLoading) {
      void loadIntegrationStatus()
    }
  }, [activeTab, integrationAttempted, integrationLoading, loadIntegrationStatus])

  useEffect(() => {
    if (activeTab === "tools" && !docsGapsAttempted) {
      void loadDocsGapsSummary()
    }
  }, [activeTab, docsGapsAttempted, loadDocsGapsSummary])

  // 회귀 후보는 탭 진입 전에 로드한다 — "운영 도구" 탭의 판정 대기 점(dot)이 이 데이터로 켜진다.
  // 대화 목록·상세와 무관한 별도 자원이라 그 부트스트랩(loading)을 기다리지 않고 1파와 동시에 쏜다.
  // demoMode는 최초 렌더에서 false로 시작하므로(초기값), 실제 백엔드가 아예 죽어 있는 드문 경우에만
  // 이 요청이 demoMode 확정 전에 실패한 채로 남는다 — 그때도 "운영 도구" 탭에는 재시도 버튼이 뜨고
  // 재시도 시점엔 demoMode가 이미 true라 빈 상태로 정상 수렴한다.
  useEffect(() => {
    if (regressionLoadState === "idle") {
      void loadRegressionCandidates()
    }
  }, [regressionLoadState, loadRegressionCandidates])

  useEffect(() => {
    if (activeTab === "tools" && metricsLoadState === "idle") {
      void loadCsMetrics()
    }
  }, [activeTab, metricsLoadState, loadCsMetrics])

  const assets = useMemo(() => detail?.assets ?? [], [detail?.assets])
  const integrationEvents = useMemo(() => detail?.integrationEvents ?? [], [detail?.integrationEvents])

  useEffect(() => {
    setSelectedAssetId((current) => {
      if (current && assets.some((asset) => asset.id === current)) return current
      return assets.at(-1)?.id ?? null
    })
  }, [assets])

  // 대화 스위처(헤더 드롭다운)는 흡수 전과 같이 살아 있는 대화만 보여준다.
  const queueConversations = useMemo(
    () => conversations.filter((conversation) => conversation.status !== "archived"),
    [conversations]
  )
  // 상태 칩별 건수 — 흡수된 탭의 위첨자 카운트를 대신하는 작업량 신호.
  const queueChipCounts = useMemo(() => {
    const counts = {} as Record<QueueStatusFilter, number>
    for (const chip of QUEUE_STATUS_CHIPS) {
      counts[chip.value] = conversations.filter((conversation) => chip.match(conversation.status)).length
    }
    return counts
  }, [conversations])
  const filteredQueueConversations = useMemo(() => {
    const chip = QUEUE_STATUS_CHIPS.find((item) => item.value === queueFilter) ?? QUEUE_STATUS_CHIPS[0]
    return conversations.filter((conversation) => chip.match(conversation.status))
  }, [conversations, queueFilter])
  // 본사 확인 목록 — 신규 API 없이 같은 status=all 응답을 태그로 거른다(§6).
  const hqConversations = useMemo(() => selectHqPending(conversations), [conversations])
  // 펼친 행의 상세. 대화 탭이 마침 같은 대화를 들고 있으면 그 detail을 그대로 쓴다
  // (딥링크 ?tab=hq&conversation= 로 들어온 경우가 여기에 해당해 추가 요청이 없다).
  const hqDetail = useMemo(() => {
    if (!hqExpandedId) return null
    if (hqDetails[hqExpandedId]) return hqDetails[hqExpandedId]
    return detail && detail.conversation.id === hqExpandedId ? detail : null
  }, [detail, hqDetails, hqExpandedId])
  const pendingMessage = useMemo(
    () => [...(detail?.messages ?? [])].reverse().find(
      (message) => message.role === "assistant" && message.review_state === "pending"
    ) ?? null,
    [detail?.messages]
  )
  const latestAssistant = useMemo(
    () => [...(detail?.messages ?? [])].reverse().find((message) => message.role === "assistant") ?? null,
    [detail?.messages]
  )
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets.at(-1) ?? null
  const bridgeState = integrationState(integrationStatus)
  const hasDispatchContext = Boolean(detail && (detail.messages.length > 0 || assets.length > 0))
  // 탭 신호 — 대기열은 위첨자 숫자, 운영 도구는 미판정 회귀 후보가 있을 때 앰버 점.
  const regressionPendingCount = useMemo(
    () => regressionCandidates.filter((item) => item.outcome === "not_evaluated").length,
    [regressionCandidates]
  )
  const communicationTemplates = useMemo(() => [
    {
      id: "customer",
      label: "고객 임시 안내",
      content: buildCustomerHoldingTemplate(detail),
    },
    {
      id: "handoff",
      label: "내부 인수인계",
      content: buildInternalHandoffTemplate(detail),
    },
    {
      id: "hq",
      label: "본사 확인",
      content: buildHqTemplate(detail),
    },
  ], [detail])
  const canApprove = Object.values(reviewChecks).every(Boolean) && Boolean(pendingMessage) && finalDraft.trim().length > 0

  // 지표 카드 행(계약 1) — csMetrics가 없으면(idle/loading/failed/demoMode) 전 카드를 "—"로 조용히 표시한다.
  const metricCards = useMemo(() => {
    const m = csMetrics
    return [
      {
        key: "volume",
        icon: MessageSquare,
        label: "질문량",
        value: m ? String(m.volume.questions) : "—",
        sub: m ? `대화 ${m.volume.conversations}건` : undefined,
      },
      {
        key: "fallback",
        icon: Search,
        label: "폴백률",
        value: formatMetricRate(m?.fallbackRate),
        sub: "라이브 검색 실패 비율",
      },
      {
        key: "evidence",
        icon: BookOpen,
        label: "근거 믹스",
        value: m
          ? String(m.evidenceMix.knowledge + m.evidenceMix.docs + m.evidenceMix.channel + m.evidenceMix.none)
          : "—",
        sub: m
          ? `정본 ${m.evidenceMix.knowledge} · 문서 ${m.evidenceMix.docs} · 상담이관 ${m.evidenceMix.channel} · 근거없음 ${m.evidenceMix.none}`
          : undefined,
      },
      {
        key: "approval",
        icon: CheckCircle2,
        label: "승인율",
        value: formatMetricRate(m?.review.approvalRate),
        sub: m ? `승인 ${m.review.approved} · 수정요청 ${m.review.changesRequested} · 대기 ${m.review.pending}` : undefined,
      },
      {
        key: "regression",
        icon: History,
        label: "회귀 분포",
        value: m
          ? String(m.regression.pass + m.regression.needsFix + m.regression.promoted + m.regression.excluded)
          : "—",
        sub: m
          ? `통과 ${m.regression.pass} · 수정필요 ${m.regression.needsFix} · 반영 ${m.regression.promoted} · 제외 ${m.regression.excluded} · 미판정 ${m.regression.notEvaluated}`
          : undefined,
      },
      {
        key: "leadTime",
        icon: Clock,
        label: "리드타임",
        value: formatMetricHours(m?.leadTimeHours.median),
        sub: m ? `P90 ${formatMetricHours(m.leadTimeHours.p90)}` : undefined,
      },
    ]
  }, [csMetrics])

  // 자동 평가(계약 2) skipped 요약 — 회귀 패널 하단 경고 1줄. 사유는 중복 제거 후 최대 3개만 노출한다.
  const regressionEvalSkippedSummary = useMemo(() => {
    if (regressionEvalSkipped.length === 0) return null
    const reasons = Array.from(new Set(regressionEvalSkipped.map((item) => item.reason))).slice(0, 3)
    return `자동 평가에서 ${regressionEvalSkipped.length}건을 건너뛰었습니다 (${reasons.join(" · ")})`
  }, [regressionEvalSkipped])

  async function handleSelect(conversation: InternalCsConversation) {
    if (process.env.NODE_ENV === "development" && demoMode && conversation.id === DEMO_CONVERSATION.id) {
      setDetail((current) => current ?? DEMO_DETAIL)
      setSelectedId(conversation.id)
      setActiveTab("chat")
      return
    }
    setLoading(true)
    try {
      await loadConversation(conversation.id)
      setActiveTab("chat")
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "대화를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }

  function startNewConversation() {
    setDetail(null)
    setSelectedId(null)
    setComposer("")
    setPendingFiles([])
    setAssetError(null)
    setSelectedAssetId(null)
    setReviewOpen(false)
    setExpanded(null)
    setNotice(null)
    setActiveTab("chat")
  }

  function handleAssetFiles(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? [])
    event.target.value = ""
    const validTypes = incoming.filter((file) => ACCEPTED_ASSET_TYPES.has(file.type))
    const valid = validTypes.filter((file) => file.size > 0 && file.size <= MAX_ASSET_BYTES)
    if (validTypes.length !== incoming.length) {
      setAssetError("JPG, PNG, WebP 이미지만 첨부할 수 있습니다.")
    } else if (valid.length !== validTypes.length) {
      setAssetError("이미지는 장당 8MB 이하여야 합니다.")
    }

    setPendingFiles((current) => {
      const existingKeys = new Set(current.map(fileKey))
      const unique = valid.filter((file) => !existingKeys.has(fileKey(file)))
      const next = [...current, ...unique]
      if (next.length > MAX_PENDING_ASSETS) {
        setAssetError(`한 번에 최대 ${MAX_PENDING_ASSETS}장까지 첨부할 수 있습니다.`)
      } else if (valid.length === incoming.length) {
        setAssetError(null)
      }
      return next.slice(0, MAX_PENDING_ASSETS)
    })
  }

  function removePendingFile(file: File) {
    const key = fileKey(file)
    setPendingFiles((current) => current.filter((item) => fileKey(item) !== key))
    setAssetError(null)
  }

  async function uploadFiles(conversationId: string, files: File[], instruction: string) {
    if (files.length === 0) return 0
    setUploadingAssets(true)
    setUploadProgress({ current: 0, total: files.length })
    const failed: string[] = []
    let uploaded = 0

    try {
      for (const [index, file] of files.entries()) {
        setUploadProgress({ current: index + 1, total: files.length })
        const formData = new FormData()
        formData.append("file", file)
        formData.append("instruction", instruction)
        formData.append("requestedMode", modelMode)
        try {
          await adminFetchJson<unknown>(`/api/admin/cs-chat/conversations/${conversationId}/assets`, {
            method: "POST",
            body: formData,
          })
          uploaded += 1
        } catch {
          failed.push(file.name)
        }
      }
    } finally {
      setUploadingAssets(false)
      setUploadProgress({ current: 0, total: 0 })
    }

    if (failed.length > 0) {
      setAssetError(`분석하지 못한 이미지: ${failed.join(", ")}`)
    } else {
      setAssetError(null)
    }
    return uploaded
  }

  async function dispatchCurrentConversation() {
    if (!detail || !hasDispatchContext || dispatching) {
      setIntegrationError("전송할 현재 대화 또는 이미지 분석이 없습니다.")
      return
    }
    if (!bridgeState.ready && !demoMode) {
      setIntegrationError("AI 브리지가 준비되지 않았습니다. 연동 상태를 먼저 확인해 주세요.")
      return
    }

    setDispatching(true)
    setIntegrationError(null)
    try {
      if (demoMode) {
        const event: InternalCsIntegrationEvent = {
          id: `preview-dispatch-${Date.now()}`,
          integration: bridgeState.label,
          status: "sent",
          include_original: includeOriginal,
          summary: "현재 대화와 분석 맥락을 내부 AI 브리지로 전송했습니다.",
          created_at: new Date().toISOString(),
        }
        setDetail((current) => current
          ? { ...current, integrationEvents: [event, ...(current.integrationEvents ?? [])] }
          : current)
      } else {
        await adminFetchJson<unknown>(`/api/admin/cs-chat/conversations/${detail.conversation.id}/dispatch`, {
          method: "POST",
          body: JSON.stringify({
            includeOriginalAssets: includeOriginal,
            acknowledgeSensitiveData: includeOriginal,
          }),
        })
        await loadConversation(detail.conversation.id)
      }
      setNotice(includeOriginal
        ? "현재 대화·분석과 확인한 원본 이미지를 내부 AI 브리지로 전송했습니다."
        : "현재 대화와 분석 맥락을 내부 AI 브리지로 전송했습니다.")
    } catch (dispatchError) {
      setIntegrationError(dispatchError instanceof Error ? dispatchError.message : "현재 대화를 전송하지 못했습니다.")
    } finally {
      setDispatching(false)
    }
  }

  async function approveSelectedAsset() {
    if (!detail || !selectedAsset || assetReviewingId) return
    setAssetReviewingId(selectedAsset.id)
    setAssetError(null)
    try {
      if (demoMode) {
        setDetail((current) => current
          ? {
              ...current,
              assets: (current.assets ?? []).map((asset) => asset.id === selectedAsset.id
                ? { ...asset, review_state: "approved", human_review_required: false }
                : asset),
            }
          : current)
      } else {
        await adminFetchJson<unknown>(
          `/api/admin/cs-chat/conversations/${detail.conversation.id}/assets/${selectedAsset.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ decision: "approved" }),
          }
        )
        await loadConversation(detail.conversation.id)
      }
      setNotice("이미지 분석을 CS 담당자 확인 완료로 기록했습니다.")
    } catch (reviewError) {
      setAssetError(reviewError instanceof Error ? reviewError.message : "이미지 분석 확인을 저장하지 못했습니다.")
    } finally {
      setAssetReviewingId(null)
    }
  }

  async function submitQuestion(event: FormEvent) {
    event.preventDefault()
    const filesToUpload = [...pendingFiles]
    const question = composer.trim() || (filesToUpload.length > 0
      ? "첨부 이미지의 내용과 CS 대응에 필요한 사항을 분석해 주세요."
      : "")
    if (!question || isPending || uploadingAssets) return

    setError(null)
    setNotice(null)
    setComposer("")
    if (process.env.NODE_ENV === "development" && demoMode) {
      const now = new Date().toISOString()
      const previewAssets: InternalCsAsset[] = filesToUpload.map((file, index) => ({
        id: `preview-asset-${Date.now()}-${index}`,
        file_name: file.name,
        mime_type: file.type,
        preview_url: URL.createObjectURL(file),
        instruction: question,
        analysis: "화면 또는 사진의 핵심 요소를 추출한 미리보기 분석입니다. 실제 환경에서는 모델 분석 결과와 추가 확인 항목이 누적됩니다.",
        analysis_status: "completed",
        human_review_required: true,
        created_at: now,
      }))
      const nextUser: InternalCsMessage = {
        ...DEMO_MESSAGES[0],
        id: `preview-user-${Date.now()}`,
        content: question,
        created_at: now,
      }
      const nextAssistant: InternalCsMessage = {
        ...DEMO_MESSAGES[1],
        id: `preview-assistant-${Date.now()}`,
        content: "검토 전 내부 초안\n\n현재 미리보기에서는 입력 흐름만 확인할 수 있습니다. 실제 환경에서는 공개 가이드와 내부 운영 기준을 검색한 뒤 Gemini 초안을 생성하며, 담당자 승인 전에는 외부로 전달되지 않습니다.",
        model_name: modelMode === "deep" ? "gemini-3.1-pro-preview" : "gemini-3.5-flash",
        model_mode: modelMode === "deep" ? "deep" : "fast",
        created_at: now,
      }
      const nextDetail = {
        conversation: { ...DEMO_CONVERSATION, status: "waiting_review" as const, last_message_at: now },
        messages: [...(detail?.messages ?? DEMO_MESSAGES), nextUser, nextAssistant],
        assets: [...(detail?.assets ?? []), ...previewAssets],
        integrationEvents: detail?.integrationEvents ?? [],
      }
      setDetail(nextDetail)
      setPendingFiles([])
      setSelectedAssetId(previewAssets.at(-1)?.id ?? selectedAssetId)
      setFinalDraft(nextAssistant.content)
      setReviewChecks(INITIAL_CHECKS)
      setNotice("미리보기 초안을 생성했습니다. 실제 환경에서는 Gemini와 내부 근거 검색을 사용합니다.")
      return
    }
    startTransition(async () => {
      try {
        let conversationId = selectedId
        if (!conversationId) {
          const created = await adminFetchJson<{ conversation: InternalCsConversation }>(
            "/api/admin/cs-chat/conversations",
            {
              method: "POST",
              body: JSON.stringify({
                title: question.slice(0, 60),
                priority: "normal",
                tags: ["internal_cs"],
              }),
            }
          )
          conversationId = created.conversation.id
          setSelectedId(conversationId)
        }

        await uploadFiles(conversationId, filesToUpload, question)

        await adminFetchJson<GenerateResponse>(
          `/api/admin/cs-chat/conversations/${conversationId}/generate`,
          {
            method: "POST",
            body: JSON.stringify({
              question,
              requestedMode: modelMode,
              requiresEvidenceReview: modelMode === "deep",
            }),
          }
        )
        setPendingFiles([])
        await loadConversations(conversationId)
        setNotice("AI 초안이 생성되었습니다. 외부 전달 전 담당자 검토가 필요합니다.")
      } catch (submitError) {
        setComposer(question)
        setError(submitError instanceof Error ? submitError.message : "답변 초안을 생성하지 못했습니다.")
      }
    })
  }

  function rerunWithPro() {
    const question = [...(detail?.messages ?? [])].reverse().find((message) => message.role === "user")?.content
    if (!question || !selectedId || isPending) return
    if (process.env.NODE_ENV === "development" && demoMode) {
      const now = new Date().toISOString()
      const proMessage: InternalCsMessage = {
        ...DEMO_MESSAGES[1],
        id: `preview-pro-${Date.now()}`,
        content: "검토 전 심층 초안\n\n정책·계약·프로모션 조건이 서로 다를 수 있으므로 환불을 확정하지 않습니다. 결제 원장, 계약 조건, 프로모션 적용 여부를 대조하고 본사에는 적용 시장과 효력일을 포함해 확인을 요청해 주세요.",
        model_name: "gemini-3.1-pro-preview",
        model_mode: "deep",
        created_at: now,
      }
      setDetail((current) => current ? { ...current, messages: [...current.messages, proMessage] } : current)
      setFinalDraft(proMessage.content)
      setReviewChecks(INITIAL_CHECKS)
      setNotice("Pro 심층 검토 미리보기를 추가했습니다.")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await adminFetchJson<GenerateResponse>(
          `/api/admin/cs-chat/conversations/${selectedId}/generate`,
          {
            method: "POST",
            body: JSON.stringify({ question, requestedMode: "deep", requiresEvidenceReview: true }),
          }
        )
        await loadConversations(selectedId)
        setNotice("Pro 심층 검토 초안을 추가했습니다. 최신 초안을 확인해 주세요.")
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : "Pro 심층 검토에 실패했습니다.")
      }
    })
  }

  async function copyText(text: string, success: string) {
    try {
      await navigator.clipboard.writeText(text)
      setNotice(success)
    } catch {
      setError("클립보드 복사에 실패했습니다.")
    }
  }

  function submitReview(decision: "approved" | "changes_requested") {
    if (!detail || !pendingMessage || isPending) return
    if (decision === "approved" && !canApprove) {
      setError("고객 맥락, 정본 근거, 외부 전달 범위를 모두 확인해 주세요.")
      return
    }
    if (decision === "changes_requested" && !reviewNote.trim()) {
      setError("수정 요청 사유를 입력해 주세요.")
      return
    }

    if (demoMode) {
      const now = new Date().toISOString()
      const nextStatus: ConversationStatus = decision === "approved" ? "resolved" : "active"
      setDetail((current) => {
        if (!current) return current
        return {
          conversation: {
            ...current.conversation,
            status: nextStatus,
          },
          messages: current.messages.map((message) => message.id === pendingMessage.id
            ? {
                ...message,
                review_state: decision,
                corrected_content: finalDraft,
                review_note: reviewNote || null,
                regression_candidate: decision === "changes_requested" || regressionCandidate,
                regression_outcome: decision === "changes_requested" ? "needs_fix" : "not_evaluated",
                reviewed_by: "CS 담당자",
                reviewed_at: now,
              }
            : message),
        }
      })
      setConversations((current) => current.map((conversation) => conversation.id === detail.conversation.id
        ? { ...conversation, status: nextStatus, updated_at: now, last_message_at: now }
        : conversation))
      if (decision === "approved") {
        void copyText(finalDraft, "승인된 최종 답변을 복사했습니다.")
        setReviewOpen(false)
      } else {
        setNotice("수정 요청을 기록하고 회귀 개선 후보로 남겼습니다.")
      }
      return
    }

    setError(null)
    startTransition(async () => {
      try {
        await adminFetchJson<{ message: InternalCsMessage }>(
          `/api/admin/cs-chat/conversations/${detail.conversation.id}/messages/${pendingMessage.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              decision,
              correctedContent: finalDraft,
              reviewNote: reviewNote || undefined,
              feedbackLabels: decision === "changes_requested" ? ["human_revision_requested"] : ["human_approved"],
              regressionCandidate: decision === "changes_requested" || regressionCandidate,
              regressionOutcome: decision === "changes_requested" ? "needs_fix" : "not_evaluated",
              conversationAction: decision === "approved" ? "resolve" : "keep_open",
              excludeFromGapQueue: decision === "changes_requested" && excludeFromGapQueue ? true : undefined,
            }),
          }
        )
        if (decision === "approved") {
          await copyText(finalDraft, "승인된 최종 답변을 복사했습니다.")
          setReviewOpen(false)
        } else {
          setNotice("수정 요청을 기록하고 회귀 개선 후보로 남겼습니다.")
        }
        await loadConversations(detail.conversation.id)
      } catch (reviewError) {
        setError(reviewError instanceof Error ? reviewError.message : "검토 결과를 저장하지 못했습니다.")
      }
    })
  }

  // ── 본사 확인 태그 전이(§6) ────────────────────────────────────────────────
  // 티켓 엔티티를 만들지 않는다. 상태는 tags[] 하나에 살고, 쓰기는 이미 있는
  // PATCH /api/admin/cs-chat/conversations/[id] { action:"update", tags } 하나뿐이다.

  // 저장된 태그를 목록·대화 상세·본사 확인 캐시 세 곳에 동시에 반영한다.
  // 전체 재조회(loadConversations) 대신 이 좁은 갱신을 쓰는 이유는 작성 중인 최종 답변 초안을
  // 날리지 않기 위해서다.
  //
  // updated_at도 서버 응답 값으로 함께 덮는다. 태그를 쓰면 updated_at 트리거가 반드시 다시 찍히는데,
  // 태그만 갈아끼우면 대기 경과가 방금 올린 건에 "7일" 같은 옛 값을 그대로 보여준다.
  function applyConversationPatch(id: string, patch: Pick<InternalCsConversation, "tags" | "updated_at">) {
    setConversations((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
    setDetail((current) =>
      current && current.conversation.id === id
        ? { ...current, conversation: { ...current.conversation, ...patch } }
        : current
    )
    setHqDetails((current) => {
      const cached = current[id]
      if (!cached) return current
      return { ...current, [id]: { ...cached, conversation: { ...cached.conversation, ...patch } } }
    })
  }

  // 펼침 상태를 URL(`conversation`)과 함께 움직인다 — 새로고침·링크 공유에도 같은 행이 열린다.
  function toggleHqRow(id: string) {
    const next = hqExpandedId === id ? null : id
    setHqExpandedId(next)
    setConversationParam(next ?? "")
  }

  // 저장된 태그가 기대와 다르면(서버 cleanInternalCsTags의 20개 상한에 걸려 잘린 경우)
  // 성공으로 위장하지 않고 알린다 — 조용히 목록에서 사라지는 것이 가장 나쁜 실패다.
  // 그래서 요청 본문이 아니라 응답이 돌려준 tags를 화면의 진실로 삼는다.
  async function patchConversationTags(id: string, tags: string[], fallback: InternalCsConversation) {
    if (demoMode) return { tags, updated_at: new Date().toISOString() }
    const response = await adminFetchJson<{ conversation: InternalCsConversation }>(
      `/api/admin/cs-chat/conversations/${id}`,
      { method: "PATCH", body: JSON.stringify({ action: "update", tags }) }
    )
    return {
      tags: response.conversation?.tags ?? [],
      updated_at: response.conversation?.updated_at ?? fallback.updated_at,
    }
  }

  // 대기열·내부 상담 → 본사 확인 대기. 축을 넘는 동선은 이 함수 하나로 모인다.
  async function requestHqConfirmation(conversation: InternalCsConversation) {
    if (hqPendingActionId) return
    // 이미 대기 중이면 태그를 다시 쓰지 않고 화면만 옮긴다.
    if (isHqPending(conversation)) {
      setHqExpandedId(conversation.id)
      setConversationParam(conversation.id)
      setActiveTab("hq")
      return
    }
    setHqPendingActionId(conversation.id)
    setError(null)
    try {
      const saved = await patchConversationTags(conversation.id, withHqPending(conversation.tags), conversation)
      if (!saved.tags.includes(HQ_PENDING_TAG)) {
        setError("본사 확인 태그가 저장되지 않았습니다. 대화 태그 수가 상한에 걸렸는지 확인해 주세요.")
        return
      }
      applyConversationPatch(conversation.id, saved)
      setHqExpandedId(conversation.id)
      setConversationParam(conversation.id)
      setActiveTab("hq")
      setNotice("본사 확인 대기로 보냈습니다. 초안을 복사해 본사에 전달해 주세요.")
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "본사 확인 요청을 저장하지 못했습니다.")
    } finally {
      setHqPendingActionId(null)
    }
  }

  // 회신 처리 — evidence:hq_pending을 빼고 evidence:confirmed를 넣으면 목록에서 빠진다.
  async function resolveHqConfirmation(conversation: InternalCsConversation) {
    if (hqPendingActionId) return
    setHqPendingActionId(conversation.id)
    setError(null)
    try {
      const saved = await patchConversationTags(conversation.id, withHqConfirmed(conversation.tags), conversation)
      if (saved.tags.includes(HQ_PENDING_TAG)) {
        setError("본사 확인 완료를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.")
        return
      }
      applyConversationPatch(conversation.id, saved)
      if (hqExpandedId === conversation.id) {
        setHqExpandedId(null)
        setConversationParam("")
      }
      setNotice("본사 회신을 반영했습니다. 대기 목록에서 제외됩니다.")
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "본사 확인 완료를 저장하지 못했습니다.")
    } finally {
      setHqPendingActionId(null)
    }
  }

  // 회귀 패널의 "대화 보기" — 대화 탭으로 전환하고 해당 대화를 직접 로드한다(사이드바 목록 의존 없음).
  function openConversationById(conversationId: string) {
    setActiveTab("chat")
    loadConversation(conversationId).catch((openError) => {
      setError(openError instanceof Error ? openError.message : "대화를 불러오지 못했습니다.")
    })
  }

  // 회귀 판정 버튼 — 기존 메시지 PATCH(regressionOutcome)를 재사용한다. 옵티미스틱 제거 후
  // 실패하면 목록 맨 앞에 복원하고 에러를 보여준다.
  async function judgeRegressionCandidate(
    item: RegressionCandidateItem,
    outcome: Exclude<RegressionOutcome, "not_evaluated">
  ) {
    setRegressionError(null)
    // 행을 지우지 않고 판정 결과로 바꿔 그린다 — 실수한 판정을 바로 알아챌 수 있고,
    // 목록 재조회 시 서버 정렬(미판정 우선)에 따라 자연스럽게 뒤로 밀린다.
    setRegressionCandidates((current) =>
      current.map((candidate) => (candidate.id === item.id ? { ...candidate, outcome } : candidate))
    )
    try {
      await adminFetchJson(`/api/admin/cs-chat/conversations/${item.conversationId}/messages/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ regressionOutcome: outcome }),
      })
    } catch (judgeError) {
      setRegressionCandidates((current) =>
        current.map((candidate) => (candidate.id === item.id ? { ...candidate, outcome: item.outcome } : candidate))
      )
      setRegressionError(judgeError instanceof Error ? judgeError.message : "회귀 판정을 저장하지 못했습니다.")
    }
  }

  // 계약 2 "자동 평가 실행" — 제안만 받아온다. DB의 regression_outcome은 이 함수로 절대 바뀌지 않으며,
  // 확정은 위 judgeRegressionCandidate(기존 판정 버튼)로만 이뤄진다.
  async function runRegressionAutoEval() {
    if (regressionEvalRunState === "running") return // 이중 클릭 방지
    // demoMode에서는 후보 목록이 항상 비어 실행 버튼이 비활성이라 여기 도달하지 않지만,
    // 버튼 활성 조건이 바뀌어도 데모에서 네트워크 호출이 새지 않도록 의도적으로 방어한다.
    if (demoMode) {
      setRegressionEvalRunState("done")
      setRegressionEvalSkipped([])
      setNotice("미리보기에는 평가할 회귀 후보가 없습니다. 실제 환경에서는 미판정 후보를 Gemini가 재평가해 제안합니다.")
      return
    }
    setRegressionEvalRunState("running")
    setRegressionEvalError(null)
    try {
      const response = await adminFetchJson<RegressionEvalResponse>("/api/admin/cs-chat/regression-eval", {
        method: "POST",
        body: JSON.stringify({}),
      })
      const items = Array.isArray(response.items) ? response.items : []
      const skipped = Array.isArray(response.skipped) ? response.skipped : []
      setRegressionSuggestions((current) => {
        const next = { ...current }
        for (const item of items) {
          next[item.messageId] = item
        }
        return next
      })
      setRegressionEvalSkipped(skipped)
      setRegressionEvalRunState("done")
      // 제안도 건너뜀도 없는 성공은 화면 변화가 전혀 없어 무반응처럼 보인다 — notice로 완료를 알린다.
      if (items.length === 0 && skipped.length === 0) {
        setNotice("자동 평가 완료 — 새 제안 없음")
      }
    } catch (evalError) {
      setRegressionEvalRunState("failed")
      setRegressionEvalError(evalError instanceof Error ? evalError.message : "자동 평가를 실행하지 못했습니다.")
    }
  }

  // 계약 3 "지식으로 승격" — 대상은 review_state=approved && corrected_content 존재.
  // 멱등(같은 메시지 재승격 시 reused:true로 기존 문서 갱신). 회귀 패널 항목과 대화 스레드의
  // 승인된 메시지 두 노출 지점이 이 함수 하나를 공유한다.
  async function promoteMessageToKnowledge(messageId: string) {
    if (promotingMessageId) return // 이중 클릭 방지(동시 승격 1건으로 제한)
    setPromotingMessageId(messageId)
    // 이전 실패 결과가 남아 있으면 재시도 스피너와 함께 잔상처럼 보이므로 시작 시 지운다.
    setPromotionResults((current) => {
      if (!(messageId in current)) return current
      const next = { ...current }
      delete next[messageId]
      return next
    })
    if (demoMode) {
      setPromotionResults((current) => ({
        ...current,
        [messageId]: { status: "error", error: "미리보기에서는 지식 승격을 실행할 수 없습니다. 실제 환경에서 시도해 주세요." },
      }))
      setPromotingMessageId(null)
      return
    }
    try {
      const response = await adminFetchJson<PromoteKnowledgeResponse>(
        `/api/admin/cs-chat/messages/${messageId}/promote-knowledge`,
        { method: "POST" }
      )
      setPromotionResults((current) => ({
        ...current,
        [messageId]: {
          status: "success",
          articleId: response.articleId,
          slug: response.slug,
          reused: response.reused,
          searchable: response.searchable,
        },
      }))
    } catch (promoteError) {
      setPromotionResults((current) => ({
        ...current,
        [messageId]: {
          status: "error",
          error: promoteError instanceof Error ? promoteError.message : "지식 승격에 실패했습니다.",
        },
      }))
    } finally {
      setPromotingMessageId(null)
    }
  }

  function archiveConversation() {
    if (!detail || isPending) return
    if (demoMode) {
      setDetail((current) => current ? { ...current, conversation: { ...current.conversation, status: "archived" } } : current)
      setConversations((current) => current.map((item) => item.id === detail.conversation.id ? { ...item, status: "archived" } : item))
      // 흡수 후 착지점 — 대기열 탭 + 종료·보관 칩(옛 아카이브 탭과 같은 행 집합).
      setQueueFilter("closed")
      setActiveTab("queue")
      setNotice("미리보기 대화를 아카이브했습니다.")
      return
    }
    startTransition(async () => {
      try {
        await adminFetchJson(`/api/admin/cs-chat/conversations/${detail.conversation.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "archive", archiveReason: "CS 담당자 수동 아카이브" }),
        })
        await loadConversations(null)
        setQueueFilter("closed")
        setActiveTab("queue")
        setNotice("대화를 아카이브했습니다.")
      } catch (archiveError) {
        setError(archiveError instanceof Error ? archiveError.message : "아카이브하지 못했습니다.")
      }
    })
  }

  function reopenConversation() {
    if (!detail || isPending) return
    if (demoMode) {
      setDetail((current) => current ? { ...current, conversation: { ...current.conversation, status: "queue" } } : current)
      setConversations((current) => current.map((item) => item.id === detail.conversation.id ? { ...item, status: "queue" } : item))
      setActiveTab("chat")
      setNotice("미리보기 대화를 다시 열었습니다.")
      return
    }
    startTransition(async () => {
      try {
        await adminFetchJson(`/api/admin/cs-chat/conversations/${detail.conversation.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "reopen" }),
        })
        await loadConversations(detail.conversation.id)
        setActiveTab("chat")
        setNotice("대화를 다시 대기열로 이동했습니다.")
      } catch (reopenError) {
        setError(reopenError instanceof Error ? reopenError.message : "대화를 다시 열지 못했습니다.")
      }
    })
  }
  return (
    // 콘솔 내비는 Suspense 바깥(기본 export)에서 이미 그려졌다 — 여기서는 그 아래 본문만 만든다.
    <>
      <WorkspaceHeader
        loading={loading}
        isPending={isPending}
        regressionPendingCount={regressionPendingCount}
        error={error}
        notice={notice}
        onRefresh={() => void loadConversations(selectedId)}
        onOpenTools={() => setActiveTab("tools")}
      />

      {/* 본문 영역 — 검토 드로어의 기준 요소다. 오버레이 시절 드로어는 root(fixed inset-0)에
          top-16(자체 헤더 높이)으로 걸려 있었는데, 그 헤더가 사라졌으므로 상수 대신
          "탭 패널이 차지하는 영역" 자체를 기준으로 삼아 inset-y-0로 잡는다. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
      {activeTab === "chat" ? (
        <ChatPanel
          detail={detail}
          loading={loading}
          isPending={isPending}
          reviewOpen={reviewOpen}
          setReviewOpen={setReviewOpen}
          selectedId={selectedId}
          queueConversations={queueConversations}
          handleSelect={handleSelect}
          startNewConversation={startNewConversation}
          modelMode={modelMode}
          setModelMode={setModelMode}
          requestHqConfirmation={requestHqConfirmation}
          hqPendingActionId={hqPendingActionId}
          pendingMessage={pendingMessage}
          latestAssistant={latestAssistant}
          expanded={expanded}
          setExpanded={setExpanded}
          rerunWithPro={rerunWithPro}
          copyText={copyText}
          communicationTemplates={communicationTemplates}
          regressionCandidate={regressionCandidate}
          setRegressionCandidate={setRegressionCandidate}
          promotingMessageId={promotingMessageId}
          promotionResults={promotionResults}
          promoteMessageToKnowledge={promoteMessageToKnowledge}
          assets={assets}
          selectedAsset={selectedAsset}
          setSelectedAssetId={setSelectedAssetId}
          assetReviewingId={assetReviewingId}
          approveSelectedAsset={approveSelectedAsset}
          submitQuestion={submitQuestion}
          fileInputRef={fileInputRef}
          handleAssetFiles={handleAssetFiles}
          pendingFiles={pendingFiles}
          removePendingFile={removePendingFile}
          uploadingAssets={uploadingAssets}
          uploadProgress={uploadProgress}
          assetError={assetError}
          composer={composer}
          setComposer={setComposer}
        />
      ) : null}

      {activeTab === "queue" ? (
        <QueuePanel
          conversations={filteredQueueConversations}
          filter={queueFilter}
          chipCounts={queueChipCounts}
          hqBusyId={hqPendingActionId}
          onNewConversation={startNewConversation}
          onFilterChange={setQueueFilter}
          onSelect={(item) => void handleSelect(item)}
          onRequestHq={(item) => void requestHqConfirmation(item)}
        />
      ) : null}

      {activeTab === "hq" ? (
        <HqPanel
          conversations={hqConversations}
          detailError={hqDetailError}
          expandedId={hqExpandedId}
          expandedDetail={hqDetail}
          busyId={hqPendingActionId}
          onToggleRow={toggleHqRow}
          onCopy={(text, success) => void copyText(text, success)}
          onOpenConversation={(conversation) => void handleSelect(conversation)}
          onResolve={(conversation) => void resolveHqConfirmation(conversation)}
        />
      ) : null}

      {activeTab === "tools" ? (
        <ToolsPanel
          docsGapsSummary={docsGapsSummary}
          regressionLoadState={regressionLoadState}
          regressionPendingCount={regressionPendingCount}
          bridgeState={bridgeState}
          integrationLoading={integrationLoading}
          metricsLoadState={metricsLoadState}
          metricCards={metricCards}
          regressionEvalRunState={regressionEvalRunState}
          regressionCandidates={regressionCandidates}
          regressionEvalError={regressionEvalError}
          regressionSuggestions={regressionSuggestions}
          regressionEvalSkippedSummary={regressionEvalSkippedSummary}
          regressionError={regressionError}
          promotingMessageId={promotingMessageId}
          promotionResults={promotionResults}
          bridgeDetailOpen={bridgeDetailOpen}
          includeOriginal={includeOriginal}
          integrationEvents={integrationEvents}
          integrationError={integrationError}
          hasDispatchContext={hasDispatchContext}
          dispatching={dispatching}
          onRetryMetrics={() => void loadCsMetrics()}
          onRunAutoEval={() => void runRegressionAutoEval()}
          onRetryRegression={() => void loadRegressionCandidates()}
          onJudge={(item, outcome) => void judgeRegressionCandidate(item, outcome)}
          onOpenConversation={openConversationById}
          onPromote={(messageId) => void promoteMessageToKnowledge(messageId)}
          onRefreshBridge={() => void loadIntegrationStatus()}
          onToggleBridgeDetail={() => setBridgeDetailOpen((current) => !current)}
          onDispatch={() => void dispatchCurrentConversation()}
          onIncludeOriginalChange={setIncludeOriginal}
        />
      ) : null}

      {/* 검토 드로어는 대화 탭에만 붙는다.
          드로어 내용(체크 3종·최종 답변·검토 메모)은 지금 열려 있는 그 대화의 검토라,
          목록(대기열·본사 확인)이나 운영 지표 위에 떠 있으면 가리키는 대상이 화면에 없다.
          게다가 양보(xl:pr-[438px])는 ChatPanel에만 걸려 있어 다른 탭에서는 본문 우측을
          그냥 덮었고, xl 미만에서는 스크림까지 얹혀 목록을 통째로 가렸다.
          reviewOpen/finalDraft/reviewNote는 여기(Inner) 상태라 탭을 다녀와도 그대로 복원된다. */}
      {activeTab === "chat" && reviewOpen ? (
        <ReviewDrawer
          reviewChecks={reviewChecks}
          finalDraft={finalDraft}
          reviewNote={reviewNote}
          regressionCandidate={regressionCandidate}
          excludeFromGapQueue={excludeFromGapQueue}
          pendingMessage={pendingMessage}
          isPending={isPending}
          canApprove={canApprove}
          onClose={() => setReviewOpen(false)}
          onCheckChange={(key, checked) => setReviewChecks((current) => ({ ...current, [key]: checked }))}
          onFinalDraftChange={setFinalDraft}
          onReviewNoteChange={setReviewNote}
          onRegressionCandidateChange={setRegressionCandidate}
          onExcludeFromGapQueueChange={setExcludeFromGapQueue}
          onSubmitReview={submitReview}
        />
      ) : null}

      {detail ? (
        <div className="pointer-events-none absolute right-4 bottom-4 z-20 hidden gap-2 sm:flex">
          {detail.conversation.status === "archived" ? (
            <button
              type="button"
              onClick={reopenConversation}
              className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-md border border-black/[0.08] bg-white px-3 text-[11px] font-semibold shadow-sm hover:bg-[#F6F5F4]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              다시 열기
            </button>
          ) : (
            <button
              type="button"
              onClick={archiveConversation}
              className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-md border border-black/[0.08] bg-white px-3 text-[11px] font-semibold text-[#615D59] shadow-sm hover:bg-[#F6F5F4] hover:text-[#31302E]"
            >
              <Archive className="h-3.5 w-3.5" />
              아카이브
            </button>
          )}
        </div>
      ) : null}
      </div>
    </>
  )
}

// useSearchParams()는 정적 렌더링 시 Suspense 경계를 요구한다. 페이지(app/admin/cs-chatbot/page.tsx)를
// 바꾸지 않고 이 컴포넌트 내부에서 해결한다.
// 오버레이 해제 후에는 셸 안쪽에서 본문 높이를 그대로 차지해야 스트리밍 중 점프가 없다.
function WorkspaceLoadingShell() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-white">
      <Loader2 className="h-5 w-5 animate-spin text-[#084734]" />
    </div>
  )
}

export default function InternalCsChatWorkspace() {
  return (
    // 오버레이(fixed inset-0 z-[80]) 해제 — 어드민 셸 안쪽의 일반 페이지다(§9).
    // 셸의 main은 lg에서 정확히 100dvh(좌우 패딩만 있고 상하 패딩 0)라 lg:h-[100dvh]가 그대로 맞고,
    // lg 미만에서는 main의 pt-16 pb-24(=10rem, 모바일 상단바·하단탭바 자리)만큼 빼면 뷰포트에 딱 맞는다.
    // 콘솔 내비는 Suspense 바깥에 둬서 본문이 스트리밍되는 동안에도 자리를 지킨다.
    <div className="flex h-[calc(100dvh-10rem)] min-h-[560px] flex-col overflow-hidden bg-white font-sans text-[#111110] lg:h-[100dvh]">
      <CsConsoleNav className="shrink-0" />
      <Suspense fallback={<WorkspaceLoadingShell />}>
        <InternalCsChatWorkspaceInner />
      </Suspense>
    </div>
  )
}
