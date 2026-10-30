import type { ReactNode } from "react"

import type { DocsSearchIndex } from "@/lib/docs-search"

export type DocsHref = string

export interface DocsLink {
    title: string
    href: DocsHref
    description?: string
    eyebrow?: string
    isActive?: boolean
}

export interface DocsArticleSummary {
    title: string
    description: string
    href: DocsHref
    category?: string
    readTime?: string
    updatedAt?: string
    tags?: string[]
    searchText?: string
    /** 검색 점수용 구조 색인(섹션 제목·키워드·유형). lib/docs-search.ts 가 쓴다. */
    searchIndex?: DocsSearchIndex
    /** 목록 라벨·필터용 문서 유형(사용법·문제 해결·FAQ·업데이트). */
    kind?: "howto" | "troubleshooting" | "faq" | "update"
    /** 목록 미리보기 — 본문 첫 화면 사진(사진이 없으면 개념도). */
    thumbnail?: {
        src: string
        width?: number
        height?: number
        isDiagram?: boolean
    }
    /** 본문에 실린 사진 수(개념도 제외). */
    imageCount?: number
    /** 정렬용 원본 날짜(YYYY-MM-DD). updatedAt 은 화면 표시용이다. */
    updatedAtIso?: string
}

export interface DocsChecklistItem {
    label: ReactNode
    checked?: boolean
    description?: ReactNode
}

export interface DocsCallout {
    title?: string
    body: ReactNode
    tone?: "info" | "success" | "warning"
}

export interface DocsArticleSection {
    id: string
    title: string
    eyebrow?: string
    body?: ReactNode
    checklist?: DocsChecklistItem[]
    callout?: DocsCallout
    children?: ReactNode
}

export interface DocsNavGroup {
    title: string
    links: DocsLink[]
}

export interface DocsTocItem {
    id: string
    title: string
}
