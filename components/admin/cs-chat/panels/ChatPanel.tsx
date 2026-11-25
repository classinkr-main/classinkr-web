"use client"

import Image from "next/image"
import {
  AlertTriangle,
  ArrowDown,
  BookOpen,
  Building,
  CheckCircle2,
  Eraser,
  ExternalLink,
  FileCheck2,
  HelpCircle,
  History,
  ImageIcon,
  Loader2,
  LockKeyhole,
  MessageSquare,
  MessageSquarePlus,
  Paperclip,
  PanelRightOpen,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react"
import { type ChangeEvent, type FormEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react"

import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import { ClassInInternalAIIcon } from "@/components/ui/ClassInInternalAIIcon"
import { cn } from "@/lib/utils"

import AnswerFooterChip from "../components/AnswerFooterChip"
import ModelStatusBanner from "../components/ModelStatusBanner"
import CommunicationTabs from "../components/CommunicationTabs"
import ConversationContextCard from "../components/ConversationContextCard"
import ConversationSwitcher from "../components/ConversationSwitcher"
import PromoteKnowledgeControl from "../components/PromoteKnowledgeControl"
import QuickPromptChips from "../components/QuickPromptChips"
import ToolbarMoreMenu from "../components/ToolbarMoreMenu"
import SmartActionCard from "../components/SmartActionCard"
import StatusBadge from "../components/StatusBadge"
import { shouldSubmitComposerOnKeyDown } from "../composer-keyboard"
import {
  CONSOLE_CONTENT_CLASS,
  MAX_PENDING_ASSETS,
  MODEL_MODE_SEGMENTS,
  REVIEW_META,
} from "../constants"
import {
  assetAnalysis,
  assetAnalysisStatus,
  assetFileName,
  assetNeedsHumanReview,
  assetSensitiveWarnings,
  assetPreviewUrl,
  fileKey,
  formatTime,
  maskAssetFileName,
  normalizeSourceRefs,
  sourceLink,
  sourceStatus,
} from "../formatters"
import {
  describeMessageSpeaker,
  isContextResetMessage,
  isDeterministicDraft,
  lastContextBoundaryIndex,
  readContextCard,
  readFailureKinds,
  turnsSinceBoundary,
} from "../ops-desk"
import { useEscalation } from "../use-escalation"
import { isHqPending } from "../hq-desk"
import type {
  ConversationDetailResponse,
  InternalCsAsset,
  InternalCsConversation,
  InternalCsMessage,
  ModelMode,
  PromotionResult,
} from "../types"
import type { InflightTurn, WorkspaceBand } from "../InternalCsChatWorkspace"

export type ChatAnswerDisclosure = "sources" | "hq" | "regression" | null

export default function ChatPanel({
  detail,
  loading,
  isPending,
  reviewOpen,
  setReviewOpen,
  onOpenReview,
  onRejectDraft,
  scrollToMessage,
  generating = null,
  focusRequest = 0,
  band = null,
  onUndoBand,
  onRejectPending,
  onClearContext,
  contextResetPending = false,
  restoredAttachmentNames = [],
  onRefresh,
  refreshing = false,
  regressionPendingCount = 0,
  onOpenTools,
  onReopenConversation,
  onArchiveConversation,
  listError = null,
  onRetryLoad,
  selectedId,
  queueConversations,
  handleSelect,
  startNewConversation,
  modelMode,
  setModelMode,
  requestHqConfirmation,
  hqPendingActionId,
  pendingMessage,
  latestAssistant,
  expanded,
  setExpanded,
  rerunWithPro,
  copyText,
  communicationTemplates,
  regressionCandidate,
  setRegressionCandidate,
  promotingMessageId,
  promotionResults,
  promoteMessageToKnowledge,
  assets,
  selectedAsset,
  setSelectedAssetId,
  assetReviewingId,
  approveSelectedAsset,
  submitQuestion,
  fileInputRef,
  handleAssetFiles,
  pendingFiles,
  removePendingFile,
  uploadingAssets,
  uploadProgress,
  assetError,
  composer,
  setComposer,
}: {
  detail: ConversationDetailResponse | null
  loading: boolean
  isPending: boolean
  reviewOpen: boolean
  setReviewOpen: (open: boolean) => void
  /** 검토 드로어를 열고 그 초안으로 스레드를 스크롤한다. 없으면 setReviewOpen(true)만 한다. */
  onOpenReview?: (messageId?: string) => void
  /** 초안을 '사용 안 함'으로 치운다(IC-13). */
  onRejectDraft?: (messageId: string) => void
  /** 이 시각 이후 이 id 의 메시지로 스크롤한다(검토 열기). nonce 가 바뀔 때마다 한 번 움직인다. */
  scrollToMessage?: { id: string; nonce: number } | null
  /** 답을 기다리는 요청. 보낸 질문 말풍선과 '쓰는 중' 표시를 그린다(IC-15). */
  generating?: InflightTurn | null
  /** 값이 바뀔 때마다 입력창(정밀 포인터) 또는 대화 제목(그 밖)으로 포커스를 옮긴다. */
  focusRequest?: number
  /** 입력창 위 되돌리기 띠(맥락 비우기·새 상담). */
  band?: WorkspaceBand | null
  onUndoBand?: () => void
  onRejectPending?: () => void
  onClearContext?: () => void
  contextResetPending?: boolean
  /** 새로고침 뒤에는 첨부 파일 자체는 없고 이름만 남는다 — '다시 첨부' 안내에 쓴다. */
  restoredAttachmentNames?: string[]
  onRefresh?: () => void
  refreshing?: boolean
  regressionPendingCount?: number
  onOpenTools?: () => void
  /** 보관된 대화를 다시 열고 묻는다(IC-27). */
  onReopenConversation?: () => void
  /** 지금 보는 상담을 보관한다(툴바 '더보기'). 보관 뒤 되돌리기 띠는 대기열 화면이 그린다(IC-24). */
  onArchiveConversation?: () => void
  /** 대화 목록을 불러오지 못한 이유. 있고 열린 대화가 없으면 오류 블록을 보이고 입력창을 막는다(IC-23). */
  listError?: string | null
  onRetryLoad?: () => void
  selectedId: string | null
  queueConversations: InternalCsConversation[]
  handleSelect: (conversation: InternalCsConversation) => void
  startNewConversation: () => void
  modelMode: ModelMode
  setModelMode: (mode: ModelMode) => void
  requestHqConfirmation: (conversation: InternalCsConversation) => void
  hqPendingActionId: string | null
  pendingMessage: InternalCsMessage | null
  latestAssistant: InternalCsMessage | null
  expanded: ChatAnswerDisclosure
  setExpanded: (value: ChatAnswerDisclosure) => void
  rerunWithPro: () => void
  copyText: (text: string, success: string) => void
  communicationTemplates: Array<{ id: string; label: string; content: string }>
  regressionCandidate: boolean
  setRegressionCandidate: (value: boolean) => void
  promotingMessageId: string | null
  promotionResults: Record<string, PromotionResult>
  promoteMessageToKnowledge: (messageId: string) => void
  assets: InternalCsAsset[]
  selectedAsset: InternalCsAsset | null
  setSelectedAssetId: (id: string | null) => void
  assetReviewingId: string | null
  approveSelectedAsset: () => void
  submitQuestion: (event: FormEvent) => void
  fileInputRef: RefObject<HTMLInputElement | null>
  handleAssetFiles: (event: ChangeEvent<HTMLInputElement>) => void
  pendingFiles: File[]
  removePendingFile: (file: File) => void
  uploadingAssets: boolean
  uploadProgress: { current: number; total: number }
  assetError: string | null
  composer: string
  setComposer: (value: string) => void
}) {
  // 칩의 도메인 표시는 서버 결과를 쓴다(B2 — 담당 표는 server-only). 대기·오류 중에는 칩 글만 보인다.
  const escalationContext = useEscalation(detail).result?.context ?? null
  const openReview = (messageId?: string) => {
    if (onOpenReview) onOpenReview(messageId)
    else setReviewOpen(true)
  }
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  // 검토 열기 — 대상 초안의 머리가 보이는 영역 안에 오도록 스크롤한다(IC-01·IC-14).
  const scrollNonce = scrollToMessage?.nonce
  const scrollTargetId = scrollToMessage?.id
  useEffect(() => {
    if (!scrollTargetId) return
    const scroller = scrollerRef.current
    const target = scroller?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(scrollTargetId)}"]`)
    if (!scroller || !target) return
    const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    scroller.scrollTo({ top: Math.max(0, offset - 12), behavior: "auto" })
  }, [scrollNonce, scrollTargetId])

  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  // 새 상담·맥락 비우기·되돌리기 뒤 포커스 — 정밀 포인터면 입력창, 아니면 대화 제목으로(newChatDesign §6).
  useEffect(() => {
    if (!focusRequest) return
    const fine = typeof window !== "undefined" && typeof window.matchMedia === "function"
      && window.matchMedia("(pointer: fine)").matches
    ;(fine ? composerRef.current : headingRef.current)?.focus()
  }, [focusRequest])

  // 스크롤 규칙(IC-15): 대화를 열면 마지막 초안의 머리로, 새 초안이 오면 그 머리로 가되
  // 위로 올려 읽는 중이면 움직이지 않고 '새 초안 ↓' 버튼만 띄운다. 보낸 직후에는 맨 아래로 간다.
  const [sensitiveAck, setSensitiveAck] = useState<Record<string, boolean>>({})
  const [nearBottom, setNearBottom] = useState(true)
  const seenConversationRef = useRef<string | null>(null)
  const seenAssistantRef = useRef<string | null>(null)
  const conversationId = detail?.conversation.id ?? null
  const latestAssistantId = latestAssistant?.id ?? null
  // '새 초안 ↓' — 위로 올려 읽는 중에 새 초안이 오면 움직이지 않고 이 값만 켠다(렌더 중 상태 맞추기).
  const [track, setTrack] = useState<{ conversationId: string | null; assistantId: string | null; newDraftId: string | null }>({
    conversationId,
    assistantId: latestAssistantId,
    newDraftId: null,
  })
  if (track.conversationId !== conversationId) {
    setTrack({ conversationId, assistantId: latestAssistantId, newDraftId: null })
  } else if (track.assistantId !== latestAssistantId) {
    setTrack({
      conversationId,
      assistantId: latestAssistantId,
      newDraftId: latestAssistantId && !nearBottom ? latestAssistantId : null,
    })
  }
  const newDraftId = track.conversationId === conversationId ? track.newDraftId : null

  const scrollToHead = useCallback((messageId: string) => {
    const scroller = scrollerRef.current
    const target = scroller?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`)
    if (!scroller || !target) return false
    const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    scroller.scrollTo({ top: Math.max(0, offset - 12), behavior: "auto" })
    return true
  }, [])

  useEffect(() => {
    const scroller = scrollerRef.current
    const previousConversation = seenConversationRef.current
    const previousAssistant = seenAssistantRef.current
    seenConversationRef.current = conversationId
    seenAssistantRef.current = latestAssistantId
    if (!scroller || !conversationId) return
    if (previousConversation !== conversationId) {
      if (latestAssistantId) scrollToHead(latestAssistantId)
      else scroller.scrollTop = scroller.scrollHeight
      return
    }
    if (latestAssistantId && previousAssistant !== latestAssistantId && nearBottom) {
      scrollToHead(latestAssistantId)
    }
  }, [conversationId, latestAssistantId, detail?.messages.length, nearBottom, scrollToHead])

  // 질문을 보내면 보낸 말풍선과 '쓰는 중' 표시가 보이도록 맨 아래로 간다.
  const generatingGen = generating?.gen
  useEffect(() => {
    if (!generatingGen) return
    const scroller = scrollerRef.current
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  }, [generatingGen])

  const messages = detail?.messages ?? []
  const boundaryIndex = lastContextBoundaryIndex(messages)
  const turnsAfterBoundary = turnsSinceBoundary(messages)
  const contextCard = readContextCard(detail?.conversation.customer_context)
  const isArchived = detail?.conversation.status === "archived"
  const loadFailed = Boolean(listError) && !detail

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", reviewOpen && "xl:pr-[438px]")}>
      <div className="shrink-0 border-b border-black/[0.08]">
      <div className={cn(CONSOLE_CONTENT_CLASS, "flex min-h-12 flex-wrap items-center justify-between gap-2 py-1.5")}>
        <div className="flex min-w-0 items-center gap-2">
          {/* 새 상담 — 다른 고객 건을 시작한다. 모달 없이 바로 실행하고 입력창 위 띠에서 되돌린다. */}
          <button
            type="button"
            onClick={startNewConversation}
            aria-label="새 상담 시작"
            title="새 상담 (Alt+Shift+N)"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-2.5 text-[12px] font-semibold transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
            새 상담
          </button>
          <h2 ref={headingRef} tabIndex={-1} className="sr-only">
            {detail?.conversation.title ?? "새 내부 CS 상담"}
          </h2>
          <ConversationSwitcher
            label={detail?.conversation.title ?? "새 내부 CS 상담"}
            conversations={queueConversations}
            selectedId={selectedId}
            onSelect={(conversation) => void handleSelect(conversation)}
          />
          {detail ? <StatusBadge status={detail.conversation.status} /> : null}
        </div>

        <div className="flex items-center gap-1.5">
          <div
            className="flex h-8 shrink-0 overflow-hidden rounded-md border border-black/[0.12] bg-white"
            role="group"
            aria-label="Gemini 모델 모드"
          >
            {MODEL_MODE_SEGMENTS.map((segment, index) => (
              <button
                key={segment.value}
                type="button"
                onClick={() => setModelMode(segment.value)}
                aria-pressed={modelMode === segment.value}
                className={cn(
                  "px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]",
                  index > 0 && "border-l border-black/[0.10]",
                  modelMode === segment.value
                    ? "bg-[#31302E] text-white"
                    : "bg-white text-[#615D59] hover:text-[#111110]"
                )}
              >
                {segment.label}
              </button>
            ))}
          </div>
          {/* 축을 넘는 동선(§6) — 지금 보고 있는 대화를 본사 확인 대기로 보낸다.
              이미 대기 중이면 태그를 다시 쓰지 않고 본사 확인 화면으로만 넘어간다. */}
          {detail ? (
            <button
              type="button"
              onClick={() => void requestHqConfirmation(detail.conversation)}
              disabled={hqPendingActionId === detail.conversation.id}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:opacity-40",
                isHqPending(detail.conversation)
                  ? "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F] hover:bg-[#F6E7CE]"
                  : "border-black/[0.08] bg-white text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#31302E]"
              )}
            >
              <Building className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">
                {isHqPending(detail.conversation) ? "본사 확인 대기" : "본사 확인 요청"}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => openReview(pendingMessage?.id)}
            disabled={!pendingMessage}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-2.5 text-[12px] font-semibold transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
            검토 열기
          </button>
          <ToolbarMoreMenu
            conversationTitle={detail?.conversation.title ?? null}
            archived={isArchived}
            onArchive={detail ? onArchiveConversation : undefined}
            onReopen={detail ? onReopenConversation : undefined}
            disabled={isPending}
          />
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing || isPending}
              aria-label="목록 새로고침"
              title="목록과 상태만 새로 받습니다. 쓰던 글은 그대로 둡니다"
              className="hidden h-8 w-8 items-center justify-center rounded-md text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:opacity-40 sm:flex"
            >
              <RefreshCcw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden="true" />
            </button>
          ) : null}
          {onOpenTools ? (
            <button
              type="button"
              onClick={onOpenTools}
              aria-label="운영 도구 열기"
              title="운영 도구"
              className="relative flex h-8 w-8 items-center justify-center rounded-md text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
              {regressionPendingCount > 0 ? (
                <span aria-hidden className="absolute right-1 top-1 h-[6px] w-[6px] rounded-full bg-[#A8741A] ring-2 ring-white" />
              ) : null}
            </button>
          ) : null}
        </div>
      </div>
      </div>

      <div
        ref={scrollerRef}
        onScroll={(event) => {
          const el = event.currentTarget
          const near = el.scrollHeight - el.scrollTop - el.clientHeight < 160
          setNearBottom((current) => (current === near ? current : near))
          if (near) setTrack((current) => (current.newDraftId ? { ...current, newDraftId: null } : current))
        }}
        className="relative min-h-0 flex-1 overflow-y-auto bg-white"
      >
        <div className={cn(CONSOLE_CONTENT_CLASS, "py-7")}>
        <div className={cn("w-full max-w-[820px] space-y-8", reviewOpen ? "xl:mr-auto xl:ml-0" : "mx-auto")}>
          {contextCard ? <ConversationContextCard card={contextCard} /> : null}
          {loading && !detail ? (
            <div className="flex min-h-[360px] items-center justify-center text-[#615D59]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              내부 CS 대화를 불러오는 중입니다.
            </div>
          ) : loadFailed ? (
            <div
              role="alert"
              data-testid="list-error-block"
              className="flex min-h-[320px] flex-col items-center justify-center text-center"
            >
              <AlertTriangle className="h-8 w-8 text-[#8F2C2C]" aria-hidden="true" />
              <h2 className="mt-4 text-[16px] font-semibold text-[#31302E]">대화를 불러오지 못했습니다</h2>
              <p className="mt-1.5 max-w-md text-[13px] leading-5 text-[#615D59]">{listError}</p>
              {onRetryLoad ? (
                <button
                  type="button"
                  onClick={onRetryLoad}
                  className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-[#31302E] px-4 text-[12px] font-semibold text-white hover:bg-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
                >
                  <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  다시 시도
                </button>
              ) : null}
            </div>
          ) : detail?.messages.length || generating ? (
            <>
            {messages.map((message, index) => {
              if (isContextResetMessage(message)) {
                // 맥락 경계 — 여기부터 모델 이력이 새로 시작된다. 앞 턴은 흐리게 하되 계속 읽을 수 있다.
                return (
                  <div
                    key={message.id}
                    role="separator"
                    aria-label="여기부터 새 맥락"
                    data-message-id={message.id}
                    className="flex items-center gap-3 text-[12px] font-semibold text-[#615D59]"
                  >
                    <span className="h-px flex-1 bg-black/[0.12]" />
                    <span>여기부터 새 맥락 · {formatTime(message.created_at)}</span>
                    <span className="h-px flex-1 bg-black/[0.12]" />
                  </div>
                )
              }
              if (message.role === "system") {
                return (
                  <p key={message.id} className="text-center text-[12px] text-[#78736D]">{message.content}</p>
                )
              }
              const speaker = describeMessageSpeaker(message)
              const dimmed = boundaryIndex >= 0 && index < boundaryIndex
              if (message.role === "internal_note") {
                // 외부 AI 관찰·본사 회신·내부 메모 — 답 초안이 아니므로 검토 카드와 승인 동작을 붙이지 않는다.
                return (
                  <article
                    key={message.id}
                    data-message-id={message.id}
                    data-speaker={speaker.kind}
                    className={cn("flex gap-3 sm:gap-4", dimmed && "opacity-70")}
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F0EFED] text-[#31302E]">
                      <MessageSquare className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-semibold text-[#31302E]">{speaker.label}</p>
                        <span className="text-[12px] text-[#78736D]">{formatTime(message.created_at)}</span>
                        <span className="rounded-md bg-[#F6F5F4] px-2 py-0.5 text-[11px] font-semibold text-[#615D59]">고객에게 보내지 않음</span>
                      </div>
                      <div className="max-w-[680px] whitespace-pre-wrap rounded-lg border border-dashed border-black/[0.16] bg-white px-4 py-3 text-[13px] leading-6 text-[#31302E]">
                        {message.content}
                      </div>
                    </div>
                  </article>
                )
              }
              const review = REVIEW_META[message.review_state]
              const sources = normalizeSourceRefs(message.source_refs)
              const isLatestAssistant = latestAssistant?.id === message.id
              const isApproved = message.review_state === "approved"
              const visibleContent = message.corrected_content && message.review_state === "approved"
                ? message.corrected_content
                : message.content

              return (
                <article
                  key={message.id}
                  data-message-id={message.id}
                  data-speaker={speaker.kind}
                  className={cn("flex gap-3 sm:gap-4", dimmed && "opacity-70")}
                >
                  <span className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    message.role === "assistant" ? "bg-[#084734] text-white shadow-xs" : "bg-[#F0EFED] text-[#31302E]"
                  )}>
                    {message.role === "assistant" ? <ClassInInternalAIIcon size={18} variant="white" /> : <UserRound className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold text-[#31302E]">{speaker.label}</p>
                      <span className="text-[12px] text-[#78736D]">{formatTime(message.created_at)}</span>
                      {message.role === "assistant" ? (
                        <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", review.className)}>
                          {review.label}
                        </span>
                      ) : null}
                    </div>

                    {message.role === "user" ? (
                      <div className="max-w-[580px] whitespace-pre-wrap rounded-lg border border-black/[0.08] bg-[#FAFAF8] px-4 py-3 text-[14px] leading-6 text-[#31302E]">
                        {message.content}
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "overflow-hidden rounded-lg border border-black/[0.08] bg-white",
                          // 검토 상태 레일 — 스크롤 중에도 초안/승인 상태가 읽히는 1차 신호.
                          message.review_state === "pending" && "border-l-[3px] border-l-[#ECD29C]",
                          message.review_state === "approved" && "border-l-[3px] border-l-[#BDEFD8]",
                          message.review_state === "changes_requested" && "border-l-[3px] border-l-[#F2B8B8]"
                        )}
                      >
                        <div className="px-5 py-4">
                          <BlogMarkdownRenderer
                            markdown={visibleContent}
                            className={cn(
                              "text-[14px] leading-7 text-[#31302E]",
                              "[&>*:first-child]:!mt-0 [&>*:last-child]:!mb-0",
                              "[&_h2]:!mt-6 [&_h2]:!text-[18px] [&_h2]:!leading-7 [&_h2]:!tracking-[-0.02em]",
                              "[&_h3]:!mt-5 [&_h3]:!text-[16px] [&_h3]:!leading-7 [&_h3]:!tracking-[-0.01em]",
                              "[&_p]:!mt-3 [&_p]:!text-[14px] [&_p]:!leading-7 [&_p]:!text-[#31302E]",
                              "[&_ul]:!my-3 [&_ul]:!space-y-1 [&_ul]:!pl-5 [&_ul]:!text-[14px] [&_ul]:!leading-7 [&_ul]:!text-[#31302E]",
                              "[&_ol]:!my-3 [&_ol]:!space-y-1 [&_ol]:!pl-5 [&_ol]:!text-[14px] [&_ol]:!leading-7 [&_ol]:!text-[#31302E]",
                              "[&_blockquote]:!my-4 [&_blockquote]:!rounded-lg [&_blockquote]:!px-4 [&_blockquote]:!py-3 [&_blockquote]:!text-[14px] [&_blockquote]:!leading-7",
                              "[&_hr]:!my-5"
                            )}
                          />
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#78736D]">
                            {isDeterministicDraft(message)
                              ? <span className="font-semibold text-[#8F2C2C]">모델 실패 · 자동 정리(검토 필요)</span>
                              : message.model_name ? <span>{message.model_name}</span> : <span>자동 정리 초안</span>}
                            {message.model_mode ? <span>· {message.model_mode}</span> : null}
                          </div>
                          {isDeterministicDraft(message) ? (
                            <ModelStatusBanner origin="deterministic" failureKinds={readFailureKinds(message)} className="mt-2" />
                          ) : null}

                          {/* 검토 상태·후속 동작 — 승인은 검토 드로어에서만 한다. */}
                          <SmartActionCard
                            message={message}
                            isLatest={pendingMessage?.id === message.id}
                            issueHint={escalationContext && escalationContext.confidence === "high" ? escalationContext.contact.domainLabel : null}
                            onOpenReview={(id) => openReview(id)}
                            onReject={onRejectDraft}
                            onCopyCustomerHolding={() => {
                              const customerTemplate = communicationTemplates.find((t) => t.id === "customer")?.content
                              if (customerTemplate) {
                                void copyText(customerTemplate, "고객 대기 안내 초안을 복사했습니다.")
                              }
                            }}
                            onRequestHq={() => {
                              if (detail) {
                                void requestHqConfirmation(detail.conversation)
                              }
                            }}
                          />

                          {message.review_state === "approved" && message.corrected_content ? (
                            <div className="mt-3 border-t border-black/[0.06] pt-3">
                              <PromoteKnowledgeControl
                                pending={promotingMessageId === message.id}
                                result={promotionResults[message.id]}
                                onPromote={() => void promoteMessageToKnowledge(message.id)}
                              />
                            </div>
                          ) : null}
                        </div>

                        {isLatestAssistant ? (
                          <div className="border-t border-black/[0.08]">
                            <div className="flex flex-wrap items-center gap-1 px-3 py-2">
                              <AnswerFooterChip
                                active={expanded === "sources"}
                                onClick={() => setExpanded(expanded === "sources" ? null : "sources")}
                                icon={<BookOpen className="h-3.5 w-3.5" />}
                              >
                                근거 <em className="not-italic font-bold tabular-nums text-[#084734]">{sources.length}</em>
                              </AnswerFooterChip>
                              <AnswerFooterChip
                                active={expanded === "hq"}
                                onClick={() => setExpanded(expanded === "hq" ? null : "hq")}
                                icon={<MessageSquare className="h-3.5 w-3.5" />}
                              >
                                <span>소통 초안 3종</span>
                                {escalationContext ? (
                                  <span className="ml-1 rounded bg-[#084734]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#084734]">
                                    {escalationContext.contact.domainLabel.split("·")[0]}
                                  </span>
                                ) : null}
                              </AnswerFooterChip>
                              <AnswerFooterChip
                                active={expanded === "regression"}
                                onClick={() => setExpanded(expanded === "regression" ? null : "regression")}
                                icon={<History className="h-3.5 w-3.5" />}
                              >
                                회귀 개선
                              </AnswerFooterChip>
                              <button
                                type="button"
                                onClick={rerunWithPro}
                                disabled={isPending}
                                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#084734] disabled:opacity-40"
                              >
                                <FileCheck2 className="h-3.5 w-3.5" />
                                Pro로 재검토
                              </button>
                            </div>

                            {expanded === "sources" ? (
                              <div className="border-t border-black/[0.06] bg-[#FAFAF8] px-4 py-4">
                              {sources.length > 0 ? (
                                <div className="space-y-2">
                                  {sources.map((source) => {
                                    const link = sourceLink(source)
                                    const status = sourceStatus(source)
                                    const content = (
                                      <>
                                        <span className="min-w-0 flex-1 truncate">{source.label ?? source.id}</span>
                                        {status ? (
                                          <span
                                            className={cn(
                                              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                              status.tone === "confirmed"
                                                ? "bg-[#ECFDF5] text-[#084734]"
                                                : status.tone === "conditional"
                                                  ? "bg-[#F6F5F4] text-[#615D59]"
                                                  : "bg-[#FBF1E0] text-[#7A520F]"
                                            )}
                                          >
                                            {status.label}
                                          </span>
                                        ) : null}
                                        {link ? <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-[#78736D]" aria-hidden="true" />}
                                      </>
                                    )
                                    // 근거 링크는 새 탭으로 연다 — 같은 탭 이동은 쓰던 최종 답과 검토 상태를 놓치게 한다(IC-11).
                                    return link ? (
                                      <a
                                        key={source.id}
                                        href={link.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 rounded-md border border-black/[0.08] bg-white px-3 py-2.5 text-[12px] text-[#31302E] hover:border-[#084734]/20 hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                                      >
                                        {content}
                                        <span className="sr-only">(새 탭에서 열림)</span>
                                      </a>
                                    ) : (
                                      <div key={source.id} className="flex items-center gap-3 rounded-md border border-black/[0.08] bg-white px-3 py-2.5 text-[12px] text-[#31302E]">
                                        {content}
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : (
                                <p className="text-[12px] leading-5 text-[#615D59]">직접 일치하는 문서 근거가 없습니다. 담당자 확인이 필요합니다.</p>
                              )}
                              </div>
                            ) : null}

                            {expanded === "hq" ? (
                              <div className="border-t border-black/[0.06] bg-[#FAFAF8] px-4 py-4">
                                <CommunicationTabs
                                  detail={detail}
                                  isApproved={isApproved}
                                  onOpenReview={() => openReview(pendingMessage?.id)}
                                  onCopyText={copyText}
                                  legacyTemplates={communicationTemplates}
                                />
                              </div>
                            ) : null}

                            {expanded === "regression" ? (
                              <div className="border-t border-black/[0.06] bg-[#FAFAF8] px-4 py-4">
                              <label className="flex cursor-pointer items-start gap-3 text-[12px] leading-5 text-[#31302E]">
                                <input
                                  type="checkbox"
                                  checked={regressionCandidate}
                                  onChange={(event) => setRegressionCandidate(event.target.checked)}
                                  className="mt-0.5 h-4 w-4 accent-[#084734]"
                                />
                                <span>
                                  이 답변을 회귀 개선 후보로 표시합니다.
                                  <span className="mt-1 block text-[#615D59]">승인 또는 수정 요청 시 담당자 판단과 함께 저장됩니다.</span>
                                </span>
                              </label>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
            {generating ? (
              <>
                {generating.question ? (
                  <article className="flex gap-3 sm:gap-4" data-testid="pending-question">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F0EFED] text-[#31302E]">
                      <UserRound className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-semibold text-[#31302E]">담당자 질문</p>
                        <span className="text-[12px] text-[#78736D]">보내는 중</span>
                      </div>
                      <div className="max-w-[580px] whitespace-pre-wrap rounded-lg border border-black/[0.08] bg-[#FAFAF8] px-4 py-3 text-[14px] leading-6 text-[#31302E]">
                        {generating.question}
                      </div>
                    </div>
                  </article>
                ) : null}
                <div
                  role="status"
                  data-testid="generating-status"
                  className="flex items-center gap-2 text-[13px] text-[#615D59]"
                >
                  <Loader2 className="h-4 w-4 animate-spin text-[#084734]" aria-hidden="true" />
                  AI가 초안을 쓰는 중입니다{generating.kind === "rerun" ? " (Pro 심층 검토)" : ""}. 다른 상담으로 옮겨도 됩니다.
                </div>
              </>
            ) : null}
            </>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ECFDF5] text-[#084734]">
                <Sparkles className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-[18px] font-semibold tracking-[-0.02em] text-[#31302E]">내부 CS 질문을 시작하세요</h2>
              <p className="mt-2 max-w-md text-[13px] leading-6 text-[#615D59]">
                공개 가이드와 내부 운영 기준을 함께 확인하고, 필요한 경우 본사 소통 초안까지 만듭니다.
              </p>
            </div>
          )}

          {assets.length > 0 ? (
            <section className="border-t border-black/[0.08] pt-6" aria-label="누적 이미지 분석">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-[13px] font-semibold text-[#31302E]">누적 이미지 분석</h2>
                  <p className="mt-1 text-[11px] text-[#615D59]">같은 대화의 사진과 분석 결과를 순서대로 보관합니다.</p>
                </div>
                <span className="text-[11px] font-medium text-[#78736D]">{assets.length}개</span>
              </div>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                {assets.map((asset) => {
                  const preview = assetPreviewUrl(asset)
                  const status = assetAnalysisStatus(asset).toLowerCase()
                  const analyzing = ["pending", "processing", "analyzing", "queued"].includes(status)
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setSelectedAssetId(asset.id)}
                      className={cn(
                        "group relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md border bg-[#F6F5F4] text-[#615D59] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]",
                        selectedAsset?.id === asset.id ? "border-[#084734]" : "border-black/[0.08] hover:border-black/20"
                      )}
                      aria-label={`${maskAssetFileName(assetFileName(asset))} 분석 보기`}
                    >
                      {preview ? (
                        <Image
                          src={preview}
                          alt=""
                          fill
                          unoptimized
                          sizes="72px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center">
                          <ImageIcon className="h-5 w-5" />
                        </span>
                      )}
                      {analyzing ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-white/80">
                          <Loader2 className="h-4 w-4 animate-spin text-[#084734]" />
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>

              {selectedAsset ? (
                <div className="mt-2 overflow-hidden rounded-lg border border-black/[0.08] bg-[#FAFAF8]">
                  <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.08] bg-white px-4 py-3">
                    <ImageIcon className="h-4 w-4 text-[#084734]" />
                    <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#31302E]">
                      {maskAssetFileName(assetFileName(selectedAsset))}
                    </p>
                    {["pending", "processing", "analyzing", "queued"].includes(assetAnalysisStatus(selectedAsset).toLowerCase()) ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#F6F5F4] px-2 py-1 text-[11px] font-semibold text-[#615D59]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        분석 중
                      </span>
                    ) : ["failed", "error"].includes(assetAnalysisStatus(selectedAsset).toLowerCase()) ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#FCE9E9] px-2 py-1 text-[11px] font-semibold text-[#8F2C2C]">
                        <AlertTriangle className="h-3 w-3" />
                        분석 실패
                      </span>
                    ) : assetNeedsHumanReview(selectedAsset) ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#FBF1E0] px-2 py-1 text-[11px] font-semibold text-[#7A520F]">
                        <ShieldCheck className="h-3 w-3" />
                        담당자 확인 필요
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#ECFDF5] px-2 py-1 text-[11px] font-semibold text-[#084734]">
                        <CheckCircle2 className="h-3 w-3" />
                        확인 완료
                      </span>
                    )}
                  </div>
                  <div className="grid gap-4 p-4 sm:grid-cols-[120px_minmax(0,1fr)]">
                    <div className="relative aspect-square overflow-hidden rounded-md border border-black/[0.08] bg-white">
                      {assetPreviewUrl(selectedAsset) ? (
                        <Image
                          src={assetPreviewUrl(selectedAsset) ?? ""}
                          alt={maskAssetFileName(assetFileName(selectedAsset))}
                          fill
                          unoptimized
                          sizes="120px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center text-[#78736D]">
                          <ImageIcon className="h-6 w-6" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#78736D]">AI 분석</p>
                      <p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-[#31302E]">
                        {assetAnalysis(selectedAsset)}
                      </p>
                      {selectedAsset.instruction ? (
                        <p className="mt-3 border-t border-black/[0.08] pt-3 text-[11px] leading-4 text-[#615D59]">
                          분석 요청 · {selectedAsset.instruction}
                        </p>
                      ) : null}
                      {assetSensitiveWarnings(selectedAsset).length > 0 ? (
                        <div
                          data-testid="asset-sensitive-warning"
                          className="mt-3 rounded-md border border-[#EBD9A8] bg-[#FFF7E0] px-3 py-2 text-[12px] leading-5 text-[#6B4E00]"
                        >
                          <p className="flex items-center gap-1.5 font-semibold">
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            민감정보 가능성
                          </p>
                          <ul className="mt-1 list-disc pl-5">
                            {assetSensitiveWarnings(selectedAsset).map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                          <label className="mt-2 flex cursor-pointer items-start gap-2 font-semibold">
                            <input
                              type="checkbox"
                              checked={Boolean(sensitiveAck[selectedAsset.id])}
                              onChange={(event) => setSensitiveAck((current) => ({ ...current, [selectedAsset.id]: event.target.checked }))}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-[#084734]"
                            />
                            <span>민감정보 여부를 확인했습니다</span>
                          </label>
                        </div>
                      ) : null}
                      {assetNeedsHumanReview(selectedAsset)
                        && ["ready", "completed"].includes(assetAnalysisStatus(selectedAsset).toLowerCase()) ? (
                        <button
                          type="button"
                          onClick={() => void approveSelectedAsset()}
                          disabled={assetReviewingId === selectedAsset.id || (assetSensitiveWarnings(selectedAsset).length > 0 && !sensitiveAck[selectedAsset.id])}
                          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-[#084734] px-3 text-[12px] font-semibold text-white hover:bg-[#065C41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {assetReviewingId === selectedAsset.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          분석 확인
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
        </div>
        {newDraftId ? (
          <div className="pointer-events-none sticky bottom-3 z-10 flex justify-center">
            <button
              type="button"
              onClick={() => {
                scrollToHead(newDraftId)
                setTrack((current) => ({ ...current, newDraftId: null }))
              }}
              className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-[#31302E] px-4 text-[12px] font-semibold text-white shadow-md hover:bg-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
              새 초안
            </button>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-black/[0.08] bg-white">
      <form onSubmit={submitQuestion} className={cn(CONSOLE_CONTENT_CLASS, "py-2.5")}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          onChange={handleAssetFiles}
          aria-label="CS 분석 이미지 첨부"
        />
        {/* 되돌리기 띠 — 모달 없이 바로 실행하고 여기서 되돌린다. 영역은 늘 떠 있어야 스크린리더가 변화를 읽는다. */}
        <div role="status" aria-live="polite" className={cn(reviewOpen ? "max-w-none" : "mx-auto max-w-[980px]")}>
          {band ? (
            <div
              data-testid="undo-band"
              className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[#BDEFD8] bg-[#ECFDF5] px-3 py-1.5 text-[12px] text-[#084734]"
            >
              {band.kind === "context_reset" ? (
                <>
                  <span>코파일럿 맥락을 비웠어요. 다음 질문부터 이전 대화를 이력으로 쓰지 않습니다.</span>
                  <button
                    type="button"
                    onClick={onUndoBand}
                    className="min-h-8 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                  >
                    되돌리기
                  </button>
                  {band.pendingDrafts > 0 && onRejectPending ? (
                    <button
                      type="button"
                      onClick={onRejectPending}
                      className="min-h-8 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                    >
                      이전 초안 {band.pendingDrafts}개를 사용 안 함으로 정리
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <span>새 상담을 시작했어요.</span>
                  <button
                    type="button"
                    onClick={onUndoBand}
                    className="min-h-8 max-w-full truncate font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                  >
                    ‹{band.prevTitle}›으로 돌아가기
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
        {isArchived ? (
          <div
            data-testid="archived-composer"
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/[0.12] bg-[#FAFAF8] px-4 py-3",
              reviewOpen ? "max-w-none" : "mx-auto max-w-[980px]"
            )}
          >
            <p className="text-[13px] text-[#31302E]">보관된 상담입니다. 이어서 물으려면 먼저 다시 여세요.</p>
            {onReopenConversation ? (
              <button
                type="button"
                onClick={onReopenConversation}
                disabled={isPending}
                className="inline-flex h-9 items-center rounded-md bg-[#31302E] px-3 text-[12px] font-semibold text-white hover:bg-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 disabled:opacity-40"
              >
                다시 열고 묻기
              </button>
            ) : null}
          </div>
        ) : (
        <>
        {pendingFiles.length > 0 || uploadingAssets || assetError || restoredAttachmentNames.length > 0 ? (
          <div className={cn("mb-2", reviewOpen ? "max-w-none" : "mx-auto max-w-[980px]")}>
            {pendingFiles.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {pendingFiles.map((file) => (
                  <div
                    key={fileKey(file)}
                    className="flex h-10 max-w-[220px] shrink-0 items-center gap-2 rounded-md border border-black/[0.08] bg-[#FAFAF8] px-2.5"
                  >
                    <ImageIcon className="h-3.5 w-3.5 shrink-0 text-[#084734]" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#31302E]">{maskAssetFileName(file.name)}</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(file)}
                      disabled={uploadingAssets || isPending}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[#78736D] hover:bg-[#FCE9E9] hover:text-[#8F2C2C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:opacity-40"
                      aria-label={`${maskAssetFileName(file.name)} 첨부 제거`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {pendingFiles.length === 0 && restoredAttachmentNames.length > 0 ? (
              <p className="flex items-start gap-2 text-[12px] text-[#7A520F]" data-testid="reattach-notice">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                이전에 붙인 사진 {restoredAttachmentNames.length}장({restoredAttachmentNames.map(maskAssetFileName).join(", ")})은 새로고침으로 사라졌습니다. 필요하면 다시 첨부해 주세요.
              </p>
            ) : null}
            {uploadingAssets ? (
              <p className="mt-2 flex items-center gap-2 text-[12px] text-[#084734]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                사진 분석 중 · {uploadProgress.current}/{uploadProgress.total}
              </p>
            ) : null}
            {assetError ? (
              <p className="mt-2 flex items-start gap-2 text-[12px] text-[#8F2C2C]" role="alert">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {assetError}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* 빠른 질문 칩은 빈 대화에서만 보인다(IC-15). 입력창에 글이 있으면 덧붙인다. */}
        {messages.length === 0 && !generating ? (
          <div className={cn("mb-2", reviewOpen ? "max-w-none" : "mx-auto max-w-[980px]")}>
            <QuickPromptChips
              onSelectPrompt={(promptText) => setComposer(composer.trim() ? `${composer.trimEnd()}\n${promptText}` : promptText)}
              disabled={isPending || uploadingAssets}
            />
          </div>
        ) : null}

        {/* 맥락 비우기 — 같은 상담을 유지하고 모델 이력만 끊는다. 마지막 경계 뒤에 질문이 1개 이상 있을 때만 보인다. */}
        {detail && onClearContext && (turnsAfterBoundary >= 1 || contextResetPending) ? (
          <div className={cn("mb-1.5 flex items-center", reviewOpen ? "max-w-none" : "mx-auto max-w-[980px]")}>
            {contextResetPending ? (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#F6F5F4] px-2.5 text-[12px] font-semibold text-[#615D59]">
                <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
                다음 질문부터 새 맥락
              </span>
            ) : (
              <button
                type="button"
                onClick={onClearContext}
                disabled={Boolean(generating)}
                aria-label="코파일럿 맥락 비우기"
                title={generating ? "답을 받는 중에는 맥락을 비울 수 없습니다" : "같은 상담을 유지하고 코파일럿이 보는 이전 대화만 끊습니다"}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-2.5 text-[12px] font-semibold text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#31302E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
                맥락 비우기
              </button>
            )}
          </div>
        ) : null}

        <div className={cn(
          "flex items-end gap-3 rounded-lg border border-black/[0.16] bg-white px-3 py-2 focus-within:border-[#084734]/50 focus-within:ring-2 focus-within:ring-[#084734]/10",
          reviewOpen ? "max-w-none" : "mx-auto max-w-[980px]"
        )}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pendingFiles.length >= MAX_PENDING_ASSETS || uploadingAssets || isPending || Boolean(generating) || loadFailed}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="사진 첨부 또는 촬영"
            title={`JPG, PNG, WebP · 최대 ${MAX_PENDING_ASSETS}장`}
          >
            <Paperclip className="h-4 w-4" aria-hidden="true" />
          </button>
          <textarea
            ref={composerRef}
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            onKeyDown={(event) => {
              if (shouldSubmitComposerOnKeyDown({
                key: event.key,
                shiftKey: event.shiftKey,
                isComposing: event.nativeEvent.isComposing,
                keyCode: event.nativeEvent.keyCode,
              })) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
            aria-label="내부 CS 질문 입력"
            disabled={loadFailed}
            rows={2}
            maxLength={1000}
            placeholder="내부 자료와 상담 맥락을 함께 질문하세요"
            className="max-h-32 min-h-12 flex-1 resize-none bg-transparent text-[14px] leading-6 text-[#31302E] outline-none placeholder:text-[#78736D]"
          />
          <button
            type="submit"
            disabled={(!composer.trim() && pendingFiles.length === 0) || isPending || uploadingAssets || Boolean(generating) || loadFailed}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#31302E] text-white transition-colors hover:bg-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#D8D5D1]"
            aria-label="질문 보내기"
          >
            {isPending || uploadingAssets || generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        {/* 안내 문구는 대화 영역을 넓히려고 화면에서는 숨기고 스크린리더에만 읽힌다(첨부 버튼 title 에도 같은 말이 있다). */}
        <p className="sr-only">사진은 JPG·PNG·WebP 최대 3장 · AI 답변은 담당자 검토 전에는 고객에게 전달되지 않습니다.</p>
        </>
        )}
      </form>
      </div>
    </div>
  )
}
