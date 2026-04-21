"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, MessageSquareText, ThumbsDown, ThumbsUp } from "lucide-react"

import { useToast } from "@/components/ui/toast"

import { cn } from "./utils"

type FeedbackRating = "helpful" | "not_helpful"

export interface DocsArticleFeedbackProps {
  articlePath: string
  articleSlug: string
  category: string
  title: string
  className?: string
}

export function DocsArticleFeedback({
  articlePath,
  articleSlug,
  category,
  title,
  className,
}: DocsArticleFeedbackProps) {
  const toast = useToast()
  const [rating, setRating] = useState<FeedbackRating | null>(null)
  const [comment, setComment] = useState("")
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle")

  async function submitFeedback(nextRating: FeedbackRating, nextComment = comment) {
    setRating(nextRating)
    setStatus("saving")

    try {
      const response = await fetch("/api/docs/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          articlePath,
          articleSlug,
          category,
          title,
          rating: nextRating,
          comment: nextComment,
        }),
      })

      if (!response.ok) {
        throw new Error("feedback_failed")
      }

      setStatus("saved")
      toast.success("문서 피드백을 저장했어요")
    } catch {
      setStatus("idle")
      toast.error("피드백 저장에 실패했어요")
    }
  }

  const isSaving = status === "saving"
  const isSaved = status === "saved"

  return (
    <section
      className={cn(
        "rounded-2xl border border-black/[0.08] bg-white p-6 shadow-card md:p-8",
        className
      )}
      aria-label="문서 피드백"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#084734]">
            {isSaved ? (
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            ) : (
              <MessageSquareText className="h-5 w-5" aria-hidden />
            )}
          </div>
          <h2 className="mt-4 text-xl font-black tracking-card text-[#111110]">
            이 문서가 도움이 되었나요?
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#615D59]">
            남겨주신 반응은 FAQ와 챗봇 답변 품질 개선에 사용됩니다.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-3 sm:flex-row md:justify-end">
          <button
            type="button"
            onClick={() => void submitFeedback("helpful", "")}
            disabled={isSaving}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]",
              rating === "helpful"
                ? "border-[#084734] bg-[#084734] text-white"
                : "border-black/[0.08] bg-[#FAFAF8] text-[#31302E] hover:border-[#084734]/30 hover:text-[#084734]",
              isSaving ? "cursor-wait opacity-70" : ""
            )}
          >
            {isSaving && rating === "helpful" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ThumbsUp className="h-4 w-4" aria-hidden />
            )}
            도움됨
          </button>
          <button
            type="button"
            onClick={() => setRating("not_helpful")}
            disabled={isSaving}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]",
              rating === "not_helpful"
                ? "border-[#B85C33] bg-[#FFF1EC] text-[#B85C33]"
                : "border-black/[0.08] bg-[#FAFAF8] text-[#31302E] hover:border-[#B85C33]/30 hover:text-[#B85C33]",
              isSaving ? "cursor-wait opacity-70" : ""
            )}
          >
            <ThumbsDown className="h-4 w-4" aria-hidden />
            아쉬움
          </button>
        </div>
      </div>

      {rating === "not_helpful" && !isSaved ? (
        <div className="mt-5 border-t border-black/[0.08] pt-5">
          <label htmlFor="docs-feedback-comment" className="text-sm font-bold text-[#111110]">
            보완이 필요한 부분
          </label>
          <textarea
            id="docs-feedback-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={500}
            rows={3}
            className="mt-2 w-full resize-none rounded-xl border border-black/[0.08] bg-[#FAFAF8] px-4 py-3 text-sm leading-6 text-[#111110] outline-none transition-colors placeholder:text-[#A39E98] focus:border-[#084734]/40 focus:ring-2 focus:ring-[#084734]/15"
            placeholder="빠진 내용이나 찾기 어려웠던 부분을 알려주세요"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-[#A39E98]">{comment.length}/500</span>
            <button
              type="button"
              onClick={() => void submitFeedback("not_helpful")}
              disabled={isSaving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#084734] px-5 text-sm font-bold text-white transition-colors hover:bg-[#065c41] disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              피드백 보내기
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
