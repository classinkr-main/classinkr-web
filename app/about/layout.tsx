import { createPublicMetadata } from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "회사 소개",
  description:
    "Classin과 EEO가 어떻게 교육의 품질을 시스템으로 만들고 있는지, 글로벌 교육 플랫폼의 비전과 연혁을 확인해 보세요.",
  path: "/about",
})

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
