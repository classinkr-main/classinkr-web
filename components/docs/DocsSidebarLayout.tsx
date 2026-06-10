import type { ReactNode } from "react"

import type { DocsNavGroup, DocsTocItem } from "./types"
import { cn } from "./utils"

export interface DocsSidebarProps {
    groups: DocsNavGroup[]
    title?: string
    className?: string
}

export function DocsSidebar({ groups, title = "가이드", className }: DocsSidebarProps) {
    return (
        <aside className={cn("border-b border-black/[0.08] pb-4", className)}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#084734]">
                {title}
            </p>
            <nav className="mt-4 space-y-5" aria-label="가이드 사이드바">
                {groups.map((group) => (
                    <div key={group.title}>
                        <p className="text-sm font-bold text-[#111110]">{group.title}</p>
                        <div className="mt-2 space-y-1">
                            {group.links.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    className={cn(
                                        "block origin-left break-words border-l border-transparent py-1.5 pl-3 text-sm leading-5 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]",
                                        link.isActive
                                            ? "border-[#084734] font-semibold text-[#084734]"
                                            : "text-[#615D59] hover:border-[#084734]/25 hover:text-[#111110]"
                                    )}
                                >
                                    {link.title}
                                </a>
                            ))}
                        </div>
                    </div>
                ))}
            </nav>
        </aside>
    )
}

export interface DocsTableOfContentsProps {
    items: DocsTocItem[]
    title?: string
    className?: string
}

export function DocsTableOfContents({
    items,
    title = "이 안내에서",
    className,
}: DocsTableOfContentsProps) {
    if (items.length === 0) {
        return null
    }

    return (
        <aside className={cn("border-b border-black/[0.08] pb-4", className)}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#084734]">
                {title}
            </p>
            <nav className="mt-3 space-y-1" aria-label="문서 목차">
                {items.map((item) => (
                    <a
                        key={item.id}
                        href={`#${item.id}`}
                        className="block origin-left break-words border-l border-transparent py-1.5 pl-3 text-sm leading-5 text-[#615D59] transition-all duration-150 hover:border-[#084734]/25 hover:text-[#111110] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                    >
                        {item.title}
                    </a>
                ))}
            </nav>
        </aside>
    )
}

export interface DocsSidebarLayoutProps {
    sidebar?: ReactNode
    toc?: ReactNode
    children: ReactNode
    className?: string
}

export function DocsSidebarLayout({
    sidebar,
    toc,
    children,
    className,
}: DocsSidebarLayoutProps) {
    const gridClassName = sidebar
        ? toc
            ? "lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_220px]"
            : "lg:grid-cols-[240px_minmax(0,1fr)]"
        : toc
            ? "xl:grid-cols-[minmax(0,1fr)_220px]"
            : ""

    return (
        <section className={cn("pb-10 pt-28 md:pb-16 md:pt-32", className)}>
            <div className={cn("container grid gap-8", gridClassName)}>
                {sidebar ? (
                    <>
                        {/* 모바일: 본문이 먼저 보이도록 기본 접힘 상태의 목차 (no-JS details) */}
                        <details className="group rounded-2xl border border-black/[0.08] bg-white px-4 py-3 lg:hidden">
                            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-[#111110] [&::-webkit-details-marker]:hidden">
                                가이드 목차 보기
                                <svg
                                    className="h-4 w-4 text-[#084734] transition-transform duration-200 group-open:rotate-180"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    aria-hidden="true"
                                >
                                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </summary>
                            <div className="pt-4">{sidebar}</div>
                        </details>
                        <div className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
                            {sidebar}
                        </div>
                    </>
                ) : null}
                <main className="min-w-0">{children}</main>
                {toc ? (
                    <div className="hidden xl:block xl:sticky xl:top-24 xl:self-start">
                        {toc}
                    </div>
                ) : null}
            </div>
        </section>
    )
}
