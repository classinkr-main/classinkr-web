import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** 모든 섹션의 안쪽 컨테이너(DESIGN.md §5-A: max-w-page 1296, 거터 16/24/48). */
export const LANDING_CONTAINER = "mx-auto max-w-page px-4 sm:px-6 lg:px-12"

/** 12칸 그리드(≥64rem). 레일 1–3칸 · 본문 4–12칸. 그 아래는 1열이다. */
export const LANDING_GRID = "lg:grid lg:grid-cols-12 lg:gap-x-6"

/** 레일 Kicker(V12-A): 폴리오 13/500 회색 → 12px → 라벨 13/600 먹. 그린 0. 폴리오는 장식이라 읽지 않는다. */
export function LandingKicker({ folio, label, className }: { folio?: string; label: string; className?: string }) {
  return (
    <p className={cn("flex items-center gap-3 text-label text-fg-ink", className)}>
      {folio ? (
        <span aria-hidden="true" className="text-folio tabular-nums text-fg-muted">
          {folio}
        </span>
      ) : null}
      <span>{label}</span>
    </p>
  )
}

/** 장 — 지면 paper, 리듬 base(64/96). 구획은 masthead 와 여백이 맡는다(섹션 사이 경계선 0). */
export function LandingChapter({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="bg-surface-paper py-16 md:py-24">
      <div className={LANDING_CONTAINER}>{children}</div>
    </section>
  )
}

/** 장 머리: 1px 먹 masthead → 레일 Kicker + 본문 칸 H2(18em) → 덱(34em). */
export function LandingChapterHead({
  id,
  folio,
  kicker,
  title,
  lead,
  className,
}: {
  id: string
  folio: string
  kicker: string
  title: string
  lead?: string
  className?: string
}) {
  return (
    <header className={cn("masthead", LANDING_GRID, className)}>
      <LandingKicker folio={folio} label={kicker} className="lg:col-span-3 lg:pt-3" />
      <div className="mt-3 min-w-0 lg:col-span-9 lg:mt-0">
        <h2 id={`${id}-title`} className="max-w-heading text-h2 text-fg-ink">
          {title}
        </h2>
        {lead ? <p className="mt-5 max-w-deck text-body-l text-fg-body md:mt-6">{lead}</p> : null}
      </div>
    </header>
  )
}

/**
 * 장 안의 절 머리: 위 hair 한 줄 → 레일 Kicker(+ 짧은 주) · 본문 칸(4–12) 내용.
 * 본문 칸 안에서 다시 칸을 나눌 때는 9칸 그리드를 쓴다(간격이 같아 바깥 12칸과 맞는다).
 */
export function LandingRailBlock({
  folio,
  kicker,
  note,
  children,
  className,
}: {
  folio?: string
  kicker: string
  note?: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("border-t border-line-hair pt-5", LANDING_GRID, className)}>
      <div className="lg:col-span-3 lg:pt-1.5">
        <LandingKicker folio={folio} label={kicker} />
        {note ? <p className="mt-1.5 max-w-heading text-note text-fg-muted">{note}</p> : null}
      </div>
      {children ? <div className="mt-3 min-w-0 lg:col-span-9 lg:mt-0">{children}</div> : null}
    </div>
  )
}

/** 본문 목록의 장식 대시(fg-faint 장식 글리프 — 읽지 않는다) */
export function LandingDashList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("space-y-1 text-body text-fg-body", className)}>
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <span aria-hidden="true" className="text-fg-faint">
            –
          </span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  )
}
