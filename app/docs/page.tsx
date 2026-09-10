import type { ReactElement } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import {
  ArrowRight,
  CircleHelp,
  Download,
  Headset,
  History,
  MessageCircle,
  MonitorSpeaker,
  Pencil,
  Search,
} from "lucide-react"

import { getDocsContent } from "@/lib/docs-content"
import { Reveal } from "@/components/landing/Reveal"
import { TrackedLink } from "@/components/TrackedLink"
import type { DocsArticleSummary } from "@/components/docs"
import { SearchHighlight } from "@/components/ui/SearchHighlight"
import { DocsSearchLogger } from "@/components/docs/DocsSearchLogger"
import { DocsAskChatbotButton } from "@/components/docs/DocsAskChatbotButton"
import {
  GuideJoinIcon,
  GuideOpsIcon,
  GuideReviewIcon,
  GuideTeachIcon,
} from "@/components/docs/GuideIntentIcons"

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

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"

/** section-warm(#F6F5F4) 위에서는 ring offset 색을 밴드 배경에 맞춘다. */
const FOCUS_RING_WARM =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F6F5F4]"

const SECTION_EYEBROW = "text-[12px] font-semibold uppercase tracking-[0.14em] text-[#615D59]"

/** 블록을 카드가 아니라 얇은 구분선으로 나눈다 — 채움 없이 위계를 만드는 방식. */
const RULE_BLOCK = "border-t border-black/[0.08] pt-5"

const SEARCH_CHIPS = ["설치", "녹화", "과제", "출결", "전자칠판"]

type IconComponent = (props: { className?: string }) => ReactElement

const INTENT_ICONS: Record<string, IconComponent> = {
  start: GuideReviewIcon,
  admin: GuideOpsIcon,
  teacher: GuideTeachIcon,
  student: GuideJoinIcon,
}

