"use client"

// Overview 마케팅 성과 축약 스트립 — 광고비·리드·CPL·리드 전환율 4칸.
//
// ── 왜 자체 fetch 인가 ────────────────────────────────────────────────────────
// 숫자를 새로 집계하지 않는다. 캠페인 허브(요약 탭)와 같은 단일 엔드포인트
// /api/admin/marketing/perf 하나만 읽는다 — Overview 가 리드를 따로 세면 "광고 리드"라는
// 같은 말에 네 번째 다른 숫자가 생긴다(현재 Overview 의 "캠페인 상태"는 광고가 아니라 이메일
// 뉴스레터 발송 이력이고, 리드 정의도 허브와 다르다).
// 클라이언트 캐시 슬롯도 허브(SummaryTab usePerf)와 같은 cacheKey 를 쓴다 — 두 화면을 오가면
// 같은 응답을 재사용하므로, 표시가 어긋날 여지 자체가 없다.
//
// ── 마운트 지점(권장) ────────────────────────────────────────────────────────
// app/admin/overview/page.tsx 의 "(c) 흐름 지표" 섹션이 닫히는 </section> 바로 다음,
// "문의 유입 추이 / 주요 유입 경로" 그리드 <div> 위에 한 줄로 넣는다:
//
//     <MarketingPerfStrip />
//
// 근거:
//  1) 같은 퍼널의 반대쪽 절반이다. 흐름 지표는 리드 유입·전환·방문자·매출 페이싱 — 퍼널의
//     결과 쪽만 말한다. 광고비·CPL 은 그 앞단(투입) 축이라, 붙여 두면 "얼마 써서 얼마 들어왔나"가
//     한 화면에서 닫힌다. 떨어뜨리면 CPL 이 어떤 리드의 CPL 인지 눈으로 이을 수 없다.
//  2) 페이지가 스스로 정한 위계와 맞는다. (a) 운영 OS·(b) 오늘 할 일이 행동 신호이고,
//     (c) 주석이 "관망 지표는 신호 아래로 하강 배치"라고 못박았다. 마케팅 성과는 관망 지표이므로
//     신호 블록 위로 올리면 안 되고, 흐름 지표 옆이 그 규칙을 지키는 가장 높은 자리다.
//  3) 형식이 같다. 인바운드 요약·흐름 지표와 동일한 전폭 KPI 스트립(모바일 스냅 스크롤 → md 그리드)이라
//     레이아웃 문법이 이미 있다.
//
// "캠페인 상태" 카드 위는 권하지 않는다: 그 카드는 이메일 뉴스레터 발송 이력(수신자 수·제목)이라
// 광고 성과와 축이 다르고, xl:grid-cols-3 드릴다운 그리드의 1/3 칼럼 안이라 4칸 타일이 부러진다.
// 게다가 페이지 하단이라 비용 신호가 사후 보고가 된다.
//
// ── 표시 규칙 ────────────────────────────────────────────────────────────────
//  · 통화 분리 엄수 — USD 축(광고비·CPL)에 ₩ 금지. 원화 환산도 하지 않는다.
//  · null 은 "—". 0 으로 지어내지 않는다(미측정 ≠ 0).
//  · 예산 집행률·퍼널·스코어보드는 넣지 않는다 — 축약본이다. 전체는 캠페인 허브에 있다.
//  · 실패해도 Overview 를 죽이지 않는다: 섹션은 남고 한 줄로 강등 + 재시도.

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowDownRight, ArrowUpRight, Minus, RotateCw, Target, TrendingUp, Users, Wallet } from "lucide-react"
import { KpiSkeleton, StatTile } from "@/components/admin/viz"
import { COUNT, PCT1, money } from "@/components/admin/campaigns/event-format"
import { adminFetchJsonCached } from "@/lib/admin-client"
import {
  resolveDeltaTone,
  summarizeScoreboardAnomalies,
  type DeltaTone,
  type DeltaValence,
} from "@/lib/marketing/overview-strip"
import type { MarketingPerfResponse, PerfKpi } from "@/lib/marketing/perf"

/** 축약본은 기간 토글을 두지 않는다 — 기간을 고르는 자리는 캠페인 허브다. */
const PERIOD = "30d"
/** 서버 메모(45초)와 동일한 클라이언트 TTL — 허브(SummaryTab usePerf)와 같은 값·같은 슬롯. */
const PERF_TTL_MS = 45_000
const CAMPAIGN_HUB_HREF = "/admin/campaigns"
/** 리드 타일은 "전 소스 리드"라 광고 그룹 필터를 붙이지 않는다 — 붙이면 착지 화면 수가 어긋난다. */
const LEADS_BOARD_HREF = "/admin/crm/customers/leads"

