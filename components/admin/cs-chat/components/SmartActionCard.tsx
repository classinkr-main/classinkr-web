"use client"

import { useState } from "react"
import { Building, CheckCircle2, Check, Copy, LockKeyhole, PanelRightOpen, Sparkles, XCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { needsReReview } from "@/lib/internal-cs-chat/review-guard"
import type { InternalCsMessage } from "../types"

interface SmartActionCardProps {
  message: InternalCsMessage
  isLatest: boolean
  /**
   * 증상 추정(IC-20). 대화 태그나 서버 분류 도메인에서 나온 값이 있을 때만 넘긴다.
   * 확신이 없으면 null — 그러면 "이런 상황 맞나요" 줄을 아예 그리지 않는다(AI 답 글의 낱말로 추측하지 않는다).
   */
  issueHint?: string | null
  /** 검토 드로어를 열고 이 초안으로 스크롤한다. 승인은 드로어에서 확인 3종을 거친 뒤에만 된다(IC-01). */
  onOpenReview: (messageId: string) => void
  /** 이 초안을 '사용 안 함'(rejected + superseded)으로 치운다(IC-13). 없으면 버튼을 그리지 않는다. */
  onReject?: (messageId: string) => void
  onCopyCustomerHolding: () => void
  onRequestHq: () => void
}

export default function SmartActionCard({
  message,
  isLatest,
  issueHint = null,
  onOpenReview,
  onReject,
  onCopyCustomerHolding,
  onRequestHq,
}: SmartActionCardProps) {
  // 예전 즉시 승인 행(교정본 = AI 원문)은 승인 상태여도 고객용 최종 답으로 쓰지 않는다(검토 안전-1).
  const reReview = needsReReview(message)
  const isApproved = message.review_state === "approved" && !reReview
  const isPending = message.review_state === "pending"
  const [hintConfirmed, setHintConfirmed] = useState(false)

  return (
    <div className="mt-3.5 rounded-lg border border-black/[0.08] bg-[#FAFAF8] p-3.5">
      {issueHint ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#084734] text-white">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#615D59]">
                {hintConfirmed ? "확인한 분류" : "분류 추정 — 맞나요?"}
              </p>
              <p className="truncate text-[12px] font-semibold text-[#31302E]">{issueHint}</p>
            </div>
          </div>
          {hintConfirmed ? null : (
            <button
              type="button"
              onClick={() => setHintConfirmed(true)}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-[#084734] px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#065C41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              맞습니다
            </button>
          )}
        </div>
      ) : null}

      <div className={cn("flex flex-wrap items-center justify-between gap-3", issueHint && "mt-3")}>
        <div className="flex flex-wrap items-center gap-2">
          {isPending ? (
            <>
              {/* 승인은 검토 드로어 안에서만 한다(확인 3종 + 고객용 최종 답). 이 버튼은 드로어를 열기만 한다. */}
              <button
                type="button"
                onClick={() => onOpenReview(message.id)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#084734] px-3 text-[11px] font-semibold text-white transition-colors hover:bg-[#065C41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
              >
                <PanelRightOpen className="h-3.5 w-3.5" aria-hidden="true" />
                검토 열기
              </button>
              {onReject ? (
                <button
                  type="button"
                  onClick={() => onReject(message.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/[0.12] bg-white px-2.5 text-[11px] font-medium text-[#615D59] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
                  title={isLatest ? "이 초안을 쓰지 않습니다" : "옛 초안을 치웁니다. 아카이브와 본사 요청을 막지 않게 됩니다"}
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  사용 안 함
                </button>
              ) : null}
            </>
          ) : isApproved ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#084734]">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              담당자 승인 완료 · 고객용 최종 답이 확정되었습니다
            </span>
          ) : reReview ? (
            <span className="text-[11px] font-semibold text-[#8F2C2C]">
              재검토 필요 · 예전 즉시 승인본이라 고객용 최종 답으로 쓰지 않습니다
            </span>
          ) : message.review_state === "rejected" ? (
            <span className="text-[11px] text-[#615D59]">사용 안 함</span>
          ) : (
            <span className="text-[11px] text-[#615D59]">수정 요청 상태</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCopyCustomerHolding}
            disabled={!isApproved}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2",
              isApproved
                ? "border-[#084734]/25 bg-white text-[#084734] hover:bg-[#ECFDF5]"
                : "cursor-not-allowed border-black/[0.06] bg-[#F6F5F4] text-[#78736D] opacity-70"
            )}
            title={isApproved ? "고객 임시 안내문 클립보드 복사" : "담당자 승인 후 복사 가능"}
          >
            {isApproved ? <Copy className="h-3.5 w-3.5" aria-hidden="true" /> : <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />}
            고객 안내 복사
          </button>
          {/* 본사 확인 요청은 검토 대기 초안과 무관하게 열려 있다(IC-12). 고객 복사 잠금만 위 버튼이 유지한다. */}
          <button
            type="button"
            onClick={onRequestHq}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/[0.1] bg-white px-2.5 text-[11px] font-medium text-[#31302E] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
            title="본사 확인(HQ Desk) 인계 요청"
          >
            <Building className="h-3.5 w-3.5 text-[#615D59]" aria-hidden="true" />
            본사 확인 등록
          </button>
        </div>
      </div>
    </div>
  )
}
