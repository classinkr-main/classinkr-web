import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight } from "lucide-react"

import { DocsArticleCard, DocsSearchPanel } from "@/components/docs"
import {
  docsCategories,
  type DocCategoryId,
} from "@/lib/docs"
import {
  getDocCategoryFromContent,
  getDocsByCategoryFromContent,
  getDocsContent,
} from "@/lib/docs-content"

import { DocsCategoryIcon, toArticleSummary } from "../_utils"

interface DocsCategoryPageProps {
  params: Promise<{ category: string }>
}

function isDocCategoryId(category: string): category is DocCategoryId {
  return docsCategories.some((item) => item.id === category)
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
    title: `${category.title} | ClassIn 가이드`,
    description: category.description,
    openGraph: {
      title: `${category.title} | ClassIn 가이드`,
      description: category.description,
      type: "website",
    },
  }
}

export default async function DocsCategoryPage({
  params,
}: DocsCategoryPageProps) {
  const { category: categoryParam } = await params
  const docsContent = await getDocsContent()

  if (!isDocCategoryId(categoryParam)) {
    notFound()
  }

  const category = getDocCategoryFromContent(docsContent, categoryParam)
  if (!category) notFound()

  const docs = getDocsByCategoryFromContent(docsContent, categoryParam)
  const articleSummaries = docs.map((doc) => toArticleSummary(doc, docsContent.categories))

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-32 text-[#111110] md:pt-40">
      <section className="container pb-16">
        <Link
          href="/docs"
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-[#1a1a1a]/45 transition-colors hover:text-[#084734]"
        >
          <ArrowRight className="h-4 w-4 rotate-180" />
          문서 홈으로 돌아가기
        </Link>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ECFDF5] text-[#084734]">
              <DocsCategoryIcon categoryId={categoryParam} className="h-6 w-6" />
            </div>
            <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.05] tracking-display md:text-6xl">
              {category.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-[#615D59] md:text-xl">
              {category.description}
            </p>
          </div>

          <div className="rounded-[28px] border border-black/[0.08] bg-white p-6 shadow-card">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
              Collection
            </p>
            <div className="mt-4 text-4xl font-black tabular-nums text-[#111110]">
              {docs.length}
            </div>
            <p className="mt-2 text-sm leading-6 text-[#615D59]">
              이 카테고리에 준비된 문서입니다. 앞으로 상담 데이터와 업데이트에 맞춰 계속 확장됩니다.
            </p>
          </div>
        </div>
      </section>

      <section className="container pb-24">
        <DocsSearchPanel
          articles={articleSummaries}
          sourcePage={`/docs/${categoryParam}`}
          className="mb-8"
        />

        <div className="grid gap-4 lg:grid-cols-2">
          {docs.map((doc) => (
            <DocsArticleCard
              key={doc.slug}
              {...toArticleSummary(doc, docsContent.categories)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
