"use client"

import { useEffect, useState } from "react"

type LoadingPhase = "quiet" | "visible" | "delayed"

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded-lg bg-[linear-gradient(90deg,#ecece7_0%,#fafaf8_38%,#ecece7_76%)] bg-[length:200%_100%] ${className}`}
    />
  )
}

export default function PublicRouteLoading() {
  const [phase, setPhase] = useState<LoadingPhase>("quiet")

  useEffect(() => {
    const visibleTimer = window.setTimeout(() => setPhase("visible"), 180)
    const delayedTimer = window.setTimeout(() => setPhase("delayed"), 1_200)

    return () => {
      window.clearTimeout(visibleTimer)
      window.clearTimeout(delayedTimer)
    }
  }, [])

  if (phase === "quiet") {
    return <div className="min-h-[40vh] bg-[#FAFAF8]" aria-hidden="true" />
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-[calc(100svh-76px)] bg-[#FAFAF8] px-4 pt-[92px] pb-16 md:min-h-[calc(100svh-5rem)] md:pt-28"
    >
      <span className="sr-only">페이지를 불러오는 중입니다</span>

      <div className="mx-auto w-full max-w-6xl">
        <div className="overflow-hidden rounded-full bg-[#e8e8e4]">
          <div className="h-1 w-full">
            <div className="h-full w-1/3 rounded-full bg-[#084734] admin-loading-progress" />
          </div>
        </div>

        <div className="loading-soft-enter mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-center">
          <div className="space-y-5">
            <SkeletonBlock className="h-8 w-40" />
            <div className="space-y-3">
              <SkeletonBlock className="h-12 w-full max-w-[620px] md:h-16" />
              <SkeletonBlock className="h-12 w-4/5 max-w-[520px] md:h-16" />
            </div>
            <div className="max-w-xl space-y-3 pt-1">
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-11/12" />
              <SkeletonBlock className="h-4 w-2/3" />
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <SkeletonBlock className="h-11 w-32" />
              <SkeletonBlock className="h-11 w-28" />
            </div>
          </div>

          <div className="hidden overflow-hidden rounded-lg border border-[#e8e8e4] bg-white/70 p-3 shadow-[0_24px_80px_rgba(17,17,16,0.06)] md:block">
            <div className="aspect-[4/3] rounded-lg bg-[#f3f3ef] p-4">
              <div className="flex h-full flex-col justify-between">
                <div className="grid grid-cols-3 gap-3">
                  <SkeletonBlock className="h-20" />
                  <SkeletonBlock className="h-20" />
                  <SkeletonBlock className="h-20" />
                </div>
                <div className="space-y-3">
                  <SkeletonBlock className="h-5 w-2/5" />
                  <SkeletonBlock className="h-24 w-full" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {phase === "delayed" ? (
          <div className="loading-soft-enter mt-10 grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="rounded-lg border border-[#e8e8e4] bg-white/65 p-4">
                <SkeletonBlock className="h-8 w-8" />
                <SkeletonBlock className="mt-4 h-4 w-3/5" />
                <SkeletonBlock className="mt-3 h-3 w-full" />
                <SkeletonBlock className="mt-2 h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
