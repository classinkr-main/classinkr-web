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
      toast.success("의견을 보냈어요. 고마워요")
    } catch {
      setStatus("idle")
      toast.error("의견을 보내지 못했어요. 잠시 후 다시 눌러 주세요")
    }
  }

  const isSaving = status === "saving"
  const isSaved = status === "saved"

  return (
    <section
      className={cn(
        "border-t border-black/[0.08] pt-8",
        className
      )}
      aria-label="가이드 피드백"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center text-[#084734]">
              {isSaved ? (
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              ) : (
                <MessageSquareText className="h-5 w-5" aria-hidden />
              )}
            </div>
            <h2 className="text-xl font-black tracking-card text-[#111110]">
              이 안내가 도움이 되었나요?
            </h2>
          </div>
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:pl-12">
          <p className="text-sm leading-6 text-[#615D59]">
            보내 주신 의견은 이 문서를 고칠 때 참고합니다.
          </p>
          <div className="flex min-w-0 gap-4 md:shrink-0 md:justify-end">
            <button
              type="button"
              onClick={() => void submitFeedback("helpful", "")}
              disabled={isSaving}
              className={cn(
                "inline-flex min-h-8 origin-center items-center justify-center gap-1.5 border-b border-transparent px-0 text-sm font-semibold transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]",
                rating === "helpful"
                  ? "border-[#084734] text-[#084734]"
                  : "text-[#31302E] hover:border-[#084734]/30 hover:text-[#084734]",
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
                "inline-flex min-h-8 origin-center items-center justify-center gap-1.5 border-b border-transparent px-0 text-sm font-semibold transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]",
                rating === "not_helpful"
                  ? "border-[#B85C33] text-[#B85C33]"
                  : "text-[#31302E] hover:border-[#B85C33]/30 hover:text-[#B85C33]",
                isSaving ? "cursor-wait opacity-70" : ""
              )}
            >
              <ThumbsDown className="h-4 w-4" aria-hidden />
              아쉬움
            </button>
          </div>
        </div>
      </div>

      {rating === "not_helpful" && !isSaved ? (
        <div className="mt-5 border-t border-black/[0.08] pt-5">
          <label htmlFor="docs-feedback-comment" className="text-sm font-bold text-[#111110]">
            어떤 점이 부족했나요?
          </label>
          <textarea
            id="docs-feedback-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={500}
            rows={3}
            className="mt-2 w-full resize-none border-b border-black/[0.08] bg-transparent px-0 py-3 text-sm leading-6 text-[#111110] outline-none transition-colors placeholder:text-[#A39E98] focus:border-[#084734]/40"
            placeholder="빠진 단계, 실제 화면과 다른 부분, 찾기 어려웠던 내용을 적어 주세요"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-[#A39E98]">{comment.length}/500</span>
            <button
              type="button"
              onClick={() => void submitFeedback("not_helpful")}
              disabled={isSaving}
              className="inline-flex min-h-11 origin-center items-center justify-center gap-2 border-b border-[#084734] px-0 text-sm font-semibold text-[#084734] transition-all duration-150 hover:text-[#065c41] active:scale-[0.97] disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              의견 보내기
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
