import type { ReactNode } from "react"
import { Check, Circle, Info, TriangleAlert } from "lucide-react"

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

function Checklist({ items }: { items: DocsChecklistItem[] }) {
    return (
        <ul className="mt-5 divide-y divide-black/[0.08]">
            {items.map((item, index) => (
                <li key={index} className="flex gap-2.5 py-3 first:pt-0">
                    <span
                        className={cn(
                            "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                            item.checked
                                ? "border-[#084734] bg-transparent text-[#084734]"
                                : "border-black/[0.08] bg-transparent text-[#A39E98]"
                        )}
                    >
                        {item.checked ? <Check aria-hidden className="h-2.5 w-2.5" /> : <Circle aria-hidden className="h-2 w-2 fill-current" />}
                    </span>
                    <span className="min-w-0">
                        <span className="block break-keep text-[15px] font-bold leading-6 text-[#111110] [overflow-wrap:anywhere]">{item.label}</span>
                        {item.description ? (
                            <span className="mt-1 block break-keep text-sm leading-6 text-[#615D59] [overflow-wrap:anywhere]">
                                {item.description}
                            </span>
                        ) : null}
                    </span>
                </li>
            ))}
        </ul>
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
                <h1 className="mt-4 max-w-[980px] break-keep text-balance text-4xl font-black leading-[1.08] tracking-display text-[#111110] [overflow-wrap:anywhere] md:text-5xl">
                    {title}
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
                        <h2 className="max-w-[900px] break-keep text-balance text-2xl font-black leading-tight tracking-subhead text-[#111110] [overflow-wrap:anywhere] md:text-3xl">
                            {section.title}
                        </h2>
                        {section.body ? (
                            <div className="mt-4 max-w-[850px] break-keep text-[17px] leading-8 text-[#31302E] [overflow-wrap:anywhere]">
                                {section.body}
                            </div>
                        ) : null}
                        {section.checklist ? <Checklist items={section.checklist} /> : null}
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
