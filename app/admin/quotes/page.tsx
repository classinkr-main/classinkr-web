"use client"

import React, { useEffect, useMemo, useState } from "react"
import {
  Calculator,
  FileSignature,
  Plus,
  RefreshCw,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  PencilLine,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Partner, Quote, QuoteStatus } from "@/lib/supabase/database.types"

const DUMMY_MODE = false

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

type QuoteTemplate = {
  id: string
  label: string
  description: string
  itemKeys: string[]
}

type ProductOption = {
  key: string
  label: string
  description: string
  unit_price: number
}

const PRODUCT_OPTIONS: ProductOption[] = [
  {
    key: "board-86",
    label: "ClassIn Board 86인치",
    description: "메인 대형 패널",
    unit_price: 5_000_000,
  },
  {
    key: "board-75",
    label: "ClassIn Board 75인치",
    description: "중형 패널",
    unit_price: 4_000_000,
  },
  {
    key: "camera",
    label: "카메라 세트",
    description: "수업/회의 촬영 세트",
    unit_price: 1_320_000,
  },
  {
    key: "speaker",
    label: "스피커 세트",
    description: "음향 보강 세트",
    unit_price: 935_000,
  },
  {
    key: "install",
    label: "설치 및 교육",
    description: "현장 설치 + 운영 교육",
    unit_price: 0,
  },
  {
    key: "support",
    label: "유지보수 1년",
    description: "무상 A/S 포함",
    unit_price: 0,
  },
  {
    key: "custom",
    label: "커스텀 항목",
    description: "직접 입력",
    unit_price: 0,
  },
]

const QUOTE_TEMPLATES: QuoteTemplate[] = [
  {
    id: "board_bundle",
    label: "보드 패키지",
    description: "패널 중심의 표준 견적 포맷",
    itemKeys: ["board-86", "install", "support"],
  },
  {
    id: "compact_bundle",
    label: "보드 + 주변기기",
    description: "소형 설치용 구성",
    itemKeys: ["board-75", "camera", "install"],
  },
  {
    id: "custom",
    label: "커스텀",
    description: "빈 폼에서 직접 구성",
    itemKeys: ["custom"],
  },
]

const DUMMY_PARTNERS_MAP: Record<string, string> = {
  p1: "서울교육지원재단",
  p2: "부산미래학교",
  p3: "하늘초등학교",
  p4: "신라중학교",
  p5: "대전과학고",
}

const DUMMY_QUOTES_LIST: Quote[] = [
  {
    id: "q1",
    quote_number: "Q-2026-001",
    partner_id: "p1",
    lead_id: null,
    version: 1,
    title: "ClassIn Board 86인치 5대 견적",
    status: "converted",
    valid_until: "2026-04-30",
    subtotal: 22_727_272,
    discount_amount: 0,
    tax_amount: 2_272_728,
    total_amount: 25_000_000,
    notes: "설치비 포함",
    created_by: null,
    sent_at: "2026-03-01T00:00:00Z",
    accepted_at: "2026-03-05T00:00:00Z",
    converted_to_contract_id: "c1",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-05T00:00:00Z",
  },
  {
    id: "q2",
    quote_number: "Q-2026-002",
    partner_id: "p2",
    lead_id: null,
    version: 1,
    title: "ClassIn Board 75인치 추가 도입",
    status: "sent",
    valid_until: "2026-04-20",
    subtotal: 10_909_090,
    discount_amount: 0,
    tax_amount: 1_090_910,
    total_amount: 12_000_000,
    notes: null,
    created_by: null,
    sent_at: "2026-03-20T00:00:00Z",
    accepted_at: null,
    converted_to_contract_id: null,
    created_at: "2026-03-18T00:00:00Z",
    updated_at: "2026-03-20T00:00:00Z",
  },
]

const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "초안",
  sent: "발송",
  accepted: "수락",
  rejected: "거절",
  expired: "만료",
  converted: "계약 전환",
}

const STATUS_COLOR: Record<QuoteStatus, string> = {
  draft: "bg-[#f0f0ec] text-[#1a1a1a]/50",
  sent: "bg-[#ECFDF5] text-[#084734]",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-[#FEF3EE] text-[#B85C33]",
  expired: "bg-[#f0f0ec] text-[#1a1a1a]/40",
  converted: "bg-[#D1FAE5] text-[#065c41]",
}

function adminFetch(url: string, options?: RequestInit) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
}

function formatMoney(value?: number | null) {
  if (value == null) return "-"
  return `${value.toLocaleString("ko-KR")}원`
}

