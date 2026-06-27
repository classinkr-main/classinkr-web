import type { Metadata } from "next"

import { ShareUnavailable } from "@/app/share/_components/ShareUnavailable"
import QuoteDocumentPreview from "@/components/portal/quotes/QuoteDocumentPreview"
import QuoteViewerActions from "@/components/portal/quotes/QuoteViewerActions"
import { getQuoteDetailsFromStructuredJson } from "@/lib/portal/quote-details"
import {
  PUBLIC_QUOTE_VIEW_ACTION,
  ensureQuoteInteractionLog,
  summarizeQuoteInteractions,
} from "@/lib/portal/repositories/activity"
import { getDeal } from "@/lib/portal/repositories/deals"
import { getPublicQuoteByToken } from "@/lib/portal/repositories/quote-documents"
import { sanitizeMarketingHtml } from "@/lib/sanitize-html"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "견적서",
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

export default async function SharedQuotePage({ params }: PageProps) {
  const { token } = await params

  if (!token) {
    return <ShareUnavailable variant="not_found" documentLabel="견적서" />
  }

  const result = await getPublicQuoteByToken(token)

  if (result.status === "not_found") {
    return <ShareUnavailable variant="not_found" documentLabel="견적서" />
  }
  if (result.status === "expired") {
    return <ShareUnavailable variant="expired" documentLabel="견적서" expiresAt={result.expires_at} />
  }

  const { share, document, version, customer_name } = result
  const validUntil = formatDate(version.valid_until)
  const quoteDetails = getQuoteDetailsFromStructuredJson(version.structured_json, {
    customerName: customer_name,
    validUntil: version.valid_until,
  })

  const deal = await getDeal(document.deal_id).catch(() => null)
  if (deal) {
    await ensureQuoteInteractionLog({
      partner_account_id: deal.partner_account_id,
      customer_id: deal.customer_id,
      deal_id: deal.id,
      actor_user_id: null,
      actor_role: "public",
      action_type: PUBLIC_QUOTE_VIEW_ACTION,
      target_type: "quote_document",
      target_id: document.id,
      summary: `견적서 ${document.quote_number} 고객 열람`,
      before_json: null,
      after_json: {
        quote_number: document.quote_number,
        version_id: version.id,
        share_id: share.id,
        token,
      },
      dedupeByVersion: version.id,
      dedupeByShare: share.id,
      dedupeByToken: token,
      dedupeWindowMinutes: 5,
    }).catch((error) => {
      console.warn("[share/quote] view log skipped", error)
    })
  }

  const interaction = await summarizeQuoteInteractions({
    quote_document_id: document.id,
    version_id: version.id,
    share_id: share.id,
    token,
  }).catch(() => null)

  return (
    <main className="min-h-screen bg-[#F6F5F4] px-4 py-10 print:bg-white print:px-0 print:py-0 sm:px-6 sm:py-16">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <header className="border-b border-black/8 px-6 py-6 sm:px-10 sm:py-8">
          <div className="flex items-center justify-between gap-4">
            <span className="rounded-full bg-[#ECFDF5] px-3 py-1 text-xs font-medium text-[#084734]">견적서</span>
            <span className="text-xs text-[#1a1a1a]/45">No. {document.quote_number}</span>
          </div>
          <h1 className="mt-4 text-2xl font-semibold leading-snug text-[#1a1a1a] sm:text-3xl">
            {version.title}
          </h1>
          {customer_name ? (
            <p className="mt-2 text-sm text-[#1a1a1a]/60">{customer_name} 귀하</p>
          ) : null}
          <div className="mt-5">
            <QuoteViewerActions
              reviewEndpoint={`/api/share/quote/${token}/confirm`}
              acceptEndpoint={`/api/share/quote/${token}/accept`}
              requireRecipientEmail
              initialConfirmedAt={interaction?.reviewConfirmedAt ?? null}
              initialAcceptedAt={interaction?.acceptedAt ?? null}
            />
          </div>
        </header>

        <section className="grid gap-6 px-6 py-6 sm:grid-cols-2 sm:px-10 sm:py-8">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#1a1a1a]/45">총 금액</p>
            <p className="mt-1 text-2xl font-semibold text-[#1a1a1a]">{formatKRW(version.total_amount)}</p>
            {(version.discount_amount > 0 || version.tax_amount > 0) && (
              <p className="mt-1 text-xs text-[#1a1a1a]/50">
                {version.discount_amount > 0 ? `할인 ${formatKRW(version.discount_amount)} · ` : ""}
                부가세 {formatKRW(version.tax_amount)}
              </p>
            )}
          </div>
          {validUntil ? (
            <div>
              <p className="text-xs uppercase tracking-wider text-[#1a1a1a]/45">유효 기간</p>
              <p className="mt-1 text-base text-[#1a1a1a]">{validUntil}</p>
            </div>
          ) : null}
        </section>

        {version.content_html ? (
          <section className="border-t border-black/8 px-6 py-6 sm:px-10 sm:py-8">
            <div
              className="prose prose-sm max-w-none text-[#1a1a1a]/85"
              dangerouslySetInnerHTML={{ __html: sanitizeMarketingHtml(version.content_html) }}
            />
          </section>
        ) : null}

        {!version.content_html && quoteDetails ? (
          <QuoteDocumentPreview
            quote={quoteDetails}
            documentNumber={document.quote_number}
            title={version.title}
          />
        ) : null}

        <footer className="border-t border-black/8 bg-[#F6F5F4] px-6 py-5 text-center text-xs text-[#1a1a1a]/50 sm:px-10">
          이 견적은 담당자가 발급한 안전한 공유 링크입니다. 문의는 담당자에게 직접 회신해 주세요.
        </footer>
      </article>
    </main>
  )
}
