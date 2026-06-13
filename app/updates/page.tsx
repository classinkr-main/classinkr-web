import type { Metadata } from "next"
import Link from "next/link"
import { getReleases } from "@/lib/github"
import { getPublishedPostsForStaticSitemap } from "@/lib/repositories/blog"
import { ExternalLink, Tag, Calendar, ArrowRight } from "lucide-react"
import { createPublicMetadata } from "@/lib/seo"

export const revalidate = 3600

export const metadata: Metadata = createPublicMetadata({
  title: "업데이트",
  description: "Classin의 최신 업데이트 및 변경 내역을 확인하세요.",
  path: "/updates",
})

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

  // 릴리즈가 아직 없으면 블로그 '제품 업데이트' 카테고리 글로 폴백 — 빈 페이지 노출 방지
  const fallbackPosts =
    releases.length === 0
      ? (await getPublishedPostsForStaticSitemap().catch(() => []))
          .filter((post) => post.category === "제품 업데이트")
          .slice(0, 6)
      : []

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="mx-auto max-w-[720px] px-4 pb-20 pt-28 sm:px-6 md:pb-24 md:pt-32">

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

        {/* 릴리즈 없을 때: 블로그 '제품 업데이트' 글 폴백 → 둘 다 없으면 빈 상태 */}
        {releases.length === 0 && fallbackPosts.length > 0 && (
          <div className="space-y-4">
            <p className="text-[13px] text-[#1a1a1a]/45">
              정식 릴리즈 노트를 준비하고 있습니다. 최근 제품 업데이트 소식을 먼저 확인해 보세요.
            </p>
            {fallbackPosts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block rounded-2xl border border-[#e8e8e4] bg-white px-5 py-5 transition-colors hover:border-[#c8c8c4] sm:px-8 sm:py-6"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-lg bg-[#f0f7f4] px-2.5 py-1 text-[12px] font-bold text-[#084734]">
                    <Tag className="h-3 w-3" />제품 업데이트
                  </span>
                  <span className="flex items-center gap-1 text-[12px] text-[#1a1a1a]/35">
                    <Calendar className="h-3 w-3" />{post.date}
                  </span>
                </div>
                <h2 className="mb-1.5 text-[17px] font-bold tracking-[-0.02em] text-[#111110]">
                  {post.title}
                </h2>
                <p className="line-clamp-2 text-[14px] leading-relaxed text-[#1a1a1a]/55">
                  {post.excerpt}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[#084734]">
                  자세히 보기
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        )}

        {releases.length === 0 && fallbackPosts.length === 0 && (
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
              className="relative rounded-2xl border border-[#e8e8e4] bg-white px-5 py-6 transition-colors hover:border-[#c8c8c4] sm:px-8 sm:py-7"
            >
              {/* 최신 뱃지 */}
              {idx === 0 && (
                <span className="mb-3 inline-flex rounded-full bg-[#084734] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white sm:absolute sm:right-6 sm:top-5 sm:mb-0">
                  Latest
                </span>
              )}

              {/* 태그 + 날짜 */}
              <div className="mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
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
