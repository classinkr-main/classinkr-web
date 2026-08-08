"use client"

import { HelpCircle, RefreshCcw, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

import { CONSOLE_CONTENT_CLASS } from "../constants"

// 워크스페이스 상단 바 + 전역 알림 배너 2종(에러·안내).
// 콘솔 내비는 이 위(기본 export)에서 이미 그려졌다.
export default function WorkspaceHeader({
  loading,
  isPending,
  regressionPendingCount,
  error,
  notice,
  onRefresh,
  onOpenTools,
}: {
  loading: boolean
  isPending: boolean
  regressionPendingCount: number
  error: string | null
  notice: string | null
  onRefresh: () => void
  onOpenTools: () => void
}) {
  return (
    <>
      <header className="shrink-0 border-b border-black/[0.08] bg-white">
        <div className={cn(CONSOLE_CONTENT_CLASS, "flex items-center justify-between gap-3 py-2.5")}>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#31302E] text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold tracking-[-0.02em]">CS 코파일럿</h1>
              <p className="hidden truncate text-[11px] text-[#615D59] sm:block">
                내부 정보와 본사 소통 기준을 함께 확인합니다
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onRefresh()}
              disabled={loading || isPending}
              className="hidden h-9 items-center gap-2 rounded-md px-3 text-[12px] font-medium text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#111110] disabled:opacity-40 sm:inline-flex"
            >
              <RefreshCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              새로고침
            </button>
            {/* 흡수된 자체 탭의 앰버 점 신호를 여기서 승계한다 — 미판정 회귀 후보가 있으면 켜진다. */}
            <button
              type="button"
              onClick={() => onOpenTools()}
              className="relative flex h-9 w-9 items-center justify-center rounded-md text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
              aria-label="운영 도구 열기"
            >
              <HelpCircle className="h-4.5 w-4.5" />
              {regressionPendingCount > 0 ? (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 h-[6px] w-[6px] rounded-full bg-[#A8741A] ring-2 ring-white"
                />
              ) : null}
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="shrink-0 border-b border-[#F2B8B8] bg-[#FCE9E9]">
          <p className={cn(CONSOLE_CONTENT_CLASS, "py-2.5 text-[12px] text-[#8F2C2C]")}>{error}</p>
        </div>
      ) : null}
      {notice ? (
        <div className="shrink-0 border-b border-[#BDEFD8] bg-[#ECFDF5]">
          <p className={cn(CONSOLE_CONTENT_CLASS, "py-2.5 text-[12px] text-[#084734]")}>{notice}</p>
        </div>
      ) : null}
    </>
  )
}
