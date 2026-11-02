"use client"

// 판매대시보드 — FY 품목 × 월 "설치 완료 / +배송 예정"(정의서). 숫자는 서버 집계
// (/api/admin/hardware/sales-dashboard)만 쓴다. 예전 홈 "판매 · 설치" 카드는 브라우저가 최근 2,000건으로
// 셌다 — 원장이 커지면 FY 합계가 조용히 줄었다.
import { memo, useEffect, useMemo, useState } from "react"

import { adminFetchJson } from "@/lib/admin-client"
import type { HardwareSalesDashboard } from "@/lib/repositories/hardware-sales-dashboard"

import {
  buildSalesDashboardRows,
  salesDashboardColumns,
  salesDashboardHeadline,
  salesFyLabel,
  salesFyOptions,
  type SalesDashboardCellView,
  type SalesDashboardTableRow,
} from "./sales-dashboard-view"

interface SalesDashboardSectionProps {
  /** 바뀌면 다시 받는다 — 부모 원장이 새로 고쳐질 때(기록·확정 직후) 같이 맞춘다. */
  reloadKey?: unknown
  /** 고객사·기간별 상세(입출고 탭 "출고 · 기간 집계")로 가기. */
  onOpenDetail?: () => void
}

function Cell({ cell, strong }: { cell: SalesDashboardCellView; strong?: boolean }) {
  if (cell.empty && !cell.installed) return <span className="text-[#D4D0CB]">·</span>
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className="whitespace-nowrap">
        <span className={strong ? "font-bold text-[#111110]" : "font-semibold text-[#31302E]"}>{cell.installed || "0"}</span>
        {cell.planned && <span className="ml-1 font-semibold text-[#B45309]">/ {cell.planned}</span>}
      </span>
      {cell.returned && <span className="whitespace-nowrap text-[10px] font-semibold text-[#A39E98]">{cell.returned}</span>}
    </span>
  )
}

const ROW_CLASS: Record<SalesDashboardTableRow["kind"], string> = {
  item: "bg-white",
  subtotal: "bg-[#F6F5F4]",
  grand: "bg-[#EEF4F1]",
}

