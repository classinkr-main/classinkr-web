"use client"

import Link from "next/link"
import { AlertTriangle, BookOpen, CheckCircle2, ExternalLink, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

import type { PromotionResult } from "../types"

// 계약 3 "지식으로 승격" 제어 — 회귀 패널 항목과 대화 스레드의 승인된 메시지 두 곳에서 공유한다.
// 성공하면 버튼 대신 articleId 링크를 보여준다. 실패해도 버튼을 남겨 재시도할 수 있게 한다.
export default function PromoteKnowledgeControl({
  pending,
  result,
  onPromote,
  compact = false,
}: {
  pending: boolean
  result: PromotionResult | undefined
  onPromote: () => void
  // compact — 밀도 높은 리스트 행(회귀 후보) 안에서 쓰는 변형. 기본 중립 톤, hover에서만
  // 강조색을 드러내 옆의 판정 버튼군(1차 액션)보다 시각 무게를 낮춘다. 대화 상세의 답변 카드
  // (기본값)는 카드 하단 여유 공간에 단독으로 놓이므로 기존 강조 스타일을 유지한다.
  compact?: boolean
}) {
  if (result?.status === "success") {
    // searchable === false — 문서는 저장됐지만 임베딩 실패로 아직 검색에 잡히지 않는 상태(앰버).
    // true/부재(구응답)는 기존 그린 배지 그대로. edit 링크는 양쪽 모두 유지한다.
    const indexingPending = result.searchable === false
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md font-semibold",
            compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]",
            indexingPending ? "bg-[#FBF1E0] text-[#7A520F]" : "bg-[#ECFDF5] text-[#084734]"
          )}
        >
          {indexingPending ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
          {indexingPending
            ? "승격됨 — 검색 색인 대기(임베딩 실패)"
            : result.reused ? "기존 문서 갱신됨" : "지식으로 승격됨"}
        </span>
        <Link
          href={`/admin/docs/${result.articleId}/edit`}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#084734] hover:underline"
        >
          문서 열기
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={onPromote}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          compact
            ? "h-6 border-black/[0.08] px-2 text-[10px] text-[#615D59] hover:border-[#084734]/20 hover:bg-[#ECFDF5] hover:text-[#084734]"
            : "h-7 border-black/[0.08] px-2.5 text-[10px] text-[#084734] hover:bg-[#ECFDF5]"
        )}
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookOpen className="h-3 w-3" />}
        {pending ? "승격 중" : "지식으로 승격"}
      </button>
      {result?.status === "error" ? (
        <p className="flex items-start gap-1 text-[10px] leading-4 text-[#8F2C2C]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {result.error}
        </p>
      ) : null}
    </div>
  )
}
