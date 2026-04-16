import { FAQ } from "@/components/sections/FAQ"
import { createPublicMetadata } from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "자주 묻는 질문",
  description: "클래스인 도입, 기능, 요금제에 대한 자주 묻는 질문과 답변입니다.",
  path: "/faq",
})

export default function FAQPage() {
  return (
    <main className="min-h-screen bg-white pt-24">
      <div className="container mx-auto px-4 mb-16 text-center">
        <span className="inline-block py-1 px-3 rounded-full bg-[#ECFDF5] text-[#084734] text-sm font-semibold mb-4">
          FAQ
        </span>
        <h1 className="text-4xl md:text-5xl font-black text-[#111110] break-keep" style={{ letterSpacing: '-1.5px' }}>
          자주 묻는 질문
        </h1>
      </div>
      <FAQ />
    </main>
  )
}
