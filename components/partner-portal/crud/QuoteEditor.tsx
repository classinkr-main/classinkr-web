"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  Calculator,
  FileSignature,
  Plus,
  RefreshCw,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { portalFetch } from "@/lib/partner-portal/portal-fetch"
import type { QuoteDocumentBundle, QuoteDocumentStatus } from "@/lib/partner-portal/types"

/* ─── 제품 & 템플릿 ────────────────────────────────────── */

type QuoteItem = {
  product_key: string
  product_name: string
  description: string
  quantity: number
  unit_price: number
  discount_rate: number
  amount: number
  editable_price: boolean
}

type ProductOption = { key: string; label: string; description: string; unit_price: number }

const PRODUCT_OPTIONS: ProductOption[] = [
  { key: "board-86", label: "ClassIn Board 86인치", description: "메인 대형 패널", unit_price: 5_000_000 },
  { key: "board-75", label: "ClassIn Board 75인치", description: "중형 패널", unit_price: 4_000_000 },
  { key: "camera", label: "카메라 세트", description: "수업/회의 촬영 세트", unit_price: 1_320_000 },
  { key: "speaker", label: "스피커 세트", description: "음향 보강 세트", unit_price: 935_000 },
  { key: "install", label: "설치 및 교육", description: "현장 설치 + 운영 교육", unit_price: 0 },
  { key: "support", label: "유지보수 1년", description: "무상 A/S 포함", unit_price: 0 },
  { key: "custom", label: "커스텀 항목", description: "직접 입력", unit_price: 0 },
]

const QUOTE_TEMPLATES = [
  { id: "board_bundle", label: "보드 패키지", description: "패널 중심의 표준 견적", itemKeys: ["board-86", "install", "support"] },
  { id: "compact_bundle", label: "보드 + 주변기기", description: "소형 설치용 구성", itemKeys: ["board-75", "camera", "install"] },
  { id: "custom", label: "커스텀", description: "빈 폼에서 직접 구성", itemKeys: ["custom"] },
]

const STATUS_LABEL: Record<QuoteDocumentStatus, string> = {
  draft: "초안", shared: "공유됨", accepted: "수락", expired: "만료", archived: "보관",
}
const STATUS_COLOR: Record<QuoteDocumentStatus, string> = {
  draft: "bg-[#f0f0ec] text-[#1a1a1a]/50",
  shared: "bg-blue-50 text-blue-600",
  accepted: "bg-emerald-50 text-emerald-700",
  expired: "bg-[#f0f0ec] text-[#1a1a1a]/40",
  archived: "bg-violet-50 text-violet-600",
}

function calcLineAmount(item: QuoteItem) {
  return Math.round(item.quantity * item.unit_price * (1 - item.discount_rate / 100))
}

function getPresetProduct(productKey: string) {
  return PRODUCT_OPTIONS.find((o) => o.key === productKey) ?? PRODUCT_OPTIONS[0]
}

function createItemFromKey(productKey: string): QuoteItem {
  const p = getPresetProduct(productKey)
  const item: QuoteItem = {
    product_key: p.key, product_name: p.label, description: p.description,
    quantity: 1, unit_price: p.unit_price, discount_rate: 0, amount: 0,
    editable_price: p.key === "custom",
  }
  return { ...item, amount: calcLineAmount(item) }
}

function createTemplateItems(templateId: string) {
  const t = QUOTE_TEMPLATES.find((t) => t.id === templateId) ?? QUOTE_TEMPLATES[0]
  return t.itemKeys.map((key) => createItemFromKey(key))
}

function formatMoney(value?: number | null) {
  if (value == null) return "-"
  return `${value.toLocaleString("ko-KR")}원`
}

/* ─── 컴포넌트 ──────────────────────────────────────────── */

interface Props {
  dealId?: string
}

