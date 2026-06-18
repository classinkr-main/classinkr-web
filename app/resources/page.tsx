import type { Metadata } from "next"

import { ResourcesHubClient, type ResourceHubItem } from "./ResourcesHubClient"
import { createBreadcrumbJsonLd, createPublicMetadata, createWebPageJsonLd } from "@/lib/seo"
import { JsonLd } from "@/components/seo/JsonLd"
import {
  getLeadMagnetCategoryLabel,
  getLeadMagnetItemCount,
  getLeadMagnetTierLabel,
} from "@/lib/lead-magnets"
import { getPublishedLeadMagnets } from "@/lib/repositories/lead-magnets"

export const revalidate = 3600

export const metadata: Metadata = createPublicMetadata({
  title: "자료 받아보기",
  description:
    "Classin 도입 전 검토에 필요한 학원 운영, 전자칠판, 수업 시스템 PDF 자료를 받아보세요.",
  path: "/resources",
  keywords: ["Classin 자료", "Classin PDF", "학원 운영 자료", "전자칠판 체크리스트", "학원 시스템 도입"],
})

export default async function ResourcesPage() {
  const magnets = await getPublishedLeadMagnets()
  const resources: ResourceHubItem[] = magnets.map((magnet) => ({
    slug: magnet.slug,
    title: magnet.title,
    summary: magnet.summary,
    subtitle: magnet.pdfGuide?.subtitle ?? magnet.summary,
    outcome: magnet.pdfGuide?.outcome ?? magnet.summary,
    categoryLabel: getLeadMagnetCategoryLabel(magnet.category),
    tierLabel: getLeadMagnetTierLabel(magnet.tier),
    formatLabel: magnet.formatLabel,
    estimatedMinutes: magnet.estimatedMinutes,
    itemCount: getLeadMagnetItemCount(magnet),
  }))

  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/resources",
            name: "Classin 자료 받아보기",
            description:
              "Classin 도입 전 검토에 필요한 학원 운영, 전자칠판, 수업 시스템 PDF 자료를 받아보세요.",
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "자료 받아보기", path: "/resources" },
          ]),
        ]}
      />
      <ResourcesHubClient resources={resources} />
    </>
  )
}