// 인바운드 요약·흐름 지표 스트립과 같은 문법(모바일 스냅 스크롤 → md 그리드). 4칸이라 열 수만 다르다.
const STRIP_CLASS =
  "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 md:grid md:snap-none md:grid-cols-2 md:overflow-visible md:pb-0 xl:grid-cols-4"
const TILE_CLASS =
  "w-[76vw] min-w-[220px] max-w-[280px] shrink-0 snap-start md:w-auto md:min-w-0 md:max-w-none [&>*]:h-full"

// 스냅샷 시각 표기(KST) — 캠페인 허브와 같은 규약. 허브의 것은 SummaryTab 모듈 안에 갇혀 있어
// (export 아님) 여기서 같은 형태로 둔다. 깨진 값은 지어내지 않고 원문 그대로.
const KST_TIME = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
})
function formatKstTime(iso: string): string {
  const time = new Date(iso)
  return Number.isNaN(time.getTime()) ? iso : KST_TIME.format(time)
}

/* ─── perf fetch ─────────────────────────────────────────────── */

function useMarketingPerf() {
  const [data, setData] = useState<MarketingPerfResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 재시도 연타 시 늦게 온 응답이 화면을 덮지 않도록 마지막 요청만 반영한다(usePerf 와 같은 규약).
  const seqRef = useRef(0)

  const load = useCallback(async ({ fresh = false }: { fresh?: boolean } = {}) => {
    const seq = ++seqRef.current
    setLoading(true)
    setError(null)
    try {
      const url = `/api/admin/marketing/perf?period=${PERIOD}${fresh ? "&fresh=1" : ""}`
      const response = await adminFetchJsonCached<MarketingPerfResponse>(url, undefined, {
        ttlMs: PERF_TTL_MS,
        // 허브와 같은 캐시 슬롯 — fresh 응답도 같은 슬롯을 갱신하도록 URL 이 아닌 고정 키를 쓴다.
        cacheKey: `marketing-perf:${PERIOD}`,
        force: fresh,
        staleIfError: !fresh,
      })
      if (seq !== seqRef.current) return
      setData(response)
    } catch (e) {
      if (seq !== seqRef.current) return
      setError(e instanceof Error ? e.message : "퍼포먼스 집계 로딩 실패")
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { data, loading, error, reload: load }
}

/* ─── 델타 힌트 ──────────────────────────────────────────────── */

const DELTA_TONE_CLASS: Record<DeltaTone, string> = {
  good: "text-[#084734]",
  bad: "text-[#B85C33]",
  neutral: "text-[#1a1a1a]/55",
  unknown: "text-[#1a1a1a]/35",
}

/**
 * "이전 기간 대비 +12%" + 지표 정의 한 조각. StatTile 은 hint 를 <p> 안에 넣으므로
 * 블록 요소 없이 인라인 span 만 쓴다(허브 KpiStrip 전환율 타일과 같은 구성).
 */
function DeltaHint({ kpi, valence, note }: { kpi: PerfKpi; valence: DeltaValence; note: string }) {
  const tone = resolveDeltaTone(kpi.deltaPct, valence)
  const title = "이전 기간(직전 30일) 대비"
  const Icon = kpi.deltaPct == null || kpi.deltaPct === 0 ? Minus : kpi.deltaPct > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      {tone === "unknown" ? (
        <span title={title} className={DELTA_TONE_CLASS.unknown}>
          이전 기간 대비 —
        </span>
      ) : (
        <span title={title} className="inline-flex items-center gap-1">
          <span className="text-[#1a1a1a]/40">이전 기간</span>
          <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${DELTA_TONE_CLASS[tone]}`}>
            <Icon className="h-3 w-3" />
            {kpi.deltaPct != null && kpi.deltaPct > 0 ? "+" : ""}
            {kpi.deltaPct}%
          </span>
        </span>
      )}
      <span className="text-[#1a1a1a]/35">{note}</span>
    </span>
  )
}

/* ─── 스트립 ─────────────────────────────────────────────────── */

export function MarketingPerfStrip() {
  const { data, loading, error, reload } = useMarketingPerf()
  const retry = useCallback(() => void reload({ fresh: true }), [reload])

  // 이상 신호는 스코어보드 행에 붙은 종류를 접어 한 줄로만 말한다(어느 캠페인인지는 허브의 몫).
  const anomalies = data ? summarizeScoreboardAnomalies(data.scoreboard) : { total: 0, badges: [] }

  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-[13px] font-semibold text-[#1a1a1a]/70">마케팅 성과</h2>
        <span className="text-[11px] text-[#1a1a1a]/40">
          최근 30일 · 광고비·리드·CPL — 캠페인 허브와 같은 수치
        </span>
        <div className="ml-auto flex items-center gap-2.5">
          {/* 스냅샷 미적재는 "0 집행"이 아니라 "Meta 인사이트가 아직 안 들어옴"이다 — 허브와 같은 표기. */}
          {data &&
            (data.snapshotAt ? (
              <span className="text-[11px] tabular-nums text-[#1a1a1a]/45">
                스냅샷 {formatKstTime(data.snapshotAt)}
              </span>
            ) : (
              <span className="text-[11px] text-[#A39E98]">스냅샷 미적재</span>
            ))}
          <Link
            href={CAMPAIGN_HUB_HREF}
            className="flex items-center gap-1 text-[12px] text-[#1a1a1a]/40 transition-colors hover:text-[#111110]"
          >
            캠페인 열기 <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* 이상 신호 — 규칙 감지(lib/marketing/anomaly.ts)가 걸렸을 때만. 파스텔 채움 없이 아웃라인 칩. */}
      {anomalies.total > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[#1a1a1a]/40">이상 신호</span>
          {anomalies.badges.map((badge) => (
            <span
              key={badge}
              className="rounded border border-[#F6D5C5] px-1.5 py-px text-[10px] font-medium text-[#B85C33]"
            >
              {badge}
            </span>
          ))}
        </div>
      )}

      {loading && !data ? (
        <div className={STRIP_CLASS}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={TILE_CLASS}>
              <KpiSkeleton />
            </div>
          ))}
        </div>
      ) : !data ? (
        // 조용한 강등 — 카드를 숨기지 않는다. 숨기면 "마케팅 지표가 원래 없는 화면"으로 오인된다.
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3">
          <p className="text-[12px] text-[#1a1a1a]/50">
            지표를 불러오지 못했습니다
            {error ? <span className="text-[#1a1a1a]/35"> — {error}</span> : null}
          </p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
          >
            <RotateCw className="h-3 w-3" />
            다시 시도
          </button>
        </div>
      ) : (
        <>
          <div className={STRIP_CLASS}>
            <div className={TILE_CLASS}>
              <StatTile
                icon={<Wallet className="h-4 w-4" />}
                label="광고비 · Meta USD"
                value={data.kpis.spendUsd.value != null ? money(data.kpis.spendUsd.value, "USD") : "—"}
                // 광고비는 증감에 가치판단이 없다(많이 쓴 게 좋지도 나쁘지도 않다) — 중립 톤.
                hint={<DeltaHint kpi={data.kpis.spendUsd} valence="none" note="원화 환산 없음" />}
                href={CAMPAIGN_HUB_HREF}
              />
            </div>
            <div className={TILE_CLASS}>
              <StatTile
                icon={<Users className="h-4 w-4" />}
                label="리드"
                value={data.kpis.leads.value != null ? COUNT.format(data.kpis.leads.value) : "—"}
                hint={<DeltaHint kpi={data.kpis.leads} valence="up-good" note="전 소스 · 테스트 제외" />}
                tone="brand"
                href={LEADS_BOARD_HREF}
              />
            </div>
            <div className={TILE_CLASS}>
              <StatTile
                icon={<Target className="h-4 w-4" />}
                label="CPL 실측 · USD"
                value={data.kpis.cplUsd.value != null ? money(data.kpis.cplUsd.value, "USD") : "—"}
                hint={<DeltaHint kpi={data.kpis.cplUsd} valence="down-good" note="광고비 ÷ 광고 리드" />}
                href={CAMPAIGN_HUB_HREF}
              />
            </div>
            <div className={TILE_CLASS}>
              <StatTile
                icon={<TrendingUp className="h-4 w-4" />}
                label="리드 전환율"
                value={
                  data.kpis.leadConversionRate.value != null
                    ? `${PCT1.format(data.kpis.leadConversionRate.value)}%`
                    : "—"
                }
                hint={
                  <DeltaHint kpi={data.kpis.leadConversionRate} valence="up-good" note="광고 리드 기준" />
                }
                href={CAMPAIGN_HUB_HREF}
              />
            </div>
          </div>
          {/* 갱신에 실패했지만 직전 값이 남아 있는 경우 — 낡은 값을 최신인 척 두지 않는다. */}
          {error && (
            <p className="mt-2 text-[11px] text-[#A39E98]">
              갱신에 실패해 마지막으로 받은 값을 표시합니다 —{" "}
              <button type="button" onClick={retry} className="underline underline-offset-2 hover:text-[#111110]">
                다시 시도
              </button>
            </p>
          )}
        </>
      )}
    </section>
  )
}

export default MarketingPerfStrip
