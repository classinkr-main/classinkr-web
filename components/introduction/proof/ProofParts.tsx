// /introduction/proof 지면 부품(이 폴더 안에서만 쓴다). 소개서 공용 부품(components/introduction/*)은 이름·props 를 바꾸지 않고 그대로 쓴다.
import Image from "next/image"
import type { ReactNode } from "react"

import { getIntroAsset } from "@/lib/introduction/assets"
import { cn } from "@/lib/utils"

import type { ProofPhoto } from "./proof-copy"

/** 섹션 안쪽 컨테이너(DESIGN.md §5-A: max-w-page 1296, 거터 16/24/48) */
export const PROOF_CONTAINER = "mx-auto max-w-page px-4 sm:px-6 lg:px-12"

/** 누를 수 있는 글줄 링크(그린은 누를 수 있는 것에만, DESIGN.md §2) */
export const PROOF_TEXT_LINK =
  "inline-flex min-h-11 items-center gap-1 text-ui font-semibold text-fg-accent underline-offset-4 hover:underline"

/**
 * 장 섹션 — 리듬 base(64/96). 지면은 paper 가 기본이고, 먹 지면은 surface-ink 클래스로만 바꾼다(페이지당 1곳).
 * 구획은 masthead 와 여백이 맡는다(섹션 사이 경계선 0).
 */
export function ProofSection({
  id,
  surface = "paper",
  children,
}: {
  id: string
  surface?: "paper" | "ink"
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("py-16 md:py-24", surface === "ink" ? "surface-ink" : "bg-surface-paper")}
    >
      <div className={PROOF_CONTAINER}>{children}</div>
    </section>
  )
}

/**
 * 장 머리(typography §3-2): 1px 먹 masthead → 레일(1–3칸) Kicker(폴리오 회색 + 라벨 먹) + 본문 칸(4–12) H2 → 덱.
 * 64rem 미만은 Kicker 를 H2 위 12px 에 쌓는다. 그린 0. 먹 지면에서는 토큰이 밝은 값으로 바뀐다.
 */
export function ProofSectionHead({
  id,
  folio,
  kicker,
  title,
  lead,
}: {
  id: string
  folio: string
  kicker: string
  title: string
  lead?: string
}) {
  return (
    <header className="masthead lg:grid lg:grid-cols-12 lg:gap-x-6">
      <p className="flex items-center gap-3 text-label text-fg-ink lg:col-span-3">
        <span aria-hidden="true" className="text-folio tabular-nums text-fg-muted">
          {folio}
        </span>
        <span>{kicker}</span>
      </p>
      <div className="mt-3 lg:col-span-9 lg:mt-0">
        <h2 id={`${id}-title`} className="max-w-heading text-h2 text-fg-ink">
          {title}
        </h2>
        {lead ? <p className="mt-4 max-w-deck text-body-l text-fg-body md:mt-5">{lead}</p> : null}
      </div>
    </header>
  )
}

/**
 * 잘라 보여 주는 현장 사진 한 장 — 반경 0·그림자 0, 테두리는 hair 한 줄(V14-A). 비율은 frameClassName 이 정한다.
 * 고객 사진은 이미 얼굴 블러 처리본이라 CSS 블러를 더하지 않는다. priority 없음 — LCP 는 H1 이다.
 */
export function ProofFigure({
  photo,
  sizes,
  className,
  frameClassName,
  imageClassName,
  children,
}: {
  photo: ProofPhoto
  sizes: string
  className?: string
  frameClassName?: string
  imageClassName?: string
  /** 사진 위에 겹치는 표지(모자이크 번호 등) */
  children?: ReactNode
}) {
  const file = getIntroAsset(photo.asset)
  return (
    <figure className={cn("min-w-0", className)}>
      <div className={cn("relative overflow-hidden border border-line-hair bg-surface-skeleton", frameClassName)}>
        <Image src={file.src} alt={photo.alt} fill sizes={sizes} className={cn("object-cover", imageClassName)} />
        {children}
      </div>
      {photo.caption ? <figcaption className="mt-2.5 text-note text-fg-muted">{photo.caption}</figcaption> : null}
    </figure>
  )
}
