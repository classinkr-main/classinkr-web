import type { Metadata } from "next"
import Link from "next/link"
import { notFound, permanentRedirect, redirect } from "next/navigation"
import { ArrowRight, Search } from "lucide-react"

import {
  docsCategories,
  isDocCategoryId,
} from "@/lib/docs"
import {
  getDocCategoryFromContent,
  getDocsByCategoryFromContent,
  getDocsContent,
  resolveDocsRedirect,
} from "@/lib/docs-content"

import { toArticleSummary, scoreDocsArticle } from "../_utils"
import { SearchHighlight } from "@/components/ui/SearchHighlight"

interface DocsCategoryPageProps {
  params: Promise<{ category: string }>
  searchParams?: Promise<{ q?: string }>
}

export function generateStaticParams() {
  return docsCategories.map((category) => ({
    category: category.id,
  }))
}

export async function generateMetadata({
  params,
}: DocsCategoryPageProps): Promise<Metadata> {
  const { category: categoryParam } = await params
  const docsContent = await getDocsContent()
  const category = getDocCategoryFromContent(docsContent, categoryParam)

  if (!category) {
    return {
      title: "문서 카테고리를 찾을 수 없습니다",
      description: "요청하신 문서 카테고리를 찾을 수 없습니다.",
    }
  }

  return {
    title: `${category.title} | Classin 가이드`,
    description: category.description,
    openGraph: {
      title: `${category.title} | Classin 가이드`,
      description: category.description,
      type: "website",
    },
  }
}

export default async function DocsCategoryPage({
  params,
  searchParams,
}: DocsCategoryPageProps) {
  const { category: categoryParam } = await params
  const { q } = await (searchParams ?? Promise.resolve<{ q?: string }>({}))
  const docsContent = await getDocsContent()

  if (!isDocCategoryId(categoryParam)) {
    const target = await resolveDocsRedirect(`/docs/${categoryParam}`)
    if (target) {
      if (target.httpStatus === 301 || target.httpStatus === 308) {
        permanentRedirect(target.toPath)
      }
      redirect(target.toPath)
    }
    notFound()
  }

  const category = getDocCategoryFromContent(docsContent, categoryParam)
  if (!category) {
    const target = await resolveDocsRedirect(`/docs/${categoryParam}`)
    if (target) {
      if (target.httpStatus === 301 || target.httpStatus === 308) {
        permanentRedirect(target.toPath)
      }
      redirect(target.toPath)
    }
    notFound()
  }

  const docs = getDocsByCategoryFromContent(docsContent, categoryParam)
  const articleSummaries = docs.map((doc) => toArticleSummary(doc, docsContent.categories))
  const query = q?.trim().toLowerCase() ?? ""
  const filteredDocs = query
    ? articleSummaries
        .map((doc) => ({ doc, score: scoreDocsArticle(doc, query) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.doc)
    : articleSummaries
  const searchFallbackHref = q?.trim()
    ? `/docs/search?q=${encodeURIComponent(q.trim())}`
    : "/docs/search"

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-28 pb-24 text-[#111110] md:pt-36">
      <section className="container">
        <Link
          href="/docs"
          className="inline-flex origin-left items-center gap-2 text-sm font-medium text-[#1a1a1a]/45 transition-all duration-150 hover:text-[#084734] active:scale-[0.98]"
        >
          <ArrowRight className="h-4 w-4 rotate-180" />
          가이드 홈으로 돌아가기
        </Link>

        <div className="mt-8 max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#084734]">
            {category.title}
          </p>
          <h1 className="mt-4 text-4xl font-black leading-[1.06] tracking-display md:text-6xl">
            {category.description}
          </h1>
          <p className="mt-5 text-lg leading-8 text-[#615D59]">
            필요한 안내를 빠르게 고를 수 있도록 {docs.length}개의 글을 주제별로 정리했습니다.
          </p>
        </div>

        <form action={`/docs/${categoryParam}`} method="get" className="mt-10 flex max-w-2xl items-center gap-3 border-b border-black/[0.08] pb-4">
          <Search className="h-4 w-4 shrink-0 text-[#A39E98]" aria-hidden />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="이 주제에서 궁금한 내용 검색"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#A39E98]"
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
              이 주제의 안내 {articleSummaries.length}개
            </>
          )}
        </p>
      </section>

      <section className="container mt-12">
        <div className="border-t border-black/[0.08] pt-4">
          <ul className="divide-y divide-black/[0.08]">
            {(query ? filteredDocs : articleSummaries).map((article) => (
              <li key={article.href} className="py-4">
                <Link href={article.href} className="group block origin-center transition-all duration-150 active:scale-[0.98] active:opacity-90">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="break-words text-[15px] font-semibold text-[#111110] group-hover:text-[#084734]">
                        <SearchHighlight text={article.title} query={q} />
                      </p>
                      <p className="mt-1 max-w-3xl break-words text-sm leading-6 text-[#615D59]">
                        <SearchHighlight text={article.description} query={q} />
                      </p>
                      <p className="mt-2 text-xs text-[#A39E98]">
                        {article.readTime} · {article.updatedAt}
                        {article.tags?.length ? ` · ${article.tags.join(" / ")}` : ""}
                      </p>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#A39E98]" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {(query ? filteredDocs : articleSummaries).length === 0 && (
            <div className="my-6 rounded-lg border border-black/[0.08] bg-white p-5">
              <p className="text-[15px] font-semibold text-[#111110]">
                이 주제에서는 일치하는 안내를 찾지 못했습니다.
              </p>
              <p className="mt-2 text-sm leading-6 text-[#615D59]">
                전체 가이드에서 한 번 더 찾아보거나, 상황을 남겨주시면 문서 보강과 상담으로 이어드릴게요.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Link
                  href={searchFallbackHref}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] bg-[#084734] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#065c41]"
                >
                  전체 가이드에서 다시 검색
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/contact?topic=docs#contact-form"
                  className="inline-flex h-10 items-center justify-center rounded-[6px] border border-black/[0.08] bg-white px-4 text-sm font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4]"
                >
                  상담 남기기
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
