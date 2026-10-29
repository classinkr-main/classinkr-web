import type { ReactElement } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import {
  ArrowRight,
  ArrowUpRight,
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
import { pickRecentlyUpdated } from "@/lib/docs-list-meta"
import { createPublicMetadata } from "@/lib/seo"
import { TrackedLink } from "@/components/TrackedLink"
import type { DocsArticleSummary } from "@/components/docs"
import { DocsSearchLogger } from "@/components/docs/DocsSearchLogger"
import { DocsAskChatbotButton } from "@/components/docs/DocsAskChatbotButton"
import { DocsCompactRow, DocsListRow } from "@/components/docs/DocsListRow"
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
  getTroubleshootingLinks,
  readQuery,
  scoreDocsArticle,
  withSearchNoIndex,
  type DocsSearchParams,
} from "./_utils"

const PAGE_DESCRIPTION =
  "클래스인 설치와 가입부터 코스 개설, 수업 진행, 전자칠판 사용법까지 원장·강사·학생이 각자 찾아보는 공식 가이드입니다."

interface DocsHomePageProps {
  searchParams?: Promise<DocsSearchParams>
}

// canonical 은 쿼리 없는 /docs 로 고정한다. 검색어가 붙은 URL 은 색인에서 뺀다(/docs/search 와 같은 정책).
export async function generateMetadata({ searchParams }: DocsHomePageProps): Promise<Metadata> {
  const { q } = await (searchParams ?? Promise.resolve<DocsSearchParams>({}))

  // "Classin 가이드" 는 루트 템플릿과 만나 "Classin 가이드 | Classin" 으로 브랜드가 겹친다. 검색어로 많이 쓰는
  // "클래스인 사용법"·"문제 해결" 을 제목에 두고 브랜드는 템플릿 접미사 한 번만 남긴다.
  return withSearchNoIndex(
    createPublicMetadata({
      title: "클래스인 사용법·문제 해결 가이드",
      description: PAGE_DESCRIPTION,
      path: "/docs",
    }),
    readQuery(q)
  )
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"

/** section-warm(#F6F5F4) 위에서는 ring offset 색을 밴드 배경에 맞춘다. */
const FOCUS_RING_WARM =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F6F5F4]"

const SECTION_EYEBROW = "text-[12px] font-semibold uppercase tracking-[0.14em] text-[#615D59]"

/** 블록을 카드가 아니라 얇은 구분선으로 나눈다 — 채움 없이 위계를 만드는 방식. */
const RULE_BLOCK = "border-t border-black/[0.08] pt-5"

// 채널톡 상담·가이드 검색 상위 주제(2026-09 기준): 비밀번호·로그인(번호 형식)·설치·녹화·EDB.
const SEARCH_CHIPS = ["설치", "로그인", "비밀번호", "녹화", "EDB"]

// 문제 해결 문서는 docType "troubleshooting" 인 공개 문서를 자동으로 모은다(발행 전 문서는 빠진다).
// 앞쪽 순서만 실제 문의가 많은 증상 순으로 고정하고, 나머지는 문서 순서를 따른다.
const TROUBLESHOOTING_ORDER = [
  "/docs/start/login-troubleshooting",
  "/docs/start/class-connection-troubleshooting",
  "/docs/start/camera-mic-troubleshooting",
  "/docs/start/app-update-cache-reinstall",
]
// 히어로 한 줄 바로가기는 짧은 증상 이름으로 보인다. 없는 문서는 제목에서 괄호 설명을 떼어 쓴다.
const TROUBLESHOOTING_SHORT_LABELS: Record<string, string> = {
  "/docs/start/login-troubleshooting": "로그인",
  "/docs/start/class-connection-troubleshooting": "수업 끊김",
  "/docs/start/camera-mic-troubleshooting": "카메라·마이크",
  "/docs/start/app-update-cache-reinstall": "앱 멈춤",
  "/docs/start/pc-install-troubleshooting": "PC 설치",
  "/docs/teacher/recording-troubleshooting": "수업 녹화",
  "/docs/admin/recording-file-troubleshooting": "녹화본 내려받기",
  "/docs/admin/replay-troubleshooting": "다시보기",
  "/docs/student/homework-submit-troubleshooting": "숙제 제출",
}
// 히어로 아래 한 줄 바로가기에는 앞에서부터 이만큼만 보인다. 전체 목록은 아래 "문제가 생겼을 때" 묶음에 있다.
const HERO_TROUBLESHOOTING_LIMIT = 4

