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
        <ul className="mt-5 space-y-3">
            {items.map((item, index) => (
                <li key={index} className="flex gap-3 rounded-xl border border-black/[0.08] bg-white p-4">
                    <span
                        className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                            item.checked ? "bg-[#084734] text-white" : "bg-[#F6F5F4] text-[#A39E98]"
                        )}
                    >
                        {item.checked ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Circle aria-hidden className="h-2.5 w-2.5 fill-current" />}
                    </span>
                    <span>
                        <span className="block text-sm font-bold leading-6 text-[#111110]">{item.label}</span>
                        {item.description ? (
                            <span className="mt-1 block text-sm leading-6 text-[#615D59]">
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
            <header className="rounded-2xl border border-black/[0.08] bg-white p-6 shadow-card md:p-10">
                {eyebrow ? (
                    <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#084734]">
                        {eyebrow}
                    </p>
                ) : null}
                <h1 className="mt-4 text-4xl font-black leading-[1.08] tracking-display text-[#111110] md:text-5xl">
                    {title}
                </h1>
                {description ? (
                    <p className="mt-5 max-w-3xl text-lg font-medium leading-8 text-[#615D59]">
                        {description}
                    </p>
                ) : null}
                {meta ? (
                    <div className="mt-6 border-t border-black/[0.08] pt-5 text-sm font-medium text-[#615D59]">
                        {meta}
                    </div>
                ) : null}
            </header>

            <div className="mt-8 space-y-8">
                {sections.map((section) => (
                    <section
                        key={section.id}
                        id={section.id}
                        className="scroll-mt-28 rounded-2xl border border-black/[0.08] bg-white p-6 shadow-card md:p-8"
                    >
                        {section.eyebrow ? (
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#084734]">
                                {section.eyebrow}
                            </p>
                        ) : null}
                        <h2 className="text-2xl font-black leading-tight tracking-subhead text-[#111110] md:text-3xl">
                            {section.title}
                        </h2>
                        {section.body ? (
                            <div className="mt-4 text-base leading-8 text-[#31302E]">
                                {section.body}
                            </div>
                        ) : null}
                        {section.checklist ? <Checklist items={section.checklist} /> : null}
                        {section.callout ? (
                            <div
                                className={cn(
                                    "mt-6 rounded-xl border p-4",
                                    section.callout.tone === "warning"
                                        ? "border-amber-200 bg-amber-50 text-amber-950"
                                        : section.callout.tone === "success"
                                            ? "border-[#D1FAE5] bg-[#ECFDF5] text-[#084734]"
                                            : "border-black/[0.08] bg-[#F6F5F4] text-[#31302E]"
                                )}
                            >
                                <div className="flex gap-3">
                                    {section.callout.tone === "warning" ? (
                                        <TriangleAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
                                    ) : (
                                        <Info aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
                                    )}
                                    <div>
                                        {section.callout.title ? (
                                            <p className="font-bold">{section.callout.title}</p>
                                        ) : null}
                                        <div className="mt-1 text-sm leading-6">{section.callout.body}</div>
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
