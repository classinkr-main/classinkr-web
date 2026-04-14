"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Printer,
  Save,
  Trash2,
} from "lucide-react"
import { getProductBySku } from "@/lib/product-templates"

/* ─── Types ────────────────────────────────────────────────── */

type LineItem = {
  id: string
  sortOrder: number
  itemName: string
  itemDescription: string
  unitPrice: number
  quantity: number
  lineSupplyAmount: number
}

type QuoteEditorData = {
  quote: { id: string; quote_number: string; status: string }
  version: {
    title: string
    structured_json: Record<string, unknown> | null
    valid_until: string | null
  } | null
  deal: { id: string; title: string; customer_name: string | null; customer_campus_name: string | null }
}

type QuickAddPreset = {
  key: string
  label: string
}

/* ─── Helpers ──────────────────────────────────────────────── */

const QUICK_ADD_PRESETS: QuickAddPreset[] = [
  { key: "board-86", label: '86"' },
  { key: "board-75", label: '75"' },
  { key: "camera-t1", label: "T1 카메라" },
  { key: "stand", label: "스탠드" },
  { key: "wall-mount", label: "벽걸이" },
]

function fmt(n: number) {
  return n.toLocaleString("ko-KR")
}

function newLine(sortOrder: number): LineItem {
  return {
    id: crypto.randomUUID(),
    sortOrder,
    itemName: "",
    itemDescription: "",
    unitPrice: 0,
    quantity: 1,
    lineSupplyAmount: 0,
  }
}

function createPresetLine(productKey: string, quantity: number): LineItem {
  const preset = getProductBySku(productKey)
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1
  const unitPrice = preset?.unit_price ?? 0

  return {
    id: crypto.randomUUID(),
    sortOrder: 1,
    itemName: preset?.label ?? "",
    itemDescription: preset?.description ?? "",
    unitPrice,
    quantity: safeQuantity,
    lineSupplyAmount: Math.round(unitPrice * safeQuantity),
  }
}

function isBlankLine(line: LineItem) {
  return (
    line.itemName.trim() === "" &&
    line.itemDescription.trim() === "" &&
    line.unitPrice === 0 &&
    line.quantity === 1 &&
    line.lineSupplyAmount === 0
  )
}

function serializeLineItem(line: LineItem) {
  const { sortOrder, itemName, itemDescription, unitPrice, quantity, lineSupplyAmount } = line
  return { sortOrder, itemName, itemDescription, unitPrice, quantity, lineSupplyAmount }
}

function parseLineItems(json: Record<string, unknown> | null): LineItem[] {
  if (!json) return []
  const raw = Array.isArray(json.lineItems)
    ? json.lineItems
    : Array.isArray((json.quoteDetails as Record<string, unknown> | undefined)?.lineItems)
      ? (json.quoteDetails as Record<string, unknown[]>).lineItems
      : []

  return (raw as Record<string, unknown>[]).map((item, i) => {
    const qty = Number(item.quantity ?? 1)
    const price = Number(item.unitPrice ?? 0)
    return {
      id: crypto.randomUUID(),
      sortOrder: Number(item.sortOrder ?? i + 1),
      itemName: String(item.itemName ?? ""),
      itemDescription: String(item.itemDescription ?? ""),
      unitPrice: price,
      quantity: qty,
      lineSupplyAmount: Number(item.lineSupplyAmount ?? Math.round(qty * price)),
    }
  })
}

/* ─── Input Cell ───────────────────────────────────────────── */

