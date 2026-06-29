"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ExternalLink, Loader2, RefreshCw, Search } from "lucide-react"

import { DealOwnerControl, type AdminMember } from "@/components/admin/commercial/DealOwnerControl"
import { adminFetch, adminFetchJsonCached } from "@/lib/admin-client"
import type { DealListItem, DealStage } from "@/lib/portal/types"

const STAGE_LABEL: Record<DealStage, string> = {
  contact: "컨택",
  quote: "견적",
  contract: "계약",
  confirmed: "확정",
  installation: "설치",
  payment: "수납",
  closed: "종결",
  cancelled: "취소",
}

const STAGE_ACCENT: Record<DealStage, string> = {
  contact: "border-t-[#A39E98]",
  quote: "border-t-[#084734]",
  contract: "border-t-[#065c41]",
  confirmed: "border-t-[#065c41]",
  installation: "border-t-amber-500",
  payment: "border-t-emerald-500",
  closed: "border-t-emerald-600",
  cancelled: "border-t-[#E8956B]",
}

const BOARD_STAGES: DealStage[] = [
  "contact",
  "quote",
  "contract",
  "confirmed",
  "installation",
  "payment",
  "closed",
  "cancelled",
]

interface DealsResponse {
  deals: DealListItem[]
  currentUserId: string | null
}

function formatAmount(value: number | null | undefined) {
  if (!value) return null
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`
  if (value >= 10_000) return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만`
  return value.toLocaleString("ko-KR")
}

