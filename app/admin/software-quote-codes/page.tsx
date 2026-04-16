"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Ban, Copy, Loader2, Plus, RefreshCw, Ticket, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type QuoteCodeKind = "business_recharge" | "subscription"

interface QuoteCodeRow {
  id: string
  code: string
  kind: QuoteCodeKind
  organization_name: string | null
  buyer_name: string | null
  buyer_email: string | null
  amount_cny: number | string | null
  amount_usd: number | string | null
  notes: string | null
  expires_at: string | null
  redeemed_at: string | null
  redeemed_order_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

function adminFetch(url: string, options?: RequestInit) {
  const token =
    typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token ?? ""}`,
      ...options?.headers,
    },
  })
}

function toNumber(value: number | string | null) {
  if (value == null) return null
  if (typeof value === "number") return value
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatCny(value: number | string | null) {
  const n = toNumber(value)
  if (n == null) return "-"
  return `¥${Math.round(n).toLocaleString("en-US")}`
}

function formatDate(value: string | null) {
  if (!value) return "-"
  try {
    return new Date(value).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return value
  }
}

const KIND_LABEL: Record<QuoteCodeKind, string> = {
  business_recharge: "충전형",
  subscription: "구독형",
}

export default function SoftwareQuoteCodesPage() {
  const [codes, setCodes] = useState<QuoteCodeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    kind: "business_recharge" as QuoteCodeKind,
    amountCny: "10000",
    amountUsd: "",
    organizationName: "",
    buyerName: "",
    buyerEmail: "",
    notes: "",
    expiresAt: "",
  })

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminFetch("/api/admin/software-quote-codes")
      if (res.ok) {
        const payload = (await res.json()) as { codes: QuoteCodeRow[] }
        setCodes(payload.codes ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const sorted = useMemo(() => {
    const ts = (s: string) => {
      try {
        return new Date(s).getTime()
      } catch {
        return 0
      }
    }
    return [...codes].sort((a, b) => ts(b.created_at) - ts(a.created_at))
  }, [codes])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const payload: Record<string, unknown> = {
        kind: form.kind,
        organizationName: form.organizationName,
        buyerName: form.buyerName,
        buyerEmail: form.buyerEmail,
        notes: form.notes,
        expiresAt: form.expiresAt || undefined,
      }

      if (form.kind === "business_recharge") {
        payload.amountCny = Number.parseInt(form.amountCny.replace(/[^0-9]/g, ""), 10)
      } else {
        payload.amountUsd = Number.parseFloat(form.amountUsd)
      }

      const res = await adminFetch("/api/admin/software-quote-codes", {
        method: "POST",
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const payloadErr = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(payloadErr.error ?? "코드 발급에 실패했습니다.")
      }
      setShowForm(false)
      setForm({
        kind: "business_recharge",
        amountCny: "10000",
        amountUsd: "",
        organizationName: "",
        buyerName: "",
        buyerEmail: "",
        notes: "",
        expiresAt: "",
      })
      await load()
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "코드 발급에 실패했습니다."
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel(id: string) {
    if (!confirm("이 코드를 즉시 만료 처리하시겠습니까?")) return
    await adminFetch(`/api/admin/software-quote-codes/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ cancel: true }),
    })
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm("사용되지 않은 코드를 완전히 삭제합니다. 계속할까요?")) return
    const res = await adminFetch(`/api/admin/software-quote-codes/${id}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      const payloadErr = (await res.json().catch(() => ({}))) as { error?: string }
      alert(payloadErr.error ?? "삭제 실패")
      return
    }
    await load()
  }

  function copyCheckoutUrl(code: string, kind: QuoteCodeKind) {
    if (typeof window === "undefined") return
    const base = `${window.location.origin}/checkout`
    const url =
      kind === "business_recharge"
        ? `${base}?mode=business&quote=${encodeURIComponent(code)}`
        : `${base}?mode=subscription&quote=${encodeURIComponent(code)}`
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        alert(`결제 링크가 클립보드에 복사되었습니다.\n${url}`)
      })
      .catch(() => {
        prompt("다음 URL을 복사하세요.", url)
      })
  }

  function copyCode(code: string) {
    void navigator.clipboard.writeText(code).then(() => {
      alert(`코드 ${code} 가 복사되었습니다.`)
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a1a]">소프트웨어 견적 코드</h1>
          <p className="mt-0.5 text-sm text-[#1a1a1a]/50">
            {sorted.length}건 · 충전형/구독형 결제 코드 발급 및 관리
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </Button>
          <Button
            size="sm"
            onClick={() => setShowForm(true)}
            className="bg-[#084734] text-white hover:bg-[#065c41]"
          >
            <Plus className="mr-1 h-4 w-4" />
            코드 발급
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[#e8e8e4] bg-white overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
        ) : sorted.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">
            발급된 코드가 없습니다.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f7f7f5] border-b border-[#e8e8e4]">
              <tr>
                {["코드", "유형", "금액", "대상", "만료", "상태", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-[#1a1a1a]/60"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((code) => {
                const status = code.redeemed_at
                  ? { label: "사용됨", color: "bg-[#ECFDF5] text-[#084734]" }
                  : code.expires_at &&
                    new Date(code.expires_at).getTime() < Date.now()
                  ? { label: "만료", color: "bg-[#f0f0ec] text-[#1a1a1a]/50" }
                  : { label: "활성", color: "bg-[#FEF9C3] text-[#7B3F00]" }

                return (
                  <tr
                    key={code.id}
                    className="border-b border-[#f0f0ec] hover:bg-[#fafafa]"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => copyCode(code.code)}
                        className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-[#1a1a1a] hover:text-[#084734]"
                        title="코드 복사"
                      >
                        <Ticket className="h-3.5 w-3.5" />
                        {code.code}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#1a1a1a]/70">
                      {KIND_LABEL[code.kind]}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-[#1a1a1a]">
                      {code.kind === "business_recharge"
                        ? formatCny(code.amount_cny)
                        : code.amount_usd
                        ? `$${toNumber(code.amount_usd)?.toLocaleString("en-US")}`
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#1a1a1a]/70">
                      {code.organization_name ?? "-"}
                      {code.buyer_email ? (
                        <span className="block text-[11px] text-[#1a1a1a]/40">
                          {code.buyer_email}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#1a1a1a]/60">
                      {formatDate(code.expires_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => copyCheckoutUrl(code.code, code.kind)}
                          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-[#084734] hover:bg-[#ECFDF5]"
                          title="결제 링크 복사"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          결제 링크
                        </button>
                        {!code.redeemed_at ? (
                          <button
                            type="button"
                            onClick={() => handleCancel(code.id)}
                            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-[#B85C33] hover:bg-[#FEF3EE]"
                            title="즉시 만료 처리"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            만료
                          </button>
                        ) : null}
                        {!code.redeemed_at ? (
                          <button
                            type="button"
                            onClick={() => handleDelete(code.id)}
                            className="inline-flex h-7 items-center rounded-md px-2 text-[#1a1a1a]/30 hover:text-[#B85C33]"
                            title="삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#1a1a1a]">소프트웨어 견적 코드 발급</h2>
                <p className="mt-1 text-xs text-[#1a1a1a]/55">
                  발급한 코드는 /checkout 결제 화면에서 입력되어 지정 금액으로 결제됩니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-[#1a1a1a]/45 hover:text-[#1a1a1a]"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>유형 *</Label>
                <div className="inline-flex rounded-full bg-[#f0f0ec] p-1">
                  {(["business_recharge", "subscription"] as QuoteCodeKind[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, kind }))}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        form.kind === kind
                          ? "bg-[#084734] text-white"
                          : "text-[#1a1a1a]/60 hover:text-[#1a1a1a]"
                      }`}
                    >
                      {KIND_LABEL[kind]}
                    </button>
                  ))}
                </div>
              </div>

              {form.kind === "business_recharge" ? (
                <div className="space-y-2">
                  <Label htmlFor="amountCny">충전 금액 (CNY) *</Label>
                  <Input
                    id="amountCny"
                    type="text"
                    inputMode="numeric"
                    value={form.amountCny}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, amountCny: e.target.value }))
                    }
                    placeholder="10000"
                  />
                  <p className="text-[11px] text-[#1a1a1a]/45">
                    최초 10,000 CNY 이상, 이후 2,000 CNY 단위만 허용됩니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="amountUsd">금액 (USD) *</Label>
                  <Input
                    id="amountUsd"
                    type="number"
                    min={0}
                    step={1}
                    value={form.amountUsd}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, amountUsd: e.target.value }))
                    }
                    placeholder="0"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="organizationName">기관명</Label>
                  <Input
                    id="organizationName"
                    value={form.organizationName}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, organizationName: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyerName">담당자명</Label>
                  <Input
                    id="buyerName"
                    value={form.buyerName}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, buyerName: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="buyerEmail">이메일</Label>
                  <Input
                    id="buyerEmail"
                    type="email"
                    value={form.buyerEmail}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, buyerEmail: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiresAt">만료일 (선택)</Label>
                  <Input
                    id="expiresAt"
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, expiresAt: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">메모</Label>
                <Input
                  id="notes"
                  value={form.notes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="내부 메모 (고객에게 노출되지 않음)"
                />
              </div>

              {error ? (
                <p className="rounded-lg bg-[#FEF3EE] px-3 py-2 text-xs text-[#B85C33]">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  취소
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      발급 중...
                    </>
                  ) : (
                    "코드 발급"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
