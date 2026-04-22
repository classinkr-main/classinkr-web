"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, FileText, Search, X } from "lucide-react"

import type { DocsArticleSummary } from "./types"
import { cn } from "./utils"

export interface DocsSearchPanelProps {
  articles: DocsArticleSummary[]
  sourcePage?: string
  className?: string
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function scoreArticle(article: DocsArticleSummary, normalizedQuery: string) {
  const terms = normalizedQuery.split(" ").filter(Boolean)
  if (terms.length === 0) return 0

  const title = normalize(article.title)
  const category = normalize(article.category ?? "")
  const description = normalize(article.description)
  const tags = normalize((article.tags ?? []).join(" "))
  const searchText = normalize(article.searchText ?? "")
  const fullText = [title, category, description, tags, searchText].join(" ")

  return terms.reduce((score, term) => {
    if (title.includes(term)) return score + 8
    if (category.includes(term)) return score + 5
    if (tags.includes(term)) return score + 4
    if (description.includes(term)) return score + 2
    if (searchText.includes(term)) return score + 2
    if (fullText.includes(term)) return score + 1
    return score
  }, 0)
}

async function logSearchEvent(payload: {
  query: string
  resultCount: number
  sourcePage?: string
  clickedPath?: string
}) {
  try {
    await fetch("/api/docs/search-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    })
  } catch {
    // Analytics should never block the docs experience.
  }
}

export function DocsSearchPanel({
  articles,
  sourcePage = "/docs",
  className,
}: DocsSearchPanelProps) {
  const [query, setQuery] = useState("")
  const loggedQueryRef = useRef("")
  const normalizedQuery = normalize(query)

  const results = useMemo(() => {
    if (normalizedQuery.length < 2) return []

    return articles
      .map((article) => ({
        article,
        score: scoreArticle(article, normalizedQuery),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((item) => item.article)
  }, [articles, normalizedQuery])

  useEffect(() => {
    if (normalizedQuery.length < 2 || loggedQueryRef.current === normalizedQuery) return

    const timeout = window.setTimeout(() => {
      loggedQueryRef.current = normalizedQuery
      void logSearchEvent({
        query,
        resultCount: results.length,
        sourcePage,
      })
    }, 550)

    return () => window.clearTimeout(timeout)
  }, [normalizedQuery, query, results.length, sourcePage])

  const hasQuery = query.trim().length > 0
  const showEmpty = normalizedQuery.length >= 2 && results.length === 0

  return (
    <section
      className={cn(
        "rounded-2xl border border-black/[0.08] bg-white p-5 shadow-card md:p-6",
        className
      )}
      aria-label="문서 검색"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#084734]">
            Docs Search
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-subhead text-[#111110] md:text-3xl">
            필요한 문서를 바로 찾기
          </h2>
        </div>
        <div className="text-sm font-semibold text-[#615D59]">
          총 {articles.length}개 문서
        </div>
      </div>

      <label htmlFor="docs-search" className="sr-only">
        문서 검색어
      </label>
      <div className="mt-5 flex min-h-[52px] items-center gap-3 rounded-xl border border-black/[0.08] bg-[#FAFAF8] px-4 focus-within:border-[#084734]/40 focus-within:ring-2 focus-within:ring-[#084734]/15">
        <Search className="h-5 w-5 shrink-0 text-[#084734]" aria-hidden />
        <input
          id="docs-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="로그인, 음성, 첫 수업, 출결, 결제"
          className="min-w-0 flex-1 bg-transparent py-3 text-base font-medium text-[#111110] outline-none placeholder:text-[#A39E98]"
        />
        {hasQuery ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#615D59] transition-colors hover:bg-black/[0.04] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            aria-label="검색어 지우기"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {normalizedQuery.length < 2 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {["첫 수업", "교사 온보딩", "학생 로그인", "음성 문제", "출결 보강"].map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => setQuery(term)}
              className="min-h-10 rounded-full bg-[#F6F5F4] px-4 text-sm font-semibold text-[#615D59] transition-colors hover:bg-[#ECFDF5] hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            >
              {term}
            </button>
          ))}
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {results.map((article) => (
            <a
              key={article.href}
              href={article.href}
              onClick={() => {
                void logSearchEvent({
                  query,
                  resultCount: results.length,
                  sourcePage,
                  clickedPath: article.href,
                })
              }}
              className="group flex min-h-[132px] gap-4 rounded-xl border border-black/[0.08] bg-[#FAFAF8] p-4 transition-all hover:border-[#084734]/25 hover:bg-[#ECFDF5]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#084734] shadow-sm">
                <FileText className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#084734]">
                  {article.category ? <span>{article.category}</span> : null}
                  {article.readTime ? <span className="text-[#A39E98]">{article.readTime}</span> : null}
                </span>
                <span className="mt-2 block text-base font-bold leading-snug text-[#111110] group-hover:text-[#084734]">
                  {article.title}
                </span>
                <span className="mt-1 block text-sm leading-6 text-[#615D59]">
                  {article.description}
                </span>
              </span>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#A39E98] transition-transform group-hover:translate-x-1 group-hover:text-[#084734]" />
            </a>
          ))}
        </div>
      ) : null}

      {showEmpty ? (
        <div className="mt-5 rounded-xl border border-dashed border-black/[0.12] bg-[#FAFAF8] p-5">
          <p className="font-bold text-[#111110]">검색 결과가 없습니다.</p>
          <p className="mt-2 text-sm leading-6 text-[#615D59]">
            다른 표현으로 다시 검색하거나 오른쪽 하단 상담 챗봇에 질문해 주세요.
          </p>
        </div>
      ) : null}
    </section>
  )
}
