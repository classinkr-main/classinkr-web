import type { ReactNode } from "react"

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