const PRODUCT_TILE_ICONS: Partial<Record<string, LucideIcon>> = {
  software: Pencil,
  hardware: MonitorSpeaker,
  updates: History,
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
        className={`group flex items-start gap-4 border-b border-black/[0.06] py-6 transition-colors ${FOCUS_RING}`}
      >
        {index ? (
          <span className="w-6 shrink-0 pt-1 text-[13px] font-semibold tabular-nums text-[#A39E98]">
            {index}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="break-keep text-[16px] font-semibold text-[#111110] group-hover:text-[#084734]">
            <SearchHighlight text={article.title} query={query} />
          </p>
          <p className="mt-1.5 line-clamp-2 break-words text-[15px] leading-[26px] text-[#4F4C49]">
            <SearchHighlight text={article.description} query={query} />
          </p>
          {meta ? <p className="mt-2.5 text-[13px] text-[#615D59]">{meta}</p> : null}
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
    <div className="min-h-screen bg-[#FAFAF8] pb-20 pt-28 text-[#111110] md:pb-24 md:pt-36">
      {query && <DocsSearchLogger query={query} resultCount={searchResults.length} />}

      {/* 텍스트 페이지라 /download 와 같은 1080 캡 — 1400 컨테이너는 시선 이동이 크다. */}
      <section className="container mx-auto max-w-[1080px] px-5">
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

        {/* 검색도 면을 두지 않는다 — 카테고리 페이지와 같은 밑줄 입력으로 두 화면을 맞춘다. */}
        <form
          id="docs-search"
          action="/docs"
          method="get"
          className="hero-soft-enter hero-soft-enter-actions mt-8 flex max-w-2xl items-center gap-3 border-b border-black/[0.08] pb-4 transition-colors focus-within:border-[#084734]/40"
        >
          <Search className="h-4 w-4 shrink-0 text-[#A39E98]" aria-hidden />
          <input
            name="q"
            defaultValue={q ?? ""}
            aria-label="가이드 전체 검색"
            placeholder="궁금한 기능이나 겪는 상황을 검색"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#A39E98]"
          />
          {/* 면은 없애되 히트 영역은 남긴다 — 여백이 없으면 글자 높이(약 20px)가 곧 터치 영역이 된다. */}
          <button
            type="submit"
            className={`-mr-2 shrink-0 rounded-[6px] px-2 py-2.5 text-sm font-semibold text-[#084734] ${FOCUS_RING}`}
          >
            검색
          </button>
        </form>

        <div className="hero-soft-enter hero-soft-enter-actions mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-xs text-[#615D59]">자주 찾는 주제</span>
          {SEARCH_CHIPS.map((chip) => (
            <Link
              key={chip}
              href={`/docs?q=${encodeURIComponent(chip)}`}
              className={`text-[13px] font-medium text-[#615D59] underline-offset-4 transition-colors hover:text-[#084734] hover:underline ${FOCUS_RING}`}
            >
              {chip}
            </Link>
          ))}
        </div>

        {query ? (
          <p className="mt-6 text-[13px] text-[#615D59]">
            “{q}” 검색 결과{" "}
            <span className="font-semibold text-[#084734]">{searchResults.length}개</span>
          </p>
        ) : (
          <p className="mt-6 text-[13px] text-[#615D59]">
            지금 확인할 수 있는 가이드 {allDocs.length}개 · 채널톡 공식 가이드와 같은 흐름 · 계속
            업데이트
          </p>
        )}
      </section>

      {query && (
        <section className="container mx-auto max-w-[1080px] px-5 mt-12">
          {/* 카드를 걷어낸 자리에 읽기 너비만 남긴다 — 박스가 없으면 설명이 컨테이너 끝까지 늘어진다. */}
          <div className="max-w-[880px] border-t border-black/[0.08] pt-4">
            <p className={SECTION_EYEBROW}>검색 결과</p>
            {searchResults.length > 0 ? (
              <>
                <ul className="mt-2">
                  {searchResults.slice(0, 12).map((article) => (
                    <GuideArticleRow key={article.href} article={article} query={q} />
                  ))}
                </ul>
                {searchResults.length > 12 && (
                  <p className="mt-4 text-[13px] text-[#615D59]">
                    관련도 상위 12개를 표시하고 있어요. 단어를 조금 더 구체적으로 하면 좁혀집니다.
                  </p>
                )}
              </>
            ) : (
              <div className="mt-4">
                <p className="text-[15px] leading-[26px] text-[#615D59]">
                  찾는 안내가 보이지 않습니다. 조금 더 짧은 단어로 검색해 보세요.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <DocsAskChatbotButton
                    prefill={q}
                    className={`inline-flex items-center gap-1 text-[14px] font-semibold text-[#084734] ${FOCUS_RING}`}
                  >
                    챗봇에게 바로 물어보기
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </DocsAskChatbotButton>
                  <TrackedLink
                    href="/contact"
                    ctaId="docs_support_contact"
                    className={`inline-flex items-center gap-1 text-[14px] font-semibold text-[#084734] ${FOCUS_RING}`}
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

      {/* 상황별 진입 — 카드에 담지 않고 규칙선 아래로 흐르게 둔다. */}
      <Reveal as="section" className="container mx-auto max-w-[1080px] px-5 mt-16 md:mt-20">
        <p className={`${SECTION_EYEBROW} mb-5`}>어떤 상황이신가요</p>
        <div className="grid gap-x-8 gap-y-9 sm:grid-cols-2 xl:grid-cols-4">
          {intentCards.map((card) => {
            const Icon = INTENT_ICONS[card.categoryId]

            return (
              <div key={card.categoryId} className={RULE_BLOCK}>
                {Icon ? <Icon className="h-5 w-5 text-[#084734]" /> : null}
                <p className="mt-3.5 text-[12px] font-medium text-[#615D59]">{card.kicker}</p>
                <Link
                  href={card.href}
                  className={`mt-1 block break-keep text-[16px] font-bold text-[#111110] transition-colors hover:text-[#084734] ${FOCUS_RING}`}
                >
                  {card.title}
                </Link>
                <p className="mt-1.5 text-[14px] leading-[22px] text-[#615D59]">{card.description}</p>
                {card.links.length > 0 && (
                  <div className="mt-4 space-y-2.5">
                    {card.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`block truncate text-[14px] text-[#31302E] transition-colors hover:text-[#084734] ${FOCUS_RING}`}
                      >
                        {link.title}
                      </Link>
                    ))}
                  </div>
                )}
                <Link
                  href={card.href}
                  className={`group mt-4 inline-flex items-center gap-1 text-[14px] font-semibold text-[#084734] ${FOCUS_RING}`}
                >
                  전체 보기
                  <ArrowRight
                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </div>
            )
          })}
        </div>
      </Reveal>

      {productTiles.length > 0 && (
        <Reveal as="section" className="container mx-auto max-w-[1080px] px-5 mt-16 md:mt-20">
          <p className={`${SECTION_EYEBROW} mb-2`}>제품별로 깊이 보기</p>
          <div className="divide-y divide-black/[0.06] border-t border-black/[0.08]">
            {productTiles.map((tile) => {
              const TileIcon = PRODUCT_TILE_ICONS[tile.categoryId] ?? History

              return (
                <Link
                  key={tile.categoryId}
                  href={tile.href}
                  className={`group flex items-center gap-4 py-5 ${FOCUS_RING}`}
                >
                  <TileIcon className="h-5 w-5 shrink-0 text-[#084734]" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-bold text-[#111110] transition-colors group-hover:text-[#084734]">
                      {tile.label}
                    </span>
                    <span className="mt-1 block text-[14px] leading-[22px] text-[#615D59]">
                      {tile.description}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-[12px] text-[#615D59] sm:block">
                    {tile.caption}
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
        <Reveal as="section" className="container mx-auto max-w-[1080px] px-5 mt-16 md:mt-24">
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
          <div className="container mx-auto max-w-[1080px] px-5 grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_360px]">
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
                  className={`inline-flex items-center gap-2 rounded-[6px] bg-[#084734] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#065c41] active:scale-[0.98] ${FOCUS_RING_WARM}`}
                >
                  <Download className="h-4 w-4" aria-hidden />
                  Classin 다운로드
                </TrackedLink>
              </div>
            </div>

            {installLinks.length > 0 && (
              <div className="border-t border-black/[0.08] pt-4 md:mt-1">
                <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#615D59]">
                  설치 가이드
                </p>
                <div className="mt-1 divide-y divide-black/[0.06]">
                  {installLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`group flex items-center justify-between gap-3 py-3 text-[14px] text-[#31302E] transition-colors hover:text-[#084734] ${FOCUS_RING_WARM}`}
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

      <Reveal as="section" className="container mx-auto max-w-[1080px] px-5 mt-16 md:mt-24">
        <p className={`${SECTION_EYEBROW} mb-5`}>그래도 해결되지 않았다면</p>
        <div className="grid gap-x-8 gap-y-9 sm:grid-cols-3">
          <div className={RULE_BLOCK}>
            <MessageCircle className="h-5 w-5 text-[#084734]" aria-hidden />
            <p className="mt-3.5 text-[16px] font-bold text-[#111110]">챗봇에게 바로 묻기</p>
            <p className="mt-1.5 text-[14px] leading-[22px] text-[#615D59]">
              가이드 내용을 학원 상황에 맞춰 바로 답합니다.
            </p>
            <DocsAskChatbotButton
              className={`mt-4 inline-flex items-center gap-1 text-[14px] font-semibold text-[#084734] ${FOCUS_RING}`}
            >
              바로 물어보기
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </DocsAskChatbotButton>
          </div>

          <div className={RULE_BLOCK}>
            <CircleHelp className="h-5 w-5 text-[#084734]" aria-hidden />
            <p className="mt-3.5 text-[16px] font-bold text-[#111110]">자주 묻는 질문</p>
            <p className="mt-1.5 text-[14px] leading-[22px] text-[#615D59]">
              요금, 계정, 수업 운영에서 자주 나오는 질문 모음.
            </p>
            <TrackedLink
              href="/faq"
              ctaId="docs_support_faq"
              className={`mt-4 inline-flex items-center gap-1 text-[14px] font-semibold text-[#084734] ${FOCUS_RING}`}
            >
              FAQ 보기
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </TrackedLink>
          </div>

          <div className={RULE_BLOCK}>
            <Headset className="h-5 w-5 text-[#084734]" aria-hidden />
            <p className="mt-3.5 text-[16px] font-bold text-[#111110]">도입·운영 상담</p>
            <p className="mt-1.5 text-[14px] leading-[22px] text-[#615D59]">
              우리 학원에 맞는 구성이 궁금하다면 상담으로 이어보세요.
            </p>
            <TrackedLink
              href="/contact"
              ctaId="docs_support_contact"
              className={`mt-4 inline-flex items-center gap-1 text-[14px] font-semibold text-[#084734] ${FOCUS_RING}`}
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
