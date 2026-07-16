import { ArrowRight, FileText } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"

export function ResourcesRecommendation({ surface }: { surface: string }) {
  return (
    <div className="mt-12 rounded-[24px] border border-black/[0.08] bg-[#F6F5F4] p-6 md:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="mt-0.5 inline-flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-white text-[#084734]">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#615D59]">
              자료실
            </p>
            <h2 className="mt-1 text-[1.25rem] font-semibold tracking-[-0.02em] text-[#111110]">
              도입 검토에 필요한 PDF 자료
            </h2>
            <p className="mt-1.5 text-[14px] leading-6 text-[#615D59]">
              학원 운영·전자칠판·수업 시스템 체크리스트를 무료로 받아보세요.
            </p>
          </div>
        </div>
        <TrackedLink
          href="/resources"
          ctaId={`resources_reco_${surface}`}
          className="inline-flex flex-none items-center justify-center gap-2 rounded-[8px] bg-[#084734] px-5 py-3 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#065c41]"
        >
          자료 받아보기
          <ArrowRight className="h-4 w-4" />
        </TrackedLink>
      </div>
    </div>
  )
}
