"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  FileText, ClipboardList, Receipt, LogOut,
  CheckCircle2, Clock, XCircle, AlertCircle,
  ChevronRight, ExternalLink, Download,
} from "lucide-react"
import type { Quote, Contract, Receipt as ReceiptType, Partner } from "@/lib/supabase/database.types"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

// ─── 상태 레이블/색상 ──────────────────────────────────────

const QUOTE_STATUS_LABEL: Record<string, string> = {
  draft: "초안", sent: "발송됨", accepted: "수락", rejected: "거절", expired: "만료", converted: "계약 전환",
}
const QUOTE_STATUS_COLOR: Record<string, string> = {
  draft: "bg-[#f0f0ec] text-[#1a1a1a]/50",
  sent: "bg-blue-50 text-blue-600",
  accepted: "bg-green-50 text-green-600",
  rejected: "bg-red-50 text-red-500",
  expired: "bg-[#f0f0ec] text-[#1a1a1a]/40",
  converted: "bg-purple-50 text-purple-600",
}

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  draft: "초안", sent: "서명 대기", partner_signed: "대표 서명 완료",
  admin_signed: "관리자 서명 완료", completed: "완료", cancelled: "취소",
}
const CONTRACT_STATUS_COLOR: Record<string, string> = {
  draft: "bg-[#f0f0ec] text-[#1a1a1a]/50",
  sent: "bg-yellow-50 text-yellow-600",
  partner_signed: "bg-blue-50 text-blue-600",
  admin_signed: "bg-indigo-50 text-indigo-600",
  completed: "bg-green-50 text-green-600",
  cancelled: "bg-red-50 text-red-400",
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${color}`}>
      {label}
    </span>
  )
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR") + "원"
}

function fmtDate(d: string | null) {
  if (!d) return "-"
  return new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })
}

// ─── 탭 ────────────────────────────────────────────────────

type Tab = "quotes" | "contracts" | "receipts"

interface DashboardData {
  partner: Partner
  quotes: Quote[]
  contracts: (Contract & { sign_token?: string | null })[]
  receipts: ReceiptType[]
  userRole: "admin" | "member"
}

export default function PartnerDashboardPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("contracts")
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/partner/data")
      .then(async (res) => {
        if (res.status === 401) { router.replace("/partner/login"); return null }
        if (!res.ok) throw new Error((await res.json()).error ?? "데이터를 불러올 수 없습니다")
        return res.json()
      })
      .then((d) => { if (d) setData(d) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [router])

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.replace("/partner/login")
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5]">
        <p className="text-sm text-[#1a1a1a]/40">불러오는 중...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] p-4">
        <div className="bg-white rounded-2xl border border-[#e8e8e4] p-8 max-w-sm w-full text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-[#1a1a1a]/60">{error ?? "오류가 발생했습니다"}</p>
          <button onClick={() => router.replace("/partner/login")}
            className="mt-4 text-xs text-[#1a1a1a]/40 underline">로그인 페이지로</button>
        </div>
      </div>
    )
  }

  const { partner, quotes, contracts, receipts, userRole } = data
  const isAdmin = userRole === "admin"

  // 견적서 버전 계산: quote_number 기준으로 최대 version 파악
  const maxVersionByQuoteNumber: Record<string, number> = {}
  for (const q of quotes) {
    const cur = maxVersionByQuoteNumber[q.quote_number] ?? 0
    if (q.version > cur) maxVersionByQuoteNumber[q.quote_number] = q.version
  }

  const pendingContracts = contracts.filter((c) => c.status === "sent" && !c.partner_signed_at)

  return (
    <div className="min-h-screen bg-[#f7f7f5]">
      {/* 헤더 */}
      <header className="bg-white border-b border-[#e8e8e4] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-[#1a1a1a]/40 uppercase tracking-widest">ClassIn 파트너 포털</p>
            <h1 className="text-sm font-semibold text-[#1a1a1a]">
              {partner.name}
              {isAdmin && (
                <span className="ml-2 text-[10px] font-normal text-[#1a1a1a]/40">대표</span>
              )}
            </h1>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-[#1a1a1a]/40 hover:text-[#1a1a1a] transition-colors">
            <LogOut className="w-3.5 h-3.5" />로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* 서명 대기 알림 — admin만 표시 */}
        {isAdmin && pendingContracts.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 flex items-start gap-3">
            <Clock className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-yellow-800">서명이 필요한 계약서가 있습니다</p>
              <p className="text-xs text-yellow-600 mt-0.5">{pendingContracts.length}건의 계약서에 대표 서명을 기다리고 있습니다.</p>
            </div>
            <button onClick={() => setTab("contracts")}
              className="text-xs text-yellow-700 underline shrink-0">확인하기</button>
          </div>
        )}

        {/* member: 서명 대기 안내 */}
        {!isAdmin && pendingContracts.length > 0 && (
          <div className="bg-[#f0f0ec] border border-[#e8e8e4] rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-[#1a1a1a]/40 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#1a1a1a]/70">서명 대기 중인 계약서가 있습니다</p>
              <p className="text-xs text-[#1a1a1a]/40 mt-0.5">계약 서명은 대표 계정으로만 가능합니다.</p>
            </div>
            <button onClick={() => setTab("contracts")}
              className="text-xs text-[#1a1a1a]/50 underline shrink-0">확인하기</button>
          </div>
        )}

        {/* 요약 카드 */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "견적서", count: quotes.length, icon: ClipboardList, tab: "quotes" as Tab },
            { label: "계약서", count: contracts.length, icon: FileText, tab: "contracts" as Tab },
            { label: "영수증", count: receipts.length, icon: Receipt, tab: "receipts" as Tab },
          ].map(({ label, count, icon: Icon, tab: t }) => (
            <button key={t} onClick={() => setTab(t)}
              className={`bg-white rounded-2xl border p-4 text-left transition-all ${
                tab === t ? "border-[#1a1a1a] shadow-sm" : "border-[#e8e8e4] hover:border-[#1a1a1a]/30"
              }`}>
              <Icon className="w-4 h-4 text-[#1a1a1a]/40 mb-2" />
              <p className="text-xl font-bold text-[#1a1a1a]">{count}</p>
              <p className="text-xs text-[#1a1a1a]/50">{label}</p>
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <div className="bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden">
          {/* 탭 헤더 */}
          <div className="flex border-b border-[#e8e8e4]">
            {(["contracts", "quotes", "receipts"] as Tab[]).map((t) => {
              const labels: Record<Tab, string> = { contracts: "계약서", quotes: "견적서", receipts: "영수증" }
              return (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-3 text-xs font-medium transition-colors ${
                    tab === t ? "text-[#1a1a1a] border-b-2 border-[#1a1a1a] -mb-px" : "text-[#1a1a1a]/40 hover:text-[#1a1a1a]/70"
                  }`}>
                  {labels[t]}
                </button>
              )
            })}
          </div>

          {/* 견적서 */}
          {tab === "quotes" && (
            <div>
              {quotes.length === 0 ? (
                <EmptyState icon={ClipboardList} text="발송된 견적서가 없습니다" />
              ) : (
                <ul className="divide-y divide-[#e8e8e4]">
                  {quotes.map((q) => {
                    const isLatest = q.version === maxVersionByQuoteNumber[q.quote_number]
                    return (
                      <li key={q.id} className={`px-5 py-4 flex items-start justify-between gap-3 ${!isLatest ? "opacity-50" : ""}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <StatusBadge label={QUOTE_STATUS_LABEL[q.status] ?? q.status} color={QUOTE_STATUS_COLOR[q.status] ?? ""} />
                            <span className="text-[10px] text-[#1a1a1a]/30">{q.quote_number}</span>
                            {/* 버전 뱃지 */}
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              isLatest
                                ? "bg-[#1a1a1a]/8 text-[#1a1a1a]/60"
                                : "bg-[#f0f0ec] text-[#1a1a1a]/30"
                            }`}>
                              v{q.version}
                              {!isLatest && <span className="ml-1">· 이전 버전</span>}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-[#1a1a1a] truncate">{q.title}</p>
                          <p className="text-xs text-[#1a1a1a]/40 mt-0.5">
                            {fmt(q.total_amount)} · 유효기간 {fmtDate(q.valid_until)}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {/* 계약서 */}
          {tab === "contracts" && (
            <div>
              {contracts.length === 0 ? (
                <EmptyState icon={FileText} text="계약서가 없습니다" />
              ) : (
                <ul className="divide-y divide-[#e8e8e4]">
                  {contracts.map((c) => {
                    const needsSign = c.status === "sent" && !c.partner_signed_at
                    return (
                      <li key={c.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <StatusBadge
                                label={CONTRACT_STATUS_LABEL[c.status] ?? c.status}
                                color={CONTRACT_STATUS_COLOR[c.status] ?? ""}
                              />
                              <span className="text-[10px] text-[#1a1a1a]/30">{c.contract_number}</span>
                            </div>
                            <p className="text-sm font-medium text-[#1a1a1a] truncate">{c.title}</p>
                            <p className="text-xs text-[#1a1a1a]/40 mt-0.5">
                              {fmt(c.total_amount)}
                              {c.valid_until ? ` · 만료 ${fmtDate(c.valid_until)}` : ""}
                            </p>
                          </div>
                          {/* 서명 버튼: admin만 활성화 */}
                          {needsSign && c.sign_token && isAdmin && (
                            <a
                              href={`/partner/sign/${c.sign_token}`}
                              className="shrink-0 flex items-center gap-1 bg-[#1a1a1a] text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
                            >
                              서명하기 <ChevronRight className="w-3 h-3" />
                            </a>
                          )}
                          {/* member: 서명 불가 안내 */}
                          {needsSign && !isAdmin && (
                            <span className="shrink-0 text-[10px] text-[#1a1a1a]/30 text-right leading-tight">
                              대표 계정으로<br />서명 가능
                            </span>
                          )}
                          {c.partner_signed_at && (
                            <div className="shrink-0 flex items-center gap-1 text-green-600 text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              대표 서명 완료
                            </div>
                          )}
                          {c.status === "cancelled" && (
                            <div className="shrink-0 flex items-center gap-1 text-[#1a1a1a]/30 text-xs">
                              <XCircle className="w-3.5 h-3.5" />
                              취소됨
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {/* 영수증 */}
          {tab === "receipts" && (
            <div>
              {receipts.length === 0 ? (
                <EmptyState icon={Receipt} text="영수증이 없습니다" />
              ) : (
                <ul className="divide-y divide-[#e8e8e4]">
                  {receipts.map((r) => (
                    <li key={r.id} className="px-5 py-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-[#1a1a1a]/30">{r.receipt_number}</span>
                          {r.paid_at && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600">
                              <CheckCircle2 className="w-2.5 h-2.5" />결제완료
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-[#1a1a1a]">{fmt(r.total_amount)}</p>
                        <p className="text-xs text-[#1a1a1a]/40 mt-0.5">
                          {r.payment_method === "bank_transfer" ? "계좌이체" : r.payment_method === "card" ? "카드" : "현금"}
                          {r.paid_at ? ` · ${fmtDate(r.paid_at)}` : " · 결제 대기"}
                        </p>
                      </div>
                      {/* PDF 다운로드 버튼 */}
                      {r.pdf_url ? (
                        <a
                          href={r.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1 text-xs text-[#1a1a1a]/50 hover:text-[#1a1a1a] border border-[#e8e8e4] rounded-lg px-3 py-1.5 transition-colors"
                        >
                          PDF 다운로드 <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <button
                          onClick={() => alert("PDF 다운로드 준비 중")}
                          className="shrink-0 flex items-center gap-1 text-xs text-[#1a1a1a]/30 hover:text-[#1a1a1a]/50 border border-[#e8e8e4] rounded-lg px-3 py-1.5 transition-colors"
                        >
                          PDF <Download className="w-3 h-3" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* 문의 */}
        <p className="text-center text-xs text-[#1a1a1a]/30 pb-4">
          문의사항은 담당자에게 연락해 주세요.
        </p>
      </main>
    </div>
  )
}

function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="py-12 flex flex-col items-center gap-2">
      <Icon className="w-7 h-7 text-[#1a1a1a]/15" />
      <p className="text-sm text-[#1a1a1a]/30">{text}</p>
    </div>
  )
}
