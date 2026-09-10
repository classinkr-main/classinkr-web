import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Search } from "lucide-react"
import { getDocsContent } from "@/lib/docs-content"
import { SearchHighlight } from "@/components/ui/SearchHighlight"
import { DocsSearchLogger } from "@/components/docs/DocsSearchLogger"
import { getAllDocsSummaries, scoreDocsArticle } from "../_utils"

const DOCS_CONTACT_HREF = `/contact?topic=${encodeURIComponent("계정/접속/기술 지원")}&prefill=${encodeURIComponent("가이드에서 찾지 못한 내용을 문의하고 싶습니다.")}#contact-form`

export const metadata: Metadata = {
  title: "가이드 검색",
  description: "Classin 가이드 문서를 검색하세요.",
  // 검색 결과 페이지는 색인하지 않는다 (중복/얕은 콘텐츠 방지).
  robots: { index: false, follow: true },
}

interface DocsSearchPageProps {
  searchParams?: Promise<{ q?: string }>
}

export default async function DocsSearchPage({ searchParams }: DocsSearchPageProps) {
  const { q } = await (searchParams ?? Promise.resolve<{ q?: string }>({}))
  const query = (q ?? "").trim()

  const docsContent = await getDocsContent()
  const allDocs = getAllDocsSummaries(docsContent)
  const results = query
    ? allDocs
        .map((doc) => ({ doc, score: scoreDocsArticle(doc, query) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.doc)
    : []

  return (
    <div className="min-h-screen bg-[#FAFAF8] pb-20 pt-28 text-[#111110] md:pb-24 md:pt-36">
      {query && <DocsSearchLogger query={query} resultCount={results.length} />}

      <section className="container mx-auto max-w-[1080px] px-5">
        <div className="max-w-3xl">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 text-sm text-[#615D59] transition-colors hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            가이드 홈으로
          </Link>
          <h1 className="mt-5 text-[2rem] font-black leading-[1.1] tracking-display md:text-4xl">
            가이드 검색
          </h1>

          <form
            action="/docs/search"
            method="get"
            className="mt-7 flex items-center gap-3 border-b border-black/[0.08] pb-4 transition-colors focus-within:border-[#084734]/40"
          >
            <Search className="h-4 w-4 shrink-0 text-[#A39E98]" aria-hidden />
            <input
              name="q"
              defaultValue={query}
              autoFocus
              aria-label="가이드 전체 검색"
              placeholder="궁금한 기능, 수업 준비, 문제 상황 검색"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#A39E98]"
            />
            <button
              type="submit"
              className="-mr-2 shrink-0 rounded-[6px] px-2 py-2.5 text-sm font-semibold text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
            >
              검색
            </button>
          </form>

          {query && (
            <p className="mt-4 text-sm text-[#615D59]">
              “{query}” 검색 결과 {results.length}개
            </p>
          )}
        </div>

        <div className="mt-9 max-w-3xl">
          {!query ? (
            <p className="text-[15px] leading-7 text-[#615D59]">
              찾으시는 기능이나 상황을 입력해 보세요. 도입 준비, 수업 운영, 문제 해결까지
              가이드 전체에서 검색합니다.
            </p>
          ) : results.length === 0 ? (
            <div className="rounded-lg border border-black/[0.08] bg-white p-6">
              <p className="text-[15px] font-semibold text-[#111110]">
                “{query}”에 대한 결과를 찾지 못했습니다.
              </p>
              <p className="mt-2 text-sm leading-6 text-[#615D59]">
                다른 키워드로 검색하시거나, 아래에서 바로 상담을 남겨주세요. 검색하신 내용은
                가이드 보강 우선순위에 반영됩니다.
              </p>
              <Link
                href={DOCS_CONTACT_HREF}
                className="mt-4 inline-flex items-center gap-2 rounded-[6px] bg-[#084734] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#065c41] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
              >
                상담 남기기
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {results.map((doc) => (
                <li key={doc.href}>
                  <Link
                    href={doc.href}
                    className="group block rounded-lg border border-black/[0.08] bg-white p-5 transition-colors hover:border-[#084734]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
                  >
                    <div className="flex items-center gap-2 text-[13px] text-[#615D59]">
                      {doc.category && <span>{doc.category}</span>}
                      {doc.category && <span>·</span>}
                      <span>{doc.readTime}</span>
                    </div>
                    <h2 className="mt-2 text-[16px] font-semibold tracking-[-0.02em] text-[#111110]">
                      <SearchHighlight text={doc.title} query={query} />
                    </h2>
                    <p className="mt-1.5 line-clamp-2 text-[15px] leading-[26px] text-[#615D59]">
                      <SearchHighlight text={doc.description} query={query} />
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
