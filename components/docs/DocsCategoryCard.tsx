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
                "group flex h-full flex-col border-b border-black/[0.08] py-5 text-left transition-colors hover:border-[#084734]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]",
                className
            )}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Icon aria-hidden className="h-5 w-5 text-[#084734]" />
                    {eyebrow ? (
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#084734]">
                            {eyebrow}
                        </p>
                    ) : null}
                </div>
                <ArrowRight
                    aria-hidden
                    className="mt-2 h-4 w-4 text-[#A39E98] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[#084734]"
                />
            </div>

            <div className="mt-4 flex-1">
                <h3 className="text-[22px] font-bold leading-snug tracking-card text-[#111110]">
                    {title}
                </h3>
                <p className="mt-3 text-[15px] leading-7 text-[#4F4C49]">
                    {description}
                </p>
            </div>

            {articles.length > 0 ? (
                <div className="mt-5 space-y-2 pt-0">
                    {articles.slice(0, 3).map((article) => (
                        <div key={article.href} className="flex items-start gap-2 text-sm text-[#31302E]">
                            <span className="mt-2 h-px w-3 shrink-0 bg-[#084734]" />
                            <span>{article.title}</span>
                        </div>
                    ))}
                </div>
            ) : null}
        </a>
    )
}
