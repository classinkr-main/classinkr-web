/**
 * DocsSearchLogger — 가이드 검색어를 분석 로그로 적재 (zero-result 포함).
 *
 * 어드민 "질문 백로그"가 검색 수요·미해결 검색어를 데이터로 받도록,
 * /docs/search 결과 페이지에서 검색어 + 결과 수를 한 번 전송한다.
 */

"use client"

import { useEffect, useRef } from "react"

interface Props {
  query: string
  resultCount: number
}

export function DocsSearchLogger({ query, resultCount }: Props) {
  const loggedKey = useRef("")

  useEffect(() => {
    const key = `${query}::${resultCount}`
    if (!query || loggedKey.current === key) return
    loggedKey.current = key

    fetch("/api/docs/search-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, resultCount }),
      keepalive: true,
    }).catch(() => {})
  }, [query, resultCount])

  return null
}
