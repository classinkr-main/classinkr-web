import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Search } from "lucide-react"

import { getDocCategoryPath, type DocCategoryId } from "@/lib/docs"
import { getDocsContent } from "@/lib/docs-content"
import { SearchHighlight } from "@/components/ui/SearchHighlight"
import { DocsSearchLogger } from "@/components/docs/DocsSearchLogger"

import {
  getCategoryIcon,
  getAllDocsSummaries,
  toArticleSummary,
  scoreDocsArticle,
} from "./_utils"

export const metadata: Metadata = {
  title: "Classin 가이드",
  description:
    "Classin을 처음 살펴보거나 사용 중인 학원이 도입 준비, 수업 운영, 문제 해결 방법을 한곳에서 확인할 수 있습니다.",
  openGraph: {
    title: "Classin 가이드",
    description:
      "Classin을 처음 살펴보거나 사용 중인 학원이 도입 준비, 수업 운영, 문제 해결 방법을 한곳에서 확인할 수 있습니다.",
    type: "website",
  },
}

interface DocsHomePageProps {
  searchParams?: Promise<{ q?: string }>
}

const categoryLauncherCopy: Partial<Record<DocCategoryId, { scope: string; summary: string }>> = {
  start: {
    scope: "처음 시작",
    summary: "설치, 회원 가입, 비밀번호 변경을 빠르게 확인합니다.",
  },
  software: {
    scope: "소프트웨어",
    summary: "수업 도구, 학습 활동, LMS, AI 기능을 제품 기능 기준으로 봅니다.",
  },
  admin: {
    scope: "관리자",
    summary: "유료 전환, 인증, 코스·교사·학생·스토리지 관리를 봅니다.",
  },
  teacher: {
    scope: "교사",
    summary: "프로필, 코스 생성, 학습 활동, 교실 설정을 정리합니다.",
  },
  student: {
    scope: "학생",
    summary: "코스 참여, 수업 듣기, 과제 제출, AI 기능을 찾습니다.",
  },
  board: {
    scope: "전자칠판",
    summary: "T1·Panorama 카메라 설치와 CMS 세팅을 단계별로 봅니다.",
  },
  hardware: {
    scope: "하드웨어",
    summary: "보드 라인업, 판서, 디스플레이, AI 카메라 기능을 확인합니다.",
  },
}

function normalizeQuery(value?: string) {
  return value?.trim().toLowerCase() ?? ""
}