function SalesDashboardSection({ reloadKey, onOpenDetail }: SalesDashboardSectionProps) {
  const [fy, setFy] = useState<number | null>(null)
  const [dashboard, setDashboard] = useState<HardwareSalesDashboard | null>(null)
  // 마지막으로 끝난 요청(성공·실패) — 지금 요청과 다르면 불러오는 중이다(effect 안에서 setState 하지 않는다).
  const [settled, setSettled] = useState<{ fy: number | null; reloadKey: unknown; error: string | null } | null>(null)
  const loading = !settled || settled.fy !== fy || settled.reloadKey !== reloadKey
  const error = loading ? null : settled.error

  useEffect(() => {
    let cancelled = false
    const query = fy == null ? "" : `?fy=${fy}`
    adminFetchJson<HardwareSalesDashboard>(`/api/admin/hardware/sales-dashboard${query}`)
      .then((result) => {
        if (cancelled) return
        setDashboard(result)
        setSettled({ fy, reloadKey, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setSettled({ fy, reloadKey, error: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [fy, reloadKey])

  const view = useMemo(() => {
    if (!dashboard) return null
    return {
      columns: salesDashboardColumns(dashboard.months, new Date()),
      rows: buildSalesDashboardRows(dashboard),
      headline: salesDashboardHeadline(dashboard),
      fyOptions: salesFyOptions(dashboard.availableFys, dashboard.currentFy),
    }
  }, [dashboard])

  const selectedFy = fy ?? dashboard?.fy ?? null

  return (
    <section className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
        <div className="min-w-0">
          <p className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">판매대시보드</p>
          <p className="mt-1 text-[12px] text-[#615D59]">
            세일즈·프로모션 출고(A/S·샘플·내부 이동 제외) · 칸 = 설치 완료 <span className="font-semibold text-[#B45309]">/ +배송 예정</span> · 회수는 빼지 않고 따로 표시
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="hardware-sales-fy">회계연도</label>
          <select
            id="hardware-sales-fy"
            value={selectedFy ?? ""}
            onChange={(event) => setFy(Number(event.target.value))}
            disabled={!view}
            className="min-h-9 cursor-pointer rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 text-[12px] font-bold text-[#31302E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:opacity-50"
          >
            {(view?.fyOptions ?? (selectedFy != null ? [selectedFy] : [])).map((option) => (
              <option key={option} value={option}>{salesFyLabel(option)}</option>
            ))}
          </select>
          {onOpenDetail && (
            <button
              type="button"
              onClick={onOpenDetail}
              className="-mx-1 cursor-pointer rounded px-2 py-1 text-[11px] font-bold text-[#084734] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
            >
              고객사별 상세 →
            </button>
          )}
        </div>
      </div>

      {view && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 px-5 pt-4 text-[12px] font-semibold text-[#615D59]">
          <span>설치 완료 <span className="text-[18px] font-bold tabular-nums text-[#111110]">{view.headline.installed}</span>대</span>
          <span>배송 예정 <span className="text-[18px] font-bold tabular-nums text-[#B45309]">+{view.headline.planned}</span>대</span>
          <span>회수 <span className="text-[18px] font-bold tabular-nums text-[#615D59]">{view.headline.returned}</span>대</span>
        </div>
      )}

      {error && (
        <p role="alert" className="mx-5 mt-4 rounded-md bg-[#FEF2F2] px-3 py-2 text-[12px] font-semibold text-[#B91C1C]">
          판매대시보드를 불러오지 못했습니다: {error}
        </p>
      )}

      {!view && loading && <p className="px-5 py-6 text-[12px] text-[#A39E98]">불러오는 중…</p>}

      {view && (
        <div className={`mt-3 overflow-x-auto pb-2 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <table className="w-full min-w-[960px] border-collapse text-[12px] tabular-nums">
            <thead>
              <tr className="border-y border-[rgba(0,0,0,0.08)] bg-[#FAFAF9] text-[11px] font-bold text-[#615D59]">
                <th scope="col" className="sticky left-0 z-10 bg-[#FAFAF9] px-4 py-2 text-left">품목</th>
                {view.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`px-2 py-2 text-right ${column.current ? "text-[#084734]" : ""}`}
                    aria-current={column.current ? "date" : undefined}
                  >
                    {column.yearHint && <span className="mr-0.5 font-semibold text-[#A39E98]">{column.yearHint}</span>}
                    {column.label}
                  </th>
                ))}
                <th scope="col" className="px-2 py-2 text-right">날짜 미정</th>
                <th scope="col" className="px-3 py-2 text-right text-[#111110]">FY 합계</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.key} className={`border-b border-[rgba(0,0,0,0.05)] ${ROW_CLASS[row.kind]}`}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 px-4 py-1.5 text-left ${ROW_CLASS[row.kind]} ${
                      row.kind === "item" ? "font-semibold text-[#31302E]" : "font-bold text-[#111110]"
                    }`}
                  >
                    {row.groupLabel && row.kind === "item" && (
                      <span className="mr-1.5 rounded bg-[#F6F5F4] px-1.5 py-0.5 text-[10px] font-bold text-[#615D59]">{row.groupLabel}</span>
                    )}
                    {row.label}
                  </th>
                  {row.cells.map((cell, index) => (
                    <td key={view.columns[index].key} className={`px-2 py-1.5 text-right ${view.columns[index].current ? "bg-[#084734]/[0.03]" : ""}`}>
                      <Cell cell={cell} strong={row.kind !== "item"} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right"><Cell cell={row.undated} strong={row.kind !== "item"} /></td>
                  <td className="px-3 py-1.5 text-right"><Cell cell={row.total} strong /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-5 pt-2 text-[11px] text-[#A39E98]">
            유형이 비어 있는 시트 행은 세일즈로 셉니다. 날짜 없는 기록은 현재 회계연도의 “날짜 미정” 칸에 들어갑니다.
          </p>
        </div>
      )}
    </section>
  )
}

export default memo(SalesDashboardSection)