export function QuoteEditor({ dealId }: Props) {
  const [quotes, setQuotes] = useState<QuoteDocumentBundle[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [converting, setConverting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [templateId, setTemplateId] = useState("board_bundle")
  const [vatSurcharge, setVatSurcharge] = useState(false)
  const [formTitle, setFormTitle] = useState("")
  const [formValidUntil, setFormValidUntil] = useState("")
  const [items, setItems] = useState<QuoteItem[]>(createTemplateItems("board_bundle"))

  const load = useCallback(async (showSpinner = true) => {
    if (!dealId) return
    if (showSpinner) setLoading(true)
    const res = await portalFetch(`/api/portal/deals/${dealId}`)
    if (res.ok) {
      const data = await res.json()
      setQuotes(data.quote_documents ?? [])
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
        setQuotes(data.quote_documents ?? [])
      }
      setLoading(false)
    }

    void initialLoad()
    return () => {
      active = false
    }
  }, [dealId])

  const subtotal = useMemo(() => items.reduce((s, i) => s + calcLineAmount(i), 0), [items])
  const vatAmount = vatSurcharge ? Math.round(subtotal * 0.1) : 0
  const totalAmount = subtotal + vatAmount

  function openForm() {
    setTemplateId("board_bundle")
    setVatSurcharge(false)
    setFormTitle("")
    setFormValidUntil("")
    setItems(createTemplateItems("board_bundle"))
    setShowForm(true)
  }

  function updateItem(idx: number, next: Partial<QuoteItem>) {
    setItems((prev) => {
      const arr = [...prev]
      const cur = arr[idx]
      if (!cur) return prev
      const merged = { ...cur, ...next }
      arr[idx] = { ...merged, amount: calcLineAmount(merged) }
      return arr
    })
  }

  function updateItemProduct(idx: number, productKey: string) {
    const p = getPresetProduct(productKey)
    setItems((prev) => {
      const arr = [...prev]
      const cur = arr[idx]
      if (!cur) return prev
      const merged = {
        ...cur,
        product_key: p.key, product_name: p.label, description: p.description,
        unit_price: p.unit_price, editable_price: p.key === "custom",
      }
      arr[idx] = { ...merged, amount: calcLineAmount(merged) }
      return arr
    })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!dealId) return
    setSaving(true)

    // 1. 견적 문서 생성
    const docRes = await portalFetch("/api/portal/quotes", {
      method: "POST",
      body: JSON.stringify({ deal_id: dealId }),
    })
    if (!docRes.ok) { setSaving(false); return }
    const { quote } = await docRes.json()

    // 2. 견적 버전 생성 (라인 아이템 포함)
    const structured = items.map((item, idx) => ({
      sku: item.product_key, product_name: item.product_name,
      description: item.description, quantity: item.quantity,
      unit_price: item.unit_price, discount_rate: item.discount_rate,
      amount: calcLineAmount(item), sort_order: idx,
    }))

    await portalFetch(`/api/portal/quotes/${quote.id}/versions`, {
      method: "POST",
      body: JSON.stringify({
        version_number: 1,
        title: formTitle || "견적서",
        structured_json: { items: structured, vat_surcharge: vatSurcharge },
        subtotal,
        discount_amount: 0,
        tax_amount: vatAmount,
        total_amount: totalAmount,
        valid_until: formValidUntil || null,
      }),
    })

    setShowForm(false)
    setSaving(false)
    void load()
  }

  async function handleConvert(quoteId: string) {
    setConverting(quoteId)
    const res = await portalFetch(`/api/portal/quotes/${quoteId}/convert`, { method: "POST" })
    if (res.ok) {
      void load()
    } else {
      const err = await res.json().catch(() => null)
      alert(err?.error ?? "전환 실패")
    }
    setConverting(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#1a1a1a]">견적서</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { void load() }} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openForm}>
            <Plus className="w-4 h-4 mr-1" />견적 작성
          </Button>
        </div>
      </div>

      {/* 견적 목록 */}
      {loading ? (
        <div className="py-12 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
      ) : quotes.length === 0 ? (
        <div className="py-12 text-center text-sm text-[#1a1a1a]/40 border border-[#e8e8e4] rounded-xl bg-white">
          견적서가 없습니다
        </div>
      ) : (
        <div className="border border-[#e8e8e4] rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#f7f7f5] border-b border-[#e8e8e4]">
              <tr>
                {["번호", "제목", "버전", "총액", "상태", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-[#1a1a1a]/60 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const latest = q.versions[0]
                return (
                  <tr key={q.id} className="border-b border-[#f0f0ec] hover:bg-[#fafafa] transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-[#1a1a1a]/60">{q.quote_number}</td>
                    <td className="px-4 py-3 font-medium text-[#1a1a1a]">{latest?.title ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-[#1a1a1a]/50">v{latest?.version_number ?? 1}</td>
                    <td className="px-4 py-3 font-medium">{formatMoney(latest?.total_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[q.status]}`}>
                        {STATUS_LABEL[q.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {q.status === "draft" && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-violet-600"
                            disabled={converting === q.id}
                            onClick={() => handleConvert(q.id)}>
                            <FileSignature className="w-3.5 h-3.5 mr-1" />
                            {converting === q.id ? "전환중..." : "계약전환"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 견적 작성 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e4]">
              <h2 className="text-base font-semibold">견적 작성</h2>
              <button onClick={() => setShowForm(false)} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-5">
              {/* 템플릿 선택 */}
              <div className="flex gap-2">
                {QUOTE_TEMPLATES.map((t) => (
                  <button key={t.id} type="button"
                    onClick={() => { setTemplateId(t.id); setItems(createTemplateItems(t.id)) }}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      templateId === t.id
                        ? "border-[#1a1a1a] bg-[#1a1a1a] text-white"
                        : "border-[#e8e8e4] text-[#1a1a1a]/60 hover:border-[#1a1a1a]/30"
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">제목</label>
                  <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="견적서 제목"
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">유효기한</label>
                  <input type="date" value={formValidUntil} onChange={(e) => setFormValidUntil(e.target.value)}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
              </div>

              {/* 라인 아이템 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#1a1a1a]/60">품목</span>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                    onClick={() => setItems([...items, createItemFromKey("custom")])}>
                    <Plus className="w-3.5 h-3.5 mr-1" />항목 추가
                  </Button>
                </div>
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end border border-[#f0f0ec] rounded-lg p-3 bg-[#fafafa]">
                    <div className="col-span-4">
                      <label className="text-[10px] text-[#1a1a1a]/40 mb-0.5 block">제품</label>
                      <select value={item.product_key} onChange={(e) => updateItemProduct(idx, e.target.value)}
                        className="w-full border border-[#e8e8e4] rounded px-2 py-1.5 text-xs">
                        {PRODUCT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] text-[#1a1a1a]/40 mb-0.5 block">수량</label>
                      <input type="number" min={1} value={item.quantity}
                        onChange={(e) => updateItem(idx, { quantity: +e.target.value })}
                        className="w-full border border-[#e8e8e4] rounded px-2 py-1.5 text-xs" />
                    </div>
                    <div className="col-span-3">
                      <label className="text-[10px] text-[#1a1a1a]/40 mb-0.5 block">단가</label>
                      <input type="number" min={0} value={item.unit_price}
                        disabled={!item.editable_price}
                        onChange={(e) => updateItem(idx, { unit_price: +e.target.value })}
                        className="w-full border border-[#e8e8e4] rounded px-2 py-1.5 text-xs disabled:bg-[#f0f0ec]" />
                    </div>
                    <div className="col-span-2 text-right text-xs font-medium pt-4">
                      {formatMoney(calcLineAmount(item))}
                    </div>
                    <div className="col-span-1 flex justify-end pt-4">
                      <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* VAT & 합계 */}
              <div className="flex items-center justify-between border-t border-[#e8e8e4] pt-4">
                <button type="button" className="inline-flex items-center gap-2 text-xs text-[#1a1a1a]/60"
                  onClick={() => setVatSurcharge(!vatSurcharge)}>
                  {vatSurcharge ? <ToggleRight className="w-5 h-5 text-blue-500" /> : <ToggleLeft className="w-5 h-5" />}
                  VAT 별도 (10%)
                </button>
                <div className="text-right space-y-1">
                  <div className="text-xs text-[#1a1a1a]/50">소계: {formatMoney(subtotal)}</div>
                  {vatSurcharge && <div className="text-xs text-[#1a1a1a]/50">VAT: {formatMoney(vatAmount)}</div>}
                  <div className="text-sm font-semibold">합계: {formatMoney(totalAmount)}</div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>취소</Button>
                <Button type="submit" disabled={saving}>
                  <Calculator className="w-4 h-4 mr-1" />
                  {saving ? "저장 중..." : "견적 생성"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
