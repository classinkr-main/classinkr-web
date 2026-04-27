import { ArrowRight, Clock } from "lucide-react"

import type { DocsArticleSummary } from "./types"
import { cn } from "./utils"

export interface DocsArticleCardProps extends DocsArticleSummary {
    className?: string
}

export function DocsArticleCard({
    title,
    description,
    href,
    category,
    readTime,
    updatedAt,
    tags = [],
    className,
}: DocsArticleCardProps) {
    return (
        <a
            href={href}
            className={cn(
                "group block origin-center border-b border-black/[0.08] py-5 transition-all duration-150 hover:border-[#084734]/25 active:scale-[0.98] active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]",
                className
            )}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#615D59]">
                        {category ? <span>{category}</span> : null}
                        {readTime ? (
                            <span className="inline-flex items-center gap-1">
                                <Clock aria-hidden className="h-3.5 w-3.5" />
                                {readTime}
                            </span>
                        ) : null}
                        {updatedAt ? <span>업데이트 {updatedAt}</span> : null}
                    </div>
                    <h3 className="mt-2 break-words text-lg font-semibold leading-snug tracking-card text-[#111110] transition-colors group-hover:text-[#084734]">
                        {title}
                    </h3>
                    <p className="mt-2 break-words text-sm leading-6 text-[#4F4C49]">
                        {description}
                    </p>
                </div>
                <ArrowRight
                    aria-hidden
                    className="mt-1 h-4 w-4 shrink-0 text-[#A39E98] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[#084734]"
                />
            </div>

            {tags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                        <span key={tag} className="break-words text-xs text-[#615D59]">
                            {tag}
                        </span>
                    ))}
                </div>
            ) : null}
        </a>
    )
}
