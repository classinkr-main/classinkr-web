"use client"

import { useState, useEffect } from "react"
import { portalFetch } from "@/lib/partner-portal/portal-fetch"
import { ContractList } from "@/components/partner-portal/crud/ContractList"
import type { DealListItem } from "@/lib/partner-portal/types"

export default function ContractsPage() {
  const [deals, setDeals] = useState<DealListItem[]>([])
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function initialLoad() {
      const res = await portalFetch("/api/portal/deals")
      if (!active) return
      if (res.ok) {
        const data = await res.json()
        if (!active) return
        setDeals(data.deals ?? [])
        setSelectedDealId((current) => {
          if (current && data.deals?.some((deal: DealListItem) => deal.id === current)) {
            return current
          }
          return data.deals?.[0]?.id ?? null
        })
      }
      setLoading(false)
    }

    void initialLoad()
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#1a1a1a]">계약서 관리</h1>
        <p className="text-sm text-[#1a1a1a]/50 mt-0.5">딜을 선택하여 계약서를 관리하세요</p>
      </div>

      {deals.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {deals.map((deal) => (
            <button key={deal.id}
              onClick={() => setSelectedDealId(deal.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                selectedDealId === deal.id
                  ? "border-[#1a1a1a] bg-[#1a1a1a] text-white"
                  : "border-[#e8e8e4] text-[#1a1a1a]/60 hover:border-[#1a1a1a]/30"
              }`}>
              {deal.customer_name ?? "—"} · {deal.title}
            </button>
          ))}
        </div>
      )}

      {selectedDealId ? (
        <ContractList dealId={selectedDealId} />
      ) : (
        <div className="py-16 text-center text-sm text-[#1a1a1a]/40 border border-[#e8e8e4] rounded-xl bg-white">
          딜이 없습니다.
        </div>
      )}
    </div>
  )
}
