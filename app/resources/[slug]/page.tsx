import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react"
import { leadMagnets, getLeadMagnetBySlug } from "@/lib/lead-magnets"

// 구독 완료 후 열람하는 자료 — 검색 노출 대신 게이트 블록 링크로만 접근.
export const revalidate = 86400

interface ResourcePageProps {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return leadMagnets.map((magnet) => ({ slug: magnet.slug }))
}

export async function generateMetadata({ params }: ResourcePageProps): Promise<Metadata> {
  const { slug } = await params
  const magnet = getLeadMagnetBySlug(slug)
  if (!magnet) {
    return { title: "자료를 찾을 수 없습니다", robots: { index: false, follow: false } }
  }
  return {
    title: `${magnet.title} | Classin 자료`,
    description: magnet.ctaCopy.body,
    robots: { index: false, follow: false },
  }
}

export default async function ResourcePage({ params }: ResourcePageProps) {
  const { slug } = await params
  const magnet = getLeadMagnetBySlug(slug)

  if (!magnet) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <section className="px-4 pb-16 pt-28 sm:px-6 md:pt-36">
        <div className="mx-auto max-w-[820px]">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-sm text-[#1a1a1a]/45 transition-colors hover:text-[#084734]"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            홈으로 돌아가기
          </Link>

          {/* 헤더 카드 */}
          <div className="overflow-hidden rounded-[24px] border border-[#dcebd9] bg-[#ECFDF5] shadow-sm md:rounded-[32px]">
            <div className="h-1 w-full bg-gradient-to-r from-[#084734] via-[#6EE7B7] to-[#084734]" />
            <div className="p-6 md:p-10">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#084734]/10 bg-white px-3.5 py-1 text-[11px] font-bold tracking-[0.04em] text-[#084734]">
                <Sparkles className="h-3 w-3" />
                {magnet.ctaCopy.eyebrow}
              </span>
              <h1 className="mt-4 text-[1.85rem] font-bold leading-[1.12] tracking-[-0.04em] text-[#111110] md:text-[2.6rem]">
                {magnet.title}
              </h1>
              <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#1a1a1a]/65 md:text-[17px]">
                {magnet.ctaCopy.body}
              </p>
              <p className="mt-4 text-sm text-[#084734]/70">추천 대상: {magnet.audience}</p>
            </div>
          </div>

          {/* 체크리스트 본문 */}
          <div className="mt-8 rounded-[24px] border border-[#e8e8e4] bg-white p-6 shadow-sm md:rounded-[32px] md:p-10">
            <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-[#084734]/55">
              Checklist
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#111110]">
              항목별 점검 포인트
            </h2>
            <ol className="mt-6 space-y-4">
              {magnet.checklistBullets.map((bullet, index) => (
                <li
                  key={bullet}
                  className="flex items-start gap-4 rounded-[20px] border border-[#e8e8e4] bg-[#fcfcfb] p-5"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ECFDF5] text-sm font-bold text-[#084734]">
                    {index + 1}
                  </span>
                  <p className="text-[15px] leading-7 text-[#1a1a1a]/80">{bullet}</p>
                </li>
              ))}
            </ol>

            <div className="mt-8 flex items-start gap-2.5 rounded-[16px] bg-[#F6F5F4] p-4 text-sm leading-6 text-[#1a1a1a]/55">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#084734]" />
              이 체크리스트는 내부 점검용으로 자유롭게 활용하실 수 있습니다. 항목별로 현재
              상태를 표시하고, 보완이 필요한 부분을 도입 상담 때 함께 검토해 드립니다.
            </div>
          </div>

          {/* 상담 CTA */}
          <div className="mt-8 overflow-hidden rounded-[24px] bg-[#111110] p-6 text-white shadow-sm md:rounded-[32px] md:p-10">
            <h2 className="text-[1.6rem] font-semibold tracking-[-0.03em] md:text-[2rem]">
              점검 결과, 함께 보완해 드릴까요?
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-7 text-white/60">
              체크리스트에서 막히는 항목이 있다면 우리 학원 상황에 맞춰 무료로 진단해
              드립니다.
            </p>
            <Link
              href="/contact#contact-form"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#111110] transition-transform hover:-translate-y-0.5"
            >
              무료 상담 신청하기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
