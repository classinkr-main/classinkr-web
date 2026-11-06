import { IntroCasesSection } from "@/components/introduction/sections/IntroCasesSection"
import { IntroFinalCta } from "@/components/introduction/sections/IntroFinalCta"
import { IntroHero } from "@/components/introduction/sections/IntroHero"
import { IntroSmartClassroomSection } from "@/components/introduction/sections/IntroSmartClassroomSection"
import { IntroSoftwareSection } from "@/components/introduction/sections/IntroSoftwareSection"
import { JsonLd } from "@/components/seo/JsonLd"
import { INTRO_HERO, INTRO_PATH } from "@/lib/introduction/content"
import { createBreadcrumbJsonLd, createWebPageJsonLd } from "@/lib/seo"

// 서버 컴포넌트. 클라이언트 섬은 영상 재생·PDF 계측·CTA 계측뿐이고, 상세 토글은 <details> 라 JS 없이 열린다.
// JSON-LD 는 이 페이지에만 둔다(레이아웃에 두면 하위 사례 페이지에도 같은 WebPage 가 붙는다).
export default function IntroductionPage() {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: INTRO_PATH,
            name: INTRO_HERO.eyebrow,
            description: INTRO_HERO.lead,
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: INTRO_HERO.eyebrow, path: INTRO_PATH },
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
