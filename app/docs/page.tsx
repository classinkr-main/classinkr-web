import type { Metadata } from "next"
import Link from "next/link"
import { Search } from "lucide-react"

import { getDocCategoryPath } from "@/lib/docs"
import { getDocsContent } from "@/lib/docs-content"

import {
  getAllDocsSummaries,
  toArticleSummary,
} from "./_utils"

export const metadata: Metadata = {
  title: "ClassIn 가이드 | ClassIn",
  description:
    "ClassIn을 처음 살펴보거나 사용 중인 학원이 도입 준비, 수업 운영, 문제 해결 방법을 한곳에서 확인할 수 있습니다.",
  openGraph: {
    title: "ClassIn 가이드",
    description:
      "ClassIn을 처음 살펴보거나 사용 중인 학원이 도입 준비, 수업 운영, 문제 해결 방법을 한곳에서 확인할 수 있습니다.",
    type: "website",
  },
}

interface DocsHomePageProps {
  searchParams?: Promise<{ q?: string }>
}

function normalizeQuery(value?: string) {
  return value?.trim().toLowerCase() ?? ""
}

export default async function DocsHomePage({ searchParams }: DocsHomePageProps) {
  const { q } = await (searchParams ?? Promise.resolve<{ q?: string }>({}))
  const docsContent = await getDocsContent()
  const categories = docsContent.categories.map((category) => ({
    ...category,
    href: getDocCategoryPath(category.id),
    articleCount: docsContent.docs.filter((doc) => doc.category === category.id && (doc.visibility ?? "public") === "public" && !doc.noindex).length,
  }))
  const featuredArticles = docsContent.docs
    .filter((doc) => doc.featured && (doc.visibility ?? "public") === "public" && !doc.noindex)
    .map((doc) => toArticleSummary(doc, docsContent.categories))
  const allDocs = getAllDocsSummaries(docsContent)
  const query = normalizeQuery(q)
  const filteredDocs = query
    ? allDocs.filter((doc) => {
        const haystack = [doc.title, doc.description, doc.category ?? "", doc.searchText ?? "", ...(doc.tags ?? [])]
          .join(" ")
          .toLowerCase()

        return haystack.includes(query)
      })
    : allDocs

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-28 pb-24 text-[#111110] md:pt-36">
      <section className="container">
        <div className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#084734]">
            ClassIn Guide
          </p>
          <h1 className="mt-4 text-4xl font-black leading-[1.06] tracking-display md:text-6xl">
            클래스인을
            <br className="hidden md:block" />
            만나보세요.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-[#615D59]">
            도입을 고민하는 분도, 이미 수업을 운영 중인 팀도 필요한 내용을 바로 찾을 수 있도록 준비부터 운영, 문제 해결까지 실제 흐름대로 정리했습니다.
          </p>
        </div>

        <form action="/docs" method="get" className="mt-10 flex max-w-2xl items-center gap-3 border-b border-black/[0.08] pb-4">
          <Search className="h-4 w-4 shrink-0 text-[#A39E98]" aria-hidden />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="궁금한 기능, 수업 준비, 문제 상황 검색"
            className="w-full bg-transparent text-base outline-none placeholder:text-[#A39E98]"
          />
          <button type="submit" className="text-sm font-semibold text-[#084734]">
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
      </section>

      <section className="container mt-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="border-t border-black/[0.08] pt-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                살펴볼 주제
              </p>
              <ul className="mt-4 divide-y divide-black/[0.08]">
                {categories.map((category) => (
                  <li key={category.href} className="py-4">
                    <Link href={category.href} className="group flex items-start justify-between gap-4">
                      <span>
                        <span className="block text-[15px] font-semibold text-[#111110] group-hover:text-[#084734]">
                          {category.title}
                        </span>
                        <span className="mt-1 block text-sm leading-6 text-[#615D59]">
                          {category.description}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm text-[#A39E98]">
                        {category.articleCount}개
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-14 border-t border-black/[0.08] pt-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                먼저 보면 좋은 안내
              </p>
              <ul className="mt-4 divide-y divide-black/[0.08]">
                {(query ? filteredDocs : featuredArticles).slice(0, 6).map((article) => (
                  <li key={article.href} className="py-4">
                    <Link href={article.href} className="block">
                      <p className="text-[15px] font-semibold text-[#111110] hover:text-[#084734]">
                        {article.title}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#615D59]">
                        {article.description}
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
                        <Link href={article.href} className="block">
                          <p className="text-[15px] font-semibold text-[#111110] hover:text-[#084734]">
                            {article.title}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-[#615D59]">
                            {article.description}
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
                <p>ClassIn을 처음 검토 중이라면 빠른 시작과 자주 묻는 질문에서 도입 흐름과 준비 항목을 먼저 확인해 보세요.</p>
                <p>이미 사용 중이라면 운영 가이드와 기능 매뉴얼에서 교사 안내, 학생 입장, 출결, 자료 운영을 차례로 점검할 수 있습니다.</p>
                <p>수업 중 문제가 생겼다면 문제 해결 안내에서 증상별로 바로 따라 할 수 있는 복구 순서를 확인하세요.</p>
              </div>
            </div>

            <div className="border-t border-black/[0.08] pt-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                어디부터 볼까요
              </p>
              <dl className="mt-4 space-y-3 text-sm text-[#615D59]">
                <div className="flex items-center justify-between gap-4 border-b border-black/[0.06] pb-3">
                  <dt>처음 도입한다면</dt>
                  <dd className="font-semibold text-[#111110]">빠른 시작</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-black/[0.06] pb-3">
                  <dt>수업을 운영 중이라면</dt>
                  <dd className="font-semibold text-[#111110]">운영 가이드</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt>문제가 생겼다면</dt>
                  <dd className="font-semibold text-[#111110]">문제 해결</dd>
                </div>
              </dl>
            </div>

            <div className="border-t border-black/[0.08] pt-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                수업 중 도움이 필요할 때
              </p>
              <p className="mt-4 text-sm leading-7 text-[#615D59]">
                접속, 음성, 화면 공유처럼 수업을 바로 막는 문제는 <Link href="/docs/troubleshooting" className="font-semibold text-[#084734] underline underline-offset-4">문제 해결</Link>에서 빠른 조치 순서부터 확인할 수 있습니다.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
