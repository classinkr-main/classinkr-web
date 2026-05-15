"use client"

import { useEffect, useState } from "react"

type LoadingPhase = "quiet" | "visible" | "delayed"

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded-lg bg-[linear-gradient(90deg,#f0f0ec_0%,#fafaf8_40%,#f0f0ec_80%)] bg-[length:200%_100%] ${className}`}
    />
  )
}

export default function AdminRouteLoading() {
  const [phase, setPhase] = useState<LoadingPhase>("quiet")

  useEffect(() => {
    const visibleTimer = window.setTimeout(() => setPhase("visible"), 180)
    const delayedTimer = window.setTimeout(() => setPhase("delayed"), 1_000)

    return () => {
      window.clearTimeout(visibleTimer)
      window.clearTimeout(delayedTimer)
    }
  }, [])

  if (phase === "quiet") {
    return <div className="min-h-[40vh]" aria-hidden="true" />
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="loading-soft-enter px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10"
    >
      <div className="overflow-hidden rounded-full bg-[#e8e8e4]">
        <div className="h-1 w-full">
          <div className="h-full w-1/3 rounded-full bg-[#084734] admin-loading-progress" />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 text-[12px] font-medium text-[#1a1a1a]/45">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#084734]" />
        관리자 탭을 불러오는 중입니다
      </div>

      {phase === "delayed" ? (
        <div className="loading-soft-enter mt-5 space-y-6">
          <div className="rounded-lg border border-[#e8e8e4] bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-3">
                <SkeletonBlock className="h-4 w-44" />
                <SkeletonBlock className="h-3 w-64 max-w-full" />
              </div>
              <SkeletonBlock className="h-10 w-32" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-[#e8e8e4] bg-white p-5">
                <SkeletonBlock className="h-9 w-9 rounded-xl" />
                <SkeletonBlock className="mt-4 h-3 w-20" />
                <SkeletonBlock className="mt-3 h-7 w-16" />
                <SkeletonBlock className="mt-3 h-3 w-28" />
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {Array.from({ length: 2 }).map((_, sectionIndex) => (
              <div key={sectionIndex} className="rounded-lg border border-[#e8e8e4] bg-white p-5">
                <SkeletonBlock className="h-4 w-32" />
                <div className="mt-5 space-y-3">
                  {Array.from({ length: 4 }).map((__, rowIndex) => (
                    <div key={rowIndex} className="flex items-center gap-3">
                      <SkeletonBlock className="h-9 w-9 rounded-xl" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <SkeletonBlock className="h-3 w-3/5" />
                        <SkeletonBlock className="h-3 w-2/5" />
                      </div>
                      <SkeletonBlock className="h-6 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
