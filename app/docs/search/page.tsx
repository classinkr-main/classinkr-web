import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CornerDownRight, Search } from "lucide-react"
import { getDocsContent } from "@/lib/docs-content"
import {
  DOCS_POPULAR_SEARCHES,
  searchDocs,
  suggestDocsQueries,
  type DocsSearchResult,
} from "@/lib/docs-search"
import { SearchHighlight } from "@/components/ui/SearchHighlight"
import type { DocsArticleSummary } from "@/components/docs"
import { DocsAskChatbotButton } from "@/components/docs/DocsAskChatbotButton"
import { DocsKindLabel, DocsListThumbnail } from "@/components/docs/DocsListRow"
import { DocsSearchLogger } from "@/components/docs/DocsSearchLogger"
import { getAllDocsSummaries, readQuery, type DocsSearchParams } from "../_utils"

const DOCS_CONTACT_HREF = `/contact?topic=${encodeURIComponent("계정/접속/기술 지원")}&prefill=${encodeURIComponent("가이드에서 찾지 못한 내용을 문의하고 싶습니다.")}#contact-form`

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"

const SECTION_EYEBROW = "text-[12px] font-semibold uppercase tracking-[0.14em] text-[#615D59]"

const TEXT_ACTION = `inline-flex items-center gap-1 text-[14px] font-semibold text-[#084734] ${FOCUS_RING}`

export const metadata: Metadata = {
  title: "가이드 검색",
  description: "클래스인 가이드를 기능 이름이나 지금 겪는 상황으로 검색합니다.",
  // 검색 결과 페이지는 색인하지 않는다 (중복/얕은 콘텐츠 방지).
  robots: { index: false, follow: true },
}

interface DocsSearchPageProps {
  searchParams?: Promise<DocsSearchParams>
}

function searchHref(query: string) {
  return `/docs/search?q=${encodeURIComponent(query)}`
}

