/**
 * 챗봇 답변 속 주소를 링크 버튼으로 바꾸기 위한 순수 함수(UI 전용, 답변 로직과 무관).
 *
 * 답변 원문에는 "문의 페이지(/contact)", "[가이드](/docs/...)", "https://..." 같은 주소가 섞여 온다.
 *  - extractAnswerLinks: 원문에서 링크를 모아 버튼으로 쓸 { href, label } 목록을 만든다.
 *  - stripAnswerAddresses: 본문에서 주소 글자를 지운다(버튼이 대신한다). 스트리밍 중 끝에 걸린
 *    미완성 "(/conta" 도 지워 깜빡 보이지 않게 한다.
 */

export interface AnswerLink {
    href: string
    label: string
    external: boolean
}

const INTERNAL_PATH_LABELS: Array<[RegExp, string]> = [
    [/^\/contact(?:[/?#]|$)/, "문의하기"],
    [/^\/showroom(?:[/?#]|$)/, "쇼룸 예약"],
    [/^\/docs\/?$/, "문서센터"],
    [/^\/docs\//, "가이드 보기"],
    [/^\/pricing(?:[/?#]|$)/, "요금 보기"],
    [/^\/download(?:[/?#]|$)/, "다운로드"],
    [/^\/product(?:[/?#]|$)/, "제품 보기"],
    [/^\/faq(?:[/?#]|$)/, "자주 묻는 질문"],
    [/^\/events(?:[/?#]|$)/, "행사 보기"],
    [/^\/blog(?:[/?#]|$)/, "블로그 보기"],
    [/^\/resources(?:[/?#]|$)/, "자료실"],
    [/^\/updates(?:[/?#]|$)/, "업데이트 소식"],
    [/^\/signup(?:[/?#]|$)/, "회원가입"],
    [/^\/login(?:[/?#]|$)/, "로그인"],
]

const EXTERNAL_HOST_LABELS: Array<[RegExp, string]> = [
    [/(^|\.)docs\.channel\.io$/, "도움말 문서"],
    [/(^|\.)classin\.com$/, "ClassIn 안내"],
    [/(^|\.)docs\.eeo\.cn$/, "API 문서"],
]

const MAX_LINKS = 4
const PATH_CHARS = "A-Za-z0-9/_\\-?=&#.%~"
const URL_PATTERN = /https?:\/\/[^\s)\]]+/g
const MARKDOWN_LINK = /\[([^\]]+)]\(((?:https?:\/\/|\/)[^)\s]+)\)/g
const PAREN_PATH = new RegExp(`\\((/[${PATH_CHARS}]*)\\)`, "g")
const BARE_DOCS_PATH = new RegExp(`(?:^|[\\s:])(/docs/[${PATH_CHARS}]+)`, "g")

function trimUrl(url: string) {
    return url.replace(/[.,;:!?'"’”]+$/, "")
}

function labelForInternal(path: string) {
    for (const [pattern, label] of INTERNAL_PATH_LABELS) {
        if (pattern.test(path)) return label
    }
    return "바로가기"
}

function labelForExternal(href: string) {
    try {
        const host = new URL(href).hostname
        for (const [pattern, label] of EXTERNAL_HOST_LABELS) {
            if (pattern.test(host)) return label
        }
        return host.replace(/^www\./, "")
    } catch {
        return "바로가기"
    }
}

function cleanLabel(label: string) {
    const trimmed = label.replace(/\*\*/g, "").trim()
    return trimmed.length > 0 && trimmed.length <= 24 ? trimmed : null
}

/** 답변 원문에서 링크 버튼 목록을 만든다(중복 제거, 최대 4개). excludeHrefs 는 출처 카드 등 이미 보이는 링크. */
export function extractAnswerLinks(raw: string, excludeHrefs: Iterable<string> = []): AnswerLink[] {
    const seen = new Set<string>(excludeHrefs)
    const links: AnswerLink[] = []
    const add = (href: string, label?: string | null) => {
        const cleanHref = trimUrl(href)
        if (!cleanHref || seen.has(cleanHref) || links.length >= MAX_LINKS) return
        if (cleanHref.startsWith("/") && cleanHref.length < 2) return
        seen.add(cleanHref)
        const external = /^https?:\/\//.test(cleanHref)
        links.push({
            href: cleanHref,
            label: label ?? (external ? labelForExternal(cleanHref) : labelForInternal(cleanHref)),
            external,
        })
    }

    // 1) 마크다운 링크는 본문 라벨을 그대로 버튼 이름으로 쓴다.
    let rest = raw.replace(MARKDOWN_LINK, (_match, label: string, href: string) => {
        add(href, cleanLabel(label))
        return label
    })
    // 2) "문의 페이지(/contact)" 같은 괄호 속 경로
    rest = rest.replace(PAREN_PATH, (_match, path: string) => {
        add(path)
        return ""
    })
    // 3) 나머지 URL
    for (const match of rest.matchAll(URL_PATTERN)) add(match[0])
    // 4) 괄호 없이 적힌 문서 경로 "/docs/start/pc-install"
    for (const match of rest.replace(URL_PATTERN, "").matchAll(BARE_DOCS_PATH)) add(match[1])
    return links
}

/** 본문에서 주소 글자를 지운다. 버튼이 대신하므로 "(/contact)"·URL·빈 괄호를 남기지 않는다. */
export function stripAnswerAddresses(text: string): string {
    return (
        text
            // 스트리밍 중 끝에 걸린 미완성 주소: "(/conta", "(https://cla", "https://cla"
            .replace(new RegExp(`\\s?\\((?:/[${PATH_CHARS}]*|https?:[^\\s)]*)$`), "")
            .replace(PAREN_PATH, "")
            .replace(/\s?\(\s*https?:\/\/[^\s)]+\s*\)/g, "")
            .replace(URL_PATTERN, "")
            .replace(/\(\s*\)/g, "")
            // "주소: " 처럼 주소만 있던 줄 끝의 콜론
            .replace(/(링크|주소|URL|바로가기)\s*:\s*$/gim, "")
            .replace(/[^\S\r\n]+([.,!?])/g, "$1")
    )
}
