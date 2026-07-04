"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Plus, RefreshCw, Trash2, X, Download, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminFetch, adminFetchJsonCached } from "@/lib/admin-client"
import { useUrlState } from "@/lib/use-url-state"
import type { Receipt, Partner, PaymentMethod } from "@/lib/supabase/database.types"

// GET /api/admin/partners는 { partners }가 아니라 { workspaces }/{ summaries }를 반환한다.
// 패널은 파트너명 표시·셀렉트에 id/name만 필요하므로 summary 응답을 최소 형태로 매핑해 쓴다.
type PartnerOption = Pick<Partner, "id" | "name">

const METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "계좌이체",
  card: "카드",
  cash: "현금",
}

const EMPTY_FORM = {
  contract_id: "",
  partner_id: "",
  amount: 0,
  tax_amount: 0,
  total_amount: 0,
  payment_method: "bank_transfer" as PaymentMethod,
  cash_receipt_requested: false,
  cash_receipt_type: "",
  cash_receipt_number: "",
  paid_at: "",
  notes: "",
}

export function ReceiptsPanel() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [partners, setPartners] = useState<PartnerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [query, setQuery] = useUrlState("receipt_q", "")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rData, pData] = await Promise.all([
        adminFetchJsonCached<{ receipts?: Receipt[] }>("/api/admin/receipts"),
        adminFetchJsonCached<{ summaries?: Array<{ partnerId: string; partnerName: string }> }>(
          "/api/admin/partners?view=summary"
        ),
      ])
      setReceipts(rData.receipts ?? [])
      setPartners((pData.summaries ?? []).map((s) => ({ id: s.partnerId, name: s.partnerName })))
    } catch {
      // 기존 데이터 유지 — 일시적 네트워크 오류 시 빈 화면 방지
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function handleAmountChange(v: number) {
    const tax = Math.round(v * 0.1)
    setForm({ ...form, amount: v, tax_amount: tax, total_amount: v + tax })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      ...form,
      cash_receipt_type: form.cash_receipt_requested ? form.cash_receipt_type || null : null,
      cash_receipt_number: form.cash_receipt_requested ? form.cash_receipt_number || null : null,
      paid_at: form.paid_at ? new Date(form.paid_at).toISOString() : null,
    }
    const res = await adminFetch("/api/admin/receipts", { method: "POST", body: JSON.stringify(payload) })
    if (res.ok) {
      setShowForm(false)
      setForm(EMPTY_FORM)
      load()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("이 영수증을 삭제할까요?")) return
    await adminFetch(`/api/admin/receipts/${id}`, { method: "DELETE" })
    load()
  }

  const partnerName = useCallback(
    (id: string) => partners.find((p) => p.id === id)?.name ?? id,
    [partners]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return receipts
    return receipts.filter(
      (r) =>
        r.receipt_number.toLowerCase().includes(q) ||
        partnerName(r.partner_id).toLowerCase().includes(q)
    )
  }, [receipts, query, partnerName])

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:px-6 sm:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/30" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="번호 · 파트너 검색"
            className="w-full rounded-lg border border-[#e8e8e4] bg-white py-2 pl-9 pr-3 text-sm text-[#1a1a1a] placeholder:text-[#1a1a1a]/30 focus:border-[#084734]/40 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#615D59] ring-1 ring-[#e8e8e4]">
            {loading ? "불러오는 중" : `${filtered.length}/${receipts.length}`}
          </span>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-4 w-4" />
            영수증 발행
          </Button>
        </div>
      </div>

      <div className="border border-[#e8e8e4] rounded-xl overflow-hidden bg-white">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
        ) : receipts.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">발행된 영수증이 없습니다.</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">
            <p>조건에 맞는 영수증이 없습니다.</p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-2 text-xs font-medium text-[#084734] underline underline-offset-2"
            >
              검색 초기화
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-[#f0f0ec] md:hidden">
              {filtered.map((r) => (
                <div key={`mobile-${r.id}`} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-[#1a1a1a]/45">{r.receipt_number}</p>
                      <p className="mt-1 truncate text-sm font-semibold text-[#111110]">{partnerName(r.partner_id)}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-[#111110]">{r.total_amount.toLocaleString()}원</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#1a1a1a]/55">
                    <div>
                      <p className="text-[#1a1a1a]/32">결제수단</p>
                      <p className="mt-0.5 font-medium text-[#111110]">{METHOD_LABEL[r.payment_method]}</p>
                    </div>
                    <div>
                      <p className="text-[#1a1a1a]/32">입금일</p>
                      <p className="mt-0.5 font-medium text-[#111110]">{r.paid_at ? new Date(r.paid_at).toLocaleDateString("ko") : "-"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[#1a1a1a]/32">현금영수증</p>
                      {r.cash_receipt_requested ? (
                        <p className="mt-0.5 font-medium text-[#084734]">발행됨 ({r.cash_receipt_type === "business" ? "사업자" : "개인"})</p>
                      ) : (
                        <p className="mt-0.5 text-[#1a1a1a]/35">미발행</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {r.pdf_url && (
                      <a href={r.pdf_url} target="_blank" rel="noreferrer" className="flex-1">
                        <Button variant="outline" size="sm" className="w-full">
                          <Download className="mr-1 h-3.5 w-3.5" />
                          PDF
                        </Button>
                      </a>
                    )}
                    <Button variant="outline" size="sm" className="flex-1 text-[#B85C33]" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      삭제
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-[#f7f7f5] border-b border-[#e8e8e4]">
                  <tr>
                    {["번호", "파트너", "금액", "결제수단", "현금영수증", "입금일", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-medium text-[#1a1a1a]/60 text-xs">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-[#f0f0ec] hover:bg-[#fafafa] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-[#1a1a1a]/60">{r.receipt_number}</td>
                      <td className="px-4 py-3 text-[#1a1a1a]/70">{partnerName(r.partner_id)}</td>
                      <td className="px-4 py-3 font-medium">{r.total_amount.toLocaleString()}원</td>
                      <td className="px-4 py-3 text-xs text-[#1a1a1a]/70">{METHOD_LABEL[r.payment_method]}</td>
                      <td className="px-4 py-3 text-xs">
                        {r.cash_receipt_requested ? (
                          <span className="text-[#084734]">발행됨 ({r.cash_receipt_type === "business" ? "사업자" : "개인"})</span>
                        ) : (
                          <span className="text-[#1a1a1a]/30">미발행</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#1a1a1a]/50">{r.paid_at ? new Date(r.paid_at).toLocaleDateString("ko") : "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {r.pdf_url && (
                            <a href={r.pdf_url} target="_blank" rel="noreferrer">
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                                <Download className="w-3.5 h-3.5 mr-1" />
                                PDF
                              </Button>
                            </a>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-[#B85C33]" onClick={() => handleDelete(r.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
              <h2 className="text-base font-semibold">영수증 발행</h2>
              <button onClick={() => setShowForm(false)} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="max-h-[calc(100dvh-5.5rem)] space-y-4 overflow-y-auto p-4 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">파트너 *</label>
                  <select
                    required
                    value={form.partner_id}
                    onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]"
                  >
                    <option value="">선택</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">결제수단</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentMethod })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]"
                  >
                    <option value="bank_transfer">계좌이체</option>
                    <option value="card">카드</option>
                    <option value="cash">현금</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">공급가액 *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={form.amount || ""}
                    onChange={(e) => handleAmountChange(+e.target.value)}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">합계 (VAT 포함)</label>
                  <input
                    readOnly
                    value={`${form.total_amount.toLocaleString()}원`}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm bg-[#f7f7f5] text-[#1a1a1a]/60"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">입금일</label>
                  <input
                    type="date"
                    value={form.paid_at}
                    onChange={(e) => setForm({ ...form, paid_at: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]"
                  />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id="cash_receipt"
                    checked={form.cash_receipt_requested}
                    onChange={(e) => setForm({ ...form, cash_receipt_requested: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="cash_receipt" className="text-sm text-[#1a1a1a]/70">
                    현금영수증
                  </label>
                </div>
                {form.cash_receipt_requested && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">유형</label>
                      <select
                        value={form.cash_receipt_type}
                        onChange={(e) => setForm({ ...form, cash_receipt_type: e.target.value })}
                        className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]"
                      >
                        <option value="personal">개인</option>
                        <option value="business">사업자</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">현금영수증 번호</label>
                      <input
                        value={form.cash_receipt_number}
                        onChange={(e) => setForm({ ...form, cash_receipt_number: e.target.value })}
                        placeholder="사업자번호 또는 휴대폰번호"
                        className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]"
                      />
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">메모</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a] resize-none"
                  />
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  취소
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "발행 중..." : "발행"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

