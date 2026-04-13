import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "요금제",
  description: "학원 규모와 필요에 맞는 Classin 요금제를 확인하세요. 합리적인 가격으로 학원 운영의 모든 것을 해결할 수 있습니다.",
  openGraph: {
    title: "요금제 | Classin",
    description: "학원 규모와 필요에 맞는 Classin 요금제를 확인하세요. 합리적인 가격으로 학원 운영의 모든 것을 해결할 수 있습니다.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "요금제 | Classin",
    description: "학원 규모와 필요에 맞는 Classin 요금제를 확인하세요. 합리적인 가격으로 학원 운영의 모든 것을 해결할 수 있습니다.",
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
