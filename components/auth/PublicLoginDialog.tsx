"use client"

import { useMemo, useState } from "react"
import { Loader2, LockKeyhole, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

interface PublicLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nextPath?: string
  title?: string
  description?: string
}

function getCurrentPath() {
  if (typeof window === "undefined") return "/resources"
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function PublicLoginDialog({
  open,
  onOpenChange,
  nextPath,
  title = "로그인 후 자료 받기",
  description = "심화 자료는 다운로드 기록과 재열람을 위해 공개 사용자 로그인이 필요합니다.",
}: PublicLoginDialogProps) {
  const [loadingProvider, setLoadingProvider] = useState<"google" | "naver" | null>(null)
  const [error, setError] = useState("")
  const resolvedNextPath = useMemo(() => nextPath ?? getCurrentPath(), [nextPath])

  const startGoogle = async () => {
    setError("")
    setLoadingProvider("google")
    try {
      const origin = window.location.origin
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(resolvedNextPath)}`
      const supabase = createSupabaseBrowserClient()
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      })
      if (signInError) {
        setError("Google 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.")
        setLoadingProvider(null)
      }
    } catch {
      setError("로그인 설정을 확인하지 못했습니다.")
      setLoadingProvider(null)
    }
  }

  const startNaver = () => {
    setError("")
    setLoadingProvider("naver")
    window.location.href = `/api/auth/naver/start?next=${encodeURIComponent(resolvedNextPath)}`
  }

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
        </div>

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
