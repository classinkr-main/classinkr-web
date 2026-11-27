"use client"

import { Fragment } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import type { ChatLinkClick } from "@/components/ui/chatbot-link-navigation"
import { sanitizePublicUrl } from "@/lib/safe-public-url"

export { findAnswerHeadBlocks, isAnswerHeadLabel, parseAnswerHeadLine, splitAnswerBlocks } from "@/components/ui/chatbot/answer-heads"

/*
 * 답 글 속 링크(CX-17).
 * - 사이트 안 공개 경로('(/contact)'·'/showroom'·'/docs/…')와 이 사이트 주소는 next/link 로 그린다. 휴대폰에서 누르면
 *   대화창을 닫는 규칙(chatbot-link-navigation)을 출처 카드와 같이 따른다.
 * - 외부 주소(예: 공식 API 문서)는 지우지 않고 새 창 링크로 둔다. 예전에는 주소를 문장 중간에서 지워
 *   'API 문서()를 보셔야 해요'·'에서 요금 안내를…'처럼 문장이 끊겼다.
 * - 원본 이미지(마크다운 이미지·/images/ 경로·이미지 파일 주소)와 '[image_1]' 표지는 예전처럼 지운다.
 *   서버가 모델·검색 조각 답에서 원본 주소를 먼저 지운다(lib/chatbot/llm.ts sanitizePublicAnswerText) — 여기까지 오는
 *   주소는 사람이 정해 둔 답에 일부러 적은 공개 링크다.
 */

// 링크로 그리는 사이트 경로의 첫 마디. 이 밖(/admin·/api·/checkout·/images 등)은 글자로 둔다.
const SITE_LINK_SECTIONS = [
    "contact",
    "showroom",
    "pricing",
    "download",
    "docs",
    "introduction",
    "about",
    "faq",
    "product",
    "privacy",
    "terms",
    "events",
    "blog",
    "updates",
    "resources",
] as const

// 이 사이트의 주소(옛 주소 포함). 이 주소로 적힌 링크는 사이트 안 이동으로 그린다.
const SITE_HOSTS = new Set(["classin.co.kr", "www.classin.co.kr", "classin.ai.kr", "www.classin.ai.kr"])

const SECTION_ALT = SITE_LINK_SECTIONS.join("|")
const PATH_TAIL = String.raw`(?![A-Za-z0-9_-])(?:\/[A-Za-z0-9\-._~%]+)*\/?(?:[?#][A-Za-z0-9\-._~%=&\/]*)?`
const SITE_PATH_RE = new RegExp(String.raw`^\/(?:${SECTION_ALT})${PATH_TAIL}$`)
const IMAGE_FILE_RE = /\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#]\S*)?$/i
// 문장 끝 문장부호는 주소에 붙이지 않는다.
const TRAILING_PUNCTUATION_RE = /[.,;:!?]+$/

// 마크다운 링크 → 맨 주소 → 사이트 경로 순으로 찾는다. 경로는 글자·주소의 한가운데('and/or'·'…/docs/…')에서 시작하지 않는다.
const TOKEN_RE = new RegExp(
    [
        String.raw`\[(?<mdLabel>[^\]\n]+)\]\((?<mdHref>(?:https?:\/\/|\/)[^)\s]+)\)`,
        String.raw`(?<url>https?:\/\/[A-Za-z0-9\-._~:/?#@!$&*+,;=%]+)`,
        String.raw`(?<![\w.\/:%-])(?<path>\/(?:${SECTION_ALT})${PATH_TAIL})`,
    ].join("|"),
    "g"
)

export type AssistantTextToken =
    | { kind: "text"; text: string }
    | { kind: "link"; text: string; href: string; external: boolean }

export function isSiteLinkPath(path: string): boolean {
    return SITE_PATH_RE.test(path)
}

// 링크로 그릴 곳을 정한다. 못 그리면 null(글자로 둔다).
export function resolveAssistantLinkHref(raw: string): { href: string; external: boolean } | null {
    const value = raw.trim()
    if (!value || IMAGE_FILE_RE.test(value)) return null
    if (value.startsWith("/")) {
        return isSiteLinkPath(value) ? { href: value, external: false } : null
    }
    const safe = sanitizePublicUrl(value, "")
    if (!safe) return null
    let parsed: URL
    try {
        parsed = new URL(safe)
    } catch {
        return null
    }
    if (parsed.username || parsed.password) return null
    if (SITE_HOSTS.has(parsed.hostname)) {
        const path = `${parsed.pathname}${parsed.search}${parsed.hash}`
        return isSiteLinkPath(parsed.pathname) ? { href: path, external: false } : null
    }
    return { href: safe, external: true }
}

function pushText(tokens: AssistantTextToken[], text: string) {
    if (!text) return
    const last = tokens[tokens.length - 1]
    if (last?.kind === "text") last.text += text
    else tokens.push({ kind: "text", text })
}

