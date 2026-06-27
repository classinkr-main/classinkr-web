"use client"

import { CheckCircle2, Loader2, LockKeyhole } from "lucide-react"

import { Button } from "@/components/ui/button"
import { usePublicLogin } from "@/components/auth/use-public-login"

interface PublicLoginPanelProps {
  nextPath?: string
  /** 로그인 후 어떤 콘텐츠로 돌아가는지 사용자에게 보여줄 안내 문구. */
  returnLabel?: string
}

const BENEFITS = [
  "심화·프리미엄 자료를 로그인 한 번으로 열람",
  "받은 자료는 내 계정에서 언제든 다시 다운로드",
  "상담·웨비나 등 후속 안내를 계정 기준으로 정리",
] as const

export function PublicLoginPanel({ nextPath, returnLabel }: PublicLoginPanelProps) {
  const {
    loadingProvider,
    error,
    availability,
    marketingOptIn,
    handleMarketingChange,
    startGoogle,
    startNaver,
    startKakao,
  } = usePublicLogin(nextPath)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
      {/* 좌측: 가치 안내 */}
      <div className="border border-black/[0.08] bg-[#ECFDF5] p-6 md:p-8">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-[#084734]">
          <LockKeyhole className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-[1.7rem] font-bold leading-[1.15] tracking-[-0.03em] text-[#111110] md:text-[2.1rem]">
          프리미엄 자료를 위한 로그인
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-7 text-[#31302E]">
          심화·프리미엄 콘텐츠는 다운로드 기록과 재열람을 위해 공개 사용자 로그인이 필요합니다.
          로그인 정보는 자료 열람 기록과 상담 후속 안내에만 사용됩니다.
        </p>
        <ul className="mt-6 space-y-3">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex gap-2 text-[14px] leading-6 text-[#31302E]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#084734]" />
              {benefit}
            </li>
          ))}
        </ul>
        {returnLabel ? (
          <p className="mt-6 border-l-2 border-[#084734] bg-white/70 px-4 py-3 text-[13px] leading-6 text-[#31302E]">
            로그인 후 <span className="font-bold text-[#084734]">{returnLabel}</span> 으로 돌아갑니다.
          </p>
        ) : null}
      </div>

      {/* 우측: 로그인 액션 */}
      <div className="border border-black/[0.08] bg-white p-6 md:p-8">
        <h2 className="text-lg font-bold text-[#111110]">계정으로 계속하기</h2>
        <p className="mt-1 text-[13px] leading-6 text-[#615D59]">
          기존 계정이 없으면 첫 로그인 시 자동으로 만들어집니다.
        </p>

        <div className="mt-5 grid gap-2">
          <Button
            type="button"
            onClick={startGoogle}
            disabled={loadingProvider !== null}
            className="h-11 w-full"
          >
            {loadingProvider === "google" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
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

        <label className="mt-5 flex items-start gap-2 text-[12px] leading-5 text-[#6B6661]">
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
          <p role="alert" className="mt-4 text-[13px] leading-5 text-[#B85C33]">
            {error}
          </p>
        ) : null}
        <p className="mt-4 text-[11px] leading-5 text-[#A39E98]">
          로그인하면 서비스 약관과 개인정보 처리방침에 동의하는 것으로 간주됩니다.
        </p>
      </div>
    </div>
  )
}
