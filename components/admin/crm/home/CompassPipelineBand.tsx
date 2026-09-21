"use client"

// CRM 홈 — M7 마케팅 파이프라인(Compass) 밴드. app/admin/crm/page.tsx 분해(2026-08-28)로 이동 — 로직 무변경.
// 2026-09-20 Compass 정리 라운드(§13 D2): 기존 3숫자 아래에 요약 블록(기간 칩·세그먼트 타일·
// 단계 퍼널·유입 플랫폼·다음 액션 임박 목록)을 추가한다. 요약은 이 파일 안에서 별도로
// GET /api/admin/crm/compass-summary 를 클라이언트 조회한다(compass-pipeline과 무관한 소스라
// 위 3숫자의 fetch·로딩·에러 상태와 완전히 분리한다 — 한쪽이 죽어도 다른 쪽을 물들이지 않는다).

import { useCallback, useEffect, useRef, useState } from "react"
import { ExternalLink, Handshake, Megaphone, ReceiptText, UserCheck } from "lucide-react"
import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import { leadSegmentHref } from "@/lib/crm/lead-segments"
import {
  COMPASS_SUMMARY_ACTION_LIMIT,
  COMPASS_SUMMARY_DEFAULT_PERIOD,
  COMPASS_SUMMARY_PERIODS,
  compassSummaryUrl,
  isCompassSummaryDown,
  type CompassSummary,
  type CompassSummaryPeriodKey,
} from "@/lib/compass/summary-contract"
import { COMPASS_STAGE_LABEL } from "@/lib/compass/normalize"
import { AD_CHANNEL_COLOR } from "@/lib/types/event-metrics"
import { EmptyState, MiniFunnel, Skeleton, StatTile, type FunnelStage } from "@/components/admin/viz"
import FreshnessCaption from "@/components/admin/crm/FreshnessCaption"
import { formatNumber, ValueSkeleton, type CompassPipelineKpis } from "./shared"

// Compass(mkt.classin.co.kr) 딥링크 — 실측 확인된 것은 lib/compass/normalize.ts의
// compassLeadUrl(개별 리드 상세)뿐이다. 아래는 crm.stages 실측 어휘(new/demo/bd/quote/won/lost)를
// 따른 최선 추정 필터 URL이며, Compass 쪽 라우팅이 바뀌면 깨질 수 있다(마케팅팀 확인 필요).
const COMPASS_LEADS_BASE_URL = "https://mkt.classin.co.kr/leads"
const COMPASS_DEMO_TODAY_URL = `${COMPASS_LEADS_BASE_URL}?stage=demo`
const COMPASS_UPCOMING_ACTIONS_URL = `${COMPASS_LEADS_BASE_URL}?sort=next_action_at`
const COMPASS_BD_OPEN_URL = `${COMPASS_LEADS_BASE_URL}?stage=bd`

// 요약 블록의 KST 하루 경계 계산 — CrmHomeClient.getKstMonthKey와 같은 "+9시간 시프트" 요령.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
function kstDayIndex(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS)
}
const KST_HH_MM = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

/**
 * 다음 액션까지 "D-시간" 문구 — 같은 KST 달력일이면 분·시간 상대값("2시간 후"),
 * 다음 날 이후면 "내일/모레/N일 후 HH:MM"(KST). 과거(지연)면 "N분/시간 지남".
 * nowMs를 인자로 받아 렌더 시각을 주입할 수 있게 한다(테스트 결정성 + SSR 안전).
 */
