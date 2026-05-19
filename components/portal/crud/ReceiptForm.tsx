"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, RefreshCw, X, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { portalFetch } from "@/lib/portal/portal-fetch"
import type { ReceiptRecord } from "@/lib/portal/types"

type PaymentMethod = "bank_transfer" | "card" | "cash"

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "계좌이체",
  card: "카드",
  cash: "현금",
}

function todayStr() {
  return new Date().toISOString().split("T")[0]
}

const EMPTY_FORM = {
  partner_account_id: "",
  customer_id: "",
  deal_id: "",
  amount: 0,
  tax_amount: 0,
  total_amount: 0,
  payment_method: "bank_transfer" as PaymentMethod,
  paid_at: todayStr(),
  notes: "",
}

interface Props {
  dealId?: string
  partnerAccountId?: string
  customerId?: string
}

export function ReceiptForm({ dealId, partnerAccountId, customerId }: Props) {
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const load = useCallback(async (showSpinner = true) => {
    if (!dealId) return
    if (showSpinner) setLoading(true)
    const res = await portalFetch(`/api/portal/deals/${dealId}`)
    if (res.ok) {
      const data = await res.json()
      setReceipts(data.receipts ?? [])
    }
    setLoading(false)
  }, [dealId])

  useEffect(() => {
    let active = true

    async function initialLoad() {
      if (!dealId) {
        setLoading(false)
        return
      }

      const res = await portalFetch(`/api/portal/deals/${dealId}`)
      if (!active) return
      if (res.ok) {
        const data = await res.json()
        if (!active) return
        setReceipts(data.receipts ?? [])
      } else {
        if (active) setLoadError(true)
      }
      setLoading(false)
    }

    void initialLoad()
    return () => {
      active = false
    }
  }, [dealId])

  function handleAmountChange(v: number) {
    const tax = Math.round(v * 0.1)
    setForm({ ...form, amount: v, tax_amount: tax, total_amount: v + tax })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    // 먼저 결제 등록
    const paymentRes = await portalFetch("/api/portal/payments", {
      method: "POST",
      body: JSON.stringify({
        partner_account_id: partnerAccountId,
        customer_id: customerId,
        deal_id: dealId,
        amount: form.total_amount,
        paid_at: form.paid_at ? new Date(form.paid_at).toISOString() : new Date().toISOString(),
        payment_method: form.payment_method,
        memo: form.notes || null,
      }),
    })

    if (!paymentRes.ok) {
      const err = await paymentRes.json().catch(() => null)
      setSaveError(err?.error ?? "결제 등록에 실패했습니다. 다시 시도해주세요.")
      setSaving(false)
      return
    }
    const { payment } = await paymentRes.json()

    // 영수증 발행
    const res = await portalFetch("/api/portal/receipts", {
      method: "POST",
      body: JSON.stringify({
        partner_account_id: partnerAccountId,
        customer_id: customerId,
        deal_id: dealId,
        payment_id: payment.id,
        total_amount: form.total_amount,
        notes: form.notes || null,
      }),
    })

    if (res.ok) {
      setShowForm(false)
      setForm({ ...EMPTY_FORM, paid_at: todayStr() })
      setSaveError(null)
      setSuccessMsg(`${form.total_amount.toLocaleString("ko-KR")}원 영수증이 발행되었습니다.`)
      setTimeout(() => setSuccessMsg(null), 4000)
      void load()
    } else {
      const err = await res.json().catch(() => null)
      setSaveError(err?.error ?? "영수증 발행에 실패했습니다.")
    }
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#1a1a1a]">영수증</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { void load() }} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" />영수증 발행
          </Button>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <span>✓</span> {successMsg}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
      ) : loadError ? (
        <div className="py-12 text-center border border-[#e8e8e4] rounded-xl bg-white">
          <p className="text-sm text-[#1a1a1a]/50">영수증 목록을 불러오지 못했습니다.</p>
          <button onClick={() => { setLoadError(false); void load() }} className="mt-2 text-xs text-[#084734] hover:underline">
            다시 시도
          </button>
        </div>
      ) : receipts.length === 0 ? (
        <div className="py-12 text-center text-sm text-[#1a1a1a]/40 border border-dashed border-[#e0e0dc] rounded-xl bg-white">
          발행된 영수증이 없습니다. 위 버튼으로 첫 영수증을 발행하세요.
        </div>
      ) : (
        <div className="border border-[#e8e8e4] rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#f7f7f5] border-b border-[#e8e8e4]">
              <tr>
                {["번호", "총액", "결제일", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-[#1a1a1a]/60 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="border-b border-[#f0f0ec] hover:bg-[#fafafa] transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-[#1a1a1a]/60">{r.receipt_number}</td>
                  <td className="px-4 py-3 font-medium">{r.total_amount.toLocaleString()}원</td>
                  <td className="px-4 py-3 text-xs text-[#1a1a1a]/50">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString("ko") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.pdf_url && (
                      <a href={r.pdf_url} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                          <Download className="w-3.5 h-3.5 mr-1" />PDF
                        </Button>
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e4]">
              <h2 className="text-base font-semibold">영수증 발행</h2>
              <button onClick={() => setShowForm(false)} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">결제방법</label>
                  <select value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentMethod })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]">
                    <option value="bank_transfer">계좌이체</option>
                    <option value="card">카드</option>
                    <option value="cash">현금</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">결제일</label>
                  <input type="date" value={form.paid_at}
                    onChange={(e) => setForm({ ...form, paid_at: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">
                    공급가액 <span className="text-[#B85C33]">*</span>
                    <span className="ml-1 font-normal text-[#1a1a1a]/35">(VAT 제외 금액)</span>
                  </label>
                  <input type="number" required min={1} value={form.amount || ""}
                    onChange={(e) => handleAmountChange(+e.target.value)}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">
                    청구 합계
                    {form.amount > 0 && (
                      <span className="ml-1 font-normal text-[#1a1a1a]/35">
                        ({form.amount.toLocaleString()} + VAT {form.tax_amount.toLocaleString()})
                      </span>
                    )}
                  </label>
                  <input readOnly value={form.total_amount > 0 ? form.total_amount.toLocaleString("ko-KR") + "원" : "—"}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm bg-[#f7f7f5] text-[#1a1a1a]/60 font-medium" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">메모</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2} className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a] resize-none" />
                </div>
              </div>
              {saveError && (
                <div className="rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-sm text-[#B85C33]">
                  {saveError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setSaveError(null) }}>취소</Button>
                <Button type="submit" disabled={saving || form.amount <= 0}>
                  {saving ? "처리 중..." : "영수증 발행"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
