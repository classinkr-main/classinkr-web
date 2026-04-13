import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "하드웨어",
  description: "Classin 전용 하드웨어로 교실 환경을 스마트하게 바꾸세요. 수업 몰입도를 높이고 교사의 수업 준비 부담을 줄여줍니다.",
  openGraph: {
    title: "하드웨어 | Classin",
    description: "Classin 전용 하드웨어로 교실 환경을 스마트하게 바꾸세요. 수업 몰입도를 높이고 교사의 수업 준비 부담을 줄여줍니다.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "하드웨어 | Classin",
    description: "Classin 전용 하드웨어로 교실 환경을 스마트하게 바꾸세요. 수업 몰입도를 높이고 교사의 수업 준비 부담을 줄여줍니다.",
  },
}

export default function HardwareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
