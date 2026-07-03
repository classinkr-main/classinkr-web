"use client"

// below-the-fold 클라이언트 섹션은 client boundary 안에서 dynamic import 해야
// 초기 First Load JS에서 빠진다 (서버 컴포넌트의 dynamic은 hydration용으로 preload됨).
// SSR은 유지되어 초기 HTML은 동일하다.
import dynamic from "next/dynamic"

export const OnboardingRoadmap = dynamic(() => import("./OnboardingRoadmap"))
export const AIFeaturesSection = dynamic(() => import("./AIFeaturesSection"))
export const AnalyticsSection = dynamic(() => import("./AnalyticsSection"))
export const FAQSection = dynamic(() => import("./FAQSection"))
export const FinalCTASection = dynamic(() => import("./FinalCTASection"))
export const FutureVision2Section = dynamic(() => import("./FutureVision2Section"))
export const NetworkStatsSection = dynamic(() => import("./NetworkStatsSection"))
export const PricingValueSection = dynamic(() => import("./PricingValueSection"))
