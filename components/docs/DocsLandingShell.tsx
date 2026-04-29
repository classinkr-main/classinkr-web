import type { ReactNode } from "react"

import { DocsArticleCard } from "./DocsArticleCard"
import { DocsCategoryCard } from "./DocsCategoryCard"
import type { DocsArticleSummary, DocsCategory } from "./types"
import { cn } from "./utils"

export interface DocsLandingShellProps {
    eyebrow?: string
    title: ReactNode
    description?: ReactNode
    categories?: DocsCategory[]
    featuredArticles?: DocsArticleSummary[]
    children?: ReactNode
    className?: string
}

export function DocsLandingShell({
    eyebrow = "ClassIn Guide",
    title,
    description,
    categories = [],
    featuredArticles = [],
    children,
    className,
}: DocsLandingShellProps) {
    return (
        <section className={cn("pb-16 pt-28 md:pb-24 md:pt-36", className)}>
            <div className="container">
                <div className="mx-auto max-w-3xl text-center">
                    <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#084734]">
                        {eyebrow}
                    </p>
                    <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-display text-[#111110] md:text-6xl">
                        {title}
                    </h1>
                    {description ? (
                        <p className="mx-auto mt-6 max-w-2xl text-lg font-medium leading-8 text-[#615D59] md:text-xl">
                            {description}
                        </p>
                    ) : null}
                </div>

                {categories.length > 0 ? (
                    <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {categories.map((category) => (
                            <DocsCategoryCard key={category.href} {...category} />
                        ))}
                    </div>
                ) : null}

                {featuredArticles.length > 0 ? (
                    <div className="mt-16 border-t border-black/[0.08] pt-8">
                        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                            <div>
                                <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#084734]">
                                    추천 문서
                                </p>
                                <h2 className="mt-2 text-2xl font-black tracking-subhead text-[#111110] md:text-3xl">
                                    바로 시작하기 좋은 글
                                </h2>
                            </div>
                        </div>
                        <div className="grid gap-0 lg:grid-cols-2 lg:gap-x-10">
                            {featuredArticles.map((article) => (
                                <DocsArticleCard key={article.href} {...article} />
                            ))}
                        </div>
                    </div>
                ) : null}

                {children ? <div className="mt-16">{children}</div> : null}
            </div>
        </section>
    )
}
