import { JsonLd } from "@/components/seo/JsonLd"
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

// FAQ 텍스트는 page.tsx의 FAQ_ITEMS와 동일하게 유지한다 (한쪽 수정 시 함께 수정)
const FAQ_JSON_LD_ITEMS = [
  {
    question: "수업 녹화본의 저작권은 누가 갖나요?",
    answer:
      "녹화본의 저작권은 해당 기관과 강사에게 있습니다. Classin은 앱 내 재생만 허용하고 외부 다운로드를 차단하며, 재생 시 워터마크를 제공해 무단 배포를 막습니다.",
  },
  {
    question: "도입이 복잡하지 않나요?",
    answer:
      "녹화와 AI 리포트는 Classin 소프트웨어에 포함된 흐름입니다. 별도 장비나 프로그램 없이 1개 교실 파일럿부터 시작할 수 있습니다.",
  },
  {
    question: "비용은 어떻게 되나요?",
    answer:
      "학원 규모와 구성에 따라 달라집니다. 상담을 통해 학원에 맞는 구성과 견적을 안내해 드립니다.",
  },
]

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
          createFaqJsonLd(FAQ_JSON_LD_ITEMS),
        ]}
      />
      {children}
    </>
  )
}
