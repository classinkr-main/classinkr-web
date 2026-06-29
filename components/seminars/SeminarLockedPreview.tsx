"use client"

import { useState } from "react"
import { LockKeyhole } from "lucide-react"

import { PublicLoginDialog } from "@/components/auth/PublicLoginDialog"
import { SeminarPoster } from "./SeminarPoster"

interface SeminarLockedPreviewProps {
  slug: string
  title: string
  posterUrl?: string
}

export function SeminarLockedPreview({ slug, title, posterUrl }: SeminarLockedPreviewProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <div className="relative overflow-hidden rounded-[16px] border border-black/[0.08] shadow-[rgba(0,0,0,0.04)_0px_4px_18px]">
        {/* 흐림 처리된 브랜드 백드롭 — 영상 ID 는 비회원에게 출력되지 않는다 */}
        <SeminarPoster
          seed={slug}
          posterUrl={posterUrl}
          className="aspect-video w-full scale-105 blur-[2px]"
        />
        <div className="absolute inset-0 bg-white/35" />

        {/* 프로스티드 글래스 CTA 패널 */}
        <div className="absolute inset-0 grid place-items-center p-5">
          <div className="w-full max-w-sm rounded-[14px] border border-white/60 bg-white/80 p-6 text-center shadow-[0_18px_50px_rgba(8,71,52,0.16)] backdrop-blur-md">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#ECFDF5] text-[#084734] ring-1 ring-[#084734]/12">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.14em] text-[#084734]/70">
              회원 전용 영상
            </p>
            <h2 className="mt-1.5 text-[18px] font-bold leading-snug tracking-[-0.02em] text-[#111110]">
              로그인하고 전체 영상 보기
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-[#615D59]">
              {title} 전체 영상은 가입된 회원에게 제공됩니다.
            </p>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-[8px] bg-[#084734] px-5 text-[15px] font-semibold text-white shadow-sm transition-all hover:bg-[#065c41] active:scale-[0.98]"
            >
              로그인하고 전체 보기
            </button>
            <p className="mt-3 text-[11px] leading-5 text-[#615D59]">
              간편 로그인으로 10초 만에 시청
            </p>
          </div>
        </div>
      </div>

      <PublicLoginDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        nextPath={`/events/videos/${slug}`}
        title="로그인하고 영상 보기"
        description="행사 영상은 가입된 회원에게 제공됩니다. 간편 로그인으로 바로 시청하실 수 있습니다."
      />
    </>
  )
}
