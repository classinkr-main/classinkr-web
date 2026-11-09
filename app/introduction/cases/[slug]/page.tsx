import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"

import { Emphasis, stripEmphasis } from "@/components/introduction/Emphasis"
import { IntroBlocks } from "@/components/introduction/IntroBlocks"
import { JsonLd } from "@/components/seo/JsonLd"
import { getIntroAsset } from "@/lib/introduction/assets"
import {
  INTRO_CASES,
  INTRO_CASES_PATH,
  INTRO_PATH,
  getIntroCase,
  getIntroCasePath,
  type IntroCase,
} from "@/lib/introduction/content"
import { createBreadcrumbJsonLd, createPublicMetadata } from "@/lib/seo"
import { cn } from "@/lib/utils"

import { CASE_CONTAINER, CASE_TEXT_LINK, CaseBreadcrumb, CaseClosingCta, CasePageHead } from "../case-page-parts"

interface IntroCasePageProps {
  params: Promise<{ slug: string }>
}

// 사례는 content.ts 의 INTRO_CASES 가 전부다 — 빌드 때 모두 만들고, 목록 밖 slug 는 404.
export const dynamicParams = false

export function generateStaticParams() {
  return INTRO_CASES.map((item) => ({ slug: item.slug }))
}

export async function generateMetadata({ params }: IntroCasePageProps): Promise<Metadata> {
  const { slug } = await params
  const item = getIntroCase(slug)
  if (!item) {
    return { title: "사례를 찾을 수 없습니다", robots: { index: false, follow: false } }
  }
  // 검색 노출(운영자 결정 2026-11-09) — 사례 17쪽 모두 sitemap 에 싣는다(app/sitemap.ts).
  return createPublicMetadata({
    title: `${item.name} 스마트 교실 사례`,
    description: `${item.name} — ${stripEmphasis(item.summary)}`,
    path: getIntroCasePath(item.slug),
    image: getIntroAsset(item.cover).src,
  })
}

export default async function IntroCasePage({ params }: IntroCasePageProps) {
  const { slug } = await params
  const item = getIntroCase(slug)
  if (!item) notFound()

  const index = INTRO_CASES.findIndex((entry) => entry.slug === item.slug)
  const prev = index > 0 ? INTRO_CASES[index - 1] : undefined
  const next = index < INTRO_CASES.length - 1 ? INTRO_CASES[index + 1] : undefined
  const casePath = getIntroCasePath(item.slug)

  return (
    <div className="bg-surface-paper">
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: "홈", path: "/" },
          { name: "서비스 소개서", path: INTRO_PATH },
          { name: "고객 사례", path: INTRO_CASES_PATH },
          { name: item.name, path: casePath },
        ])}
      />

      <article className="pt-(--header-h)">
        <div className={`${CASE_CONTAINER} pb-16 pt-12 md:pb-24 md:pt-20`}>
          <CaseBreadcrumb
            items={[
              { name: "서비스 소개서", href: INTRO_PATH },
              { name: "고객 사례", href: INTRO_CASES_PATH },
              { name: item.name },
            ]}
          />
          <CasePageHead
            folio="고객 사례"
            label={
              <>
                {item.sector} <span aria-hidden="true">·</span> {item.country}
              </>
            }
            title={item.name}
            lead={<Emphasis text={item.summary} />}
          />

          {/* 본문은 4–12칸(레일 1–3 은 비운다). 블록 제목(h3)이 h1 바로 아래로 건너뛰지 않게 숨은 h2 를 둔다 */}
          <div className="mt-12 md:mt-16 lg:grid lg:grid-cols-12 lg:gap-x-6">
            <section aria-labelledby="case-body-heading" className="min-w-0 lg:col-span-9 lg:col-start-4">
              <h2 id="case-body-heading" className="sr-only">
                {item.name} 교실 사진과 영상
              </h2>
              <IntroBlocks blocks={item.body} videoSource="introduction_case" />
            </section>
          </div>

          <div className="mt-16 md:mt-24 lg:grid lg:grid-cols-12 lg:gap-x-6">
            <div className="min-w-0 lg:col-span-9 lg:col-start-4">
              <CaseSiblingNav prev={prev} next={next} />
              <div className="mt-8">
                <Link href={INTRO_CASES_PATH} className={CASE_TEXT_LINK}>
                  다른 사례 보기
                  <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </article>

      <CaseClosingCta
        ctaIds={{ primary: "introduction_case_contact", secondary: "introduction_case_showroom" }}
        tracking={{ slug: item.slug, source: "introduction_case" }}
      />
    </div>
  )
}

/** 이전·다음 사례(INTRO_CASES 순서). 처음·끝에서는 한쪽만 있다 — 돌아 감기지 않는다 */
function CaseSiblingNav({ prev, next }: { prev?: IntroCase; next?: IntroCase }) {
  if (!prev && !next) return null
  return (
    <nav aria-label="이전·다음 사례" className="border-t border-line-ink">
      <ul className="grid sm:grid-cols-2 sm:gap-x-6">
        {prev ? (
          <li className="min-w-0 border-b border-line-hair sm:border-b-0">
            <SiblingLink item={prev} direction="prev" />
          </li>
        ) : null}
        {next ? (
          <li className="min-w-0 border-b border-line-hair sm:col-start-2 sm:border-b-0">
            <SiblingLink item={next} direction="next" />
          </li>
        ) : null}
      </ul>
    </nav>
  )
}

function SiblingLink({ item, direction }: { item: IntroCase; direction: "prev" | "next" }) {
  const isNext = direction === "next"
  return (
    <Link
      href={getIntroCasePath(item.slug)}
      className={cn("group flex min-h-11 flex-col gap-1 py-5", isNext && "sm:items-end sm:text-right")}
    >
      <span className="inline-flex items-center gap-1 text-note text-fg-muted">
        {isNext ? null : <ArrowLeft aria-hidden="true" className="size-4" />}
        {isNext ? "다음 사례" : "이전 사례"}
        {isNext ? <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" /> : null}
      </span>
      <span className="text-body-l font-semibold text-fg-ink underline-offset-4 group-hover:underline">
        {item.name}
      </span>
    </Link>
  )
}
