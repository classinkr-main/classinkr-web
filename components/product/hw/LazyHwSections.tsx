"use client"

// below-the-fold 클라이언트 섹션은 client boundary 안에서 dynamic import 해야
// 초기 First Load JS에서 빠진다 (서버 컴포넌트의 dynamic은 hydration용으로 preload됨).
// SSR은 유지되어 초기 HTML은 동일하다.
import dynamic from "next/dynamic"

export const OpeningStatement = dynamic(() => import("./OpeningStatement"))
export const PainPointsV2 = dynamic(() => import("./PainPointsV2"))
export const AllInOneStatement = dynamic(() => import("./AllInOneStatement"))
export const BigBackdropImage = dynamic(() => import("./BigBackdropImage"))
export const DesignDetails = dynamic(() => import("./DesignDetails"))
export const LatencyProof = dynamic(() => import("./LatencyProof"))
export const AICameraSection = dynamic(() => import("./AICameraSection"))
export const SizeChooser = dynamic(() => import("./SizeChooser"))
export const ValueAnchor = dynamic(() => import("./ValueAnchor"))
export const ClassroomStudioSection = dynamic(() => import("./ClassroomStudioSection"))
export const AfterClassSection = dynamic(() => import("./AfterClassSection"))
export const OnboardingRoadmap = dynamic(() => import("./OnboardingRoadmap"))
export const ComparisonSection = dynamic(() => import("./ComparisonSection"))
export const FeatureTabSection = dynamic(() => import("./FeatureTabSection"))
export const ImpactNumbersSection = dynamic(() => import("./ImpactNumbersSection"))
export const SpaceScenarioSection = dynamic(() => import("./SpaceScenarioSection"))
