"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Printer, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react"

// ── 타입 ──────────────────────────────────────────────────

interface QuoteItem {
  id: string
  product_name: string
  description: string | null
  quantity: number
  unit_price: number
  discount_rate: number
  amount: number
  sort_order: number
}

interface QuoteDetail {
  id: string
  quote_number: string
  partner_name: string
  title: string
  status: string
  valid_until: string | null
  subtotal: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  notes: string | null
  created_at: string
  items: QuoteItem[]
}

// ── 더미 데이터 ─────────────────────────────────────────────

const DUMMY_QUOTES: Record<string, QuoteDetail> = {
  q1: {
    id: "q1", quote_number: "Q-2026-001", partner_name: "한국교육솔루션(주)",
    title: "ClassIn Board 86인치 5대 납품", status: "accepted",
    valid_until: "2026-04-30", subtotal: 22727272, discount_amount: 0,
    tax_amount: 2272728, total_amount: 25000000,
    notes: "설치 및 초기 교육 포함. 배송비 무상.",
    created_at: "2026-03-01T00:00:00Z",
    items: [
      { id: "qi1", product_name: "ClassIn Board 86인치 (CB-86)", description: "터치스크린 전자칠판, 안드로이드 내장", quantity: 5, unit_price: 4545454, discount_rate: 0, amount: 22727270, sort_order: 0 },
      { id: "qi2", product_name: "설치 및 초기교육", description: "현장 설치 + 교사 교육 1회", quantity: 1, unit_price: 0, discount_rate: 0, amount: 0, sort_order: 1 },
      { id: "qi3", product_name: "1년 보증 서비스", description: "무상 AS 포함", quantity: 1, unit_price: 0, discount_rate: 0, amount: 0, sort_order: 2 },
    ],
  },
  q2: {
    id: "q2", quote_number: "Q-2026-004", partner_name: "한국교육솔루션(주)",
    title: "ClassIn Board 75인치 추가 3대", status: "draft",
    valid_until: "2026-05-15", subtotal: 10909090, discount_amount: 0,
    tax_amount: 1090910, total_amount: 12000000,
    notes: null, created_at: "2026-04-01T00:00:00Z",
    items: [
      { id: "qi4", product_name: "ClassIn Board 75인치 (CB-75)", description: "터치스크린 전자칠판", quantity: 3, unit_price: 3636363, discount_rate: 0, amount: 10909089, sort_order: 0 },
    ],
  },
  q3: {
    id: "q3", quote_number: "Q-2026-002", partner_name: "에듀테크파트너스",
    title: "판교 초등학교 ClassIn 10대 공급", status: "sent",
    valid_until: "2026-04-20", subtotal: 45454545, discount_amount: 0,
    tax_amount: 4545455, total_amount: 50000000,
    notes: "부가세 별도 협의 가능. 수량 협의에 따라 단가 조정 가능.",
    created_at: "2026-03-18T00:00:00Z",
    items: [
      { id: "qi5", product_name: "ClassIn Board 86인치 (CB-86)", description: "86인치 전자칠판", quantity: 6, unit_price: 4545454, discount_rate: 0, amount: 27272724, sort_order: 0 },
      { id: "qi6", product_name: "ClassIn Board 75인치 (CB-75)", description: "75인치 전자칠판", quantity: 4, unit_price: 3636363, discount_rate: 0, amount: 14545452, sort_order: 1 },
      { id: "qi7", product_name: "설치 및 교육", description: "전 수량 현장 설치 포함", quantity: 1, unit_price: 3636369, discount_rate: 0, amount: 3636369, sort_order: 2 },
    ],
  },
}

