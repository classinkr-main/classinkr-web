import Image from "next/image"
import { Expand } from "lucide-react"

import type { DocMedia } from "@/lib/docs"

import { cn } from "./utils"

/**
 * 문서 섹션의 사진·영상 묶음.
 *
 * 사진은 크기에 따라 네 가지로 나눠 배치한다.
 * - phone: 세로로 긴 휴대폰 화면. 적당한 폭으로 줄이고, 이어 나오면 나란히 놓는다.
 * - compact: 폭이 좁은 대화상자·작은 화면, 조금 세로로 긴 화면. 원래 크기보다 키우지 않고
 *   높이가 너무 길지 않게 폭을 줄이며, 이어 나오면 두 칸으로 놓는다.
 * - long: 폭이 넓고 아래로 아주 긴 전체 페이지 화면. 위쪽만 보여 주고 눌러서 전체를 본다.
 * - wide: 그 밖의 가로 화면. 본문 폭에 맞춘다.
 *
 * 사진은 `a[data-docs-zoom]` 으로 감싼다. JS 가 없으면 원본 파일을 열고,
 * 있으면 DocsMediaLightbox 가 가로채 크게 보기 창을 띄운다.
 */

export type DocsMediaKind = "phone" | "compact" | "long" | "wide" | "video"
type MediaKind = DocsMediaKind

/** 휴대폰 화면은 이 높이 안에 들어오는 폭으로 줄인다(px). */
const PHONE_MAX_HEIGHT = 560
/** 그 밖의 세로 사진은 이 높이 안에 들어오는 폭으로 줄인다(px). */
const PORTRAIT_MAX_HEIGHT = 720
/** 이 비율(높이/폭) 이상이고 폭이 좁으면 휴대폰 세로 화면으로 본다. */
const PHONE_RATIO = 1.5
/** 이 비율 이상이면 세로 사진으로 본다. */
const PORTRAIT_RATIO = 1.15
/** 이 비율 이상이고 폭이 넓으면 전체 페이지 화면(긴 화면)으로 본다. */
const LONG_RATIO = 1.6
const WIDE_MIN_WIDTH = 900
/** 이 폭보다 좁은 가로 사진은 원래 크기 이상으로 키우지 않는다. */
const COMPACT_MAX_WIDTH = 720

const FALLBACK_WIDTH = 1440
const FALLBACK_HEIGHT = 900

export function getDocsMediaKind(item: DocMedia): MediaKind {
  if (item.type === "video") return "video"
  const { width, height } = item
  if (!width || !height) return "wide"

  const ratio = height / width
  if (ratio >= LONG_RATIO && width >= WIDE_MIN_WIDTH) return "long"
  if (ratio >= PHONE_RATIO && width < WIDE_MIN_WIDTH) return "phone"
  if (ratio >= PORTRAIT_RATIO || width < COMPACT_MAX_WIDTH) return "compact"
  return "wide"
}

/** 화면에 그릴 최대 폭(px). 세로 사진은 높이 상한에 맞춰 줄이고, 작은 사진은 키우지 않는다. */
function getDisplayWidth(item: DocMedia) {
  const { width, height } = item
  if (!width || !height) return undefined
  const ratio = height / width
  if (ratio <= 1) return width
  const maxHeight = getDocsMediaKind(item) === "phone" ? PHONE_MAX_HEIGHT : PORTRAIT_MAX_HEIGHT
  return Math.round(Math.min(width, maxHeight / ratio))
}

interface MediaGroup {
  kind: MediaKind
  items: DocMedia[]
}

/** 이어 나오는 휴대폰 화면·작은 화면은 한 줄로 묶고, 나머지는 한 장씩 둔다. */
function groupMedia(media: DocMedia[]): MediaGroup[] {
  const groups: MediaGroup[] = []

  for (const item of media) {
    const kind = getDocsMediaKind(item)
    const last = groups[groups.length - 1]

    if ((kind === "phone" || kind === "compact") && last?.kind === kind) {
      last.items.push(item)
    } else {
      groups.push({ kind, items: [item] })
    }
  }

  return groups
}

const FIGURE_CLASS =
  "min-w-0 overflow-hidden rounded-lg border border-black/[0.08] bg-white ring-offset-2 ring-offset-[#FAFAF8] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-[#084734]"

function Caption({ text, dense }: { text?: string; dense?: boolean }) {
  if (!text) return null

  return (
    <figcaption
      className={cn(
        "border-t border-black/[0.08] break-keep text-[#615D59] [overflow-wrap:anywhere]",
        dense ? "px-3 py-2.5 text-[13px] leading-5" : "px-4 py-3 text-sm leading-6"
      )}
    >
      {text}
    </figcaption>
  )
}

