type Props = {
  variant: "expired" | "not_found"
  documentLabel: string
  expiresAt?: string | null
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  return new Date(value).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
}

export function ShareUnavailable({ variant, documentLabel, expiresAt }: Props) {
  const title = variant === "expired" ? `${documentLabel} 링크가 만료되었습니다` : `${documentLabel}를 찾을 수 없습니다`
  const expiredAt = formatDate(expiresAt)

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6F5F4] px-6">
      <div className="max-w-md rounded-2xl border border-black/8 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-medium text-[#1a1a1a]">{title}</h1>
        {variant === "expired" && expiredAt ? (
          <p className="mt-3 text-sm leading-relaxed text-[#1a1a1a]/60">
            만료일: {expiredAt}
            <br />
            새 링크는 담당자에게 요청해 주세요.
          </p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-[#1a1a1a]/60">
            링크가 잘못되었거나 회수되었습니다.
            <br />
            담당자에게 문의 바랍니다.
          </p>
        )}
      </div>
    </main>
  )
}
