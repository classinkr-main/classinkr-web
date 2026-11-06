import Image from "next/image"

import { getIntroAsset, type IntroAssetKey } from "@/lib/introduction/assets"
import { cn } from "@/lib/utils"

import { Emphasis } from "./Emphasis"

interface IntroFigureProps {
  asset: IntroAssetKey
  alt: string
  caption?: string
  /** next/image sizes — 기본은 본문 폭(최대 1200px) */
  sizes?: string
  priority?: boolean
  className?: string
  imageClassName?: string
}

/** 소개서 사진·화면 한 장. 공개 화면 규칙대로 반경 0·그림자 0, 테두리는 hair 한 줄이다. */
export function IntroFigure({
  asset,
  alt,
  caption,
  sizes = "(min-width: 1296px) 1200px, (min-width: 768px) calc(100vw - 96px), calc(100vw - 32px)",
  priority,
  className,
  imageClassName,
}: IntroFigureProps) {
  const file = getIntroAsset(asset)
  return (
    <figure className={cn("min-w-0", className)}>
      <Image
        src={file.src}
        alt={alt}
        width={file.width}
        height={file.height}
        sizes={sizes}
        priority={priority}
        className={cn("h-auto w-full border border-line-hair bg-surface-sheet", imageClassName)}
      />
      {caption ? (
        <figcaption className="mt-3 text-caption text-fg-muted">
          <Emphasis text={caption} />
        </figcaption>
      ) : null}
    </figure>
  )
}
