import Link from "next/link"
import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"

import { DocsNavDrawer } from "./DocsNavDrawer"
import { DocsStickyColumn } from "./DocsStickyColumn"
import type { DocsNavGroup } from "./types"
import { cn } from "./utils"

export { DocsInlineToc, DocsTableOfContents } from "./DocsTableOfContents"
export type { DocsInlineTocProps, DocsTableOfContentsProps } from "./DocsTableOfContents"

export interface DocsSidebarProps {
    groups: DocsNavGroup[]
    title?: string
    className?: string
}

/**
 * 가이드 문서 목록. 분류마다 접히고, 지금 문서가 든 분류만 펼친 채로 시작한다.
 * 지금 문서가 목록에 없으면(미리보기 등) 모든 분류를 펼친다.
 */
export function DocsSidebar({ groups, title = "가이드", className }: DocsSidebarProps) {
    const visibleGroups = groups.filter((group) => group.links.length > 0)
    const hasActive = visibleGroups.some((group) => group.links.some((link) => link.isActive))

    return (
        <aside className={cn("relative z-10 bg-[#FAFAF8] pb-4", className)}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#084734]">
                {title}
            </p>
            {/* 기사 페이지에서도 검색으로 바로 진입할 수 있는 입구 */}
            <Link
                href="/docs#docs-search"
                className="mt-3 flex min-h-10 items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm text-[#615D59] transition-colors duration-150 hover:border-black/[0.16] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            >
                <svg className="h-4 w-4 shrink-0 text-[#084734]" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                문서 검색
            </Link>
            <nav className="mt-4" aria-label="가이드 문서 목록">
                <ul className="space-y-1">
                    {visibleGroups.map((group) => {
                        const isActiveGroup = group.links.some((link) => link.isActive)

                        return (
                            <li key={group.title}>
                                <details open={isActiveGroup || !hasActive} className="group/category">
                                    <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm font-bold text-[#111110] transition-colors duration-150 hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] [&::-webkit-details-marker]:hidden">
                                        <span className="min-w-0 break-keep">{group.title}</span>
                                        <span className="flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums text-[#615D59]">
                                            {group.links.length}
                                            <ChevronDown
                                                className="h-4 w-4 transition-transform duration-150 group-open/category:rotate-180"
                                                aria-hidden
                                            />
                                        </span>
                                    </summary>
                                    <ul className="mb-2 mt-0.5 space-y-0.5">
                                        {group.links.map((link) => (
                                            <li key={link.href}>
                                                <Link
                                                    href={link.href}
                                                    aria-current={link.isActive ? "page" : undefined}
                                                    className={cn(
                                                        "block origin-left break-keep rounded-lg py-2 pl-4 pr-3 text-sm leading-6 transition-colors duration-150 [overflow-wrap:anywhere] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]",
                                                        link.isActive
                                                            ? "bg-[#F6F5F4] font-semibold text-[#111110]"
                                                            : "text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#111110]"
                                                    )}
                                                >
                                                    {link.title}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            </li>
                        )
                    })}
                </ul>
            </nav>
        </aside>
    )
}

export interface DocsSidebarLayoutProps {
    sidebar?: ReactNode
    toc?: ReactNode
    /** 본문 위 한 줄(예: 분류로 돌아가기). 좁은 화면에서는 같은 줄 오른쪽에 문서 목록 버튼이 붙는다. */
    topBar?: ReactNode
    children: ReactNode
    className?: string
}

/**
 * 가이드 문서 3단 레이아웃.
 * - 1024px 이상: 왼쪽 문서 목록(고정·자체 스크롤) + 본문
 * - 1280px 이상: + 오른쪽 목차(고정)
 * - 1024px 미만: 문서 목록은 서랍으로 연다(본문 위에 쌓지 않는다).
 * 열 너비는 모두 minmax(0, …) 라서 어떤 폭에서도 가로로 넘치지 않는다.
 */
export function DocsSidebarLayout({
    sidebar,
    toc,
    topBar,
    children,
    className,
}: DocsSidebarLayoutProps) {
    const gridClassName = sidebar
        ? toc
            ? "lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_208px] 2xl:grid-cols-[264px_minmax(0,1fr)_224px]"
            : "lg:grid-cols-[232px_minmax(0,1fr)] 2xl:grid-cols-[264px_minmax(0,1fr)]"
        : toc
            ? "xl:grid-cols-[minmax(0,1fr)_208px]"
            : ""

    return (
        <section className={cn("pb-10 pt-28 md:pb-16 md:pt-32", className)}>
            <div
                className={cn(
                    "mx-auto grid w-full max-w-[1520px] gap-8 px-4 sm:px-6 lg:px-8 xl:gap-10 2xl:gap-12",
                    gridClassName
                )}
            >
                {sidebar ? (
                    <DocsStickyColumn className="hidden min-w-0 lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:px-1 lg:[scrollbar-width:thin] print:hidden">
                        {sidebar}
                    </DocsStickyColumn>
                ) : null}
                <div className="min-w-0">
                    {topBar || sidebar ? (
                        <div className="mb-6 flex min-h-11 items-center justify-between gap-3 print:hidden">
                            <div className="min-w-0">{topBar}</div>
                            {sidebar ? (
                                <div className="shrink-0 lg:hidden">
                                    <DocsNavDrawer>{sidebar}</DocsNavDrawer>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    {children}
                </div>
                {toc ? (
                    <div className="hidden min-w-0 xl:sticky xl:top-24 xl:block xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:px-1 xl:[scrollbar-width:thin] print:hidden">
                        {toc}
                    </div>
                ) : null}
            </div>
        </section>
    )
}
