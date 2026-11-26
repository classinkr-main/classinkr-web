"use client"

import { BookOpen, ExternalLink, Loader2, LockKeyhole, Sparkles, UserRound, X } from "lucide-react"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"

import { checkFinalAnswer } from "@/lib/internal-cs-chat/answer-checks"

import ModelStatusBanner, { IncompleteDraftNotice } from "../components/ModelStatusBanner"
import ReviewWarningList from "../components/ReviewWarningList"
import { isDeterministicDraft, isIncompleteDraft, readFailureKinds, readReviewWarnings } from "../ops-desk"
import type { InternalCsMessage, ReviewChecks } from "../types"

// 검토 드로어 — 본문 영역(relative) 기준 `absolute inset-y-0 right-0`. 본문은 xl에서 pr-[438px]로 양보한다.
// 양보가 대화 패널에만 걸려 있으므로 워크스페이스는 이 드로어를 대화 탭에만 붙인다
// (정본: docs/active/cs-admin-console-ia-2026-07-27.md §9 "검토 드로어의 기준과 범위").
// 승인은 담당자가 따로 쓴 고객용 최종 답을 고정하고 클립보드에 복사할 뿐, 자동 외부 전송은 하지 않는다(하단 경계 문구).
// 최종 답변 칸은 AI 내부 분석으로 미리 채우지 않는다 — '고객용 문안 만들기'로 모델이 다듬은 문안을 넣거나 직접 쓴다.
// 승인에는 고객 전달 문안이 필수다(워크스페이스 submitReview + PATCH messages/[messageId] 라우트가 같은 규칙으로 막는다).
// 키보드(IC-22): 열면 첫 확인 체크로 포커스가 가고, Esc로 닫으면 연 자리로 돌아간다. xl 미만에서는 모달 대화상자다.
export default function ReviewDrawer({
  reviewChecks,
  finalDraft,
  reviewNote,
  regressionCandidate,
  excludeFromGapQueue,
  pendingMessage,
  isPending,
  canApprove,
  approveBlockedReason,
  polishing = false,
  polishNotice = null,
  polishCanUndo = false,
  onPolishUndo,
  onClose,
  onCheckChange,
  onFinalDraftChange,
  onReviewNoteChange,
  onRegressionCandidateChange,
  onExcludeFromGapQueueChange,
  onSubmitReview,
  onPolish,
  onReject,
}: {
  reviewChecks: ReviewChecks
  finalDraft: string
  reviewNote: string
  regressionCandidate: boolean
  excludeFromGapQueue: boolean
  pendingMessage: InternalCsMessage | null
  isPending: boolean
  canApprove: boolean
  /** 승인이 꺼진 이유 한 줄(IC-26). 켜져 있으면 null. */
  approveBlockedReason?: string | null
  polishing?: boolean
  polishNotice?: string | null
  /** 다듬은 문안이 쓰던 글을 덮어썼을 때 되돌릴 수 있는지. */
  polishCanUndo?: boolean
  onPolishUndo?: () => void
  onClose: () => void
  onCheckChange: (key: keyof ReviewChecks, checked: boolean) => void
  onFinalDraftChange: (value: string) => void
  onReviewNoteChange: (value: string) => void
  onRegressionCandidateChange: (checked: boolean) => void
  onExcludeFromGapQueueChange: (checked: boolean) => void
  onSubmitReview: (decision: "approved" | "changes_requested") => void
  /** 고객용 문안 만들기(IC-14) — 초안을 모델이 고객 문안으로 다듬어 최종 칸에 넣는다. 없으면 버튼을 그리지 않는다. */
  onPolish?: () => void
  /** 이 초안을 '사용 안 함'으로 치운다(IC-13). 없으면 버튼을 그리지 않는다. */
  onReject?: (messageId: string) => void
}) {
  const firstCheckRef = useRef<HTMLInputElement | null>(null)
  const [narrow, setNarrow] = useState(false)

  // 열 때 첫 확인 체크로, 닫을 때 연 자리로 포커스를 옮긴다.
  useEffect(() => {
    const opener = typeof document !== "undefined" ? document.activeElement : null
    firstCheckRef.current?.focus()
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const query = window.matchMedia("(max-width: 1279px)")
    const sync = () => setNarrow(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  // 생성 때 원문에서 찾은 경고 + 지금 쓰는 최종본에서 찾은 high 경고(검토 안전-3). 승인 라우트도 최종본을 다시 검사한다.
  const finalCheck = checkFinalAnswer(finalDraft)
  const warnings = [
    ...readReviewWarnings(pendingMessage),
    ...finalCheck.warnings.map((warning) => ({ ...warning, label: `최종 답: ${warning.label}` })),
  ]
  const deterministic = isDeterministicDraft(pendingMessage)
  const failureKinds = readFailureKinds(pendingMessage)
  const incompleteDraft = isIncompleteDraft(pendingMessage)

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.stopPropagation()
      onClose()
    }
  }

  const autoSummary = [
    regressionCandidate ? "회귀 후보로 저장" : null,
    excludeFromGapQueue ? "보강 큐 제외" : "보강 큐 유입",
  ].filter(Boolean).join(" · ")

  return (
    <>
      <button
        type="button"
        className="absolute inset-0 z-30 bg-black/10 xl:hidden"
        onClick={onClose}
        aria-label="검토 패널 닫기"
        tabIndex={-1}
      />
      <aside
        role="dialog"
        aria-modal={narrow}
        aria-label="초안 검토"
        onKeyDown={handleKeyDown}
        className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[438px] flex-col border-l border-black/[0.08] bg-white shadow-[-14px_0_36px_rgba(0,0,0,0.06)]"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-black/[0.08] px-5">
          <div>
            <h2 className="text-[16px] font-semibold">검토</h2>
            <p className="text-[11px] text-[#78736D]">최종 판단은 CS 담당자에게 있습니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            aria-label="검토 닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* 검토 대상 초안 — 접힌 읽기 전용. 무엇을 검토하는지 드로어 안에서 바로 확인한다(IC-14). */}
          {pendingMessage ? (
            <details className="border-b border-black/[0.08] px-5 py-3">
              <summary className="cursor-pointer text-[12px] font-semibold text-[#31302E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]">
                검토 대상 AI 초안 보기
                <span className="ml-2 font-normal text-[#78736D]">읽기 전용</span>
              </summary>
              <pre
                data-testid="review-target-draft"
                className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-black/[0.08] bg-[#FAFAF8] p-3 font-sans text-[12px] leading-5 text-[#31302E]"
              >
                {pendingMessage.content}
              </pre>
            </details>
          ) : null}

          {deterministic || incompleteDraft || warnings.length > 0 ? (
            <div className="space-y-2 border-b border-black/[0.08] px-5 py-3">
              {deterministic ? <ModelStatusBanner origin="deterministic" failureKinds={failureKinds} /> : null}
              <IncompleteDraftNotice incomplete={incompleteDraft} />
              <ReviewWarningList warnings={warnings} />
              {warnings.length > 0 ? (
                <label className="flex cursor-pointer items-start gap-2.5 text-[12px] font-semibold text-[#6B4E00]">
                  <input
                    type="checkbox"
                    checked={Boolean(reviewChecks.warnings)}
                    onChange={(event) => onCheckChange("warnings", event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#084734]"
                  />
                  <span>위 경고를 확인했습니다 — 고객 문안에 해당 내용을 넣지 않았습니다</span>
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="divide-y divide-black/[0.08] border-b border-black/[0.08]">
            {([
              ["customer", "고객 맥락 확인", "요청 내용과 계정·계약·장비 조건을 확인했습니다.", UserRound],
              ["evidence", "정본 근거 확인", "공개 가이드와 내부 정본의 적용 범위를 확인했습니다.", BookOpen],
              ["externalScope", "외부 전달 범위 확인", "본사 확인 필요 여부와 공개 가능한 범위를 판단했습니다.", ExternalLink],
            ] as const).map(([key, title, description, Icon], index) => (
              <label key={key} className="flex cursor-pointer items-start gap-3 px-5 py-3 hover:bg-[#FAFAF8]">
                <input
                  ref={index === 0 ? firstCheckRef : undefined}
                  type="checkbox"
                  checked={reviewChecks[key]}
                  onChange={(event) => onCheckChange(key, event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#084734]"
                />
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F6F5F4] text-[#615D59]">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold text-[#31302E]">{title}</span>
                  <span className="mt-0.5 block text-[12px] leading-4 text-[#615D59]">{description}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="internal-cs-final-answer" className="text-[13px] font-semibold">고객 전달용 최종 답변</label>
              {onPolish ? (
                <button
                  type="button"
                  onClick={onPolish}
                  disabled={polishing || isPending || !pendingMessage}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/[0.12] bg-white px-2.5 text-[11px] font-semibold text-[#31302E] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:cursor-not-allowed disabled:opacity-50"
                  title="AI 초안을 고객에게 보낼 문안으로 다듬어 이 칸에 넣습니다. 검토와 확인 3종은 그대로 거칩니다"
                >
                  {polishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                  고객용 문안 만들기
                </button>
              ) : (
                <span className="text-[11px] text-[#78736D]">내부 분석과 별도 작성</span>
              )}
            </div>
            {polishNotice ? (
              <p role="status" className="mt-2 text-[12px] leading-4 text-[#615D59]">
                {polishNotice}
                {polishCanUndo && onPolishUndo ? (
                  <button
                    type="button"
                    onClick={onPolishUndo}
                    className="ml-2 font-semibold text-[#084734] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                  >
                    쓰던 글로 되돌리기
                  </button>
                ) : null}
              </p>
            ) : null}
            <textarea
              id="internal-cs-final-answer"
              value={finalDraft}
              onChange={(event) => onFinalDraftChange(event.target.value)}
              rows={7}
              className="mt-2 w-full resize-y rounded-md border border-black/[0.16] bg-white px-3 py-2.5 text-[12px] leading-5 text-[#31302E] outline-none focus:border-[#084734]/50 focus:ring-2 focus:ring-[#084734]/10"
              placeholder="내부 분석을 그대로 복사하지 말고, 확인된 사실만으로 고객 전달 문안을 작성해 주세요."
            />
            <div className="mt-3">
              <label htmlFor="internal-cs-review-note" className="text-[12px] font-semibold text-[#31302E]">검토 메모</label>
              <textarea
                id="internal-cs-review-note"
                value={reviewNote}
                onChange={(event) => onReviewNoteChange(event.target.value)}
                rows={2}
                className="mt-1.5 w-full resize-none rounded-md border border-black/[0.12] px-3 py-2 text-[12px] leading-5 outline-none focus:border-[#084734]/50 focus:ring-2 focus:ring-[#084734]/10"
                placeholder="수정 이유나 본사 확인 항목을 남기세요."
              />
            </div>
            {/* 판정 후 자동 처리 — 이 판정이 어떤 후속 파이프라인을 만드는지 묶어서 보여준다. */}
            <details className="mt-3 overflow-hidden rounded-[9px] border border-black/[0.10]">
              <summary className="cursor-pointer bg-[#FAFAF8] px-3.5 py-2 text-[12px] font-semibold text-[#31302E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]">
                수정 요청 시 자동 처리 바꾸기
              </summary>
              <label className="flex cursor-pointer items-start gap-2.5 border-t border-black/[0.06] px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={regressionCandidate}
                  onChange={(event) => onRegressionCandidateChange(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#084734]"
                />
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-[#31302E]">회귀 개선 후보로 저장</span>
                  <span className="mt-0.5 block text-[12px] leading-4 text-[#615D59]">이 답변을 운영 데스크의 회귀 검수 대기에 올립니다.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 border-t border-black/[0.06] px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={!excludeFromGapQueue}
                  onChange={(event) => onExcludeFromGapQueueChange(!event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#084734]"
                />
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-[#31302E]">문서 보강 큐로 유입</span>
                  <span className="mt-0.5 block text-[12px] leading-4 text-[#615D59]">질문을 보강 큐에 자동 등록합니다. 해제하면 이 질문은 유입되지 않습니다.</span>
                </span>
              </label>
            </details>
          </div>
        </div>

        <div className="shrink-0 border-t border-black/[0.08] bg-white p-4">
          <p data-testid="review-auto-summary" className="mb-2 text-[12px] text-[#615D59]">
            수정 요청 시 자동 처리: {autoSummary}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onSubmitReview("changes_requested")}
              disabled={!pendingMessage || isPending}
              className="h-10 rounded-md border border-black/[0.16] bg-white text-[12px] font-semibold hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:opacity-40"
            >
              수정 요청
            </button>
            {onReject && pendingMessage ? (
              <button
                type="button"
                onClick={() => onReject(pendingMessage.id)}
                disabled={isPending}
                className="h-10 rounded-md border border-black/[0.16] bg-white text-[12px] font-semibold text-[#615D59] hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:opacity-40"
                title="이 초안을 쓰지 않습니다. 보강 큐에도 올리지 않습니다"
              >
                사용 안 함
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => onSubmitReview("approved")}
              disabled={!canApprove || isPending}
              aria-describedby={!canApprove && approveBlockedReason ? "internal-cs-approve-reason" : undefined}
              className="h-10 rounded-md bg-[#084734] text-[12px] font-semibold text-white hover:bg-[#065C41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#78736D]"
            >
              승인하고 복사
            </button>
          </div>
          {!canApprove && approveBlockedReason ? (
            <p id="internal-cs-approve-reason" data-testid="approve-blocked-reason" className="mt-2 text-[12px] leading-4 text-[#8F2C2C]">
              승인할 수 없는 이유: {approveBlockedReason}
            </p>
          ) : null}
          <p className="mt-2 flex items-start gap-2 text-[12px] leading-4 text-[#615D59]">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            승인하면 입력한 최종 답변이 고정되고 클립보드에 복사됩니다. 자동 외부 전송은 하지 않습니다.
          </p>
        </div>
      </aside>
    </>
  )
}
