"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { portalFetch } from "@/lib/partner-portal/portal-fetch"
import { CustomerForm } from "@/components/partner-portal/crud/CustomerForm"
import type { CustomerListItem, Customer } from "@/lib/partner-portal/types"

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)

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
    return () => {
      active = false
    }
  }, [])

  const filtered = search
    ? customers.filter((c) =>
        c.customer.name.includes(search) ||
        c.customer.contact_name?.includes(search) ||
        c.customer.region_label?.includes(search)
      )
    : customers

  return (
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
        <div className="grid gap-3">
          {filtered.map(({ customer, summary }) => (
            <div key={customer.id}
              className="border border-[#e8e8e4] rounded-xl bg-white p-4 hover:border-[#1a1a1a]/20 transition-colors cursor-pointer"
              onClick={() => { setEditing(customer); setShowForm(true) }}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-[#1a1a1a]">{customer.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[#1a1a1a]/50">
                    {customer.contact_name && <span>{customer.contact_name}</span>}
                    {customer.region_label && <span>{customer.region_label}</span>}
                    {customer.campus_name && <span>{customer.campus_name}</span>}
                  </div>
                </div>
                {summary && (
                  <div className="text-right text-xs">
                    <div className="text-[#1a1a1a]/60">딜 {summary.total_deals}건</div>
                    {summary.outstanding_amount > 0 && (
                      <div className="text-amber-600 font-medium mt-0.5">
                        미수금 {summary.outstanding_amount.toLocaleString()}원
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 고객 추가/수정 모달 */}
      {showForm && (
        <CustomerForm
          existing={editing}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={load}
        />
      )}
    </div>
  )
}
