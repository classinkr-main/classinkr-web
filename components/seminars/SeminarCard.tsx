import Link from "next/link"
import { ArrowRight, LockKeyhole, PlayCircle } from "lucide-react"

import type { SeminarVideo } from "@/lib/seminars/catalog"

interface SeminarCardProps {
  seminar: SeminarVideo
}

export function SeminarCard({ seminar }: SeminarCardProps) {
  return (
    <Link
      href={`/events/videos/${seminar.slug}`}
      prefetch={false}
      className="group flex flex-col overflow-hidden rounded-[12px] border border-black/[0.08] bg-white shadow-[0_4px_18px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#084734]/25"
    >
      <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-[#ECFDF5] to-white">
        <PlayCircle className="h-12 w-12 text-[#084734]/30 transition-transform group-hover:scale-105" aria-hidden />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-[#084734] shadow-sm">
          <LockKeyhole className="h-3 w-3" />
          회원 전용
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold text-[#A39E98]">
          {seminar.durationLabel ? <span>{seminar.durationLabel}</span> : null}
          {seminar.presenter ? <span>{seminar.presenter}</span> : null}
        </div>
        <h3 className="mt-2 text-[18px] font-bold leading-[1.3] tracking-[-0.025em] text-[#111110] group-hover:text-[#084734]">
          {seminar.title}
        </h3>
        <p className="mt-2 flex-1 text-[14px] leading-6 text-[#615D59]">{seminar.description}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#084734]">
          영상 보기
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}
