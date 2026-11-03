import type { Metadata } from "next"
import dynamic from "next/dynamic"
import { HomeHero } from "@/components/home/HomeHero"
import { JsonLd } from "@/components/seo/JsonLd"
import { createBreadcrumbJsonLd, createPublicMetadata, createWebPageJsonLd, DEFAULT_SITE_TITLE } from "@/lib/seo"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"

export const metadata: Metadata = createPublicMetadata({
  // <title> 과 og:title · twitter:title 이 같은 문자열이 되도록 absoluteTitle 로 한 번만 지정한다.
  // 제목·설명은 2026-10-28 SEO·AEO 진단 추천안(검색 범주어 병기)을 운영자가 채택한 값이다 —
  // 문자열 정본은 lib/seo.ts(DEFAULT_SITE_TITLE)·lib/classin-positioning.ts(metadataDescription).
  // 본문 카테고리명은 그대로 "수업 시스템 OS"다(docs/active/classin-korea-positioning-guidelines.md §11).
  absoluteTitle: DEFAULT_SITE_TITLE,
  description: CLASSIN_POSITIONING.metadataDescription,
  path: "/",
  keywords: ["클래스인", "Classin", "학원 전자칠판", "수업 녹화", "학원 수업 운영", "수업 시스템 OS", "EDB"],
})

// 히어로 아래는 폴드 아래 — 첫 청크에서 뺀다
const HomeAcademies = dynamic(() => import("@/components/home/HomeAcademies").then((m) => ({ default: m.HomeAcademies })))
const HomeGains = dynamic(() => import("@/components/home/HomeGains").then((m) => ({ default: m.HomeGains })))
const HomeRoles = dynamic(() => import("@/components/home/HomeRoles").then((m) => ({ default: m.HomeRoles })))
const HomeProof = dynamic(() => import("@/components/home/HomeProof").then((m) => ({ default: m.HomeProof })))
const HomeExplore = dynamic(() => import("@/components/home/HomeExplore").then((m) => ({ default: m.HomeExplore })))
const HomePilotCta = dynamic(() => import("@/components/home/HomePilotCta").then((m) => ({ default: m.HomePilotCta })))

export default function LandingPage() {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/",
            name: DEFAULT_SITE_TITLE,
            description: CLASSIN_POSITIONING.metadataDescription,
          }),
          createBreadcrumbJsonLd([{ name: "홈", path: "/" }]),
        ]}
      />
      {/* 히어로+숫자 → 학원 띠 → 이득 3행 → 역할별 표 → 증거 → 둘러보기 → 파일럿 먹 띠 (스펙 §8, 캔버스 B-T2) */}
      <HomeHero />
      <HomeAcademies />
      <HomeGains />
      <HomeRoles />
      <HomeProof />
      <HomeExplore />
      <HomePilotCta />
    </>
  )
}
