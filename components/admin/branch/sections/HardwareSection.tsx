"use client"
import { useEffect, useState } from "react"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}
interface StockRow { product: string; io_stock: number; sheet_stock: number; low: boolean }
interface SalesRow { fiscal_year: number; fiscal_month: number; product: string; quantity: number }

export default function HardwareSection({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<{ stock: StockRow[]; sales_monthly: SalesRow[]; progress: Record<string, number> } | null>(null)
  useEffect(() => {
    adminFetch("/api/admin/branch/hw").then((r) => r.json()).then((d) => setData(d.error ? null : d)).catch(() => setData(null))
  }, [refreshKey])
  if (!data) return <div className="h-48 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  return (
    <section className="space-y-4">
      <h2 className="text-[13px] font-semibold text-[#111110]/70">하드웨어</h2>
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        {data.stock.map((s) => (
          <div key={s.product} className={`rounded-2xl border p-4 ${s.low ? "border-rose-200 bg-rose-50" : "border-[#e8e8e4] bg-white"}`}>
            <p className="text-[11px] font-medium uppercase">{s.product}</p>
            <p className="mt-2 text-[18px] font-bold">{s.io_stock}대</p>
            <p className="mt-1 text-[11px] opacity-60">시트 재고 {s.sheet_stock}대</p>
            {s.low && <p className="mt-1 text-[11px] font-medium text-rose-700">재고 부족</p>}
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
        <p className="mb-2 text-[12px] font-medium">출고 진행 상태</p>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {Object.keys(data.progress).length === 0 && <span className="text-[#1a1a1a]/40">데이터 없음</span>}
          {Object.entries(data.progress).map(([k, v]) => (
            <span key={k} className="rounded-full bg-[#fafaf8] px-2.5 py-1">{k} {v}대</span>
          ))}
        </div>
      </div>
    </section>
  )
}
