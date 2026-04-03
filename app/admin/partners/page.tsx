"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  Plus, Mail, Phone, RefreshCw, Trash2, X, UserPlus,
  Building2, PenLine, Copy, Check, Send, FileSignature,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type {
  Partner, PartnerStatus,
  Quote, QuoteStatus,
  Contract, ContractStatus,
  Receipt, PaymentMethod,
} from "@/lib/supabase/database.types"

// ── 상수 ──────────────────────────────────────────────────

const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  active: "활성", inactive: "비활성", pending: "검토중",
}
const PARTNER_STATUS_COLOR: Record<PartnerStatus, string> = {
  active: "bg-green-50 text-green-700",
  inactive: "bg-[#f0f0ec] text-[#1a1a1a]/40",
  pending: "bg-yellow-50 text-yellow-700",
}
const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "초안", sent: "발송됨", accepted: "수락", rejected: "거절", expired: "만료", converted: "계약전환",
}
const QUOTE_STATUS_COLOR: Record<QuoteStatus, string> = {
  draft: "bg-[#f0f0ec] text-[#1a1a1a]/50",
  sent: "bg-blue-50 text-blue-600",
  accepted: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-500",
  expired: "bg-[#f0f0ec] text-[#1a1a1a]/40",
  converted: "bg-purple-50 text-purple-600",
}
const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "초안", sent: "발송됨", partner_signed: "파트너서명",
  admin_signed: "어드민서명", completed: "완료", cancelled: "취소",
}
const CONTRACT_STATUS_COLOR: Record<ContractStatus, string> = {
  draft: "bg-[#f0f0ec] text-[#1a1a1a]/50",
  sent: "bg-blue-50 text-blue-600",
  partner_signed: "bg-yellow-50 text-yellow-700",
  admin_signed: "bg-green-50 text-green-700",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-50 text-red-400",
}
const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "계좌이체", card: "카드", cash: "현금",
}

type PanelTab = "info" | "quotes" | "contracts" | "receipts"

// ── API helper ──────────────────────────────────────────────

function adminFetch(url: string, options?: RequestInit) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options?.headers },
  })
}

// ── Quote form helpers ──────────────────────────────────────

type QuoteItemDraft = { product_name: string; description: string; quantity: number; unit_price: number; discount_rate: number; amount: number }
const emptyItem = (): QuoteItemDraft => ({ product_name: "", description: "", quantity: 1, unit_price: 0, discount_rate: 0, amount: 0 })
function calcItem(item: QuoteItemDraft) {
  return Math.round(item.quantity * item.unit_price * (1 - item.discount_rate / 100))
}

// ── Signature Canvas ─────────────────────────────────────────

function SignatureCanvas({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }
  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault(); drawing.current = true
    const canvas = canvasRef.current!; const ctx = canvas.getContext("2d")!
    const { x, y } = getPos(e, canvas); ctx.beginPath(); ctx.moveTo(x, y)
  }
  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return; e.preventDefault()
    const canvas = canvasRef.current!; const ctx = canvas.getContext("2d")!
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#1a1a1a"
    const { x, y } = getPos(e, canvas); ctx.lineTo(x, y); ctx.stroke()
  }
  function stop() { drawing.current = false }
  function clear() { canvasRef.current!.getContext("2d")!.clearRect(0, 0, 480, 160) }

  return (
    <div className="space-y-2">
      <div className="border-2 border-dashed border-[#e8e8e4] rounded-xl overflow-hidden bg-white">
        <canvas ref={canvasRef} width={480} height={160} className="w-full cursor-crosshair touch-none"
          onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop}
          onTouchStart={start} onTouchMove={draw} onTouchEnd={stop} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear}>다시 그리기</Button>
        <Button type="button" size="sm" onClick={() => onSave(canvasRef.current!.toDataURL("image/png"))}>서명 적용</Button>
      </div>
    </div>
  )
}

// ── 견적서 탭 ─────────────────────────────────────────────────

