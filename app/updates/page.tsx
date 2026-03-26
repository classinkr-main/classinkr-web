import type { Metadata } from "next"
import { getReleases } from "@/lib/github"
import { ExternalLink, Tag, Calendar } from "lucide-react"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "업데이트 | Classin",
  description: "Classin의 최신 업데이트 및 변경 내역을 확인하세요.",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  })
}

// 마크다운 body를 간단히 HTML로 변환 (줄바꿈, 굵게, 목록)
function renderBody(body: string) {
  if (!body) return null

  const lines = body.split("\n")
  const elements: React.ReactNode[] = []
  let listItems: string[] = []
  let key = 0

  const flushList = () => {
    if (listItems.length === 0) return
    elements.push(
      <ul key={key++} className="space-y-1 my-3 ml-1">
        {listItems.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[14px] text-[#1a1a1a]/70">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-[#084734]/40 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    )
    listItems = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { flushList(); continue }

    if (trimmed.startsWith("### ")) {
      flushList()
      elements.push(<h3 key={key++} className="text-[13px] font-semibold text-[#084734] uppercase tracking-wide mt-4 mb-2">{trimmed.slice(4)}</h3>)
    } else if (trimmed.startsWith("## ")) {
      flushList()
      elements.push(<h2 key={key++} className="text-[15px] font-bold text-[#111110] mt-5 mb-2">{trimmed.slice(3)}</h2>)
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(trimmed.slice(2))
    } else {
      flushList()
      elements.push(<p key={key++} className="text-[14px] text-[#1a1a1a]/70 leading-relaxed my-1">{trimmed}</p>)
    }
  }
  flushList()

  return elements
}

export default async function UpdatesPage() {
  const releases = await getReleases()

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-[720px] mx-auto px-6 pt-32 pb-24">

        {/* 헤더 */}
        <div className="mb-12">
          <p className="text-[11px] font-semibold text-[#084734] uppercase tracking-widest mb-3">Changelog</p>
          <h1 className="text-[32px] font-bold text-[#111110] tracking-[-0.03em] leading-tight mb-3">
            업데이트 내역
          </h1>
          <p className="text-[15px] text-[#1a1a1a]/50">
            Classin의 새 기능, 개선 사항, 버그 수정 내역을 확인하세요.
          </p>
        </div>

        {/* 릴리즈 없을 때 */}
        {releases.length === 0 && (
          <div className="bg-white rounded-2xl border border-[#e8e8e4] px-8 py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#f0f0ec] flex items-center justify-center mx-auto mb-4">
              <Tag className="w-5 h-5 text-[#1a1a1a]/30" />
            </div>
            <p className="text-[15px] font-semibold text-[#111110] mb-1">아직 공개된 업데이트가 없습니다</p>
            <p className="text-[13px] text-[#1a1a1a]/40">첫 번째 릴리즈를 기대해 주세요.</p>
          </div>
        )}

        {/* 릴리즈 목록 */}
        <div className="space-y-6">
          {releases.map((release, idx) => (
            <div
              key={release.id}
              className="relative bg-white rounded-2xl border border-[#e8e8e4] px-8 py-7 hover:border-[#c8c8c4] transition-colors"
            >
              {/* 최신 뱃지 */}
              {idx === 0 && (
                <span className="absolute top-5 right-6 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#084734] text-white uppercase tracking-wide">
                  Latest
                </span>
              )}

              {/* 태그 + 날짜 */}
              <div className="flex items-center gap-3 mb-3">
                <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#084734] bg-[#f0f7f4] px-2.5 py-1 rounded-lg">
                  <Tag className="w-3 h-3" />{release.tag_name}
                </span>
                <span className="flex items-center gap-1 text-[12px] text-[#1a1a1a]/35">
                  <Calendar className="w-3 h-3" />{formatDate(release.published_at)}
                </span>
              </div>

              {/* 제목 */}
              <h2 className="text-[18px] font-bold text-[#111110] tracking-[-0.02em] mb-4">
                {release.name || release.tag_name}
              </h2>

              {/* 본문 */}
              {release.body && (
                <div className="border-t border-[#f0f0ec] pt-4">
                  {renderBody(release.body)}
                </div>
              )}

              {/* GitHub 링크 */}
              <a
                href={release.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-5 text-[12px] text-[#1a1a1a]/35 hover:text-[#084734] transition-colors"
              >
                <ExternalLink className="w-3 h-3" />GitHub에서 보기
              </a>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
