import type { ReactNode } from "react"

// /introduction 아래 쪽의 검색 정책 — 레이아웃은 메타를 두지 않고, 쪽마다 자기 createPublicMetadata 를 둔다.
// - 모든 쪽(대표 랜딩·/full·/story·/proof·/cases/**)을 색인하고 sitemap 에 싣는다(운영자 결정 2026-11-09).
// 새 하위 쪽을 만들면 자기 메타(canonical)를 두고 app/sitemap.ts 에도 더한다.
export default function IntroductionLayout({ children }: { children: ReactNode }) {
  return children
}
