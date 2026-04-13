import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "소프트웨어",
  description: "Classin 소프트웨어로 수업 관리, 학습 데이터 분석, 학부모 소통까지 한 번에 — 학원 운영의 모든 과정을 디지털로 전환하세요.",
  openGraph: {
    title: "소프트웨어 | Classin",
    description: "Classin 소프트웨어로 수업 관리, 학습 데이터 분석, 학부모 소통까지 한 번에 — 학원 운영의 모든 과정을 디지털로 전환하세요.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "소프트웨어 | Classin",
    description: "Classin 소프트웨어로 수업 관리, 학습 데이터 분석, 학부모 소통까지 한 번에 — 학원 운영의 모든 과정을 디지털로 전환하세요.",
  },
}

export default function SoftwareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
