"use client"

// 하드웨어 승인 대기 — 견적이 승인된 하드웨어 오더를 이왕찬·지사장(hardware.finalize)이 승인·반려한다.
// 승인하면 서버가 오더번호(ORD-YYMM-NNN)를 붙이고 견적 줄마다 배송 예정을 만든다.
// docs/active/hardware-order-revenue-link-plan-2026-10-22.md §4-3.
//
// 읽기는 하드웨어 편집 역할 전원, 버튼은 viewer.canApprove 일 때만 — 강제는 서버 게이트다.
// 테이블 미적용(503)이면 안내 한 줄로 강등한다.
//
// "시트 확인"(§4-4): 오더 기능을 쓰기 시작한 뒤 시트에 적힌 고객 출고 중 오더번호가 없거나 승인 안 된 번호인 줄.
// 과도기에는 시트 출고가 앱 승인을 우회할 수 있어 이 목록이 승인 규칙을 지키는 장치다.
import { memo, useCallback, useEffect, useState } from "react"
import { Check, ChevronDown, ExternalLink, RefreshCw, X } from "lucide-react"

import { adminFetch, adminFetchJson } from "@/lib/admin-client"
import { summarizeSalesOrderProducts, type SalesOrder } from "@/lib/orders/order-lines"
import {
  SHEET_ORDER_CHECK_LABELS,
  type SalesOrderFulfillmentLine,
  type SheetOrderCheck,
} from "@/lib/orders/sheet-order-check"
import { formatCurrency, formatDate, formatNumber } from "./shared"

type OrderFilter = "pending" | "approved" | "closed" | "sheet"
type OrderView = SalesOrder & { fulfillment?: SalesOrderFulfillmentLine[] }

interface OrderApprovalSectionProps {
  /** 승인으로 배송 예정이 생기면 부모가 원장을 다시 받는다(HardwareInventoryClient의 refresh). */
  onChanged: () => void | Promise<void>
}

const FILTERS: Array<{ key: OrderFilter; label: string }> = [
  { key: "pending", label: "승인 대기" },
  { key: "approved", label: "승인됨" },
  { key: "closed", label: "반려·취소" },
  { key: "sheet", label: "시트 확인" },
]

const SECTION_CARD_CLASS = "rounded-lg border border-[rgba(0,0,0,0.08)] bg-white"
const GHOST_BUTTON_CLASS =
  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:pointer-events-none disabled:opacity-50"
const PRIMARY_BUTTON_CLASS =
  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#084734] bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#0B5C43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:pointer-events-none disabled:opacity-50"
const DANGER_BUTTON_CLASS =
  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#B43E3E] bg-white px-3 text-[12px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B43E3E]/40 disabled:pointer-events-none disabled:opacity-50"

function formatDateTime(value: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16)
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

function statusLabel(order: SalesOrder) {
  if (order.status === "pending_approval") return "승인 대기"
  if (order.status === "approved") return order.needsHardwareApproval ? "승인됨" : "자동 승인(하드웨어 없음)"
  if (order.status === "rejected") return "반려"
  return "취소"
}