export default async function DocsHomePage({ searchParams }: DocsHomePageProps) {
  const { q } = await (searchParams ?? Promise.resolve<{ q?: string }>({}))
  const docsContent = await getDocsContent()
  const categoryCards = docsContent.categories.map((category) => {
    const articleCount = docsContent.docs.filter((doc) => doc.category === category.id && (doc.visibility ?? "public") === "public" && !doc.noindex).length
    const launcherCopy = categoryLauncherCopy[category.id] ?? {
      scope: "가이드",
      summary: category.description,
    }

    return {
      ...category,
      href: getDocCategoryPath(category.id),
      articleCount,
      Icon: getCategoryIcon(category.id),
      launcherCopy,
    }
  })
  const featuredArticles = docsContent.docs
    .filter((doc) => doc.featured && (doc.visibility ?? "public") === "public" && !doc.noindex)
    .map((doc) => toArticleSummary(doc, docsContent.categories))
  const allDocs = getAllDocsSummaries(docsContent)
  const query = normalizeQuery(q)
  const filteredDocs = query
    ? allDocs
        .map((doc) => ({ doc, score: scoreDocsArticle(doc, query) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.doc)
    : allDocs

  return (
    <div className="min-h-screen bg-[#FAFAF8] pb-20 pt-28 text-[#111110] md:pb-24 md:pt-36">
      {query && <DocsSearchLogger query={query} resultCount={filteredDocs.length} />}
      <section className="container">
        <div className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#084734]">
            Classin Guide
          </p>
          <h1 className="mt-4 text-[2.35rem] font-black leading-[1.08] tracking-display sm:text-4xl md:text-6xl">
            클래스인을
            <br className="hidden md:block" />{" "}
            만나보세요.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-[#615D59]">
            도입을 고민하는 분도, 이미 수업을 운영 중인 팀도 필요한 내용을 바로 찾을 수 있도록 준비부터 운영, 문제 해결까지 실제 흐름대로 정리했습니다.
          </p>
        </div>

        <form id="docs-search" action="/docs" method="get" className="mt-9 flex max-w-2xl items-center gap-3 border-b border-black/[0.08] pb-4 md:mt-10">
          <Search className="h-4 w-4 shrink-0 text-[#A39E98]" aria-hidden />
          <input
            name="q"
            defaultValue={q ?? ""}
            aria-label="가이드 전체 검색"
            placeholder="궁금한 기능, 수업 준비, 문제 상황 검색"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#A39E98]"
          />
          <button type="submit" className="shrink-0 text-sm font-semibold text-[#084734]">
            검색
          </button>
        </form>

        <p className="mt-4 text-sm text-[#615D59]">
          {query ? (
            <>
              “{q}” 검색 결과 {filteredDocs.length}개
            </>
          ) : (
            <>
              지금 확인할 수 있는 가이드 {allDocs.length}개
            </>
          )}
        </p>

        <div className="mt-9">
          <div className="grid auto-cols-[minmax(230px,78vw)] grid-flow-col gap-3 overflow-x-auto pb-2 md:auto-cols-auto md:grid-flow-row md:grid-cols-3 md:gap-4 md:overflow-visible md:pb-0">
            {categoryCards.map(({ id, title, href, articleCount, Icon, launcherCopy }) => (
              <Link
                key={id}
                href={href}
                className="group flex min-h-[154px] origin-center flex-col justify-between rounded-lg border border-black/[0.08] bg-white p-4 text-left shadow-[0_6px_18px_rgba(17,17,16,0.035)] transition-all duration-150 hover:border-[#084734]/25 hover:shadow-[0_10px_26px_rgba(17,17,16,0.06)] active:scale-[0.98] active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8] md:min-h-[168px] md:p-5"
              >
                <span>
                  <span className="flex items-start justify-between gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ECFDF5] text-[#084734] md:h-10 md:w-10">
                      <Icon aria-hidden className="h-4.5 w-4.5 md:h-5 md:w-5" />
                    </span>
                    <ArrowRight
                      aria-hidden
                      className="mt-1 h-4 w-4 shrink-0 text-[#A39E98] transition-transform duration-150 group-hover:translate-x-1 group-hover:text-[#084734]"
                    />
                  </span>
                  <span className="mt-6 block">
                    <span className="block text-[11px] font-semibold text-[#084734]">
                      {launcherCopy.scope} · {articleCount}개
                    </span>
                    <span className="mt-2 block break-words text-[22px] font-black leading-tight text-[#111110] md:text-[24px]">
                      {title}
                    </span>
                    <span className="mt-2.5 block break-words text-sm leading-6 text-[#4F4C49] md:text-[15px] md:leading-7">
                      {launcherCopy.summary}
                    </span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="container mt-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="border-t border-black/[0.08] pt-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                먼저 보면 좋은 안내
              </p>
              <ul className="mt-4 divide-y divide-black/[0.08]">
                {(query ? filteredDocs : featuredArticles).slice(0, 6).map((article) => (
                  <li key={article.href} className="py-4">
                    <Link href={article.href} className="group block origin-center transition-all duration-150 active:scale-[0.98] active:opacity-90">
                      <p className="break-words text-[15px] font-semibold text-[#111110] group-hover:text-[#084734]">
                        <SearchHighlight text={article.title} query={q} />
                      </p>
                      <p className="mt-1 break-words text-sm leading-6 text-[#615D59]">
                        <SearchHighlight text={article.description} query={q} />
                      </p>
                      <p className="mt-2 text-xs text-[#A39E98]">
                        {article.category} · {article.readTime} · {article.updatedAt}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {query && (
              <div className="mt-14 border-t border-black/[0.08] pt-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                  검색 결과
                </p>
                {filteredDocs.length > 0 ? (
                  <ul className="mt-4 divide-y divide-black/[0.08]">
                    {filteredDocs.slice(0, 12).map((article) => (
                      <li key={article.href} className="py-4">
                        <Link href={article.href} className="group block origin-center transition-all duration-150 active:scale-[0.98] active:opacity-90">
                          <p className="break-words text-[15px] font-semibold text-[#111110] group-hover:text-[#084734]">
                            <SearchHighlight text={article.title} query={q} />
                          </p>
                          <p className="mt-1 break-words text-sm leading-6 text-[#615D59]">
                            <SearchHighlight text={article.description} query={q} />
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-[#615D59]">
                    찾는 안내가 보이지 않습니다. 기능명이나 겪고 있는 상황을 조금 더 짧게 검색해 보세요.
                  </p>
                )}
              </div>
            )}
          </div>

          <aside className="space-y-12">
            <div className="border-t border-black/[0.08] pt-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                처음이라면
              </p>
              <div className="mt-4 space-y-4 text-sm leading-7 text-[#615D59]">
                <p>Classin을 처음 검토 중이라면 클래스인 시작하기에서 설치와 회원 가입 흐름을 먼저 확인해 보세요.</p>
                <p>학원 운영자라면 관리자 가이드에서 코스·교사·학생 관리와 스토리지·웹 라이브 설정을 차례로 점검할 수 있습니다.</p>
                <p>수업을 직접 진행하는 강사라면 교사 가이드에서 코스 생성, 학습 활동 추가, 교실 기본 설정을 확인하세요.</p>
              </div>
            </div>

            <div className="border-t border-black/[0.08] pt-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                어디부터 볼까요
              </p>
              <dl className="mt-4 space-y-3 text-sm text-[#615D59]">
                <div className="flex items-center justify-between gap-4 border-b border-black/[0.06] pb-3">
                  <dt>처음 도입한다면</dt>
                  <dd className="font-semibold text-[#111110]">클래스인 시작하기</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-black/[0.06] pb-3">
                  <dt>학원을 운영 중이라면</dt>
                  <dd className="font-semibold text-[#111110]">관리자 가이드</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt>수업을 진행하는 강사라면</dt>
                  <dd className="font-semibold text-[#111110]">교사 가이드</dd>
                </div>
              </dl>
            </div>

            <div className="border-t border-black/[0.08] pt-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                수업에 참여하는 학생이라면
              </p>
              <p className="mt-4 text-sm leading-7 text-[#615D59]">
                코스 참여와 수업 듣기, 과제 제출, AI 기능까지는 <Link href="/docs/student" className="font-semibold text-[#084734] underline underline-offset-4">학생 가이드</Link>에서 단계별로 확인할 수 있습니다.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
