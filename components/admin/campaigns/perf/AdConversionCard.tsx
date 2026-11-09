"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { EmptyState, Skeleton } from "@/components/admin/viz"
import { COUNT, PCT1, money } from "@/components/admin/campaigns/event-format"
import { adminFetchJsonCached } from "@/lib/admin-client"
import type { AdConversionCounts, AdConversionResult } from "@/lib/marketing/ad-conversion"
import type { PerfPeriodKey } from "@/lib/marketing/perf"

// 광고별 전환·결제 — Compass CRM 리드(meta_ad_id·단계) × Compass ad 레벨 집행비.
// 계산·정직 규칙은 lib/marketing/ad-conversion.ts. 이 카드의 리드는 CRM 리드 축이라
// 바로 위 "소재별 CPL"(Meta 리포트 리드 축)과 리드 수·CPL 이 다른 것이 정상이다.

interface AdConversionResponse extends Partial<AdConversionResult> {
  period: { key: PerfPeriodKey; since: string; until: string }
  down: boolean
  truncated?: boolean
  error?: string
}

const TTL_MS = 45_000
const DEFAULT_VISIBLE = 8
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_48px_48px_48px_64px_84px_92px] items-center gap-x-3 px-1"

const rate = (v: number | null) => (v == null ? "—" : `${PCT1.format(v)}%`)

