import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import {
  ArrowRight,
  CircleHelp,
  Download,
  Headset,
  MessageCircle,
  MonitorSpeaker,
  Pencil,
  Search,
  Sparkles,
} from "lucide-react"

import { getDocsContent } from "@/lib/docs-content"
import { Reveal } from "@/components/landing/Reveal"
import { TrackedLink } from "@/components/TrackedLink"
import type { DocsArticleSummary } from "@/components/docs"
import { SearchHighlight } from "@/components/ui/SearchHighlight"
import { DocsSearchLogger } from "@/components/docs/DocsSearchLogger"
import { DocsAskChatbotButton } from "@/components/docs/DocsAskChatbotButton"

import {
  getAllDocsSummaries,
  getCuratedFeaturedSummaries,
  getGuideIntentCards,
  getGuideProductTiles,
  getInstallGuideLinks,
  scoreDocsArticle,
} from "./_utils"

const PAGE_DESCRIPTION =
  "도입 검토부터 수업 운영, 문제 해결까지 — 실제 사용 흐름 그대로 정리한 Classin 공식 가이드입니다."

export const metadata: Metadata = {
  title: "Classin 가이드",
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: "Classin 가이드",
    description: PAGE_DESCRIPTION,
    type: "website",
  },
}

interface DocsHomePageProps {
  searchParams?: Promise<{ q?: string }>
}

/** /download PlatformTile 과 같은 타일 그림자 레시피 */
const TILE_SHADOW = {
  boxShadow:
    "rgba(0,0,0,0.03) 0px 3px 14px, rgba(0,0,0,0.02) 0px 1.5px 6px, rgba(0,0,0,0.015) 0px 0.6px 2.2px",
}

const TILE_HOVER =
  "transition-shadow duration-300 hover:shadow-[rgba(0,0,0,0.05)_0px_8px_24px,rgba(0,0,0,0.03)_0px_2px_7px]"

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"

/** section-warm(#F6F5F4) 위에서는 ring offset 색을 밴드 배경에 맞춘다. */
const FOCUS_RING_WARM =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F6F5F4]"

const FOCUS_RING_WHITE =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-white"

const SECTION_EYEBROW = "text-[12px] font-semibold uppercase tracking-[0.14em] text-[#615D59]"

const SEARCH_CHIPS = ["설치", "녹화", "과제", "출결", "전자칠판"]

const PRODUCT_TILE_ICONS: Partial<Record<string, LucideIcon>> = {
  software: Pencil,
  hardware: MonitorSpeaker,
  updates: Sparkles,
}

function normalizeQuery(value?: string) {
  return value?.trim().toLowerCase() ?? ""
}

