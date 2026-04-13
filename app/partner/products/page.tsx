"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { BarChart3, RefreshCw, Package } from "lucide-react"
import type { SalesSummary } from "@/lib/repositories/install-schedules"

function ProgressBar({ quoted, contracted, scheduled, installed }: { quoted: number; contracted: number; scheduled: number; installed: number }) {
  const max = Math.max(quoted, 1)
  return (
    <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-[#f0f0ec]">
      <div className="bg-[#ECFDF5] transition-all" style={{ width: `${(quoted / max) * 100}%` }} />
      <div className="bg-[#084734] transition-all" style={{ width: `${(contracted / max) * 100}%` }} />
      <div className="bg-yellow-400 transition-all" style={{ width: `${(scheduled / max) * 100}%` }} />
      <div className="bg-[#065c41] transition-all" style={{ width: `${(installed / max) * 100}%` }} />
    </div>
  )
}

export default function PartnerProductsPage() {
  const router = useRouter()
  const [summary, setSummary] = useState<SalesSummary[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const res = await fetch("/api/partner/schedules?summary=true")
    if (res.status === 401) { router.replace("/partner/login"); return }
    if (res.ok) setSummary((await res.json()).summary ?? [])
    setLoading(false)
  }

  useEffect(() => {
    let alive = true

    const initialize = async () => {
      setLoading(true)
      const res = await fetch("/api/partner/schedules?summary=true")
      if (res.status === 401) {
        router.replace("/partner/login")
        return
      }
      if (!alive) return
      if (res.ok) setSummary((await res.json()).summary ?? [])
      if (alive) setLoading(false)
    }

    void initialize()

    return () => {
      alive = false
    }
  }, [router])

  const totals = summary.reduce(
    (acc, s) => ({ quoted: acc.quoted + s.quoted_qty, contracted: acc.contracted + s.contracted_qty, scheduled: acc.scheduled + s.scheduled_qty, installed: acc.installed + s.installed_qty }),
    { quoted: 0, contracted: 0, scheduled: 0, installed: 0 }
  )

  return (
    <div className="min-h-screen bg-[#f7f7f5]">
      <header className="bg-white border-b border-[#e8e8e4] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#1a1a1a]/40" />
            <h1 className="text-sm font-semibold text-[#1a1a1a]">판매 현황</h1>
          </div>
          <button onClick={load} className="text-xs text-[#1a1a1a]/40 hover:text-[#1a1a1a] flex items-center gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />새로고침
          </button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-4 text-[10px] text-[#1a1a1a]/50">
          {[["bg-[#ECFDF5]","견적"],["bg-[#084734]","계약"],["bg-yellow-400","설치예정"],["bg-[#065c41]","설치완료"]].map(([c,l]) => (
            <span key={l} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${c} inline-block`}/>{l}</span>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-[#e8e8e4] p-5">
          <p className="text-xs font-semibold text-[#1a1a1a]/40 uppercase tracking-widest mb-4">전체 합계</p>
          <div className="grid grid-cols-4 gap-4 mb-4 text-center">
            {[["견적",totals.quoted,"text-[#6EE7B7]"],["계약",totals.contracted,"text-[#084734]"],["설치예정",totals.scheduled,"text-yellow-500"],["설치완료",totals.installed,"text-[#065c41]"]].map(([l,v,c]) => (
              <div key={l as string}><p className={`text-xl font-bold ${c}`}>{(v as number).toLocaleString()}</p><p className="text-[10px] text-[#1a1a1a]/40 mt-0.5">{l}</p></div>
            ))}
          </div>
          <ProgressBar quoted={totals.quoted} contracted={totals.contracted} scheduled={totals.scheduled} installed={totals.installed} />
        </div>
        <div className="bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#e8e8e4]">
            <p className="text-xs font-semibold text-[#1a1a1a]/40 uppercase tracking-widest">모델별 현황</p>
          </div>
          {loading ? (
            <div className="py-12 text-center text-sm text-[#1a1a1a]/30">불러오는 중...</div>
          ) : summary.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2"><Package className="w-7 h-7 text-[#1a1a1a]/15"/><p className="text-sm text-[#1a1a1a]/30">데이터가 없습니다</p></div>
          ) : (
            <ul className="divide-y divide-[#e8e8e4]">
              {summary.map((s) => (
                <li key={s.product_name} className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[#1a1a1a]">{s.product_name}</p>
                    <span className="text-xs text-[#1a1a1a]/40">총 {s.quoted_qty}대 견적</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[["견적",s.quoted_qty,"text-[#6EE7B7]"],["계약",s.contracted_qty,"text-[#084734]"],["설치예정",s.scheduled_qty,"text-yellow-500"],["설치완료",s.installed_qty,"text-[#065c41]"]].map(([l,v,c]) => (
                      <div key={l as string}><p className={`text-lg font-bold ${c}`}>{v as number}</p><p className="text-[10px] text-[#1a1a1a]/40">{l}</p></div>
                    ))}
                  </div>
                  <ProgressBar quoted={s.quoted_qty} contracted={s.contracted_qty} scheduled={s.scheduled_qty} installed={s.installed_qty} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
