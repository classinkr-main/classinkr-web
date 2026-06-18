import type { Metadata } from "next"

import { ResourcesHubClient } from "./ResourcesHubClient"
import { createBreadcrumbJsonLd, createPublicMetadata, createWebPageJsonLd } from "@/lib/seo"
import { JsonLd } from "@/components/seo/JsonLd"
import { getAllLeadMagnets } from "@/lib/repositories/lead-magnets"

export const revalidate = 3600

export const metadata: Metadata = createPublicMetadata({
  title: "무료 자료",
  description:
    "Classin 도입을 검토하는 학원이 운영 누수, 전자칠판 구축, 도입 전 22가지 질문, 쇼룸 데모, 강사 온보딩, 복습 상담, ROI, 관리자 데이터, API 자동화 자료를 한곳에서 확인할 수 있는 자료실입니다.",
  path: "/resources",
  keywords: ["Classin 자료", "학원 운영 체크리스트", "전자칠판 체크리스트", "도입 전 질문", "Classin API", "학원 ROI", "쇼룸 데모", "강사 온보딩", "도입 가이드"],
})

export default async function ResourcesPage() {
  const leadMagnets = await getAllLeadMagnets()

  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/resources",
            name: "Classin 무료 자료",
            description:
              "Classin 도입을 검토하는 학원이 운영 누수, 교실 구축, 도입 전 22가지 질문, 쇼룸 데모, 강사 온보딩, 복습 상담, ROI, 관리자 데이터, API 자동화 자료를 확인할 수 있는 자료실입니다.",
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "무료 자료", path: "/resources" },
          ]),
        ]}
      />
      <ResourcesHubClient resources={leadMagnets} />
    </>
  )
}