function GuideArticleRow({
  article,
  query,
  index,
}: {
  article: DocsArticleSummary
  query?: string
  index?: string
}) {
  const meta = [article.category, article.readTime].filter(Boolean).join(" · ")

  return (
    <li>
      <Link
        href={article.href}
        className={`group flex items-start gap-4 border-b border-black/[0.08] py-5 transition-colors ${FOCUS_RING}`}
      >
        {index ? (
          <span className="w-6 shrink-0 pt-0.5 text-[13px] font-semibold tabular-nums text-[#A39E98]">
            {index}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="break-keep text-[15px] font-semibold text-[#111110] group-hover:text-[#084734]">
            <SearchHighlight text={article.title} query={query} />
          </p>
          <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-[#615D59]">
            <SearchHighlight text={article.description} query={query} />
          </p>
          {meta ? <p className="mt-2 text-xs text-[#A39E98]">{meta}</p> : null}
        </div>
        <ArrowRight
          className="mt-1 h-4 w-4 shrink-0 text-transparent transition-all group-hover:translate-x-0.5 group-hover:text-[#084734]"
          aria-hidden
        />
      </Link>
    </li>
  )
}

export default async function DocsHomePage({ searchParams }: DocsHomePageProps) {
  const { q } = await (searchParams ?? Promise.resolve<{ q?: string }>({}))
  const docsContent = await getDocsContent()
  const allDocs = getAllDocsSummaries(docsContent)
  const query = normalizeQuery(q)
  const searchResults = query
    ? allDocs
        .map((doc) => ({ doc, score: scoreDocsArticle(doc, query) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.doc)
    : []

  const intentCards = getGuideIntentCards(docsContent)
  const productTiles = getGuideProductTiles(docsContent)
  const featuredArticles = getCuratedFeaturedSummaries(docsContent)
  const installLinks = getInstallGuideLinks(docsContent)

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#FAFAF8] pb-20 pt-28 text-[#111110] md:pb-24 md:pt-36">
      {query && <DocsSearchLogger query={query} resultCount={searchResults.length} />}

      {/* 히어로 뒤 글로우 — 넓은 면은 뉴트럴, 그린은 은은한 액센트로만 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px]"
      >
        <div className="absolute left-[-180px] top-[-220px] h-[480px] w-[720px] rounded-full bg-[#ECFDF5] opacity-60 blur-3xl" />
        <div className="absolute right-[4%] top-[180px] h-[260px] w-[260px] rounded-full bg-[#F6F5F4] opacity-90 blur-3xl" />
      </div>

      <section className="container">
        <p className="hero-soft-enter hero-soft-enter-badge text-[12px] font-semibold uppercase tracking-[0.14em] text-[#084734]">
          Classin Guide
        </p>
        <h1 className="hero-soft-enter hero-soft-enter-title mt-4 break-keep text-[2.35rem] font-black leading-[1.08] tracking-display sm:text-5xl md:text-6xl">
          필요한 안내를
          <br className="hidden md:block" />{" "}
          바로 찾으세요.
        </h1>
        <p className="hero-soft-enter hero-soft-enter-copy mt-5 max-w-2xl text-lg leading-8 text-[#615D59]">
          도입 검토부터 수업 운영, 문제 해결까지 — 실제 사용 흐름 그대로 정리한 공식 가이드입니다.
        </p>

        <form
          id="docs-search"
          action="/docs"
          method="get"
          className="hero-soft-enter hero-soft-enter-actions mt-8 flex max-w-2xl items-center gap-3 rounded-[12px] border border-black/[0.08] bg-white py-2 pl-5 pr-2 shadow-card focus-within:border-[#084734]/30"
        >
          <Search className="h-4 w-4 shrink-0 text-[#A39E98]" aria-hidden />
          <input
            name="q"
            defaultValue={q ?? ""}
            aria-label="가이드 전체 검색"
            placeholder="궁금한 기능이나 겪는 상황을 검색"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#A39E98]"
          />
          <button
            type="submit"
            className={`shrink-0 rounded-[8px] bg-[#084734] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#065c41] active:scale-[0.98] ${FOCUS_RING_WHITE}`}
          >
            검색
          </button>
        </form>

        <div className="hero-soft-enter hero-soft-enter-actions mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#A39E98]">자주 찾는 주제</span>
          {SEARCH_CHIPS.map((chip) => (
            <Link
              key={chip}
              href={`/docs?q=${encodeURIComponent(chip)}`}
              className={`rounded-full border border-black/[0.08] bg-white px-3 py-1 text-[12.5px] font-medium text-[#615D59] transition-colors hover:border-[#084734]/30 hover:text-[#084734] ${FOCUS_RING}`}
            >
              {chip}
            </Link>
          ))}
        </div>

        {query ? (
          <p className="mt-6 text-[12.5px] text-[#615D59]">
            “{q}” 검색 결과{" "}
            <span className="font-semibold text-[#084734]">{searchResults.length}개</span>
          </p>
        ) : (
          <p className="mt-6 text-[12.5px] text-[#A39E98]">
            지금 확인할 수 있는 가이드 {allDocs.length}개 · 채널톡 공식 가이드와 같은 흐름 · 계속
            업데이트
          </p>
        )}
      </section>

      {query && (
        <section className="container mt-12">
          <div className="border-t border-black/[0.08] pt-4">
            <p className={SECTION_EYEBROW}>검색 결과</p>
            {searchResults.length > 0 ? (
              <>
                <ul className="mt-2">
                  {searchResults.slice(0, 12).map((article) => (
                    <GuideArticleRow key={article.href} article={article} query={q} />
                  ))}
                </ul>
                {searchResults.length > 12 && (
                  <p className="mt-4 text-xs text-[#A39E98]">
                    관련도 상위 12개를 표시하고 있어요. 단어를 조금 더 구체적으로 하면 좁혀집니다.
                  </p>
                )}
              </>
            ) : (
              <div className="mt-4">
                <p className="text-sm leading-6 text-[#615D59]">
                  찾는 안내가 보이지 않습니다. 조금 더 짧은 단어로 검색해 보세요.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <DocsAskChatbotButton
                    prefill={q}
                    className={`inline-flex items-center gap-1 text-[13px] font-semibold text-[#084734] ${FOCUS_RING}`}
                  >
                    챗봇에게 바로 물어보기
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </DocsAskChatbotButton>
                  <TrackedLink
                    href="/contact"
                    ctaId="docs_support_contact"
                    className={`inline-flex items-center gap-1 text-[13px] font-semibold text-[#084734] ${FOCUS_RING}`}
                  >
                    도입·운영 상담
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </TrackedLink>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <Reveal as="section" className="container mt-16 md:mt-20">
        <p className={SECTION_EYEBROW}>어떤 상황이신가요</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
          {intentCards.map((card) => (
            <div
              key={card.categoryId}
              className={`rounded-[16px] border border-black/[0.08] bg-white p-6 ${TILE_HOVER}`}
              style={TILE_SHADOW}
            >
              <Image
                src={card.image}
                alt=""
                aria-hidden
                width={240}
                height={240}
                className="h-14 w-14"
              />
              <p className="mt-4 text-[11.5px] font-medium text-[#A39E98]">{card.kicker}</p>
              <Link
                href={card.href}
                className={`mt-0.5 block break-keep text-[17px] font-bold text-[#111110] transition-colors hover:text-[#084734] ${FOCUS_RING}`}
              >
                {card.title}
              </Link>
              <p className="mt-1.5 text-[13px] leading-5 text-[#615D59]">{card.description}</p>
              {card.links.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-black/[0.06] pt-3">
                  {card.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`block truncate text-[13px] font-medium text-[#31302E] transition-colors hover:text-[#084734] ${FOCUS_RING}`}
                    >
                      {link.title}
                    </Link>
                  ))}
                </div>
              )}
              <Link
                href={card.href}
                className={`group mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[#084734] ${FOCUS_RING}`}
              >
                전체 보기
                <ArrowRight
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </div>
          ))}
        </div>
      </Reveal>

      {productTiles.length > 0 && (
        <Reveal as="section" className="container mt-14 md:mt-16">
          <p className={SECTION_EYEBROW}>제품별로 깊이 보기</p>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
            {productTiles.map((tile) => {
              const TileIcon = PRODUCT_TILE_ICONS[tile.categoryId] ?? Sparkles

              return (
                <Link
                  key={tile.categoryId}
                  href={tile.href}
                  className={`group flex items-start justify-between gap-4 rounded-[12px] border border-black/[0.08] bg-white p-5 ${TILE_HOVER} ${FOCUS_RING}`}
                  style={TILE_SHADOW}
                >
                  <span className="min-w-0">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-black/[0.06] bg-[#F6F5F4] text-[#111110]">
                      <TileIcon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="mt-3.5 block text-[11.5px] font-medium text-[#A39E98]">
                      {tile.caption}
                    </span>
                    <span className="mt-0.5 block text-[15px] font-bold">{tile.label}</span>
                    <span className="mt-1 block text-[13px] leading-5 text-[#615D59]">
                      {tile.description}
                    </span>
                  </span>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-[#A39E98] transition-all group-hover:translate-x-0.5 group-hover:text-[#084734]"
                    aria-hidden
                  />
                </Link>
              )
            })}
          </div>
        </Reveal>
      )}

      {!query && featuredArticles.length > 0 && (
        <Reveal as="section" className="container mt-16 md:mt-24">
          <div className="border-t border-black/[0.08] pt-4">
            <p className={SECTION_EYEBROW}>먼저 보면 좋은 안내</p>
            <ul className="mt-2 grid gap-x-12 md:grid-cols-2">
              {featuredArticles.map((article, index) => (
                <GuideArticleRow
                  key={article.href}
                  article={article}
                  index={String(index + 1).padStart(2, "0")}
                />
              ))}
            </ul>
          </div>
        </Reveal>
      )}

      <Reveal as="section">
        <div className="section-warm mt-16 py-14 md:mt-24 md:py-16">
          <div className="container grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_380px]">
            <div>
              <p className={SECTION_EYEBROW}>설치가 필요하신가요</p>
              <h2 className="mt-3 break-keep text-[1.5rem] font-bold leading-[1.3] md:text-[1.75rem]">
                다운로드부터 첫 로그인까지, 5분이면 충분합니다.
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#615D59]">
                다운로드 페이지가 지금 쓰는 기기의 OS를 감지해 맞는 설치 파일을 안내합니다. 계정
                하나로 모든 기기에서 로그인돼요.
              </p>
              <div className="mt-6">
                <TrackedLink
                  href="/download"
                  ctaId="docs_install_download"
                  className={`inline-flex items-center gap-2 rounded-[8px] bg-[#084734] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#065c41] active:scale-[0.98] ${FOCUS_RING_WARM}`}
                >
                  <Download className="h-4 w-4" aria-hidden />
                  Classin 다운로드
                </TrackedLink>
              </div>
            </div>

            {installLinks.length > 0 && (
              <div
                className="rounded-[12px] border border-black/[0.08] bg-white p-5"
                style={TILE_SHADOW}
              >
                <p className="text-[11.5px] font-medium uppercase tracking-[0.14em] text-[#A39E98]">
                  설치 가이드
                </p>
                <div className="mt-3 divide-y divide-black/[0.06]">
                  {installLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`group flex items-center justify-between gap-3 py-2.5 text-[13.5px] font-medium text-[#31302E] transition-colors hover:text-[#084734] ${FOCUS_RING_WHITE}`}
                    >
                      <span className="truncate">{link.title}</span>
                      <ArrowRight
                        className="h-3.5 w-3.5 shrink-0 text-[#A39E98] transition-all group-hover:translate-x-0.5 group-hover:text-[#084734]"
                        aria-hidden
                      />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="container mt-16 md:mt-24">
        <p className={SECTION_EYEBROW}>그래도 해결되지 않았다면</p>
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
          <div
            className={`rounded-[12px] border border-black/[0.08] bg-white p-5 ${TILE_HOVER}`}
            style={TILE_SHADOW}
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-black/[0.06] bg-[#F6F5F4] text-[#111110]">
              <MessageCircle className="h-5 w-5" aria-hidden />
            </span>
            <p className="mt-3.5 text-[15px] font-bold text-[#111110]">챗봇에게 바로 묻기</p>
            <p className="mt-1 text-[13px] leading-5 text-[#615D59]">
              가이드 내용을 학원 상황에 맞춰 바로 답합니다.
            </p>
            <DocsAskChatbotButton
              className={`mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[#084734] ${FOCUS_RING}`}
            >
              바로 물어보기
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </DocsAskChatbotButton>
          </div>

          <div
            className={`rounded-[12px] border border-black/[0.08] bg-white p-5 ${TILE_HOVER}`}
            style={TILE_SHADOW}
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-black/[0.06] bg-[#F6F5F4] text-[#111110]">
              <CircleHelp className="h-5 w-5" aria-hidden />
            </span>
            <p className="mt-3.5 text-[15px] font-bold text-[#111110]">자주 묻는 질문</p>
            <p className="mt-1 text-[13px] leading-5 text-[#615D59]">
              요금, 계정, 수업 운영에서 자주 나오는 질문 모음.
            </p>
            <TrackedLink
              href="/faq"
              ctaId="docs_support_faq"
              className={`mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[#084734] ${FOCUS_RING}`}
            >
              FAQ 보기
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </TrackedLink>
          </div>

          <div
            className={`rounded-[12px] border border-black/[0.08] bg-white p-5 ${TILE_HOVER}`}
            style={TILE_SHADOW}
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-black/[0.06] bg-[#F6F5F4] text-[#111110]">
              <Headset className="h-5 w-5" aria-hidden />
            </span>
            <p className="mt-3.5 text-[15px] font-bold text-[#111110]">도입·운영 상담</p>
            <p className="mt-1 text-[13px] leading-5 text-[#615D59]">
              우리 학원에 맞는 구성이 궁금하다면 상담으로 이어보세요.
            </p>
            <TrackedLink
              href="/contact"
              ctaId="docs_support_contact"
              className={`mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[#084734] ${FOCUS_RING}`}
            >
              상담 남기기
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </TrackedLink>
          </div>
        </div>
      </Reveal>
    </div>
  )
}
