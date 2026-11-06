import type { ReactNode } from "react"

import { getIntroAsset, type IntroAssetKey } from "@/lib/introduction/assets"
import type { IntroBlock, IntroDownload } from "@/lib/introduction/content"
import { cn } from "@/lib/utils"

import { IntroBlocks } from "../IntroBlocks"
import { IntroDownloadLink } from "../IntroDownloadLink"
import { IntroFigure } from "../IntroFigure"

/** 모든 섹션의 안쪽 컨테이너(DESIGN.md §5-A: max-w-page 1296, 거터 16/24/48). */
export const INTRO_CONTAINER = "mx-auto max-w-page px-4 sm:px-6 lg:px-12"

/** 장 섹션 — 지면은 paper, 리듬 base(64/96). 구획은 masthead 와 여백이 맡는다(섹션 사이 경계선 0). */
export function IntroChapter({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="bg-surface-paper py-16 md:py-24">
      <div className={INTRO_CONTAINER}>{children}</div>
    </section>
  )
}

/**
 * 장 머리(ChapterHead, typography §3-2): 1px 먹 masthead → 레일 Kicker(폴리오 + 라벨) + 본문 칸 H2 → 덱.
 * 64rem 이상에서 Kicker 는 1–3칸, H2·덱은 4–12칸. 그 아래는 Kicker 를 H2 위 12px 에 쌓는다. 그린 0.
 */
export function IntroChapterHead({
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
      <p data-kicker="" className="flex items-center gap-3 text-label text-fg-ink lg:col-span-3">
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

/** 장 안의 절. 위 hair 한 줄 + h3, 내용은 1–12칸. */
export function IntroSubsection({
  id,
  title,
  children,
  className,
}: {
  id?: string
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <div id={id} className={cn("mt-16 border-t border-line-hair pt-6 md:mt-24 md:pt-8", className)}>
      <h3 className="max-w-heading text-h3 text-fg-ink">{title}</h3>
      <div className="mt-8 md:mt-10">{children}</div>
    </div>
  )
}

/** 절 첫머리의 설명 한 단락(원문 인용 블록). 인용이 아니라 설명이라 <p> 에 먹 1px 왼선만 둔다. */
export function IntroLeadNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("max-w-measure border-l border-line-ink pl-5 text-body-l text-fg-ink", className)}>{children}</p>
  )
}

/**
 * '더 자세히 확인해 보세요' — 레일(1–3칸)에 제목·안내·PDF, 본문 칸(4–12칸)에 접힌 상세(<details>).
 * 64rem 이상에서 레일은 상세를 펼쳐 읽는 동안 헤더 아래에 붙어 있다.
 */
export function IntroDetails({
  title,
  lead,
  download,
  blocks,
}: {
  title: string
  lead?: string
  download: IntroDownload
  blocks: IntroBlock[]
}) {
  return (
    <div className="mt-16 border-t border-line-hair pt-6 md:mt-24 md:pt-8 lg:grid lg:grid-cols-12 lg:gap-x-6">
      <div className="lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:col-span-3 lg:self-start">
        <h3 className="text-h3 text-fg-ink">{title}</h3>
        {lead ? <p className="mt-3 text-body text-fg-body">{lead}</p> : null}
        <IntroDownloadLink download={download} className="mt-6" />
      </div>
      <div className="mt-10 lg:col-span-9 lg:mt-0">
        <IntroBlocks blocks={blocks} videoSource="introduction" className="space-y-0" />
      </div>
    </div>
  )
}

// 화면 캡처 매트: 16:10 sunken 판 + 사방 5% 여백. 캡처는 판 안에 '맞춰' 두고 hair 테두리는 캡처 자체에 남긴다(V16).
// 캡처마다 비율이 달라 판 안쪽 비율과 비교해 폭을 정한다 — 여백이 % 라 판 폭과 무관하게 맞는다.
const MAT_RATIO = 16 / 10
const MAT_PAD = 0.05
const MAT_INNER_RATIO = (1 - 2 * MAT_PAD) / (1 / MAT_RATIO - 2 * MAT_PAD)

/** 비율이 제각각인 화면 캡처를 같은 크기 판에 앉힌다(카드 그리드에서 아래 글줄이 맞도록). */
export function IntroMatFigure({ asset, alt, sizes }: { asset: IntroAssetKey; alt: string; sizes: string }) {
  const { width, height } = getIntroAsset(asset)
  const fit = Math.min(1, width / height / MAT_INNER_RATIO)
  return (
    <div className="flex aspect-screen items-center justify-center bg-surface-sunken p-[5%]">
      <div style={{ width: `${(fit * 100).toFixed(2)}%` }}>
        <IntroFigure asset={asset} alt={alt} sizes={sizes} />
      </div>
    </div>
  )
}

/** 흰 바탕 도해·구성도 한 장 — sunken 매트(20px, ≥64rem 32px) 위에 r0 + hair(V16). 콘텐츠 폭 plate. */
export function IntroPlate({ asset, alt, className }: { asset: IntroAssetKey; alt: string; className?: string }) {
  return (
    <div className={cn("bg-surface-sunken p-5 lg:p-8", className)}>
      <IntroFigure
        asset={asset}
        alt={alt}
        sizes="(min-width: 1296px) 1136px, (min-width: 1024px) calc(100vw - 160px), (min-width: 640px) calc(100vw - 88px), calc(100vw - 72px)"
      />
    </div>
  )
}

/** 01, 02 … 두 자리 폴리오 */
export function folio(n: number) {
  return String(n).padStart(2, "0")
}
