"use client"

import { useState, useEffect } from "react"
import { portalFetch } from "@/lib/partner-portal/portal-fetch"
import { ContractList } from "@/components/partner-portal/crud/ContractList"
import { DealSelector } from "@/components/partner-portal/DealSelector"
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
    return () => { active = false }
  }, [])

  if (loading) {
    return <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
  }

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a1a]">계약서 관리</h1>
          <p className="text-sm text-[#1a1a1a]/50 mt-0.5">거래를 선택하여 계약서를 확인하고 서명하세요</p>
        </div>

        {deals.length === 0 ? (
          <div className="py-14 text-center border border-dashed border-[#e0e0dc] rounded-xl bg-white">
            <p className="text-sm font-medium text-[#1a1a1a]/50">계약서를 연결할 거래가 없습니다</p>
            <p className="mt-1 text-xs text-[#1a1a1a]/35">견적서가 확정되면 계약서 탭에서 서명 진행이 가능합니다.</p>
            <a href="/partner/customers" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#084734] px-4 py-2 text-sm font-medium text-white hover:bg-[#065c41] transition-colors">
              고객 관리로 이동
            </a>
          </div>
        ) : (
          <>
            <DealSelector deals={deals} selectedId={selectedDealId} onSelect={setSelectedDealId} />
            {selectedDealId && (
              <div className="border-t border-[#e8e8e4] pt-6">
                <ContractList dealId={selectedDealId} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
