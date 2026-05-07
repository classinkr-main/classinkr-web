import { createPublicMetadata } from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "문의하기",
  description:
    "Classin 도입 상담, 서비스 문의, 파트너십 제안 등 무엇이든 편하게 문의해 주세요. 빠르게 답변드리겠습니다.",
  path: "/contact",
})

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
