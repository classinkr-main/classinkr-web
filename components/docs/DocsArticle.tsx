import Link from "next/link"
import type { ReactNode } from "react"
import { ChevronRight, Info, TriangleAlert } from "lucide-react"

import { DocsSectionLinkButton } from "./DocsSectionLinkButton"
import type { DocsArticleSection, DocsChecklistItem } from "./types"
import { cn } from "./utils"

export interface DocsArticleProps {
    eyebrow?: string
    /** 제목 위 분류 옆에 붙는 표시(예: 문제 해결). */
    badge?: ReactNode
    title: ReactNode
    description?: ReactNode
    meta?: ReactNode
    /** 머리말과 첫 섹션 사이(예: 좁은 화면용 접힌 목차). */
    beforeSections?: ReactNode
    sections: DocsArticleSection[]
    /** 섹션 제목 옆에 `#section-N` 링크 복사 버튼을 둔다. */
    sectionLinks?: boolean
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

// 단계 문장 안의 마크다운 링크 `[글](/docs/...)` 와 굵게 `**글**` 만 살린다.
// `[업그레이드]` 처럼 괄호 주소가 없는 대괄호는 화면 버튼 이름이라 그대로 둔다.
const INLINE_MARKDOWN_PATTERN = /\[([^\]]+)\]\(((?:\/|#|https?:\/\/|mailto:)[^)\s]*)\)|\*\*([^*]+)\*\*/g

const INLINE_LINK_CLASS =
    "font-semibold text-[#084734] underline decoration-[#084734]/30 underline-offset-4 transition-colors duration-150 hover:decoration-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"

function renderInlineMarkdown(text: string): ReactNode {
    const parts: ReactNode[] = []
    let lastIndex = 0

    for (const match of text.matchAll(INLINE_MARKDOWN_PATTERN)) {
        const start = match.index ?? 0
        if (start > lastIndex) parts.push(text.slice(lastIndex, start))

        const [whole, linkText, href, boldText] = match
        if (linkText && href) {
            const isInternal = href.startsWith("/") || href.startsWith("#")
            parts.push(
                isInternal ? (
                    <Link key={start} href={href} className={INLINE_LINK_CLASS}>
                        {linkText}
                    </Link>
                ) : (
                    <a key={start} href={href} target="_blank" rel="noreferrer" className={INLINE_LINK_CLASS}>
                        {linkText}
                    </a>
                )
            )
        } else if (boldText) {
            parts.push(
                <strong key={start} className="font-semibold text-[#111110]">
                    {boldText}
                </strong>
            )
        } else {
            parts.push(whole)
        }

        lastIndex = start + whole.length
    }

    if (lastIndex === 0) return text
    if (lastIndex < text.length) parts.push(text.slice(lastIndex))
    return parts
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
                                    {typeof item.label === "string" ? renderInlineMarkdown(item.label) : item.label}
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
    badge,
    title,
    description,
    meta,
    beforeSections,
    sections,
    sectionLinks = false,
    footer,
    className,
}: DocsArticleProps) {
    return (
        <article data-docs-article="" className={cn("min-w-0 text-[#111110]", className)}>
            <header className="border-b border-black/[0.08] pb-8">
                {eyebrow || badge ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        {eyebrow ? (
                            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#084734]">
                                {eyebrow}
                            </p>
                        ) : null}
                        {badge}
                    </div>
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

            {beforeSections ? <div className="mt-8">{beforeSections}</div> : null}

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
                        <div className="group/heading flex items-start gap-1">
                            <h2 className="min-w-0 max-w-[900px] break-keep text-balance text-2xl font-black leading-tight tracking-subhead text-[#111110] [overflow-wrap:anywhere] md:text-[1.75rem]">
                                {formatDashTitle(section.title)}
                            </h2>
                            {sectionLinks ? (
                                <DocsSectionLinkButton
                                    sectionId={section.id}
                                    title={section.title}
                                    className="-mt-0.5 md:mt-0"
                                />
                            ) : null}
                        </div>
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