function QuotesTab({ partner }: { partner: Partner }) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [items, setItems] = useState<QuoteItemDraft[]>([emptyItem()])
  const [form, setForm] = useState({ title: "", valid_until: "", notes: "" })
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await adminFetch(`/api/admin/quotes?partner_id=${partner.id}`)
    if (res.ok) setQuotes((await res.json()).quotes ?? [])
    setLoading(false)
  }, [partner.id])

  useEffect(() => { load() }, [load])

  function updateItem(idx: number, field: keyof QuoteItemDraft, value: string | number) {
    setItems((prev: QuoteItemDraft[]) => {
      const next = [...prev]; next[idx] = { ...next[idx], [field]: value }
      next[idx].amount = calcItem(next[idx]); return next
    })
  }

  const subtotal = items.reduce((s: number, i: QuoteItemDraft) => s + i.amount, 0)
  const taxAmount = Math.round(subtotal * 0.1)
  const totalAmount = subtotal + taxAmount

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const res = await adminFetch("/api/admin/quotes", {
      method: "POST",
      body: JSON.stringify({
        ...form, partner_id: partner.id, status: "draft",
        subtotal, tax_amount: taxAmount, total_amount: totalAmount, discount_amount: 0,
        items: items.map((item, idx) => ({ ...item, sort_order: idx })),
      }),
    })
    if (res.ok) { setShowForm(false); setForm({ title: "", valid_until: "", notes: "" }); setItems([emptyItem()]); load() }
    setSaving(false)
  }

  async function handleConvert(id: string) {
    if (!confirm("이 견적서를 계약서로 전환하시겠습니까?")) return
    setConverting(id)
    const res = await adminFetch(`/api/admin/quotes/${id}/convert`, { method: "POST", body: JSON.stringify({}) })
    if (res.ok) { alert("계약서가 생성되었습니다."); load() }
    else { const err = await res.json(); alert(err.error ?? "전환 실패") }
    setConverting(null)
  }

  async function handleDelete(id: string) {
    if (!confirm("견적서를 삭제하시겠습니까?")) return
    await adminFetch(`/api/admin/quotes/${id}`, { method: "DELETE" }); load()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#1a1a1a]/50">{quotes.length}건</span>
        <Button size="sm" className="h-7 text-xs px-3" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />새 견적서
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
      ) : quotes.length === 0 ? (
        <div className="py-8 text-center text-sm text-[#1a1a1a]/40">견적서 없음</div>
      ) : (
        <div className="space-y-2">
          {quotes.map(q => (
            <div key={q.id} className="border border-[#e8e8e4] rounded-xl p-3 bg-white hover:bg-[#fafafa] transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-[#1a1a1a]/40">{q.quote_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${QUOTE_STATUS_COLOR[q.status]}`}>
                      {QUOTE_STATUS_LABEL[q.status]}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-[#1a1a1a] mt-0.5 truncate">{q.title}</p>
                  <p className="text-sm font-semibold text-[#1a1a1a] mt-0.5">{q.total_amount.toLocaleString()}원</p>
                  {q.valid_until && <p className="text-xs text-[#1a1a1a]/40 mt-0.5">유효 {q.valid_until}</p>}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!["converted","rejected","expired"].includes(q.status) && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-purple-600"
                      onClick={() => handleConvert(q.id)} disabled={converting === q.id}>
                      <FileSignature className="w-3 h-3 mr-1" />{converting === q.id ? "처리중" : "계약전환"}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-red-400"
                    onClick={() => handleDelete(q.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 견적서 작성 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e4]">
              <div>
                <h2 className="text-base font-semibold">견적서 작성</h2>
                <p className="text-xs text-[#1a1a1a]/50 mt-0.5">{partner.name}</p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">제목 *</label>
                  <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="예: ClassIn Board 10대 설치 견적"
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">유효기간</label>
                  <input type="date" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
              </div>

              {/* 품목 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60">품목</label>
                  <button type="button" onClick={() => setItems([...items, emptyItem()])}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                    <Plus className="w-3 h-3" />품목 추가
                  </button>
                </div>
                <div className="border border-[#e8e8e4] rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f7f7f5]">
                      <tr>{["품목명", "설명", "수량", "단가", "할인%", "금액", ""].map(h => (
                        <th key={h} className="px-2 py-2 text-left font-medium text-[#1a1a1a]/50">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} className="border-t border-[#f0f0ec]">
                          <td className="px-2 py-1.5"><input value={item.product_name} onChange={e => updateItem(idx, "product_name", e.target.value)}
                            placeholder="ClassIn Board" className="w-24 border border-[#e8e8e4] rounded px-2 py-1 focus:outline-none" /></td>
                          <td className="px-2 py-1.5"><input value={item.description} onChange={e => updateItem(idx, "description", e.target.value)}
                            placeholder="86인치" className="w-20 border border-[#e8e8e4] rounded px-2 py-1 focus:outline-none" /></td>
                          <td className="px-2 py-1.5"><input type="number" min={1} value={item.quantity} onChange={e => updateItem(idx, "quantity", +e.target.value)}
                            className="w-12 border border-[#e8e8e4] rounded px-2 py-1 focus:outline-none text-right" /></td>
                          <td className="px-2 py-1.5"><input type="number" min={0} value={item.unit_price} onChange={e => updateItem(idx, "unit_price", +e.target.value)}
                            className="w-24 border border-[#e8e8e4] rounded px-2 py-1 focus:outline-none text-right" /></td>
                          <td className="px-2 py-1.5"><input type="number" min={0} max={100} value={item.discount_rate} onChange={e => updateItem(idx, "discount_rate", +e.target.value)}
                            className="w-12 border border-[#e8e8e4] rounded px-2 py-1 focus:outline-none text-right" /></td>
                          <td className="px-2 py-1.5 text-right font-medium">{item.amount.toLocaleString()}</td>
                          <td className="px-2 py-1.5">{items.length > 1 && (
                            <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))}
                              className="text-[#1a1a1a]/30 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                          )}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
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

// ── 계약서 탭 ─────────────────────────────────────────────────

function ContractsTab({ partner }: { partner: Partner }) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [showSign, setShowSign] = useState(false)
  const [selected, setSelected] = useState<Contract | null>(null)
  const [signing, setSigning] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await adminFetch(`/api/admin/contracts?partner_id=${partner.id}`)
    if (res.ok) setContracts((await res.json()).contracts ?? [])
    setLoading(false)
  }, [partner.id])

  useEffect(() => { load() }, [load])

  function copySignLink(contract: Contract) {
    const url = `${window.location.origin}/partner/sign/${contract.sign_token}`
    navigator.clipboard.writeText(url)
    setCopied(contract.id); setTimeout(() => setCopied(null), 2000)
  }

  async function handleSend(contract: Contract) {
    const res = await adminFetch(`/api/admin/contracts/${contract.id}`, { method: "PUT", body: JSON.stringify({ status: "sent" }) })
    if (res.ok) load()
  }

  async function handleAdminSign(dataUrl: string) {
    if (!selected) return
    setSigning(true)
    const res = await adminFetch(`/api/admin/contracts/${selected.id}/sign`, {
      method: "POST", body: JSON.stringify({ signature_data: dataUrl, admin_user_id: "" }),
    })
    if (res.ok) { setShowSign(false); setSelected(null); load() }
    else { const err = await res.json(); alert(err.error ?? "서명 실패") }
    setSigning(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("계약서를 삭제하시겠습니까?")) return
    await adminFetch(`/api/admin/contracts/${id}`, { method: "DELETE" }); load()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#1a1a1a]/50">{contracts.length}건</span>
        <span className="text-xs text-[#1a1a1a]/40">견적서 탭에서 계약 전환</span>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
      ) : contracts.length === 0 ? (
        <div className="py-8 text-center text-sm text-[#1a1a1a]/40">계약서 없음 — 견적서 탭에서 전환하세요</div>
      ) : (
        <div className="space-y-2">
          {contracts.map(c => (
            <div key={c.id} className="border border-[#e8e8e4] rounded-xl p-3 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-[#1a1a1a]/40">{c.contract_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONTRACT_STATUS_COLOR[c.status]}`}>
                      {CONTRACT_STATUS_LABEL[c.status]}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-[#1a1a1a] mt-0.5 truncate">{c.title}</p>
                  <p className="text-sm font-semibold text-[#1a1a1a] mt-0.5">{c.total_amount.toLocaleString()}원</p>
                  <div className="flex gap-3 mt-1.5">
                    <span className={`text-xs ${c.partner_signed_at ? "text-green-600" : "text-[#1a1a1a]/30"}`}>
                      파트너 {c.partner_signed_at ? `✓ ${new Date(c.partner_signed_at).toLocaleDateString("ko")}` : "미서명"}
                    </span>
                    <span className={`text-xs ${c.admin_signed_at ? "text-green-600" : "text-[#1a1a1a]/30"}`}>
                      어드민 {c.admin_signed_at ? `✓ ${new Date(c.admin_signed_at).toLocaleDateString("ko")}` : "미서명"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {c.status === "draft" && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-blue-600" onClick={() => handleSend(c)}>
                      <Send className="w-3 h-3 mr-1" />발송
                    </Button>
                  )}
                  {["sent","draft"].includes(c.status) && c.sign_token && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copySignLink(c)}>
                      {copied === c.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  )}
                  {c.status === "partner_signed" && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-purple-600"
                      onClick={() => { setSelected(c); setShowSign(true) }}>
                      <PenLine className="w-3 h-3 mr-1" />서명
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-red-400" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 어드민 서명 모달 */}
      {showSign && selected && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e4]">
              <div>
                <h2 className="text-base font-semibold">어드민 서명</h2>
                <p className="text-xs text-[#1a1a1a]/50 mt-0.5">{selected.contract_number} — {selected.title}</p>
              </div>
              <button onClick={() => { setShowSign(false); setSelected(null) }} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {signing ? (
                <div className="py-8 text-center text-sm text-[#1a1a1a]/50">서명 처리 중...</div>
              ) : (
                <SignatureCanvas onSave={handleAdminSign} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 영수증 탭 ─────────────────────────────────────────────────

function ReceiptsTab({ partner }: { partner: Partner }) {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [form, setForm] = useState({
    contract_id: "", amount: 0,
    payment_method: "bank_transfer" as PaymentMethod, paid_at: "", notes: "",
  })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [rRes, cRes] = await Promise.all([
      adminFetch(`/api/admin/receipts?partner_id=${partner.id}`),
      adminFetch(`/api/admin/contracts?partner_id=${partner.id}`),
    ])
    if (rRes.ok) setReceipts((await rRes.json()).receipts ?? [])
    if (cRes.ok) setContracts((await cRes.json()).contracts ?? [])
    setLoading(false)
  }, [partner.id])

  useEffect(() => { load() }, [load])

  const taxAmt = Math.round(form.amount * 0.1)
  const totalAmt = form.amount + taxAmt

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const res = await adminFetch("/api/admin/receipts", {
      method: "POST",
      body: JSON.stringify({
        ...form, partner_id: partner.id,
        tax_amount: taxAmt, total_amount: totalAmt,
      }),
    })
    if (res.ok) {
      setShowForm(false)
      setForm({ contract_id: "", amount: 0, payment_method: "bank_transfer", paid_at: "", notes: "" })
      load()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("영수증을 삭제하시겠습니까?")) return
    await adminFetch(`/api/admin/receipts/${id}`, { method: "DELETE" }); load()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#1a1a1a]/50">{receipts.length}건</span>
        <Button size="sm" className="h-7 text-xs px-3" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />영수증 발행
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
      ) : receipts.length === 0 ? (
        <div className="py-8 text-center text-sm text-[#1a1a1a]/40">발행된 영수증 없음</div>
      ) : (
        <div className="space-y-2">
          {receipts.map(r => (
            <div key={r.id} className="border border-[#e8e8e4] rounded-xl p-3 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[#1a1a1a]/40">{r.receipt_number}</span>
                    <span className="text-xs bg-[#f0f0ec] text-[#1a1a1a]/60 px-2 py-0.5 rounded-full">
                      {PAYMENT_LABEL[r.payment_method as PaymentMethod] ?? r.payment_method}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[#1a1a1a] mt-0.5">{r.total_amount.toLocaleString()}원</p>
                  {r.paid_at && <p className="text-xs text-[#1a1a1a]/40 mt-0.5">{new Date(r.paid_at).toLocaleDateString("ko")}</p>}
                </div>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-red-400 shrink-0" onClick={() => handleDelete(r.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 영수증 발행 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e4]">
              <div>
                <h2 className="text-base font-semibold">영수증 발행</h2>
                <p className="text-xs text-[#1a1a1a]/50 mt-0.5">{partner.name}</p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {contracts.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">연결 계약서</label>
                  <select value={form.contract_id} onChange={e => setForm({ ...form, contract_id: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]">
                    <option value="">선택 안 함</option>
                    {contracts.map(c => <option key={c.id} value={c.id}>{c.contract_number} — {c.title}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">공급가액 *</label>
                  <input required type="number" min={0} value={form.amount || ""}
                    onChange={e => setForm({ ...form, amount: +e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a] text-right" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">결제수단</label>
                  <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value as PaymentMethod })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]">
                    <option value="bank_transfer">계좌이체</option>
                    <option value="card">카드</option>
                    <option value="cash">현금</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">수납일</label>
                  <input type="date" value={form.paid_at} onChange={e => setForm({ ...form, paid_at: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
              </div>
              <div className="bg-[#f7f7f5] rounded-xl p-3 text-xs space-y-1 text-right">
                <div className="text-[#1a1a1a]/50">공급가액 <span className="font-medium text-[#1a1a1a]">{form.amount.toLocaleString()}원</span></div>
                <div className="text-[#1a1a1a]/50">부가세(10%) <span className="font-medium text-[#1a1a1a]">{taxAmt.toLocaleString()}원</span></div>
                <div className="text-sm font-bold text-[#1a1a1a]">합계 {totalAmt.toLocaleString()}원</div>
              </div>
              <div>
                <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">메모</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2} className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a] resize-none" />
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

// ── 기본정보 탭 ──────────────────────────────────────────────

function InfoTab({ partner, onUpdated }: { partner: Partner; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: partner.name,
    contact_name: partner.contact_name ?? "",
    email: partner.email ?? "",
    phone: partner.phone ?? "",
    address: partner.address ?? "",
    business_number: partner.business_number ?? "",
    status: partner.status,
    notes: partner.notes ?? "",
  })
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const res = await adminFetch(`/api/admin/partners/${partner.id}`, { method: "PUT", body: JSON.stringify(form) })
    if (res.ok) { setEditing(false); onUpdated() }
    setSaving(false)
  }

  if (!editing) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="h-7 text-xs px-3" onClick={() => setEditing(true)}>편집</Button>
        </div>
        <dl className="space-y-3 text-sm">
          {([
            ["회사명", partner.name],
            ["담당자", partner.contact_name],
            ["이메일", partner.email],
            ["전화번호", partner.phone],
            ["사업자번호", partner.business_number],
            ["주소", partner.address],
            ["메모", partner.notes],
          ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, value]) => (
            <div key={label} className="flex gap-3">
              <dt className="text-xs text-[#1a1a1a]/40 w-20 shrink-0 pt-0.5">{label}</dt>
              <dd className="text-[#1a1a1a] break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      {([
        { label: "회사명", key: "name", required: true },
        { label: "담당자", key: "contact_name" },
        { label: "이메일", key: "email" },
        { label: "전화번호", key: "phone" },
        { label: "사업자번호", key: "business_number" },
        { label: "주소", key: "address" },
      ] as { label: string; key: keyof typeof form; required?: boolean }[]).map(({ label, key, required }) => (
        <div key={key}>
          <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">{label}{required && " *"}</label>
          <input required={required} value={form[key] as string} onChange={e => setForm({ ...form, [key]: e.target.value })}
            className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
        </div>
      ))}
      <div>
        <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">상태</label>
        <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as PartnerStatus })}
          className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]">
          <option value="active">활성</option>
          <option value="inactive">비활성</option>
          <option value="pending">검토중</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">메모</label>
        <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3}
          className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a] resize-none" />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>취소</Button>
        <Button type="submit" size="sm" disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
      </div>
    </form>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────

const EMPTY_FORM = { name: "", contact_name: "", email: "", phone: "", address: "", business_number: "", status: "active" as PartnerStatus, notes: "" }
const EMPTY_INVITE = { email: "", role: "member" as "admin" | "member", display_name: "" }

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [inviteTarget, setInviteTarget] = useState<Partner | null>(null)
  const [selected, setSelected] = useState<Partner | null>(null)
  const [tab, setTab] = useState<PanelTab>("info")
  const [form, setForm] = useState(EMPTY_FORM)
  const [invite, setInvite] = useState(EMPTY_INVITE)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await adminFetch("/api/admin/partners")
    if (res.ok) setPartners((await res.json()).partners ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openPanel(partner: Partner) {
    setSelected(partner); setTab("info")
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const res = await adminFetch("/api/admin/partners", { method: "POST", body: JSON.stringify(form) })
    if (res.ok) { setShowForm(false); setForm(EMPTY_FORM); load() }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("파트너사를 삭제하시겠습니까? 연결된 견적서/계약서도 함께 삭제됩니다.")) return
    await adminFetch(`/api/admin/partners/${id}`, { method: "DELETE" })
    if (selected?.id === id) setSelected(null)
    load()
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault(); if (!inviteTarget) return; setSaving(true)
    const res = await adminFetch(`/api/admin/partners/${inviteTarget.id}/invite`, { method: "POST", body: JSON.stringify(invite) })
    if (res.ok) { alert(`${invite.email}에 초대 이메일을 발송했습니다.`); setInviteTarget(null); setInvite(EMPTY_INVITE) }
    else { const err = await res.json(); alert(err.error ?? "초대 실패") }
    setSaving(false)
  }

  const TABS: { id: PanelTab; label: string }[] = [
    { id: "info", label: "기본정보" },
    { id: "quotes", label: "견적서" },
    { id: "contracts", label: "계약서" },
    { id: "receipts", label: "영수증" },
  ]

  return (
    <div className="flex min-h-screen">
      {/* 목록 영역 */}
      <div className={`flex flex-col transition-all duration-200 ${selected ? "w-[400px] shrink-0" : "flex-1"}`}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-[#1a1a1a]">파트너사 관리</h1>
              <p className="text-sm text-[#1a1a1a]/50 mt-0.5">{partners.length}개 파트너사</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="w-4 h-4 mr-1" />파트너사 추가
              </Button>
            </div>
          </div>

          <div className="border border-[#e8e8e4] rounded-xl overflow-hidden bg-white">
            {loading ? (
              <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
            ) : partners.length === 0 ? (
              <div className="py-16 text-center text-sm text-[#1a1a1a]/40">등록된 파트너사가 없습니다</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[#f7f7f5] border-b border-[#e8e8e4]">
                  <tr>
                    {["파트너사", "담당자", ...(selected ? [] : ["연락처"]), "상태", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium text-[#1a1a1a]/60 text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {partners.map(p => (
                    <tr key={p.id}
                      className={`border-b border-[#f0f0ec] cursor-pointer transition-colors ${selected?.id === p.id ? "bg-[#f7f7f5]" : "hover:bg-[#fafafa]"}`}
                      onClick={() => openPanel(p)}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#1a1a1a]">{p.name}</div>
                        {p.business_number && <div className="text-xs text-[#1a1a1a]/40">{p.business_number}</div>}
                      </td>
                      <td className="px-4 py-3 text-[#1a1a1a]/70 text-xs">{p.contact_name ?? "—"}</td>
                      {!selected && (
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            {p.email && <span className="flex items-center gap-1 text-xs text-[#1a1a1a]/60"><Mail className="w-3 h-3" />{p.email}</span>}
                            {p.phone && <span className="flex items-center gap-1 text-xs text-[#1a1a1a]/60"><Phone className="w-3 h-3" />{p.phone}</span>}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PARTNER_STATUS_COLOR[p.status]}`}>
                          {PARTNER_STATUS_LABEL[p.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                            onClick={() => { setInviteTarget(p); setInvite(EMPTY_INVITE) }}>
                            <UserPlus className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-500"
                            onClick={() => handleDelete(p.id)}>
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
        </div>
      </div>

      {/* 사이드 패널 */}
      {selected && (
        <div className="flex-1 border-l border-[#e8e8e4] bg-white flex flex-col sticky top-0 h-screen overflow-hidden">
          {/* 패널 헤더 */}
          <div className="px-6 pt-4 border-b border-[#e8e8e4] shrink-0">
            <div className="flex items-start justify-between gap-3 pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#f0f0ec] flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-[#1a1a1a]/50" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-[#1a1a1a] truncate">{selected.name}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PARTNER_STATUS_COLOR[selected.status]}`}>
                    {PARTNER_STATUS_LABEL[selected.status]}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-[#1a1a1a]/30 hover:text-[#1a1a1a] shrink-0 mt-0.5">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* 탭 */}
            <div className="flex gap-0">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
                    tab === t.id
                      ? "border-[#1a1a1a] text-[#1a1a1a]"
                      : "border-transparent text-[#1a1a1a]/40 hover:text-[#1a1a1a]/70"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 패널 콘텐츠 */}
          <div className="flex-1 overflow-y-auto p-6">
            {tab === "info" && <InfoTab key={selected.id} partner={selected} onUpdated={load} />}
            {tab === "quotes" && <QuotesTab key={selected.id + "-q"} partner={selected} />}
            {tab === "contracts" && <ContractsTab key={selected.id + "-c"} partner={selected} />}
            {tab === "receipts" && <ReceiptsTab key={selected.id + "-r"} partner={selected} />}
          </div>
        </div>
      )}

      {/* 파트너사 추가 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e4]">
              <h2 className="text-base font-semibold">파트너사 추가</h2>
              <button onClick={() => setShowForm(false)} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">회사명 *</label>
                  <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">담당자명</label>
                  <input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">사업자번호</label>
                  <input value={form.business_number} onChange={e => setForm({ ...form, business_number: e.target.value })}
                    placeholder="000-00-00000"
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">이메일</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">전화번호</label>
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">주소</label>
                  <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">메모</label>
                  <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                    rows={2} className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a] resize-none" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>취소</Button>
                <Button type="submit" disabled={saving}>{saving ? "저장 중..." : "추가"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 초대 모달 */}
      {inviteTarget && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e4]">
              <div>
                <h2 className="text-base font-semibold">사용자 초대</h2>
                <p className="text-xs text-[#1a1a1a]/50 mt-0.5">{inviteTarget.name}</p>
              </div>
              <button onClick={() => setInviteTarget(null)} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleInvite} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">이메일 *</label>
                <input required type="email" value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })}
                  className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">이름</label>
                <input value={invite.display_name} onChange={e => setInvite({ ...invite, display_name: e.target.value })}
                  className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">권한</label>
                <select value={invite.role} onChange={e => setInvite({ ...invite, role: e.target.value as "admin" | "member" })}
                  className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]">
                  <option value="member">멤버 (조회)</option>
                  <option value="admin">관리자 (서명 가능)</option>
                </select>
              </div>
              <p className="text-xs text-[#1a1a1a]/40">Supabase Auth 초대 이메일이 발송됩니다. 수락 후 파트너 포털에 접근할 수 있습니다.</p>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setInviteTarget(null)}>취소</Button>
                <Button type="submit" disabled={saving}>{saving ? "발송 중..." : "초대 발송"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
