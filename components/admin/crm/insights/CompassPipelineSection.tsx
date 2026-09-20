"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { EmptyState, Skeleton } from "@/components/admin/viz"
import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import { COMPASS_CARE_STAGE_LABEL } from "@/lib/compass/normalize"
import {
  COMPASS_SUMMARY_DEFAULT_PERIOD,
  COMPASS_SUMMARY_MAX_ROWS,
  COMPASS_SUMMARY_PERIODS,
  compassSummaryUrl,
  isCompassSummaryDown,
} from "@/lib/compass/summary-contract"
import type { CompassSummary, CompassSummaryCount, CompassSummaryOwnerRow, CompassSummaryPeriodKey } from "@/lib/compass/summary-contract"
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import { AD_CHANNEL_COLOR } from "@/lib/types/event-metrics"
import FreshnessCaption from "../FreshnessCaption"

/**
 * CRM §13 D3 — 인사이트 "Compass 파이프라인" 섹션.
 *
 * Compass(mkt.classin.co.kr) 브리지를 정리해 보여주는 시각 섹션. 금액은 다루지 않는다(매출은
 * revenue/rev-sheet가 정본 — lib/compass/summary-contract.ts 규칙). 응답 계약은
 * lib/compass/summary-contract.ts 하나이며, 이 파일은 그 타입만 믿고 만든다(API 구현은 별도 병렬 작업).
 *
 * 담당별 진행(표)·케어 사다리·유입 플랫폼·이탈 사유는 전부 순수 CSS 막대/표로 그린다 —
 * RankedHorizontalBars(Recharts)는 이 저장소의 vitest 환경(environment: "node", jsdom 없음)에서
 * ResponsiveContainer가 실제 DOM 측정 없이는 내용을 그리지 않아 renderToStaticMarkup 테스트로
 * 값을 못 잡는다. MiniFunnel도 후보였지만 bar variant가 단계별 opacity 감쇠와 "이전 단계 대비
 * 전환율" 보조 텍스트를 자동으로 붙여 "단일 색 #084734 + 건수만 직접 표기"라는 요구와 어긋난다
 * (케어 사다리는 순차 전환 퍼널이 아니라 병렬 단계 묶음이라 전환율 문구 자체가 오해를 부른다).
 * 그래서 CrmInsightsClient 자신이 이미 쓰는 "전환 퍼널"/"채널별 전환율" 수동 바 패턴을 그대로 따랐다.
 */

const PERIOD_CHIP_ACTIVE_CLASS = "border-[#111110] bg-[#111110] text-white"
const PERIOD_CHIP_IDLE_CLASS = "border-[#e8e8e4] bg-white text-[#111110] hover:bg-[#f5f5f2]"
const RETRY_BUTTON_CLASS =
  "min-h-11 shrink-0 font-semibold text-[#084734] underline underline-offset-2 sm:min-h-0"

const OWNER_COLUMNS: ReadonlyArray<{ key: keyof CompassSummaryOwnerRow; label: string }> = [
  { key: "total", label: "유입" },
  { key: "demo", label: "데모" },
  { key: "bd", label: "BD인계" },
  { key: "won", label: "결제" },
  { key: "lost", label: "이탈" },
]

function ko(value: number) {
  return value.toLocaleString("ko-KR")
}