function SearchResultRow({ result }: { result: DocsSearchResult<DocsArticleSummary> }) {
  const { doc, sections, highlight } = result
  const meta = [doc.category, doc.readTime, doc.imageCount ? `사진 ${doc.imageCount}장` : ""].filter(
    Boolean
  )
  const showKind = Boolean(doc.kind && doc.kind !== "howto")

  return (
    <li className="group flex items-start gap-4 border-b border-black/[0.06] py-6 transition-colors duration-150 hover:border-black/[0.16]">
      <div className="min-w-0 flex-1">
        <Link href={doc.href} className={`block rounded-[4px] ${FOCUS_RING}`}>
          <span className="block break-keep text-[16px] font-semibold leading-snug text-[#111110] transition-colors duration-150 group-hover:text-[#084734]">
            <SearchHighlight text={doc.title} query={highlight} />
          </span>
          <span className="mt-1.5 line-clamp-2 block break-words text-[15px] leading-[26px] text-[#4F4C49]">
            <SearchHighlight text={doc.description} query={highlight} />
          </span>
        </Link>

        {showKind || meta.length > 0 ? (
          <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-[#615D59]">
            {showKind ? <DocsKindLabel kind={doc.kind} /> : null}
            {meta.map((item, index) => (
              <span key={item} className="inline-flex items-center gap-x-1.5">
                {showKind || index > 0 ? <span aria-hidden>·</span> : null}
                {item}
              </span>
            ))}
          </p>
        ) : null}

        {sections.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1.5 text-[13px] leading-6">
            <span className="text-[#615D59]">이 부분에 있어요:</span>
            {sections.map((section) => (
              <Link
                key={section.id}
                href={`${doc.href}#${section.id}`}
                aria-label={`${doc.title} — ${section.title}`}
                className={`inline-flex min-w-0 max-w-full items-baseline gap-1 rounded-[4px] font-medium text-[#084734] underline decoration-[#084734]/25 underline-offset-4 transition-colors hover:decoration-[#084734] ${FOCUS_RING}`}
              >
                <CornerDownRight className="h-3.5 w-3.5 shrink-0 translate-y-[2px]" aria-hidden />
                <span className="break-keep">{section.title}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {doc.thumbnail ? (
        <Link
          href={doc.href}
          tabIndex={-1}
          aria-hidden
          className="mt-0.5 hidden w-[128px] shrink-0 sm:block"
        >
          <DocsListThumbnail thumbnail={doc.thumbnail} />
        </Link>
      ) : null}
    </li>
  )
}

function TopicLinks({ label, topics }: { label: string; topics: readonly string[] }) {
  if (topics.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-xs text-[#615D59]">{label}</span>
      {topics.map((topic) => (
        <Link
          key={topic}
          href={searchHref(topic)}
          className={`rounded-[4px] text-[13px] font-medium text-[#615D59] underline-offset-4 transition-colors hover:text-[#084734] hover:underline ${FOCUS_RING}`}
        >
          {topic}
        </Link>
      ))}
    </div>
  )
}

function AskActions({ query }: { query: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <DocsAskChatbotButton prefill={query || undefined} className={TEXT_ACTION}>
        챗봇에게 물어보기
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </DocsAskChatbotButton>
      <Link href={DOCS_CONTACT_HREF} className={TEXT_ACTION}>
        상담 남기기
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  )
}

export default async function DocsSearchPage({ searchParams }: DocsSearchPageProps) {
  const { q } = await (searchParams ?? Promise.resolve<DocsSearchParams>({}))
  const query = readQuery(q)

  const docsContent = await getDocsContent()
  const allDocs = getAllDocsSummaries(docsContent)
  const results = query ? searchDocs(allDocs, query) : []
  const suggestions = query && results.length === 0 ? suggestDocsQueries(query, allDocs) : []
  // 자주 찾는 주제는 지금 문서로 결과가 나오는 것만 보인다(운영 DB 문서가 바뀌어도 빈 검색이 없게).
  const popularTopics =
    !query || results.length === 0
      ? DOCS_POPULAR_SEARCHES.filter((topic) => searchDocs(allDocs, topic, { sectionLimit: 0 }).length > 0)
      : []

  return (
    <div className="min-h-screen bg-[#FAFAF8] pb-20 pt-28 text-[#111110] md:pb-24 md:pt-36">
      {query && <DocsSearchLogger query={query} resultCount={results.length} />}

      <section className="container mx-auto max-w-[1080px] px-5">
        <div className="max-w-[880px]">
          <Link
            href="/docs"
            className={`inline-flex items-center gap-2 rounded-[4px] text-sm text-[#615D59] transition-colors hover:text-[#084734] ${FOCUS_RING}`}
          >
            <ArrowRight className="h-4 w-4 rotate-180" aria-hidden />
            가이드 홈으로
          </Link>
          <h1 className="mt-5 text-[2rem] font-black leading-[1.1] tracking-display md:text-4xl">
            가이드 검색
          </h1>

          <form
            action="/docs/search"
            method="get"
            role="search"
            className="mt-7 flex items-center gap-3 border-b border-black/[0.08] pb-4 transition-colors focus-within:border-[#084734]/40"
          >
            <Search className="h-4 w-4 shrink-0 text-[#A39E98]" aria-hidden />
            <input
              name="q"
              defaultValue={query}
              autoFocus={!query}
              enterKeyHint="search"
              aria-label="가이드 전체 검색"
              placeholder="예: 로그인이 안 돼요, 비밀번호 변경"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#A39E98]"
            />
            <button
              type="submit"
              className={`-mr-2 shrink-0 rounded-[6px] px-2 py-2.5 text-sm font-semibold text-[#084734] ${FOCUS_RING}`}
            >
              검색
            </button>
          </form>

          {query ? (
            <p className="mt-4 text-[13px] text-[#615D59]">
              “{query}” 검색 결과{" "}
              <span className="font-semibold text-[#084734]">{results.length}개</span>
            </p>
          ) : (
            <p className="mt-4 text-[15px] leading-7 text-[#615D59]">
              기능 이름이나 지금 겪는 상황을 그대로 입력하세요. ‘녹화가 안 돼요’, ‘학생 추가’처럼
              띄어쓰기가 달라도 찾아 드립니다.
            </p>
          )}

          {!query ? (
            <div className="mt-6">
              <TopicLinks label="자주 찾는 주제" topics={popularTopics} />
            </div>
          ) : null}
        </div>

        {query && results.length > 0 ? (
          <div className="mt-10 max-w-[880px] border-t border-black/[0.08] pt-4">
            <h2 className={SECTION_EYEBROW}>검색 결과</h2>
            <ul className="mt-2">
              {results.map((result) => (
                <SearchResultRow key={result.doc.href} result={result} />
              ))}
            </ul>
            <div className="mt-8">
              <p className="text-[14px] leading-[22px] text-[#615D59]">
                찾는 내용이 없나요? 지금 상황을 그대로 물어보세요.
              </p>
              <div className="mt-3">
                <AskActions query={query} />
              </div>
            </div>
          </div>
        ) : null}

        {query && results.length === 0 ? (
          <div className="mt-10 max-w-[880px] border-t border-black/[0.08] pt-6">
            <h2 className="text-[17px] font-semibold text-[#111110]">
              “{query}”에 맞는 가이드를 찾지 못했습니다.
            </h2>

            {suggestions.length > 0 ? (
              <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2 text-[15px]">
                <span className="text-[#615D59]">이 검색어로 찾아보세요:</span>
                {suggestions.map((suggestion) => (
                  <Link
                    key={suggestion}
                    href={searchHref(suggestion)}
                    className={`rounded-[4px] font-semibold text-[#084734] underline decoration-[#084734]/25 underline-offset-4 transition-colors hover:decoration-[#084734] ${FOCUS_RING}`}
                  >
                    {suggestion}
                  </Link>
                ))}
              </p>
            ) : null}

            <p className="mt-4 text-[14px] leading-[22px] text-[#615D59]">
              더 짧은 단어로 다시 검색하거나, 챗봇에 지금 상황을 그대로 물어보세요. 결과가 없었던
              검색어는 따로 모아 다음 가이드를 쓸 때 참고합니다.
            </p>
            <div className="mt-5">
              <AskActions query={query} />
            </div>

            <div className="mt-10 border-t border-black/[0.08] pt-5">
              <TopicLinks label="자주 찾는 주제" topics={popularTopics} />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
