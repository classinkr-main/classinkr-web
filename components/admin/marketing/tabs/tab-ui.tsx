"use client"

/**
 * tab-ui — MarketingHub와 탭 패널 청크(tabs/HistoryTab·AutomationTab)가 공유하는
 * 표시 전용 조각. MarketingHub.tsx에서 그대로 옮겨왔다(로직 변경 없음) —
 * history/automation 탭을 next/dynamic 청크로 내리면서 공용 프리미티브만 여기로 승격.
 */

import type { ReactNode } from "react"
import { Sparkles } from "lucide-react"

export function formatDateTime(value?: string) {
  if (!value) return "시간 정보 없음"
  const ts = new Date(value)
  if (Number.isNaN(ts.getTime())) return "시간 정보 없음"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts)
}

export function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white shadow-[0_1px_0_rgba(17,17,16,0.02)]">
      <div className="flex flex-col gap-3 border-b border-[#e8e8e4] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">{title}</h2>
          {description && <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-5 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#1a1a1a]/35 shadow-[0_1px_0_rgba(17,17,16,0.03)]">
        <Sparkles className="h-5 w-5" />
      </div>
      <p className="mt-4 text-[14px] font-medium text-[#111110]">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-[#1a1a1a]/40">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function EmptyInline({ message }: { message: string }) {
  return <p className="py-8 text-center text-[12px] text-[#1a1a1a]/30">{message}</p>
}

export function MiniBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const className =
    tone === "success"
      ? "bg-green-50 text-green-700"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700"
        : tone === "danger"
          ? "bg-red-50 text-red-600"
          : "bg-[#f0f0ec] text-[#1a1a1a]/55"
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>
}

/**
 * next/dynamic 탭 청크 로딩 폴백 — 허브의 기존 인라인 로딩 문구
 * ("…를 불러오는 중...") 스타일과 동일한 골격을 쓴다.
 */
export function TabLoadingSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-6 py-16 text-center text-[13px] text-[#1a1a1a]/35"
    >
      {label}
    </div>
  )
}
