"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Award, ExternalLink, RefreshCw, Users } from "lucide-react"

import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import type { CrmManagerReport, ManagerAttentionKind } from "@/lib/repositories/crm-manager-report"

const REPORT_URL = "/api/admin/crm/manager-report"

const KIND_LABEL: Record<ManagerAttentionKind, string> = {
  overdue_task: "지연 할 일",
  unresponded_lead: "미응답 리드",
  renewal_risk: "갱신/만료 위험",
  deal_no_action: "다음 액션 없는 딜",
}

const KIND_CLASS: Record<ManagerAttentionKind, string> = {
  overdue_task: "bg-[#FEF3EE] text-[#B85C33]",
  unresponded_lead: "bg-[#FBF1E0] text-[#7A520F]",
  renewal_risk: "bg-[#FEF3EE] text-[#B85C33]",
  deal_no_action: "bg-[#fafaf8] text-[#1a1a1a]/55",
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-[#fafaf8] p-3">
      <p className="text-[11px] font-semibold text-[#1a1a1a]/35">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone ?? "text-[#111110]"}`}>{value.toLocaleString("ko-KR")}</p>
    </div>
  )
}

export default function CrmManagerReportPanel() {
  const [data, setData] = useState<CrmManagerReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (options?: { force?: boolean }) => {
    const cached = getCachedAdminJson<CrmManagerReport>(REPORT_URL, { cacheKey: REPORT_URL })
    if (cached && !options?.force) setData(cached)
    setLoading(!cached)
    setRefreshing(Boolean(options?.force))
    setError(null)
    try {
      const next = await adminFetchJsonCached<CrmManagerReport>(
        options?.force ? `${REPORT_URL}?force=1` : REPORT_URL,
        undefined,
        { cacheKey: REPORT_URL, ttlMs: 120_000, staleWhileRevalidateMs: 5 * 60_000, force: options?.force }
      )
      setData(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : "주간 리포트를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fafaf8] text-[#1a1a1a]/45">
            <Award className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[15px] font-bold text-[#111110]">지사장 주간 점검</h2>
            <p className="text-[11px] text-[#1a1a1a]/40">
              최근 {data?.windowDays ?? 7}일 · 담당자별 처리 성과와 막힌 고객을 코칭 관점으로 봅니다.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load({ force: true })}
          disabled={refreshing}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      {error ? (
        <div className="mb-3 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] font-medium text-[#B85C33]">
          {error}
        </div>
      ) : null}

      {data?.health.warnings.length ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[12px] text-[#7A520F]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>출처 신선도 확인 필요 · {data.health.warnings.join(" ")}</span>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="p-6 text-center text-[13px] text-[#1a1a1a]/40">주간 리포트를 계산 중입니다...</div>
      ) : data ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="완료 할 일" value={data.totals.completedTasks} tone="text-[#084734]" />
            <Stat label="지연 할 일" value={data.totals.overdueTasks} tone="text-[#B85C33]" />
            <Stat label="미응답 리드" value={data.totals.unrespondedLeads} />
            <Stat label="위험 고객" value={data.totals.riskCustomers} tone="text-[#B85C33]" />
            <Stat label="열린 딜" value={data.totals.openDeals} />
            <Stat label="다음 액션 없는 딜" value={data.totals.dealsNoNextAction} />
          </div>

          {/* per-owner accountability */}
          <div className="mb-4 overflow-hidden rounded-xl border border-[#f0f0ec]">
            <div className="flex items-center gap-1.5 border-b border-[#f0f0ec] bg-[#fafaf8] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[#1a1a1a]/45">
              <Users className="h-3.5 w-3.5" />
              담당자별 책임
            </div>
            <div className="hidden grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))] gap-2 px-3 py-2 text-[11px] font-semibold text-[#1a1a1a]/35 sm:grid">
              <span>담당자</span>
              <span className="text-right">완료</span>
              <span className="text-right">지연</span>
              <span className="text-right">열린 할 일</span>
              <span className="text-right">열린 딜</span>
              <span className="text-right">액션 없는 딜</span>
            </div>
            <div className="divide-y divide-[#f0f0ec]">
              {data.owners.length === 0 ? (
                <p className="px-3 py-3 text-[12px] text-[#1a1a1a]/40">집계할 담당자 데이터가 없습니다.</p>
              ) : (
                data.owners.map((owner) => (
                  <div
                    key={owner.ownerKey ?? owner.ownerName}
                    className="grid grid-cols-2 gap-2 px-3 py-2 text-[12px] sm:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))]"
                  >
                    <span className="truncate font-semibold text-[#111110]">{owner.ownerName}</span>
                    <span className="text-right font-medium text-[#084734]">{owner.completedTasks}</span>
                    <span className={`text-right font-medium ${owner.overdueTasks > 0 ? "text-[#B85C33]" : "text-[#1a1a1a]/45"}`}>
                      {owner.overdueTasks}
                    </span>
                    <span className="text-right font-medium text-[#111110]">{owner.openTasks}</span>
                    <span className="text-right font-medium text-[#111110]">{owner.openDeals}</span>
                    <span className={`text-right font-medium ${owner.dealsNoNextAction > 0 ? "text-[#7A520F]" : "text-[#1a1a1a]/45"}`}>
                      {owner.dealsNoNextAction}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* attention queue */}
          <div className="overflow-hidden rounded-xl border border-[#f0f0ec]">
            <div className="border-b border-[#f0f0ec] bg-[#fafaf8] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[#1a1a1a]/45">
              막힌 고객 · 놓친 액션
            </div>
            <div className="divide-y divide-[#f0f0ec]">
              {data.attention.length === 0 ? (
                <p className="px-3 py-3 text-[12px] text-[#1a1a1a]/40">지금 막힌 항목이 없습니다.</p>
              ) : (
                data.attention.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${KIND_CLASS[item.kind]}`}>
                          {KIND_LABEL[item.kind]}
                        </span>
                        <span className="text-[11px] font-medium text-[#1a1a1a]/40">{item.ownerName}</span>
                      </div>
                      <p className="truncate text-[12px] font-semibold text-[#111110]">{item.title}</p>
                      <p className="truncate text-[11px] text-[#1a1a1a]/45">{item.reason}</p>
                    </div>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
                      >
                        열기
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}
