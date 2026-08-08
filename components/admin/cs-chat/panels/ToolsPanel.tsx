"use client"

import Link from "next/link"
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Send,
  Sparkles,
  Wifi,
  WifiOff,
  type LucideIcon,
} from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef } from "react"

import { useUrlState } from "@/lib/use-url-state"
import { cn } from "@/lib/utils"

import AdminTabs from "../../AdminTabs"
import MetricCard from "../components/MetricCard"
import PromoteKnowledgeControl from "../components/PromoteKnowledgeControl"
import {
  CONSOLE_CONTENT_CLASS,
  DEFAULT_TOOLS_SUB,
  OPERATING_TOOLS,
  REVIEW_META,
  TOOLS_SUBTABS,
  type ToolsSub,
} from "../constants"
import {
  formatDay,
  formatTime,
  integrationEventSummary,
  integrationEventWhen,
  type integrationState,
} from "../formatters"
import {
  REGRESSION_JUDGE_ACTIONS,
  regressionOutcomeChip,
  type DocsGapsDeskSummary,
} from "../ops-desk"
import type {
  AsyncLoadState,
  InternalCsIntegrationEvent,
  PromotionResult,
  RegressionCandidateItem,
  RegressionEvalItem,
  RegressionEvalRunState,
  RegressionOutcome,
  ReviewState,
} from "../types"

