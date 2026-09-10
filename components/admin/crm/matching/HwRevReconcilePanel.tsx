"use client"

import { useCallback, useState } from "react"
import { ChevronDown, ChevronRight, PackageCheck } from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"
import { CRM_CACHE_SWR_MS } from "@/lib/crm/client-cache"
import { formatCNY, formatUSD } from "@/lib/crm/money-format"

// server-only 리포(hw-rev-reconcile)는 import 금지 — 응답 shape 로컬 선언.
type ReconcileStatus = "both" | "hw_only" | "rev_only"
type ReconcileRow = {
  accountKey: string
  name: string
  status: ReconcileStatus
  hwShippedQty: number
  hwPlannedQty: number
  hwNoLogisticsRows: number
  hwRevenueUSD: number
  lastOutboundDate: string | null
  hwProducts: string[]
  revCNY: number
  revRows: number
  revDealTypes: string[]
  hwOnlyMonths?: string[]
  revOnlyMonths?: string[]
}
type ReconcileResponse = {
  rows: ReconcileRow[]
  summary: {
    both: number
    hwOnly: number
    revOnly: number
    hwUnattributableRows: number
    grain?: "account_month" | "account"
    hwOnlyMonthCells?: number
  }
}

const STATUS_META: Record<ReconcileStatus, { label: string; className: string }> = {
  hw_only: { label: "출고만 · 매출 미기재?", className: "bg-[#B43E3E]/10 text-[#B43E3E]" },
  rev_only: { label: "매출만 · 출고 없음", className: "bg-[#A8741A]/10 text-[#A8741A]" },
  both: { label: "양쪽 존재", className: "bg-[#ECFDF5] text-[#084734]" },
}

const MAX_VISIBLE = 30

