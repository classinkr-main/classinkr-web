"use client"

import type { ReactNode } from "react"
import { Loader2, RefreshCw, Search } from "lucide-react"

import type { QueueTone } from "./document-queues"

/*
 * 계약서·영수증·SW 코드 탭이 함께 쓰는 B 방식(왼쪽 다음 할 일 목록 + 오른쪽 상세) 조각.
 * 색·버튼·간격은 HardwareQuotesPanel(견적서 탭)과 같은 값 — 채움 배경 없이 점·글자색·외곽선으로만 강조한다.
 */

export const GHOST_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-3 text-[12.5px] font-semibold text-[#31302E] transition-colors hover:border-[#c8c8c4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-60"
export const SOLID_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#084734] px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-60"
export const OUTLINE_STRONG_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#31302E] bg-white px-3.5 text-[12.5px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F2] disabled:cursor-not-allowed disabled:opacity-60"
export const DANGER_GHOST_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-3 text-[12.5px] font-semibold text-[#B43E3E] transition-colors hover:border-[#F2B8B8] disabled:cursor-not-allowed disabled:opacity-60"

export const TONE_DOT: Record<QueueTone, string> = {
  go: "bg-[#084734]",
  warn: "bg-[#A8741A]",
  neutral: "bg-[#31302E]",
  muted: "bg-[#C9C6C0]",
}

/** 목록 오른쪽 상태 글자 — 강조할 때만 굵게·색. */
export const STATUS_TEXT: Record<QueueTone, string> = {
  go: "font-semibold text-[#084734]",
  warn: "font-semibold text-[#7A520F]",
  neutral: "text-[#78736D]",
  muted: "text-[#78736D]",
}

export function formatWon(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`
}

export function formatMan(value: number) {
  return `${(Math.round(value / 1000) / 10).toLocaleString("ko-KR")}만`
}

export function formatDay(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(date)
}

/** 전체 틀 — 왼쪽 목록, 오른쪽 상세. 좁은 화면에서는 상세가 목록 아래로 내려간다. */
export function QueueLayout({ label, list, detail }: { label: string; list: ReactNode; detail: ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[10px] border border-[#e8e8e4] bg-white lg:flex-row">
      <aside aria-label={label} className="w-full min-w-0 shrink-0 border-[#e8e8e4] lg:w-[400px] lg:border-r">
        {list}
      </aside>
      <div className="min-w-0 flex-1 border-t border-[#e8e8e4] lg:border-t-0">{detail}</div>
    </div>
  )
}

export function QueueToolbar({
  query,
  onQueryChange,
  placeholder,
  loading,
  onRefresh,
  action,
}: {
  query: string
  onQueryChange: (value: string) => void
  placeholder: string
  loading: boolean
  onRefresh: () => void
  action: ReactNode
}) {
  return (
    <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-3.5 py-3">
      <label className="relative block min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A39E98]" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-9 w-full rounded-md border border-[#e8e8e4] bg-white pl-9 pr-3 text-[13px] outline-none placeholder:text-[#A39E98] focus:border-[#084734]"
        />
      </label>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        title="새로고침"
        aria-label="새로고침"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#615D59] hover:bg-[#f0f0ec] hover:text-[#111110] disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      </button>
      {action}
    </div>
  )
}

export function QueueGroupHeader({ tone, label, count, aside }: { tone: QueueTone; label: string; count: number; aside?: string }) {
  return (
    <h2 className="flex items-baseline justify-between px-4 pb-1.5 pt-3.5 text-[11.5px] font-semibold text-[#31302E]">
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
        {label}
        <span className="font-normal tabular-nums text-[#78736D]">{count}</span>
      </span>
      {aside && <span className="font-normal tabular-nums text-[#78736D]">{aside}</span>}
    </h2>
  )
}

export function QueueListItem({
  selected,
  onSelect,
  title,
  subtitle,
  amount,
  mono,
  status,
  statusTone,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  subtitle?: string | null
  amount: string
  mono: string
  status: string
  statusTone: QueueTone
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`block w-full py-2.5 pl-[18px] pr-4 text-left transition-colors ${
        selected ? "bg-[#F6F5F2] shadow-[inset_2px_0_0_#084734]" : "hover:bg-[#FCFCFA]"
      }`}
    >
      <span className="flex items-baseline justify-between gap-2.5">
        <span className="truncate text-[13px] font-semibold text-[#111110]">
          {title}
          {subtitle && <span className="font-normal text-[#615D59]"> · {subtitle}</span>}
        </span>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#111110]">{amount}</span>
      </span>
      <span className="mt-0.5 flex justify-between gap-2 text-[11.5px] text-[#78736D]">
        <span className="truncate font-mono text-[11px]">{mono}</span>
        <span className={`whitespace-nowrap ${STATUS_TEXT[statusTone]}`}>{status}</span>
      </span>
    </button>
  )
}

/** 상세 상단의 "지금 할 일" 한 줄 + 버튼. */
export function NextActionBox({
  tone,
  label,
  description,
  children,
}: {
  tone: QueueTone
  label: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#e8e8e4] px-4 py-3.5">
      <div className="min-w-0 flex-[1_1_240px]">
        <p className="flex items-center gap-2 text-[13.5px] font-bold text-[#111110]">
          <span className={`h-[7px] w-[7px] rounded-full ${TONE_DOT[tone]}`} />
          {label}
        </p>
        <p className="mt-0.5 text-xs text-[#615D59]">{description}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export type TimelineStep = { label: string; detail?: string | null; done: boolean; warn?: boolean }

/** 세로 단계 타임라인. 마지막 단계가 끝나면 초록 점(결과)으로 표시한다. */
export function QueueTimeline({ title, steps }: { title: string; steps: TimelineStep[] }) {
  const last = steps.length - 1
  return (
    <div>
      <h3 className="mb-3 text-[11.5px] font-semibold text-[#78736D]">{title}</h3>
      <ol>
        {steps.map((step, index) => (
          <li key={step.label} className="flex gap-2.5">
            <span aria-hidden className="flex w-3 shrink-0 flex-col items-center pt-1">
              <span
                className={`h-[9px] w-[9px] rounded-full border-[1.5px] ${
                  step.done && index === last
                    ? "border-[#084734] bg-[#084734]"
                    : step.done
                      ? "border-[#31302E] bg-[#31302E]"
                      : "border-[#CFCBC5] bg-white"
                }`}
              />
              {index < last && (
                <span className={`mt-[3px] min-h-5 w-[1.5px] flex-1 ${steps[index + 1].done ? "bg-[#31302E]" : "bg-[#e8e8e4]"}`} />
              )}
            </span>
            <span className="pb-3.5">
              <span className={`block text-[13px] ${step.done ? "font-semibold text-[#111110]" : "text-[#78736D]"}`}>
                {step.label}
              </span>
              {step.detail && (
                <span className={`block text-[11.5px] ${step.warn ? "font-semibold text-[#7A520F]" : "text-[#78736D]"}`}>
                  {step.detail}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export type DocLink = { label: string; value: string | null; current?: boolean }

/** 견적 → 계약 → 영수증 연결 줄. 없는 칸은 점선 '아직 없음'. */
export function DocChain({ links }: { links: DocLink[] }) {
  return (
    <nav aria-label="연결 문서" className="flex flex-wrap items-center gap-2 text-xs text-[#78736D]">
      <span>연결 문서</span>
      {links.map((link, index) => (
        <span key={link.label} className="flex items-center gap-2">
          {index > 0 && <span aria-hidden>→</span>}
          {link.value ? (
            <span
              className={`rounded border px-[7px] py-0.5 font-mono text-[11.5px] ${
                link.current ? "border-[#31302E] font-semibold text-[#111110]" : "border-[#e8e8e4] text-[#31302E]"
              }`}
            >
              {link.label} {link.value}
            </span>
          ) : (
            <span className="rounded border border-dashed border-[#D6D3CE] px-[7px] py-0.5 text-[11.5px] text-[#78736D]">
              {link.label} 아직 없음
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function QueueEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-[#e8e8e4] bg-white px-6 py-16 text-center">
      <span className="text-[#615D59]">{icon}</span>
      <p className="mt-3 text-sm font-medium text-[#111110]">{title}</p>
      <p className="mt-1 max-w-md text-balance text-xs leading-relaxed text-[#78736D]">{description}</p>
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function QueueLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-6 py-14 text-sm text-[#615D59]">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  )
}

export function NoMatch({ label, onReset }: { label: string; onReset: () => void }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-medium text-[#111110]">{label}</p>
      <button type="button" onClick={onReset} className={`${GHOST_BUTTON} mt-3`}>
        전체 보기
      </button>
    </div>
  )
}

export function DetailHeader({
  mono,
  title,
  meta,
  amount,
  amountNote,
  badge,
}: {
  mono: ReactNode
  title: string
  meta?: string | null
  amount: string
  amountNote: string
  badge?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11.5px] text-[#78736D]">{mono}</span>
          {badge}
        </div>
        <h2 className="mt-1.5 truncate text-lg font-bold tracking-[-0.02em] text-[#111110]">{title}</h2>
        {meta && <p className="mt-0.5 text-xs text-[#615D59]">{meta}</p>}
      </div>
      <div className="text-right">
        <p className="text-2xl font-bold tracking-[-0.02em] tabular-nums text-[#111110]">{amount}</p>
        <p className="text-[11.5px] text-[#78736D]">{amountNote}</p>
      </div>
    </div>
  )
}
