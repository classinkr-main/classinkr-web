import type { Metadata } from "next"
import { Hero } from "@/components/sections/Hero"
import { LogoBar } from "@/components/sections/LogoBar"
import { EraVision } from "@/components/sections/EraVision"
import { ProblemCost } from "@/components/sections/ProblemCost"
import { Manifesto } from "@/components/sections/Manifesto"
import dynamic from "next/dynamic"
import { createPublicMetadata } from "@/lib/seo"

export const metadata: Metadata = createPublicMetadata({
  description:
    "학원 운영을 데이터 기반으로 혁신하는 Classin — 수업 관리, 학습 성과 분석, 행정 자동화까지 하나의 플랫폼으로 해결하세요.",
  path: "/",
})

const Outcomes = dynamic(() => import("@/components/sections/Outcomes").then(m => ({ default: m.Outcomes })))
const SolutionOverview = dynamic(() => import("@/components/sections/SolutionOverview").then(m => ({ default: m.SolutionOverview })))
const KeyUseCases = dynamic(() => import("@/components/sections/KeyUseCases").then(m => ({ default: m.KeyUseCases })))
const DashboardPreview = dynamic(() => import("@/components/sections/DashboardPreview").then(m => ({ default: m.DashboardPreview })))
const ScienceBased = dynamic(() => import("@/components/sections/ScienceBased").then(m => ({ default: m.ScienceBased })))
const SatisfyingClass = dynamic(() => import("@/components/sections/SatisfyingClass").then(m => ({ default: m.SatisfyingClass })))
const CaseStudies = dynamic(() => import("@/components/sections/CaseStudies").then(m => ({ default: m.CaseStudies })))
const TestimonialWall = dynamic(() => import("@/components/sections/TestimonialWall").then(m => ({ default: m.TestimonialWall })))
const Comparison = dynamic(() => import("@/components/sections/Comparison").then(m => ({ default: m.Comparison })))
const FinalCTA = dynamic(() => import("@/components/sections/FinalCTA").then(m => ({ default: m.FinalCTA })))

export default function LandingPage() {
  return (
    <>
      {/* Act 1: 선언 — 에이스 강사 없이도 1등 학원 */}
      <Hero />
      <LogoBar />

      {/* Act 2: 시대 — 기술과 교육의 결합 */}
      <EraVision />

      {/* Act 3: 공감 — 원장이 겪는 현실 */}
      <ProblemCost />

      {/* Act 3: 전환점 — 수업은 개인기가 아니다 */}
      <Manifesto />

      {/* Act 4: 솔루션 — 어떻게 시스템으로 만드나 */}
      <SolutionOverview />
      <KeyUseCases />

      {/* Act 5: 증거 — 데이터·과학·사례 */}
      <DashboardPreview />
      <ScienceBased />
      <SatisfyingClass />
      <CaseStudies />
      <TestimonialWall />
      <Outcomes />

      {/* Act 6: 확신 — 전환 결정 */}
      <Comparison />
      <FinalCTA />
    </>
  )
}