function ZoomImage({
  item,
  sizes,
  eager,
  kind,
}: {
  item: DocMedia
  sizes: string
  eager?: boolean
  kind: MediaKind
}) {
  const width = item.width ?? FALLBACK_WIDTH
  const height = item.height ?? FALLBACK_HEIGHT
  const isLong = kind === "long"

  return (
    <a
      href={item.src}
      data-docs-zoom=""
      data-zoom-alt={item.alt}
      data-zoom-caption={item.caption ?? ""}
      data-zoom-width={item.width}
      data-zoom-height={item.height}
      className={cn(
        "group/zoom relative block cursor-zoom-in focus-visible:outline-none",
        isLong && "max-h-[420px] overflow-hidden sm:max-h-[600px] print:max-h-none"
      )}
    >
      <Image
        src={item.src}
        alt={item.alt}
        width={width}
        height={height}
        sizes={sizes}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
        unoptimized={item.src.startsWith("/")}
        className="block h-auto w-full"
      />
      {isLong ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex h-28 items-end justify-center bg-gradient-to-t from-white via-white/85 to-white/0 pb-4 print:hidden"
        >
          <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-black/[0.16] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#31302E]">
            <Expand className="h-3.5 w-3.5" />
            전체 화면 보기
          </span>
        </span>
      ) : (
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-black/[0.08] bg-white/90 text-[#31302E] opacity-0 transition-opacity duration-150 group-hover/zoom:opacity-100 group-focus-visible/zoom:opacity-100 pointer-coarse:opacity-100 print:hidden"
        >
          <Expand className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="sr-only">{isLong ? " — 전체 화면 보기" : " — 크게 보기"}</span>
    </a>
  )
}

function MediaFigure({
  item,
  kind,
  sizes,
  eager,
  dense,
  constrain,
}: {
  item: DocMedia
  kind: MediaKind
  sizes: string
  eager?: boolean
  dense?: boolean
  /** 원래 크기·세로 높이 상한에 맞춰 폭을 줄인다. */
  constrain?: boolean
}) {
  const displayWidth = constrain ? getDisplayWidth(item) : undefined

  if (item.type === "video") {
    return (
      <figure className={FIGURE_CLASS}>
        <video
          controls
          playsInline
          preload="metadata"
          src={item.src}
          aria-label={item.alt}
          className="block w-full bg-black"
        >
          {item.alt}
        </video>
        <Caption text={item.caption} />
      </figure>
    )
  }

  return (
    <figure
      className={cn(FIGURE_CLASS, "w-full")}
      // 테두리 2px 를 더해 사진이 원래 폭보다 커지지 않게 한다.
      style={displayWidth ? { maxWidth: displayWidth + 2 } : undefined}
    >
      <ZoomImage item={item} sizes={sizes} eager={eager} kind={kind} />
      <Caption text={item.caption} dense={dense} />
    </figure>
  )
}

const WIDE_SIZES = "(min-width: 1536px) 860px, (min-width: 1024px) 700px, calc(100vw - 32px)"
const PHONE_SIZES = "(min-width: 640px) 300px, 50vw"
const COMPACT_SIZES = "(min-width: 640px) 420px, calc(100vw - 32px)"

export function DocsSectionMedia({
  media,
  eager = false,
}: {
  media: DocMedia[]
  /** 첫 화면에 걸릴 수 있는 첫 사진만 바로 받는다. 나머지는 스크롤할 때 받는다. */
  eager?: boolean
}) {
  const groups = groupMedia(media)
  const eagerSrc = eager ? media[0]?.src : undefined

  return (
    <div className="space-y-5">
      {groups.map((group, groupIndex) => {
        if (group.kind === "phone" && group.items.length > 1) {
          const columns = group.items.length === 2 || group.items.length === 4 ? 2 : 3
          const widest = Math.max(...group.items.map((item) => getDisplayWidth(item) ?? 300))

          return (
            <div
              key={groupIndex}
              className={cn(
                "grid grid-cols-2 items-start gap-3 sm:gap-4",
                columns === 3 && "sm:grid-cols-3"
              )}
              style={{ maxWidth: widest * columns + 16 * (columns - 1) }}
            >
              {group.items.map((item, itemIndex) => (
                <MediaFigure
                  key={`${itemIndex}-${item.src}`}
                  item={item}
                  kind="phone"
                  sizes={PHONE_SIZES}
                  eager={item.src === eagerSrc}
                  dense
                  constrain
                />
              ))}
            </div>
          )
        }

        if (group.kind === "compact" && group.items.length > 1) {
          return (
            <div key={groupIndex} className="grid items-start gap-4 sm:grid-cols-2">
              {group.items.map((item, itemIndex) => (
                <MediaFigure
                  key={`${itemIndex}-${item.src}`}
                  item={item}
                  kind="compact"
                  sizes={COMPACT_SIZES}
                  eager={item.src === eagerSrc}
                  dense
                  constrain
                />
              ))}
            </div>
          )
        }

        const [item] = group.items
        const kind = group.kind

        return (
          <MediaFigure
            key={`${groupIndex}-${item.src}`}
            item={item}
            kind={kind}
            sizes={kind === "phone" ? PHONE_SIZES : kind === "compact" ? COMPACT_SIZES : WIDE_SIZES}
            eager={item.src === eagerSrc}
            constrain={kind === "phone" || kind === "compact"}
          />
        )
      })}
    </div>
  )
}
