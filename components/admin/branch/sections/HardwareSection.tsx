"use client"
import { useState } from "react"
import { useBranchJson } from "../client-api"

interface StockRow {
  product: string
  io_stock: number          // 실재고(장부): 입고 − 완료 출고
  planned_out: number       // 출고 예정(아직 창고에 있음)
  available_stock: number   // 가용 재고: 실재고 − 출고 예정
  sheet_stock: number
  low: boolean
}
interface SalesRow { fiscal_year: number; fiscal_month: number; product: string; quantity: number }
interface RecentInstall { customer: string; quantity: number; date: string | null }
interface HardwareResponse {
  stock: StockRow[]
  sales_monthly: SalesRow[]
  progress: Record<string, number>
  recent_installs?: RecentInstall[]
}

const COLORS = {
  green: "#084734",
  amber: "#A8741A",
  red: "#B43E3E",
}

// Trust API's `low` flag for status — `sheet_stock` is total inventory in sheet,
// not a threshold; previously deriving status from io/sheet ratio gave false
// "critical" for healthy items (e.g., IFP86 io=10 sheet=1477 was wrongly flagged).
const STATUS_TONE = {
  ok:  { bg: "#ECFDF5", fg: "#084734", label: "정상" },
  low: { bg: "#FCE9E9", fg: "#B43E3E", label: "부족" },
} as const

function statusToneOf(low: boolean) {
  return low ? STATUS_TONE.low : STATUS_TONE.ok
}

function TableView({ rows }: { rows: StockRow[] }) {
  return (
    <div>
      <div className="grid items-end gap-2 px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#615D59]"
        style={{ gridTemplateColumns: "1fr 86px 100px 70px" }}>
        <span>품목</span>
        <span className="text-right">가용 재고</span>
        <span className="text-right">시트 재고</span>
        <span className="text-right">상태</span>
      </div>
      {rows.map((s) => {
        const tone = statusToneOf(s.low)
        return (
          <div key={s.product}
            className="grid items-center gap-2 border-t border-[rgba(0,0,0,0.06)] px-1 py-2.5"
            style={{ gridTemplateColumns: "1fr 86px 100px 70px" }}>
            <div>
              <p className="text-[12.5px] font-semibold text-[#111110]">{s.product}</p>
            </div>
            <div className="text-right">
              <p className="text-[16px] font-bold tracking-[-0.01em] text-[#111110]">{s.available_stock}</p>
              <p className="text-[9.5px] text-[#615D59]">
                실재고 {s.io_stock} · 예정 −{s.planned_out}
              </p>
            </div>
            <p className="text-right text-[11px] text-[#615D59]">
              {s.sheet_stock}대
            </p>
            <div className="text-right">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                style={{ background: tone.bg, color: tone.fg }}>
                {tone.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function GaugeView({ rows }: { rows: StockRow[] }) {
  // Use the largest 실재고(io) or sheet_stock value across rows as the gauge max,
  // so bars are visually comparable.
  const max = Math.max(1, ...rows.map((r) => Math.max(r.io_stock, r.sheet_stock)))
  return (
    <div className="flex flex-col gap-3">
      {rows.map((s) => {
        const color = s.low ? COLORS.red : COLORS.green
        const availPct = (Math.max(0, s.available_stock) / max) * 100
        const plannedPct = (Math.max(0, s.planned_out) / max) * 100
        const sheetPct = (s.sheet_stock / max) * 100
        return (
          <div key={s.product}>
            <div className="mb-1 flex justify-between">
              <div className="flex items-center gap-1.5">
                <span className="block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                <span className="text-[12px] font-semibold text-[#111110]">{s.product}</span>
                {s.low && (
                  <span className="rounded-full bg-[#FCE9E9] px-1.5 py-px text-[9px] font-bold text-[#B43E3E]">
                    부족
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#615D59]">
                가용 <span className="text-[13px] font-bold text-[#111110]">{s.available_stock}</span>
                <span className="mx-1">·</span>
                예정 <span className="font-semibold text-[#A8741A]">{s.planned_out}</span>
                <span className="mx-1">·</span>
                시트 <span className="font-semibold text-[#111110]">{s.sheet_stock}</span>
              </p>
            </div>
            {/* 3단 바: 가용(진하게) + 출고 예정(중간 톤, 가용 뒤에 이어붙임) + 시트 재고(연한 배경) */}
            <div className="relative h-4 overflow-hidden rounded-md bg-[#F6F5F4]">
              <div className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-500"
                style={{ width: `${Math.min(100, sheetPct)}%`, background: color, opacity: 0.18 }} />
              <div className="absolute inset-y-0 rounded-r-md transition-[width] duration-500"
                style={{ left: `${Math.min(100, availPct)}%`, width: `${Math.min(100 - Math.min(100, availPct), plannedPct)}%`, background: "#A8741A", opacity: 0.45 }} />
              <div className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-500"
                style={{ width: `${Math.min(100, availPct)}%`, background: color, opacity: 0.85 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function HardwareSection({ refreshKey }: { refreshKey: number }) {
  const [view, setView] = useState<"table" | "gauge">("table")
  const hw = useBranchJson<HardwareResponse>("/api/admin/branch/hw", refreshKey)
  const data = hw.data

  if (hw.loading) return <div className="h-48 animate-pulse rounded-xl bg-[#f0f0ec]" />
  if (hw.error) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-[12px] text-rose-700">{hw.error}</div>
  if (!data) return null
  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3.5">
        <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">HW 재고</h2>
        <div className="inline-flex rounded-md border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]">
          {(["table", "gauge"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={`rounded-[5px] px-2.5 py-1 text-[11px] font-semibold transition ${
                view === v ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
              }`}>
              {v === "table" ? "테이블" : "비교 게이지"}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5">
        {data.stock.length === 0 ? (
          <p className="text-[11px] text-[#615D59]">재고 데이터 없음</p>
        ) : view === "table" ? <TableView rows={data.stock} /> : <GaugeView rows={data.stock} />}
      </div>
      <div className="border-t border-[rgba(0,0,0,0.08)] px-5 py-3">
        <p className="mb-1.5 text-[11px] font-semibold text-[#615D59]">최근 설치</p>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {(!data.recent_installs || data.recent_installs.length === 0) && (
            <span className="text-[#615D59]">데이터 없음</span>
          )}
          {data.recent_installs?.map((r) => (
            <span
              key={`${r.customer}-${r.date ?? ""}`}
              className="rounded-full bg-[#F6F5F4] px-2.5 py-1 text-[#111110]"
              title={r.date ? `최근 설치 ${r.date}` : undefined}
            >
              <span className="font-semibold">{r.customer}</span> <span className="text-[#615D59]">{r.quantity}대</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
