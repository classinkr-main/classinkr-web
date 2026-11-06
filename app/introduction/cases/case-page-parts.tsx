// /introduction/cases 목록·상세가 함께 쓰는 지면 부품(이 폴더 안에서만 쓴다).
import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowRight, ChevronRight } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"
import { buttonVariants } from "@/components/ui/button"
import { INTRO_FINAL_CTA } from "@/lib/introduction/content"
import { cn } from "@/lib/utils"

/** 공개 섹션 안쪽 컨테이너(DESIGN.md §5-A) */
export const CASE_CONTAINER = "mx-auto max-w-page px-4 sm:px-6 lg:px-12"

/** 화면 끝의 텍스트 링크. 그린은 누를 수 있는 것에만 쓴다(DESIGN.md §2) */
export const CASE_TEXT_LINK =
  "inline-flex min-h-11 items-center gap-1 text-ui font-semibold text-fg-accent hover:underline underline-offset-4"

export interface CaseCrumb {
  name: string
  /** 없으면 현재 위치(링크 아님) */
  href?: string
}

/** Breadcrumb(controls §3.6): nav > ol, text-note muted, 링크는 link-quiet, 현재 항목은 aria-current */
export function CaseBreadcrumb({ items }: { items: CaseCrumb[] }) {
  return (
    <nav aria-label="현재 위치">
      <ol className="flex flex-wrap items-center gap-x-1.5 text-note text-fg-muted">
        {items.map((item, index) => (
          <li key={item.name} className="inline-flex min-h-11 items-center gap-x-1.5">
            {index > 0 ? <ChevronRight aria-hidden="true" className="size-3.5 text-fg-faint" /> : null}
            {item.href ? (
              <Link href={item.href} className="link-quiet inline-flex min-h-11 items-center">
                {item.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-fg-ink">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/**
 * 쪽 머리: 1px 먹 masthead → 레일(1–3칸) Kicker + 본문 칸(4–12) H1·덱. 64rem 미만은 Kicker 를 H1 위 12px 에 쌓는다.
 * Kicker 는 바 없이 폴리오(회색) → 라벨(먹)이다(V12-A).
 */
export function CasePageHead({
  folio,
  label,
  title,
  lead,
}: {
  folio: string
  label: ReactNode
  title: string
  lead: ReactNode
}) {
  return (
    <header className="masthead mt-6 md:mt-8 lg:grid lg:grid-cols-12 lg:gap-x-6">
      <p className="flex flex-wrap items-center gap-x-3 text-label text-fg-ink lg:col-span-3">
        <span className="text-folio text-fg-muted">{folio}</span>
        <span>{label}</span>
      </p>
      <div className="mt-3 lg:col-span-9 lg:mt-0">
        <h1 className="max-w-heading text-h1 text-fg-ink break-keep">{title}</h1>
        <p className="mt-6 max-w-deck text-body-l text-fg-body break-keep">{lead}</p>
      </div>
    </header>
  )
}

/** 마지막 띠(V5-A) — sunken + 이중 괘선 + primary 52 + 텍스트 링크, 왼쪽 정렬. 문구는 소개서 공통 INTRO_FINAL_CTA */
export function CaseClosingCta({
  ctaIds,
  tracking,
}: {
  ctaIds: { primary: string; secondary: string }
  tracking?: Record<string, string>
}) {
  const { title, lead, primary, secondary } = INTRO_FINAL_CTA
  return (
    <section className="rule-double bg-surface-sunken py-20 md:py-32">
      <div className={CASE_CONTAINER}>
        <h2 className="max-w-heading text-h1 text-fg-ink break-keep">{title}</h2>
        <p className="mt-4 max-w-deck text-body-l text-fg-body break-keep">{lead}</p>
        <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
          <TrackedLink
            href={primary.href}
            ctaId={ctaIds.primary}
            tracking={tracking}
            className={cn(buttonVariants({ size: "cta" }), "w-full shadow-none sm:w-auto")}
          >
            {primary.label}
            <ArrowRight aria-hidden="true" className="arrow-nudge" />
          </TrackedLink>
          <TrackedLink href={secondary.href} ctaId={ctaIds.secondary} tracking={tracking} className={CASE_TEXT_LINK}>
            {secondary.label}
            <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" />
          </TrackedLink>
        </div>
      </div>
    </section>
  )
}
