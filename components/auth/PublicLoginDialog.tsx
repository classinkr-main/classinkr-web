"use client"

import { Loader2, LockKeyhole, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { usePublicLogin } from "@/components/auth/use-public-login"

interface PublicLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nextPath?: string
  title?: string
  description?: string
}

export function PublicLoginDialog({
  open,
  onOpenChange,
  nextPath,
  title = "로그인 후 자료 받기",
  description = "심화 자료는 다운로드 기록과 재열람을 위해 공개 사용자 로그인이 필요합니다.",
}: PublicLoginDialogProps) {
  const {
    loadingProvider,
    error,
    availability,
    marketingOptIn,
    handleMarketingChange,
    startGoogle,
    startNaver,
    startKakao,
  } = usePublicLogin(nextPath, open)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[#ECFDF5] text-[#084734]">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Button
            type="button"
            onClick={startGoogle}
            disabled={loadingProvider !== null}
            className="h-11 w-full"
          >
            {loadingProvider === "google" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Google로 계속하기
          </Button>
          {availability.naver ? (
            <Button
              type="button"
              variant="outline"
              onClick={startNaver}
              disabled={loadingProvider !== null}
              className="h-11 w-full"
            >
              {loadingProvider === "naver" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Naver로 계속하기
            </Button>
          ) : null}
          {availability.kakao ? (
            <Button
              type="button"
              variant="outline"
              onClick={startKakao}
              disabled={loadingProvider !== null}
              className="h-11 w-full"
            >
              {loadingProvider === "kakao" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Kakao로 계속하기
            </Button>
          ) : null}
        </div>

        <label className="flex items-start gap-2 text-[12px] leading-5 text-[#6B6661]">
          <input
            type="checkbox"
            checked={marketingOptIn}
            onChange={(event) => handleMarketingChange(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[rgba(0,0,0,0.2)] accent-[#084734]"
          />
          <span>
            (선택) 신규 자료·웨비나·제품 소식을 이메일로 받아보겠습니다. 로그인 후 계정 설정에서 언제든
            해제할 수 있습니다.
          </span>
        </label>

        {error ? (
          <p role="alert" className="text-[13px] leading-5 text-[#B85C33]">
            {error}
          </p>
        ) : null}
        <p className="text-[11px] leading-5 text-[#A39E98]">
          로그인 정보는 자료 열람 기록과 상담 후속 안내에만 사용됩니다.
        </p>
      </DialogContent>
    </Dialog>
  )
}
