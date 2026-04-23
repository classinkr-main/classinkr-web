"use client"

import { useState } from "react"
import { ExternalLink, FileText, Plus, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import QuickQuoteComposer, {
  type QuickQuoteCreatedPayload,
} from "@/components/partner-portal/quotes/QuickQuoteComposer"

type CreatedHardwareQuote = {
  id: string
  quoteNumber: string
  title: string
  customerName: string
  totalAmount: number
  status: string
  action: QuickQuoteCreatedPayload["action"]
  shareUrl: string | null
  updatedAt: string
}

const ACTION_LABEL: Record<QuickQuoteCreatedPayload["action"], string> = {
  save: "임시 저장",
  save_and_preview: "미리보기",
  save_and_send: "전송 준비",
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export default function HardwareQuotesPanel() {
  const [composerOpen, setComposerOpen] = useState(false)
  const [createdQuotes, setCreatedQuotes] = useState<CreatedHardwareQuote[]>([])

  async function handleCreated(payload: QuickQuoteCreatedPayload) {
    setCreatedQuotes((current) => [
      {
        id: payload.document.id,
        quoteNumber: payload.document.quote_number,
        title: payload.version.title,
        customerName: payload.customer.name,
        totalAmount: payload.version.total_amount,
        status: payload.document.status,
        action: payload.action,
        shareUrl: payload.shareUrl ?? null,
        updatedAt: payload.document.updated_at,
      },
      ...current.filter((item) => item.id !== payload.document.id),
    ])
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-[#e8e8e4] bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/35">
            Hardware Quote
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[#111110]">
            하드웨어 견적서
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#1a1a1a]/55">
            기존 표준 견적서 양식을 그대로 사용합니다. 작성한 견적서는 CRM의 고객·거래 로그와 같은 문서 흐름에 연결됩니다.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="bg-[#084734] text-white hover:bg-[#065c41]"
        >
          <Plus className="mr-2 h-4 w-4" />
          견적서 작성
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
        <div className="flex items-center justify-between border-b border-[#ecebe6] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-[#111110]">방금 작성한 견적서</h3>
            <p className="mt-1 text-xs text-[#1a1a1a]/45">
              이 화면에서 생성한 하드웨어 견적서가 세션 기준으로 표시됩니다.
            </p>
          </div>
          <span className="rounded-full bg-[#f6f5f2] px-2.5 py-1 text-xs font-medium text-[#615D59]">
            {createdQuotes.length}
          </span>
        </div>

        {createdQuotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f6f5f2] text-[#615D59]">
              <FileText className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-medium text-[#111110]">
              아직 작성한 하드웨어 견적서가 없습니다.
            </p>
            <p className="mt-1 text-xs text-[#1a1a1a]/45">
              견적서 작성 버튼에서 기존 견적 포맷을 바로 열 수 있습니다.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#f0f0ec]">
            {createdQuotes.map((quote) => (
              <div
                key={quote.id}
                className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-[#fafaf8] md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-[#1a1a1a]/45">{quote.quoteNumber}</span>
                    <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-medium text-[#084734]">
                      {ACTION_LABEL[quote.action]}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-[#111110]">{quote.title}</p>
                  <p className="mt-1 text-xs text-[#1a1a1a]/45">
                    {quote.customerName} · {formatDateTime(quote.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-[#111110]">{formatMoney(quote.totalAmount)}</span>
                  {quote.shareUrl ? (
                    <a
                      href={quote.shareUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#e8e8e4] px-3 py-2 text-xs font-medium text-[#1a1a1a]/65 transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      공유 링크
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-[#f6f5f2] px-3 py-2 text-xs font-medium text-[#615D59]">
                      <Send className="h-3.5 w-3.5" />
                      저장됨
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <QuickQuoteComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        recentQuotes={[]}
        apiBase="/api/portal"
        onCreated={handleCreated}
      />
    </div>
  )
}