// 처음 쓰는 학생·강사가 가장 많이 막히는 순서(설치 → 가입 → 코스 참여). 실제 공개 문서만 가리킨다.
// 제목·설명은 이 순서에 맞게 다시 쓰고, 유형·사진 미리보기는 실제 문서에서 가져온다.
const START_STEPS: Array<Pick<DocsArticleSummary, "title" | "description" | "href">> = [
  {
    title: "클래스인 설치하기",
    description:
      "PC는 다운로드 페이지에서 설치 파일을 받습니다. 휴대폰·태블릿은 앱 스토어나 플레이 스토어에서 '클래스인(Classin)'을 검색해 설치하고, 자세한 순서는 모바일 설치 가이드에 있습니다.",
    href: "/docs/start/pc-install",
  },
  {
    title: "회원 가입하기",
    description:
      "휴대폰 번호로 가입할 때는 국가번호 +82를 고르고, 010의 맨 앞 0을 빼서 10으로 시작하게 입력합니다. 받은 인증코드까지 넣어야 가입이 끝납니다.",
    href: "/docs/start/signup",
  },
  {
    title: "학원이 보낸 코스에 들어가기",
    description:
      "학원에서 받은 초대 링크나 QR, 코스명으로 코스에 참여합니다. 수업이 안 보이면 학원에 알려 준 번호나 이메일로 로그인했는지 먼저 확인하세요.",
    href: "/docs/student/course-join",
  },
]

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

const FEATURE_GUIDES = [
  {
    title: "클래스인 기능 소개서",
    href: "/classin-feature-guide.html",
    ctaId: "docs_feature_guide",
  },
  {
    title: "클래스인 AI 기능 소개서",
    href: "/classin-ai-feature-guide.html",
    ctaId: "docs_ai_feature_guide",
  },
] as const

