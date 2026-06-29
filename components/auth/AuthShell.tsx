import Image from "next/image"

/** 인증 화면 공용 입력 필드 클래스 — 4개 화면(로그인/가입/비번찾기/재설정)에서 동일하게 쓴다. */
export const AUTH_INPUT_CLASS =
  "h-12 w-full rounded-[6px] border border-black/[0.12] bg-white px-3.5 text-[14px] text-[#111110] outline-none transition-colors placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-1 focus:ring-[#084734]/20 disabled:opacity-60"

interface AuthShellProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  /** 카드 하단(구분선 위) 영역 — 회원가입/로그인 링크 등. */
  footer?: React.ReactNode
  /** 카드 밖 하단 보조 문구. */
  legal?: React.ReactNode
}

export function AuthShell({ title, subtitle, children, footer, legal }: AuthShellProps) {
  return (
    <div className="mx-auto w-full max-w-[400px]">
      <div className="border border-black/[0.08] bg-white px-6 py-9 shadow-[0_4px_18px_rgba(0,0,0,0.04)] sm:px-9">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/images/logo.png"
            alt="Classin"
            width={674}
            height={244}
            className="h-7 w-auto object-contain"
            priority
          />
          <h1 className="mt-6 text-[1.4rem] font-bold tracking-[-0.02em] text-[#111110]">{title}</h1>
          {subtitle ? (
            <p className="mt-2 text-[13px] leading-6 text-[#615D59]">{subtitle}</p>
          ) : null}
        </div>

        <div className="mt-7">{children}</div>

        {footer ? (
          <div className="mt-7 border-t border-black/[0.08] pt-5 text-center text-[13px] text-[#615D59]">
            {footer}
          </div>
        ) : null}
      </div>

      {legal ? (
        <p className="mt-5 text-center text-[11px] leading-5 text-[#A39E98]">{legal}</p>
      ) : null}
    </div>
  )
}
