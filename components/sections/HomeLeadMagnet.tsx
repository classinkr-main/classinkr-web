import { ArrowRight, CheckCircle2, Clock3, FileCheck2 } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"
import { getLeadMagnetBySlug } from "@/lib/lead-magnets"
import { getLeadMagnetItemCount } from "@/lib/lead-magnets-helpers"

const FEATURED_LEAD_MAGNET_SLUG = "academy-system-checklist"

export function HomeLeadMagnet() {
  const magnet = getLeadMagnetBySlug(FEATURED_LEAD_MAGNET_SLUG)

  if (!magnet || !magnet.published) return null

  const itemCount = getLeadMagnetItemCount(magnet)
  const previewItems = [
    "교안·수업 준비가 강사 개인 파일에 남아 있는지",
    "판서·녹화·복습·과제가 한 흐름으로 이어지는지",
    "관리자가 수업 품질과 운영 기록을 기준으로 보는지",
  ]

  return (
    <section
      id="operating-diagnostic"
      aria-labelledby="home-lead-magnet-title"
      className="scroll-mt-[76px] overflow-hidden bg-white py-16 text-[#111110] md:scroll-mt-20 md:py-24"
    >
      <div className="container mx-auto px-4">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.82fr)] lg:gap-16">
          <div className="max-w-2xl">
            <p className="text-[13px] font-bold tracking-[0.12em] text-[#084734]">
              무료 운영 진단 PDF
            </p>
            <h2
              id="home-lead-magnet-title"
              className="mt-4 text-3xl font-black leading-[1.12] tracking-[-0.04em] text-[#111110] sm:text-4xl md:text-5xl"
            >
              도구를 더 사기 전에,
              <br />
              어디서 일이 새는지 먼저 보세요.
            </h2>
            <p className="mt-6 max-w-xl text-[17px] leading-8 text-[#615D59] break-keep">
              수업 준비·판서·녹화·복습·과제·관리자 확인이 끊기는 지점을 {itemCount}문항으로
              진단하고, 낮은 영역을 첫 파일럿 과제로 바꾸는 원장용 자료입니다.
            </p>

            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-[#31302E]">
              <span className="inline-flex items-center gap-2">
                <FileCheck2 aria-hidden="true" className="h-4 w-4 text-[#084734]" />
                {itemCount}문항 진단표
              </span>
              <span className="inline-flex items-center gap-2">
                <Clock3 aria-hidden="true" className="h-4 w-4 text-[#084734]" />
                약 {magnet.estimatedMinutes}분
              </span>
              <span>점수 해석 + 7일 정리 플랜</span>
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <TrackedLink
                href={`/resources/${magnet.slug}#download`}
                ctaId="home_featured_lead_magnet"
                tracking={{ source: "home_lead_magnet", lead_magnet: magnet.slug }}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-[6px] bg-[#084734] px-6 text-[15px] font-bold text-white transition-colors hover:bg-[#065c41] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
              >
                {itemCount}문항으로 운영 누수 찾기
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </TrackedLink>
              <TrackedLink
                href="/resources"
                ctaId="home_resources_all"
                tracking={{ source: "home_lead_magnet" }}
                className="inline-flex h-12 items-center justify-center px-2 text-[14px] font-semibold text-[#084734] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
              >
                도입 자료 13종 모두 보기
              </TrackedLink>
            </div>
          </div>

          <div className="relative border border-black/[0.08] bg-[#F6F5F4] p-5 shadow-[0_18px_52px_rgba(17,17,16,0.05)] sm:p-7">
            <div className="border border-black/[0.08] bg-white p-6 sm:p-8">
              <div className="flex items-start justify-between gap-6 border-b border-black/[0.08] pb-5">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#084734]">
                    Classin Field Guide
                  </p>
                  <h3 className="mt-2 text-xl font-bold leading-7 tracking-[-0.02em] text-[#111110]">
                    {magnet.title}
                  </h3>
                </div>
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#ECFDF5] text-[#084734]">
                  <FileCheck2 aria-hidden="true" className="h-5 w-5" />
                </span>
              </div>

              <p className="mt-5 text-[13px] font-bold text-[#615D59]">먼저 확인할 세 가지</p>
              <ul className="mt-3 divide-y divide-black/[0.08] border-y border-black/[0.08]">
                {previewItems.map((item) => (
                  <li key={item} className="flex gap-3 py-4 text-[14px] leading-6 text-[#31302E]">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#084734]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-5 border-l-2 border-[#084734] bg-[#ECFDF5] px-4 py-3 text-[13px] font-semibold leading-6 text-[#31302E]">
                점수가 낮은 영역은 실패 신호가 아니라, 첫 교실에서 먼저 검증할 운영 과제입니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
