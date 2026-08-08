"use client"

import { useEffect } from "react"
import { RefreshCw } from "lucide-react"

// CRM 라우트 공통 에러 경계 — 렌더 에러가 빈 화면으로 죽지 않고 복구 동선(다시 시도)을 준다.
export default function AdminCrmError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[admin/crm] route error:", error)
  }, [error])

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-[#F6D5C5] bg-[#FEF8F5] px-6 py-8 text-center">
        <p className="text-[15px] font-bold text-[#111110]">화면을 그리는 중 문제가 발생했습니다.</p>
        <p className="mt-1.5 text-[12px] text-[#1a1a1a]/55">
          잠시 후 다시 시도해 주세요. 반복되면 관리자에게 알려주세요.
          {error.digest ? ` (오류 코드: ${error.digest})` : ""}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#084734] px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          다시 시도
        </button>
      </div>
    </div>
  )
}
