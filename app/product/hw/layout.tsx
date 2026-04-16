import { createPublicMetadata } from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "하드웨어",
  description:
    "판서, 기록, 공유, 복습까지 한 흐름으로 이어지는 교육 전용 보드. ClassIn Board는 수업의 완성도와 운영의 단순함을 함께 설계합니다.",
  path: "/product/hw",
})

export default function HardwareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
