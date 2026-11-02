import type { Metadata } from "next"

import { ShareUnavailable } from "@/app/share/_components/ShareUnavailable"
import QuoteDocumentPreview from "@/components/portal/quotes/QuoteDocumentPreview"
import { getOutstandingAmount } from "@/lib/distributor-settlements"
import { getDistributorSettlementByToken } from "@/lib/repositories/distributor-settlements"
import { loadDistributorQuoteView } from "@/lib/server/distributor-settlement-issue"

// 총판용 견적서 공유 페이지(2026-10-23) — 고객 견적서와 같은 양식, 원가만 담는다.
// 고객 단가·고객 합계는 싣지 않는다(총판 정산 줄만으로 다시 계산한 문서). 취소하면 토큰이 지워져 404 가 된다.

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "총판 견적서",
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

export default async function SharedDistributorQuotePage({ params }: PageProps) {
  const { token } = await params
  if (!token) return <ShareUnavailable variant="not_found" documentLabel="총판 견적서" />

  const settlement = await getDistributorSettlementByToken(token).catch(() => null)
  if (!settlement || settlement.status === "draft" || settlement.status === "cancelled") {
    return <ShareUnavailable variant="not_found" documentLabel="총판 견적서" />
  }

  const view = await loadDistributorQuoteView(settlement).catch(() => null)
  if (!view) return <ShareUnavailable variant="not_found" documentLabel="총판 견적서" />

  const documentNumber = `${view.document.quote_number}-D`
  const dueDate = formatDate(settlement.dueDate)
  const outstanding = getOutstandingAmount(settlement)

  return (
    <main data-quote-viewer="true" className="min-h-screen bg-[#F6F5F4] px-4 py-10 print:bg-white print:px-0 print:py-0 sm:px-6 sm:py-16">
      <article className="mx-auto max-w-[210mm] overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <header className="border-b border-black/8 px-6 py-6 sm:px-10 sm:py-8 print:hidden">
          <div className="flex items-center justify-between gap-4">
            <span className="rounded-full bg-[#ECFDF5] px-3 py-1 text-xs font-medium text-[#084734]">총판 견적서</span>
            <span className="text-xs text-[#1a1a1a]/45">No. {documentNumber}</span>
          </div>
          <h1 className="mt-4 text-2xl font-semibold leading-snug text-[#1a1a1a] sm:text-3xl">
            {view.customerName ? `${view.customerName} 건 하드웨어 공급` : view.version.title}
          </h1>
          <p className="mt-2 text-sm text-[#1a1a1a]/60">{settlement.distributorName} 귀중</p>
        </header>

        <section className="grid gap-6 px-6 py-6 sm:grid-cols-3 sm:px-10 sm:py-8 print:hidden">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#1a1a1a]/45">입금 요청 금액</p>
            <p className="mt-1 text-2xl font-semibold text-[#1a1a1a]">{formatKRW(settlement.totalAmount)}</p>
            <p className="mt-1 text-xs text-[#1a1a1a]/50">VAT 포함</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-[#1a1a1a]/45">입금 기한</p>
            <p className="mt-1 text-base text-[#1a1a1a]">{dueDate ?? "담당자와 협의"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-[#1a1a1a]/45">입금 상태</p>
            <p className="mt-1 text-base text-[#1a1a1a]">
              {settlement.status === "paid" ? "입금 완료" : `남은 금액 ${formatKRW(outstanding)}`}
            </p>
          </div>
        </section>

        <QuoteDocumentPreview quote={view.details} documentNumber={documentNumber} title={view.version.title} />

        <footer className="border-t border-black/8 bg-[#F6F5F4] px-6 py-5 text-center text-xs text-[#1a1a1a]/50 sm:px-10 print:hidden">
          이 문서는 하드웨어 총판 정산용으로 발급된 공유 링크입니다. 문의는 담당자에게 직접 회신해 주세요.
        </footer>
      </article>
    </main>
  )
}