// ── 상태 배지 ─────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    draft:     { label: "초안",     color: "bg-[#f0f0ec] text-[#1a1a1a]/50", icon: <Clock className="w-3 h-3" /> },
    sent:      { label: "발송됨",   color: "bg-blue-50 text-blue-600",        icon: <Clock className="w-3 h-3" /> },
    accepted:  { label: "수락됨",   color: "bg-green-50 text-green-700",      icon: <CheckCircle2 className="w-3 h-3" /> },
    rejected:  { label: "거절됨",   color: "bg-red-50 text-red-500",          icon: <XCircle className="w-3 h-3" /> },
    expired:   { label: "만료됨",   color: "bg-[#f0f0ec] text-[#1a1a1a]/40", icon: <AlertCircle className="w-3 h-3" /> },
    converted: { label: "계약전환", color: "bg-purple-50 text-purple-600",    icon: <CheckCircle2 className="w-3 h-3" /> },
  }
  const s = map[status] ?? { label: status, color: "bg-[#f0f0ec] text-[#1a1a1a]/50", icon: null }
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${s.color}`}>
      {s.icon}{s.label}
    </span>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────

export default function QuotePreviewPage() {
  const { id } = useParams<{ id: string }>()
  const [quote, setQuote] = useState<QuoteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // 더미 모드: 알려진 id면 더미 반환
    if (id && DUMMY_QUOTES[id]) {
      setQuote(DUMMY_QUOTES[id]); setLoading(false); return
    }
    fetch(`/api/admin/quotes/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("견적서를 찾을 수 없습니다")
        return res.json()
      })
      .then((data) => setQuote(data.quote))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5]">
      <p className="text-sm text-[#1a1a1a]/40">견적서를 불러오는 중...</p>
    </div>
  )

  if (error || !quote) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8e4] p-8 max-w-md w-full text-center">
        <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h2 className="text-base font-semibold text-[#1a1a1a] mb-2">견적서를 찾을 수 없습니다</h2>
        <p className="text-sm text-[#1a1a1a]/50">{error ?? "유효하지 않은 링크입니다."}</p>
      </div>
    </div>
  )

  const createdDate = new Date(quote.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })

  return (
    <div className="min-h-screen bg-[#f7f7f5] py-10 px-4 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* 인쇄 버튼 — 화면에서만 표시 */}
        <div className="flex justify-end print:hidden">
          <button onClick={() => window.print()}
            className="flex items-center gap-2 text-sm text-[#1a1a1a]/50 hover:text-[#1a1a1a] border border-[#e8e8e4] rounded-lg px-4 py-2 bg-white hover:bg-[#fafafa] transition-colors">
            <Printer className="w-4 h-4" />인쇄 / PDF 저장
          </button>
        </div>

        {/* 견적서 본문 */}
        <div className="bg-white rounded-2xl border border-[#e8e8e4] shadow-sm overflow-hidden print:shadow-none print:border-none print:rounded-none">

          {/* 헤더 */}
          <div className="px-8 pt-8 pb-6 border-b border-[#e8e8e4]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-widest text-[#1a1a1a]/30 uppercase mb-3">견 적 서</p>
                <h1 className="text-xl font-bold text-[#1a1a1a] leading-snug">{quote.title}</h1>
                <div className="flex items-center gap-3 mt-2">
                  <span className="font-mono text-sm text-[#1a1a1a]/40">{quote.quote_number}</span>
                  <StatusBadge status={quote.status} />
                </div>
              </div>
              {/* 로고 영역 */}
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-[#1a1a1a]">이이오클래스인코리아 유한회사</p>
                <p className="text-xs text-[#1a1a1a]/40 mt-0.5">ClassIn Korea</p>
              </div>
            </div>
          </div>

          {/* 수신/발신 정보 */}
          <div className="grid grid-cols-2 gap-0 border-b border-[#e8e8e4]">
            <div className="px-8 py-5 border-r border-[#e8e8e4]">
              <p className="text-xs text-[#1a1a1a]/40 mb-2 font-medium">수 신</p>
              <p className="text-sm font-semibold text-[#1a1a1a]">{quote.partner_name}</p>
              <p className="text-xs text-[#1a1a1a]/50 mt-0.5">귀중</p>
            </div>
            <div className="px-8 py-5">
              <p className="text-xs text-[#1a1a1a]/40 mb-2 font-medium">발 신</p>
              <p className="text-sm font-semibold text-[#1a1a1a]">이이오클래스인코리아 유한회사</p>
              <p className="text-xs text-[#1a1a1a]/50 mt-1">작성일: {createdDate}</p>
              {quote.valid_until && (
                <p className="text-xs text-[#1a1a1a]/50">유효기간: {quote.valid_until}까지</p>
              )}
            </div>
          </div>

          {/* 품목 테이블 */}
          <div className="px-8 py-6">
            <p className="text-xs font-semibold text-[#1a1a1a]/40 uppercase tracking-wider mb-3">견적 내역</p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-[#1a1a1a]">
                  <th className="pb-2 text-left font-semibold text-[#1a1a1a] text-xs">품목명</th>
                  <th className="pb-2 text-left font-semibold text-[#1a1a1a] text-xs pl-4">규격/설명</th>
                  <th className="pb-2 text-center font-semibold text-[#1a1a1a] text-xs w-12">수량</th>
                  <th className="pb-2 text-right font-semibold text-[#1a1a1a] text-xs w-32">단가</th>
                  {quote.items.some(i => i.discount_rate > 0) && (
                    <th className="pb-2 text-right font-semibold text-[#1a1a1a] text-xs w-16">할인</th>
                  )}
                  <th className="pb-2 text-right font-semibold text-[#1a1a1a] text-xs w-32">금액</th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map((item, idx) => (
                  <tr key={item.id} className={`border-b ${idx === quote.items.length - 1 ? "border-[#e8e8e4]" : "border-[#f0f0ec]"}`}>
                    <td className="py-3 font-medium text-[#1a1a1a]">{item.product_name}</td>
                    <td className="py-3 text-[#1a1a1a]/50 text-xs pl-4">{item.description ?? "—"}</td>
                    <td className="py-3 text-center text-[#1a1a1a]/70">
                      {item.unit_price > 0 ? item.quantity : "—"}
                    </td>
                    <td className="py-3 text-right text-[#1a1a1a]/70">
                      {item.unit_price > 0 ? `${item.unit_price.toLocaleString()}원` : "—"}
                    </td>
                    {quote.items.some(i => i.discount_rate > 0) && (
                      <td className="py-3 text-right text-[#1a1a1a]/50 text-xs">
                        {item.discount_rate > 0 ? `${item.discount_rate}%` : "—"}
                      </td>
                    )}
                    <td className="py-3 text-right font-semibold text-[#1a1a1a]">
                      {item.amount > 0 ? `${item.amount.toLocaleString()}원` : "포함"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 합계 */}
          <div className="px-8 pb-8">
            <div className="ml-auto w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[#1a1a1a]/50">공급가액</span>
                <span className="font-medium text-[#1a1a1a]">{quote.subtotal.toLocaleString()}원</span>
              </div>
              {quote.discount_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#1a1a1a]/50">할인금액</span>
                  <span className="font-medium text-red-500">−{quote.discount_amount.toLocaleString()}원</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-[#1a1a1a]/50">부가세 (10%)</span>
                <span className="font-medium text-[#1a1a1a]">{quote.tax_amount.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between pt-2 border-t-2 border-[#1a1a1a]">
                <span className="font-bold text-[#1a1a1a]">합계 금액</span>
                <span className="text-lg font-bold text-[#1a1a1a]">{quote.total_amount.toLocaleString()}원</span>
              </div>
            </div>
          </div>

          {/* 메모 */}
          {quote.notes && (
            <div className="px-8 pb-8">
              <div className="bg-[#f7f7f5] rounded-xl p-4">
                <p className="text-xs font-semibold text-[#1a1a1a]/40 mb-1.5">비고</p>
                <p className="text-sm text-[#1a1a1a]/70 whitespace-pre-line">{quote.notes}</p>
              </div>
            </div>
          )}

          {/* 푸터 */}
          <div className="px-8 py-5 border-t border-[#e8e8e4] bg-[#fafafa]">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#1a1a1a]/30">
                본 견적서는 유효기간 내에만 효력이 있습니다.
              </p>
              <p className="text-xs text-[#1a1a1a]/30">
                이이오클래스인코리아 유한회사 · 사업자번호 486-87-03249
              </p>
            </div>
          </div>
        </div>

        {/* 안내 문구 — 화면에서만 표시 */}
        <p className="text-center text-xs text-[#1a1a1a]/30 pb-6 print:hidden">
          인쇄 시 배경색을 포함하려면 브라우저 인쇄 옵션에서 "배경 그래픽"을 활성화하세요.
        </p>
      </div>
    </div>
  )
}
