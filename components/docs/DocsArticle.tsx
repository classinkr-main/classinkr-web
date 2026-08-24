import type { ReactNode } from "react"
import { ChevronRight, Info, TriangleAlert } from "lucide-react"

import type { DocsArticleSection, DocsChecklistItem } from "./types"
import { cn } from "./utils"

export interface DocsArticleProps {
    eyebrow?: string
    title: ReactNode
    description?: ReactNode
    meta?: ReactNode
    sections: DocsArticleSection[]
    footer?: ReactNode
    className?: string
}

function formatDashTitle(title: ReactNode) {
    if (typeof title !== "string" || !title.includes(" — ")) {
        return title
    }

    const [lead, ...rest] = title.split(" — ")

    return (
        <>
            {lead} <span className="inline-block">— {rest.join(" — ")}</span>
        </>
    )
}

// step 문자열이 정확히 이 프리픽스로 시작하면 경로 스텝 — 브레드크럼 칩으로 그린다 (경로 표기 규약).
const PATH_STEP_PREFIX = "경로: "

function PathStepChips({ path }: { path: string }) {
    const segments = path.split(" > ").map((segment) => segment.trim()).filter(Boolean)

    return (
        <span className="flex flex-wrap items-center gap-y-1.5">
            {segments.map((segment, index) => {
                const isButton = segment.startsWith("[") && segment.endsWith("]")
                const label = isButton ? segment.slice(1, -1) : segment

                return (
                    <span key={index} className="flex items-center">
                        {index > 0 ? (
                            <ChevronRight aria-hidden className="mx-1 h-3 w-3 shrink-0 text-[#A39E98]" />
                        ) : null}
                        <span
                            className={cn(
                                "inline-flex items-center rounded-[6px] border border-black/[0.08] bg-white px-2 py-0.5 text-[13px]",
                                isButton ? "font-semibold text-[#084734]" : "font-medium text-[#31302E]"
                            )}
                        >
                            {label}
                        </span>
                    </span>
                )
            })}
        </span>
    )
}

function StepList({ items }: { items: DocsChecklistItem[] }) {
    return (
        <ol className="mt-5 divide-y divide-black/[0.06]">
            {items.map((item, index) => {
                const pathValue =
                    typeof item.label === "string" && item.label.startsWith(PATH_STEP_PREFIX)
                        ? item.label.slice(PATH_STEP_PREFIX.length)
                        : null

                return (
                    <li key={index} className="flex gap-2.5 py-4 first:pt-0 last:pb-0">
                        <span className="w-6 shrink-0 text-[13px] font-semibold leading-[26px] tabular-nums text-[#A39E98]">
                            {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0">
                            {pathValue ? (
                                <PathStepChips path={pathValue} />
                            ) : (
                                <span className="block break-keep text-[15px] leading-[26px] text-[#31302E] [overflow-wrap:anywhere]">
                                    {item.label}
                                </span>
                            )}
                            {item.description ? (
                                <span className="mt-1 block break-keep text-sm leading-6 text-[#615D59] [overflow-wrap:anywhere]">
                                    {item.description}
                                </span>
                            ) : null}
                        </span>
                    </li>
                )
            })}
        </ol>
    )
}

export function DocsArticle({
    eyebrow,
    title,
    description,
    meta,
    sections,
    footer,
    className,
}: DocsArticleProps) {
    return (
        <article className={cn("min-w-0 text-[#111110]", className)}>
            <header className="border-b border-black/[0.08] pb-8">
                {eyebrow ? (
                    <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#084734]">
                        {eyebrow}
                    </p>
                ) : null}
                <h1 className="mt-4 max-w-[980px] break-keep text-balance text-[2rem] font-black leading-[1.14] tracking-display text-[#111110] [overflow-wrap:anywhere] md:text-[2.5rem] 2xl:text-[2.75rem]">
                    {formatDashTitle(title)}
                </h1>
                {description ? (
                    <p className="mt-5 max-w-[850px] break-keep text-lg leading-8 text-[#4F4C49] [overflow-wrap:anywhere]">
                        {description}
                    </p>
                ) : null}
                {meta ? (
                    <div className="mt-6 text-sm text-[#615D59]">
                        {meta}
                    </div>
                ) : null}
            </header>

            <div className="mt-10 space-y-10">
                {sections.map((section) => (
                    <section
                        key={section.id}
                        id={section.id}
                        className="scroll-mt-28 border-b border-black/[0.08] pb-8 last:border-b-0"
                    >
                        {section.eyebrow ? (
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#084734]">
                                {section.eyebrow}
                            </p>
                        ) : null}
                        <h2 className="max-w-[900px] break-keep text-balance text-2xl font-black leading-tight tracking-subhead text-[#111110] [overflow-wrap:anywhere] md:text-[1.75rem]">
                            {formatDashTitle(section.title)}
                        </h2>
                        {section.body ? (
                            <div className="mt-4 max-w-[850px] break-keep text-[17px] leading-8 text-[#31302E] [overflow-wrap:anywhere]">
                                {section.body}
                            </div>
                        ) : null}
                        {section.checklist ? <StepList items={section.checklist} /> : null}
                        {section.callout ? (
                            <div
                                className={cn(
                                    "mt-6 border-l-2 pl-4",
                                section.callout.tone === "warning"
                                    ? "border-amber-300 text-amber-950"
                                    : section.callout.tone === "success"
                                        ? "border-[#D1FAE5] text-[#084734]"
                                            : "border-black/[0.08] text-[#31302E]"
                                )}
                            >
                                <div className="flex gap-3">
                                    {section.callout.tone === "warning" ? (
                                        <TriangleAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
                                    ) : (
                                        <Info aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                        {section.callout.title ? (
                                            <p className="break-words font-bold">{section.callout.title}</p>
                                        ) : null}
                                        <div className="mt-1 break-words text-sm leading-6">{section.callout.body}</div>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        {section.children ? <div className="mt-6">{section.children}</div> : null}
                    </section>
                ))}
            </div>

            {footer ? <footer className="mt-8">{footer}</footer> : null}
        </article>
    )
}
