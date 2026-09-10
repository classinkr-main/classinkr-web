"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { EmptyState, Skeleton } from "@/components/admin/viz"
import { COUNT, money, previewText } from "@/components/admin/campaigns/event-format"
import { adminFetchJsonCached } from "@/lib/admin-client"
import type { CompassCreativeRow, CompassCreativeTotals } from "@/lib/marketing/compass-creative"
import type { PerfPeriodKey } from "@/lib/marketing/perf"

// 소재별 CPL — 원천은 Compass 브리지(compass_ads_v, ad 레벨 Meta insights) 하나다.
// 우리 meta_insights_daily 는 캠페인 레벨이라 여기 섞지 않는다(집계 단위가 달라 이중계상).
//
// 정직 규칙:
//  - leads 는 Meta 리포트 리드(Compass 수집분)다. KPI 스트립의 리드(우리 leads 테이블)와
//    모집단이 다르므로 두 숫자가 달라 보이는 것이 정상이고, 캡션이 그 사실을 말한다.
//  - CPL 은 Compass 축끼리(spend ÷ Compass leads) 나눈 값이다. 축을 섞은 CPL 은 만들지 않는다.
//  - 매출·ROAS 는 없다. 표기하지 않는다.
//  - 브리지가 죽으면 0 으로 강등하지 않고 "Compass 연결 끊김" 무채색 배지로 밝힌다.

// Sparkline 은 Recharts 의존 — 이 카드 자체가 SummaryTab 에서 dynamic(ssr:false) 청크다.
const Sparkline = dynamic(
  () => import("@/components/admin/viz/Sparkline").then((m) => m.Sparkline),
  { ssr: false, loading: () => <div className="h-[26px]" /> }
)

interface CompassAdsResponse {
  period: { key: PerfPeriodKey; since: string; until: string }
  down: boolean
  /** 조회가 행 상한에 닿았을 때 — 합계를 "전체"라고 부르지 않기 위한 신호. */
  truncated?: boolean
  error?: string
  rows?: CompassCreativeRow[]
  totals?: CompassCreativeTotals
  sparkline?: { days: number; since: string; until: string }
}

// perf(45초)와 같은 신선도 계약 — 소재 지표도 같은 스냅샷 리듬으로 갱신된다.
const TTL_MS = 45_000
/** 접기 전 기본 노출 행수 — 리드순 상위 N. */
const DEFAULT_VISIBLE = 6

