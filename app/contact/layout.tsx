import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "문의하기",
  description: "Classin 도입 상담, 서비스 문의, 파트너십 제안 등 무엇이든 편하게 문의해 주세요. 빠르게 답변드리겠습니다.",
  openGraph: {
    title: "문의하기 | Classin",
    description: "Classin 도입 상담, 서비스 문의, 파트너십 제안 등 무엇이든 편하게 문의해 주세요. 빠르게 답변드리겠습니다.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "문의하기 | Classin",
    description: "Classin 도입 상담, 서비스 문의, 파트너십 제안 등 무엇이든 편하게 문의해 주세요. 빠르게 답변드리겠습니다.",
  },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
