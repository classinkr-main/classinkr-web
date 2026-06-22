"use client"

import { ArrowRight, Download, FileText } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"

export interface ResourceHubItem {
  slug: string
  title: string
  summary: string
  subtitle: string
  outcome: string
  categoryLabel: string
  tierLabel: string
  formatLabel: string
  estimatedMinutes: number
  itemCount: number
}

interface ResourcesHubClientProps {
  resources: ResourceHubItem[]
}

export function ResourcesHubClient({ resources }: ResourcesHubClientProps) {
  const featured = resources[0]
  const rest = resources.slice(1)

  return (
    <main className="min-h-screen bg-[#FAFAF8] pb-20 pt-28 text-[#111110] md:pb-24 md:pt-36">
      <section className="container">
        <div className="grid gap-10 border-b border-black/[0.08] pb-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
          <div>
            <h1 className="max-w-4xl text-[2.25rem] font-bold leading-[1.08] tracking-[-0.04em] sm:text-5xl md:text-[3.75rem]">
              학원 도입 검토를 위한
              <br className="hidden md:block" /> PDF 자료실
            </h1>
            <p className="mt-6 max-w-3xl text-[17px] leading-8 text-[#615D59] break-keep">
              전자칠판, 수업 운영, 강사 리소스, 관리자 데이터, 개인정보·권한 확인까지
              도입 전 의사결정에 필요한 질문을 실무 자료로 정리했습니다.
            </p>
          </div>

          <aside className="border-l-2 border-[#084734] bg-white px-5 py-4 shadow-[0_8px_26px_rgba(17,17,16,0.04)]">
            <p className="text-[13px] font-bold text-[#084734]">다운로드 흐름</p>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-[#615D59]">
              <li>1. 필요한 자료를 선택합니다.</li>
              <li>2. 업무용 정보를 입력합니다.</li>
              <li>3. PDF와 다음 확인 링크를 받습니다.</li>
            </ol>
          </aside>
        </div>

        {featured ? (
          <section className="grid gap-6 border-b border-black/[0.08] py-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
            <div>
              <div className="flex items-center gap-2 text-[13px] font-bold text-[#084734]">
                <FileText className="h-4 w-4" />
                추천 자료
              </div>
              <h2 className="mt-4 text-3xl font-bold tracking-[-0.03em] text-[#111110]">
                {featured.title}
              </h2>
              <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[#615D59]">
                {featured.outcome}
              </p>
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-[13px] font-semibold text-[#615D59]">
                <span>{featured.tierLabel} 자료</span>
                <span>{featured.categoryLabel}</span>
                <span>{featured.itemCount}문항</span>
                <span>{featured.formatLabel}</span>
              </div>
            </div>

            <TrackedLink
              href={`/resources/${featured.slug}#download`}
              ctaId="resources_featured_pdf"
              tracking={{ source: "resources_hub", lead_magnet: featured.slug }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[6px] bg-[#084734] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#065c41]"
            >
              PDF 받기
              <Download className="h-4 w-4" />
            </TrackedLink>
          </section>
        ) : null}

        <section className="pt-10">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-[#111110]">전체 자료</h2>
              <p className="mt-2 text-sm text-[#615D59]">
                주제별로 필요한 자료를 골라 내부 검토와 상담 준비에 사용하세요.
              </p>
            </div>
            <p className="hidden text-sm font-semibold text-[#615D59] sm:block">
              {resources.length}개
            </p>
          </div>

          <div className="grid gap-3">
            {rest.map((resource) => (
              <TrackedLink
                key={resource.slug}
                href={`/resources/${resource.slug}#download`}
                ctaId="resources_pdf_card"
                tracking={{ source: "resources_hub", lead_magnet: resource.slug }}
                className="group grid gap-4 border border-black/[0.08] bg-white p-5 transition-colors hover:border-[#084734]/25 hover:bg-[#FFFFFF] md:grid-cols-[160px_minmax(0,1fr)_120px] md:items-center"
              >
                <div className="text-[13px] font-bold text-[#084734]">
                  {resource.tierLabel} · {resource.categoryLabel}
                </div>
                <div>
                  <h3 className="text-[18px] font-bold leading-7 tracking-[-0.02em] text-[#111110] group-hover:text-[#084734]">
                    {resource.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#615D59]">
                    {resource.outcome}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-semibold text-[#A39E98]">
                    <span>{resource.itemCount}문항</span>
                    <span>약 {resource.estimatedMinutes}분</span>
                    <span>PDF</span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-2 text-sm font-bold text-[#084734] md:justify-end">
                  받기
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </TrackedLink>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
