"use client"

import { useMemo, useState } from "react"
import { BookOpen, Check, Copy, Search } from "lucide-react"

import { CURATED_CS_FIGMA_GUIDES } from "@/lib/cs-figma-curated-guides"
import type { CsFigmaGuide } from "@/lib/cs-figma-guides"

interface FigmaKnowledgeSupporterProps {
  contextText?: string
  className?: string
}

export default function FigmaKnowledgeSupporter({
  contextText = "",
  className = "",
}: FigmaKnowledgeSupporterProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null)

  // Match guides based on contextText and/or manual search
  const matchedGuides = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const context = contextText.trim().toLowerCase()

    return CURATED_CS_FIGMA_GUIDES.map((guide) => {
      let score = 0
      const titleLower = guide.title.toLowerCase()
      const summaryLower = guide.summary.toLowerCase()
      const keywords = guide.keywords.map((k) => k.toLowerCase())

      if (query) {
        if (titleLower.includes(query)) score += 10
        if (keywords.some((k) => k.includes(query))) score += 5
        if (summaryLower.includes(query)) score += 3
      } else if (context) {
        // Match against conversation text
        for (const kw of keywords) {
          if (context.includes(kw)) score += 5
        }
        if (context.includes("녹화") && titleLower.includes("녹화")) score += 8
        if (context.includes("카메라") && titleLower.includes("카메라")) score += 8
        if (context.includes("비밀번호") && titleLower.includes("비밀번호")) score += 8
        if (context.includes("칠판") && (titleLower.includes("전자칠판") || titleLower.includes("ifp"))) score += 8
        if (context.includes("공유") && titleLower.includes("공유")) score += 6
      }

      return { guide, score }
    })
      .filter((item) => (query ? item.score > 0 : true))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((item) => item.guide)
  }, [contextText, searchQuery])

  // Copy guide as formatted message
  const handleCopyGuide = (guide: CsFigmaGuide) => {
    const formatted = [
      `[ClassIn 안내 가이드: ${guide.title}]`,
      guide.summary,
      "",
      "■ 진행 순서:",
      ...guide.steps.map((step, i) => `${i + 1}. ${step}`),
      "",
      "추가로 도움이 필요하시면 언제든 말씀해주세요!",
    ].join("\n")

    void navigator.clipboard.writeText(formatted)
    setCopiedSlug(guide.slug)
    setTimeout(() => setCopiedSlug(null), 2500)
  }

  return (
    <div className={`flex flex-col h-full bg-[#FAFAF8] border-l border-black/[0.08] ${className}`}>
      {/* Supporter Header */}
      <div className="p-3.5 border-b border-black/[0.06] bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#084734]/10 text-[#084734]">
              <BookOpen className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-bold text-[#111110]">
              피그마 캡처 & 지식 가이드 (107건)
            </span>
          </div>
          <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-bold text-[#084734]">
            Figma CSM 연동
          </span>
        </div>

        {/* Search Input */}
        <div className="relative mt-2.5">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="가이드 검색 (예: 녹화, 카메라, 비밀번호)..."
            className="w-full rounded-xl border border-black/10 bg-white py-1.5 pl-8 pr-2.5 text-[11.5px] text-[#111110] placeholder:text-[#A39E98] focus:border-[#084734] focus:outline-none"
          />
        </div>
      </div>

      {/* Guide List Stream */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {matchedGuides.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#A39E98]">
            일치하는 피그마 가이드가 없습니다. 다른 검색어를 입력해보세요.
          </div>
        ) : (
          matchedGuides.map((guide) => {
            const isExpanded = expandedSlug === guide.slug
            const isCopied = copiedSlug === guide.slug

            return (
              <div
                key={guide.slug}
                className="rounded-xl border border-black/[0.08] bg-white p-3 shadow-2xs transition hover:border-[#084734]/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="rounded-full bg-[#FAFAF8] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#084734] border border-black/[0.05]">
                      {guide.category === "classroom"
                        ? "수업·운영"
                        : guide.category === "admin"
                          ? "관리자"
                          : guide.category === "troubleshooting"
                            ? "문제해결"
                            : "온보딩"}
                    </span>
                    <h4 className="mt-1 text-xs font-bold text-[#111110] leading-snug">
                      {guide.title}
                    </h4>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopyGuide(guide)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-black/10 bg-white px-2 py-1 text-[10.5px] font-medium text-[#111110] hover:bg-[#ECFDF5] hover:text-[#084734] hover:border-[#084734]/30 transition"
                    title="대화창에 붙여넣을 수 있는 포맷으로 복사"
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-3 w-3 text-[#084734]" />
                        <span className="text-[#084734] font-semibold">복사됨!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>답변 복사</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="mt-1.5 text-[11px] text-[#615D59] line-clamp-2 leading-relaxed">
                  {guide.summary}
                </p>

                {/* Steps toggle */}
                <div className="mt-2.5 pt-2 border-t border-black/[0.04]">
                  <button
                    type="button"
                    onClick={() => setExpandedSlug(isExpanded ? null : guide.slug)}
                    className="flex w-full items-center justify-between text-[10.5px] font-semibold text-[#084734] hover:underline"
                  >
                    <span>단계별 가이드 ({guide.steps.length}단계)</span>
                    <span>{isExpanded ? "접기 ▲" : "펼치기 ▼"}</span>
                  </button>

                  {isExpanded && (
                    <div className="mt-2 space-y-1.5 text-[11px] text-[#111110] bg-[#FAFAF8] p-2.5 rounded-lg border border-black/[0.04]">
                      {guide.steps.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          <span className="font-bold text-[#084734] shrink-0">{idx + 1}.</span>
                          <span className="leading-snug">{step}</span>
                        </div>
                      ))}
                      {guide.deepDive && guide.deepDive.length > 0 && (
                        <div className="mt-2 pt-1.5 border-t border-black/[0.05] text-[10.5px] text-[#615D59]">
                          <span className="font-semibold text-[#111110]">💡 팁: </span>
                          {guide.deepDive[0].body}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="p-2.5 bg-white border-t border-black/[0.06] text-[10px] text-[#A39E98] text-center">
        Figma CS용 캡쳐 모음 보드 전수 추출본 107건 및 MD 지식 기반
      </div>
    </div>
  )
}
