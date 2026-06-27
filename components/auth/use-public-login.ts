"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import type { ProviderAvailability } from "@/lib/auth/providers"

export type PublicLoginProvider = "google" | "naver" | "kakao"

const DEFAULT_AVAILABILITY: ProviderAvailability = {
  google: true,
  naver: false,
  kakao: false,
}

function getCurrentPath() {
  if (typeof window === "undefined") return "/resources"
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

/**
 * 공개 사용자 OAuth 로그인 상태와 시작 핸들러를 모은 훅.
 * 다이얼로그(PublicLoginDialog)와 전용 페이지(PublicLoginPanel)가 동일한
 * provider 가용성 조회·redirect·마케팅 동의 보존 로직을 공유한다.
 *
 * @param nextPath 로그인 완료 후 복귀 경로. 미지정 시 현재 경로를 사용한다.
 * @param active   provider 가용성 조회를 수행할지 여부. 다이얼로그는 열렸을 때만 조회한다.
 */
export function usePublicLogin(nextPath?: string, active = true) {
  const [loadingProvider, setLoadingProvider] = useState<PublicLoginProvider | null>(null)
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
    if (!active) return
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
  }, [active])

  const startGoogle = useCallback(async () => {
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
  }, [resolvedNextPath])

  const startNaver = useCallback(() => {
    setError("")
    setLoadingProvider("naver")
    window.location.href = `/api/auth/naver/start?next=${encodeURIComponent(resolvedNextPath)}`
  }, [resolvedNextPath])

  const startKakao = useCallback(() => {
    setError("")
    setLoadingProvider("kakao")
    window.location.href = `/api/auth/kakao/start?next=${encodeURIComponent(resolvedNextPath)}`
  }, [resolvedNextPath])

  return {
    loadingProvider,
    error,
    availability,
    marketingOptIn,
    handleMarketingChange,
    startGoogle,
    startNaver,
    startKakao,
  }
}
