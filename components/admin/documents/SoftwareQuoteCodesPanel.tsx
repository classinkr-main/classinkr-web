"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Ban, Copy, Loader2, Plus, RefreshCw, Ticket, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BUSINESS_RECHARGE, formatRechargeKrw } from "@/lib/billing/recharge"

type QuoteCodeKind = "business_recharge" | "subscription"

/**
 * GET /api/admin/software-quote-codes 는 lib/billing/quote-codes 의 mapQuoteCode 를 거친
 * camelCase 객체를 돌려준다. (이전 버전은 여기서 snake_case 로 읽어 금액·대상·만료·상태가
 * 전부 빈 값/"활성"으로만 보였다.)
 * amount_cny 는 역사 보존용 컬럼이라 매핑 자체를 하지 않는다 — 충전형 금액은 amountKrw 뿐.
 */
interface QuoteCodeRow {
  id: string
  code: string
  kind: QuoteCodeKind
  organizationName: string | null
  buyerName: string | null
  buyerEmail: string | null
  amountKrw: number | string | null
  amountUsd: number | string | null
  notes: string | null
  expiresAt: string | null
  redeemedAt: string | null
  redeemedOrderId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

const EMPTY_FORM = {
  kind: "business_recharge" as QuoteCodeKind,
  amountKrw: String(BUSINESS_RECHARGE.baseMinKrw),
  amountUsd: "",
  organizationName: "",
  buyerName: "",
  buyerEmail: "",
  notes: "",
  expiresAt: "",
}

const KIND_LABEL: Record<QuoteCodeKind, string> = {
  business_recharge: "충전형",
  subscription: "구독형",
}

// 필드 중요도에 따른 입력 크기 — QuickQuoteComposer 컴팩트 규칙과 통일.
// 금액(결제 직결, 필수)만 기본 높이를 유지하고 나머지는 한 단계 낮춘다.
const COMPACT_INPUT_CLASS = "h-9 text-[13px]"
const AMOUNT_INPUT_CLASS = "text-[15px] font-semibold"

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

function formatKrw(value: number | string | null) {
  const amount = toNumber(value)
  if (amount == null) return "-"
  return formatRechargeKrw(amount)
}

function formatUsd(value: number | string | null) {
  const amount = toNumber(value)
  if (amount == null) return "-"
  return `$${Math.round(amount).toLocaleString("en-US")}`
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

function statusMeta(code: QuoteCodeRow) {
  if (code.redeemedAt) {
    return { label: "사용됨", color: "bg-[#ECFDF5] text-[#084734]" }
  }

  if (code.expiresAt && new Date(code.expiresAt).getTime() < Date.now()) {
    return { label: "만료", color: "bg-[#f0f0ec] text-[#1a1a1a]/50" }
  }

  return { label: "활성", color: "bg-[#FEF9C3] text-[#7B3F00]" }
}

export default function SoftwareQuoteCodesPanel() {
  const [codes, setCodes] = useState<QuoteCodeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const sorted = useMemo(() => {
    const time = (value: string) => {
      try {
        return new Date(value).getTime()
      } catch {
        return 0
      }
    }

    return [...codes].sort((a, b) => time(b.createdAt) - time(a.createdAt))
  }, [codes])

  const load = async () => {
    setLoading(true)

    try {
      const response = await adminFetch("/api/admin/software-quote-codes")

      if (response.ok) {
        const payload = (await response.json()) as { codes?: QuoteCodeRow[] }
        setCodes(payload.codes ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setError(null)
  }

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
        payload.amountKrw = Number.parseInt(form.amountKrw.replace(/[^0-9]/g, ""), 10)
      } else {
        payload.amountUsd = Number.parseFloat(form.amountUsd)
      }

      const response = await adminFetch("/api/admin/software-quote-codes", {
        method: "POST",
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const payloadErr = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payloadErr.error ?? "코드 발급에 실패했습니다.")
      }

      setShowForm(false)
      resetForm()
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
    if (!window.confirm("이 코드를 즉시 만료 처리하시겠습니까?")) return

    await adminFetch(`/api/admin/software-quote-codes/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ cancel: true }),
    })
    await load()
  }

  async function handleDelete(id: string) {
    if (!window.confirm("사용되지 않은 코드를 완전히 삭제합니다. 계속할까요?")) return

    const response = await adminFetch(`/api/admin/software-quote-codes/${id}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      const payloadErr = (await response.json().catch(() => ({}))) as { error?: string }
      window.alert(payloadErr.error ?? "삭제 실패")
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
        window.alert(`결제 링크가 클립보드에 복사되었습니다.\n${url}`)
      })
      .catch(() => {
        window.prompt("다음 URL을 복사하세요.", url)
      })
  }

  function copyCode(code: string) {
    void navigator.clipboard.writeText(code).then(() => {
      window.alert(`코드 ${code} 가 복사되었습니다.`)
    })
  }

  const closeForm = () => {
    setShowForm(false)
    resetForm()
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#615D59] ring-1 ring-[#e8e8e4]">
          {loading ? "불러오는 중" : `${sorted.length}건`}
        </span>
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

      <div className="overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
        ) : sorted.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">
            발급된 코드가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-[#e8e8e4] bg-[#f7f7f5]">
                <tr>
                  {["코드", "유형", "금액", "대상", "만료", "상태", ""].map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-left text-xs font-medium text-[#1a1a1a]/60"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((code) => {
                  const status = statusMeta(code)

                  return (
                    <tr
                      key={code.id}
                      className="border-b border-[#f0f0ec] transition-colors hover:bg-[#fafafa]"
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
                          ? formatKrw(code.amountKrw)
                          : formatUsd(code.amountUsd)}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#1a1a1a]/70">
                        {code.organizationName ?? "-"}
                        {code.buyerEmail ? (
                          <span className="block text-[11px] text-[#1a1a1a]/40">
                            {code.buyerEmail}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#1a1a1a]/60">
                        {formatDate(code.expiresAt)}
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
                          {!code.redeemedAt ? (
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
                          {!code.redeemedAt ? (
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
          </div>
        )}
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#1a1a1a]">
                  소프트웨어 견적 코드 발급
                </h2>
                <p className="mt-1 text-xs text-[#1a1a1a]/55">
                  발급된 코드는 /checkout 결제 화면에서 입력해 지정 금액으로 결제합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="text-[#1a1a1a]/45 hover:text-[#1a1a1a]"
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>유형 *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["business_recharge", "subscription"] as QuoteCodeKind[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, kind }))}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        form.kind === kind
                          ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                          : "border-[#e8e8e4] text-[#1a1a1a]/60 hover:border-[#c8c8c4]"
                      }`}
                    >
                      {KIND_LABEL[kind]}
                    </button>
                  ))}
                </div>
              </div>

              {form.kind === "business_recharge" ? (
                <div className="space-y-2">
                  <Label htmlFor="amountKrw">충전 금액 (KRW) *</Label>
                  <Input
                    id="amountKrw"
                    type="text"
                    inputMode="numeric"
                    value={form.amountKrw}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, amountKrw: event.target.value }))
                    }
                    placeholder={String(BUSINESS_RECHARGE.baseMinKrw)}
                    className={AMOUNT_INPUT_CLASS}
                  />
                  <p className="text-[11px] text-[#1a1a1a]/45">
                    최초 {formatRechargeKrw(BUSINESS_RECHARGE.baseMinKrw)} 이상, 이후{" "}
                    {formatRechargeKrw(BUSINESS_RECHARGE.incrementKrw)} 단위만 허용합니다 (1회 상한{" "}
                    {formatRechargeKrw(BUSINESS_RECHARGE.maxKrw)}).
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
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, amountUsd: event.target.value }))
                    }
                    placeholder="0"
                    className={AMOUNT_INPUT_CLASS}
                  />
                </div>
              )}

              {/* 기관명·담당자명은 비중이 같아 균등 2열, 필수도가 낮아 컴팩트 높이로 낮춘다. */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="organizationName">기관명</Label>
                  <Input
                    id="organizationName"
                    value={form.organizationName}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        organizationName: event.target.value,
                      }))
                    }
                    className={COMPACT_INPUT_CLASS}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyerName">담당자명</Label>
                  <Input
                    id="buyerName"
                    value={form.buyerName}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, buyerName: event.target.value }))
                    }
                    className={COMPACT_INPUT_CLASS}
                  />
                </div>
              </div>

              {/* 이메일은 긴 문자열을 담으므로 더 넓게, 만료일은 고정 폭 날짜 포맷이라 좁게 배정. */}
              <div className="grid grid-cols-[1.4fr_1fr] gap-3">
                <div className="space-y-2">
                  <Label htmlFor="buyerEmail">이메일</Label>
                  <Input
                    id="buyerEmail"
                    type="email"
                    value={form.buyerEmail}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, buyerEmail: event.target.value }))
                    }
                    className={COMPACT_INPUT_CLASS}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiresAt">만료일 (선택)</Label>
                  <Input
                    id="expiresAt"
                    type="date"
                    value={form.expiresAt}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, expiresAt: event.target.value }))
                    }
                    className={COMPACT_INPUT_CLASS}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">메모</Label>
                <Input
                  id="notes"
                  value={form.notes}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  placeholder="내부 메모 (고객에게 노출되지 않음)"
                  className={COMPACT_INPUT_CLASS}
                />
              </div>

              {error ? (
                <p className="rounded-lg bg-[#FEF3EE] px-3 py-2 text-xs text-[#B85C33]">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeForm}>
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
