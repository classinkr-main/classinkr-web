import Link from "next/link"

import { FAQ } from "@/components/sections/FAQ"
import { JsonLd } from "@/components/seo/JsonLd"
import { getPublicFaqItems } from "@/lib/public-faq"
import { createBreadcrumbJsonLd, createFaqJsonLd, createPublicMetadata, createWebPageJsonLd } from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "자주 묻는 질문",
  description: "Classin 소프트웨어와 Classin Board 도입, 기능, 요금제, 설치, 운영 지원, 사용법에 대한 자주 묻는 질문과 답변입니다.",
  path: "/faq",
  keywords: ["Classin FAQ", "Classin 도입", "Classin 요금제", "Classin Board 설치", "Classin 사용법"],
})

export default function FAQPage() {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/faq",
            name: "Classin 자주 묻는 질문",
            description: "Classin 소프트웨어와 Classin Board 도입, 기능, 요금제, 설치, 운영 지원, 사용법에 대한 질문과 답변입니다.",
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "자주 묻는 질문", path: "/faq" },
          ]),
          createFaqJsonLd(getPublicFaqItems()),
        ]}
      />
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
              href="/docs/start"
              className="inline-flex items-center justify-center rounded-full bg-[#084734] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#065c41]"
            >
              Classin 시작하기 가이드
            </Link>
            <Link
              href="/docs/admin"
              className="inline-flex items-center justify-center rounded-full border border-black/[0.08] bg-white px-5 py-2.5 text-sm font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5]"
            >
              관리자 가이드
            </Link>
          </div>
        </div>
        <FAQ />
      </main>
    </>
  )
}
