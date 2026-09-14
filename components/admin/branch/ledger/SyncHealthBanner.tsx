"use client"

import { AlertTriangle } from "lucide-react"

import { describeSyncHealth } from "@/lib/branch/sync-health-copy"
import type { BranchSyncHealth } from "../types"

// 매출 시트 동기화가 끊겼을 때만 뜨는 한 줄(2026-09-14). 정상이면 아무것도 렌더하지 않는다 —
// 상단 요소를 늘리지 않고, 끊겼을 때만 "며칠째 · 무엇 기준 · 어떻게 푸나"를 한곳에 모은다.
// 톤: 채움 없이 아웃라인 강조(DESIGN.md Danger/Warning 축).
export default function SyncHealthBanner({ health, now }: { health: BranchSyncHealth | undefined; now: number }) {
  const copy = describeSyncHealth(health, new Date(now))
  if (!copy) return null
  const accent = copy.tone === "danger" ? "border-[#B43E3E] text-[#8F2C2C]" : "border-[#A8741A] text-[#7A520F]"
  return (
    <div
      role="status"
      className={`flex flex-col gap-1 rounded-lg border bg-white px-3 py-2 text-[12px] sm:flex-row sm:items-center sm:gap-3 ${accent}`}
    >
      <span className="inline-flex items-center gap-1.5 font-bold">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        {copy.title}
      </span>
      <span className="text-[#31302E]">{copy.detail}</span>
      <span className="font-semibold">{copy.action}</span>
    </div>
  )
}
