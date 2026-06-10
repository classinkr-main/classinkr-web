"use client"

import { useEffect, useState } from "react"
import DOMPurify from "isomorphic-dompurify"
import { AlertCircle, Loader2 } from "lucide-react"

import QuoteDocumentPreview from "@/components/portal/quotes/QuoteDocumentPreview"
import QuoteViewerActions from "@/components/portal/quotes/QuoteViewerActions"
import { adminFetch } from "@/lib/admin-client"
import { getQuoteDetailsFromStructuredJson } from "@/lib/portal/quote-details"

type QuoteDocument = {
  id: string
  quote_number: string
  status: string
}

type QuoteVersion = {
  id: string
  title: string
  content_html: string | null
  structured_json: Record<string, unknown> | null
  discount_amount: number
  tax_amount: number
  total_amount: number
  valid_until: string | null
}

type Deal = {
  customer_id: string
  title: string
} | null

type ViewerPayload = {
  error?: string
  quote?: QuoteDocument
  document?: QuoteDocument
  version?: QuoteVersion | null
  deal?: Deal
}

function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  return new Date(value).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
}

export default function QuoteDirectViewerClient({ quoteId }: { quoteId: string }) {
  const [payload, setPayload] = useState<ViewerPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadQuote() {
      setLoading(true)
      setError(null)

      try {
        const response = await adminFetch(`/api/portal/quotes/${quoteId}?include=viewer`, {
          headers: { "x-portal-scope": "admin" },
        })
        const nextPayload = (await response.json().catch(() => null)) as ViewerPayload | null

        if (!response.ok || !nextPayload?.document || !nextPayload.version) {
          throw new Error(nextPayload?.error ?? "견적서를 불러오지 못했습니다.")
        }

        if (active) setPayload(nextPayload)
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "견적서를 불러오지 못했습니다.")
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadQuote()

    return () => {
      active = false
    }
  }, [quoteId])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F6F5F4] px-4">
        <div className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-3 text-sm text-[#615D59] shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          견적서를 불러오는 중입니다.
        </div>
      </main>
    )
  }

  if (error || !payload?.document || !payload.version) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F6F5F4] px-4">
        <div className="max-w-md rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] p-5 text-sm text-[#B85C33]">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{error ?? "견적서를 찾을 수 없습니다."}</span>
          </div>
        </div>
      </main>
    )
  }

  const { document, version } = payload
  const validUntil = formatDate(version.valid_until)
  const quoteDetails = getQuoteDetailsFromStructuredJson(version.structured_json, {
    validUntil: version.valid_until,
  })

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
          <p className="mt-2 text-sm text-[#1a1a1a]/60">내부 직접 보기</p>
          <div className="mt-5">
            <QuoteViewerActions
              reviewEndpoint={`/api/portal/quotes/${document.id}/confirm`}
              authMode="admin"
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
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(version.content_html) }}
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
          내부 확인용 견적서 화면입니다. 고객 발송은 공유 링크를 사용해 주세요.
        </footer>
      </article>
    </main>
  )
}
