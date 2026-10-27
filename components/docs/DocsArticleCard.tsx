import Link from "next/link"
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
        <Link
            href={href}
            className={cn(
                "group block border-b border-black/[0.08] py-5 last:border-b-0 transition-colors duration-(--motion-fast) ease-soft hover:border-line-strong active:border-line-strong active:duration-0",
                className
            )}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#615D59]">
                        {category ? <span>{category}</span> : null}
                        {readTime ? (
                            <span className="inline-flex items-center gap-1">
                                <Clock aria-hidden className="h-3.5 w-3.5" />
                                {readTime}
                            </span>
                        ) : null}
                        {updatedAt ? <span>업데이트 {updatedAt}</span> : null}
                    </div>
                    <h3 className="mt-2 break-words text-[16px] font-semibold leading-snug tracking-card text-[#111110]">
                        {title}
                    </h3>
                    <p className="mt-1.5 break-words text-[15px] leading-[26px] text-[#4F4C49]">
                        {description}
                    </p>
                </div>
                <ArrowRight
                    aria-hidden
                    className="arrow-nudge mt-1 h-4 w-4 shrink-0 text-[#A39E98]"
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
        </Link>
    )
}
