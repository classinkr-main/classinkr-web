"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { EmptyState, Skeleton } from "@/components/admin/viz"
import { COUNT, PCT1, money } from "@/components/admin/campaigns/event-format"
import { adminFetchJsonCached } from "@/lib/admin-client"
import type { CompassAdsetRow, CompassAdsetTotals } from "@/lib/marketing/compass-adset"
import type { PerfPeriodKey } from "@/lib/marketing/perf"

// 광고세트별 성과 — 원천은 Compass 브리지(compass_adsets_v, adset 레벨 Meta insights) 하나다.
// 우리 meta_insights_daily 는 캠페인 레벨이라 여기 섞지 않는다(집계 단위가 달라 이중계상).
// 소재별 CPL 카드(CreativeCplCard)와 같은 패턴 — 한 단 위 해상도(세트)라 썸네일·스파크라인은 없다.
//
// 정직 규칙(compass-creative.ts 와 동일):
//  - leads 는 Meta 리포트 리드(Compass 수집분)다. KPI 스트립의 리드(우리 leads 테이블)와
//    모집단이 다르므로 두 숫자가 달라 보이는 것이 정상이고, 캡션이 그 사실을 말한다.
//  - CPL 은 Compass 축끼리(spend ÷ Compass leads) 나눈 값이다. 축을 섞은 CPL 은 만들지 않는다.
//  - 매출·ROAS 는 없다. 표기하지 않는다.
//  - 브리지가 죽으면 0 으로 강등하지 않고 "Compass 연결 끊김" 무채색 배지로 밝힌다.

interface CompassAdsetsResponse {
  period: { key: PerfPeriodKey; since: string; until: string }
  down: boolean
  /** 조회가 행 상한에 닿았을 때 — 합계를 "전체"라고 부르지 않기 위한 신호. */
  truncated?: boolean
  error?: string
  rows?: CompassAdsetRow[]
  totals?: CompassAdsetTotals
}

// ads 카드(45초)와 같은 신선도 계약 — 같은 페이지 스냅샷 리듬으로 갱신된다.
const TTL_MS = 45_000
/** 접기 전 기본 노출 행수 — 지출순 상위 N. */
const DEFAULT_VISIBLE = 6

