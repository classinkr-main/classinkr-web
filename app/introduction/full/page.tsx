import { IntroCasesSection } from "@/components/introduction/sections/IntroCasesSection"
import { IntroFinalCta } from "@/components/introduction/sections/IntroFinalCta"
import { IntroHero } from "@/components/introduction/sections/IntroHero"
import { IntroSmartClassroomSection } from "@/components/introduction/sections/IntroSmartClassroomSection"
import { IntroSoftwareSection } from "@/components/introduction/sections/IntroSoftwareSection"
import { JsonLd } from "@/components/seo/JsonLd"
import { INTRO_HERO, INTRO_PATH } from "@/lib/introduction/content"
import { createBreadcrumbJsonLd, createPublicMetadata, createWebPageJsonLd } from "@/lib/seo"

const FULL_PATH = `${INTRO_PATH}/full`
const FULL_NAME = "서비스 소개서 전체"

// 소개서 원문 전체(문서형, 타사 비교표 포함). 검색 노출(운영자 결정 2026-11-09) — sitemap 등록.
// 대표 랜딩(/introduction)의 '소개서 전체 보기' 링크로도 들어온다.
export const metadata = createPublicMetadata({
  title: "클래스인 서비스 소개서 전체 — 가장 교실다운 AI 교육 플랫폼",
  description:
    "클래스인 소프트웨어 특장점, 클래스인 X AI 스마트 교실 구성과 하드웨어 스펙, 학원·학교의 수업 영상과 스마트 교실 사례를 한 페이지에 모은 서비스 소개서입니다. 소개서 PDF도 내려받을 수 있습니다.",
  path: FULL_PATH,
})

// 서버 컴포넌트. 클라이언트 섬은 영상 재생·PDF 계측·CTA 계측뿐이고, 상세 토글은 <details> 라 JS 없이 열린다.
// JSON-LD 는 이 페이지에만 둔다(레이아웃에 두면 하위 사례 페이지에도 같은 WebPage 가 붙는다).
export default function IntroductionFullPage() {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: FULL_PATH,
            name: `${INTRO_HERO.eyebrow} 전체`,
            description: INTRO_HERO.lead,
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "서비스 소개서", path: INTRO_PATH },
            { name: FULL_NAME, path: FULL_PATH },
          ]),
        ]}
      />
      <IntroHero />
      <IntroSoftwareSection />
      <IntroSmartClassroomSection />
      <IntroCasesSection />
      <IntroFinalCta />
    </>
  )
}