/** 블록 1 — 담당별 진행 표. 상위 8(계약이 이미 제한·정렬) · 합계 행 없음 · 미배정은 흐리게. */
function CompassOwnerTable({ rows }: { rows: CompassSummaryOwnerRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="담당별 진행을 표시할 데이터가 없습니다."
        description="기간 내 Compass 유입이 없으면 담당별 진행 표가 비어 있습니다."
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-[#f0f0ec] text-[11px] font-semibold text-[#1a1a1a]/40">
            <th scope="col" className="py-1.5 pr-2 text-left font-semibold">
              담당
            </th>
            {OWNER_COLUMNS.map((col) => (
              <th key={col.key} scope="col" className="px-2 py-1.5 text-right font-semibold tabular-nums">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const unassigned = row.owner === "미배정"
            const rowTextClass = unassigned ? "text-[#1a1a1a]/40" : "text-[#111110]"
            return (
              <tr
                key={row.owner}
                data-owner={row.owner}
                data-unassigned={unassigned ? "true" : undefined}
                className={`border-b border-[#f6f5f4] last:border-0 ${rowTextClass}`}
              >
                <td className="max-w-[120px] truncate py-1.5 pr-2 text-left font-semibold">{row.owner}</td>
                {OWNER_COLUMNS.map((col) => (
                  <td key={col.key} data-col={col.key} className="px-2 py-1.5 text-right tabular-nums">
                    {ko(row[col.key] as number)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-[#1a1a1a]/35">담당 상위 8 · 유입 건수 기준 정렬 · 합계 행 없음</p>
    </div>
  )
}

/** 블록 2 — 케어 사다리. 계약이 5단계·0건 포함으로 이미 보장(COMPASS_CARE_STAGES 순서). */
function CompassCareLadder({ stages }: { stages: CompassSummaryCount[] }) {
  const allZero = stages.length === 0 || stages.every((stage) => stage.count <= 0)
  if (allZero) {
    return (
      <p className="rounded-xl bg-[#fafaf8] px-3 py-6 text-center text-[13px] text-[#1a1a1a]/40">
        케어 단계 데이터 없음
      </p>
    )
  }

  const max = Math.max(1, ...stages.map((stage) => stage.count))
  return (
    <div className="space-y-2">
      {stages.map((stage) => {
        const width = Math.max(4, Math.round((stage.count / max) * 100))
        const label = COMPASS_CARE_STAGE_LABEL[stage.key] ?? stage.label ?? stage.key
        return (
          <div key={stage.key} data-care-stage={stage.key} className="flex items-center gap-3">
            <span className="w-24 shrink-0 truncate text-[12px] font-medium text-[#1a1a1a]/55">{label}</span>
            <div className="h-6 flex-1 overflow-hidden rounded-lg bg-[#f0f0ec]">
              <div
                className="flex h-full items-center rounded-lg px-2 text-[12px] font-bold tabular-nums text-white"
                style={{ width: `${width}%`, backgroundColor: "#084734" }}
              >
                {ko(stage.count)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 블록 3 — 유입 플랫폼 상위 6. 냉색 금지 — 막대는 전부 브랜드 그린, 메타 행만 점(AD_CHANNEL_COLOR.meta). */
function CompassPlatformBars({ platforms, inflowTotal }: { platforms: CompassSummaryCount[]; inflowTotal: number }) {
  const top = [...platforms].sort((a, b) => b.count - a.count).slice(0, 6)
  if (top.length === 0) {
    return (
      <p className="rounded-xl bg-[#fafaf8] px-3 py-6 text-center text-[13px] text-[#1a1a1a]/40">
        유입 플랫폼 데이터 없음
      </p>
    )
  }

  const max = Math.max(1, ...top.map((platform) => platform.count))
  return (
    <div>
      <div className="space-y-2">
        {top.map((platform) => {
          const width = Math.max(4, Math.round((platform.count / max) * 100))
          const isMeta = platform.key === "meta"
          return (
            <div key={platform.key} data-platform={platform.key} className="flex items-center gap-3">
              <span className="flex w-20 shrink-0 items-center gap-1.5 text-[12px] font-medium text-[#1a1a1a]/55">
                {isMeta ? (
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: AD_CHANNEL_COLOR.meta }}
                  />
                ) : null}
                <span className="truncate">{platform.label}</span>
              </span>
              <div className="h-6 flex-1 overflow-hidden rounded-lg bg-[#fafaf8]">
                <div
                  className="flex h-full items-center rounded-lg px-2 text-[12px] font-bold tabular-nums text-white"
                  style={{ width: `${width}%`, backgroundColor: "#084734" }}
                >
                  {ko(platform.count)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] text-[#1a1a1a]/35">
        기간 내 전체 유입 {ko(inflowTotal)}건 · 상위 6개 플랫폼
      </p>
    </div>
  )
}

/** 블록 4 — 이탈 사유 상위 5(계약이 이미 제한). 헤더에 이탈 총건수(lost), 0이면 목록 대신 안내. */
function CompassLostReasons({ lost, lostReasons }: { lost: number; lostReasons: CompassSummaryCount[] }) {
  const noLoss = lost <= 0 || lostReasons.length === 0
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-bold text-[#111110]">이탈 사유 상위 5</h3>
        <span className="text-[11px] font-semibold tabular-nums text-[#B85C33]">이탈 {ko(lost)}건</span>
      </div>
      {noLoss ? (
        <p className="rounded-xl bg-[#fafaf8] px-3 py-6 text-center text-[13px] text-[#1a1a1a]/40">
          기간 내 이탈 없음
        </p>
      ) : (
        <ol className="space-y-1.5">
          {lostReasons.map((reason) => (
            <li
              key={reason.key}
              data-lost-reason={reason.key}
              className="flex items-center justify-between gap-3 text-[12px] tabular-nums"
            >
              <span className="min-w-0 truncate font-medium text-[#31302E]">{reason.label}</span>
              <span className="shrink-0 font-semibold text-[#111110]">{ko(reason.count)}건</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export interface CompassPipelineSectionViewProps {
  summary: CompassSummary | null
  loading: boolean
  refreshing: boolean
  error: string | null
  period: CompassSummaryPeriodKey
  onPeriodChange: (period: CompassSummaryPeriodKey) => void
  onRefresh: () => void
}

/** 표시 전용 View — 조회 방식과 무관하게 summary를 prop으로 받아 그린다(테스트는 이 컴포넌트를 직접 마운트). */
export function CompassPipelineSectionView({
  summary,
  loading,
  refreshing,
  error,
  period,
  onPeriodChange,
  onRefresh,
}: CompassPipelineSectionViewProps) {
  const initialLoading = loading && !summary
  // isCompassSummaryDown: 데이터 없음+에러 또는 data.down=true를 한 곳에서 "다운"으로 묶는다.
  // summary가 있고 down이 아니면(=이전에 정상 응답을 받아둔 상태) 이번 새로고침의 error는
  // "실패 인라인 캡션"으로만 내려간다 — 이미 보여줄 값이 있는데 본문을 걷어내지 않는다.
  const down = isCompassSummaryDown(summary, error)
  const refreshFailed = !down && Boolean(error)

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4" aria-labelledby="crm-compass-pipeline-title">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="crm-compass-pipeline-title" className="text-[15px] font-bold text-[#111110]">
            Compass 파이프라인 · 마케팅팀 CRM 정리
          </h2>
          <FreshnessCaption
            generatedAt={summary?.generatedAt ?? null}
            refreshing={refreshing}
            onRefresh={onRefresh}
            className="mt-0.5"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Compass 기간 선택">
          {COMPASS_SUMMARY_PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onPeriodChange(p.key)}
              aria-pressed={period === p.key}
              className={`h-11 rounded-lg border px-3 text-[12px] font-semibold transition-colors ${
                period === p.key ? PERIOD_CHIP_ACTIVE_CLASS : PERIOD_CHIP_IDLE_CLASS
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {initialLoading ? (
        // Skeleton(viz/primitives)이 이미 #F0F0EC(bg-[#f0f0ec])를 쓴다 — 여기서 다시 칠하지 않는다.
        <div className="space-y-2" data-testid="compass-skeleton">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      ) : down ? (
        <p className="text-[13px] text-[#1a1a1a]/35">
          Compass 연결 끊김
          <span aria-hidden="true"> · </span>
          <button type="button" onClick={onRefresh} className={RETRY_BUTTON_CLASS}>
            다시 확인
          </button>
        </p>
      ) : summary ? (
        <>
          {summary.truncated ? (
            <p className="mb-3 text-[11px] font-medium text-[#8D6C1F]">
              상한 {ko(COMPASS_SUMMARY_MAX_ROWS)}건 · 일부 누락 가능
            </p>
          ) : null}

          {refreshFailed ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] font-medium text-[#B85C33]">
              <span>{error}</span>
              <button type="button" onClick={onRefresh} className={RETRY_BUTTON_CLASS}>
                다시 확인
              </button>
            </div>
          ) : null}

          <div>
            <h3 className="mb-2 text-[12px] font-bold text-[#111110]">담당별 진행</h3>
            <CompassOwnerTable rows={summary.byOwner} />
          </div>

          <div className="mt-4 border-t border-[#f0f0ec] pt-4">
            <h3 className="mb-2 text-[12px] font-bold text-[#111110]">케어 사다리</h3>
            <CompassCareLadder stages={summary.careStages} />
          </div>

          <div className="mt-4 border-t border-[#f0f0ec] pt-4">
            <h3 className="mb-2 text-[12px] font-bold text-[#111110]">유입 플랫폼</h3>
            <CompassPlatformBars platforms={summary.byPlatform} inflowTotal={summary.inflowTotal} />
          </div>

          <div className="mt-4 border-t border-[#f0f0ec] pt-4">
            <CompassLostReasons lost={summary.lost} lostReasons={summary.lostReasons} />
          </div>
        </>
      ) : null}
    </section>
  )
}

/** 조회 훅 — period별 URL을 캐시 키로 써서 기간 전환마다 독립적으로 캐시·재조회된다. */
function useCompassPipelineSummary() {
  const [period, setPeriod] = useState<CompassSummaryPeriodKey>(COMPASS_SUMMARY_DEFAULT_PERIOD)
  const [summary, setSummary] = useState<CompassSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 기간 칩을 빠르게 넘나들 때(7일→30일→7일) 늦게 도착한 이전 요청 응답이 이미 최신인 화면을
  // 덮어쓰지 않도록 막는 세대 가드 — 이 값과 다르면 그 사이 더 최근 load()가 시작된 것이다.
  const requestIdRef = useRef(0)

  const load = useCallback(async (targetPeriod: CompassSummaryPeriodKey, options?: { force?: boolean }) => {
    const requestId = ++requestIdRef.current
    const isCurrent = () => requestIdRef.current === requestId

    const url = compassSummaryUrl(targetPeriod)
    const cached = getCachedAdminJson<CompassSummary>(url, { cacheKey: url })
    if (cached && !options?.force) setSummary(cached)

    setLoading(!cached)
    setRefreshing(Boolean(options?.force))
    setError(null)
    try {
      const next = await adminFetchJsonCached<CompassSummary>(url, undefined, {
        cacheKey: url,
        ttlMs: CRM_CACHE_TTL_MS,
        staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
        force: options?.force,
        onRevalidated: ({ data: fresh }) => {
          if (fresh && isCurrent()) setSummary(fresh)
        },
      })
      if (isCurrent()) setSummary(next)
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : "Compass 요약을 불러오지 못했습니다.")
    } finally {
      if (isCurrent()) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    void load(period)
  }, [load, period])

  const onRefresh = useCallback(() => {
    void load(period, { force: true })
  }, [load, period])

  return { summary, loading, refreshing, error, period, onPeriodChange: setPeriod, onRefresh }
}

/** 조회 훅 + View 결합 — CrmInsightsClient가 마운트하는 실제 섹션. */
export default function CompassPipelineSection() {
  const state = useCompassPipelineSummary()
  return <CompassPipelineSectionView {...state} />
}
