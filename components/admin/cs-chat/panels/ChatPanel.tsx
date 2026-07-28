"use client"

import Image from "next/image"
import Link from "next/link"
import {
  AlertTriangle,
  BookOpen,
  Building,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCheck2,
  History,
  ImageIcon,
  Loader2,
  LockKeyhole,
  MessageSquare,
  Paperclip,
  PanelRightOpen,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react"
import type { ChangeEvent, FormEvent, RefObject } from "react"

import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import { cn } from "@/lib/utils"

import AnswerFooterChip from "../components/AnswerFooterChip"
import ConversationSwitcher from "../components/ConversationSwitcher"
import PromoteKnowledgeControl from "../components/PromoteKnowledgeControl"
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
  assetPreviewUrl,
  fileKey,
  formatTime,
  normalizeSourceRefs,
  sourceHref,
  sourceStatus,
} from "../formatters"
import { isHqPending } from "../hq-desk"
import type {
  ConversationDetailResponse,
  InternalCsAsset,
  InternalCsConversation,
  InternalCsMessage,
  ModelMode,
  PromotionResult,
} from "../types"

export type ChatAnswerDisclosure = "sources" | "hq" | "regression" | null

export default function ChatPanel({
  detail,
  loading,
  isPending,
  reviewOpen,
  setReviewOpen,
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
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", reviewOpen && "xl:pr-[438px]")}>
      <div className="shrink-0 border-b border-black/[0.08]">
      <div className={cn(CONSOLE_CONTENT_CLASS, "flex min-h-16 flex-wrap items-center justify-between gap-3 py-3")}>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={startNewConversation}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-3 text-[12px] font-semibold transition-colors hover:bg-[#F6F5F4]"
          >
            <Plus className="h-3.5 w-3.5" />
            새 대화
          </button>
          <ConversationSwitcher
            label={detail?.conversation.title ?? "새 내부 CS 상담"}
            conversations={queueConversations}
            selectedId={selectedId}
            onSelect={(conversation) => void handleSelect(conversation)}
          />
          {detail ? <StatusBadge status={detail.conversation.status} /> : null}
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex h-9 shrink-0 overflow-hidden rounded-md border border-black/[0.12] bg-white"
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
                  "px-3 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]",
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
                "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[12px] font-semibold transition-colors disabled:opacity-40",
                isHqPending(detail.conversation)
                  ? "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F] hover:bg-[#F6E7CE]"
                  : "border-black/[0.08] bg-white text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#31302E]"
              )}
            >
              <Building className="h-4 w-4" />
              <span className="hidden sm:inline">
                {isHqPending(detail.conversation) ? "본사 확인 대기" : "본사 확인 요청"}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            disabled={!pendingMessage}
            className="relative inline-flex h-9 items-center gap-2 rounded-md border border-black/[0.08] bg-white px-3 text-[12px] font-semibold transition-colors hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PanelRightOpen className="h-4 w-4" />
            검토 열기
            {pendingMessage ? (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#A8741A] ring-2 ring-white" aria-hidden />
            ) : null}
          </button>
        </div>
      </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-white">
        <div className={cn(CONSOLE_CONTENT_CLASS, "py-7")}>
        <div className={cn("w-full max-w-[820px] space-y-8", reviewOpen ? "xl:mr-auto xl:ml-0" : "mx-auto")}>
          {loading && !detail ? (
            <div className="flex min-h-[360px] items-center justify-center text-[#615D59]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              내부 CS 대화를 불러오는 중입니다.
            </div>
          ) : detail?.messages.length ? (
            detail.messages.map((message) => {
              const review = REVIEW_META[message.review_state]
              const sources = normalizeSourceRefs(message.source_refs)
              const isLatestAssistant = latestAssistant?.id === message.id
              const visibleContent = message.corrected_content && message.review_state === "approved"
                ? message.corrected_content
                : message.content

              return (
                <article key={message.id} className="flex gap-3 sm:gap-4">
                  <span className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    message.role === "assistant" ? "bg-[#084734] text-white" : "bg-[#F0EFED] text-[#31302E]"
                  )}>
                    {message.role === "assistant" ? <Sparkles className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold text-[#31302E]">
                        {message.role === "assistant" ? "AI 답변" : "사용자 질문"}
                      </p>
                      <span className="text-[11px] text-[#A39E98]">{formatTime(message.created_at)}</span>
                      {message.role === "assistant" ? (
                        <span className={cn("rounded-md px-2 py-1 text-[10px] font-semibold", review.className)}>
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
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[#A39E98]">
                            {message.model_name ? <span>{message.model_name}</span> : <span>결정론적 안전 초안</span>}
                            {message.model_mode ? <span>· {message.model_mode}</span> : null}
                          </div>
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
                                소통 초안 3종
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
                                    const href = sourceHref(source)
                                    const status = sourceStatus(source)
                                    const content = (
                                      <>
                                        <span className="min-w-0 flex-1 truncate">{source.label ?? source.id}</span>
                                        {status ? (
                                          <span
                                            className={cn(
                                              "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold",
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
                                        {href ? <ExternalLink className="h-3.5 w-3.5 shrink-0" /> : <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-[#A39E98]" />}
                                      </>
                                    )
                                    return href ? (
                                      <Link
                                        key={source.id}
                                        href={href}
                                        className="flex items-center gap-3 rounded-md border border-black/[0.08] bg-white px-3 py-2.5 text-[12px] text-[#31302E] hover:border-[#084734]/20 hover:text-[#084734]"
                                      >
                                        {content}
                                      </Link>
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
                              <div className="space-y-3">
                                {communicationTemplates.map((template) => (
                                  <section key={template.id} className="rounded-md border border-black/[0.08] bg-white p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <h4 className="text-[11px] font-semibold text-[#31302E]">{template.label}</h4>
                                      <button
                                        type="button"
                                        onClick={() => void copyText(template.content, `${template.label} 초안을 복사했습니다.`)}
                                        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-2.5 text-[10px] font-semibold hover:bg-[#F6F5F4]"
                                      >
                                        <Copy className="h-3 w-3" />
                                        복사
                                      </button>
                                    </div>
                                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-sans text-[11px] leading-5 text-[#615D59]">
                                      {template.content}
                                    </pre>
                                  </section>
                                ))}
                              </div>
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
            })
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
                <span className="text-[10px] font-medium text-[#A39E98]">{assets.length}개</span>
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
                      aria-label={`${assetFileName(asset)} 분석 보기`}
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
                      {assetFileName(selectedAsset)}
                    </p>
                    {["pending", "processing", "analyzing", "queued"].includes(assetAnalysisStatus(selectedAsset).toLowerCase()) ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#F6F5F4] px-2 py-1 text-[10px] font-semibold text-[#615D59]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        분석 중
                      </span>
                    ) : ["failed", "error"].includes(assetAnalysisStatus(selectedAsset).toLowerCase()) ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#FCE9E9] px-2 py-1 text-[10px] font-semibold text-[#8F2C2C]">
                        <AlertTriangle className="h-3 w-3" />
                        분석 실패
                      </span>
                    ) : assetNeedsHumanReview(selectedAsset) ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#FBF1E0] px-2 py-1 text-[10px] font-semibold text-[#7A520F]">
                        <ShieldCheck className="h-3 w-3" />
                        담당자 확인 필요
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#ECFDF5] px-2 py-1 text-[10px] font-semibold text-[#084734]">
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
                          alt={assetFileName(selectedAsset)}
                          fill
                          unoptimized
                          sizes="120px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center text-[#A39E98]">
                          <ImageIcon className="h-6 w-6" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A39E98]">AI 분석</p>
                      <p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-[#31302E]">
                        {assetAnalysis(selectedAsset)}
                      </p>
                      {selectedAsset.instruction ? (
                        <p className="mt-3 border-t border-black/[0.08] pt-3 text-[10px] leading-4 text-[#615D59]">
                          분석 요청 · {selectedAsset.instruction}
                        </p>
                      ) : null}
                      {assetNeedsHumanReview(selectedAsset)
                        && ["ready", "completed"].includes(assetAnalysisStatus(selectedAsset).toLowerCase()) ? (
                        <button
                          type="button"
                          onClick={() => void approveSelectedAsset()}
                          disabled={assetReviewingId === selectedAsset.id}
                          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-[#084734] px-3 text-[11px] font-semibold text-white hover:bg-[#065C41] disabled:opacity-50"
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
      </div>

      <div className="shrink-0 border-t border-black/[0.08] bg-white">
      <form onSubmit={submitQuestion} className={cn(CONSOLE_CONTENT_CLASS, "py-4")}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          onChange={handleAssetFiles}
          aria-label="CS 분석 이미지 첨부"
        />
        {pendingFiles.length > 0 || uploadingAssets || assetError ? (
          <div className={cn("mb-3", reviewOpen ? "max-w-none" : "mx-auto max-w-[980px]")}>
            {pendingFiles.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {pendingFiles.map((file) => (
                  <div
                    key={fileKey(file)}
                    className="flex h-10 max-w-[220px] shrink-0 items-center gap-2 rounded-md border border-black/[0.08] bg-[#FAFAF8] px-2.5"
                  >
                    <ImageIcon className="h-3.5 w-3.5 shrink-0 text-[#084734]" />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[#31302E]">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(file)}
                      disabled={uploadingAssets || isPending}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#A39E98] hover:bg-[#FCE9E9] hover:text-[#8F2C2C] disabled:opacity-40"
                      aria-label={`${file.name} 첨부 제거`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {uploadingAssets ? (
              <p className="mt-2 flex items-center gap-2 text-[11px] text-[#084734]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                사진 분석 중 · {uploadProgress.current}/{uploadProgress.total}
              </p>
            ) : null}
            {assetError ? (
              <p className="mt-2 flex items-start gap-2 text-[11px] text-[#8F2C2C]" role="alert">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {assetError}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className={cn(
          "flex items-end gap-3 rounded-lg border border-black/[0.16] bg-white px-4 py-3 focus-within:border-[#084734]/50 focus-within:ring-2 focus-within:ring-[#084734]/10",
          reviewOpen ? "max-w-none" : "mx-auto max-w-[980px]"
        )}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pendingFiles.length >= MAX_PENDING_ASSETS || uploadingAssets || isPending}
            className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#084734] disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="사진 첨부 또는 촬영"
            title={`JPG, PNG, WebP · 최대 ${MAX_PENDING_ASSETS}장`}
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea
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
            rows={2}
            maxLength={1000}
            placeholder="내부 자료와 상담 맥락을 함께 질문하세요"
            className="max-h-32 min-h-12 flex-1 resize-none bg-transparent text-[14px] leading-6 text-[#31302E] outline-none placeholder:text-[#A39E98]"
          />
          <button
            type="submit"
            disabled={(!composer.trim() && pendingFiles.length === 0) || isPending || uploadingAssets}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#31302E] text-white transition-colors hover:bg-[#111110] disabled:cursor-not-allowed disabled:bg-[#D8D5D1]"
            aria-label="질문 보내기"
          >
            {isPending || uploadingAssets ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className={cn("mt-2 text-[10px] text-[#A39E98]", reviewOpen ? "max-w-none" : "mx-auto max-w-[980px]")}>
          사진은 JPG·PNG·WebP 최대 3장 · AI 답변과 이미지 분석은 CS 담당자 승인 전 외부로 전달되지 않습니다.
        </p>
      </form>
      </div>
    </div>
  )
}
