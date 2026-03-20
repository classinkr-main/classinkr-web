import { Hero } from "@/components/sections/Hero"
import { ProblemCost } from "@/components/sections/ProblemCost"
import { BridgeMoment } from "@/components/sections/BridgeMoment"
import dynamic from "next/dynamic"

const Outcomes = dynamic(() => import("@/components/sections/Outcomes").then(m => ({ default: m.Outcomes })))
const SolutionOverview = dynamic(() => import("@/components/sections/SolutionOverview").then(m => ({ default: m.SolutionOverview })))
const KeyUseCases = dynamic(() => import("@/components/sections/KeyUseCases").then(m => ({ default: m.KeyUseCases })))
const DashboardPreview = dynamic(() => import("@/components/sections/DashboardPreview").then(m => ({ default: m.DashboardPreview })))
const ScienceBased = dynamic(() => import("@/components/sections/ScienceBased").then(m => ({ default: m.ScienceBased })))
const SatisfyingClass = dynamic(() => import("@/components/sections/SatisfyingClass").then(m => ({ default: m.SatisfyingClass })))
const CaseStudies = dynamic(() => import("@/components/sections/CaseStudies").then(m => ({ default: m.CaseStudies })))
const Comparison = dynamic(() => import("@/components/sections/Comparison").then(m => ({ default: m.Comparison })))
const FAQ = dynamic(() => import("@/components/sections/FAQ").then(m => ({ default: m.FAQ })))
const FinalCTA = dynamic(() => import("@/components/sections/FinalCTA").then(m => ({ default: m.FinalCTA })))

export default function LandingPage() {
  return (
    <>
      <Hero />
      <ProblemCost />
      <BridgeMoment />
      <Outcomes />
      <SolutionOverview />
      <KeyUseCases />
      <DashboardPreview />
      <ScienceBased />
      <SatisfyingClass />
      <CaseStudies />
      <Comparison />
      <FAQ />
      <FinalCTA />
    </>
  )
}
