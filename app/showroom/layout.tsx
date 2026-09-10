import { createPublicMetadata } from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "목동 쇼룸 상담 예약",
  description:
    "목동 쇼룸에서 EDB 교안 · 판서 · 녹화 · 복습이 한 흐름으로 이어지는 실제 수업 운영을 확인하세요. 원하는 날짜와 시간을 골라 60분 상담을 예약할 수 있습니다.",
  path: "/showroom",
  keywords: [
    "목동 쇼룸",
    "Classin 쇼룸",
    "전자칠판 체험",
    "학원 전자칠판 데모",
    "수업 녹화 시연",
    "Classin 상담 예약",
  ],
})

export default function ShowroomLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