export function DealPipelineBoard() {
  const [deals, setDeals] = useState<DealListItem[]>([])
  const [members, setMembers] = useState<AdminMember[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [mineOnly, setMineOnly] = useState(false)
  const [movingId, setMovingId] = useState<string | null>(null)

  const load = async (force?: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminFetchJsonCached<DealsResponse>("/api/admin/deals", undefined, {
        ttlMs: force ? 0 : 30_000,
        force,
      })
      setDeals(Array.isArray(data?.deals) ? data.deals : [])
      setCurrentUserId(data?.currentUserId ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "딜을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    void (async () => {
      try {
        const data = await adminFetchJsonCached<{ members: AdminMember[] }>(
          "/api/admin/members",
          undefined,
          { ttlMs: 300_000 }
        )
        setMembers(Array.isArray(data?.members) ? data.members : [])
      } catch {
        /* noop — 담당자 목록 없으면 배정 비활성 */
      }
    })()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return deals.filter((deal) => {
      if (mineOnly && currentUserId && deal.owner_id !== currentUserId) return false
      if (!q) return true
      return (
        (deal.title ?? "").toLowerCase().includes(q) ||
        (deal.customer_name ?? "").toLowerCase().includes(q) ||
        (deal.deal_code ?? "").toLowerCase().includes(q)
      )
    })
  }, [deals, query, mineOnly, currentUserId])

  const columns = useMemo(() => {
    const grouped = new Map<DealStage, DealListItem[]>()
    for (const stage of BOARD_STAGES) grouped.set(stage, [])
    for (const deal of filtered) grouped.get(deal.current_stage)?.push(deal)
    return BOARD_STAGES.map((stage) => {
      const items = grouped.get(stage) ?? []
      const total = items.reduce((sum, deal) => sum + (deal.expected_amount ?? 0), 0)
      return { stage, items, total }
    })
  }, [filtered])

  const handleMove = async (deal: DealListItem, nextStage: DealStage) => {
    if (nextStage === deal.current_stage) return
    const prevStage = deal.current_stage
    setMovingId(deal.id)
    setDeals((list) =>
      list.map((d) => (d.id === deal.id ? { ...d, current_stage: nextStage } : d))
    )
    try {
      const res = await adminFetch(`/api/admin/deals/${deal.id}`, {
        method: "PATCH",
        body: JSON.stringify({ current_stage: nextStage }),
      })
      if (!res.ok) throw new Error("move failed")
    } catch {
      setDeals((list) =>
        list.map((d) => (d.id === deal.id ? { ...d, current_stage: prevStage } : d))
      )
      setError("단계 이동에 실패했습니다.")
    } finally {
      setMovingId(null)
    }
  }

  const handleOwnerAssigned = (dealId: string, ownerId: string | null) => {
    setDeals((list) => list.map((d) => (d.id === dealId ? { ...d, owner_id: ownerId } : d)))
  }

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#1a1a1a]/35">
            Sales Pipeline
          </p>
          <h1 className="mt-2 text-xl font-bold text-[#1a1a1a]">딜 파이프라인 보드</h1>
          <p className="mt-1.5 text-sm text-[#1a1a1a]/50">
            단계별 딜과 담당자를 한눈에 보고, 단계 이동·담당자 배정을 바로 처리합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/commercial"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-1.5 text-xs font-medium text-[#1a1a1a]/60 hover:bg-[#f7f7f5]"
          >
            운영 대시보드
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => void load(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-1.5 text-xs font-medium text-[#1a1a1a]/60 hover:bg-[#f7f7f5]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1a1a1a]/30" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="딜·고객·코드 검색"
            className="w-56 rounded-lg border border-[#e8e8e4] bg-white py-1.5 pl-8 pr-3 text-xs text-[#1a1a1a] outline-none focus:border-[#c8c8c4]"
          />
        </div>
        <label
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            mineOnly
              ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
              : "border-[#e8e8e4] bg-white text-[#1a1a1a]/55"
          } ${!currentUserId ? "cursor-not-allowed opacity-50" : ""}`}
          title={currentUserId ? "" : "Supabase 인증 admin만 사용할 수 있습니다."}
        >
          <input
            type="checkbox"
            disabled={!currentUserId}
            checked={mineOnly}
            onChange={(event) => setMineOnly(event.target.checked)}
            className="h-3.5 w-3.5 accent-[#084734]"
          />
          내 담당만
        </label>
        <span className="text-xs text-[#1a1a1a]/40">{filtered.length}건</span>
      </div>

      {error && (
        <div className="rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-sm text-[#B85C33]">
          {error}
        </div>
      )}

      {loading && deals.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-[#1a1a1a]/30" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {columns.map(({ stage, items, total }) => (
            <div key={stage} className="w-[280px] shrink-0">
              <div
                className={`rounded-t-xl border border-b-0 border-t-2 border-[#e8e8e4] bg-white px-3 py-2.5 ${STAGE_ACCENT[stage]}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-[#111110]">{STAGE_LABEL[stage]}</span>
                  <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/55">
                    {items.length}
                  </span>
                </div>
                {total > 0 && (
                  <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">예상 {formatAmount(total)}</p>
                )}
              </div>
              <div className="min-h-[120px] space-y-2 rounded-b-xl border border-[#e8e8e4] bg-[#fafaf8] p-2">
                {items.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[11px] text-[#1a1a1a]/25">없음</p>
                ) : (
                  items.map((deal) => (
                    <div
                      key={deal.id}
                      className="rounded-lg border border-[#e8e8e4] bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[10px] font-medium text-[#1a1a1a]/35">
                          {deal.deal_code}
                        </span>
                        {formatAmount(deal.expected_amount) && (
                          <span className="shrink-0 text-[11px] font-semibold text-[#084734]">
                            {formatAmount(deal.expected_amount)}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[13px] font-semibold text-[#111110]">
                        {deal.title}
                      </p>
                      <p className="truncate text-[11px] text-[#1a1a1a]/45">
                        {deal.customer_name ?? "고객 미지정"}
                      </p>

                      <div className="mt-2 space-y-1.5 border-t border-[#f0f0ec] pt-2">
                        <DealOwnerControl
                          dealId={deal.id}
                          ownerId={deal.owner_id}
                          members={members}
                          onAssigned={(ownerId) => handleOwnerAssigned(deal.id, ownerId)}
                        />
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium text-[#1a1a1a]/40">단계</span>
                          <select
                            value={deal.current_stage}
                            disabled={movingId === deal.id}
                            onChange={(event) => handleMove(deal, event.target.value as DealStage)}
                            className="flex-1 rounded-lg border border-[#e8e8e4] bg-white px-2 py-1 text-[11px] font-medium text-[#1a1a1a] outline-none focus:border-[#c8c8c4] disabled:opacity-50"
                          >
                            {BOARD_STAGES.map((stageOption) => (
                              <option key={stageOption} value={stageOption}>
                                {STAGE_LABEL[stageOption]}
                              </option>
                            ))}
                          </select>
                          {movingId === deal.id && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1a1a1a]/40" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
