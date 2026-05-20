"use client"

import { useMemo } from "react"

interface SearchHighlightProps {
  text: string
  query?: string
  className?: string
}

export function SearchHighlight({ text, query, className }: SearchHighlightProps) {
  const parts = useMemo(() => {
    if (!query) return [text]
    const trimmed = query.trim()
    if (!trimmed) return [text]

    const tokens = trimmed
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.toLowerCase())

    if (tokens.length === 0) return [text]

    try {
      // Escape special characters to prevent regex breaking
      const escapedTokens = tokens.map((token) =>
        token.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&")
      )
      // Sort longer tokens first to prevent partial shorter matches from intercepting longer ones
      escapedTokens.sort((a, b) => b.length - a.length)
      
      const regex = new RegExp(`(${escapedTokens.join("|")})`, "gi")
      return text.split(regex)
    } catch {
      return [text]
    }
  }, [text, query])

  const queryTokens = useMemo(() => {
    if (!query) return []
    return query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.toLowerCase())
  }, [query])

  if (queryTokens.length === 0) {
    return <span className={className}>{text}</span>
  }

  return (
    <span className={className}>
      {parts.map((part, index) => {
        const isMatch = queryTokens.some((token) => token === part.toLowerCase())
        return isMatch ? (
          <mark
            key={index}
            className="bg-[#ECFDF5] text-[#084734] px-0.5 rounded-[2px] font-semibold"
          >
            {part}
          </mark>
        ) : (
          part
        )
      })}
    </span>
  )
}