function calcLineAmount(item: QuoteItem) {
  return Math.round(item.quantity * item.unit_price * (1 - item.discount_rate / 100))
}

function getPresetProduct(productKey: string) {
  return PRODUCT_OPTIONS.find((option) => option.key === productKey) ?? PRODUCT_OPTIONS[0]
}

function createItemFromKey(productKey: string): QuoteItem {
  const preset = getPresetProduct(productKey)
  return normalizeItem({
    product_key: preset.key,
    product_name: preset.label,
    description: preset.description,
    quantity: 1,
    unit_price: preset.unit_price,
    discount_rate: 0,
    amount: 0,
    editable_price: preset.key === "custom",
  })
}

function createTemplateItems(templateId: string) {
  const template = QUOTE_TEMPLATES.find((item) => item.id === templateId) ?? QUOTE_TEMPLATES[0]
  return template.itemKeys.map((key) => createItemFromKey(key))
}

function normalizeItem(item: QuoteItem): QuoteItem {
  return {
    ...item,
    amount: calcLineAmount(item),
  }
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [converting, setConverting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [templateId, setTemplateId] = useState("board_bundle")
  const [vatSurcharge, setVatSurcharge] = useState(false)
  const [form, setForm] = useState({
    partner_id: "",
    title: "",
    valid_until: "",
    notes: "",
  })
  const [items, setItems] = useState<QuoteItem[]>(createTemplateItems("board_bundle"))

  const load = async () => {
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
  }

  useEffect(() => {
    const run = async () => {
      await load()
    }

    void run()
  }, [])

  const partnerName = (id: string) =>
    DUMMY_MODE
      ? DUMMY_PARTNERS_MAP[id] ?? id
      : partners.find((partner) => partner.id === id)?.name ?? id

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + calcLineAmount(item), 0), [items])
  const discountAmount = useMemo(
    () =>
      items.reduce((sum, item) => {
        const base = item.quantity * item.unit_price
        return sum + Math.max(0, base - calcLineAmount(item))
      }, 0),
    [items]
  )
  const vatAmount = vatSurcharge ? Math.round(subtotal * 0.1) : 0
  const totalAmount = subtotal + vatAmount

  function openForm() {
    setTemplateId("board_bundle")
    setVatSurcharge(false)
    setForm({
      partner_id: "",
      title: "",
      valid_until: "",
      notes: "",
    })
    setItems(createTemplateItems("board_bundle"))
    setShowForm(true)
  }

  function updateItem(idx: number, next: Partial<QuoteItem>) {
    setItems((prev) => {
      const itemsNext = [...prev]
      const current = itemsNext[idx]
      if (!current) return prev

      const merged = normalizeItem({
        ...current,
        ...next,
      })

      itemsNext[idx] = merged
      return itemsNext
    })
  }

  function updateItemProduct(idx: number, productKey: string) {
    const preset = getPresetProduct(productKey)
    setItems((prev) => {
      const next = [...prev]
      const current = next[idx]
      if (!current) return prev

      next[idx] = normalizeItem({
        ...current,
        product_key: preset.key,
        product_name: preset.label,
        description: preset.description,
        unit_price: preset.key === "custom" ? 0 : preset.unit_price,
        editable_price: preset.key === "custom",
      })
      return next
    })
  }

  function toggleEditablePrice(idx: number) {
    setItems((prev) => {
      const next = [...prev]
      const current = next[idx]
      if (!current) return prev

      const isCustom = current.product_key === "custom"
      const editable_price = isCustom ? true : !current.editable_price
      const preset = getPresetProduct(current.product_key)
      next[idx] = normalizeItem({
        ...current,
        editable_price,
        unit_price: editable_price ? current.unit_price : preset.unit_price,
      })
      return next
    })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const res = await adminFetch("/api/admin/quotes", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        subtotal,
        tax_amount: vatAmount,
        total_amount: totalAmount,
        discount_amount: discountAmount,
        status: "draft",
        items: items.map((item, idx) => ({
          product_name: item.product_name,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_rate: item.discount_rate,
          amount: calcLineAmount(item),
          sort_order: idx,
        })),
      }),
    })

    if (res.ok) {
      setShowForm(false)
      await load()
    }

    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("견적서를 삭제하시겠습니까?")) return
    await adminFetch(`/api/admin/quotes/${id}`, { method: "DELETE" })
    await load()
  }

  async function handleConvert(id: string) {
    if (!confirm("이 견적서를 계약서로 전환하시겠습니까?")) return
    setConverting(id)
    const res = await adminFetch(`/api/admin/quotes/${id}/convert`, {
      method: "POST",
      body: JSON.stringify({}),
    })

    if (res.ok) {
      alert("계약서가 생성되었습니다.")
      await load()
    } else {
      const err = await res.json()
      alert(err.error ?? "전환 실패")
    }

    setConverting(null)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a1a]">견적서</h1>
          <p className="text-sm text-[#1a1a1a]/50 mt-0.5">{quotes.length}건</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openForm}>
            <Plus className="w-4 h-4 mr-1" />
            견적서 작성
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[#e8e8e4] bg-white overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
        ) : quotes.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">작성된 견적서가 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f7f7f5] border-b border-[#e8e8e4]">
              <tr>
                {["번호", "파트너", "제목", "총액", "유효기간", "상태", ""].map((label) => (
                  <th key={label} className="px-4 py-3 text-left text-xs font-medium text-[#1a1a1a]/60">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.id} className="border-b border-[#f0f0ec] hover:bg-[#fafafa] transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-[#1a1a1a]/60">{quote.quote_number}</td>
                  <td className="px-4 py-3 text-[#1a1a1a]/70">{partnerName(quote.partner_id)}</td>
                  <td className="px-4 py-3 font-medium text-[#1a1a1a]">{quote.title}</td>
                  <td className="px-4 py-3 font-medium text-[#1a1a1a]">{formatMoney(quote.total_amount)}</td>
                  <td className="px-4 py-3 text-xs text-[#1a1a1a]/50">{quote.valid_until ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[quote.status]}`}>
                      {STATUS_LABEL[quote.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {!["converted", "rejected", "expired"].includes(quote.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-[#084734] hover:text-[#065c41]"
                          onClick={() => handleConvert(quote.id)}
                          disabled={converting === quote.id}
                        >
                          <FileSignature className="w-3.5 h-3.5 mr-1" />
                          {converting === quote.id ? "처리중..." : "계약 전환"}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-[#B85C33]"
                        onClick={() => handleDelete(quote.id)}
                      >
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

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl my-4">
            <div className="flex items-center justify-between border-b border-[#e8e8e4] px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-[#1a1a1a]">견적서 작성</h2>
                <p className="mt-1 text-xs text-[#1a1a1a]/45">기본은 VAT 포함가이며, 필요할 때만 10%를 추가합니다.</p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#1a1a1a]/60">파트너 *</label>
                    <select
                      required
                      value={form.partner_id}
                      onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
                      className="w-full rounded-lg border border-[#e8e8e4] px-3 py-2 text-sm focus:border-[#1a1a1a] focus:outline-none"
                    >
                      <option value="">선택</option>
                      {partners.map((partner) => (
                        <option key={partner.id} value={partner.id}>
                          {partner.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#1a1a1a]/60">유효기간</label>
                    <input
                      type="date"
                      value={form.valid_until}
                      onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                      className="w-full rounded-lg border border-[#e8e8e4] px-3 py-2 text-sm focus:border-[#1a1a1a] focus:outline-none"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-[#1a1a1a]/60">제목 *</label>
                    <input
                      required
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="예) ClassIn Board 86인치 도입 견적"
                      className="w-full rounded-lg border border-[#e8e8e4] px-3 py-2 text-sm focus:border-[#1a1a1a] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-[#e8e8e4] bg-[#fafafa] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/35">견적 포맷</p>
                      <p className="mt-1 text-sm text-[#1a1a1a]/55">템플릿을 고르면 선택형 품목이 자동으로 채워집니다.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {QUOTE_TEMPLATES.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => {
                            setTemplateId(template.id)
                            setItems(createTemplateItems(template.id))
                          }}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                            templateId === template.id
                              ? "bg-[#1a1a1a] text-white"
                              : "bg-[#f0f0ec] text-[#1a1a1a]/60 hover:text-[#1a1a1a]"
                          }`}
                        >
                          {template.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-[#1a1a1a]/45" />
                      <label className="text-xs font-medium text-[#1a1a1a]/60">품목</label>
                    </div>
                    <button
                      type="button"
                      onClick={() => setItems((prev) => [...prev, createItemFromKey("custom")])}
                      className="flex items-center gap-0.5 text-xs text-[#084734] hover:underline"
                    >
                      <Plus className="w-3 h-3" />
                      품목 추가
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-[#e8e8e4]">
                    <table className="w-full text-xs">
                      <thead className="bg-[#f7f7f5]">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium text-[#1a1a1a]/50">품목</th>
                          <th className="px-2 py-2 text-left font-medium text-[#1a1a1a]/50">설명</th>
                          <th className="px-2 py-2 text-left font-medium text-[#1a1a1a]/50">수량</th>
                          <th className="px-2 py-2 text-left font-medium text-[#1a1a1a]/50">단가</th>
                          <th className="px-2 py-2 text-left font-medium text-[#1a1a1a]/50">할인%</th>
                          <th className="px-2 py-2 text-right font-medium text-[#1a1a1a]/50">금액</th>
                          <th className="px-2 py-2 text-right font-medium text-[#1a1a1a]/50"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => (
                          <tr key={`${item.product_key}-${idx}`} className="border-t border-[#f0f0ec]">
                            <td className="px-2 py-1.5">
                              <div className="flex min-w-[180px] items-center gap-2">
                                <select
                                  value={item.product_key}
                                  onChange={(e) => updateItemProduct(idx, e.target.value)}
                                  className="w-full rounded border border-[#e8e8e4] px-2 py-1 focus:outline-none"
                                >
                                  {PRODUCT_OPTIONS.map((option) => (
                                    <option key={option.key} value={option.key}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                value={item.description}
                                onChange={(e) => updateItem(idx, { description: e.target.value })}
                                placeholder="간단 설명"
                                className="w-40 rounded border border-[#e8e8e4] px-2 py-1 focus:outline-none"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                                className="w-16 rounded border border-[#e8e8e4] px-2 py-1 text-right focus:outline-none"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  value={item.unit_price}
                                  onChange={(e) => updateItem(idx, { unit_price: Math.max(0, Number(e.target.value) || 0) })}
                                  disabled={!item.editable_price}
                                  className={`w-24 rounded border px-2 py-1 text-right focus:outline-none ${
                                    item.editable_price
                                      ? "border-[#e8e8e4] bg-white"
                                      : "border-[#ecece7] bg-[#f7f7f5] text-[#1a1a1a]/45"
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleEditablePrice(idx)}
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${
                                    item.editable_price
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-[#f0f0ec] text-[#1a1a1a]/55"
                                  }`}
                                >
                                  <PencilLine className="h-3 w-3" />
                                  가격 수정
                                </button>
                              </div>
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={item.discount_rate}
                                onChange={(e) => updateItem(idx, { discount_rate: Math.max(0, Number(e.target.value) || 0) })}
                                className="w-16 rounded border border-[#e8e8e4] px-2 py-1 text-right focus:outline-none"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right font-medium text-[#1a1a1a]">
                              {calcLineAmount(item).toLocaleString()}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {items.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setItems((prev) => prev.filter((_, index) => index !== idx))}
                                  className="text-[#1a1a1a]/30 hover:text-[#B85C33]"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-[#e8e8e4] bg-[#fafafa] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/35">VAT</p>
                      <p className="mt-1 text-sm text-[#1a1a1a]/55">기본은 포함가입니다.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVatSurcharge((current) => !current)}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        vatSurcharge
                          ? "bg-amber-50 text-amber-700"
                          : "bg-[#f0f0ec] text-[#1a1a1a]/60"
                      }`}
                    >
                      {vatSurcharge ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                      {vatSurcharge ? "VAT 10% 추가" : "VAT 포함"}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-[#e8e8e4] bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/35">금액 요약</p>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between text-[#1a1a1a]/55">
                      <span>공급가 합계</span>
                      <span className="font-medium text-[#1a1a1a]">{subtotal.toLocaleString()}원</span>
                    </div>
                    <div className="flex items-center justify-between text-[#1a1a1a]/55">
                      <span>할인 합계</span>
                      <span className="font-medium text-[#1a1a1a]">- {discountAmount.toLocaleString()}원</span>
                    </div>
                    <div className="flex items-center justify-between text-[#1a1a1a]/55">
                      <span>VAT</span>
                      <span className="font-medium text-[#1a1a1a]">
                        {vatSurcharge ? `${vatAmount.toLocaleString()}원` : "0원"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-[#e8e8e4] pt-3 text-base">
                      <span className="font-semibold text-[#1a1a1a]">최종 견적</span>
                      <span className="font-bold text-[#1a1a1a]">{totalAmount.toLocaleString()}원</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-[#1a1a1a]/60">메모</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={4}
                    className="w-full resize-none rounded-lg border border-[#e8e8e4] px-3 py-2 text-sm focus:border-[#1a1a1a] focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    취소
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "저장중..." : "견적서 저장"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
