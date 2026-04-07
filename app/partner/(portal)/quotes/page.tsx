"use client"

import { useState, useEffect } from "react"
import { portalFetch } from "@/lib/partner-portal/portal-fetch"
import { QuoteEditor } from "@/components/partner-portal/crud/QuoteEditor"
import { DealSelector } from "@/components/partner-portal/DealSelector"
import type { DealListItem } from "@/lib/partner-portal/types"

export default function QuotesPage() {
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
    return () => { active = false }
  }, [])

  if (loading) {
    return <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
  }

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a1a]">견적서 관리</h1>
          <p className="text-sm text-[#1a1a1a]/50 mt-0.5">거래를 선택하여 견적서를 작성하고 관리하세요</p>
        </div>

        {deals.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40 border border-[#e8e8e4] rounded-xl bg-white">
            진행 중인 거래가 없습니다. 먼저 고객과 거래를 생성하세요.
          </div>
        ) : (
          <>
            <DealSelector deals={deals} selectedId={selectedDealId} onSelect={setSelectedDealId} />
            {selectedDealId && (
              <div className="border-t border-[#e8e8e4] pt-6">
                <QuoteEditor dealId={selectedDealId} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
