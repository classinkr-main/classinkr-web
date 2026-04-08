import { Hero } from "@/components/sections/Hero"
import { LogoBar } from "@/components/sections/LogoBar"
import { ProblemCost } from "@/components/sections/ProblemCost"
import { Manifesto } from "@/components/sections/Manifesto"
import dynamic from "next/dynamic"

const SolutionOverview = dynamic(() => import("@/components/sections/SolutionOverview").then(m => ({ default: m.SolutionOverview })))
const DashboardPreview = dynamic(() => import("@/components/sections/DashboardPreview").then(m => ({ default: m.DashboardPreview })))
const CaseStudies = dynamic(() => import("@/components/sections/CaseStudies").then(m => ({ default: m.CaseStudies })))
const Comparison = dynamic(() => import("@/components/sections/Comparison").then(m => ({ default: m.Comparison })))
const FinalCTA = dynamic(() => import("@/components/sections/FinalCTA").then(m => ({ default: m.FinalCTA })))

export default function LandingPage() {
  return (
    <>
      <Hero />
      <LogoBar />
      <ProblemCost />
      <Manifesto />
      <SolutionOverview />
      <DashboardPreview />
      <CaseStudies />
      <Comparison />
      <FinalCTA />
    </>
  )
}
