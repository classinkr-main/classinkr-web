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
                "group block rounded-xl border border-black/[0.08] bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-[#084734]/25 hover:shadow-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]",
                className
            )}
        >
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#084734]">
                {category ? (
                    <span className="rounded-full bg-[#ECFDF5] px-2.5 py-1">
                        {category}
                    </span>
                ) : null}
                {readTime ? (
                    <span className="inline-flex items-center gap-1 text-[#615D59]">
                        <Clock aria-hidden className="h-3.5 w-3.5" />
                        {readTime}
                    </span>
                ) : null}
                {updatedAt ? <span className="text-[#A39E98]">업데이트 {updatedAt}</span> : null}
            </div>

            <div className="mt-4 flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold leading-snug tracking-card text-[#111110] transition-colors group-hover:text-[#084734]">
                        {title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#615D59]">
                        {description}
                    </p>
                </div>
                <ArrowRight
                    aria-hidden
                    className="mt-1 h-4 w-4 shrink-0 text-[#A39E98] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[#084734]"
                />
            </div>

            {tags.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-[#F6F5F4] px-2.5 py-1 text-xs font-medium text-[#615D59]">
                            {tag}
                        </span>
                    ))}
                </div>
            ) : null}
        </a>
    )
}
