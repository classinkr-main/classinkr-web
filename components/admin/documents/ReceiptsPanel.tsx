"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, RefreshCw, Trash2, X, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Receipt, Partner, PaymentMethod } from "@/lib/supabase/database.types"

const METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "Bank Transfer",
  card: "Card",
  cash: "Cash",
}

function adminFetch(url: string, options?: RequestInit) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options?.headers },
  })
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
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [rRes, pRes] = await Promise.all([adminFetch("/api/admin/receipts"), adminFetch("/api/admin/partners")])
    if (rRes.ok) setReceipts((await rRes.json()).receipts ?? [])
    if (pRes.ok) setPartners((await pRes.json()).partners ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    let alive = true

    const initialize = async () => {
      setLoading(true)
      const [rRes, pRes] = await Promise.all([adminFetch("/api/admin/receipts"), adminFetch("/api/admin/partners")])

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
    if (!confirm("Delete this receipt?")) return
    await adminFetch(`/api/admin/receipts/${id}`, { method: "DELETE" })
    load()
  }

  const partnerName = (id: string) => partners.find((p) => p.id === id)?.name ?? id

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a1a]">Receipts</h1>
          <p className="text-sm text-[#1a1a1a]/50 mt-0.5">{receipts.length} items</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Issue Receipt
          </Button>
        </div>
      </div>

      <div className="border border-[#e8e8e4] rounded-xl overflow-hidden bg-white">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">Loading...</div>
        ) : receipts.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">No receipts yet.</div>
        ) : (
          <>
            <div className="divide-y divide-[#f0f0ec] md:hidden">
              {receipts.map((r) => (
                <div key={`mobile-${r.id}`} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-[#1a1a1a]/45">{r.receipt_number}</p>
                      <p className="mt-1 truncate text-sm font-semibold text-[#111110]">{partnerName(r.partner_id)}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-[#111110]">{r.total_amount.toLocaleString()} KRW</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#1a1a1a]/55">
                    <div>
                      <p className="text-[#1a1a1a]/32">Method</p>
                      <p className="mt-0.5 font-medium text-[#111110]">{METHOD_LABEL[r.payment_method]}</p>
                    </div>
                    <div>
                      <p className="text-[#1a1a1a]/32">Paid On</p>
                      <p className="mt-0.5 font-medium text-[#111110]">{r.paid_at ? new Date(r.paid_at).toLocaleDateString("ko") : "-"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[#1a1a1a]/32">Cash Receipt</p>
                      {r.cash_receipt_requested ? (
                        <p className="mt-0.5 font-medium text-[#084734]">Issued ({r.cash_receipt_type === "business" ? "Business" : "Personal"})</p>
                      ) : (
                        <p className="mt-0.5 text-[#1a1a1a]/35">Not issued</p>
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
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-[#f7f7f5] border-b border-[#e8e8e4]">
                  <tr>
                    {["No.", "Partner", "Total", "Method", "Cash Receipt", "Paid On", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-medium text-[#1a1a1a]/60 text-xs">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id} className="border-b border-[#f0f0ec] hover:bg-[#fafafa] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-[#1a1a1a]/60">{r.receipt_number}</td>
                      <td className="px-4 py-3 text-[#1a1a1a]/70">{partnerName(r.partner_id)}</td>
                      <td className="px-4 py-3 font-medium">{r.total_amount.toLocaleString()} KRW</td>
                      <td className="px-4 py-3 text-xs text-[#1a1a1a]/70">{METHOD_LABEL[r.payment_method]}</td>
                      <td className="px-4 py-3 text-xs">
                        {r.cash_receipt_requested ? (
                          <span className="text-[#084734]">Issued ({r.cash_receipt_type === "business" ? "Business" : "Personal"})</span>
                        ) : (
                          <span className="text-[#1a1a1a]/30">Not issued</span>
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
              <h2 className="text-base font-semibold">Issue Receipt</h2>
              <button onClick={() => setShowForm(false)} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="max-h-[calc(100dvh-5.5rem)] space-y-4 overflow-y-auto p-4 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">Partner *</label>
                  <select
                    required
                    value={form.partner_id}
                    onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]"
                  >
                    <option value="">Select</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">Method</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentMethod })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="card">Card</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">Supply Amount *</label>
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
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">Total (VAT incl.)</label>
                  <input
                    readOnly
                    value={`${form.total_amount.toLocaleString()} KRW`}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm bg-[#f7f7f5] text-[#1a1a1a]/60"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">Paid On</label>
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
                    Cash receipt
                  </label>
                </div>
                {form.cash_receipt_requested && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">Type</label>
                      <select
                        value={form.cash_receipt_type}
                        onChange={(e) => setForm({ ...form, cash_receipt_type: e.target.value })}
                        className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]"
                      >
                        <option value="personal">Personal</option>
                        <option value="business">Business</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">Receipt Number</label>
                      <input
                        value={form.cash_receipt_number}
                        onChange={(e) => setForm({ ...form, cash_receipt_number: e.target.value })}
                        placeholder="Business or mobile number"
                        className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]"
                      />
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">Notes</label>
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
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Issue"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

