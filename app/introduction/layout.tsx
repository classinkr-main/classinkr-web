import type { ReactNode } from "react"

// /introduction 아래 쪽의 검색 정책 — 레이아웃은 메타를 두지 않고, 쪽마다 자기 createPublicMetadata 를 둔다.
// - /introduction(대표 랜딩): 색인 + sitemap. 메타는 app/introduction/page.tsx.
// - /introduction/full(문서형 원문 — 타사 비교표 포함)·/story·/proof·/cases/**: noIndex: true, sitemap 제외.
// 새 하위 쪽을 만들면 반드시 자기 메타(canonical·noIndex)를 둔다 — 여기서 noindex 를 일괄로 걸지 않는다.
export default function IntroductionLayout({ children }: { children: ReactNode }) {
  return children
}
