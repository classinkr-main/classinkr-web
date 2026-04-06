"use client"

import { useState, useEffect, useCallback } from "react"
import { portalFetch } from "@/lib/partner-portal/portal-fetch"
import { ReceiptForm } from "@/components/partner-portal/crud/ReceiptForm"
import type { DealListItem } from "@/lib/partner-portal/types"

export default function ReceiptsPage() {
  const [deals, setDeals] = useState<DealListItem[]>([])
  const [selectedDeal, setSelectedDeal] = useState<DealListItem | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await portalFetch("/api/portal/deals")
    if (res.ok) {
      const data = await res.json()
      const dealList = data.deals ?? []
      setDeals(dealList)
      if (!selectedDeal && dealList.length > 0) {
        setSelectedDeal(dealList[0])
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#1a1a1a]">영수증 관리</h1>
        <p className="text-sm text-[#1a1a1a]/50 mt-0.5">딜을 선택하여 영수증을 관리하세요</p>
      </div>

      {deals.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {deals.map((deal) => (
            <button key={deal.id}
              onClick={() => setSelectedDeal(deal)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                selectedDeal?.id === deal.id
                  ? "border-[#1a1a1a] bg-[#1a1a1a] text-white"
                  : "border-[#e8e8e4] text-[#1a1a1a]/60 hover:border-[#1a1a1a]/30"
              }`}>
              {deal.customer_name ?? "—"} · {deal.title}
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
        <div className="py-16 text-center text-sm text-[#1a1a1a]/40 border border-[#e8e8e4] rounded-xl bg-white">
          딜이 없습니다.
        </div>
      )}
    </div>
  )
}
