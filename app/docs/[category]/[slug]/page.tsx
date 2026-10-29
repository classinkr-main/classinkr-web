import type { Metadata } from "next"
import Link from "next/link"
import { notFound, permanentRedirect, redirect } from "next/navigation"
import { ArrowLeft, ArrowRight, Calendar, Clock, Wrench } from "lucide-react"

import {
  DocsArticle,
  DocsArticleCard,
  DocsArticleFeedback,
  DocsPrintButton,
  DocsSidebar,
  DocsSidebarLayout,
  DocsTableOfContents,
} from "@/components/docs"
import { DocsMediaLightbox } from "@/components/docs/DocsMediaLightbox"
import { DocsPrevNext, findPrevNextDocs } from "@/components/docs/DocsPrevNext"
import { DocsInlineToc } from "@/components/docs/DocsTableOfContents"
import { DocsTroubleshootingHelp } from "@/components/docs/DocsTroubleshootingHelp"
import { getDocCategoryPath, getDocPath, isDocCategoryId, listDocs } from "@/lib/docs"
import {
  getDocCategoryFromContent,
  getDocFromContent,
  getDocsContent,
  getRelatedDocsFromContent,
  resolveDocsRedirect,
} from "@/lib/docs-content"
import { JsonLd } from "@/components/seo/JsonLd"
import { createDocStructuredData, pickDocShareImage } from "@/lib/docs-structured-data"
import {
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_TWITTER_IMAGE_PATH,
  SITE_NAME,
  toAbsoluteUrl,
} from "@/lib/seo"

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
      description: "주소가 바뀌었거나 없어진 문서입니다. 가이드 홈에서 다시 찾아보세요.",
    }
  }

  const shouldIndex = !doc.noindex
  // 관리자가 적은 검색 제목(seoTitle)은 루트 템플릿(`%s | Classin`)을 그대로 탄다. 기본 제목은 "문서명 | Classin 가이드" 에서
  // 끝내고 템플릿을 건너뛴다(그렇지 않으면 "… | Classin 가이드 | Classin" 으로 접미사가 겹친다). 공유 카드 제목도 같은 값이다.
  const seoTitle = doc.seoTitle?.trim()
  const defaultTitle = `${doc.title} | Classin 가이드`
  const socialTitle = seoTitle || defaultTitle
  const metaDescription = doc.seoDescription?.trim() || doc.description
  const canonicalPath = doc.canonicalPath?.trim() || getDocPath(doc)
  const canonicalUrl = toAbsoluteUrl(canonicalPath)
  // 문서에 실린 화면 사진 가운데 공유 카드 비율에 맞는 첫 장. 없으면 기본 브랜드 이미지.
  const shareImage = pickDocShareImage(doc)

  return {
    title: seoTitle || { absolute: defaultTitle },
    description: metaDescription,
    keywords: doc.keywords,
    alternates: { canonical: canonicalUrl },
    robots: shouldIndex ? undefined : { index: false, follow: true },
    openGraph: {
      title: socialTitle,
      description: metaDescription,
      url: canonicalUrl,
      siteName: SITE_NAME,
      locale: "ko_KR",
      type: "article",
      modifiedTime: doc.updatedAt,
      images: [
        shareImage
          ? {
              url: shareImage.url,
              ...(shareImage.width && shareImage.height
                ? { width: shareImage.width, height: shareImage.height }
                : {}),
              ...(shareImage.alt ? { alt: shareImage.alt } : {}),
            }
          : { url: toAbsoluteUrl(DEFAULT_OG_IMAGE_PATH) },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: metaDescription,
      images: [
        shareImage
          ? { url: shareImage.url, ...(shareImage.alt ? { alt: shareImage.alt } : {}) }
          : toAbsoluteUrl(DEFAULT_TWITTER_IMAGE_PATH),
      ],
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

  // 사이드바와 같은 목록(공개·색인 문서)·같은 순서로 같은 분류 안의 이전/다음 문서를 고른다.
  // (설치 → 가입처럼 순서가 있는 가이드의 연속 동선)
  const navGroups = getDocsNavGroups(activePath, docsContent)
  const prevNext = findPrevNextDocs(navGroups)
  const tocItems = toTocItems(doc)
  const isTroubleshooting = doc.docType === "troubleshooting"

  // 카테고리가 board(하드웨어)면 하드웨어 상담, 그 외는 기술 지원 상담으로 연결
  const contactTopic = doc.category === "board" ? "하드웨어/설치/AS" : "계정/접속/기술 지원"
  const contactHref = `/contact?topic=${encodeURIComponent(contactTopic)}#contact-form`

  return (
    <DocsSidebarLayout
      sidebar={<DocsSidebar groups={navGroups} />}
      toc={
        <DocsTableOfContents
          items={tocItems}
          title="이 문서의 순서"
          footer={<DocsPrintButton variant="ghost" />}
        />
      }
      topBar={
        <Link
          href={getDocCategoryPath(doc.category)}
          className="group inline-flex min-h-11 origin-left items-center gap-2 text-sm font-medium text-[#615D59] transition-colors duration-150 hover:text-[#084734] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
        >
          <ArrowLeft
            className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:-translate-x-0.5"
            aria-hidden
          />
          <span className="min-w-0 truncate">{category.title}로 돌아가기</span>
        </Link>
      }
    >
      {/* Article(문제 해결 문서는 TechArticle)·BreadcrumbList, 공개·색인 문서에는 HowTo 또는 FAQPage 를 더한다. */}
      <JsonLd
        data={createDocStructuredData({
          doc,
          categoryTitle: category.title,
          categoryPath: getDocCategoryPath(doc.category),
        })}
      />
      {/* 본문 사진을 눌렀을 때 여는 크게 보기 창(ESC·←/→·포커스 가두기) */}
      <DocsMediaLightbox />

      <DocsArticle
        className="print-only-article"
        eyebrow={category.title}
        badge={
          isTroubleshooting ? (
            <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#084734]/30 px-2 py-0.5 text-xs font-bold text-[#084734]">
              <Wrench className="h-3.5 w-3.5" aria-hidden />
              문제 해결
            </span>
          ) : undefined
        }
        title={doc.title}
        description={doc.description}
        meta={
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" aria-hidden />
                {doc.readMinutes}분 읽기
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4" aria-hidden />
                {formatDocDate(doc.updatedAt)} 업데이트
              </span>
              <span>대상: {doc.audience}</span>
            </div>
            {/* 강사·학생에게 보내거나 교실에 붙여 둘 때 — 인쇄하면 본문만 나온다.
                1280px 이상에서는 오른쪽 목차 아래에 같은 버튼이 있다. */}
            <DocsPrintButton variant="ghost" className="xl:hidden" />
          </div>
        }
        beforeSections={<DocsInlineToc items={tocItems} className="xl:hidden" />}
        sections={toArticleSections(doc)}
        sectionLinks
        footer={
          <div className="space-y-10">
            {isTroubleshooting ? (
              <DocsTroubleshootingHelp docTitle={doc.title} contactHref={contactHref} />
            ) : null}

            {doc.resources && doc.resources.length > 0 && (
              <section className="border-t border-black/[0.08] pt-8">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                  자료
                </p>
                <h2 className="mt-2 text-xl font-black tracking-card text-[#111110]">
                  첨부 자료와 참고 링크
                </h2>
                <ul className="mt-5 divide-y divide-black/[0.08]">
                  {doc.resources.map((resource) => (
                    <li key={resource.href} className="py-4">
                      <a
                        href={resource.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block origin-left break-words text-[15px] font-bold text-[#084734] underline-offset-4 transition-transform duration-150 hover:underline active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
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

            <section className="border-t border-black/[0.08] pt-8">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                요약
              </p>
              <h2 className="mt-2 text-xl font-black tracking-card text-[#111110]">
                짧게 말하면
              </h2>
              <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[#31594B]">
                {doc.chatbotSummary}
              </p>
            </section>

            <DocsPrevNext links={prevNext} />

            <div className="print:hidden">
              <DocsArticleFeedback
                articlePath={activePath}
                articleSlug={doc.slug}
                category={doc.category}
                title={doc.title}
              />
            </div>

            {/* 문제 해결 문서는 본문 바로 뒤 "그래도 안 되면" 안내가 같은 역할을 한다. */}
            {!isTroubleshooting ? (
              <section className="border-t border-black/[0.08] pt-8 print:hidden">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                  추가 지원
                </p>
                <h2 className="mt-2 text-xl font-black tracking-card text-[#111110]">
                  문서로 해결되지 않았나요?
                </h2>
                <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[#615D59]">
                  어느 화면에서 무엇이 안 되는지 적어 주시면 담당 매니저가 확인하고 연락드립니다.
                </p>
                <Link
                  href={contactHref}
                  className="mt-4 inline-flex origin-left items-center gap-2 rounded-[6px] bg-[#084734] px-5 py-2.5 text-sm font-bold text-white transition-colors duration-150 hover:bg-[#065c41] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
                >
                  상담 남기기
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </section>
            ) : null}

            {doc.category !== "start" && (
              <section className="border-t border-black/[0.08] pt-8 print:hidden">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">
                  시작하기
                </p>
                <h2 className="mt-2 text-xl font-black tracking-card text-[#111110]">
                  클래스인을 처음 쓰신다면 설치와 회원 가입부터 하세요.
                </h2>
                <Link
                  href="/docs/start"
                  className="mt-3 inline-flex origin-left text-sm font-bold text-[#084734] underline-offset-4 transition-transform duration-150 hover:underline active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
                >
                  클래스인 시작하기 보기 →
                </Link>
              </section>
            )}

            {relatedDocs.length > 0 && (
              <section className="border-t border-black/[0.08] pt-8 print:hidden">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#084734]">
                  함께 보기
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-subhead text-[#111110]">
                  이어서 읽을 문서
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
