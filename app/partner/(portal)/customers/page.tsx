"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus, RefreshCw, Search } from "lucide-react"

import { CustomerDetailSlideOver } from "@/components/partner-portal/CustomerDetailSlideOver"
import { CustomerForm } from "@/components/partner-portal/crud/CustomerForm"
import { Button } from "@/components/ui/button"
import { portalFetch } from "@/lib/partner-portal/portal-fetch"
import type { Customer, CustomerListItem } from "@/lib/partner-portal/types"

const STAGE_COLOR: Record<string, string> = {
  contact: "bg-[#f0f0ec] text-[#615D59]",
  quote: "bg-[#ECFDF5] text-[#084734]",
  contract: "bg-[#D1FAE5] text-[#065c41]",
  confirmed: "bg-[#D1FAE5] text-[#065c41]",
  installation: "bg-amber-50 text-amber-700",
  payment: "bg-[#ECFDF5] text-[#084734]",
  closed: "bg-[#f0f0ec] text-[#A39E98]",
  cancelled: "bg-[#FEF3EE] text-[#B85C33]",
}

const STAGE_LABEL: Record<string, string> = {
  contact: "컨택",
  quote: "견적",
  contract: "계약",
  confirmed: "확정",
  installation: "설치",
  payment: "수납",
  closed: "완료",
  cancelled: "취소",
}

const ATTENTION_STYLE: Record<string, string> = {
  high: "border-amber-200 bg-amber-50 text-amber-700",
  medium: "border-[#D1FAE5] bg-[#ECFDF5] text-[#084734]",
  low: "border-[#e8e8e4] bg-[#f7f7f5] text-[#615D59]",
}

const ATTENTION_LABEL: Record<string, string> = {
  high: "즉시 확인",
  medium: "이번 주 추적",
  low: "안정",
}

const NEXT_EVENT_LABEL: Record<string, string> = {
  installation: "설치 일정",
  meeting: "미팅 일정",
  document_due: "문서 기한",
  internal: "내부 일정",
}

function formatDateLabel(value: string | null) {
  if (!value) return "미정"
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  })
}

function formatRecentLabel(value: string | null) {
  if (!value) return "활동 없음"
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
  })
}

type PartnerCustomersPageProps = {
  allowCreate?: boolean
  allowEdit?: boolean
}