// 출고(USD)와 REV(CNY)는 통화가 달라 금액 비교를 하지 않는 "존재성 대사" v1 —
// 상세 규칙은 lib/repositories/hw-rev-reconcile.ts 주석 참조.
export default function HwRevReconcilePanel() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<ReconcileResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [showBoth, setShowBoth] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    adminFetchJsonCached<ReconcileResponse>("/api/admin/crm/reconcile/hw-rev", undefined, {
      cacheKey: "/api/admin/crm/reconcile/hw-rev",
      ttlMs: 90_000,
      staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
      onRevalidated: ({ data: fresh }) => {
        if (!fresh) return
        setData(fresh)
        setFailed(false)
      },
    })
      .then((d) => {
        setData(d)
        setFailed(!d)
        setLoading(false)
      })
      .catch(() => {
        setFailed(true)
        setLoading(false)
      })
  }, [])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && !data && !loading) load()
  }

  const visibleRows = (data?.rows ?? [])
    .filter((row) => (showBoth ? true : row.status !== "both"))
    .slice(0, MAX_VISIBLE)

  return (
    // 참조 표면(존재성 대사 검수) — 행동 표면(매칭 인박스)과의 톤차 위계(W2-6): 베이지로 가라앉힌다.
    <section className="mt-6 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#fafaf8]">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full flex-wrap items-center gap-2 px-5 py-4 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/40" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/40" />
        )}
        <PackageCheck className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/30" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">
          Reconcile
        </span>
        <span className="text-[13px] font-semibold text-[#111110]">출고 ↔ 매출 대사</span>
        <span className="text-[11px] text-[#1a1a1a]/40">
          HW 출고 시트와 REV 원장을 계정 키로 대조 — 출고했는데 매출 미기재인 곳을 찾습니다
        </span>
        {data ? (
          <span className="ml-auto flex items-center gap-1.5 text-[11px]">
            <span className="rounded-full bg-[#B43E3E]/10 px-2 py-0.5 font-semibold text-[#B43E3E]">
              출고만 {data.summary.hwOnly}
            </span>
            <span className="rounded-full bg-[#A8741A]/10 px-2 py-0.5 font-semibold text-[#A8741A]">
              매출만 {data.summary.revOnly}
            </span>
            <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 font-medium text-[#1a1a1a]/55">
              양쪽 {data.summary.both}
            </span>
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="border-t border-[rgba(0,0,0,0.08)] px-5 py-4">
          {loading ? (
            <p className="text-[12px] text-[#1a1a1a]/45">대사 계산 중...</p>
          ) : failed ? (
            <p className="text-[12px] text-[#B43E3E]">대사 결과를 불러오지 못했습니다. 새로고침 후 다시 시도하세요.</p>
          ) : data ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#1a1a1a]/45">
                <span>
                  통화가 달라(출고 $, 원장 ¥) 금액 비교 없이 <b className="text-[#1a1a1a]/65">존재성만</b> 대조합니다.
                  배송예정·물류번호 누락은 실출고와 구분 표기.
                </span>
                {data.summary.grain === "account_month" ? (
                  <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 font-medium text-[#084734]" title="v_hardware_rev_matches 뷰 기반 — 계정×월 단위로 출고월에 매출이 없는 달까지 짚습니다">
                    계정×월 그레인{typeof data.summary.hwOnlyMonthCells === "number" ? ` · 매출 미기재 의심 ${data.summary.hwOnlyMonthCells}개월` : ""}
                  </span>
                ) : (
                  <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 font-medium text-[#1a1a1a]/45" title="계정×월 뷰 마이그레이션(20260710) 적용 전 — 계정 단위로만 대조 중">
                    계정 그레인(뷰 적용 대기)
                  </span>
                )}
                {data.summary.hwUnattributableRows > 0 ? (
                  <span className="text-[#A8741A]">
                    설치처(고객명) 미지정 출고 {data.summary.hwUnattributableRows}행은 대사 불가
                  </span>
                ) : null}
                <label className="ml-auto flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={showBoth}
                    onChange={(e) => setShowBoth(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[#084734]"
                  />
                  양쪽 존재 계정도 표시
                </label>
              </div>

              {visibleRows.length === 0 ? (
                <p className="text-[12px] text-[#1a1a1a]/45">불일치 계정이 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-[rgba(0,0,0,0.08)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]/35">
                        <th className="py-2 pr-3">계정</th>
                        <th className="py-2 pr-3">판정</th>
                        <th className="py-2 pr-3 text-right">실출고</th>
                        <th className="py-2 pr-3 text-right">예정</th>
                        <th className="py-2 pr-3 text-right">출고매출($)</th>
                        <th className="py-2 pr-3 text-right">REV(¥)</th>
                        <th className="py-2 pr-3">딜 유형</th>
                        <th className="py-2">최근 출고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => {
                        const meta = STATUS_META[row.status]
                        return (
                          <tr key={row.accountKey} className="border-b border-[rgba(0,0,0,0.05)]">
                            <td className="max-w-[260px] py-2 pr-3 font-medium text-[#111110]">
                              <span className="block truncate" title={row.hwProducts.join(", ")}>
                                {row.name}
                                {row.hwNoLogisticsRows > 0 ? (
                                  <span className="ml-1.5 text-[10px] text-[#A8741A]" title="물류번호 누락 행 포함">
                                    물류No 누락 {row.hwNoLogisticsRows}
                                  </span>
                                ) : null}
                              </span>
                              {row.hwOnlyMonths?.length ? (
                                <span className="mt-0.5 block truncate text-[10px] tabular-nums text-[#B43E3E]" title={`출고는 있는데 그 달 REV HW 매출이 없는 월: ${row.hwOnlyMonths.join(", ")}`}>
                                  매출 미기재 의심 월 {row.hwOnlyMonths.join(" · ")}
                                </span>
                              ) : null}
                            </td>
                            <td className="py-2 pr-3">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
                                {meta.label}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">{row.hwShippedQty || "-"}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-[#1a1a1a]/45">
                              {row.hwPlannedQty || "-"}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {row.hwRevenueUSD ? formatUSD(row.hwRevenueUSD) : "-"}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {row.revCNY ? formatCNY(row.revCNY) : "-"}
                            </td>
                            <td className="py-2 pr-3 text-[#1a1a1a]/55">{row.revDealTypes.join(", ") || "-"}</td>
                            <td className="py-2 tabular-nums text-[#1a1a1a]/55">{row.lastOutboundDate ?? "-"}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {(data.rows.filter((r) => (showBoth ? true : r.status !== "both")).length) > MAX_VISIBLE ? (
                    <p className="mt-2 text-[11px] text-[#1a1a1a]/40">상위 {MAX_VISIBLE}건만 표시합니다.</p>
                  ) : null}
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
