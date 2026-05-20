import { JsonLd } from "@/components/seo/JsonLd"
import {
  createBreadcrumbJsonLd,
  createHardwareProductJsonLd,
  createPublicMetadata,
  createWebPageJsonLd,
  HARDWARE_PRODUCT_ID,
} from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "Classin Board 전자칠판",
  description:
    "Classin Board는 판서, 4K AI 카메라 자동 추적, 수업 영상 업로드, 판서 PDF 공유, Classin 소프트웨어 연동을 제공하는 교육용 전자칠판입니다.",
  path: "/product/hw",
  keywords: ["Classin Board", "교육용 전자칠판", "AI 카메라", "스마트 교실", "판서 PDF"],
})

export default function HardwareLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/product/hw",
            name: "Classin Board 전자칠판",
            description:
              "Classin Board는 판서, 4K AI 카메라 자동 추적, 수업 영상 업로드, 판서 PDF 공유, Classin 소프트웨어 연동을 제공하는 교육용 전자칠판입니다.",
            mainEntity: { "@id": HARDWARE_PRODUCT_ID },
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "제품 소개", path: "/product" },
            { name: "Classin Board", path: "/product/hw" },
          ]),
          createHardwareProductJsonLd(),
        ]}
      />
      {children}
    </>
  )
}
