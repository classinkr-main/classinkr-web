import type { Metadata } from "next"

import { ShareUnavailable } from "@/app/share/_components/ShareUnavailable"
import { sanitizeMarketingHtml } from "@/lib/sanitize-html"
import { getContractByToken } from "@/lib/repositories/contracts"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "계약서",
  robots: { index: false, follow: false, nocache: true },
}

type PageProps = {
  params: Promise<{ token: string }>
}

function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  return new Date(value).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
}

function isPast(value: string | null): boolean {
  if (!value) return false
  return new Date(value).getTime() < Date.now()
}

export default async function SharedContractPage({ params }: PageProps) {
  const { token } = await params

  if (!token) {
    return <ShareUnavailable variant="not_found" documentLabel="계약서" />
  }

  const contract = await getContractByToken(token)

  if (!contract) {
    return <ShareUnavailable variant="not_found" documentLabel="계약서" />
  }

  if (isPast(contract.valid_until)) {
    return <ShareUnavailable variant="expired" documentLabel="계약서" expiresAt={contract.valid_until} />
  }

  const validUntil = formatDate(contract.valid_until)
  const partnerSignedAt = formatDate(contract.partner_signed_at)
  const adminSignedAt = formatDate(contract.admin_signed_at)
  const isFullySigned = Boolean(contract.partner_signed_at && contract.admin_signed_at)

  return (
    <main className="min-h-screen bg-[#F6F5F4] px-4 py-10 sm:px-6 sm:py-16">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm">
        <header className="border-b border-black/8 px-6 py-6 sm:px-10 sm:py-8">
          <div className="flex items-center justify-between gap-4">
            <span className="rounded-full bg-[#ECFDF5] px-3 py-1 text-xs font-medium text-[#084734]">계약서</span>
            <span className="text-xs text-[#1a1a1a]/45">No. {contract.contract_number}</span>
          </div>
          <h1 className="mt-4 text-2xl font-semibold leading-snug text-[#1a1a1a] sm:text-3xl">
            {contract.title}
          </h1>
        </header>

        <section className="grid gap-6 px-6 py-6 sm:grid-cols-2 sm:px-10 sm:py-8">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#1a1a1a]/45">총 금액</p>
            <p className="mt-1 text-2xl font-semibold text-[#1a1a1a]">{formatKRW(contract.total_amount)}</p>
          </div>
          {validUntil ? (
            <div>
              <p className="text-xs uppercase tracking-wider text-[#1a1a1a]/45">유효 기간</p>
              <p className="mt-1 text-base text-[#1a1a1a]">{validUntil}</p>
            </div>
          ) : null}
        </section>

        {contract.content_html ? (
          <section className="border-t border-black/8 px-6 py-6 sm:px-10 sm:py-8">
            <div
              className="prose prose-sm max-w-none text-[#1a1a1a]/85"
              dangerouslySetInnerHTML={{ __html: sanitizeMarketingHtml(contract.content_html) }}
            />
          </section>
        ) : null}

        <section className="border-t border-black/8 px-6 py-6 sm:px-10 sm:py-8">
          <h2 className="text-sm font-semibold text-[#1a1a1a]">서명 상태</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-[#F6F5F4] px-4 py-3">
              <dt className="text-xs text-[#1a1a1a]/55">담당자 서명</dt>
              <dd className="mt-1 text-sm text-[#1a1a1a]">
                {adminSignedAt ?? "미서명"}
              </dd>
            </div>
            <div className="rounded-xl bg-[#F6F5F4] px-4 py-3">
              <dt className="text-xs text-[#1a1a1a]/55">고객 서명</dt>
              <dd className="mt-1 text-sm text-[#1a1a1a]">
                {partnerSignedAt ?? "미서명"}
              </dd>
            </div>
          </dl>
          {!isFullySigned ? (
            <p className="mt-4 rounded-xl border border-dashed border-black/10 bg-[#FFFDF5] px-4 py-3 text-xs text-[#1a1a1a]/65">
              서명 UI는 곧 활성화될 예정입니다. 그동안 담당자에게 직접 회신 부탁드립니다.
            </p>
          ) : null}
        </section>

        <footer className="border-t border-black/8 bg-[#F6F5F4] px-6 py-5 text-center text-xs text-[#1a1a1a]/50 sm:px-10">
          이 계약서는 담당자가 발급한 안전한 공유 링크입니다.
        </footer>
      </article>
    </main>
  )
}
