"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, RefreshCw, Trash2, X, FileSignature, ChevronRight, Calculator } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Quote, QuoteStatus, Partner } from "@/lib/supabase/database.types"

const DUMMY_MODE = true

const DUMMY_PARTNERS_MAP: Record<string, string> = {
  p1: "삼성초등학교", p2: "판교중학교", p3: "해운대여자고등학교", p4: "서초과학기술원", p5: "강동초등학교",
}
const DUMMY_QUOTES_LIST: Quote[] = [
  { id: "q1", quote_number: "Q-2026-001", partner_id: "p1", title: "ClassIn Board 86인치 5대 납품", status: "converted",    valid_until: "2026-04-30", subtotal: 22727272, discount_amount: 0, tax_amount: 2272728, total_amount: 25000000, notes: "설치비 포함",     created_by: null, sent_at: "2026-03-01T00:00:00Z", accepted_at: "2026-03-05T00:00:00Z", converted_to_contract_id: "c1", created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-05T00:00:00Z" },
  { id: "q2", quote_number: "Q-2026-002", partner_id: "p2", title: "ClassIn Board CB-86 10대 공급", status: "sent",         valid_until: "2026-04-20", subtotal: 45454545, discount_amount: 0, tax_amount: 4545455, total_amount: 50000000, notes: null,               created_by: null, sent_at: "2026-03-20T00:00:00Z", accepted_at: null,                 converted_to_contract_id: null, created_at: "2026-03-18T00:00:00Z", updated_at: "2026-03-20T00:00:00Z" },
  { id: "q3", quote_number: "Q-2026-003", partner_id: "p3", title: "CB-75 3대 납품 및 설치",        status: "converted",    valid_until: null,          subtotal: 10909090, discount_amount: 0, tax_amount: 1090910, total_amount: 12000000, notes: null,               created_by: null, sent_at: "2026-02-15T00:00:00Z", accepted_at: "2026-02-18T00:00:00Z", converted_to_contract_id: "c3", created_at: "2026-02-12T00:00:00Z", updated_at: "2026-02-18T00:00:00Z" },
  { id: "q4", quote_number: "Q-2026-004", partner_id: "p5", title: "ClassIn Board 초기 견적 (미확정)", status: "draft",     valid_until: "2026-05-15", subtotal: 0,         discount_amount: 0, tax_amount: 0,       total_amount: 0,         notes: "수량 미확정", created_by: null, sent_at: null,                 accepted_at: null,                 converted_to_contract_id: null, created_at: "2026-04-02T00:00:00Z", updated_at: "2026-04-02T00:00:00Z" },
]

const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "초안", sent: "발송됨", accepted: "수락", rejected: "거절", expired: "만료", converted: "계약전환",
}
const STATUS_COLOR: Record<QuoteStatus, string> = {
  draft: "bg-[#f0f0ec] text-[#1a1a1a]/50",
  sent: "bg-blue-50 text-blue-600",
  accepted: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-500",
  expired: "bg-[#f0f0ec] text-[#1a1a1a]/40",
  converted: "bg-purple-50 text-purple-600",
}

type QuoteItem = { product_name: string; description: string; quantity: number; unit_price: number; discount_rate: number; amount: number }
const EMPTY_ITEM = (): QuoteItem => ({ product_name: "", description: "", quantity: 1, unit_price: 0, discount_rate: 0, amount: 0 })

function adminFetch(url: string, options?: RequestInit) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options?.headers },
  })
}

