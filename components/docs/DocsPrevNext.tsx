import Link from "next/link"
import { ArrowLeft, ArrowRight } from "lucide-react"

import type { DocsLink, DocsNavGroup } from "./types"
import { cn } from "./utils"

export interface DocsPrevNextLinks {
  prev: DocsLink | null
  next: DocsLink | null
  /** 같은 묶음 안에서 지금 문서의 순서(1부터). */
  position: number
  total: number
  groupTitle: string
}

/**
 * 사이드바와 같은 순서(getDocsNavGroups)로 지금 문서의 앞뒤 문서를 찾는다.
 * 공개 목록에 없는 문서(isActive 링크가 없는 경우)는 앞뒤를 만들지 않는다.
 */
export function findPrevNextDocs(groups: DocsNavGroup[]): DocsPrevNextLinks | null {
  for (const group of groups) {
    const index = group.links.findIndex((link) => link.isActive)
    if (index < 0) continue

    return {
      prev: index > 0 ? group.links[index - 1] : null,
      next: index < group.links.length - 1 ? group.links[index + 1] : null,
      position: index + 1,
      total: group.links.length,
      groupTitle: group.title,
    }
  }

  return null
}

const ROW_CLASS =
  "group flex min-w-0 flex-col gap-1.5 py-5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"

/** 본문 끝의 이전·다음 문서 — 카드 대신 괘선 두 칸으로 둔다. */
export function DocsPrevNext({ links, className }: { links: DocsPrevNextLinks | null; className?: string }) {
  if (!links || (!links.prev && !links.next)) return null
  const { prev, next, position, total, groupTitle } = links

  return (
    <nav aria-label="이전·다음 문서" className={cn("print:hidden", className)}>
      <p className="text-xs font-semibold text-[#615D59]">
        {groupTitle} <span className="tabular-nums">{total}편 중 {position}번째</span>
      </p>
      <div className="mt-3 grid border-y border-black/[0.08] sm:grid-cols-2">
        {prev ? (
          <Link href={prev.href} rel="prev" className={cn(ROW_CLASS, "sm:pr-6")}>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#615D59]">
              <ArrowLeft
                className="h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-x-0.5"
                aria-hidden
              />
              이전 문서
            </span>
            <span className="break-keep text-base font-bold leading-6 text-[#111110] transition-colors duration-150 [overflow-wrap:anywhere] group-hover:text-[#084734]">
              {prev.title}
            </span>
          </Link>
        ) : (
          <span aria-hidden className="hidden sm:block" />
        )}
        {next ? (
          <Link
            href={next.href}
            rel="next"
            className={cn(
              ROW_CLASS,
              "sm:items-end sm:border-l sm:border-black/[0.08] sm:pl-6 sm:text-right",
              prev && "border-t border-black/[0.08] sm:border-t-0"
            )}
          >
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#615D59]">
              다음 문서
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
            <span className="break-keep text-base font-bold leading-6 text-[#111110] transition-colors duration-150 [overflow-wrap:anywhere] group-hover:text-[#084734]">
              {next.title}
            </span>
          </Link>
        ) : null}
      </div>
    </nav>
  )
}
