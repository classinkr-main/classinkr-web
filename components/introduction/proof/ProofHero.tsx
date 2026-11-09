import { ArrowRight } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { PROOF_CONTAINER, ProofFigure } from "./ProofParts"
import { ProofPdfLink } from "./ProofPdfLink"
import { PROOF_HERO, PROOF_SOURCE } from "./proof-copy"

interface MosaicTile {
  /** 그리드 칸 배치 */
  place: string
  /** 휴대폰 비율(64rem 이상은 행 높이가 정한다) */
  frame: string
  sizes: string
  /** object-position */
  crop?: string
}

// 휴대폰 2열의 반 칸 / 전폭 칸
const HALF = "50vw"
const FULL = "calc(100vw - 32px)"

// 모자이크 칸 배치(번호 순). 휴대폰은 2열(01·08 전폭), 64rem 이상은 6/12칸 안의 12칸 × 4행 고정 높이.
// 64rem 이상 sizes 는 칸 높이로 꽉 채울 때의 그림 폭이다(object-cover — 세로로 긴 04 는 높이가 폭을 정한다).
const TILES: MosaicTile[] = [
  { place: "col-span-2 lg:col-start-1 lg:col-span-8 lg:row-start-1 lg:row-span-2", frame: "aspect-video", sizes: `(min-width: 1024px) 400px, ${FULL}` },
  { place: "lg:col-start-9 lg:col-span-4 lg:row-start-1", frame: "aspect-[4/3]", sizes: `(min-width: 1024px) 280px, ${HALF}` },
  { place: "lg:col-start-9 lg:col-span-4 lg:row-start-2", frame: "aspect-[4/3]", sizes: `(min-width: 1024px) 280px, ${HALF}` },
  { place: "lg:col-start-1 lg:col-span-4 lg:row-start-3 lg:row-span-2", frame: "aspect-[4/3]", sizes: `(min-width: 1024px) 420px, ${HALF}`, crop: "object-[60%_50%]" },
  { place: "lg:col-start-5 lg:col-span-5 lg:row-start-3", frame: "aspect-[4/3]", sizes: `(min-width: 1024px) 280px, ${HALF}` },
  { place: "lg:col-start-10 lg:col-span-3 lg:row-start-3", frame: "aspect-[4/3]", sizes: `(min-width: 1024px) 280px, ${HALF}` },
  { place: "lg:col-start-5 lg:col-span-4 lg:row-start-4", frame: "aspect-[4/3]", sizes: `(min-width: 1024px) 280px, ${HALF}` },
  { place: "col-span-2 lg:col-start-9 lg:col-span-4 lg:row-start-4", frame: "aspect-video", sizes: `(min-width: 1024px) 280px, ${FULL}` },
]

function tileNumber(index: number) {
  return String(index + 1).padStart(2, "0")
}

/**
 * 표지 — 왼쪽(1–6칸) Kicker · H1 · 덱 · CTA 둘 · 소개서 PDF · 사진 속 교실 목록, 오른쪽(7–12칸) 현장 사진 모자이크 8장.
 * 64rem 미만은 1열(텍스트 → 모자이크 → 목록). LCP 는 H1 이고(사진 priority 없음) 진입 애니메이션은 없다.
 * 사진 번호 표지는 장식이라 숨기고, 같은 번호의 목록이 사진 이름을 글로 준다(사진마다 alt 도 있다).
 */
export function ProofHero() {
  const { kicker, titleLines, lead, primary, secondary, download, legendTitle, mosaic } = PROOF_HERO
  return (
    <section aria-labelledby="proof-title" className="bg-surface-paper pt-(--header-h)">
      <div className={cn(PROOF_CONTAINER, "pb-16 pt-12 md:pb-24 md:pt-20")}>
        <div className="lg:grid lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-6">
          <div className="lg:col-span-6 lg:col-start-1 lg:row-start-1 lg:pr-4">
            <p className="text-label text-fg-ink">{kicker}</p>
            <h1 id="proof-title" className="mt-4 text-h1 text-fg-ink">
              {titleLines.map((line, index) => (
                <span key={line} className="block">
                  {line}
                  {index < titleLines.length - 1 ? " " : null}
                </span>
              ))}
            </h1>
            <p className="mt-6 max-w-deck text-body-l text-fg-body">{lead}</p>

            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <TrackedLink
                href={primary.href}
                ctaId={primary.ctaId}
                tracking={{ source: PROOF_SOURCE }}
                className={cn(buttonVariants({ size: "cta" }), "shadow-none")}
              >
                {primary.label}
                <ArrowRight aria-hidden="true" className="arrow-nudge" />
              </TrackedLink>
              <TrackedLink
                href={secondary.href}
                ctaId={secondary.ctaId}
                tracking={{ source: PROOF_SOURCE }}
                className={buttonVariants({ variant: "line", size: "cta" })}
              >
                {secondary.label}
              </TrackedLink>
            </div>
            <ProofPdfLink download={download} source={PROOF_SOURCE} className="mt-3" />
          </div>

          <div className="mt-12 grid grid-cols-2 gap-2 lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1 lg:mt-1 lg:grid-cols-12 lg:grid-rows-[9.5rem_9.5rem_11.5rem_11.5rem] lg:self-start">
            {mosaic.map((tile, index) => {
              const layout = TILES[index % TILES.length]
              return (
                <ProofFigure
                  key={tile.asset}
                  photo={tile}
                  sizes={layout.sizes}
                  className={layout.place}
                  frameClassName={cn(layout.frame, "lg:aspect-auto lg:h-full")}
                  imageClassName={layout.crop}
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 bg-surface-paper px-2 py-1 text-folio tabular-nums text-fg-ink"
                  >
                    {tileNumber(index)}
                  </span>
                </ProofFigure>
              )
            })}
          </div>

          <div className="mt-8 border-t border-line-hair pt-4 lg:col-span-6 lg:col-start-1 lg:row-start-2 lg:mt-10 lg:pr-4">
            <p className="text-label text-fg-muted">{legendTitle}</p>
            <ol className="mt-3 grid gap-x-6 gap-y-1 text-note text-fg-body sm:grid-cols-2 lg:grid-cols-1">
              {mosaic.map((tile, index) => (
                <li key={tile.asset} className="grid grid-cols-[2rem_minmax(0,1fr)]">
                  <span aria-hidden="true" className="text-folio tabular-nums text-fg-ink">
                    {tileNumber(index)}
                  </span>
                  <span>
                    <span className="font-medium text-fg-ink">{tile.place}</span> <span aria-hidden="true">·</span>{" "}
                    {tile.note}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}
