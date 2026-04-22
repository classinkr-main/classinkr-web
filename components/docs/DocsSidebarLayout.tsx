import type { ReactNode } from "react"

import type { DocsNavGroup, DocsTocItem } from "./types"
import { cn } from "./utils"

export interface DocsSidebarProps {
    groups: DocsNavGroup[]
    title?: string
    className?: string
}

export function DocsSidebar({ groups, title = "문서", className }: DocsSidebarProps) {
    return (
        <aside className={cn("rounded-2xl border border-black/[0.08] bg-white p-4 shadow-card", className)}>
            <p className="px-2 text-xs font-bold uppercase tracking-[0.14em] text-[#084734]">
                {title}
            </p>
            <nav className="mt-4 space-y-5" aria-label="문서 사이드바">
                {groups.map((group) => (
                    <div key={group.title}>
                        <p className="px-2 text-sm font-bold text-[#111110]">{group.title}</p>
                        <div className="mt-2 space-y-1">
                            {group.links.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    className={cn(
                                        "block rounded-lg px-2.5 py-2 text-sm leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]",
                                        link.isActive
                                            ? "bg-[#ECFDF5] font-bold text-[#084734]"
                                            : "text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#111110]"
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
    title = "이 문서에서",
    className,
}: DocsTableOfContentsProps) {
    if (items.length === 0) {
        return null
    }

    return (
        <aside className={cn("rounded-2xl border border-black/[0.08] bg-white p-4 shadow-card", className)}>
            <p className="px-2 text-xs font-bold uppercase tracking-[0.14em] text-[#084734]">
                {title}
            </p>
            <nav className="mt-3 space-y-1" aria-label="문서 목차">
                {items.map((item) => (
                    <a
                        key={item.id}
                        href={`#${item.id}`}
                        className="block rounded-lg px-2.5 py-2 text-sm leading-5 text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
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
        <section className={cn("bg-[#FAFAF8] pb-10 pt-28 md:pb-16 md:pt-32", className)}>
            <div className={cn("container grid gap-8", gridClassName)}>
                {sidebar ? (
                    <div className="lg:sticky lg:top-24 lg:self-start">
                        {sidebar}
                    </div>
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