function OrderApprovalSection({ onChanged }: OrderApprovalSectionProps) {
  const [expanded, setExpanded] = useState(true)
  const [filter, setFilter] = useState<OrderFilter>("pending")
  const [orders, setOrders] = useState<OrderView[]>([])
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [sheetChecks, setSheetChecks] = useState<SheetOrderCheck[]>([])
  const [sheetSince, setSheetSince] = useState<string | null>(null)
  const [sheetCount, setSheetCount] = useState<number | null>(null)
  const [canApprove, setCanApprove] = useState(false)
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  // 반려·취소는 사유가 필수다 — 누르면 그 줄에 사유 칸이 열린다.
  const [reasonFor, setReasonFor] = useState<{ id: string; action: "reject" | "cancel" } | null>(null)
  const [reason, setReason] = useState("")

  const loadSheetChecks = useCallback(async (showLoading: boolean) => {
    if (showLoading) {
      setLoading(true)
      setListError(null)
    }
    try {
      const response = await adminFetch("/api/admin/hardware/orders/sheet-check")
      const body = (await response.json().catch(() => null)) as {
        since?: string | null
        checks?: SheetOrderCheck[]
        viewer?: { canApprove?: boolean }
        error?: string
        available?: boolean
      } | null
      if (!response.ok) {
        if (body?.available === false) {
          setUnavailable(body.error ?? "오더 기능은 DB 업데이트 적용 후 사용할 수 있습니다.")
          return
        }
        throw new Error(body?.error ?? `${response.status} ${response.statusText}`.trim())
      }
      setSheetChecks(body?.checks ?? [])
      setSheetSince(body?.since ?? null)
      setSheetCount((body?.checks ?? []).length)
      setCanApprove(body?.viewer?.canApprove === true)
    } catch (err) {
      if (showLoading) setListError(err instanceof Error ? err.message : String(err))
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  const load = useCallback(async (nextFilter: OrderFilter) => {
    if (nextFilter === "sheet") {
      await loadSheetChecks(true)
      return
    }
    setLoading(true)
    setListError(null)
    try {
      const response = await adminFetch(`/api/admin/hardware/orders?status=${nextFilter}`)
      const body = (await response.json().catch(() => null)) as {
        orders?: OrderView[]
        viewer?: { canApprove?: boolean }
        error?: string
        available?: boolean
      } | null
      if (!response.ok) {
        if (body?.available === false) {
          setUnavailable(body.error ?? "오더 기능은 DB 업데이트 적용 후 사용할 수 있습니다.")
          return
        }
        throw new Error(body?.error ?? `${response.status} ${response.statusText}`.trim())
      }
      setUnavailable(null)
      const nextOrders = body?.orders ?? []
      setOrders(nextOrders)
      setCanApprove(body?.viewer?.canApprove === true)
      if (nextFilter === "pending") setPendingCount(nextOrders.length)
      setRowErrors({})
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [loadSheetChecks])

  useEffect(() => {
    void load(filter)
  }, [filter, load])

  // 시트 확인 건수는 탭을 열기 전에도 배지로 보인다 — 처음 한 번만 조용히 센다.
  useEffect(() => {
    void loadSheetChecks(false)
  }, [loadSheetChecks])

  const act = async (order: SalesOrder, action: "approve" | "reject" | "cancel", actionReason?: string) => {
    setBusyId(order.id)
    setNotice(null)
    setRowErrors((current) => {
      const next = { ...current }
      delete next[order.id]
      return next
    })
    try {
      const result = await adminFetchJson<{ order: SalesOrder }>(`/api/admin/hardware/orders/${order.id}`, {
        method: "POST",
        body: JSON.stringify({ action, ...(actionReason ? { reason: actionReason } : {}) }),
      })
      const updated = result.order
      if (action === "approve") {
        const plannedLines = updated.plannedMovementIds.length
        setNotice(
          `${updated.customerName} · 오더 ${updated.orderNo ?? ""} 승인 — ${
            plannedLines > 0 ? `배송 예정 ${formatNumber(plannedLines)}줄을 만들었습니다.` : "재고 품목을 못 찾은 줄은 배송 예정을 직접 등록하세요."
          }`
        )
      } else if (action === "reject") {
        setNotice(`${updated.customerName} 오더를 반려했습니다.`)
      } else {
        setNotice(`오더 ${updated.orderNo ?? ""}를 취소하고 남은 배송 예정을 정리했습니다.`)
      }
      setReasonFor(null)
      setReason("")
      await load(filter)
      // 승인은 배송 예정을, 취소는 예정 정리를 원장에 남긴다 — 반려는 원장을 건드리지 않는다.
      if (action !== "reject") await onChanged()
    } catch (err) {
      setRowErrors((current) => ({ ...current, [order.id]: err instanceof Error ? err.message : String(err) }))
    } finally {
      setBusyId(null)
    }
  }

  if (unavailable) {
    return (
      <section className={`${SECTION_CARD_CLASS} px-4 py-3`}>
        <p className="text-[13px] font-bold text-[#111110]">하드웨어 승인 대기</p>
        <p className="mt-0.5 text-[11.5px] font-semibold text-[#A39E98]">{unavailable}</p>
      </section>
    )
  }

  return (
    <section className={SECTION_CARD_CLASS} aria-labelledby="hardware-order-approval-title">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
      >
        <span className="min-w-0">
          <span id="hardware-order-approval-title" className="block text-[13px] font-bold text-[#111110]">
            하드웨어 승인 대기
            {pendingCount != null ? (
              <span
                className={`ml-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                  pendingCount > 0 ? "bg-[#FBF1E0] text-[#7A520F]" : "bg-[#F6F5F4] text-[#615D59]"
                }`}
              >
                {formatNumber(pendingCount)}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-[11.5px] text-[#615D59]">
            견적이 승인된 하드웨어 오더입니다. 이왕찬·지사장이 승인하면 오더번호와 배송 예정이 생깁니다.
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#A39E98] transition ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded ? (
        <div className="border-t border-[rgba(0,0,0,0.06)] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="tablist" aria-label="오더 상태" className="inline-flex rounded-md border border-[rgba(0,0,0,0.08)] p-0.5">
              {FILTERS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === option.key}
                  onClick={() => setFilter(option.key)}
                  className={`min-h-8 cursor-pointer rounded px-3 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 ${
                    filter === option.key ? "bg-[#111110] text-white" : "text-[#615D59] hover:bg-[#F6F5F4]"
                  }`}
                >
                  {option.label}
                  {option.key === "sheet" && sheetCount ? (
                    <span className="ml-1 tabular-nums text-[#A8741A]">{formatNumber(sheetCount)}</span>
                  ) : null}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void load(filter)} disabled={loading} className={GHOST_BUTTON_CLASS}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              다시 조회
            </button>
          </div>

          {!canApprove ? (
            <p className="mt-2 text-[11.5px] font-semibold text-[#A8741A]">
              승인·반려는 이왕찬·지사장 계정만 할 수 있습니다 — 목록은 누구나 볼 수 있습니다.
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="mt-2 rounded-md border border-[#BDEFD8] bg-[#ECFDF5] px-3 py-2 text-[12px] font-semibold text-[#084734]">
              {notice}
            </p>
          ) : null}
          {listError ? (
            <p role="alert" className="mt-2 rounded-md border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[12px] font-semibold text-[#8F2C2C]">
              {listError}
            </p>
          ) : null}
          {filter === "sheet" ? (
            <SheetCheckList checks={sheetChecks} since={sheetSince} loading={loading} hasError={Boolean(listError)} />
          ) : null}

          {filter !== "sheet" && loading && orders.length === 0 ? (
            <p className="mt-3 text-[12px] font-semibold text-[#A39E98]">불러오는 중…</p>
          ) : null}
          {filter !== "sheet" && !loading && orders.length === 0 && !listError ? (
            <p className="mt-3 text-[12px] font-semibold text-[#A39E98]">
              {filter === "pending" ? "승인을 기다리는 하드웨어 오더가 없습니다." : "해당하는 오더가 없습니다."}
            </p>
          ) : null}

          <ul className={`mt-2 divide-y divide-[rgba(0,0,0,0.06)] ${filter === "sheet" ? "hidden" : ""}`}>
            {orders.map((order) => {
              const products = summarizeSalesOrderProducts(order.lines)
              const unmapped = order.lines.filter((line) => line.unmappedHardware)
              const busy = busyId === order.id
              const askingReason = reasonFor?.id === order.id ? reasonFor.action : null
              const rowError = rowErrors[order.id]
              return (
                <li key={order.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-[#111110]">
                        <span className="truncate">{order.customerName}</span>
                        {order.orderNo ? (
                          <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 font-mono text-[11px] font-bold text-[#084734]">
                            {order.orderNo}
                          </span>
                        ) : null}
                        <span className="rounded-full bg-[#F6F5F4] px-2 py-0.5 text-[10.5px] font-bold text-[#615D59]">
                          {statusLabel(order)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-[#615D59]">
                        견적 {order.quoteNumber ?? "-"} · {order.acceptedVia === "customer_link" ? "고객이 링크에서 승인" : "담당자가 승인 처리"} ·{" "}
                        {formatDateTime(order.requestedAt)}
                        {order.totalAmount != null ? ` · ${formatCurrency(order.totalAmount, "KRW")}` : ""}
                      </p>
                      <p className="mt-1.5 flex flex-wrap gap-1.5">
                        {products.map((entry) => (
                          <span
                            key={entry.product}
                            className="rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FBFAF9] px-2 py-0.5 text-[11.5px] font-bold text-[#31302E]"
                          >
                            {entry.product} <span className="tabular-nums">×{formatNumber(entry.quantity)}</span>
                          </span>
                        ))}
                        {unmapped.map((line) => (
                          <span
                            key={line.quoteLineRef}
                            className="rounded-md border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 text-[11.5px] font-bold text-[#7A520F]"
                            title="재고 품목을 못 찾아 배송 예정에 들어가지 않습니다. 승인 뒤 직접 등록하세요."
                          >
                            품목 확인 필요: {line.itemName} ×{formatNumber(line.quantity)}
                          </span>
                        ))}
                      </p>
                      {order.fulfillment?.length ? (
                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-[#615D59]">
                          {order.fulfillment.map((line) => (
                            <span key={line.product} className="tabular-nums">
                              <span className="font-bold text-[#31302E]">{line.product}</span> 출고 {formatNumber(line.shipped)}/
                              {formatNumber(line.ordered)}
                              {line.planned > 0 ? ` · 예정 ${formatNumber(line.planned)}` : ""}
                            </span>
                          ))}
                        </p>
                      ) : null}
                      {order.decidedBy || order.decisionReason ? (
                        <p className="mt-1 text-[11.5px] text-[#615D59]">
                          {order.decidedBy ? `${order.decidedBy} · ${formatDateTime(order.decidedAt)}` : ""}
                          {order.decisionReason ? ` · ${order.decisionReason}` : ""}
                        </p>
                      ) : null}
                      {rowError ? (
                        <p role="alert" className="mt-1 text-[11.5px] font-semibold text-[#8F2C2C]">
                          {rowError}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <a href={`/admin/quotes/${order.quoteDocumentId}/view`} className={GHOST_BUTTON_CLASS} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        견적
                      </a>
                      {canApprove && order.status === "pending_approval" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void act(order, "approve")}
                            disabled={busy || busyId != null}
                            className={PRIMARY_BUTTON_CLASS}
                          >
                            <Check className="h-3.5 w-3.5" />
                            {busy && !askingReason ? "승인 중…" : "승인"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReasonFor({ id: order.id, action: "reject" })
                              setReason("")
                            }}
                            disabled={busy || busyId != null}
                            className={DANGER_BUTTON_CLASS}
                          >
                            <X className="h-3.5 w-3.5" />
                            반려
                          </button>
                        </>
                      ) : null}
                      {canApprove && order.status === "approved" && order.needsHardwareApproval ? (
                        <button
                          type="button"
                          onClick={() => {
                            setReasonFor({ id: order.id, action: "cancel" })
                            setReason("")
                          }}
                          disabled={busy || busyId != null}
                          className={DANGER_BUTTON_CLASS}
                        >
                          <X className="h-3.5 w-3.5" />
                          오더 취소
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {askingReason ? (
                    <form
                      className="mt-2 flex flex-wrap items-center gap-1.5"
                      onSubmit={(event) => {
                        event.preventDefault()
                        if (!reason.trim()) return
                        void act(order, askingReason, reason.trim())
                      }}
                    >
                      <label htmlFor={`order-reason-${order.id}`} className="sr-only">
                        {askingReason === "reject" ? "반려 사유" : "취소 사유"}
                      </label>
                      <input
                        id={`order-reason-${order.id}`}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder={askingReason === "reject" ? "반려 사유(예: 재고 부족, 단가 확인 필요)" : "취소 사유(예: 고객 취소)"}
                        className="min-h-9 min-w-0 flex-1 rounded-md border border-[rgba(0,0,0,0.12)] px-3 text-[12px] text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                      />
                      <button type="submit" disabled={busy || !reason.trim()} className={DANGER_BUTTON_CLASS}>
                        {busy ? "처리 중…" : askingReason === "reject" ? "반려 확정" : "취소 확정"}
                      </button>
                      <button type="button" onClick={() => setReasonFor(null)} disabled={busy} className={GHOST_BUTTON_CLASS}>
                        닫기
                      </button>
                      {askingReason === "cancel" ? (
                        <p className="w-full text-[11px] text-[#615D59]">
                          아직 배송 예정인 줄만 정리합니다. 이미 출고 확정된 줄이 있으면 취소되지 않습니다. 오더번호는 다시 쓰지 않습니다.
                        </p>
                      ) : null}
                    </form>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function SheetCheckList({
  checks,
  since,
  loading,
  hasError,
}: {
  checks: SheetOrderCheck[]
  since: string | null
  loading: boolean
  hasError: boolean
}) {
  if (loading && checks.length === 0) {
    return <p className="mt-3 text-[12px] font-semibold text-[#A39E98]">불러오는 중…</p>
  }
  if (hasError) return null
  return (
    <div className="mt-2">
      <p className="text-[11.5px] text-[#615D59]">
        {since
          ? `${since} 이후 시트 '3.출고 현황'에 적힌 고객 출고 중 오더와 맞지 않는 줄입니다. 오더번호 열(N열 이후)에 승인된 오더번호를 적으면 다음 가져오기에서 사라집니다.`
          : "아직 만들어진 오더가 없어 확인할 줄이 없습니다. 첫 오더가 생긴 날부터 시트 출고 줄을 대조합니다."}
      </p>
      {since && checks.length === 0 ? (
        <p className="mt-3 text-[12px] font-semibold text-[#A39E98]">오더와 어긋난 시트 출고 줄이 없습니다.</p>
      ) : null}
      <ul className="mt-2 divide-y divide-[rgba(0,0,0,0.06)]">
        {checks.map((check) => (
          <li key={`${check.kind}:${check.row.id}`} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-[#111110]">
                <span className="truncate">{check.row.customer ?? "고객 미상"}</span>
                <span className="text-[#A39E98]">·</span>
                <span className="truncate">{check.row.productName}</span>
                <span className="tabular-nums text-[#615D59]">{formatNumber(check.row.quantity)}대</span>
                <span className="rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 text-[10.5px] font-bold text-[#7A520F]">
                  {SHEET_ORDER_CHECK_LABELS[check.kind]}
                </span>
              </p>
              <p className="mt-0.5 text-[11.5px] text-[#615D59]">
                {check.row.occurredAt ? formatDate(check.row.occurredAt) : "날짜 없음"}
                {check.row.status ? ` · ${check.row.status}` : ""}
                {check.row.orderNoRaw ? ` · 시트 오더번호 ${check.row.orderNoRaw}` : ""}
              </p>
              <p className="mt-0.5 text-[11.5px] font-semibold text-[#7A520F]">{check.message}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default memo(OrderApprovalSection)