export function formatActionEta(nextActionAt: string | null, nowMs: number): string {
  if (!nextActionAt) return "시간 미정"
  const targetMs = Date.parse(nextActionAt)
  if (!Number.isFinite(targetMs)) return "시간 미정"
  const dayDiff = kstDayIndex(targetMs) - kstDayIndex(nowMs)
  if (dayDiff <= 0) {
    const minutes = Math.round((targetMs - nowMs) / 60_000)
    if (minutes <= 0) {
      const overdueMin = Math.abs(minutes)
      if (overdueMin < 1) return "지금"
      if (overdueMin < 60) return `${overdueMin}분 지남`
      return `${Math.round(overdueMin / 60)}시간 지남`
    }
    if (minutes < 60) return `${minutes}분 후`
    return `${Math.round(minutes / 60)}시간 후`
  }
  const hhmm = KST_HH_MM.format(new Date(targetMs))
  if (dayDiff === 1) return `내일 ${hhmm}`
  if (dayDiff === 2) return `모레 ${hhmm}`
  return `${dayDiff}일 후 ${hhmm}`
}

// ─── 요약 블록 하위 조각 ────────────────────────────────────────────────

function SegmentTiles({ summary }: { summary: CompassSummary }) {
  const periodLabel = COMPASS_SUMMARY_PERIODS.find((p) => p.key === summary.period.key)?.label ?? summary.period.key
  const suffix = summary.truncated ? "+" : ""
  const tiles = [
    {
      key: "meta_ads" as const,
      icon: <Megaphone className="h-4 w-4" />,
      label: "메타 광고 유입",
      count: summary.metaInflow,
      hint: `${periodLabel} 유입 기준`,
    },
    {
      key: "bd_handover" as const,
      icon: <Handshake className="h-4 w-4" />,
      label: "BD인계 진행",
      count: summary.bdOpen,
      hint: "전 기간",
    },
    {
      key: "existing" as const,
      icon: <UserCheck className="h-4 w-4" />,
      label: "NeoCRM 등록",
      count: summary.neoRegistered,
      hint: `${periodLabel} 유입 기준`,
    },
    {
      key: "customer" as const,
      icon: <ReceiptText className="h-4 w-4" />,
      label: "결제",
      count: summary.won,
      hint: `${periodLabel} 유입 기준`,
    },
  ]
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <StatTile
            key={tile.key}
            icon={tile.icon}
            iconLayout="inline"
            variant="bare"
            compact
            href={leadSegmentHref(tile.key)}
            label={tile.label}
            value={`${formatNumber(tile.count)}${suffix}`}
            hint={tile.hint}
          />
        ))}
      </div>
      {summary.truncated ? (
        <p className="mt-2 text-[11px] text-[#1a1a1a]/35">상한 5,000건에 닿아 일부 누락 가능</p>
      ) : null}
    </div>
  )
}

function FunnelSection({ summary }: { summary: CompassSummary }) {
  const stages: FunnelStage[] = summary.stages.map((stage) => ({ label: stage.label, value: stage.count }))
  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#1a1a1a]/30">단계 퍼널</p>
      <MiniFunnel stages={stages} />
      <p className="mt-3 text-[11px] text-[#1a1a1a]/35">
        기간 내 유입 리드의 현재 단계 기준 · 이탈 {formatNumber(summary.lost)}건 별도
      </p>
    </div>
  )
}

