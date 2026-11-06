import { ChevronDown } from "lucide-react"

import type { IntroBlock, IntroListItem } from "@/lib/introduction/content"
import { cn } from "@/lib/utils"

import { Emphasis } from "./Emphasis"
import { IntroDownloadLink } from "./IntroDownloadLink"
import { IntroFigure } from "./IntroFigure"
import { IntroTable } from "./IntroTable"
import { IntroVideoPlayer } from "./IntroVideoPlayer"

interface IntroBlocksProps {
  blocks: IntroBlock[]
  /** 영상 계측 source 값 */
  videoSource?: string
  className?: string
  /** 토글 안쪽 깊이(제목 크기 조절용). 바깥에서 부를 때는 두지 않는다. */
  depth?: number
}

/**
 * Notion 원문을 옮긴 블록 목록을 그린다. 서버 컴포넌트다 —
 * 토글은 <details> 라 JS 없이 열리고, 영상·다운로드만 클라이언트 섬이다.
 */
export function IntroBlocks({ blocks, videoSource, className, depth = 0 }: IntroBlocksProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {blocks.map((block, index) => (
        <IntroBlockView key={index} block={block} videoSource={videoSource} depth={depth} />
      ))}
    </div>
  )
}

function IntroBlockView({ block, videoSource, depth }: { block: IntroBlock; videoSource?: string; depth: number }) {
  switch (block.type) {
    case "heading": {
      if (block.level === 2) {
        return <h3 className="pt-4 text-h3 text-fg-ink first:pt-0">{block.text}</h3>
      }
      return <h4 className="pt-2 text-body-l font-semibold text-fg-ink first:pt-0">{block.text}</h4>
    }
    case "paragraph":
      return (
        <p className="max-w-measure text-body text-fg-body">
          <Emphasis text={block.text} />
        </p>
      )
    case "list":
      return <IntroList items={block.items} />
    case "quote":
      return (
        <blockquote className="max-w-measure border-l-2 border-line-ink pl-5 text-body-l text-fg-ink">
          <Emphasis text={block.text} />
        </blockquote>
      )
    case "callout":
      return (
        <div className="border border-line-hair bg-surface-sheet px-5 py-5 sm:px-6">
          <IntroBlocks blocks={block.blocks} videoSource={videoSource} depth={depth} className="space-y-4" />
        </div>
      )
    case "table":
      return <IntroTable table={block.table} />
    case "toggle":
      return <IntroToggle title={block.title} blocks={block.blocks} videoSource={videoSource} depth={depth} />
    case "image":
      return <IntroFigure asset={block.asset} alt={block.alt} caption={block.caption} />
    case "imageRow":
      return (
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
          {block.images.map((image) => (
            <IntroFigure
              key={image.asset}
              asset={image.asset}
              alt={image.alt}
              caption={image.caption}
              sizes="(min-width: 1296px) 588px, (min-width: 640px) 50vw, 100vw"
            />
          ))}
        </div>
      )
    case "video":
      return <IntroVideoPlayer video={block.video} source={videoSource} />
    case "videoRow":
      return (
        <div className="grid gap-6 sm:grid-cols-2">
          {block.videos.map((video, index) => (
            <IntroVideoPlayer key={index} video={video} source={videoSource} />
          ))}
        </div>
      )
    case "download":
      return <IntroDownloadLink download={block.download} className="max-w-xl" />
  }
}

export function IntroList({ items, nested = false }: { items: IntroListItem[]; nested?: boolean }) {
  return (
    <ul
      className={cn(
        "max-w-measure space-y-2 text-body text-fg-body",
        nested ? "mt-2 space-y-1 text-caption text-fg-muted" : null
      )}
    >
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span aria-hidden="true" className={cn("shrink-0 select-none text-fg-faint", nested ? "w-3" : "w-3 pt-px")}>
            {nested ? "→" : "•"}
          </span>
          <div className="min-w-0">
            <Emphasis text={item.text} />
            {item.children?.length ? <IntroList items={item.children} nested /> : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function IntroToggle({
  title,
  blocks,
  videoSource,
  depth = 0,
  defaultOpen,
}: {
  title: string
  blocks: IntroBlock[]
  videoSource?: string
  depth?: number
  defaultOpen?: boolean
}) {
  const nested = depth > 0
  return (
    <details
      className={cn("group border-t border-line-hair last:border-b", nested && "border-b")}
      open={defaultOpen}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-fg-ink [&::-webkit-details-marker]:hidden",
          nested ? "text-body-l font-semibold" : "text-h3"
        )}
      >
        <span className="min-w-0">
          <Emphasis text={title} />
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 text-fg-muted transition-transform duration-300 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="pb-10 pt-2">
        <IntroBlocks blocks={blocks} videoSource={videoSource} depth={depth + 1} />
      </div>
    </details>
  )
}
