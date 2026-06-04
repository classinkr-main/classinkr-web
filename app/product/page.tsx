import Link from "next/link"
import { ArrowRight, CheckCircle2, Cpu, Monitor } from "lucide-react"

import { JsonLd } from "@/components/seo/JsonLd"
import { createBreadcrumbJsonLd, createPublicMetadata, createWebPageJsonLd } from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "제품 소개: 소프트웨어와 전자칠판",
  description:
    "Classin 소프트웨어와 Classin Board 전자칠판을 비교하고, 학원 운영 환경에 맞는 도입 구성을 확인하세요.",
  path: "/product",
  keywords: ["Classin 제품", "Classin 소프트웨어", "Classin Board", "학원 운영 플랫폼", "교육용 전자칠판"],
})

const products = [
  {
    name: "Classin 소프트웨어",
    href: "/product/sw",
    icon: Monitor,
    summary: "실시간 수업, 과제 제출, AI 자동채점, 학습 데이터 리포트, 학부모 소통을 하나로 연결합니다.",
    fit: "온라인·오프라인 수업 운영을 표준화하고 싶은 학원",
    points: ["30여 가지 수업 도구", "과제·테스트 관리", "AI 채점·첨삭", "학부모 리포트"],
  },
  {
    name: "Classin Board",
    href: "/product/hw",
    icon: Cpu,
    summary: "판서, AI 카메라 녹화, 수업 영상 업로드, 판서 PDF 공유를 Classin 소프트웨어와 함께 제공합니다.",
    fit: "교실 판서와 녹화, 복습 공유까지 한 번에 정리하고 싶은 학원",
    points: ["65·75·86·110인치", "4K AI 카메라", "50점 터치", "수업 기록 공유"],
  },
]

export default function ProductPage() {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/product",
            name: "Classin 제품 소개",
            description:
              "Classin 소프트웨어와 Classin Board 전자칠판을 비교하고, 학원 운영 환경에 맞는 도입 구성을 확인하는 제품 허브입니다.",
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "제품 소개", path: "/product" },
          ]),
        ]}
      />
      <main className="min-h-screen bg-[#FAFAF8] pt-28">
        <section className="border-b border-black/[0.08] bg-white py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">Product Overview</p>
              <h1 className="mt-4 text-4xl font-black leading-tight text-[#111110] md:text-6xl">
                Classin 제품 구성
              </h1>
              <p className="mt-6 text-lg leading-8 text-[#615D59] md:text-xl">
                Classin은 수업 운영 소프트웨어와 교육용 전자칠판을 함께 제공합니다. 학원의 현재 수업 방식,
                교실 환경, 과제·리포트 운영 수준에 맞춰 필요한 구성부터 선택할 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="py-14 md:py-20">
          <div className="container mx-auto px-4">
            <div className="grid gap-5 lg:grid-cols-2">
              {products.map((product) => (
                <article key={product.name} className="rounded-lg border border-black/[0.08] bg-white p-6 shadow-[0_12px_34px_rgba(17,17,16,0.05)] md:p-8">
                  <div className="flex items-start justify-between gap-5">
                    <div>
                      <div className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] bg-[#ECFDF5] text-[#084734]">
                        <product.icon className="h-5 w-5" />
                      </div>
                      <h2 className="mt-5 text-2xl font-black text-[#111110]">{product.name}</h2>
                    </div>
                    <Link
                      href={product.href}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#084734]/15 px-4 py-2 text-sm font-bold text-[#084734] transition-colors hover:bg-[#ECFDF5]"
                    >
                      자세히 보기
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                  <p className="mt-5 text-base leading-7 text-[#484540]">{product.summary}</p>
                  <p className="mt-4 rounded-[8px] bg-[#F6F5F4] px-4 py-3 text-sm font-semibold leading-6 text-[#615D59]">
                    추천 대상: {product.fit}
                  </p>
                  <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    {product.points.map((point) => (
                      <li key={point} className="flex items-center gap-2 text-sm font-semibold text-[#31302E]">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-[#009060]" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