function useCompassAds(period: PerfPeriodKey, refreshNonce: number) {
  const [data, setData] = useState<CompassAdsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seqRef = useRef(0)

  const load = useCallback(
    async ({ fresh = false }: { fresh?: boolean } = {}) => {
      const seq = ++seqRef.current
      setLoading(true)
      try {
        const url = `/api/admin/compass/ads?period=${period}${fresh ? "&fresh=1" : ""}`
        const response = await adminFetchJsonCached<CompassAdsResponse>(url, undefined, {
          ttlMs: TTL_MS,
          cacheKey: `compass-ads:${period}`,
          force: fresh,
          staleIfError: !fresh,
        })
        if (seq !== seqRef.current) return
        setData(response)
        setError(null)
      } catch (e) {
        if (seq !== seqRef.current) return
        setError(e instanceof Error ? e.message : "소재 지표 조회 실패")
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

// 좌측 2px 는 스코어보드와 같은 스트립 자리(여기선 항상 투명) — 두 표의 열 시작선을 맞춘다.
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_56px_84px_84px_104px] items-center gap-x-4 border-l-2 border-l-transparent px-1"

/**
 * 크리에이티브 썸네일 — Meta CDN 원본 URL 을 그대로 건다.
 * 우리 CSP img-src 에 Meta CDN 호스트가 없어 차단될 수 있고, 서명 URL 이라 만료되기도 한다.
 * 어느 쪽이든 깨진 이미지 아이콘을 남기지 않고 무채색 이니셜 타일로 조용히 내려앉는다
 * (없는 그림을 지어내지도, 깨진 자리를 방치하지도 않는다).
 *
 * failed 상태는 effect 로 되돌리지 않고 호출부의 key={src} 로 리셋한다 — URL 이 바뀌면
 * 컴포넌트를 새로 마운트하는 쪽이 "prop 이 바뀌면 state 초기화"의 정석이다.
 */
function CreativeThumb({ src, label }: { src: string | null; label: string }) {
  const [failed, setFailed] = useState(false)

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 외부 CDN 서명 URL(만료·차단 가능) — next/image 원격 패턴 대상 아님
      <img
        src={src}
        alt=""
        aria-hidden
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-9 w-9 shrink-0 rounded-md border border-[#e8e8e4] object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#e8e8e4] bg-[#f7f7f4] text-[11px] font-semibold text-[#1a1a1a]/35"
    >
      {label.slice(0, 2) || "—"}
    </span>
  )
}

function CreativeRow({ row }: { row: CompassCreativeRow }) {
  const name = row.adName ?? row.adId
  const copy = previewText(row.title ?? row.body, 60)
  const hasLeads = row.sparkline.some((value) => value > 0)
  return (
    <div className={`${ROW_GRID} py-2.5`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <CreativeThumb key={row.thumbUrl ?? "no-thumb"} src={row.thumbUrl} label={name} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[#111110]">{name}</p>
          <p className="mt-0.5 truncate text-[11px] text-[#1a1a1a]/45">
            {copy ?? row.adsetName ?? row.campaignName ?? "소재 문구 없음"}
          </p>
        </div>
      </div>
      <p className="text-right text-[13px] font-semibold tabular-nums text-[#111110]">
        {COUNT.format(row.leads)}
      </p>
      <p className="text-right text-[13px] tabular-nums text-[#1a1a1a]/70">
        {money(row.spendUsd, "USD")}
      </p>
      <p className="text-right text-[13px] font-semibold tabular-nums text-[#111110]">
        {row.cplUsd != null ? money(row.cplUsd, "USD") : "—"}
      </p>
      <div className="pl-1">
        {row.sparkline.length === 0 ? (
          <span className="text-[11px] text-[#A39E98]">—</span>
        ) : hasLeads ? (
          <Sparkline data={row.sparkline} tone="brand" height={26} />
        ) : (
          <span className="text-[11px] tabular-nums text-[#1a1a1a]/40">리드 0</span>
        )}
      </div>
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
      aria-label="소재별 CPL"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">소재별 CPL</h2>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
            소재별 지표는 Compass 수집분(캠페인 광고계정 동일) · 리드는 Meta 리포트 축
          </p>
        </div>
        {note}
      </div>
      {children}
    </section>
  )
}

/* ─── 본체 ──────────────────────────────────────────────────── */

export function CreativeCplCard({
  period,
  refreshNonce,
}: {
  period: PerfPeriodKey
  /** 페이지 헤더 "동기화" 트리거 — 증가할 때마다 캐시 우회 재조회. */
  refreshNonce: number
}) {
  const { data, loading, error } = useCompassAds(period, refreshNonce)
  const [expanded, setExpanded] = useState(false)

  const rows = useMemo(() => data?.rows ?? [], [data])
  const visible = expanded ? rows : rows.slice(0, DEFAULT_VISIBLE)
  const hiddenCount = rows.length - visible.length

  if (!data && loading) {
    return (
      <CardShell>
        <div className="space-y-2.5" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[46px] w-full rounded-lg" />
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
          Compass 소재 뷰를 읽지 못해 소재별 지출·CPL 을 표시할 수 없습니다 — 값이 0 인 것이
          아니라 미집계입니다.
        </p>
      </CardShell>
    )
  }

  const totals = data?.totals
  const sparklineDays = data?.sparkline?.days ?? 14

  return (
    <CardShell
      note={
        totals && totals.adCount > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <p className="text-[11px] tabular-nums text-[#1a1a1a]/45">
              소재 {COUNT.format(totals.adCount)} · 지출 {money(totals.spendUsd, "USD")} · 평균 CPL{" "}
              {totals.cplUsd != null ? money(totals.cplUsd, "USD") : "—"}
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
          title="기간 내 집계된 소재가 없습니다"
          description="Compass 가 수집한 광고(ad) 레벨 성과가 이 기간에 없습니다 — 집행이 없었거나 동기화가 아직 밀려 있습니다."
        />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div
              className={`${ROW_GRID} border-b border-b-[#f0f0ec] pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]/35`}
            >
              <span>소재</span>
              <span className="text-right">리드</span>
              <span className="text-right">지출 USD</span>
              <span className="text-right">CPL</span>
              <span className="pl-1">리드 {sparklineDays}일</span>
            </div>
            <div className="divide-y divide-[#f0f0ec]">
              {visible.map((row) => (
                <CreativeRow key={row.adId} row={row} />
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
                {expanded ? "상위 소재만 보기" : `소재 ${hiddenCount}개 더 보기`}
              </button>
            )}
          </div>
        </div>
      )}
    </CardShell>
  )
}
