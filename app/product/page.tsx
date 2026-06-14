import Link from "next/link"
import Image from "next/image"
import { ArrowRight, CheckCircle2, Pencil, Presentation } from "lucide-react"

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
    icon: Pencil,
    summary: "실시간 수업, 과제 제출, AI 자동채점, 학습 데이터 리포트, 학부모 소통을 하나로 연결합니다.",
    fit: "온라인·오프라인 수업 운영을 표준화하고 싶은 학원",
    points: ["30여 가지 수업 도구", "과제·테스트 관리", "AI 채점·첨삭", "학부모 리포트"],
  },
  {
    name: "Classin Board",
    href: "/product/hw",
    icon: Presentation,
    summary: "판서, AI 카메라 녹화, 수업 영상 업로드, 판서 PDF 공유를 Classin 소프트웨어와 함께 제공합니다.",
    fit: "교실 판서와 녹화, 복습 공유까지 한 번에 정리하고 싶은 학원",
    points: ["65·75·86·110인치", "4K AI 카메라", "50점 터치", "수업 기록 공유"],
  },
]

const productFamily = [
  {
    name: "클래스인",
    en: "ClassIn",
    logo: "/images/products/classin.png",
    lw: 263,
    lh: 77,
    tag: "국내 제공",
    tone: "green",
    desc: "실시간 화상 수업과 LMS를 통합한 온·오프라인·하이브리드 교육 플랫폼.",
    note: "국내명: Classin 소프트웨어",
  },
  {
    name: "클래스인 X",
    en: "ClassIn X",
    logo: "/images/products/classin-x.png",
    lw: 289,
    lh: 68,
    tag: "국내 제공",
    tone: "green",
    desc: "하이브리드 교실을 위한 인터랙티브 전자칠판·AI 카메라·마이크 하드웨어.",
    note: "국내명: Classin Board · iF 디자인 어워드 수상",
  },
  {
    name: "노북",
    en: "NOBOOK",
    logo: "/images/products/nobook.png",
    lw: 337,
    lh: 83,
    tag: "글로벌",
    tone: "neutral",
    desc: "물리·화학·생물 가상 실험(시뮬레이션) 도구.",
    note: "EEO 글로벌 제품",
  },
  {
    name: "티처인",
    en: "TeacherIn",
    logo: "/images/products/teacherin.png",
    lw: 332,
    lh: 80,
    tag: "글로벌",
    tone: "neutral",
    desc: "교사가 커리큘럼·코스웨어를 함께 설계하고 공유하는 플랫폼.",
    note: "EEO 글로벌 제품 · 2023 출시",
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

        <section className="border-t border-black/[0.08] bg-[#F6F5F4] py-14 md:py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">EEO Product Family</p>
              <h2 className="mt-4 text-3xl font-black leading-tight text-[#111110] md:text-4xl">
                EEO 글로벌 제품군
              </h2>
              <p className="mt-5 text-base leading-7 text-[#615D59] md:text-lg">
                Classin은 글로벌 에듀테크 기업 EEO(Empower Education Online)의 제품군입니다. 한국에서 제공하는
                Classin 소프트웨어와 Classin Board는 아래 제품군 위에서 운영됩니다.
              </p>
            </div>
            <div className="mt-10 overflow-hidden rounded-lg border border-black/[0.08] bg-[#ECFDF5]">
              <Image
                src="/images/brand/eeo-family.png"
                alt="EEO 제품군 — Classin · Classin X · TeacherIn · Flowin · NOBOOK"
                width={3840}
                height={1456}
                className="h-auto w-full"
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {productFamily.map((product) => (
                <div
                  key={product.en}
                  className="group rounded-lg border border-black/[0.08] bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-[#084734]/20 hover:shadow-[0_14px_34px_rgba(17,17,16,0.07)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Image
                      src={product.logo}
                      alt={product.en}
                      width={product.lw}
                      height={product.lh}
                      className="h-[26px] w-auto"
                    />
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        product.tone === "green"
                          ? "bg-[#ECFDF5] text-[#084734]"
                          : "bg-[#F6F5F4] text-[#615D59]"
                      }`}
                    >
                      {product.tag}
                    </span>
                  </div>
                  <p className="mt-5 text-sm font-bold text-[#31302E]">{product.name}</p>
                  <p className="mt-1.5 text-sm leading-6 text-[#484540]">{product.desc}</p>
                  <p className="mt-4 border-t border-black/[0.06] pt-3 text-xs font-semibold leading-5 text-[#615D59]">
                    {product.note}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
