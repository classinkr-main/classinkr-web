import type { Metadata } from "next"
import Link from "next/link"
import { notFound, permanentRedirect, redirect } from "next/navigation"
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
  resolveDocsRedirect,
} from "@/lib/docs-content"
import { JsonLd } from "@/components/seo/JsonLd"
import { createArticleJsonLd, createBreadcrumbJsonLd, toAbsoluteUrl } from "@/lib/seo"

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

  const isListed = (doc.visibility ?? "public") === "public" && !doc.noindex

  return {
    title: `${doc.title} | Classin 가이드`,
    description: doc.description,
    keywords: doc.keywords,
    alternates: { canonical: toAbsoluteUrl(getDocPath(doc)) },
    robots: isListed ? undefined : { index: false, follow: true },
    openGraph: {
      title: `${doc.title} | Classin 가이드`,
      description: doc.description,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${doc.title} | Classin 가이드`,
      description: doc.description,
    },
  }
}

export default async function DocsArticlePage({
  params,
}: DocsArticlePageProps) {
  const { category: categoryParam, slug } = await params
  const docsContent = await getDocsContent()

  const currentPath = `/docs/${categoryParam}/${slug}`

  if (!isDocCategoryId(categoryParam)) {
    const target = await resolveDocsRedirect(currentPath)
    if (target) {
      if (target.httpStatus === 301 || target.httpStatus === 308) {
        permanentRedirect(target.toPath)
      }
      redirect(target.toPath)
    }
    notFound()
  }

  const doc = getDocFromContent(docsContent, slug, categoryParam)
  if (!doc || doc.category !== categoryParam) {
    const target = await resolveDocsRedirect(currentPath)
    if (target) {
      if (target.httpStatus === 301 || target.httpStatus === 308) {
        permanentRedirect(target.toPath)
      }
      redirect(target.toPath)
    }
    notFound()
  }

  const category = getDocCategoryFromContent(docsContent, doc.category)
  if (!category) notFound()

  const activePath = getDocPath(doc)
  const relatedDocs = getRelatedDocsFromContent(docsContent, doc, 3)

  // 카테고리가 board(하드웨어)면 하드웨어 상담, 그 외는 기술 지원 상담으로 연결
  const contactTopic = doc.category === "board" ? "하드웨어/설치/AS" : "계정/접속/기술 지원"
  const contactHref = `/contact?topic=${encodeURIComponent(contactTopic)}#contact-form`

  return (
    <DocsSidebarLayout
      sidebar={<DocsSidebar groups={getDocsNavGroups(activePath, docsContent)} />}
      toc={<DocsTableOfContents items={toTocItems(doc)} />}
    >
      <JsonLd
        data={[
          createArticleJsonLd({
            path: activePath,
            title: doc.title,
            description: doc.description,
            dateModified: doc.updatedAt,
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "가이드", path: "/docs" },
            { name: category.title, path: getDocCategoryPath(doc.category) },
            { name: doc.title, path: activePath },
          ]),
        ]}
      />
      <Link
        href={getDocCategoryPath(doc.category)}
        className="mb-6 inline-flex origin-left items-center gap-2 text-sm font-medium text-[#1a1a1a]/45 transition-all duration-150 hover:text-[#084734] active:scale-[0.98]"
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
                        className="inline-block origin-left break-words text-[15px] font-bold text-[#084734] underline-offset-4 transition-transform duration-150 hover:underline active:scale-[0.98]"
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
                추가 지원
              </p>
              <h2 className="mt-2 text-xl font-black tracking-card text-[#111110]">
                문서로 해결되지 않았나요?
              </h2>
              <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[#615D59]">
                현재 상황을 남겨주시면 담당 매니저가 확인 순서를 정리해 연락드립니다.
              </p>
              <Link
                href={contactHref}
                className="mt-4 inline-flex origin-left items-center gap-2 rounded-full bg-[#084734] px-5 py-2.5 text-sm font-bold text-white transition-all duration-150 hover:bg-[#065c41] active:scale-[0.98]"
              >
                상담 남기기
                <ArrowRight className="h-4 w-4" />
              </Link>
            </section>

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

            {doc.category !== "start" && (
              <section className="border-t border-black/[0.08] pt-8">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                  도움 필요
                </p>
                <h2 className="mt-2 text-xl font-black tracking-card text-[#111110]">
                  처음 사용한다면 설치와 회원 가입부터 확인해 보세요.
                </h2>
                <Link
                  href="/docs/start"
                  className="mt-3 inline-flex origin-left text-sm font-bold text-[#084734] underline-offset-4 transition-transform duration-150 hover:underline active:scale-[0.98]"
                >
                  클래스인 시작하기 보기 →
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
