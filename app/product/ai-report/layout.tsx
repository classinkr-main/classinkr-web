import { JsonLd } from "@/components/seo/JsonLd"
import { AI_REPORT_QA } from "@/lib/ai-report-content"
import {
  createBreadcrumbJsonLd,
  createFaqJsonLd,
  createPublicMetadata,
  createWebPageJsonLd,
} from "@/lib/seo"

// 녹화 검색어("수업 녹화"·"학원 수업 녹화")는 /product/recording 이 받는다 — 여기는 AI 강의 평가·리포트로만 잡는다
export const metadata = createPublicMetadata({
  title: "AI 강의 평가: 참관 없이 보는 수업 리포트",
  description:
    "Classin AI 강의 평가는 녹화된 수업의 음성을 텍스트로 옮기고, AI가 수업 내용을 리포트로 정리합니다. 원장님이 교실에 없어도 학원의 모든 수업이 보입니다.",
  path: "/product/ai-report",
  keywords: ["AI 강의 평가", "AI 강의 분석", "AI 수업 리포트", "수업 음성인식", "학원 수업 관리"],
})

export default function AiReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/product/ai-report",
            name: "AI 강의 평가",
            description:
              "녹화된 수업을 음성인식과 AI 리포트로 정리해, 원장이 교실에 없어도 학원의 모든 수업을 확인하는 Classin의 AI 강의 평가.",
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "제품 소개", path: "/product" },
            { name: "AI 강의 평가", path: "/product/ai-report" },
          ]),
          createFaqJsonLd(AI_REPORT_QA),
        ]}
      />
      {children}
    </>
  )
}
