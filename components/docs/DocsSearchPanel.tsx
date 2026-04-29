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
        "border-b border-black/[0.08] pb-6 md:pb-8",
        className
      )}
      aria-label="가이드 검색"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#084734]">
            가이드 검색
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-subhead text-[#111110] md:text-3xl">
            필요한 안내를 바로 찾기
          </h2>
        </div>
        <div className="text-sm font-semibold text-[#615D59]">
          총 {articles.length}개 안내
        </div>
      </div>

      <label htmlFor="docs-search" className="sr-only">
        가이드 검색어
      </label>
      <div className="mt-5 flex min-h-[52px] items-center gap-3 border-b border-black/[0.08] pb-3 focus-within:border-[#084734]/40">
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
            className="flex h-10 w-10 shrink-0 items-center justify-center text-[#615D59] transition-all duration-150 hover:text-[#111110] active:scale-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            aria-label="검색어 지우기"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {normalizedQuery.length < 2 ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {["첫 수업", "교사 온보딩", "학생 로그인", "음성 문제", "출결 보강"].map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => setQuery(term)}
              className="min-h-10 origin-center border-b border-transparent px-0 text-sm font-medium text-[#615D59] transition-all duration-150 hover:border-[#084734]/25 hover:text-[#084734] active:scale-[0.98] active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            >
              {term}
            </button>
          ))}
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="mt-5 grid gap-x-10 gap-y-0 lg:grid-cols-2">
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
              className="group flex min-h-[92px] origin-center gap-4 border-b border-black/[0.08] py-4 transition-all duration-150 hover:border-[#084734]/25 active:scale-[0.98] active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center text-[#084734]">
                <FileText className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#084734]">
                  {article.category ? <span>{article.category}</span> : null}
                  {article.readTime ? <span className="text-[#A39E98]">{article.readTime}</span> : null}
                </span>
                <span className="mt-2 block break-words text-base font-semibold leading-snug text-[#111110] group-hover:text-[#084734]">
                  {article.title}
                </span>
                <span className="mt-1 block break-words text-sm leading-6 text-[#4F4C49]">
                  {article.description}
                </span>
              </span>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#A39E98] transition-transform group-hover:translate-x-1 group-hover:text-[#084734]" />
            </a>
          ))}
        </div>
      ) : null}

      {showEmpty ? (
        <div className="mt-5 border-b border-dashed border-black/[0.12] pb-5">
          <p className="font-bold text-[#111110]">검색 결과가 없습니다.</p>
          <p className="mt-2 text-sm leading-6 text-[#615D59]">
            다른 표현으로 다시 검색하거나 오른쪽 하단 상담창에 질문해 주세요.
          </p>
        </div>
      ) : null}
    </section>
  )
}
