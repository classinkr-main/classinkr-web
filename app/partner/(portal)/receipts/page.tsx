"use client"

import { useEffect, useState } from "react"
import { ReceiptForm } from "@/components/partner-portal/crud/ReceiptForm"
import { portalFetch } from "@/lib/partner-portal/portal-fetch"
import type { DealListItem } from "@/lib/partner-portal/types"

export default function ReceiptsPage() {
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

  const selectedDeal = deals.find((deal) => deal.id === selectedDealId) ?? null

  if (loading) {
    return <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#1a1a1a]">영수증 관리</h1>
        <p className="mt-0.5 text-sm text-[#1a1a1a]/50">딜을 선택하여 영수증을 관리해요</p>
      </div>

      {deals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {deals.map((deal) => (
            <button
              key={deal.id}
              onClick={() => setSelectedDealId(deal.id)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                selectedDealId === deal.id
                  ? "border-[#1a1a1a] bg-[#1a1a1a] text-white"
                  : "border-[#e8e8e4] text-[#1a1a1a]/60 hover:border-[#1a1a1a]/30"
              }`}
            >
              {deal.customer_name ?? "고객"} - {deal.title}
            </button>
          ))}
        </div>
      )}

      {selectedDeal ? (
        <ReceiptForm
          dealId={selectedDeal.id}
          partnerAccountId={selectedDeal.partner_account_id}
          customerId={selectedDeal.customer_id}
        />
      ) : (
        <div className="rounded-xl border border-[#e8e8e4] bg-white py-16 text-center text-sm text-[#1a1a1a]/40">
          선택 가능한 딜이 없습니다.
        </div>
      )}
    </div>
  )
}
