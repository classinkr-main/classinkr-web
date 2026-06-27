"use client"

import { useState } from "react"
import { LockKeyhole, PlayCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PublicLoginDialog } from "@/components/auth/PublicLoginDialog"

interface SeminarLockedPreviewProps {
  slug: string
  title: string
}

export function SeminarLockedPreview({ slug, title }: SeminarLockedPreviewProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <div className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-[12px] border border-black/[0.08] bg-gradient-to-br from-[#ECFDF5] to-white text-center">
        {/* 흐림 처리된 플레이어 자리 — 영상 ID 는 비회원에게 출력되지 않는다 */}
        <PlayCircle className="h-14 w-14 text-[#084734]/25" aria-hidden />
        <div className="relative mt-5 flex flex-col items-center gap-3 px-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[12px] font-semibold text-[#084734] shadow-sm">
            <LockKeyhole className="h-3.5 w-3.5" />
            회원 전용 영상
          </span>
          <p className="max-w-sm text-[14px] leading-6 text-[#31302E]">
            로그인하면 <span className="font-semibold">{title}</span> 전체 영상을
            바로 시청할 수 있습니다.
          </p>
          <Button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="h-11 bg-[#084734] px-5 hover:bg-[#065c41]"
          >
            로그인하고 전체 보기
          </Button>
          <p className="text-[11px] leading-5 text-[#A39E98]">
            구글 · 네이버 계정으로 10초 만에 시청
          </p>
        </div>
      </div>

      <PublicLoginDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        nextPath={`/events/videos/${slug}`}
        title="로그인하고 영상 보기"
        description="행사 영상은 가입된 회원에게만 제공됩니다. 구글 또는 네이버 계정으로 로그인해 주세요."
      />
    </>
  )
}