function useAdConversion(period: PerfPeriodKey, refreshNonce: number) {
  const [data, setData] = useState<AdConversionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seqRef = useRef(0)

  const load = useCallback(
    async ({ fresh = false }: { fresh?: boolean } = {}) => {
      const seq = ++seqRef.current
      setLoading(true)
      try {
        const url = `/api/admin/compass/ad-conversion?period=${period}${fresh ? "&fresh=1" : ""}`
        const response = await adminFetchJsonCached<AdConversionResponse>(url, undefined, {
          ttlMs: TTL_MS,
          cacheKey: `compass-ad-conversion:${period}`,
          force: fresh,
          staleIfError: !fresh,
        })
        if (seq !== seqRef.current) return
        setData(response)
        setError(null)
      } catch (e) {
        if (seq !== seqRef.current) return
        setError(e instanceof Error ? e.message : "광고별 전환 조회 실패")
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    },
    [period]
  )

  useEffect(() => {
    void load()
  }, [load])

  const handledNonceRef = useRef(refreshNonce)
  useEffect(() => {
    if (refreshNonce === handledNonceRef.current) return
    handledNonceRef.current = refreshNonce
    void load({ fresh: true })
  }, [refreshNonce, load])

  return { data, loading, error }
}

function CardShell({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5" aria-label="광고별 전환·결제">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">광고별 전환·결제</h2>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
            기간 안에 생긴 Compass CRM 리드의 현재 단계 · 집행비는 Compass 수집분(USD) · 결제 금액 미입력이라 ROAS 없음
          </p>
        </div>
        {note}
      </div>
      {children}
    </section>
  )
}

function Row({ label, sub, c }: { label: string; sub?: string | null; c: AdConversionCounts }) {
  return (
    <div className={`${ROW_GRID} py-2 text-[12px] tabular-nums text-[#1a1a1a]/80`}>
      <div className="min-w-0">
        <p className="truncate font-medium text-[#111110]">{label}</p>
        {sub && <p className="truncate text-[10.5px] text-[#1a1a1a]/40">{sub}</p>}
      </div>
      <span className="text-right">{COUNT.format(c.leads)}</span>
      <span className="text-right">{COUNT.format(c.demo)}</span>
      <span className="text-right font-semibold text-[#111110]">{COUNT.format(c.paid)}</span>
      <span className="text-right">{rate(c.paidRate)}</span>
      <span className="text-right">{money(c.costPerLead, "USD")}</span>
      <span className="text-right">{money(c.costPerPaid, "USD")}</span>
    </div>
  )
}

export function AdConversionCard({ period, refreshNonce }: { period: PerfPeriodKey; refreshNonce: number }) {
  const { data, loading, error } = useAdConversion(period, refreshNonce)
  const [view, setView] = useState<"ad" | "campaign">("campaign")
  const [expanded, setExpanded] = useState(false)

  if (!data && loading) {
    return (
      <CardShell>
        <div className="space-y-2.5" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[40px] w-full rounded-lg" />
          ))}
        </div>
      </CardShell>
    )
  }
  if (error && !data) {
    return (
      <CardShell>
        <p className="text-[12px] text-[#1a1a1a]/55">{error}</p>
      </CardShell>
    )
  }
  if (data?.down) {
    return (
      <CardShell
        note={
          <span className="rounded border border-[#d8d6cf] px-1.5 py-px text-[10px] font-medium text-[#1a1a1a]/45">
            Compass 연결 끊김
          </span>
        }
      >
        <p className="text-[12px] text-[#1a1a1a]/55">
          Compass 리드·소재 뷰를 읽지 못했습니다 — 전환이 0 인 것이 아니라 미집계입니다.
        </p>
      </CardShell>
    )
  }

  const totals = data?.totals
  const list =
    view === "ad"
      ? (data?.rows ?? []).map((r) => ({ key: r.adId, label: r.adName ?? r.adId, sub: r.campaignName, c: r }))
      : (data?.campaigns ?? []).map((r) => ({ key: r.campaignName, label: r.campaignName, sub: null, c: r }))
  const visible = expanded ? list : list.slice(0, DEFAULT_VISIBLE)

  return (
    <CardShell
      note={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {data?.truncated && (
            <span className="rounded border border-[#d8d6cf] px-1.5 py-px text-[10px] font-medium text-[#1a1a1a]/45">
              일부 미포함
            </span>
          )}
          <div className="flex rounded-lg border border-[#e8e8e4] p-0.5 text-[11px]">
            {(["campaign", "ad"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`rounded-md px-2 py-0.5 ${view === v ? "bg-[#111110] text-white" : "text-[#1a1a1a]/55"}`}
              >
                {v === "campaign" ? "캠페인" : "광고"}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {totals && (
        <p className="mb-3 text-[11.5px] tabular-nums text-[#1a1a1a]/55">
          광고 리드 {COUNT.format(totals.leads)} → 데모 {COUNT.format(totals.demo)}({rate(totals.demoRate)}) → BD인계{" "}
          {COUNT.format(totals.bd)} → 결제 {COUNT.format(totals.paid)}({rate(totals.paidRate)}) · 결제당{" "}
          {money(totals.costPerPaid, "USD")}
          {data?.unattributedLeads ? ` · 광고 id 없는 리드 ${COUNT.format(data.unattributedLeads)}건 제외` : ""}
        </p>
      )}
      {list.length === 0 ? (
        <EmptyState
          title="기간 안에 광고로 들어온 CRM 리드가 없습니다"
          description="Compass 리드에 광고 id(meta_ad_id)가 붙은 건이 없거나 집행이 없었습니다."
        />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div
              className={`${ROW_GRID} border-b border-b-[#f0f0ec] pb-2 text-[10px] font-semibold tracking-[0.08em] text-[#1a1a1a]/35`}
            >
              <span>{view === "campaign" ? "캠페인" : "광고"}</span>
              <span className="text-right">리드</span>
              <span className="text-right">데모</span>
              <span className="text-right">결제</span>
              <span className="text-right">결제율</span>
              <span className="text-right">CPL</span>
              <span className="text-right">결제당 비용</span>
            </div>
            <div className="divide-y divide-[#f0f0ec]">
              {visible.map((r) => (
                <Row key={r.key} label={r.label} sub={r.sub} c={r.c} />
              ))}
            </div>
            {error && <p className="mt-2 text-[11px] text-[#1a1a1a]/45">최신 값을 다시 받지 못했습니다 — {error}</p>}
            {list.length > DEFAULT_VISIBLE && (
              <button
                type="button"
                onClick={() => setExpanded((open) => !open)}
                aria-expanded={expanded}
                className="mt-1 w-full border-t border-[#f0f0ec] pt-2.5 pl-1.5 text-left text-[11.5px] font-medium text-[#1a1a1a]/45 transition hover:text-[#111110]"
              >
                {expanded ? "상위만 보기" : `${list.length - visible.length}개 더 보기`}
              </button>
            )}
          </div>
        </div>
      )}
    </CardShell>
  )
}
