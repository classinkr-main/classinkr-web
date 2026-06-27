import Link from "next/link"
import { ArrowRight, Clock, LockKeyhole, Play } from "lucide-react"

import type { PublicSeminarCard } from "@/lib/seminars/catalog"
import { SeminarPoster } from "./SeminarPoster"

interface SeminarCardProps {
  seminar: PublicSeminarCard
}

export function SeminarCard({ seminar }: SeminarCardProps) {
  return (
    <Link
      href={`/events/videos/${seminar.slug}`}
      prefetch={false}
      className="group flex flex-col overflow-hidden rounded-[16px] border border-black/[0.08] bg-white shadow-[rgba(0,0,0,0.04)_0px_4px_18px,rgba(0,0,0,0.02)_0px_1px_4px] transition-all duration-300 hover:-translate-y-1 hover:border-[#084734]/20 hover:shadow-[rgba(8,71,52,0.10)_0px_16px_36px,rgba(0,0,0,0.03)_0px_4px_10px]"
    >
      <SeminarPoster seed={seminar.slug} posterUrl={seminar.posterUrl} className="aspect-video w-full">
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-[#084734] shadow-sm backdrop-blur-sm">
          <LockKeyhole className="h-3 w-3" />
          회원 전용
        </span>
        {seminar.durationLabel ? (
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-md bg-[#111110]/70 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            <Clock className="h-3 w-3" />
            {seminar.durationLabel}
          </span>
        ) : null}
        <span className="absolute inset-0 grid place-items-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/85 text-[#084734] shadow-[0_8px_24px_rgba(8,71,52,0.25)] backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
            <Play className="h-6 w-6 translate-x-0.5 fill-current" />
          </span>
        </span>
      </SeminarPoster>

      <div className="flex flex-1 flex-col p-5">
        {seminar.presenter ? (
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#084734]/70">
            {seminar.presenter}
          </span>
        ) : null}
        <h3 className="mt-1.5 text-[18px] font-bold leading-[1.3] tracking-[-0.025em] text-[#111110] transition-colors group-hover:text-[#084734]">
          {seminar.title}
        </h3>
        <p className="mt-2 line-clamp-2 flex-1 text-[14px] leading-6 text-[#615D59]">
          {seminar.description}
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 border-t border-black/[0.06] pt-3 text-[14px] font-semibold text-[#084734]">
          영상 보기
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  )
}
