import { createPublicMetadata } from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "클래스인 도입 상담·기술 지원",
  description:
    "학원·교육기관의 Classin 도입 상담, 전자칠판·수업 녹화 문의, 기술 지원과 결제 증빙 요청을 남길 수 있습니다.",
  path: "/contact",
})

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
