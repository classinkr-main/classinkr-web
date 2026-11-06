import type { ReactNode } from "react"

import { INTRO_PATH } from "@/lib/introduction/content"
import { createPublicMetadata } from "@/lib/seo"

// 영업 자료(소개서)라 검색에 내지 않는다 — 제품 페이지와 내용이 겹치고 원문의 타사 비교표를 그대로 싣는다.
// 그래서 sitemap·헤더·푸터에도 넣지 않는다. robots(noindex, nofollow)는 하위 /introduction/cases 까지 이어진다.
export const metadata = createPublicMetadata({
  title: "클래스인 서비스 소개서 — 가장 교실다운 AI 교육 플랫폼",
  description:
    "클래스인 소프트웨어 특장점, 클래스인 X AI 스마트 교실 구성과 하드웨어 스펙, 학원·학교의 수업 영상과 스마트 교실 사례를 한 페이지에 모은 서비스 소개서입니다. 소개서 PDF도 내려받을 수 있습니다.",
  path: INTRO_PATH,
  noIndex: true,
})

export default function IntroductionLayout({ children }: { children: ReactNode }) {
  return children
}