// 답 글 한 덩이를 글자·링크 조각으로 나눈다(순수 함수, 시험: tests/chatbot/message-links.test.ts).
export function tokenizeAssistantText(text: string): AssistantTextToken[] {
    const tokens: AssistantTextToken[] = []
    let cursor = 0
    for (const match of text.matchAll(TOKEN_RE)) {
        const index = match.index ?? 0
        pushText(tokens, text.slice(cursor, index))
        cursor = index + match[0].length
        const groups = match.groups ?? {}

        if (groups.mdLabel !== undefined && groups.mdHref !== undefined) {
            const target = resolveAssistantLinkHref(groups.mdHref)
            if (target) tokens.push({ kind: "link", text: groups.mdLabel, ...target })
            else pushText(tokens, groups.mdLabel)
            continue
        }

        const raw = groups.url ?? groups.path ?? match[0]
        const trailing = raw.match(TRAILING_PUNCTUATION_RE)?.[0] ?? ""
        const linkText = trailing ? raw.slice(0, -trailing.length) : raw
        const target = resolveAssistantLinkHref(linkText)
        if (target) tokens.push({ kind: "link", text: linkText, ...target })
        else pushText(tokens, linkText)
        pushText(tokens, trailing)
    }
    pushText(tokens, text.slice(cursor))
    return tokens
}

// 화면에 보일 글을 다듬는다. 링크(마크다운·주소·경로)는 남기고 원본 이미지·내부 표지·굵게 표시만 지운다.
export function prepareAssistantDisplayText(value: string): string {
    return value
        .replace(/!\[[^\]]*]\([^)]*\)/g, "")
        .replace(/https?:\/\/[A-Za-z0-9\-._~:/?#@!$&*+,;=%]+\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#][^\s)]*)?/gi, "")
        .replace(/(?<![\w.\/:%-])\/images\/[^\s)]+/g, "")
        .replace(/(?<![\w.\/:%-])\/(?:docs|resources)\/[^\s)]*\.(?:png|jpe?g|gif|webp|svg|avif|bmp)\b/gi, "")
        .replace(/\[image[_\-\s]?\d*]/gi, "")
        // 제품 톤은 마크다운을 쓰지 않는다. 모델이 가끔 흘리는 **굵게** 표시는 평문으로 정리한다.
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/^\s*(?:출처|참고\s*문서|근거\s*자료|문서\s*보기)\s*:.*$/gim, "")
        // 지운 이미지 자리에 남은 빈 괄호
        .replace(/\(\s*\)/g, "")
        .replace(/[^\S\r\n]{2,}/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
}

// 복사·스크린 리더 안내용 평문: 마크다운 링크는 이름만 남긴다(주소와 경로는 글에 적힌 그대로 둔다).
export function flattenAssistantMarkdownLinks(value: string): string {
    return value.replace(/\[([^\]\n]+)\]\((?:https?:\/\/|\/)[^)\s]+\)/g, "$1")
}

// 답 글 조각을 링크와 함께 그린다. 사이트 안 링크는 onNavigate(휴대폰이면 대화창 닫기)를 부른다.
// 외부 링크는 새 창이라 이 페이지가 바뀌지 않으므로 대화창을 닫지 않는다.
export function LinkifiedText({
    text,
    onNavigate,
}: {
    text: string
    onNavigate?: (click: ChatLinkClick) => void
}) {
    const tokens = tokenizeAssistantText(text)
    return (
        <>
            {tokens.map((token, index) => {
                if (token.kind === "text") return <Fragment key={index}>{token.text}</Fragment>
                if (token.external) {
                    return (
                        <a key={index} href={token.href} target="_blank" rel="noopener noreferrer" className="link-body">
                            {token.text}
                            <ArrowUpRight className="ml-0.5 inline h-3.5 w-3.5 align-[-0.125em]" aria-hidden />
                            <span className="sr-only"> (새 창)</span>
                        </a>
                    )
                }
                return (
                    <Link key={index} href={token.href} onClick={(event) => onNavigate?.(event)} className="link-body">
                        {token.text}
                    </Link>
                )
            })}
        </>
    )
}

// 복합 답의 번호 머리 줄("1. 주제", 고르는 규칙은 answer-heads.ts). 굵기만 바꾼다 — 색·크기·행간은 본문 그대로라
// 바로 아래 결론 줄과 한 문단처럼 이어진다. 14px 600 은 라벨 자리에만 쓴다(DESIGN.md 굵기): 이 줄은 물음마다의 라벨이다.
export function AnswerHeadLine({ text, onNavigate }: { text: string; onNavigate?: (click: ChatLinkClick) => void }) {
    return (
        <p className="font-semibold" data-chat-answer-head="">
            <LinkifiedText text={text} onNavigate={onNavigate} />
        </p>
    )
}
