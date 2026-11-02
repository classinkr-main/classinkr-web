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

// 2~5화면은 폴드 아래 — 첫 청크에서 뺀다
const HomeProblem = dynamic(() => import("@/components/home/HomeProblem").then((m) => ({ default: m.HomeProblem })))
const HomeHow = dynamic(() => import("@/components/home/HomeHow").then((m) => ({ default: m.HomeHow })))
const HomeProof = dynamic(() => import("@/components/home/HomeProof").then((m) => ({ default: m.HomeProof })))
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
      {/* 5화면 관문: 히어로+신뢰 → 문제 → 작동 방식 → 증거 → 파일럿+CTA (스펙 §2-2) */}
      <HomeHero />
      <HomeProblem />
      <HomeHow />
      <HomeProof />
      <HomePilotCta />
    </>
  )
}