function PlatformBars({ summary }: { summary: CompassSummary }) {
  const rows = [...summary.byPlatform].sort((a, b) => b.count - a.count).slice(0, 5)
  const max = Math.max(1, ...rows.map((row) => row.count))
  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#1a1a1a]/30">유입 플랫폼</p>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-[#fafaf8] px-3 py-4 text-center text-[12px] text-[#1a1a1a]/35">유입 없음</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => {
            const width = Math.max(6, Math.round((row.count / max) * 100))
            const isMeta = row.key === "meta"
            return (
              <div key={row.key} className="flex items-center gap-2">
                {/* 메타 행만 앞 점을 채색 — 다른 채널은 자리만 차지하는 투명 점(정렬 유지, 색은 부여하지 않음). */}
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: isMeta ? AD_CHANNEL_COLOR.meta : "transparent" }}
                />
                <span className="w-16 shrink-0 truncate text-[12px] font-medium text-[#111110]">{row.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f0f0ec]">
                  <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: "#084734" }} />
                </div>
                <span className="w-10 shrink-0 text-right text-[12px] font-semibold tabular-nums text-[#111110]">
                  {formatNumber(row.count)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function UpcomingActionsList({ summary, nowMs }: { summary: CompassSummary; nowMs: number }) {
  const rows = summary.upcomingActions.slice(0, COMPASS_SUMMARY_ACTION_LIMIT)
  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#1a1a1a]/30">
        다음 액션 임박 {formatNumber(summary.upcomingActionCount)}건 · 상위 {COMPASS_SUMMARY_ACTION_LIMIT}
      </p>
      {rows.length === 0 ? (
        <EmptyState
          title="48시간 내 예정된 액션 없음"
          description="Compass 파이프라인에서 확인할 다음 액션이 없습니다."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((action) => {
            const title = action.academy?.trim() || action.name?.trim() || "이름 없음"
            const owner = action.caller?.trim() || action.owner?.trim() || "미배정"
            const stageLabel = action.stage ? COMPASS_STAGE_LABEL[action.stage] ?? action.stage : "-"
            return (
              <li key={action.compassLeadId}>
                <a
                  href={action.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-[#e8e8e4] px-3 py-2.5 transition-colors hover:bg-[#fafaf8]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-[#111110]">{title}</p>
                    <p className="truncate text-[11px] text-[#1a1a1a]/40">
                      {action.nextAction?.trim() || "다음 액션 없음"} · {owner} · {stageLabel}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[#084734]">
                    {formatActionEta(action.nextActionAt, nowMs)}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/30" aria-hidden="true" />
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 border-t border-[#e8e8e4] pt-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
      <div className="space-y-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
      <div className="space-y-2 lg:col-span-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}

// ─── 요약 블록 본체(테스트 용이성을 위해 summary를 순수 prop으로 받는 분리 컴포넌트) ──────
export interface CompassSummaryBlockProps {
  summary: CompassSummary | null
  loading: boolean
  error: string | null
  period: CompassSummaryPeriodKey
  onPeriodChange: (period: CompassSummaryPeriodKey) => void
  onRetry: () => void
  /** 테스트·고정 시각용(액션 목록 D-시간). 생략하면 이 컴포넌트가 마운트된 시각을 쓴다. */
  nowMs?: number
}

export function CompassSummaryBlock({
  summary,
  loading,
  error,
  period,
  onPeriodChange,
  onRetry,
  nowMs,
}: CompassSummaryBlockProps) {
  const down = isCompassSummaryDown(summary, error)
  // react-hooks/purity: Date.now()는 렌더 중 직접 호출할 수 없다(react.dev/rules-of-react) —
  // 지연 초기화(useState 콜백)는 예외라 여기서 "마운트 시각"을 한 번만 읽어 기본값으로 쓴다.
  // 호출부(CompassPipelineBand)가 summary.generatedAt을 key로 걸어, 요약이 새로 갱신될 때마다
  // 이 컴포넌트를 리마운트시켜 mountNowMs를 다시 신선하게 만든다(테스트는 nowMs prop으로 고정).
  const [mountNowMs] = useState(() => Date.now())
  const effectiveNowMs = nowMs ?? mountNowMs

  // down(브리지 자체가 끊겼거나, 데이터 없이 조회마저 실패) — 요약 블록 전체를 걷어내고
  // 무음 실패 금지 규약대로 한 줄 강등 문구만 남긴다(기존 상단 3숫자 강등과 같은 규약).
  if (down) {
    return (
      <p className="text-[13px] text-[#1a1a1a]/35">
        Compass 연결 끊김 ·{" "}
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold text-[#084734] underline underline-offset-2"
        >
          다시 확인
        </button>
      </p>
    )
  }

  const loadingCold = loading && !summary

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="기간 선택">
          {COMPASS_SUMMARY_PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={period === p.key}
              onClick={() => onPeriodChange(p.key)}
              className={`inline-flex min-h-11 items-center justify-center rounded-full border px-3 text-[12px] font-semibold transition-colors ${
                period === p.key
                  ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                  : "border-[#e8e8e4] bg-white text-[#1a1a1a]/55 hover:border-[#c8c8c4]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {summary ? (
          <FreshnessCaption
            generatedAt={summary.generatedAt}
            refreshing={loading}
            staleReason={error ? "error" : null}
            onRefresh={onRetry}
          />
        ) : null}
      </div>

      {loadingCold ? (
        <SummarySkeleton />
      ) : summary ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <SegmentTiles summary={summary} />
          </div>
          <div>
            <FunnelSection summary={summary} />
          </div>
          <div>
            <PlatformBars summary={summary} />
          </div>
          <div className="lg:col-span-2">
            <UpcomingActionsList summary={summary} nowMs={effectiveNowMs} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── 밴드 본체(오케스트레이션) ───────────────────────────────────────────
// M7 — 마케팅 파이프라인(Compass) 한 줄 밴드. 리드 요약과 같은 카드 껍데기(rounded-2xl·white·p-4)를
// 쓰지만 3항목을 한 행에 눕힌다. 각 항목은 mkt.classin.co.kr 새 탭 딥링크라 StatTile(href)이 쓰는
// next/link로는 target="_blank"를 못 붙여 순수 <a>로 직접 구성한다(그래도 bare 변형과 같은 타이포).
// down이면 무음 실패 금지 — 숫자 자리를 전부 걷어내고 무채색 한 줄 "Compass 연결 끊김"로 강등한다.
//
// 2026-09-20(§13 D2): 위 3숫자 아래에 기간 칩·세그먼트 타일·단계 퍼널·유입 플랫폼·다음 액션
// 임박 목록으로 구성된 요약 블록을 추가한다. 요약은 compass-pipeline과 별개 API
// (GET /api/admin/crm/compass-summary)라 자체 loading/error/down 상태를 이 컴포넌트 안에서
// 독립적으로 관리한다 — 위 3숫자가 죽어도 요약은 살아있을 수 있고 그 반대도 마찬가지다.
export default function CompassPipelineBand({
  data,
  loading,
  error,
  onRetry,
  refreshKey,
}: {
  data: CompassPipelineKpis | null
  loading: boolean
  error: string | null
  onRetry: () => void
  /** 부모(CrmHomeClient)의 새로고침 세대 — 바뀌면 현재 기간으로 요약을 강제 재조회한다. */
  refreshKey?: number
}) {
  const showDown = (error && !data) || data?.down

  const [period, setPeriod] = useState<CompassSummaryPeriodKey>(COMPASS_SUMMARY_DEFAULT_PERIOD)
  const [summary, setSummary] = useState<CompassSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  // 기간을 빠르게 전환할 때 늦게 도착한 응답이 화면을 덮어쓰지 않도록, 호출 시점 기간과
  // 정산 시점 "현재 선택된 기간"이 같을 때만 state를 반영한다.
  const requestedPeriodRef = useRef<CompassSummaryPeriodKey>(period)

  const fetchSummary = useCallback(async (targetPeriod: CompassSummaryPeriodKey, options?: { force?: boolean }) => {
    const baseUrl = compassSummaryUrl(targetPeriod)
    const requestUrl = options?.force ? `${baseUrl}&force=1` : baseUrl
    const hasCached = Boolean(getCachedAdminJson<CompassSummary>(baseUrl, { cacheKey: baseUrl }))
    const isCurrent = () => requestedPeriodRef.current === targetPeriod
    requestedPeriodRef.current = targetPeriod
    setSummaryLoading(options?.force || !hasCached)
    setSummaryError(null)
    try {
      const nextData = await adminFetchJsonCached<CompassSummary>(requestUrl, undefined, {
        cacheKey: baseUrl,
        ttlMs: CRM_CACHE_TTL_MS,
        force: options?.force,
        staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
        onRevalidated: ({ data: fresh }) => {
          if (fresh && isCurrent()) setSummary(fresh)
        },
      })
      if (isCurrent()) setSummary(nextData)
    } catch (err) {
      if (isCurrent()) {
        setSummaryError(err instanceof Error ? err.message : "Compass 요약을 불러오지 못했습니다.")
      }
    } finally {
      if (isCurrent()) setSummaryLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSummary(period)
  }, [period, fetchSummary])

  // 부모 새로고침(refreshAll → neoCrmRefreshKey 증가) → 현재 기간으로 강제 재조회.
  // 마운트 시 최초 1회는 위 period 이펙트가 이미 처리하므로 건너뛴다(ref 초깃값 = 마운트 시 refreshKey).
  const seenRefreshKeyRef = useRef(refreshKey)
  useEffect(() => {
    if (refreshKey === undefined) return
    if (seenRefreshKeyRef.current === refreshKey) return
    seenRefreshKeyRef.current = refreshKey
    void fetchSummary(period, { force: true })
  }, [refreshKey, period, fetchSummary])

  const handleSummaryRetry = useCallback(() => {
    void fetchSummary(period, { force: true })
  }, [fetchSummary, period])

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">마케팅 파이프라인(Compass)</p>
        {showDown ? (
          <button type="button" onClick={onRetry} className="text-[11px] font-semibold text-[#084734] underline underline-offset-2">
            다시 확인
          </button>
        ) : null}
      </div>

      {showDown ? (
        <p className="text-[13px] text-[#1a1a1a]/35">Compass 연결 끊김</p>
      ) : (
        <div className="flex flex-wrap items-stretch gap-4">
          {[
            { key: "demo", label: "오늘 데모", hint: "Compass 데모 일정", value: data?.todayDemoCount, href: COMPASS_DEMO_TODAY_URL },
            { key: "next", label: "다음 액션 임박", hint: "48시간 이내", value: data?.upcomingActionCount, href: COMPASS_UPCOMING_ACTIONS_URL },
            { key: "bd", label: "BD인계 진행", hint: "수금 대기", value: data?.bdOpenCount, href: COMPASS_BD_OPEN_URL },
          ].map((item) => (
            <a
              key={item.key}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-[168px] flex-1 items-center justify-between gap-3 border-t border-[#e8e8e4] pt-3 transition-opacity hover:opacity-70"
            >
              <span>
                <span className="block text-[11px] font-medium uppercase tracking-[0.1em] text-[#1a1a1a]/40">{item.label}</span>
                <span className="mt-0.5 block text-[11px] text-[#1a1a1a]/35">{item.hint}</span>
              </span>
              <span className="flex items-center gap-1 text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[#084734]">
                {loading && !data ? <ValueSkeleton className="h-7 w-10" /> : formatNumber(item.value)}
                <ExternalLink className="h-3.5 w-3.5 text-[#1a1a1a]/30" />
              </span>
            </a>
          ))}
        </div>
      )}

      {/* §13 D2 — Compass 정리 요약 블록. compass-pipeline(위 3숫자)과 무관한 별도 소스라
          독립된 loading/error/down으로 그린다. */}
      <div className="mt-4 border-t border-[#e8e8e4] pt-4">
        <CompassSummaryBlock
          // summary가 새로 갱신될 때마다 리마운트해 내부 mountNowMs(D-시간 기준)를 신선하게 되돌린다.
          key={summary?.generatedAt ?? "pending"}
          summary={summary}
          loading={summaryLoading}
          error={summaryError}
          period={period}
          onPeriodChange={setPeriod}
          onRetry={handleSummaryRetry}
        />
      </div>
    </section>
  )
}
