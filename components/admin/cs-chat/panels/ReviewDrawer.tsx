"use client"

import { BookOpen, ExternalLink, LockKeyhole, UserRound, X } from "lucide-react"

import type { InternalCsMessage, ReviewChecks } from "../types"

// 검토 드로어 — 본문 영역(relative) 기준 `absolute inset-y-0 right-0`. 본문은 xl에서 pr-[438px]로 양보한다.
// 양보가 대화 패널에만 걸려 있으므로 워크스페이스는 이 드로어를 대화 탭에만 붙인다
// (정본: docs/active/cs-admin-console-ia-2026-07-27.md §9 "검토 드로어의 기준과 범위").
// 승인은 최종 답변을 고정하고 클립보드에 복사할 뿐, 자동 외부 전송은 하지 않는다(하단 경계 문구).
export default function ReviewDrawer({
  reviewChecks,
  finalDraft,
  reviewNote,
  regressionCandidate,
  excludeFromGapQueue,
  pendingMessage,
  isPending,
  canApprove,
  onClose,
  onCheckChange,
  onFinalDraftChange,
  onReviewNoteChange,
  onRegressionCandidateChange,
  onExcludeFromGapQueueChange,
  onSubmitReview,
}: {
  reviewChecks: ReviewChecks
  finalDraft: string
  reviewNote: string
  regressionCandidate: boolean
  excludeFromGapQueue: boolean
  pendingMessage: InternalCsMessage | null
  isPending: boolean
  canApprove: boolean
  onClose: () => void
  onCheckChange: (key: keyof ReviewChecks, checked: boolean) => void
  onFinalDraftChange: (value: string) => void
  onReviewNoteChange: (value: string) => void
  onRegressionCandidateChange: (checked: boolean) => void
  onExcludeFromGapQueueChange: (checked: boolean) => void
  onSubmitReview: (decision: "approved" | "changes_requested") => void
}) {
  return (
    <>
      <button
        type="button"
        className="absolute inset-0 z-30 bg-black/10 xl:hidden"
        onClick={onClose}
        aria-label="검토 패널 닫기"
      />
      <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[438px] flex-col border-l border-black/[0.08] bg-white shadow-[-14px_0_36px_rgba(0,0,0,0.06)]">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-black/[0.08] px-5">
          <div>
            <h2 className="text-[16px] font-semibold">검토</h2>
            <p className="mt-0.5 text-[10px] text-[#A39E98]">최종 판단은 CS 담당자에게 있습니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[#F6F5F4]"
            aria-label="검토 닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="divide-y divide-black/[0.08] border-b border-black/[0.08]">
            {([
              ["customer", "고객 맥락 확인", "요청 내용과 계정·계약·장비 조건을 확인했습니다.", UserRound],
              ["evidence", "정본 근거 확인", "공개 가이드와 내부 정본의 적용 범위를 확인했습니다.", BookOpen],
              ["externalScope", "외부 전달 범위 확인", "본사 확인 필요 여부와 공개 가능한 범위를 판단했습니다.", ExternalLink],
            ] as const).map(([key, title, description, Icon]) => (
              <label key={key} className="flex cursor-pointer items-start gap-3 px-5 py-4 hover:bg-[#FAFAF8]">
                <input
                  type="checkbox"
                  checked={reviewChecks[key]}
                  onChange={(event) => onCheckChange(key, event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#084734]"
                />
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F6F5F4] text-[#615D59]">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold text-[#31302E]">{title}</span>
                  <span className="mt-1 block text-[11px] leading-4 text-[#615D59]">{description}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="internal-cs-final-answer" className="text-[13px] font-semibold">최종 답변</label>
              <span className="text-[10px] text-[#A39E98]">외부 전달용</span>
            </div>
            <textarea
              id="internal-cs-final-answer"
              value={finalDraft}
              onChange={(event) => onFinalDraftChange(event.target.value)}
              rows={12}
              className="mt-3 w-full resize-y rounded-md border border-black/[0.16] bg-white px-3 py-3 text-[12px] leading-5 text-[#31302E] outline-none focus:border-[#084734]/50 focus:ring-2 focus:ring-[#084734]/10"
              placeholder="AI 초안을 검토하고 최종 답변으로 다듬어 주세요."
            />
            <div className="mt-4">
              <label htmlFor="internal-cs-review-note" className="text-[12px] font-semibold text-[#31302E]">검토 메모</label>
              <textarea
                id="internal-cs-review-note"
                value={reviewNote}
                onChange={(event) => onReviewNoteChange(event.target.value)}
                rows={3}
                className="mt-2 w-full resize-none rounded-md border border-black/[0.12] px-3 py-2 text-[12px] leading-5 outline-none focus:border-[#084734]/50 focus:ring-2 focus:ring-[#084734]/10"
                placeholder="수정 이유나 본사 확인 항목을 남기세요."
              />
            </div>
            {/* 판정 후 자동 처리 — 이 판정이 어떤 후속 파이프라인을 만드는지 묶어서 보여준다. */}
            <div className="mt-5 overflow-hidden rounded-[9px] border border-black/[0.10]">
              <div className="flex items-center justify-between border-b border-black/[0.08] bg-[#FAFAF8] px-3.5 py-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#31302E]">판정 후 자동 처리</span>
                <span className="text-[9.5px] text-[#A39E98]">수정 요청 시</span>
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 border-b border-black/[0.06] px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={regressionCandidate}
                  onChange={(event) => onRegressionCandidateChange(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#084734]"
                />
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-[#31302E]">회귀 개선 후보로 저장</span>
                  <span className="mt-0.5 block text-[10.5px] leading-4 text-[#A39E98]">이 답변을 운영 데스크의 회귀 검수 대기에 올립니다.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={!excludeFromGapQueue}
                  onChange={(event) => onExcludeFromGapQueueChange(!event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#084734]"
                />
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-[#31302E]">문서 보강 큐로 유입</span>
                  <span className="mt-0.5 block text-[10.5px] leading-4 text-[#A39E98]">질문을 보강 큐에 자동 등록합니다. 해제하면 이 질문은 유입되지 않습니다.</span>
                </span>
              </label>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-black/[0.08] bg-white p-5">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onSubmitReview("changes_requested")}
              disabled={!pendingMessage || isPending}
              className="h-10 rounded-md border border-black/[0.16] bg-white text-[12px] font-semibold hover:bg-[#F6F5F4] disabled:opacity-40"
            >
              수정 요청
            </button>
            <button
              type="button"
              onClick={() => onSubmitReview("approved")}
              disabled={!canApprove || isPending}
              className="h-10 rounded-md bg-[#084734] text-[12px] font-semibold text-white hover:bg-[#065C41] disabled:cursor-not-allowed disabled:bg-[#A39E98]"
            >
              승인하고 복사
            </button>
          </div>
          <p className="mt-3 flex items-start gap-2 text-[10px] leading-4 text-[#615D59]">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            승인하면 최종 답변으로 고정되고 클립보드에 복사됩니다. 자동 외부 전송은 하지 않습니다.
          </p>
        </div>
      </aside>
    </>
  )
}
