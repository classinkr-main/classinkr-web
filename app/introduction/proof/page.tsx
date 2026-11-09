import { ProofAllCases } from "@/components/introduction/proof/ProofAllCases"
import { ProofFinalCta } from "@/components/introduction/proof/ProofFinalCta"
import { ProofHero } from "@/components/introduction/proof/ProofHero"
import { ProofInstitutions } from "@/components/introduction/proof/ProofInstitutions"
import { ProofProduct } from "@/components/introduction/proof/ProofProduct"
import { ProofStories } from "@/components/introduction/proof/ProofStories"
import { ProofVideos } from "@/components/introduction/proof/ProofVideos"
import { PROOF_META, PROOF_PATH } from "@/components/introduction/proof/proof-copy"
import { createPublicMetadata } from "@/lib/seo"

// 상황별 전달 자료(시안 5 · 현장 사례 중심). 대표 랜딩은 /introduction 이고 이 쪽은 링크로 건네는 자료라
// 검색 노출(운영자 결정 2026-11-09) — sitemap 등록. 레이아웃은 메타를 두지 않으므로 이 페이지 메타를 따로 둔다.
export const metadata = createPublicMetadata({
  title: PROOF_META.title,
  description: PROOF_META.description,
  path: PROOF_PATH,
})

// 서버 컴포넌트. 클라이언트 섬은 CTA·PDF 계측, 영상 재생, 사례 분야 필터뿐이다.
// 지면: paper 표지 → sunken 기관 띠 → paper 사례 → 먹 영상(페이지의 먹 한 곳) → paper 제품·전체 사례 → sunken 마무리.
export default function IntroductionProofPage() {
  return (
    <>
      <ProofHero />
      <ProofInstitutions />
      <ProofStories />
      <ProofVideos />
      <ProofProduct />
      <ProofAllCases />
      <ProofFinalCta />
    </>
  )
}
