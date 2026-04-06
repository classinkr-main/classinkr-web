"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, RefreshCw, Trash2, X, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Receipt, Partner, PaymentMethod } from "@/lib/supabase/database.types"

const DUMMY_MODE = false

const DUMMY_PARTNERS_MAP: Record<string, string> = {
  p1: "삼성초등학교", p2: "판교중학교", p3: "해운대여자고등학교", p4: "서초과학기술원", p5: "강동초등학교",
}
const DUMMY_RECEIPTS_LIST: Receipt[] = [
  { id: "r1", receipt_number: "R-2026-001", contract_id: "c2",  partner_id: "p4", amount: 16363636, tax_amount: 1636364, total_amount: 18000000, payment_method: "bank_transfer", cash_receipt_requested: false, cash_receipt_type: null, cash_receipt_number: null, pdf_url: null, emailed_at: null, paid_at: "2026-02-25T00:00:00Z", notes: null, created_by: null, created_at: "2026-02-25T00:00:00Z", updated_at: "2026-02-25T00:00:00Z" },
  { id: "r2", receipt_number: "R-2026-002", contract_id: "c3",  partner_id: "p3", amount: 10909090, tax_amount: 1090910, total_amount: 12000000, payment_method: "bank_transfer", cash_receipt_requested: false, cash_receipt_type: null, cash_receipt_number: null, pdf_url: null, emailed_at: null, paid_at: "2026-03-02T00:00:00Z", notes: null, created_by: null, created_at: "2026-03-02T00:00:00Z", updated_at: "2026-03-02T00:00:00Z" },
]

const METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "계좌이체", card: "카드", cash: "현금",
}

function adminFetch(url: string, options?: RequestInit) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options?.headers },
  })
}

const EMPTY_FORM = {
  contract_id: "", partner_id: "", amount: 0, tax_amount: 0, total_amount: 0,
  payment_method: "bank_transfer" as PaymentMethod,
  cash_receipt_requested: false, cash_receipt_type: "", cash_receipt_number: "",
  paid_at: "", notes: "",
}

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (DUMMY_MODE) {
      setReceipts(DUMMY_RECEIPTS_LIST)
      setLoading(false)
      return
    }
    setLoading(true)
    const [rRes, pRes] = await Promise.all([
      adminFetch("/api/admin/receipts"),
      adminFetch("/api/admin/partners"),
    ])
    if (rRes.ok) setReceipts((await rRes.json()).receipts ?? [])
    if (pRes.ok) setPartners((await pRes.json()).partners ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    let alive = true

    const initialize = async () => {
      if (DUMMY_MODE) {
        setReceipts(DUMMY_RECEIPTS_LIST)
        setLoading(false)
        return
      }

      setLoading(true)
      const [rRes, pRes] = await Promise.all([
        adminFetch("/api/admin/receipts"),
        adminFetch("/api/admin/partners"),
      ])

      if (!alive) return
      if (rRes.ok) setReceipts((await rRes.json()).receipts ?? [])
      if (pRes.ok) setPartners((await pRes.json()).partners ?? [])
      if (alive) setLoading(false)
    }

    void initialize()

    return () => {
      alive = false
    }
  }, [])

  // 공급가액 입력 시 부가세 자동 계산
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
    if (!confirm("영수증을 삭제하시겠습니까?")) return
    await adminFetch(`/api/admin/receipts/${id}`, { method: "DELETE" })
    load()
  }

  const partnerName = (id: string) => DUMMY_MODE ? (DUMMY_PARTNERS_MAP[id] ?? id) : (partners.find((p) => p.id === id)?.name ?? id)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a1a]">영수증</h1>
          <p className="text-sm text-[#1a1a1a]/50 mt-0.5">{receipts.length}건</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" />영수증 발행
          </Button>
        </div>
      </div>

      <div className="border border-[#e8e8e4] rounded-xl overflow-hidden bg-white">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
        ) : receipts.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">발행된 영수증이 없습니다</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f7f7f5] border-b border-[#e8e8e4]">
              <tr>
                {["번호", "파트너사", "총액", "결제방법", "현금영수증", "결제일", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-[#1a1a1a]/60 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="border-b border-[#f0f0ec] hover:bg-[#fafafa] transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-[#1a1a1a]/60">{r.receipt_number}</td>
                  <td className="px-4 py-3 text-[#1a1a1a]/70">{partnerName(r.partner_id)}</td>
                  <td className="px-4 py-3 font-medium">{r.total_amount.toLocaleString()}원</td>
                  <td className="px-4 py-3 text-xs text-[#1a1a1a]/70">{METHOD_LABEL[r.payment_method]}</td>
                  <td className="px-4 py-3 text-xs">
                    {r.cash_receipt_requested
                      ? <span className="text-green-600">발행 ({r.cash_receipt_type === "business" ? "사업자" : "개인"})</span>
                      : <span className="text-[#1a1a1a]/30">미발행</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#1a1a1a]/50">
                    {r.paid_at ? new Date(r.paid_at).toLocaleDateString("ko") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {r.pdf_url && (
                        <a href={r.pdf_url} target="_blank" rel="noreferrer">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                            <Download className="w-3.5 h-3.5 mr-1" />PDF
                          </Button>
                        </a>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-400" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 영수증 발행 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e4]">
              <h2 className="text-base font-semibold">영수증 발행</h2>
              <button onClick={() => setShowForm(false)} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">파트너사 *</label>
                  <select required value={form.partner_id} onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]">
                    <option value="">선택</option>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">결제방법</label>
                  <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentMethod })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]">
                    <option value="bank_transfer">계좌이체</option>
                    <option value="card">카드</option>
                    <option value="cash">현금</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">공급가액 *</label>
                  <input type="number" required min={0} value={form.amount || ""}
                    onChange={(e) => handleAmountChange(+e.target.value)}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">합계 (VAT 포함)</label>
                  <input readOnly value={form.total_amount.toLocaleString() + "원"}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm bg-[#f7f7f5] text-[#1a1a1a]/60" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">결제일</label>
                  <input type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input type="checkbox" id="cash_receipt" checked={form.cash_receipt_requested}
                    onChange={(e) => setForm({ ...form, cash_receipt_requested: e.target.checked })}
                    className="rounded" />
                  <label htmlFor="cash_receipt" className="text-sm text-[#1a1a1a]/70">현금영수증 발행</label>
                </div>
                {form.cash_receipt_requested && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">구분</label>
                      <select value={form.cash_receipt_type}
                        onChange={(e) => setForm({ ...form, cash_receipt_type: e.target.value })}
                        className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]">
                        <option value="personal">개인 (주민번호/휴대폰)</option>
                        <option value="business">사업자</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">발행 번호</label>
                      <input value={form.cash_receipt_number}
                        onChange={(e) => setForm({ ...form, cash_receipt_number: e.target.value })}
                        placeholder="사업자번호 / 휴대폰번호"
                        className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                    </div>
                  </>
                )}
                <div className="col-span-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">메모</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2} className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a] resize-none" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>취소</Button>
                <Button type="submit" disabled={saving}>{saving ? "저장 중..." : "발행"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
