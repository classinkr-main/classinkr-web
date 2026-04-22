import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, Calendar, Clock } from "lucide-react"

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
          <div className="space-y-10">
            {doc.resources && doc.resources.length > 0 && (
              <section className="border-t border-black/[0.08] pt-8">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                  자료
                </p>
                <h2 className="mt-2 text-xl font-black tracking-card text-[#111110]">
                  함께 보면 좋은 자료
                </h2>
                <ul className="mt-5 divide-y divide-black/[0.08]">
                  {doc.resources.map((resource) => (
                    <li key={resource.href} className="py-4">
                      <a
                        href={resource.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[15px] font-bold text-[#084734] underline-offset-4 hover:underline"
                      >
                        {resource.label}
                      </a>
                      {resource.description ? (
                        <p className="mt-1 text-sm leading-6 text-[#615D59]">
                          {resource.description}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <DocsArticleFeedback
              articlePath={activePath}
              articleSlug={doc.slug}
              category={doc.category}
              title={doc.title}
            />

            <section className="border-t border-black/[0.08] pt-8">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                요약
              </p>
              <h2 className="mt-2 text-xl font-black tracking-card text-[#111110]">
                핵심만 빠르게 보기
              </h2>
              <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[#31594B]">
                {doc.chatbotSummary}
              </p>
            </section>

            {doc.category !== "troubleshooting" && (
              <section className="border-t border-black/[0.08] pt-8">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                  도움 필요
                </p>
                <h2 className="mt-2 text-xl font-black tracking-card text-[#111110]">
                  수업 중 문제가 생겼다면 문제 해결 안내를 먼저 확인하세요.
                </h2>
                <Link
                  href="/docs/troubleshooting"
                  className="mt-3 inline-flex text-sm font-bold text-[#084734] underline-offset-4 hover:underline"
                >
                  문제 해결 보기 →
                </Link>
              </section>
            )}

            {relatedDocs.length > 0 && (
              <section className="border-t border-black/[0.08] pt-8">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#084734]">
                  함께 보기
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-subhead text-[#111110]">
                  이어서 보면 좋은 안내
                </h2>
                <div className="mt-5 divide-y divide-black/[0.08]">
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
