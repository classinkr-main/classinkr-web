"use client"

import { useState } from "react"
import { LockKeyhole } from "lucide-react"

import { PublicLoginDialog } from "@/components/auth/PublicLoginDialog"

export function PremiumLoginGate({ nextPath }: { nextPath: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-black/[0.08] bg-white p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#ECFDF5] text-[#084734]">
        <LockKeyhole className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-xl font-bold text-[#111110]">프리미엄 콘텐츠</h2>
      <p className="mt-2 text-sm leading-6 text-[#615D59]">
        Google 로그인 후 권한이 확인되면 콘텐츠를 볼 수 있습니다.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-[#084734] px-4 text-sm font-semibold text-white hover:bg-[#065c41]"
      >
        Google 로그인으로 프리미엄 콘텐츠 보기
      </button>
      <PublicLoginDialog
        open={open}
        onOpenChange={setOpen}
        nextPath={nextPath}
        title="Google 로그인으로 프리미엄 콘텐츠 보기"
        description="프리미엄 콘텐츠는 로그인 후 권한을 확인한 뒤 열람할 수 있습니다."
      />
    </div>
  )
}
