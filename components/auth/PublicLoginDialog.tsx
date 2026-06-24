"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
import type { ProviderAvailability } from "@/lib/auth/providers"

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

const DEFAULT_AVAILABILITY: ProviderAvailability = {
  google: true,
  naver: false,
  kakao: false,
}

export function PublicLoginDialog({
  open,
  onOpenChange,
  nextPath,
  title = "로그인 후 자료 받기",
  description = "심화 자료는 다운로드 기록과 재열람을 위해 공개 사용자 로그인이 필요합니다.",
}: PublicLoginDialogProps) {
  const [loadingProvider, setLoadingProvider] = useState<"google" | "naver" | "kakao" | null>(null)
  const [error, setError] = useState("")
  const [availability, setAvailability] = useState<ProviderAvailability>(DEFAULT_AVAILABILITY)
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const resolvedNextPath = useMemo(() => nextPath ?? getCurrentPath(), [nextPath])

  // 첫 로그인 시 마케팅 동의 의도를 localStorage에 남겨 OAuth 리다이렉트 너머로 보존한다.
  // 복귀 후 /account의 MarketingConsentToggle이 이 키를 드레인해 한 번만 반영한다.
  const handleMarketingChange = useCallback((checked: boolean) => {
    setMarketingOptIn(checked)
    try {
      if (checked) {
        window.localStorage.setItem("cln_pending_marketing_consent", "1")
      } else {
        window.localStorage.removeItem("cln_pending_marketing_consent")
      }
    } catch {
      // 무시: 스토리지 접근 실패 시 동의는 /account 토글에서 직접 처리한다.
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let ignore = false
    fetch("/api/auth/providers", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProviderAvailability | null) => {
        if (ignore || !data) return
        setAvailability({
          google: true,
          naver: Boolean(data.naver),
          kakao: Boolean(data.kakao),
        })
      })
      .catch(() => {
        if (ignore) return
        setAvailability(DEFAULT_AVAILABILITY)
      })
    return () => {
      ignore = true
    }
  }, [open])

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

  const startKakao = () => {
    setError("")
    setLoadingProvider("kakao")
    window.location.href = `/api/auth/kakao/start?next=${encodeURIComponent(resolvedNextPath)}`
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