export default async function DocsHomePage({ searchParams }: DocsHomePageProps) {
  const { q: rawQ } = await (searchParams ?? Promise.resolve<DocsSearchParams>({}))
  const q = readQuery(rawQ)
  const docsContent = await getDocsContent()
  const allDocs = getAllDocsSummaries(docsContent)
  const query = q.toLowerCase()
  const searchResults = query
    ? allDocs
        .map((doc) => ({ doc, score: scoreDocsArticle(doc, query) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.doc)
    : []

  const intentCards = getGuideIntentCards(docsContent)
  const productTiles = getGuideProductTiles(docsContent)
  const installLinks = getInstallGuideLinks(docsContent)
  const troubleshootingLinks = getTroubleshootingLinks(
    docsContent,
    TROUBLESHOOTING_ORDER,
    TROUBLESHOOTING_SHORT_LABELS
  )

  // 순서 안내 문구는 그대로 두고, 유형·사진 미리보기는 공개 중인 실제 문서에서 가져온다(비공개면 단계에서 뺀다).
  const docsByHref = new Map(allDocs.map((doc) => [doc.href, doc]))
  const startSteps = START_STEPS.flatMap((step) => {
    const doc = docsByHref.get(step.href)
    return doc ? [{ ...doc, title: step.title, description: step.description }] : []
  })

  // 문제 해결 문서는 위 묶음에 따로 있으니 최근 목록에서는 빼고, 추천은 화면에 이미 나온 문서를 건너뛴다.
  const recentDocs = pickRecentlyUpdated(allDocs, { limit: 6, excludeKinds: ["troubleshooting"] })
  const shownHrefs = new Set([
    ...startSteps.map((step) => step.href),
    ...troubleshootingLinks.map((link) => link.href),
    ...recentDocs.map((doc) => doc.href),
  ])
  const featuredArticles = getCuratedFeaturedSummaries(docsContent, 6, shownHrefs)

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
          설치부터 코스 개설, 수업 중에 생기는 문제까지 역할별로 나눠 두었습니다. 검색하거나
          아래에서 지금 상황을 고르세요.
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
            defaultValue={q}
            aria-label="가이드 전체 검색"
            placeholder="예: 학생 추가, 비밀번호 변경"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#78736D]"
          />
          {/* 면은 없애되 히트 영역은 남긴다 — 여백이 없으면 글자 높이(약 20px)가 곧 터치 영역이 된다. */}
          <button
            type="submit"
            className={`-mr-2 shrink-0 rounded-[6px] px-2 py-2.5 text-sm font-semibold text-[#084734] ${FOCUS_RING}`}
          >
            검색
          </button>
        </form>

        {/* 바로가기 두 줄은 같은 격자에 둔다 — 라벨 너비를 맞춰 링크가 같은 세로선에서 시작한다. */}
        <dl className="hero-soft-enter hero-soft-enter-actions mt-3.5 grid max-w-2xl grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2">
          <dt className="text-xs text-[#615D59]">자주 찾는 주제</dt>
          <dd className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
            {SEARCH_CHIPS.map((chip) => (
              <Link
                key={chip}
                href={`/docs?q=${encodeURIComponent(chip)}`}
                className={`text-[13px] font-medium text-[#615D59] underline-offset-4 transition-colors hover:text-[#084734] hover:underline ${FOCUS_RING}`}
              >
                {chip}
              </Link>
            ))}
          </dd>

          {troubleshootingLinks.length > 0 && (
            <>
              <dt className="text-xs text-[#615D59]">문제가 생겼다면</dt>
              <dd className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
                {troubleshootingLinks.slice(0, HERO_TROUBLESHOOTING_LIMIT).map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`text-[13px] font-medium text-[#615D59] underline-offset-4 transition-colors hover:text-[#084734] hover:underline ${FOCUS_RING}`}
                  >
                    {link.shortLabel}
                    {link.shortLabel !== link.label ? (
                      <span className="sr-only"> — {link.label}</span>
                    ) : null}
                  </Link>
                ))}
                {troubleshootingLinks.length > HERO_TROUBLESHOOTING_LIMIT && (
                  <Link
                    href="#troubleshooting"
                    className={`text-[13px] font-semibold text-[#084734] underline-offset-4 hover:underline ${FOCUS_RING}`}
                  >
                    증상 {troubleshootingLinks.length}개 모두 보기
                  </Link>
                )}
              </dd>
            </>
          )}
        </dl>

        {query ? (
          <p className="mt-6 text-[13px] text-[#615D59]">
            “{q}” 검색 결과{" "}
            <span className="font-semibold text-[#084734]">{searchResults.length}개</span>
          </p>
        ) : (
          <p className="mt-6 text-[13px] text-[#615D59]">
            지금 볼 수 있는 가이드 {allDocs.length}개
          </p>
        )}
      </section>

      {query && (
        <section className="container mx-auto max-w-[1080px] px-5 mt-12" aria-labelledby="docs-search-results">
          {/* 카드를 걷어낸 자리에 읽기 너비만 남긴다 — 박스가 없으면 설명이 컨테이너 끝까지 늘어진다. */}
          <div className="max-w-[880px] border-t border-black/[0.08] pt-4">
            <h2 id="docs-search-results" className={SECTION_EYEBROW}>검색 결과</h2>
            {searchResults.length > 0 ? (
              <>
                <ul className="mt-2">
                  {searchResults.slice(0, 12).map((article) => (
                    <DocsListRow key={article.href} article={article} query={q} />
                  ))}
                </ul>
                {searchResults.length > 12 && (
                  <p className="mt-4 text-[13px] text-[#615D59]">
                    관련도가 높은 12개만 보여 드립니다. 찾는 문서가 없으면 다른 단어로 검색해 보세요.
                  </p>
                )}
              </>
            ) : (
              <div className="mt-4">
                <p className="text-[15px] leading-[26px] text-[#615D59]">
                  맞는 가이드가 없습니다. ‘녹화’, ‘과제’처럼 짧은 단어로 다시 검색하거나, 챗봇에
                  지금 상황을 그대로 물어보세요.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <DocsAskChatbotButton
                    prefill={q}
                    className={`inline-flex items-center gap-1 text-[14px] font-semibold text-[#084734] ${FOCUS_RING}`}
                  >
                    챗봇에게 물어보기
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

      {/*
        아래 묶음은 Reveal(스크롤 등장)을 쓰지 않는다. 찾아보는 화면이라 내용이 바로 있어야 하고,
        Reveal 은 이미 화면 안에 있어도 한 번 숨겼다 다시 보여 깜빡이며, 빨리 내리거나 전체 화면을
        저장·인쇄하면 아래쪽이 빈 채로 남는다.
      */}

      {/* 상황별 진입 — 카드에 담지 않고 규칙선 아래로 흐르게 둔다. */}
      <section
        className="container mx-auto max-w-[1080px] px-5 mt-16 md:mt-20"
        aria-labelledby="docs-intent-heading"
      >
        <h2 id="docs-intent-heading" className={`${SECTION_EYEBROW} mb-5`}>
          어떤 상황이신가요
        </h2>
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
                  <span className="sr-only">: {card.title}</span>
                  <ArrowRight
                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </div>
            )
          })}
        </div>
      </section>

      {!query && startSteps.length > 0 && (
        <section
          className="container mx-auto max-w-[1080px] px-5 mt-16 md:mt-24"
          aria-labelledby="docs-start-heading"
        >
          <div className="max-w-[880px] border-t border-black/[0.08] pt-4">
            <h2 id="docs-start-heading" className={SECTION_EYEBROW}>
              처음이라면 여기부터
            </h2>
            <ol className="mt-2">
              {startSteps.map((step, index) => (
                <DocsListRow
                  key={step.href}
                  article={step}
                  index={String(index + 1).padStart(2, "0")}
                  meta={["readTime", "images"]}
                />
              ))}
            </ol>
            <p className="mt-4 text-[14px] leading-[22px] text-[#31302E]">
              학생과 강사는 앱이나 PC 프로그램에서 가입하고 로그인합니다. 웹 브라우저로 여는 관리자
              페이지는 학원 관리자용입니다.
            </p>
          </div>
        </section>
      )}

      {!query && troubleshootingLinks.length > 0 && (
        <section
          className="container mx-auto max-w-[1080px] px-5 mt-16 md:mt-24"
          aria-labelledby="troubleshooting-heading"
        >
          <div id="troubleshooting" className="scroll-mt-28 border-t border-black/[0.08] pt-4">
            <h2 id="troubleshooting-heading" className={SECTION_EYEBROW}>
              문제가 생겼을 때
            </h2>
            <p className="mt-2 max-w-[880px] text-[14px] leading-[22px] text-[#31302E]">
              증상별로 먼저 해 볼 것과 화면을 순서대로 담았습니다. 그래도 해결되지 않으면 아래 상담 창구로
              알려 주세요.
            </p>
            <ul className="mt-2 grid gap-x-12 md:grid-cols-2">
              {troubleshootingLinks.map((link) => (
                <DocsListRow
                  key={link.href}
                  article={link.summary}
                  meta={["category", "readTime", "images"]}
                  thumbnailFrom="lg"
                />
              ))}
            </ul>
          </div>
        </section>
      )}

      {productTiles.length > 0 && (
        <section
          className="container mx-auto max-w-[1080px] px-5 mt-16 md:mt-20"
          aria-labelledby="docs-product-heading"
        >
          <h2 id="docs-product-heading" className={`${SECTION_EYEBROW} mb-2`}>
            제품별로 찾기
          </h2>
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
                    className="h-4 w-4 shrink-0 text-[#A39E98] transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-[#084734]"
                    aria-hidden
                  />
                </Link>
              )
            })}
          </div>
          {!query && (
            // 기능 소개서는 가이드가 아니라 한눈에 보는 소개 자료라 제품 목록 아래 한 줄로만 둔다.
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-black/[0.06] pt-4">
              <span className="text-[13px] text-[#615D59]">한눈에 보는 소개서</span>
              {FEATURE_GUIDES.map((guide) => (
                <TrackedLink
                  key={guide.href}
                  href={guide.href}
                  prefetch={false}
                  target="_blank"
                  rel="noopener noreferrer"
                  ctaId={guide.ctaId}
                  className={`group inline-flex items-center gap-1 text-[14px] font-semibold text-[#31302E] transition-colors hover:text-[#084734] ${FOCUS_RING}`}
                >
                  {guide.title}
                  <ArrowUpRight
                    className="h-3.5 w-3.5 text-[#084734] transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
                    aria-hidden
                  />
                  <span className="sr-only">(새 탭)</span>
                </TrackedLink>
              ))}
            </div>
          )}
        </section>
      )}

      {!query && recentDocs.length > 0 && (
        <section
          className="container mx-auto max-w-[1080px] px-5 mt-16 md:mt-24"
          aria-labelledby="docs-recent-heading"
        >
          <div className="border-t border-black/[0.08] pt-4">
            <h2 id="docs-recent-heading" className={SECTION_EYEBROW}>
              최근 업데이트된 가이드
            </h2>
            <ul className="mt-1 grid gap-x-12 md:grid-cols-2">
              {recentDocs.map((article) => (
                <DocsCompactRow key={article.href} article={article} />
              ))}
            </ul>
          </div>
        </section>
      )}

      {!query && featuredArticles.length > 0 && (
        <section
          className="container mx-auto max-w-[1080px] px-5 mt-16 md:mt-24"
          aria-labelledby="docs-featured-heading"
        >
          <div className="border-t border-black/[0.08] pt-4">
            <h2 id="docs-featured-heading" className={SECTION_EYEBROW}>
              추천 가이드
            </h2>
            <ul className="mt-2 grid gap-x-12 md:grid-cols-2">
              {featuredArticles.map((article) => (
                <DocsListRow key={article.href} article={article} thumbnailFrom="lg" />
              ))}
            </ul>
          </div>
        </section>
      )}

      <section aria-labelledby="docs-install-heading">
        <div className="section-warm mt-16 py-14 md:mt-24 md:py-16">
          <div className="container mx-auto max-w-[1080px] px-5 grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <p className={SECTION_EYEBROW}>설치가 필요하신가요</p>
              <h2
                id="docs-install-heading"
                className="mt-3 break-keep text-[1.5rem] font-bold leading-[1.3] md:text-[1.75rem]"
              >
                설치 파일은 다운로드 페이지에서 받습니다.
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#615D59]">
                페이지를 열면 지금 쓰는 기기에 맞는 설치 파일이 먼저 보입니다. 가입한 계정 하나로
                PC와 모바일 기기에서 모두 로그인합니다.
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
                        className="h-3.5 w-3.5 shrink-0 text-[#A39E98] transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-[#084734]"
                        aria-hidden
                      />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section
        className="container mx-auto max-w-[1080px] px-5 mt-16 md:mt-24"
        aria-labelledby="docs-support-heading"
      >
        <h2 id="docs-support-heading" className={`${SECTION_EYEBROW} mb-5`}>
          그래도 해결되지 않았다면
        </h2>
        <div className="grid gap-x-8 gap-y-9 sm:grid-cols-3">
          <div className={RULE_BLOCK}>
            <MessageCircle className="h-5 w-5 text-[#084734]" aria-hidden />
            <p className="mt-3.5 text-[16px] font-bold text-[#111110]">챗봇에게 묻기</p>
            <p className="mt-1.5 text-[14px] leading-[22px] text-[#615D59]">
              막힌 상황을 적으면 가이드 내용을 바탕으로 답합니다.
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
              도입 기간, 요금, 전자칠판 설치와 A/S처럼 도입 전에 많이 묻는 질문입니다.
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
              구성이 궁금하거나 가이드로 풀리지 않으면 남겨 주세요. 담당 매니저가 연락드립니다.
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
      </section>
    </div>
  )
}
