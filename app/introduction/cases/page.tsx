import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { IntroCaseGrid } from "@/components/introduction/IntroCaseGrid"
import { JsonLd } from "@/components/seo/JsonLd"
import { INTRO_CASES_PATH, INTRO_CASE_VIDEOS, INTRO_PATH } from "@/lib/introduction/content"
import { createBreadcrumbJsonLd, createPublicMetadata } from "@/lib/seo"

import { CASE_CONTAINER, CASE_TEXT_LINK, CaseBreadcrumb, CaseClosingCta, CasePageHead } from "./case-page-parts"

const { gallery } = INTRO_CASE_VIDEOS
const TITLE = "스마트 교실 구성 사례"

// 소개서 하위 쪽은 영업 자료라 색인하지 않는다(제품 쪽과 겹치고 원문의 제3자 서술이 들어 있다). sitemap 에도 넣지 않는다.
export const metadata = createPublicMetadata({
  title: TITLE,
  description:
    "한국디지털미디어고등학교·아신대학교·정율사관학원 등 ClassIn X 전자칠판과 카메라로 꾸린 스마트 교실의 실제 사진과 수업 영상을 기관별로 모았습니다.",
  path: INTRO_CASES_PATH,
  noIndex: true,
})

export default function IntroCasesPage() {
  return (
    <div className="bg-surface-paper">
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: "홈", path: "/" },
          { name: "서비스 소개서", path: INTRO_PATH },
          { name: "고객 사례", path: INTRO_CASES_PATH },
        ])}
      />

      <section className="pt-(--header-h)">
        <div className={`${CASE_CONTAINER} pb-16 pt-12 md:pb-24 md:pt-20`}>
          <CaseBreadcrumb items={[{ name: "서비스 소개서", href: INTRO_PATH }, { name: "고객 사례" }]} />
          <CasePageHead folio="서비스 소개서" label="고객 사례" title={TITLE} lead={gallery.quote} />

          <IntroCaseGrid headingLevel={2} className="mt-12 md:mt-16" />

          <div className="mt-12 border-t border-line-hair pt-6 md:mt-16">
            <Link href={INTRO_PATH} className={CASE_TEXT_LINK}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              서비스 소개서로 돌아가기
            </Link>
          </div>
        </div>
      </section>

      <CaseClosingCta
        ctaIds={{ primary: "introduction_cases_contact", secondary: "introduction_cases_showroom" }}
        tracking={{ source: "introduction_cases" }}
      />
    </div>
  )
}
