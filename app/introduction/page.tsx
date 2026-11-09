import { LANDING_META } from "@/components/introduction/landing/landing-copy"
import { LandingCases } from "@/components/introduction/landing/LandingCases"
import { LandingFinalCta } from "@/components/introduction/landing/LandingFinalCta"
import { LandingHero } from "@/components/introduction/landing/LandingHero"
import { LandingSmartClassroom } from "@/components/introduction/landing/LandingSmartClassroom"
import { LandingSoftware } from "@/components/introduction/landing/LandingSoftware"
import { JsonLd } from "@/components/seo/JsonLd"
import { INTRO_PATH } from "@/lib/introduction/content"
import { createBreadcrumbJsonLd, createPublicMetadata, createWebPageJsonLd } from "@/lib/seo"

// 대표 랜딩(시안 1 「편집 지면」, 2026-11-06). 검색에 내고 sitemap 에 싣는다 — 타사 비교 문장·표는 이 쪽에 없다.
// 비교표를 원문대로 싣는 문서형 소개서는 /introduction/full 로 옮겼다.
export const metadata = createPublicMetadata({
  title: LANDING_META.title,
  description: LANDING_META.description,
  keywords: LANDING_META.keywords,
  path: INTRO_PATH,
})

// 서버 컴포넌트. 클라이언트 섬은 영상 재생·PDF 계측·CTA 계측뿐이다.
// JSON-LD 는 이 페이지에만 둔다(레이아웃에 두면 하위 쪽에도 같은 WebPage 가 붙는다).
export default function IntroductionPage() {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: INTRO_PATH,
            name: `클래스인 ${LANDING_META.pageName}`,
            description: LANDING_META.description,
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: LANDING_META.pageName, path: INTRO_PATH },
          ]),
        ]}
      />
      <LandingHero />
      <LandingSoftware />
      <LandingSmartClassroom />
      <LandingCases />
      <LandingFinalCta />
    </>
  )
}
