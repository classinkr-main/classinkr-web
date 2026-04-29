import { FAQ } from "@/components/sections/FAQ"
import Link from "next/link"

export const metadata = {
  title: "자주 묻는 질문 | Classin",
  description: "클래스인 도입, 기능, 요금제에 대한 자주 묻는 질문과 답변입니다.",
}

export default function FAQPage() {
  return (
    <main className="min-h-screen bg-white pt-24 md:pt-28">
      <div className="container mx-auto mb-12 text-center md:mb-16">
        <span className="inline-block py-1 px-3 rounded-full bg-[#ECFDF5] text-[#084734] text-sm font-semibold mb-4">
          FAQ
        </span>
        <h1 className="break-keep text-[2.35rem] font-black text-[#111110] md:text-5xl" style={{ letterSpacing: '-1.5px' }}>
          자주 묻는 질문
        </h1>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/docs/help/faq"
            className="inline-flex items-center justify-center rounded-full bg-[#084734] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#065c41]"
          >
            문서센터 FAQ 보기
          </Link>
          <Link
            href="/docs/troubleshooting"
            className="inline-flex items-center justify-center rounded-full border border-black/[0.08] bg-white px-5 py-2.5 text-sm font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5]"
          >
            문제 해결 가이드
          </Link>
        </div>
      </div>
      <FAQ />
    </main>
  )
}
