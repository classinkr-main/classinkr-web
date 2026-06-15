import type { Metadata } from "next"

import { ResourcesHubClient } from "./ResourcesHubClient"
import { createBreadcrumbJsonLd, createPublicMetadata, createWebPageJsonLd } from "@/lib/seo"
import { JsonLd } from "@/components/seo/JsonLd"
import { getAllLeadMagnets } from "@/lib/repositories/lead-magnets"

export const revalidate = 3600

export const metadata: Metadata = createPublicMetadata({
  title: "무료 자료",
  description:
    "Classin 도입을 검토하는 학원이 운영 점검, 교실 구축, 도입 준비 자료를 한곳에서 확인할 수 있는 자료실입니다.",
  path: "/resources",
  keywords: ["Classin 자료", "학원 운영 체크리스트", "전자칠판 체크리스트", "도입 가이드"],
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
              "Classin 도입을 검토하는 학원이 운영 점검, 교실 구축, 도입 준비 자료를 확인할 수 있는 자료실입니다.",
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
