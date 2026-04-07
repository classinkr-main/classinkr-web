"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { portalFetch } from "@/lib/partner-portal/portal-fetch"
import { CustomerForm } from "@/components/partner-portal/crud/CustomerForm"
import { CustomerDetailSlideOver } from "@/components/partner-portal/CustomerDetailSlideOver"
import type { CustomerListItem, Customer } from "@/lib/partner-portal/types"

const STAGE_COLOR: Record<string, string> = {
  contact: "bg-stone-100 text-stone-600",
  quote: "bg-blue-100 text-blue-700",
  contract: "bg-violet-100 text-violet-700",
  confirmed: "bg-indigo-100 text-indigo-700",
  installation: "bg-orange-100 text-orange-700",
  payment: "bg-emerald-100 text-emerald-700",
  closed: "bg-gray-100 text-gray-500",
  cancelled: "bg-red-100 text-red-500",
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    const res = await portalFetch("/api/portal/customers")
    if (res.ok) {
      const data = await res.json()
      setCustomers(data.customers ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true

    async function initialLoad() {
      const res = await portalFetch("/api/portal/customers")
      if (!active) return
      if (res.ok) {
        const data = await res.json()
        if (!active) return
        setCustomers(data.customers ?? [])
      }
      setLoading(false)
    }

    void initialLoad()
    return () => { active = false }
  }, [])

  const filtered = search
    ? customers.filter((c) =>
        c.customer.name.includes(search) ||
        c.customer.contact_name?.includes(search) ||
        c.customer.region_label?.includes(search)
      )
    : customers

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#1a1a1a]">고객 관리</h1>
            <p className="text-sm text-[#1a1a1a]/50 mt-0.5">{customers.length}개 기관</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { void load() }} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setShowForm(true) }}>
              <Plus className="w-4 h-4 mr-1" />고객 추가
            </Button>
          </div>
        </div>

        {/* 검색 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1a1a1a]/30" />
          <input
            placeholder="기관명, 담당자, 지역 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-[#e8e8e4] rounded-xl text-sm focus:outline-none focus:border-[#1a1a1a]"
          />
        </div>

        {/* 목록 */}
        {loading ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40 border border-[#e8e8e4] rounded-xl bg-white">
            {search ? "검색 결과가 없습니다" : "등록된 고객이 없습니다"}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(({ customer, summary }) => (
              <div
                key={customer.id}
                className="border border-[#e8e8e4] rounded-xl bg-white p-4 hover:border-[#1a1a1a]/30 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => setDetailId(customer.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium text-[#1a1a1a] truncate">{customer.name}</h3>
                    <div className="flex items-center flex-wrap gap-2 mt-1 text-xs text-[#1a1a1a]/50">
                      {customer.contact_name && <span>{customer.contact_name}</span>}
                      {customer.region_label && <span className="text-[#1a1a1a]/35">{customer.region_label}</span>}
                    </div>
                  </div>
                  {summary && summary.active_deals > 0 && (
                    <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${STAGE_COLOR["contract"]}`}>
                      진행 {summary.active_deals}건
                    </span>
                  )}
                </div>

                {summary && (
                  <div className="mt-3 pt-3 border-t border-[#f0f0ec] flex items-center gap-4 text-xs">
                    <span className="text-[#1a1a1a]/50">
                      계약 <span className="font-medium text-[#1a1a1a]">{summary.contracted_amount.toLocaleString()}원</span>
                    </span>
                    {summary.outstanding_amount > 0 && (
                      <span className="text-amber-600 font-medium">
                        미수금 {summary.outstanding_amount.toLocaleString()}원
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 고객 추가/수정 폼 */}
        {showForm && (
          <CustomerForm
            existing={editing}
            onClose={() => { setShowForm(false); setEditing(null) }}
            onSaved={load}
          />
        )}
      </div>

      {/* 고객 상세 슬라이드오버 */}
      {detailId && (
        <CustomerDetailSlideOver
          customerId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(customer) => {
            setDetailId(null)
            setEditing(customer)
            setShowForm(true)
          }}
        />
      )}
    </div>
  )
}
