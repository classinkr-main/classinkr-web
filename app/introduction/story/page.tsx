import { StoryCases } from "@/components/introduction/story/StoryCases"
import { StoryClassroom } from "@/components/introduction/story/StoryClassroom"
import { StoryCtaBand } from "@/components/introduction/story/StoryCtaBand"
import { StoryEvidence } from "@/components/introduction/story/StoryEvidence"
import { StoryFinalCta } from "@/components/introduction/story/StoryFinalCta"
import { StoryHero } from "@/components/introduction/story/StoryHero"
import { StoryProblem } from "@/components/introduction/story/StoryProblem"
import { StorySolution } from "@/components/introduction/story/StorySolution"
import { STORY_META, STORY_PATH } from "@/components/introduction/story/story-copy"
import { createPublicMetadata } from "@/lib/seo"

// 상황별 전달 자료(시안 4 · 문제→해결 스토리) — 대표 랜딩은 /introduction 이다.
// 검색 노출(운영자 결정 2026-11-09) — sitemap 등록. 레이아웃은 메타를 두지 않으므로 이 쪽이 자기 canonical 을 갖는다.
export const metadata = createPublicMetadata({
  title: STORY_META.title,
  description: STORY_META.description,
  path: STORY_PATH,
})

// 서버 컴포넌트. 클라이언트 섬은 CTA 계측(TrackedLink)·PDF 계측·영상 재생뿐이다.
// 순서: 표지(문제) → 먹 띠(상담) → 01 문제 → 02 근거 → 03 해결 → 04 교실까지 → 05 고객 사례 → 마무리.
export default function IntroductionStoryPage() {
  return (
    <>
      <StoryHero />
      <StoryCtaBand />
      <StoryProblem />
      <StoryEvidence />
      <StorySolution />
      <StoryClassroom />
      <StoryCases />
      <StoryFinalCta />
    </>
  )
}
