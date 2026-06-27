"use client"

import { Loader2 } from "lucide-react"

import { AppleGlyph, GoogleGlyph, KakaoGlyph, NaverGlyph } from "@/components/auth/brand-glyphs"
import { usePublicLogin } from "@/components/auth/use-public-login"

interface SocialLoginRowProps {
  nextPath?: string
  /** 구분선 문구. 기본값 "또는 SNS 계정으로". */
  label?: string
}

export function SocialLoginRow({ nextPath, label = "또는 SNS 계정으로" }: SocialLoginRowProps) {
  const { loadingProvider, error, availability, startGoogle, startNaver, startKakao, startApple } =
    usePublicLogin(nextPath)
  const busy = loadingProvider !== null

  return (
    <div>
      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-black/[0.08]" />
        <span className="text-[12px] font-medium text-[#A39E98]">{label}</span>
        <span className="h-px flex-1 bg-black/[0.08]" />
      </div>

      <div className="flex items-start justify-center gap-6">
        <SocialIcon
          label="Google"
          onClick={startGoogle}
          disabled={busy}
          loading={loadingProvider === "google"}
          className="border border-black/[0.12] bg-white"
        >
          <GoogleGlyph className="h-[22px] w-[22px]" />
        </SocialIcon>
        {availability.naver ? (
          <SocialIcon
            label="네이버"
            onClick={startNaver}
            disabled={busy}
            loading={loadingProvider === "naver"}
            className="bg-[#03C75A] text-white"
          >
            <NaverGlyph />
          </SocialIcon>
        ) : null}
        {availability.kakao ? (
          <SocialIcon
            label="카카오"
            onClick={startKakao}
            disabled={busy}
            loading={loadingProvider === "kakao"}
            className="bg-[#FEE500] text-[#3C1E1E]"
          >
            <KakaoGlyph />
          </SocialIcon>
        ) : null}
        {availability.apple ? (
          <SocialIcon
            label="Apple"
            onClick={startApple}
            disabled={busy}
            loading={loadingProvider === "apple"}
            className="bg-[#111110] text-white"
          >
            <AppleGlyph />
          </SocialIcon>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-center text-[13px] leading-5 text-[#B85C33]">
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface SocialIconProps {
  label: string
  onClick: () => void
  disabled: boolean
  loading: boolean
  className: string
  children: React.ReactNode
}

function SocialIcon({ label, onClick, disabled, loading, className, children }: SocialIconProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={`${label}로 계속하기`}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0 ${className}`}
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
      </button>
      <span className="text-[11px] font-medium text-[#615D59]">{label}</span>
    </div>
  )
}
