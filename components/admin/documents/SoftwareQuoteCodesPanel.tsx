"use client"

import React, { useEffect, useMemo, useState } from "react"
import { AlertCircle, Ban, Check, Copy, Link2, Loader2, Plus, RotateCcw, Ticket, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { adminFetch } from "@/lib/admin-client"
import { BUSINESS_RECHARGE, formatRechargeKrw } from "@/lib/billing/recharge"
import { CODE_QUEUE_GROUPS, getCodeDaysLeft, getCodeQueueKey, groupCodes, type CodeQueueKey } from "./document-queues"
import {
  DANGER_GHOST_BUTTON,
  GHOST_BUTTON,
  NextActionBox,
  NoMatch,
  OUTLINE_STRONG_BUTTON,
  QueueEmptyState,
  QueueGroupHeader,
  QueueLayout,
  QueueListItem,
  QueueLoading,
  QueueTimeline,
  QueueToolbar,
  SOLID_BUTTON,
  formatDay,
  formatMan,
} from "./queue-ui"

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

function formatShortAmount(code: QuoteCodeRow) {
  if (code.kind === "subscription") return formatUsd(code.amountUsd)
  const amount = toNumber(code.amountKrw)
  return amount == null ? "-" : formatMan(amount)
}

function checkoutUrl(code: string) {
  return `${window.location.origin}/checkout?mode=business&quote=${encodeURIComponent(code)}`
}

export default function SoftwareQuoteCodesPanel() {
  const [codes, setCodes] = useState<QuoteCodeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<"detail" | "new">("detail")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  // 다음 할 일 묶음: 만료 임박(7일) → 결제 대기 → 사용됨 → 만료.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const visible = q
      ? codes.filter((code) =>
          [code.code, code.organizationName, code.buyerName, code.buyerEmail].some((value) =>
            String(value ?? "").toLowerCase().includes(q)
          )
        )
      : codes
    return groupCodes(visible)
  }, [codes, query])

  const visibleCodes = groups.flatMap((group) => group.items)
  const current = visibleCodes.find((code) => code.id === selectedId) ?? visibleCodes[0] ?? null

  const load = async () => {
    setLoading(true)
    setLoadError(null)

    try {
      const response = await adminFetch("/api/admin/software-quote-codes")

      if (response.ok) {
        const payload = (await response.json()) as { codes?: QuoteCodeRow[] }
        setCodes(payload.codes ?? [])
      } else {
        const payloadErr = (await response.json().catch(() => ({}))) as { error?: string }
        setLoadError(payloadErr.error ?? "코드 목록을 불러오지 못했습니다.")
      }
    } catch {
      setLoadError("코드 목록을 불러오지 못했습니다.")
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

  function openNewForm(prefill = EMPTY_FORM) {
    setForm(prefill)
    setError(null)
    setMode("new")
  }

  function handleAddKrw(delta: number) {
    const current = Number.parseInt(form.amountKrw.replace(/[^0-9]/g, ""), 10) || 0
    const next = Math.max(BUSINESS_RECHARGE.baseMinKrw, current + delta)
    setForm((prev) => ({ ...prev, amountKrw: String(Math.min(BUSINESS_RECHARGE.maxKrw, next)) }))
  }

  function handleSetPresetKrw(val: number) {
    setForm((prev) => ({ ...prev, amountKrw: String(val) }))
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

      const created = (await response.json().catch(() => null)) as { code?: { id?: string; code?: string } } | null
      if (created?.code?.id) setSelectedId(created.code.id)
      if (created?.code?.code) setNotice({ tone: "success", message: `코드 ${created.code.code} 를 발급했습니다.` })
      setMode("detail")
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
      setNotice({ tone: "error", message: payloadErr.error ?? "코드 삭제에 실패했습니다." })
      return
    }

    setNotice({ tone: "success", message: "코드가 삭제되었습니다." })
    await load()
  }

  function copyCheckoutUrl(code: string, kind: QuoteCodeKind) {
    if (typeof window === "undefined") return

    if (kind === "subscription") {
      setNotice({
        tone: "error",
        message: "구독형 견적 코드는 셀프서브 결제가 지원되지 않으며, 견적서·계약서 기반 청구 대상입니다.",
      })
      return
    }

    const url = checkoutUrl(code)

    void navigator.clipboard
      .writeText(url)
      .then(() => {
        setNotice({ tone: "success", message: `결제 링크가 복사되었습니다: ${url}` })
      })
      .catch(() => {
        window.prompt("다음 URL을 복사하세요.", url)
      })
  }

  function copyCode(code: string) {
    void navigator.clipboard
      .writeText(code)
      .then(() => {
        setNotice({ tone: "success", message: `코드 ${code} 가 복사되었습니다.` })
      })
      .catch(() => {
        window.prompt("다음 코드를 복사하세요.", code)
      })
  }

  const closeForm = () => {
    setMode("detail")
    resetForm()
  }

  function reissue(code: QuoteCodeRow) {
    openNewForm({
      kind: code.kind,
      amountKrw: String(toNumber(code.amountKrw) ?? BUSINESS_RECHARGE.baseMinKrw),
      amountUsd: code.amountUsd == null ? "" : String(code.amountUsd),
      organizationName: code.organizationName ?? "",
      buyerName: code.buyerName ?? "",
      buyerEmail: code.buyerEmail ?? "",
      notes: code.notes ?? "",
      expiresAt: "",
    })
  }

  function getListStatus(code: QuoteCodeRow, key: CodeQueueKey) {
    const days = getCodeDaysLeft(code)
    switch (key) {
      case "soon":
        return { text: days ? `D-${days} 만료` : "오늘 만료", tone: "warn" as const }
      case "active":
        return { text: days != null ? `D-${days}` : "만료일 없음", tone: "neutral" as const }
      case "used":
        return { text: `결제 ${formatDay(code.redeemedAt) ?? ""}`, tone: "go" as const }
      default:
        return { text: `${formatDay(code.expiresAt) ?? ""} 만료`, tone: "muted" as const }
    }
  }

  function renderNextAction(code: QuoteCodeRow, key: CodeQueueKey) {
    const tone = CODE_QUEUE_GROUPS.find((group) => group.key === key)?.tone ?? "neutral"
    const days = getCodeDaysLeft(code)
    const business = code.kind === "business_recharge"
    const linkButton = (className: string) =>
      business ? (
        <button type="button" onClick={() => copyCheckoutUrl(code.code, code.kind)} className={className}>
          <Link2 className="h-3.5 w-3.5" />
          결제 링크 복사
        </button>
      ) : null

    switch (key) {
      case "soon":
        return (
          <NextActionBox
            tone={tone}
            label={days ? `만료 ${days}일 전` : "오늘 만료"}
            description={
              business
                ? "아직 결제 전 — 결제 링크를 다시 보내세요. 기한이 더 필요하면 같은 조건으로 새로 발급합니다."
                : "구독형은 셀프 결제가 없어 견적서·계약서로 청구합니다."
            }
          >
            {linkButton(SOLID_BUTTON)}
          </NextActionBox>
        )
      case "active":
        return (
          <NextActionBox
            tone={tone}
            label="결제 대기"
            description={
              business
                ? days != null
                  ? `만료까지 ${days}일 — 링크를 보낸 뒤 결제를 기다리는 중입니다.`
                  : "만료일 없이 결제를 기다리는 중입니다."
                : "구독형은 셀프 결제가 없어 견적서·계약서로 청구합니다."
            }
          >
            {linkButton(OUTLINE_STRONG_BUTTON)}
          </NextActionBox>
        )
      case "used":
        return (
          <NextActionBox
            tone={tone}
            label="결제 완료"
            description={`코드 사용됨${code.redeemedOrderId ? ` · 주문 ${code.redeemedOrderId}` : ""} — 증빙이 필요하면 영수증 탭에서 발행하세요.`}
          />
        )
      default:
        return (
          <NextActionBox tone={tone} label="만료됨" description="결제 없이 만료됐습니다 — 같은 조건으로 다시 발급할 수 있습니다.">
            <button type="button" onClick={() => reissue(code)} className={OUTLINE_STRONG_BUTTON}>
              <RotateCcw className="h-3.5 w-3.5" />
              같은 조건으로 재발급
            </button>
          </NextActionBox>
        )
    }
  }

  function renderDetail(code: QuoteCodeRow) {
    const key = getCodeQueueKey(code)
    const days = getCodeDaysLeft(code)
    const steps = [
      { label: "발급", done: true, detail: formatDay(code.createdAt) },
      {
        label: "고객 결제",
        done: key === "used",
        detail:
          key === "used"
            ? formatDay(code.redeemedAt)
            : key === "expired"
              ? "결제 없음"
              : days != null
                ? `D-${days} 남음`
                : "대기 중",
        warn: key === "soon",
      },
      {
        label: "사용 완료",
        done: key === "used",
        detail: key === "used" ? (code.redeemedOrderId ? `주문 ${code.redeemedOrderId}` : "완료") : null,
      },
    ]

    return (
      <section aria-live="polite" aria-label="코드 상세" className="flex min-w-0 flex-col gap-6 px-7 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-[#615D59]">
              {code.organizationName ?? "기관 미지정"} · {KIND_LABEL[code.kind]}
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="font-mono text-xl font-bold tracking-wide text-[#111110]">{code.code}</span>
              <button
                type="button"
                onClick={() => copyCode(code.code)}
                aria-label="코드 복사"
                title="코드 복사"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#615D59] hover:bg-[#f0f0ec] hover:text-[#111110]"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-[-0.02em] tabular-nums text-[#111110]">
              {code.kind === "business_recharge" ? formatKrw(code.amountKrw) : formatUsd(code.amountUsd)}
            </p>
            <p className="text-[11.5px] text-[#78736D]">
              {code.kind === "business_recharge" ? "ClassIn Business 충전" : "구독형 · 계약 청구"}
            </p>
          </div>
        </div>

        {renderNextAction(code, key)}

        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <QueueTimeline title="진행" steps={steps} />
          <div>
            <h3 className="mb-2 text-[11.5px] font-semibold text-[#78736D]">결제 링크</h3>
            {code.kind === "business_recharge" ? (
              <div className="flex items-center gap-1.5 rounded-md border border-[#e8e8e4] py-1 pl-3 pr-1">
                <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[#31302E]">{checkoutUrl(code.code)}</code>
                <button
                  type="button"
                  onClick={() => copyCheckoutUrl(code.code, code.kind)}
                  aria-label="결제 링크 복사"
                  title="결제 링크 복사"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[#615D59] hover:bg-[#f0f0ec] hover:text-[#111110]"
                >
                  <Link2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-[#78736D]">구독형 코드는 셀프 결제 링크가 없습니다 — 견적서·계약서로 청구합니다.</p>
            )}
            <dl className="mt-4 grid grid-cols-[72px_1fr] gap-x-2.5 gap-y-1.5 text-xs">
              <dt className="text-[#78736D]">구매자</dt>
              <dd className="text-[#31302E]">{code.buyerName ?? "—"}</dd>
              <dt className="text-[#78736D]">이메일</dt>
              <dd className="break-all text-[#31302E]">{code.buyerEmail ?? "—"}</dd>
              <dt className="text-[#78736D]">만료</dt>
              <dd className="text-[#31302E]">{code.expiresAt ? formatDate(code.expiresAt) : "만료일 없음"}</dd>
              <dt className="text-[#78736D]">발급</dt>
              <dd className="text-[#31302E]">{formatDate(code.createdAt)}</dd>
              <dt className="text-[#78736D]">메모</dt>
              <dd className="whitespace-pre-wrap text-[#31302E]">{code.notes?.trim() || "—"}</dd>
            </dl>
          </div>
        </div>

        {!code.redeemedAt && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[#f0f0ec] pt-4">
            {key !== "expired" && (
              <button type="button" onClick={() => void handleCancel(code.id)} className={GHOST_BUTTON}>
                <Ban className="h-3.5 w-3.5" />
                즉시 만료
              </button>
            )}
            <button type="button" onClick={() => void handleDelete(code.id)} className={DANGER_GHOST_BUTTON}>
              <Trash2 className="h-3.5 w-3.5" />
              삭제
            </button>
          </div>
        )}
      </section>
    )
  }

  function renderForm() {
    return (
      <section aria-label="코드 발급" className="max-w-xl px-7 py-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[#78736D]">/checkout 결제로 이어지는 1회성 코드</p>
            <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[#111110]">새 코드 발급</h2>
            <p className="mt-1 text-xs text-[#615D59]">
              충전형 코드는 /checkout 결제 화면에서 지정 금액으로 결제합니다. (구독형 코드는 견적서·계약서 참조용)
            </p>
          </div>
          <button
            type="button"
            onClick={closeForm}
            className="text-[#1a1a1a]/45 hover:text-[#1a1a1a]"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
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
                    ? "border-[#084734] font-semibold text-[#084734]"
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
            {/* 퀵 프리셋 및 증분 칩 */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-[#1a1a1a]/40 mr-0.5">빠른 선택:</span>
              {BUSINESS_RECHARGE.presetsKrw.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSetPresetKrw(p)}
                  className="rounded-md border border-[#e8e8e4] bg-white px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/70 hover:border-[#084734]/40 hover:text-[#084734]"
                >
                  {p >= 10_000_000 ? `${p / 10_000_000}천만` : `${p / 10_000}만`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleAddKrw(500_000)}
                className="rounded-md border border-[#e8e8e4] bg-white px-2 py-0.5 text-[11px] font-medium text-[#084734] hover:border-[#084734]/40"
              >
                +50만
              </button>
              <button
                type="button"
                onClick={() => handleAddKrw(1_000_000)}
                className="rounded-md border border-[#e8e8e4] bg-white px-2 py-0.5 text-[11px] font-medium text-[#084734] hover:border-[#084734]/40"
              >
                +100만
              </button>
            </div>
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
          <p className="rounded-lg border border-[#F2B8B8] px-3 py-2 text-xs text-[#B43E3E]">
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
      </section>
    )
  }

  const issueButton = (
    <button
      type="button"
      onClick={() => openNewForm()}
      aria-pressed={mode === "new"}
      className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[#084734] bg-white px-3 text-[12.5px] font-semibold text-[#084734] transition-colors hover:bg-[#F6F5F2]"
    >
      <Plus className="h-3.5 w-3.5" />
      코드 발급
    </button>
  )

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:px-6 sm:py-5">
      {notice && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-lg border bg-white px-4 py-3 text-sm ${
            notice.tone === "success" ? "border-[#084734]/30 text-[#084734]" : "border-[#F2B8B8] text-[#B43E3E]"
          }`}
        >
          {notice.tone === "success" ? <Check className="mt-0.5 h-4 w-4" /> : <AlertCircle className="mt-0.5 h-4 w-4" />}
          <span className="flex-1 break-all">{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-current opacity-60 hover:opacity-100"
            aria-label="알림 닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loadError && codes.length === 0 && mode !== "new" ? (
        <QueueEmptyState
          icon={<AlertCircle className="h-5 w-5 text-[#B43E3E]" />}
          title="코드 목록을 불러오지 못했습니다."
          description={loadError}
          action={
            <button type="button" onClick={() => void load()} className={GHOST_BUTTON}>
              다시 시도
            </button>
          }
        />
      ) : loading && codes.length === 0 && mode !== "new" ? (
        <QueueLoading label="코드를 불러오는 중입니다." />
      ) : codes.length === 0 && mode !== "new" ? (
        <QueueEmptyState
          icon={<Ticket className="h-5 w-5" />}
          title="발급된 코드가 없습니다."
          description="코드를 발급하면 결제 링크가 만들어지고, 만료가 가까운 코드부터 위로 정리됩니다."
          action={
            <button type="button" onClick={() => openNewForm()} className={SOLID_BUTTON}>
              <Plus className="h-3.5 w-3.5" />
              첫 코드 발급
            </button>
          }
        />
      ) : (
        <QueueLayout
          label="상태별 코드"
          list={
            <>
              <QueueToolbar
                query={query}
                onQueryChange={setQuery}
                placeholder="코드, 기관, 이메일"
                loading={loading}
                onRefresh={() => void load()}
                action={issueButton}
              />
              {codes.length === 0 ? (
                <p className="px-6 py-12 text-center text-xs text-[#78736D]">아직 발급한 코드가 없습니다.</p>
              ) : groups.length === 0 ? (
                <NoMatch label="조건에 맞는 코드가 없습니다." onReset={() => setQuery("")} />
              ) : (
                groups.map((group) => (
                  <section key={group.key} className="border-b border-[#f0f0ec] pb-1.5 last:border-b-0">
                    <QueueGroupHeader tone={group.tone} label={group.label} count={group.items.length} />
                    {group.items.map((code) => {
                      const status = getListStatus(code, group.key)
                      return (
                        <QueueListItem
                          key={code.id}
                          selected={mode === "detail" && code.id === current?.id}
                          onSelect={() => {
                            setSelectedId(code.id)
                            setMode("detail")
                          }}
                          title={code.organizationName ?? "기관 미지정"}
                          subtitle={KIND_LABEL[code.kind]}
                          amount={formatShortAmount(code)}
                          mono={code.code}
                          status={status.text}
                          statusTone={status.tone}
                        />
                      )
                    })}
                  </section>
                ))
              )}
            </>
          }
          detail={
            mode === "new" ? (
              renderForm()
            ) : current ? (
              renderDetail(current)
            ) : (
              <p className="px-7 py-16 text-center text-sm text-[#78736D]">왼쪽에서 코드를 고르세요.</p>
            )
          }
        />
      )}
    </div>
  )
}
