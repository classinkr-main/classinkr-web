"use client"

import { useEffect } from "react"
import Link from "next/link"
import { RefreshCw } from "lucide-react"

// 블로그 세그먼트 공통 에러 경계 — 목록·상세의 렌더/조회 실패를 여기서 받는다.
// 루트 app/error.tsx로 떨어지면 "홈으로"밖에 없어서 블로그 문맥을 잃으므로,
// 다시 시도 + 블로그 목록 복귀 동선을 함께 준다.
export default function BlogError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[blog] route error:", error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8] px-6 py-28">
      <div className="w-full max-w-md rounded-2xl border border-[#F6D5C5] bg-[#FEF8F5] px-6 py-9 text-center">
        <p className="text-[15px] font-bold text-[#111110]">글을 불러오지 못했습니다.</p>
        <p className="mt-2 text-[13px] leading-relaxed text-[#57534E]">
          일시적인 문제일 수 있습니다. 잠시 후 다시 시도해 주세요.
          {error.digest ? ` (오류 코드: ${error.digest})` : ""}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#084734] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FEF8F5]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            다시 시도
          </button>
          <Link
            href="/blog"
            className="inline-flex h-10 items-center rounded-lg border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#3F3B38] transition-colors hover:border-black/20 hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FEF8F5]"
          >
            블로그 목록
          </Link>
        </div>
      </div>
    </div>
  )
}
