import { JsonLd } from "@/components/seo/JsonLd"
import {
  createBreadcrumbJsonLd,
  createPublicMetadata,
  createSoftwareProductJsonLd,
  createWebPageJsonLd,
  SOFTWARE_PRODUCT_ID,
} from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "소프트웨어: 수업·과제·AI 채점",
  description:
    "Classin 소프트웨어는 실시간 수업, 과제 제출, AI 자동채점, 학습 데이터 리포트, 학부모 소통을 통합하는 학원 수업 운영 플랫폼입니다.",
  path: "/product/sw",
  keywords: ["Classin 소프트웨어", "학원 수업 플랫폼", "AI 자동채점", "과제 관리", "학부모 리포트"],
})

export default function SoftwareLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/product/sw",
            name: "Classin 소프트웨어",
            description:
              "Classin 소프트웨어는 실시간 수업, 수업 도구, 과제 제출, AI 자동채점, 학습 데이터 리포트, 학부모 소통을 하나의 흐름으로 연결합니다.",
            mainEntity: { "@id": SOFTWARE_PRODUCT_ID },
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "제품 소개", path: "/product" },
            { name: "Classin 소프트웨어", path: "/product/sw" },
          ]),
          createSoftwareProductJsonLd(),
        ]}
      />
      {children}
    </>
  )
}
