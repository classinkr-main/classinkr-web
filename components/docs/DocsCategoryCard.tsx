import { ArrowRight, BookOpen } from "lucide-react"

import type { DocsCategory } from "./types"
import { cn } from "./utils"

export interface DocsCategoryCardProps extends DocsCategory {
    className?: string
}

export function DocsCategoryCard({
    title,
    description,
    href,
    eyebrow,
    icon: Icon = BookOpen,
    articles = [],
    className,
}: DocsCategoryCardProps) {
    return (
        <a
            href={href}
            className={cn(
                "group flex h-full flex-col rounded-2xl border border-black/[0.08] bg-white p-6 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-[#084734]/25 hover:shadow-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]",
                className
            )}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#084734]">
                    <Icon aria-hidden className="h-5 w-5" />
                </div>
                <ArrowRight
                    aria-hidden
                    className="mt-2 h-4 w-4 text-[#A39E98] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[#084734]"
                />
            </div>

            <div className="mt-6 flex-1">
                {eyebrow ? (
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#084734]">
                        {eyebrow}
                    </p>
                ) : null}
                <h3 className="mt-2 text-[22px] font-bold leading-snug tracking-card text-[#111110]">
                    {title}
                </h3>
                <p className="mt-3 text-[15px] leading-7 text-[#615D59]">
                    {description}
                </p>
            </div>

            {articles.length > 0 ? (
                <div className="mt-6 space-y-2 border-t border-black/[0.08] pt-5">
                    {articles.slice(0, 3).map((article) => (
                        <div key={article.href} className="flex items-center gap-2 text-sm font-medium text-[#31302E]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#084734]" />
                            <span>{article.title}</span>
                        </div>
                    ))}
                </div>
            ) : null}
        </a>
    )
}