function Cell({
  value,
  onChange,
  align = "left",
  placeholder = "",
  type = "text",
}: {
  value: string
  onChange: (v: string) => void
  align?: "left" | "right"
  placeholder?: string
  type?: "text" | "number"
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg border-0 bg-transparent px-2 py-1.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#084734]/20 ${
        align === "right" ? "text-right" : ""
      }`}
    />
  )
}

/* ─── Page ─────────────────────────────────────────────────── */

export default function QuoteEditorPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id

  const [data, setData] = useState<QuoteEditorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [recipientName, setRecipientName] = useState("")
  const [validUntil, setValidUntil] = useState("")
  const [lines, setLines] = useState<LineItem[]>([])
  const [quickQuantity, setQuickQuantity] = useState("1")

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  /* load */
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/partner/quotes/${id}`)
        if (!res.ok) throw new Error("로드 실패")
        const d: QuoteEditorData = await res.json()
        setData(d)
        setTitle(d.version?.title ?? d.deal.title)
        setRecipientName(
          (d.version?.structured_json?.recipientCompanyName as string | undefined) ??
          d.deal.customer_name ??
          ""
        )
        setValidUntil(d.version?.valid_until?.slice(0, 10) ?? "")
        const parsed = parseLineItems(d.version?.structured_json ?? null)
        setLines(parsed.length > 0 ? parsed : [newLine(1)])
      } catch {
        setError("견적서를 불러올 수 없습니다.")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [id])

  /* line helpers */
  const updateLine = useCallback((lineId: string, field: keyof LineItem, raw: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l
        const updated = { ...l, [field]: field === "itemName" || field === "itemDescription" ? raw : Number(raw) || 0 }
        if (field === "unitPrice" || field === "quantity") {
          updated.lineSupplyAmount = Math.round(updated.unitPrice * updated.quantity)
        }
        if (field === "lineSupplyAmount") {
          updated.lineSupplyAmount = Number(raw.replace(/,/g, "")) || 0
        }
        return updated
      })
    )
  }, [])

  const addLine = () =>
    setLines((prev) => [...prev, newLine(prev.length + 1)])

  function addPresetLine(productKey: string) {
    const quantity = Math.max(1, Number.parseInt(quickQuantity, 10) || 1)
    const presetLine = createPresetLine(productKey, quantity)

    setLines((prev) => {
      const blankIndex = prev.findIndex(isBlankLine)
      if (blankIndex >= 0) {
        return prev.map((line, index) =>
          index === blankIndex
            ? { ...presetLine, id: line.id, sortOrder: line.sortOrder }
            : line
        )
      }

      return [...prev, { ...presetLine, sortOrder: prev.length + 1 }]
    })
    setError(null)
    showToast(`${presetLine.itemName} ${quantity}개를 추가했습니다`)
  }

  const removeLine = (lineId: string) =>
    setLines((prev) => {
      const next = prev.filter((l) => l.id !== lineId)
      return next.length === 0 ? [newLine(1)] : next.map((l, i) => ({ ...l, sortOrder: i + 1 }))
    })

  /* totals */
  const subtotal = lines.reduce((s, l) => s + l.lineSupplyAmount, 0)
  const tax = Math.round(subtotal * 0.1)
  const total = subtotal + tax

  /* save */
  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/partner/quotes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          validUntil: validUntil || null,
          recipientCompanyName: recipientName,
          lineItems: lines.map(serializeLineItem),
        }),
      })
      if (!res.ok) throw new Error("저장 실패")
      showToast("저장되었습니다")
    } catch {
      setError("저장 중 오류가 발생했습니다.")
    } finally {
      setSaving(false)
    }
  }

  /* share */
  async function handleShare() {
    setSharing(true)
    try {
      // 먼저 저장
      await fetch(`/api/partner/quotes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          validUntil: validUntil || null,
          recipientCompanyName: recipientName,
          lineItems: lines.map(serializeLineItem),
        }),
      })
      // 링크 생성
      const res = await fetch(`/api/partner/quotes/${id}/share`, { method: "POST" })
      if (!res.ok) throw new Error("링크 생성 실패")
      const { shareUrl: url } = await res.json() as { shareUrl: string }
      setShareUrl(url)
    } catch {
      setError("링크 생성 중 오류가 발생했습니다.")
    } finally {
      setSharing(false)
    }
  }

  async function copyLink() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    showToast("링크가 복사되었습니다")
  }

  async function handlePrint() {
    if (!shareUrl) {
      await handleShare()
    }
    if (shareUrl) {
      window.open(shareUrl, "_blank")
    }
  }

  /* ── Render ─────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#A39E98]" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <p className="text-sm text-[#615D59]">{error}</p>
        <button onClick={() => router.back()} className="text-xs text-[#084734] hover:underline">
          돌아가기
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6">

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#111110] px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-[#615D59] hover:text-[#111110]"
        >
          <ArrowLeft className="h-4 w-4" />
          문서 목록
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#A39E98]">{data?.quote.quote_number}</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-[#084734] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#065c41] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            저장
          </button>
        </div>
      </div>

      {/* 메타 정보 */}
      <div className="mb-5 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#A39E98]">견적서 제목</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-[#E5E5E0] px-3 py-2 text-sm focus:border-[#084734] focus:outline-none focus:ring-2 focus:ring-[#084734]/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#A39E98]">수신처</label>
            <input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="예) 강남메가스터디학원"
              className="w-full rounded-lg border border-[#E5E5E0] px-3 py-2 text-sm focus:border-[#084734] focus:outline-none focus:ring-2 focus:ring-[#084734]/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#A39E98]">견적 유효기한</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full rounded-lg border border-[#E5E5E0] px-3 py-2 text-sm focus:border-[#084734] focus:outline-none focus:ring-2 focus:ring-[#084734]/20"
            />
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#A39E98]">빠른 추가</p>
            <p className="mt-1 text-sm text-[#615D59]">
              자주 쓰는 품목은 버튼으로 바로 넣고, 수량만 먼저 정하면 됩니다.
            </p>
          </div>
          <div className="w-full sm:w-auto">
            <label className="mb-1.5 block text-xs font-medium text-[#A39E98]">기본 수량</label>
            <input
              type="number"
              min={1}
              value={quickQuantity}
              onChange={(e) => setQuickQuantity(e.target.value)}
              className="w-full rounded-lg border border-[#E5E5E0] px-3 py-2 text-sm focus:border-[#084734] focus:outline-none focus:ring-2 focus:ring-[#084734]/20 sm:w-24"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK_ADD_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => addPresetLine(preset.key)}
              className="rounded-xl border border-[#E5E5E0] bg-[#F6F5F4] px-4 py-2 text-sm font-medium text-[#111110] hover:border-[#084734]/25 hover:bg-[#ECFDF5]"
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={addLine}
            className="rounded-xl border border-dashed border-[#D8D5CF] bg-white px-4 py-2 text-sm font-medium text-[#615D59] hover:border-[#084734]/25 hover:text-[#111110]"
          >
            직접 입력
          </button>
        </div>
      </div>

      {/* 라인 아이템 테이블 */}
      <div className="mb-4 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            {/* 컬럼 헤더 */}
            <div className="grid grid-cols-[32px_1fr_1fr_120px_80px_120px_36px] gap-1 border-b border-[rgba(0,0,0,0.06)] bg-[#F6F5F4] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#A39E98]">
              <span className="text-center">No</span>
              <span>품목명</span>
              <span>세부내역</span>
              <span className="text-right">단가</span>
              <span className="text-right">수량</span>
              <span className="text-right">공급가액</span>
              <span />
            </div>

            {/* 행 */}
            <div className="divide-y divide-[rgba(0,0,0,0.04)]">
              {lines.map((line, i) => (
                <div
                  key={line.id}
                  className="grid grid-cols-[32px_1fr_1fr_120px_80px_120px_36px] items-center gap-1 px-3 py-1 hover:bg-[#FAFAF8]"
                >
                  <span className="text-center text-xs text-[#A39E98]">{i + 1}</span>
                  <Cell
                    value={line.itemName}
                    onChange={(v) => updateLine(line.id, "itemName", v)}
                    placeholder="제품명"
                  />
                  <Cell
                    value={line.itemDescription}
                    onChange={(v) => updateLine(line.id, "itemDescription", v)}
                    placeholder="세부 내역"
                  />
                  <Cell
                    value={line.unitPrice === 0 ? "" : String(line.unitPrice)}
                    onChange={(v) => updateLine(line.id, "unitPrice", v)}
                    align="right"
                    placeholder="0"
                    type="number"
                  />
                  <Cell
                    value={String(line.quantity)}
                    onChange={(v) => updateLine(line.id, "quantity", v)}
                    align="right"
                    type="number"
                  />
                  <div className="py-1.5 pr-2 text-right text-sm font-medium text-[#111110]">
                    {fmt(line.lineSupplyAmount)}
                  </div>
                  <button
                    onClick={() => removeLine(line.id)}
                    className="flex items-center justify-center rounded-lg p-1 text-[#A39E98] hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* 행 추가 */}
            <button
              onClick={addLine}
              className="flex w-full items-center gap-2 border-t border-dashed border-[rgba(0,0,0,0.08)] px-4 py-2.5 text-xs font-medium text-[#A39E98] hover:bg-[#F6F5F4] hover:text-[#615D59]"
            >
              <Plus className="h-3.5 w-3.5" />
              품목 추가
            </button>
          </div>
        </div>
      </div>

      {/* 합계 */}
      <div className="mb-6 flex justify-end">
        <div className="w-64 space-y-2 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-4">
          <div className="flex justify-between text-sm text-[#615D59]">
            <span>공급가액 합계</span>
            <span>{fmt(subtotal)}원</span>
          </div>
          <div className="flex justify-between text-sm text-[#615D59]">
            <span>부가세 (10%)</span>
            <span>{fmt(tax)}원</span>
          </div>
          <div className="flex justify-between border-t border-[rgba(0,0,0,0.08)] pt-2 text-base font-bold text-[#111110]">
            <span>총 합계</span>
            <span>{fmt(total)}원</span>
          </div>
        </div>
      </div>

      {/* 공유/인쇄 액션 */}
      <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#A39E98]">발송 & 출력</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleShare}
            disabled={sharing}
            className="flex items-center gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2.5 text-sm font-medium text-[#111110] hover:border-[#084734]/30 hover:bg-[#ECFDF5] disabled:opacity-50"
          >
            {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            고객 링크 생성
          </button>

          {shareUrl && (
            <>
              <button
                onClick={copyLink}
                className="flex items-center gap-2 rounded-xl border border-[#D1FAE5] bg-[#ECFDF5] px-4 py-2.5 text-sm font-medium text-[#084734] hover:bg-[#D1FAE5]"
              >
                <Copy className="h-4 w-4" />
                {copied ? "복사됨!" : "링크 복사"}
              </button>
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2.5 text-sm font-medium text-[#111110] hover:bg-[#F6F5F4]"
              >
                <ExternalLink className="h-4 w-4" />
                미리보기
              </a>
              <button
                onClick={() => { void handlePrint() }}
                className="flex items-center gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2.5 text-sm font-medium text-[#111110] hover:bg-[#F6F5F4]"
              >
                <Printer className="h-4 w-4" />
                인쇄 / PDF
              </button>
            </>
          )}
        </div>

        {shareUrl && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-xs text-[#615D59]">{shareUrl}</span>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
