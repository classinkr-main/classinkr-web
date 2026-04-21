import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, Calendar, Clock, LifeBuoy, Search } from "lucide-react"

import {
  DocsArticle,
  DocsArticleCard,
  DocsArticleFeedback,
  DocsSidebar,
  DocsSidebarLayout,
  DocsTableOfContents,
} from "@/components/docs"
import {
  docsCategories,
  getDocCategoryPath,
  getDocPath,
  listDocs,
  type DocCategoryId,
} from "@/lib/docs"
import {
  getDocCategoryFromContent,
  getDocFromContent,
  getDocsContent,
  getRelatedDocsFromContent,
} from "@/lib/docs-content"

import {
  formatDocDate,
  getDocsNavGroups,
  toArticleSections,
  toArticleSummary,
  toTocItems,
} from "../../_utils"

interface DocsArticlePageProps {
  params: Promise<{ category: string; slug: string }>
}

function isDocCategoryId(category: string): category is DocCategoryId {
  return docsCategories.some((item) => item.id === category)
}

export function generateStaticParams() {
  return listDocs().map((doc) => ({
    category: doc.category,
    slug: doc.slug,
  }))
}

export async function generateMetadata({
  params,
}: DocsArticlePageProps): Promise<Metadata> {
  const { category, slug } = await params
  const docsContent = await getDocsContent()
  const doc = getDocFromContent(docsContent, slug, category)

  if (!doc || doc.category !== category) {
    return {
      title: "문서를 찾을 수 없습니다",
      description: "요청하신 문서를 찾을 수 없습니다.",
    }
  }

  return {
    title: `${doc.title} | ClassIn 가이드`,
    description: doc.description,
    keywords: doc.keywords,
    openGraph: {
      title: `${doc.title} | ClassIn 가이드`,
      description: doc.description,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${doc.title} | ClassIn 가이드`,
      description: doc.description,
    },
  }
}

export default async function DocsArticlePage({
  params,
}: DocsArticlePageProps) {
  const { category: categoryParam, slug } = await params
  const docsContent = await getDocsContent()

  if (!isDocCategoryId(categoryParam)) {
    notFound()
  }

  const doc = getDocFromContent(docsContent, slug, categoryParam)
  if (!doc || doc.category !== categoryParam) {
    notFound()
  }

  const category = getDocCategoryFromContent(docsContent, doc.category)
  if (!category) notFound()

  const activePath = getDocPath(doc)
  const relatedDocs = getRelatedDocsFromContent(docsContent, doc, 3)

  return (
    <DocsSidebarLayout
      sidebar={<DocsSidebar groups={getDocsNavGroups(activePath, docsContent)} />}
      toc={<DocsTableOfContents items={toTocItems(doc)} />}
    >
      <Link
        href={getDocCategoryPath(doc.category)}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[#1a1a1a]/45 transition-colors hover:text-[#084734]"
      >
        <ArrowRight className="h-4 w-4 rotate-180" />
        {category.title}로 돌아가기
      </Link>

      <DocsArticle
        eyebrow={category.title}
        title={doc.title}
        description={doc.description}
        meta={
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {doc.readMinutes}분 읽기
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {formatDocDate(doc.updatedAt)} 업데이트
            </span>
            <span>추천 대상: {doc.audience}</span>
          </div>
        }
        sections={toArticleSections(doc)}
        footer={
          <div className="space-y-8">
            <DocsArticleFeedback
              articlePath={activePath}
              articleSlug={doc.slug}
              category={doc.category}
              title={doc.title}
            />

            <section className="rounded-2xl border border-[#084734]/15 bg-[#ECFDF5] p-6 md:p-8">
              <div className="flex flex-col gap-5 md:flex-row md:items-start">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#084734]">
                  <Search className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                    Chatbot Summary
                  </p>
                  <h2 className="mt-2 text-xl font-black tracking-card text-[#111110]">
                    AI 상담 답변용 요약
                  </h2>
                  <p className="mt-3 text-[15px] leading-7 text-[#31594B]">
                    {doc.chatbotSummary}
                  </p>
                </div>
              </div>
            </section>

            {doc.category !== "troubleshooting" && (
              <section className="rounded-2xl border border-black/[0.08] bg-white p-6 shadow-card md:p-8">
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                      Need Help?
                    </p>
                    <h2 className="mt-2 text-xl font-black tracking-card text-[#111110]">
                      작동이 원활하지 않다면 문제 해결 가이드를 확인하세요.
                    </h2>
                  </div>
                  <Link
                    href="/docs/troubleshooting"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#084734] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#065c41]"
                  >
                    문제 해결 보기
                    <LifeBuoy className="h-4 w-4" />
                  </Link>
                </div>
              </section>
            )}

            {relatedDocs.length > 0 && (
              <section>
                <div className="mb-4">
                  <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#084734]">
                    Related Docs
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-subhead text-[#111110]">
                    이어서 보면 좋은 문서
                  </h2>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {relatedDocs.map((relatedDoc) => (
                    <DocsArticleCard
                      key={relatedDoc.slug}
                      {...toArticleSummary(relatedDoc, docsContent.categories)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        }
      />
    </DocsSidebarLayout>
  )
}