export function PartnerCustomersPage({
  allowCreate = true,
  allowEdit = true,
}: PartnerCustomersPageProps = {}) {
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
    return () => {
      active = false
    }
  }, [])

  const filtered = (search
    ? customers.filter((item) =>
        item.customer.name.includes(search) ||
        item.customer.contact_name?.includes(search) ||
        item.customer.region_label?.includes(search)
      )
    : customers
  ).slice().sort((left, right) => {
    const attentionOrder = { high: 0, medium: 1, low: 2 }
    const leftAttention = attentionOrder[left.insight?.attention_level ?? "low"]
    const rightAttention = attentionOrder[right.insight?.attention_level ?? "low"]
    if (leftAttention !== rightAttention) return leftAttention - rightAttention

    const leftNext = left.insight?.next_event_at
      ? new Date(left.insight.next_event_at).getTime()
      : Number.POSITIVE_INFINITY
    const rightNext = right.insight?.next_event_at
      ? new Date(right.insight.next_event_at).getTime()
      : Number.POSITIVE_INFINITY
    if (leftNext !== rightNext) return leftNext - rightNext

    return (right.summary?.active_deals ?? 0) - (left.summary?.active_deals ?? 0)
  })

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#1a1a1a]">고객 관리</h1>
            <p className="mt-0.5 text-sm text-[#1a1a1a]/50">{customers.length}개 기관</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { void load() }} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            {allowCreate && (
              <Button size="sm" onClick={() => { setEditing(null); setShowForm(true) }}>
                <Plus className="mr-1 h-4 w-4" />
                고객 추가
              </Button>
            )}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/30" />
          <input
            placeholder="기관명, 담당자, 지역 검색..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-xl border border-[#e8e8e4] py-2.5 pl-10 pr-4 text-sm focus:border-[#1a1a1a] focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          search ? (
            <div className="rounded-xl border border-[#e8e8e4] bg-white py-12 text-center">
              <p className="text-sm text-[#1a1a1a]/50">&quot;{search}&quot;에 해당하는 고객이 없습니다</p>
              <button onClick={() => setSearch("")} className="mt-3 text-xs text-[#084734] hover:underline">
                검색 초기화
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#e0e0dc] bg-white py-14 text-center">
              <p className="text-sm font-medium text-[#1a1a1a]/50">아직 등록된 고객이 없습니다</p>
              <p className="mt-1 text-xs text-[#1a1a1a]/35">첫 고객을 추가하면 거래·문서·일정을 연결해서 관리할 수 있습니다.</p>
              {allowCreate && (
                <button
                  onClick={() => { setEditing(null); setShowForm(true) }}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#084734] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#065c41]"
                >
                  <Plus className="h-4 w-4" />
                  첫 고객 추가
                </button>
              )}
            </div>
          )
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(({ customer, summary, insight, deal_previews }) => (
              <button
                key={customer.id}
                type="button"
                className="group rounded-xl border border-[#e8e8e4] bg-white p-4 text-left transition-all hover:border-[#1a1a1a]/30 hover:shadow-sm"
                onClick={() => setDetailId(customer.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium text-[#1a1a1a] transition-colors group-hover:text-[#084734]">
                      {customer.name}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#1a1a1a]/50">
                      {customer.contact_name && <span>{customer.contact_name}</span>}
                      {customer.region_label && <span className="text-[#1a1a1a]/35">{customer.region_label}</span>}
                    </div>
                  </div>
                  <span className="text-xs text-[#1a1a1a]/20 transition-colors group-hover:text-[#1a1a1a]/50">→</span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {insight?.attention_level && (
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${ATTENTION_STYLE[insight.attention_level]}`}>
                      {ATTENTION_LABEL[insight.attention_level]}
                    </span>
                  )}
                  {insight?.primary_stage && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_COLOR[insight.primary_stage]}`}>
                      대표 단계 {STAGE_LABEL[insight.primary_stage]}
                    </span>
                  )}
                  {summary && summary.active_deals > 0 && (
                    <span className="rounded-full border border-[#e8e8e4] bg-[#f7f7f5] px-2 py-0.5 text-[11px] font-medium text-[#615D59]">
                      진행 {summary.active_deals}건
                    </span>
                  )}
                </div>

                {deal_previews && deal_previews.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {deal_previews.map((preview) => (
                      <div key={preview.deal_id} className="rounded-lg border border-[#f0f0ec] bg-[#fafaf8] px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium text-[#1a1a1a]">{preview.title}</p>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STAGE_COLOR[preview.current_stage]}`}>
                            {STAGE_LABEL[preview.current_stage]}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#1a1a1a]/45">
                          {preview.next_event_at ? `다음 일정 ${formatDateLabel(preview.next_event_at)}` : "다음 일정 미정"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-[#f0f0ec] bg-[#fcfcfb] px-3 py-2">
                    <p className="text-[#1a1a1a]/40">다음 일정</p>
                    <p className="mt-1 font-medium text-[#1a1a1a]">
                      {insight?.next_event_at ? formatDateLabel(insight.next_event_at) : "미정"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
                      {insight?.next_event_type ? NEXT_EVENT_LABEL[insight.next_event_type] : "후속 일정 필요"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#f0f0ec] bg-[#fcfcfb] px-3 py-2">
                    <p className="text-[#1a1a1a]/40">최근 활동</p>
                    <p className="mt-1 font-medium text-[#1a1a1a]">
                      {formatRecentLabel(insight?.recent_activity_at ?? null)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
                      {insight?.recent_activity_at ? "최근 로그 기준" : "로그 없음"}
                    </p>
                  </div>
                </div>

                {summary && (
                  <div className="mt-3 flex items-center gap-4 border-t border-[#f0f0ec] pt-3 text-xs">
                    <span className="text-[#1a1a1a]/50">
                      계약 <span className="font-medium text-[#1a1a1a]">{summary.contracted_amount.toLocaleString()}원</span>
                    </span>
                    {summary.outstanding_amount > 0 && (
                      <span className="font-medium text-amber-600">
                        미수금 {summary.outstanding_amount.toLocaleString()}원
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {(allowCreate || allowEdit) && showForm && (
          <CustomerForm
            existing={editing}
            onClose={() => { setShowForm(false); setEditing(null) }}
            onSaved={load}
          />
        )}
      </div>

      {detailId && (
        <CustomerDetailSlideOver
          key={detailId}
          customerId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={allowEdit
            ? (customer) => {
                setDetailId(null)
                setEditing(customer)
                setShowForm(true)
              }
            : undefined}
        />
      )}
    </div>
  )
}

export default function CustomersPage() {
  return <PartnerCustomersPage />
}