// 운영 데스크 — 스탯 스트립 · 운영 지표(계약 1) · 회귀 검수(계약 2) · AI 브리지 + 운영 화면 바로가기.
// 상태와 페치는 전부 워크스페이스(Inner)에 남는다: 탭이 언마운트돼도 값이 살아 있어야
// `?tab=` 왕복에서 재페치가 늘지 않는다. 이 컴포넌트는 그 값을 그리기만 한다.
export default function ToolsPanel({
  docsGapsSummary,
  regressionLoadState,
  regressionPendingCount,
  bridgeState,
  integrationLoading,
  metricsLoadState,
  metricCards,
  regressionEvalRunState,
  regressionCandidates,
  regressionEvalError,
  regressionSuggestions,
  regressionEvalSkippedSummary,
  regressionError,
  promotingMessageId,
  promotionResults,
  bridgeDetailOpen,
  includeOriginal,
  integrationEvents,
  integrationError,
  hasDispatchContext,
  dispatching,
  onRetryMetrics,
  onRunAutoEval,
  onRetryRegression,
  onJudge,
  onOpenConversation,
  onPromote,
  onRefreshBridge,
  onToggleBridgeDetail,
  onDispatch,
  onIncludeOriginalChange,
}: {
  docsGapsSummary: DocsGapsDeskSummary | null
  regressionLoadState: AsyncLoadState
  regressionPendingCount: number
  bridgeState: ReturnType<typeof integrationState>
  integrationLoading: boolean
  metricsLoadState: AsyncLoadState
  metricCards: Array<{ key: string; icon: LucideIcon; label: string; value: string; sub?: string }>
  regressionEvalRunState: RegressionEvalRunState
  regressionCandidates: RegressionCandidateItem[]
  regressionEvalError: string | null
  regressionSuggestions: Record<string, RegressionEvalItem>
  regressionEvalSkippedSummary: string | null
  regressionError: string | null
  promotingMessageId: string | null
  promotionResults: Record<string, PromotionResult>
  bridgeDetailOpen: boolean
  includeOriginal: boolean
  integrationEvents: InternalCsIntegrationEvent[]
  integrationError: string | null
  hasDispatchContext: boolean
  dispatching: boolean
  onRetryMetrics: () => void
  onRunAutoEval: () => void
  onRetryRegression: () => void
  onJudge: (item: RegressionCandidateItem, outcome: Exclude<RegressionOutcome, "not_evaluated">) => void
  onOpenConversation: (conversationId: string) => void
  onPromote: (messageId: string) => void
  onRefreshBridge: () => void
  onToggleBridgeDetail: () => void
  onDispatch: () => void
  onIncludeOriginalChange: (checked: boolean) => void
}) {
  // 읽기는 useUrlState(window.location)만 쓴다 — `tab`처럼 `searchParams.get() ?? …`으로
  // 합성하지 않는다. 합성이 필요한 쪽은 `<Link>`가 값을 실어 나르는 키다(콘솔 내비가
  // ?tab=tools를 들고 오므로 `tab`은 라우터 값이 먼저 맞는다). `sub`를 쓰는 창구는 아래
  // AdminTabs 하나뿐이고 그 쓰기는 replaceState라 location이 항상 먼저 맞는다.
  // 실측: 라우터가 그 replaceState를 따라잡는 데 개발 서버에서 ~1초가 걸렸다 —
  // searchParams를 읽기에 얹었다면 그 1초 동안 직전 하위탭이 다시 그려졌을 것이다.
  const [subParam, setSubParam] = useUrlState("sub", DEFAULT_TOOLS_SUB)
  const activeSub: ToolsSub = TOOLS_SUBTABS.some((item) => item.value === subParam)
    ? (subParam as ToolsSub)
    : DEFAULT_TOOLS_SUB

  // …다만 반대 방향으로 한 구멍이 남는다(실측으로 재현했다).
  // 콘솔 내비의 `운영 도구` href에는 `sub`가 없어서, ?tab=tools&sub=bridge 상태로 그 메뉴를
  // 다시 누르면 URL에서는 sub가 사라지는데 useUrlState는 그걸 못 본다 —
  // Next의 <Link>는 pushState로 주소를 바꾸고 pushState는 popstate를 쏘지 않기 때문이다.
  // 그래서 searchParams는 읽기가 아니라 "라우터가 주소를 커밋했다"는 신호로만 쓴다:
  // 커밋된 쿼리 문자열이 실제로 바뀌었고 그 안에 sub가 없으면 기본 탭으로 되돌린다.
  // 우리 replaceState는 커밋 문자열을 바꾸지 않은 채 먼저 반영되므로(위 ~1초 지연) 이 이펙트에
  // 걸리지 않고, 뒤늦게 커밋될 때는 sub가 들어 있어 되돌림 대상이 아니다 — 경합이 없다.
  const searchParams = useSearchParams()
  const committedSearch = searchParams.toString()
  const lastCommittedSearch = useRef(committedSearch)
  useEffect(() => {
    if (lastCommittedSearch.current === committedSearch) return
    lastCommittedSearch.current = committedSearch
    if (new URLSearchParams(committedSearch).get("sub") === null) setSubParam(DEFAULT_TOOLS_SUB)
  }, [committedSearch, setSubParam])

  // 하위탭을 옮기면 스크롤을 위로 돌린다 — 긴 회귀 목록을 내려보다 지표 탭으로 가면
  // 짧은 본문이 스크롤된 채 나타나 빈 화면처럼 보인다.
  const scrollRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [activeSub])

  return (
    <section ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-[#FAFAF8]">
      <div className={cn(CONSOLE_CONTENT_CLASS, "py-7")}>
      <div className="mx-auto max-w-[920px]">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em]">운영 데스크</h2>
        <p className="mt-1 text-[12px] text-[#615D59]">오늘 처리할 검수와 큐 상태를 한 화면에서 확인합니다.</p>

        {/* 하위탭 — 공용 AdminTabs를 subtle로 재사용한다(전용 탭 컴포넌트를 새로 만들지 않는다).
            내부 축이라 액센트는 웜 뉴트럴 계열이고 바이올렛은 쓰지 않는다(IA 문서 §8). */}
        <AdminTabs
          className="mt-5"
          items={TOOLS_SUBTABS.map((item) => ({
            ...item,
            badge:
              item.value === "regression" && regressionLoadState === "loaded" && regressionPendingCount > 0
                ? regressionPendingCount
                : undefined,
          }))}
          value={activeSub}
          onValueChange={(next) => setSubParam(next)}
          label="운영 도구 하위 화면"
          variant="subtle"
        />

        {/* ── sub=metrics — 큐 요약 스탯 스트립 + 운영 지표 7일. 둘 다 관측이고 판정하지 않는다. */}
        {activeSub === "metrics" ? (
        <>
        {/* 스탯 스트립 — 라이브 지표가 먼저. 파스텔 채움 없이 흰 카드 + 헤어라인 분할(에디토리얼). */}
        <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-[10px] border border-black/[0.08] bg-white sm:grid-cols-4">
          {/* 두 카드가 나눠 보여주는 건수 그대로 착지하도록 `source` 프리셋을 붙인다 —
              ?tab=gaps&source=chatbot|internal_cs 는 이미 구현된 인바운드 계약이다
              (계약 1: 인바운드 전용 · 칩 클릭은 URL에 역기록하지 않는다). */}
          <Link
            href="/admin/docs?tab=gaps&source=chatbot"
            className="group relative border-b border-black/[0.08] px-5 py-4 transition-colors hover:bg-[#FAFAF8] sm:border-b-0"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#A39E98]">보강 큐 · 챗봇</p>
            <p className="mt-2 text-[27px] font-bold leading-none tracking-[-0.02em] text-[#111110] tabular-nums">
              {docsGapsSummary ? `${docsGapsSummary.chatbot}${docsGapsSummary.capped ? "+" : ""}` : "—"}
            </p>
            <p className="mt-1.5 truncate text-[10.5px] text-[#A39E98]">
              {docsGapsSummary ? `무결과 검색 ${docsGapsSummary.zeroResult} 별도` : "집계 대기"}
            </p>
            <ArrowUpRight className="absolute right-4 top-4 h-3.5 w-3.5 text-[#D8D5D1] transition-colors group-hover:text-[#084734]" />
          </Link>
          <Link
            href="/admin/docs?tab=gaps&source=internal_cs"
            className="group relative border-b border-l border-black/[0.08] px-5 py-4 transition-colors hover:bg-[#FAFAF8] sm:border-b-0"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#A39E98]">보강 큐 · 내부 CS</p>
            <p className="mt-2 text-[27px] font-bold leading-none tracking-[-0.02em] text-[#111110] tabular-nums">
              {docsGapsSummary ? docsGapsSummary.internalCs : "—"}
            </p>
            <p className="mt-1.5 truncate text-[10.5px] text-[#A39E98]">
              {docsGapsSummary
                ? `폴백 ${docsGapsSummary.internalCsFallback} · 수정 요청 ${docsGapsSummary.internalCsReview}`
                : "집계 대기"}
            </p>
            <ArrowUpRight className="absolute right-4 top-4 h-3.5 w-3.5 text-[#D8D5D1] transition-colors group-hover:text-[#084734]" />
          </Link>
          {/* 하위탭 도입 전에는 같은 화면 아래쪽 회귀 섹션으로 scrollIntoView 점프였다.
              두 덩어리가 다른 탭으로 갈리면서 그 점프는 성립하지 않는다 — 탭 전환으로 바꾼다.
              전환 후 회귀 섹션이 탭 본문의 맨 위라 별도 스크롤이 필요 없다(위 scrollTo(0)). */}
          <button
            type="button"
            onClick={() => setSubParam("regression")}
            className="group relative border-black/[0.08] px-5 py-4 text-left transition-colors hover:bg-[#FAFAF8] sm:border-l"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#A39E98]">회귀 검수 대기</p>
            <p className="mt-2 text-[27px] font-bold leading-none tracking-[-0.02em] text-[#111110] tabular-nums">
              {regressionLoadState === "loaded" ? regressionPendingCount : "—"}
            </p>
            <p className="mt-1.5 truncate text-[10.5px] text-[#A39E98]">회귀 검수 탭에서 바로 판정</p>
            <ArrowUpRight className="absolute right-4 top-4 h-3.5 w-3.5 text-[#D8D5D1] transition-colors group-hover:text-[#084734]" />
          </button>
          <div className="relative border-l border-black/[0.08] px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#A39E98]">AI 브리지</p>
            <p className="mt-3.5 flex items-center gap-2 text-[14px] font-bold leading-none text-[#111110]">
              <span className={cn("h-[7px] w-[7px] rounded-full", bridgeState.ready ? "bg-[#084734]" : "bg-[#A8741A]")} />
              {integrationLoading ? "확인 중" : bridgeState.ready ? "연결됨" : bridgeState.configured ? bridgeState.status : "설정 필요"}
            </p>
            <p className="mt-2 truncate text-[10.5px] text-[#A39E98] tabular-nums">
              {bridgeState.lastCheckedAt ? `마지막 확인 ${formatTime(bridgeState.lastCheckedAt)}` : "상태 미확인"}
            </p>
          </div>
        </div>

        {/* 코파일럿 운영 지표 (계약 1) — 최근 7일 성과. 큐(스탯 스트립) 다음, 일감(회귀) 이전. */}
        <div className="mt-8 flex items-baseline justify-between gap-3">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#31302E]">
            운영 지표 <span className="font-medium normal-case tracking-normal text-[#A39E98]">최근 7일</span>
          </h3>
          {metricsLoadState === "failed" ? (
            <button
              type="button"
              onClick={() => onRetryMetrics()}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-black/[0.08] px-2.5 text-[10px] font-semibold text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#31302E]"
            >
              <RefreshCcw className="h-3 w-3" />
              다시 시도
            </button>
          ) : null}
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {metricCards.map((card) => (
            <MetricCard key={card.key} icon={card.icon} label={card.label} value={card.value} sub={card.sub} />
          ))}
        </div>
        </>
        ) : null}

        {/* ── sub=regression(기본) — 데스크의 유일한 일감. 자동 평가(계약 2)는 제안만 만든다.
            탭 바 순서는 회귀 → 지표 → 브리지지만 소스 순서는 원래 자리를 지킨다(diff 최소화).
            한 번에 한 탭만 렌더되므로 소스 순서는 화면에 드러나지 않는다. */}
        {activeSub === "regression" ? (
        <>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-baseline gap-2.5 text-[10px] font-bold uppercase tracking-[0.13em] text-[#31302E]">
            <span>회귀 검수 대기</span>
            {regressionLoadState === "loaded" ? (
              <span className="font-medium normal-case tracking-normal text-[#A39E98] tabular-nums">
                미판정 {regressionPendingCount}건 · 전체 {regressionCandidates.length}건
              </span>
            ) : null}
          </h3>
          <button
            type="button"
            onClick={() => onRunAutoEval()}
            disabled={
              regressionEvalRunState === "running" || regressionLoadState !== "loaded" || regressionCandidates.length === 0
            }
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-black/[0.08] px-2.5 text-[10px] font-semibold text-[#084734] hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:text-[#A39E98] disabled:hover:bg-transparent"
          >
            {regressionEvalRunState === "running" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {regressionEvalRunState === "running" ? "평가 중" : "자동 평가 실행"}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] leading-4 text-[#A39E98]">
          AI가 통과 / 수정 필요를 참고용으로만 제안합니다. 실제 판정은 행의 버튼으로 직접 확정해야 저장됩니다.
        </p>
        {regressionEvalError ? (
          <p className="mt-1.5 flex items-start gap-2 text-[11px] text-[#8F2C2C]" role="alert">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {regressionEvalError}
          </p>
        ) : null}
        <div className="mt-2.5 overflow-hidden rounded-[10px] border border-black/[0.08] bg-white">
          {regressionLoadState === "idle" || regressionLoadState === "loading" ? (
            <div className="flex items-center justify-center gap-2 px-5 py-8 text-[12px] text-[#615D59]">
              <Loader2 className="h-4 w-4 animate-spin" />
              회귀 후보를 불러오는 중입니다.
            </div>
          ) : regressionLoadState === "failed" ? (
            <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
              <p className="text-[12px] text-[#615D59]">회귀 후보 목록을 불러오지 못했습니다.</p>
              <button
                type="button"
                onClick={() => onRetryRegression()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/[0.08] px-3 text-[11px] font-semibold text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#31302E]"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                다시 시도
              </button>
            </div>
          ) : regressionCandidates.length === 0 ? (
            <p className="px-5 py-8 text-center text-[12px] text-[#615D59]">판정이 필요한 회귀 후보가 없습니다.</p>
          ) : (
            <ul>
              {regressionCandidates.map((item) => {
                const judgedChip = regressionOutcomeChip(item.outcome)
                const reviewLabel = REVIEW_META[item.reviewState as ReviewState]?.label
                const suggestion = regressionSuggestions[item.id]
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex flex-col gap-2 border-b border-black/[0.08] px-4 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between",
                      judgedChip && "bg-[#FAFAF8]"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={cn("line-clamp-2 text-[12.5px] leading-5", judgedChip ? "text-[#A39E98]" : "text-[#31302E]")}>
                        {item.excerpt}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[#A39E98]">
                        {reviewLabel ? (
                          <span className="inline-flex h-[17px] items-center rounded-full border border-black/[0.10] bg-white px-2 text-[9px] font-semibold text-[#615D59]">
                            내부CS · {reviewLabel}
                          </span>
                        ) : null}
                        <span className="tabular-nums">{formatDay(item.capturedAt)} {formatTime(item.capturedAt)}</span>
                        {/* 자동 평가 제안(계약 2) — 판정 전 참고용, 메타 행에 인라인 배지로. 판정이 끝난 행에는 숨긴다. */}
                        {suggestion && !judgedChip ? (
                          <span
                            className={cn(
                              "inline-flex h-[17px] items-center gap-1 rounded-full px-2 text-[9px] font-semibold",
                              suggestion.suggestedOutcome === "pass"
                                ? "bg-[#ECFDF5] text-[#084734]"
                                : "bg-[#FBF1E0] text-[#7A520F]"
                            )}
                          >
                            <Sparkles className="h-2.5 w-2.5" />
                            제안 · {suggestion.suggestedOutcome === "pass" ? "통과" : "수정 필요"}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onOpenConversation(item.conversationId)}
                          className="inline-flex items-center gap-1 font-semibold text-[#084734] hover:underline"
                        >
                          대화 보기
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </div>
                      {suggestion && !judgedChip ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] font-medium text-[#084734] hover:underline">
                            AI 판단 근거
                          </summary>
                          <p className="mt-1 max-w-[420px] text-[10px] leading-4 text-[#615D59]">
                            {suggestion.rationale}
                          </p>
                          <p className="mt-1 text-[10px] text-[#A39E98]">판정 모델: {suggestion.judgeModel}</p>
                        </details>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 self-start sm:self-center">
                      {judgedChip ? (
                        <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[10px] font-bold", judgedChip.className)}>
                          <CheckCircle2 className="h-3 w-3" />
                          {judgedChip.label}
                        </span>
                      ) : (
                        <div className="flex overflow-hidden rounded-[7px] border border-black/[0.12]" role="group" aria-label={`회귀 판정: ${item.excerpt}`}>
                          {REGRESSION_JUDGE_ACTIONS.map((action, index) => (
                            <button
                              key={action.value}
                              type="button"
                              onClick={() => onJudge(item, action.value)}
                              className={cn(
                                "h-6 bg-white px-2 text-[10px] font-semibold text-[#31302E] transition-colors",
                                index > 0 && "border-l border-black/[0.10]",
                                action.hoverClassName
                              )}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* 지식 승격(계약 3) — hasCorrectedContent 부재(구응답)면 approved 휴리스틱만으로 노출.
                          compact — 판정 버튼(1차 액션) 옆 보조 액션이라 기본 중립, hover에서만 강조색. */}
                      {item.reviewState === "approved" && (item.hasCorrectedContent ?? true) ? (
                        <PromoteKnowledgeControl
                          compact
                          pending={promotingMessageId === item.id}
                          result={promotionResults[item.id]}
                          onPromote={() => onPromote(item.id)}
                        />
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        {/* 목록이 비면 "판정이 필요한 회귀 후보가 없습니다" 빈 상태 문구와 모순되므로 skipped 경고를 숨긴다. */}
        {regressionCandidates.length > 0 && regressionEvalSkippedSummary ? (
          <p className="mt-2 flex items-start gap-2 text-[11px] text-[#7A520F]" role="status">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {regressionEvalSkippedSummary}
          </p>
        ) : null}
        {regressionError ? (
          <p className="mt-2 flex items-start gap-2 text-[11px] text-[#8F2C2C]" role="alert">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {regressionError}
          </p>
        ) : null}
        </>
        ) : null}

        {/* ── sub=bridge — 설정·연동. AI 브리지 한 줄 요약 행 + 전송 옵션/최근 기록 펼침. */}
        {activeSub === "bridge" ? (
        <>
        <h3 className="mt-5 text-[10px] font-bold uppercase tracking-[0.13em] text-[#31302E]">내부 AI/MCP 분석</h3>
        <div className="mt-2.5 overflow-hidden rounded-[10px] border border-black/[0.08] bg-white">
          <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <span className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
              bridgeState.ready ? "bg-[#ECFDF5] text-[#084734]" : "bg-[#F6F5F4] text-[#615D59]"
            )}>
              {integrationLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : bridgeState.ready ? (
                <Wifi className="h-4 w-4" />
              ) : (
                <WifiOff className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-[#31302E]">{bridgeState.label}</p>
              <p className="mt-0.5 truncate text-[10.5px] text-[#A39E98]">{bridgeState.message}</p>
            </div>
            <button
              type="button"
              onClick={() => onRefreshBridge()}
              disabled={integrationLoading}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/[0.08] px-2.5 text-[11px] font-semibold text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#31302E] disabled:opacity-40"
            >
              <RefreshCcw className={cn("h-3.5 w-3.5", integrationLoading && "animate-spin")} />
              상태 확인
            </button>
            <button
              type="button"
              onClick={() => onToggleBridgeDetail()}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#31302E]"
              aria-expanded={bridgeDetailOpen}
            >
              전송 옵션
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", bridgeDetailOpen && "rotate-180")} />
            </button>
            <button
              type="button"
              onClick={() => onDispatch()}
              disabled={!hasDispatchContext || !bridgeState.ready || integrationLoading || dispatching}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-[#084734] px-3 text-[11px] font-semibold text-white hover:bg-[#065C41] disabled:cursor-not-allowed disabled:bg-[#A39E98]"
            >
              {dispatching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {dispatching ? "전송 중" : "현재 대화 보내기"}
            </button>
          </div>

          {bridgeDetailOpen ? (
            <div className="border-t border-black/[0.06] bg-[#FAFAF8] px-5 py-4">
              <p className="text-[11px] leading-5 text-[#615D59]">
                기본 전송은 메시지 맥락과 이미지 분석 텍스트만 포함합니다. 분석 결과는 검토 전 초안으로 돌아옵니다.
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] leading-5 text-[#615D59]">
                <input
                  type="checkbox"
                  checked={includeOriginal}
                  onChange={(event) => onIncludeOriginalChange(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#084734]"
                />
                <span>
                  원본 이미지도 포함
                  <span className="block text-[10px] text-[#A39E98]">민감정보 포함 가능성을 확인했으며 내부 분석 범위로 전송합니다.</span>
                </span>
              </label>
              {integrationEvents.length > 0 ? (
                <>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold text-[#31302E]">최근 연동 기록</p>
                    <span className="text-[10px] text-[#A39E98] tabular-nums">{integrationEvents.length}건</span>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {integrationEvents.slice(0, 5).map((event) => {
                      const successful = ["sent", "success", "completed", "ok"].includes((event.status ?? "").toLowerCase())
                      return (
                        <li key={event.id} className="flex items-start gap-3 rounded-md border border-black/[0.08] bg-white px-3 py-2.5">
                          {successful ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#084734]" />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#A8741A]" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-semibold text-[#31302E]">
                              {event.transport ?? event.integration ?? event.source_system ?? "AI 브리지"} · {event.status ?? "처리 중"}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-[#615D59]">{integrationEventSummary(event)}</p>
                          </div>
                          <span className="shrink-0 text-[10px] text-[#A39E98]">{formatTime(integrationEventWhen(event))}</span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}

          {integrationError ? (
            <p className="mx-5 mb-4 mt-1 flex items-start gap-2 rounded-md bg-[#FCE9E9] px-3 py-2 text-[11px] text-[#8F2C2C]" role="alert">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {integrationError}
            </p>
          ) : null}
        </div>

        {/* 콘솔 밖 바로가기 — 6개 → 1개(constants.ts 참조).
            나머지 5개는 CS 콘솔 가로 메뉴와 목적지가 그대로 겹쳐 지웠다.
            남은 하나는 설정(연동)이라 콘솔 밖 표면이고, 성격상 이 브리지 탭이 제자리다. */}
        <h3 className="mt-8 text-[10px] font-bold uppercase tracking-[0.13em] text-[#31302E]">콘솔 밖 바로가기</h3>
        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OPERATING_TOOLS.map((tool) => {
            const Icon = tool.icon
            return (
              <Link
                // 콘솔 메뉴와 겹치던 항목을 걷어내면서 href가 유일해졌다 — 키를 href로 되돌린다.
                key={tool.href}
                href={tool.href}
                className="group flex items-center gap-3 rounded-[9px] border border-black/[0.08] bg-white px-3.5 py-3 transition-colors hover:border-[#084734]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[#F6F5F4] text-[#31302E] transition-colors group-hover:bg-[#ECFDF5] group-hover:text-[#084734]">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-[#31302E]">{tool.title}</span>
                  <span className="mt-0.5 block truncate text-[10.5px] text-[#A39E98]">{tool.description}</span>
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#D8D5D1] transition-colors group-hover:text-[#084734]" />
              </Link>
            )
          })}
        </div>
        </>
        ) : null}
      </div>
      </div>
    </section>
  )
}