function useCompassAdsets(period: PerfPeriodKey, refreshNonce: number) {
  const [data, setData] = useState<CompassAdsetsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seqRef = useRef(0)

  const load = useCallback(
    async ({ fresh = false }: { fresh?: boolean } = {}) => {
      const seq = ++seqRef.current
      setLoading(true)
      try {
        const url = `/api/admin/compass/adsets?period=${period}${fresh ? "&fresh=1" : ""}`
        const response = await adminFetchJsonCached<CompassAdsetsResponse>(url, undefined, {
          ttlMs: TTL_MS,
          cacheKey: `compass-adsets:${period}`,
          force: fresh,
          staleIfError: !fresh,
        })
        if (seq !== seqRef.current) return
        setData(response)
        setError(null)
      } catch (e) {
        if (seq !== seqRef.current) return
        setError(e instanceof Error ? e.message : "광고세트 지표 조회 실패")
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

  return { data, loading, error, reload: load }
}

/* ─── 표시 조각 ──────────────────────────────────────────────── */

const ROW_GRID =
  "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_88px_56px_76px_64px_84px] items-center gap-x-4 px-1"

/** ctr·spendShare(0~1 비율) 표시 포맷 — null 은 미집계(0 으로 포장하지 않는다). */
function ratioPct(value: number | null): string {
  return value != null ? `${PCT1.format(value * 100)}%` : "—"
}

function AdsetRow({ row }: { row: CompassAdsetRow }) {
  const name = row.adsetName ?? row.adsetId
  return (
    <div className={`${ROW_GRID} py-2.5`}>
      <p className="truncate text-[13px] font-semibold text-[#111110]">{name}</p>
      <p className="truncate text-[12px] text-[#1a1a1a]/55">{row.campaignName ?? "—"}</p>
      <p className="text-right text-[13px] tabular-nums text-[#1a1a1a]/70">
        {money(row.spendUsd, "USD")}
      </p>
      <p className="text-right text-[13px] font-semibold tabular-nums text-[#111110]">
        {COUNT.format(row.leads)}
      </p>
      <p className="text-right text-[13px] font-semibold tabular-nums text-[#111110]">
        {row.cplUsd != null ? money(row.cplUsd, "USD") : "—"}
      </p>
      <p className="text-right text-[12px] tabular-nums text-[#1a1a1a]/55">{ratioPct(row.ctr)}</p>
      <p className="text-right text-[12px] tabular-nums text-[#1a1a1a]/55">
        {ratioPct(row.spendShare)}
      </p>
    </div>
  )
}

function CardShell({
  children,
  note,
}: {
  children: React.ReactNode
  note?: React.ReactNode
}) {
  return (
    <section
      className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5"
      aria-label="광고세트별 성과"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">광고세트별 성과</h2>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
            광고세트별 지표는 Compass 수집분(캠페인 광고계정 동일) · 리드는 Meta 리포트
            리드(Compass 수집분)
          </p>
        </div>
        {note}
      </div>
      {children}
    </section>
  )
}

/* ─── 본체 ──────────────────────────────────────────────────── */

export function AdsetPerfCard({
  period,
  refreshNonce,
}: {
  period: PerfPeriodKey
  /** 페이지 헤더 "동기화" 트리거 — 증가할 때마다 캐시 우회 재조회. */
  refreshNonce: number
}) {
  const { data, loading, error } = useCompassAdsets(period, refreshNonce)
  const [expanded, setExpanded] = useState(false)

  const rows = useMemo(() => data?.rows ?? [], [data])
  const visible = expanded ? rows : rows.slice(0, DEFAULT_VISIBLE)
  const hiddenCount = rows.length - visible.length

  if (!data && loading) {
    return (
      <CardShell>
        <div className="space-y-2.5" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[38px] w-full rounded-lg" />
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

  // 브리지 다운 — 무채색 강등. 숫자를 0 으로 채우지 않는다.
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
          Compass 광고세트 뷰를 읽지 못해 세트별 지출·CPL 을 표시할 수 없습니다 — 값이 0 인 것이
          아니라 미집계입니다.
        </p>
      </CardShell>
    )
  }

  const totals = data?.totals

  return (
    <CardShell
      note={
        totals && totals.adsetCount > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <p className="text-[11px] tabular-nums text-[#1a1a1a]/45">
              세트 {COUNT.format(totals.adsetCount)} · 지출 {money(totals.spendUsd, "USD")} · 평균
              CPL {totals.cplUsd != null ? money(totals.cplUsd, "USD") : "—"}
            </p>
            {/* 행 상한에 닿았으면 합계를 "전체"라고 부를 수 없다 — 부분 집계임을 밝힌다. */}
            {data?.truncated && (
              <span className="rounded border border-[#d8d6cf] px-1.5 py-px text-[10px] font-medium text-[#1a1a1a]/45">
                일부 일자 미포함
              </span>
            )}
          </div>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title="기간 내 집계된 광고세트가 없습니다"
          description="Compass 가 수집한 광고세트(adset) 레벨 성과가 이 기간에 없습니다 — 집행이 없었거나 동기화가 아직 밀려 있습니다."
        />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div
              className={`${ROW_GRID} border-b border-b-[#f0f0ec] pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]/35`}
            >
              <span>광고세트</span>
              <span>캠페인</span>
              <span className="text-right">지출 USD</span>
              <span className="text-right">리드</span>
              <span className="text-right">CPL</span>
              <span className="text-right">CTR</span>
              <span className="text-right">지출 비중</span>
            </div>
            <div className="divide-y divide-[#f0f0ec]">
              {visible.map((row) => (
                <AdsetRow key={row.adsetId} row={row} />
              ))}
            </div>
            {/* 재조회 실패는 화면을 비우지 않고 밝히기만 한다(직전 값 유지 — 무음 강등 금지). */}
            {error && (
              <p className="mt-2 text-[11px] text-[#1a1a1a]/45">
                최신 값을 다시 받지 못했습니다 — {error}
              </p>
            )}
            {rows.length > DEFAULT_VISIBLE && (
              <button
                type="button"
                onClick={() => setExpanded((open) => !open)}
                aria-expanded={expanded}
                className="mt-1 w-full border-t border-[#f0f0ec] pt-2.5 pl-1.5 text-left text-[11.5px] font-medium text-[#1a1a1a]/45 transition hover:text-[#111110]"
              >
                {expanded ? "상위 세트만 보기" : `세트 ${hiddenCount}개 더 보기`}
              </button>
            )}
          </div>
        </div>
      )}
    </CardShell>
  )
}
