import type { ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { SearchHighlight } from "@/components/ui/SearchHighlight"
import { DOC_LIST_KIND_LABELS } from "@/lib/docs-list-meta"

import type { DocsArticleSummary } from "./types"
import { cn } from "./utils"

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"

export type DocsListRowMeta = "kind" | "category" | "readTime" | "images" | "updatedAt"

const DEFAULT_META: readonly DocsListRowMeta[] = ["kind", "category", "readTime", "images"]

/**
 * 사용법은 목록 대부분이라 라벨을 달지 않는다. 문제 해결·FAQ·업데이트처럼
 * 성격이 다른 문서만 조용히 표시해 훑을 때 눈에 걸리게 한다.
 */
export function DocsKindLabel({ kind }: { kind?: DocsArticleSummary["kind"] }) {
  if (!kind || kind === "howto") return null
  return <span className="font-semibold text-[#084734]">{DOC_LIST_KIND_LABELS[kind]}</span>
}

function buildMeta(article: DocsArticleSummary, meta: readonly DocsListRowMeta[]) {
  const parts: Array<{ key: string; node: ReactNode }> = []

  for (const item of meta) {
    if (item === "kind" && article.kind && article.kind !== "howto") {
      parts.push({ key: item, node: <DocsKindLabel kind={article.kind} /> })
    } else if (item === "category" && article.category) {
      parts.push({ key: item, node: article.category })
    } else if (item === "readTime" && article.readTime) {
      parts.push({ key: item, node: article.readTime })
    } else if (item === "images" && article.imageCount) {
      parts.push({ key: item, node: `사진 ${article.imageCount}장` })
    } else if (item === "updatedAt" && article.updatedAt) {
      parts.push({ key: item, node: article.updatedAt })
    }
  }

  return parts
}

function MetaLine({
  parts,
  className,
}: {
  parts: Array<{ key: string; node: ReactNode }>
  className?: string
}) {
  if (parts.length === 0) return null

  return (
    <span
      className={cn(
        "flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-[#615D59]",
        className
      )}
    >
      {parts.map((part, partIndex) => (
        <span key={part.key} className="inline-flex items-center gap-x-1.5">
          {partIndex > 0 ? <span aria-hidden>·</span> : null}
          {part.node}
        </span>
      ))}
    </span>
  )
}

/** 목록 오른쪽 미리보기. 세로 화면(휴대폰)은 잘리지 않게 통째로, 가로 화면은 윗부분을 채워 보여 준다. */
export function DocsListThumbnail({
  thumbnail,
  className,
}: {
  thumbnail: NonNullable<DocsArticleSummary["thumbnail"]>
  className?: string
}) {
  const isPortrait = Boolean(
    thumbnail.width && thumbnail.height && thumbnail.height > thumbnail.width
  )
  const fit = thumbnail.isDiagram
    ? "object-contain p-1.5"
    : isPortrait
      ? "object-contain"
      : "object-cover object-top"

  return (
    <span
      aria-hidden
      className={cn(
        "relative block aspect-[16/10] shrink-0 overflow-hidden rounded-lg border border-black/[0.08] transition-colors duration-150 group-hover:border-black/[0.16]",
        isPortrait ? "bg-[#F6F5F4]" : "bg-white",
        className
      )}
    >
      <Image
        src={thumbnail.src}
        alt=""
        fill
        sizes="128px"
        loading="lazy"
        unoptimized={thumbnail.isDiagram}
        className={fit}
      />
    </span>
  )
}

export interface DocsListRowProps {
  article: DocsArticleSummary
  /** 검색어 강조. */
  query?: string
  /** "01" 같은 순서 번호. */
  index?: string
  /** 메타 줄에 넣을 항목과 순서. */
  meta?: readonly DocsListRowMeta[]
  /** 데스크톱에서 오른쪽 사진 미리보기를 보인다(모바일은 숨김). */
  showThumbnail?: boolean
  /** 미리보기를 보이기 시작하는 너비. 두 단 목록은 단이 좁아 lg 부터 보인다. */
  thumbnailFrom?: "sm" | "lg"
  className?: string
}

/**
 * 가이드 목록의 한 줄 — 제목, 두 줄 설명, 유형·읽는 시간·사진 수, 첫 화면 미리보기.
 * 카드 없이 아래 규칙선으로만 나눈다(가이드 홈·주제 페이지 공용).
 */
export function DocsListRow({
  article,
  query,
  index,
  meta = DEFAULT_META,
  showThumbnail = true,
  thumbnailFrom = "sm",
  className,
}: DocsListRowProps) {
  const metaParts = buildMeta(article, meta)
  const thumbnail = showThumbnail ? article.thumbnail : undefined

  return (
    <li className={className}>
      <Link
        href={article.href}
        className={cn(
          "group flex items-start gap-4 border-b border-black/[0.06] py-6 transition-colors duration-150 hover:border-black/[0.16]",
          FOCUS_RING
        )}
      >
        {index ? (
          <span className="w-6 shrink-0 pt-0.5 text-[13px] font-semibold tabular-nums text-[#615D59]">
            {index}
          </span>
        ) : null}
        <span className="block min-w-0 flex-1">
          <span className="block break-keep text-[16px] font-semibold leading-snug text-[#111110] transition-colors duration-150 group-hover:text-[#084734]">
            <SearchHighlight text={article.title} query={query} />
          </span>
          <span className="mt-1.5 line-clamp-2 block break-words text-[15px] leading-[26px] text-[#4F4C49]">
            <SearchHighlight text={article.description} query={query} />
          </span>
          <MetaLine parts={metaParts} className="mt-2.5" />
        </span>
        {thumbnail ? (
          <DocsListThumbnail
            thumbnail={thumbnail}
            className={cn(
              "mt-0.5 hidden w-[128px]",
              thumbnailFrom === "lg" ? "lg:block" : "sm:block"
            )}
          />
        ) : null}
        <ArrowRight
          aria-hidden
          className="mt-1 h-4 w-4 shrink-0 text-[#A39E98] transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-[#084734]"
        />
      </Link>
    </li>
  )
}

function formatMonthDay(iso?: string) {
  const match = iso?.match(/^\d{4}-(\d{2})-(\d{2})/)
  if (!match) return ""
  return `${Number(match[1])}월 ${Number(match[2])}일`
}

/** 날짜·제목 한 줄짜리 행 — "최근 업데이트된 가이드"처럼 설명 없이 훑는 목록. */
export function DocsCompactRow({ article }: { article: DocsArticleSummary }) {
  const date = formatMonthDay(article.updatedAtIso)

  return (
    <li>
      <Link
        href={article.href}
        className={cn(
          "group flex items-baseline gap-4 border-b border-black/[0.06] py-4 transition-colors duration-150 hover:border-black/[0.16]",
          FOCUS_RING
        )}
      >
        <span className="w-[52px] shrink-0 text-[13px] tabular-nums text-[#615D59]">{date}</span>
        <span className="block min-w-0 flex-1">
          <span className="block break-keep text-[15px] font-semibold leading-snug text-[#111110] transition-colors duration-150 group-hover:text-[#084734]">
            {article.title}
          </span>
          <MetaLine
            parts={buildMeta(article, ["kind", "category", "images"])}
            className="mt-1"
          />
        </span>
        <ArrowRight
          aria-hidden
          className="h-4 w-4 shrink-0 self-center text-[#A39E98] transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-[#084734]"
        />
      </Link>
    </li>
  )
}
