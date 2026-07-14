import type { Metadata } from "next"

import { DownloadPageClient } from "./DownloadPageClient"
import { createBreadcrumbJsonLd, createPublicMetadata, createWebPageJsonLd } from "@/lib/seo"
import { JsonLd } from "@/components/seo/JsonLd"

export const metadata: Metadata = createPublicMetadata({
  title: "다운로드",
  description:
    "수업에 필요한 Classin 앱을 Windows, macOS, iOS, Android 등 기기에 맞게 내려받으세요.",
  path: "/download",
  keywords: ["Classin 다운로드", "클래스인 설치", "Classin Windows", "Classin Mac", "Classin 앱"],
})

export default function DownloadPage() {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/download",
            name: "Classin 앱 다운로드",
            description: "수업에 필요한 Classin 앱을 기기에 맞게 내려받으세요.",
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "다운로드", path: "/download" },
          ]),
        ]}
      />
      <DownloadPageClient />
    </>
  )
}