function calcItem(item: QuoteItem): number {
  return Math.round(item.quantity * item.unit_price * (1 - item.discount_rate / 100))
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [converting, setConverting] = useState<string | null>(null)
  const [form, setForm] = useState({ partner_id: "", title: "", valid_until: "", notes: "" })
  const [items, setItems] = useState<QuoteItem[]>([EMPTY_ITEM()])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (DUMMY_MODE) {
      setQuotes(DUMMY_QUOTES_LIST)
      setLoading(false)
      return
    }
    setLoading(true)
    const [qRes, pRes] = await Promise.all([
      adminFetch("/api/admin/quotes"),
      adminFetch("/api/admin/partners"),
    ])
    if (qRes.ok) setQuotes((await qRes.json()).quotes ?? [])
    if (pRes.ok) setPartners((await pRes.json()).partners ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function updateItem(idx: number, field: keyof QuoteItem, value: string | number) {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      next[idx].amount = calcItem(next[idx])
      return next
    })
  }

  const subtotal = items.reduce((s, i) => s + i.amount, 0)
  const taxAmount = Math.round(subtotal * 0.1)
  const totalAmount = subtotal + taxAmount

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await adminFetch("/api/admin/quotes", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        discount_amount: 0,
        status: "draft",
        items: items.map((item, idx) => ({ ...item, sort_order: idx })),
      }),
    })
    if (res.ok) {
      setShowForm(false)
      setForm({ partner_id: "", title: "", valid_until: "", notes: "" })
      setItems([EMPTY_ITEM()])
      load()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("견적서를 삭제하시겠습니까?")) return
    await adminFetch(`/api/admin/quotes/${id}`, { method: "DELETE" })
    load()
  }

  async function handleConvert(id: string) {
    if (!confirm("이 견적서를 계약서로 전환하시겠습니까?")) return
    setConverting(id)
    const res = await adminFetch(`/api/admin/quotes/${id}/convert`, { method: "POST", body: JSON.stringify({}) })
    if (res.ok) {
      alert("계약서가 생성되었습니다.")
      load()
    } else {
      const err = await res.json()
      alert(err.error ?? "전환 실패")
    }
    setConverting(null)
  }

  const partnerName = (id: string) => DUMMY_MODE ? (DUMMY_PARTNERS_MAP[id] ?? id) : (partners.find((p) => p.id === id)?.name ?? id)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a1a]">견적서</h1>
          <p className="text-sm text-[#1a1a1a]/50 mt-0.5">{quotes.length}건</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" />견적서 작성
          </Button>
        </div>
      </div>

      <div className="border border-[#e8e8e4] rounded-xl overflow-hidden bg-white">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
        ) : quotes.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">작성된 견적서가 없습니다</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f7f7f5] border-b border-[#e8e8e4]">
              <tr>
                {["번호", "파트너사", "제목", "총액", "유효기간", "상태", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-[#1a1a1a]/60 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} className="border-b border-[#f0f0ec] hover:bg-[#fafafa] transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-[#1a1a1a]/60">{q.quote_number}</td>
                  <td className="px-4 py-3 text-[#1a1a1a]/70">{partnerName(q.partner_id)}</td>
                  <td className="px-4 py-3 font-medium text-[#1a1a1a]">{q.title}</td>
                  <td className="px-4 py-3 font-medium">{q.total_amount.toLocaleString()}원</td>
                  <td className="px-4 py-3 text-[#1a1a1a]/50 text-xs">{q.valid_until ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[q.status]}`}>
                      {STATUS_LABEL[q.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {!["converted", "rejected", "expired"].includes(q.status) && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-purple-600 hover:text-purple-700"
                          onClick={() => handleConvert(q.id)}
                          disabled={converting === q.id}>
                          <FileSignature className="w-3.5 h-3.5 mr-1" />
                          {converting === q.id ? "처리중..." : "계약전환"}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-500" onClick={() => handleDelete(q.id)}>
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

      {/* 견적서 작성 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e4]">
              <h2 className="text-base font-semibold">견적서 작성</h2>
              <button onClick={() => setShowForm(false)} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-5">
              {/* 기본 정보 */}
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
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">유효기간</label>
                  <input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">제목 *</label>
                  <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="예: ClassIn Board 10대 설치 견적"
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
              </div>

              {/* 품목 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60">품목</label>
                  <button type="button" onClick={() => setItems([...items, EMPTY_ITEM()])}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                    <Plus className="w-3 h-3" />품목 추가
                  </button>
                </div>
                <div className="border border-[#e8e8e4] rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f7f7f5]">
                      <tr>
                        {["품목명", "설명", "수량", "단가", "할인%", "금액", ""].map((h) => (
                          <th key={h} className="px-2 py-2 text-left font-medium text-[#1a1a1a]/50">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} className="border-t border-[#f0f0ec]">
                          <td className="px-2 py-1.5">
                            <input value={item.product_name} onChange={(e) => updateItem(idx, "product_name", e.target.value)}
                              placeholder="ClassIn Board" className="w-24 border border-[#e8e8e4] rounded px-2 py-1 focus:outline-none" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)}
                              placeholder="86인치" className="w-24 border border-[#e8e8e4] rounded px-2 py-1 focus:outline-none" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", +e.target.value)}
                              className="w-14 border border-[#e8e8e4] rounded px-2 py-1 focus:outline-none text-right" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min={0} value={item.unit_price} onChange={(e) => updateItem(idx, "unit_price", +e.target.value)}
                              className="w-24 border border-[#e8e8e4] rounded px-2 py-1 focus:outline-none text-right" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min={0} max={100} value={item.discount_rate} onChange={(e) => updateItem(idx, "discount_rate", +e.target.value)}
                              className="w-14 border border-[#e8e8e4] rounded px-2 py-1 focus:outline-none text-right" />
                          </td>
                          <td className="px-2 py-1.5 text-right font-medium">{item.amount.toLocaleString()}</td>
                          <td className="px-2 py-1.5">
                            {items.length > 1 && (
                              <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))}
                                className="text-[#1a1a1a]/30 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* 합계 */}
                <div className="mt-3 flex justify-end">
                  <div className="text-xs space-y-1 text-right">
                    <div className="text-[#1a1a1a]/50">공급가액 <span className="font-medium text-[#1a1a1a]">{subtotal.toLocaleString()}원</span></div>
                    <div className="text-[#1a1a1a]/50">부가세(10%) <span className="font-medium text-[#1a1a1a]">{taxAmount.toLocaleString()}원</span></div>
                    <div className="text-sm font-bold text-[#1a1a1a]">합계 {totalAmount.toLocaleString()}원</div>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">메모</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2} className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a] resize-none" />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>취소</Button>
                <Button type="submit" disabled={saving}>{saving ? "저장 중..." : "견적서 저장"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
