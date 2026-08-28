import { JsonLd } from "@/components/seo/JsonLd"
import { AI_REPORT_QA } from "@/lib/ai-report-content"
import {
  createBreadcrumbJsonLd,
  createFaqJsonLd,
  createPublicMetadata,
  createWebPageJsonLd,
} from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "수업 녹화와 AI 리포트: 녹화부터 리포트까지 자동으로",
  description:
    "Classin은 수업을 자동 녹화하고, 음성인식으로 수업 내용을 AI 리포트로 정리합니다. 원장님이 교실에 없어도 학원의 모든 수업이 보입니다.",
  path: "/product/ai-report",
  keywords: ["수업 녹화", "학원 수업 녹화", "AI 수업 리포트", "수업 음성인식", "학원 수업 관리"],
})

export default function AiReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/product/ai-report",
            name: "수업 녹화와 AI 리포트",
            description:
              "수업 자동 녹화, 음성인식, AI 리포트로 학원의 모든 수업을 기록하고 확인하는 Classin의 수업 기록 흐름.",
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "제품 소개", path: "/product" },
            { name: "녹화 · AI 리포트", path: "/product/ai-report" },
          ]),
          createFaqJsonLd(AI_REPORT_QA),
        ]}
      />
      {children}
    </>
  )
}
