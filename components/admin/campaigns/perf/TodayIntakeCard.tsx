"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { Skeleton } from "@/components/admin/viz"
import { COUNT } from "@/components/admin/campaigns/event-format"
import { adminFetchJsonCached, seedAdminRequestCache } from "@/lib/admin-client"
import type { IntakeFeedItem, IntakeFeedResult } from "@/lib/marketing/intake-feed"

// 오늘 유입 — 어드민 public.leads 와 Compass 리드를 전화 키로 접은 라이브 카운트 + 실명 피드.
//
// 정직 규칙(집계는 lib/marketing/intake-feed 가, 표시는 여기가 지킨다):
//  - 두 원천이 같은 사람을 잡으면 1건이다. 접힌 건수는 배지로 밝힌다(합계가 덧셈이 아닌 이유).
//  - 원천 하나가 죽으면 남은 쪽 숫자를 "전체"라고 부르지 않는다 — "미집계" 배지를 단다.
//  - 비교는 "어제 같은 시각까지" 창이다. 어제 하루 전체와 견주면 오전엔 늘 급감으로 보인다.
//  - Compass 리드는 신규(오늘 생성)와 재유입(이미 있던 리드가 오늘 다시 들어옴)을 함께 센다 — 합계 아래
//    "신규 N · 재유입 k"로 가르고, 피드 줄에는 재유입 배지를 단다(2026-09-14 R2 F12). 인바운드 채널
//    (채널톡·다이렉트·워크인·소개)은 Compass 대시보드처럼 마케팅 유입에서 뺀다.

const TTL_MS = 20_000
export const INTAKE_TODAY_URL = "/api/admin/marketing/intake-today"
export const INTAKE_TODAY_CACHE_KEY = "marketing-intake-today"

const KST_HHMM = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
})

function formatKstTime(iso: string): string {
  const time = new Date(iso)
  return Number.isNaN(time.getTime()) ? "—" : KST_HHMM.format(time)
}

/**
 * 조회 훅 — 재조회 트리거(헤더 동기화 nonce · 수동 재시도)를 effect 키로 삼는 한 벌짜리 구조.
 *
 * SummaryTab 의 usePerf/useInsights 처럼 useCallback 한 load 를 effect 에서 부르지 않는 이유:
 * 그 모양은 "effect 본문에서 동기 setState"로 읽혀 react-hooks 규칙에 걸린다. setState 를
 * 프로미스 콜백 안으로만 두면 규칙이 요구하는 모양(외부 시스템 구독 → 콜백에서 갱신)이 되고,
 * 정리 함수의 ignore 플래그가 레이스도 함께 막는다(늦게 온 응답이 최신을 덮지 않는다).
 */
function useIntakeToday(
  refreshNonce: number,
  initialData?: IntakeFeedResult | null,
  initialGeneratedAt?: number
) {
  // 서버 프리페치 시드 — 상태 지연 초기화(첫 렌더 1회) 안에서 캐시에 심어, 첫 effect 의 조회가
  // 네트워크 대신 캐시를 읽게 한다. 렌더 본문에서 ref 를 읽는 대신 초기화 함수를 쓰는 이유는
  // react-hooks/refs 규칙(렌더 중 ref 접근 금지) 때문이다.
  const [data, setData] = useState<IntakeFeedResult | null>(() => {
    if (initialData) {
      seedAdminRequestCache(INTAKE_TODAY_URL, initialData, {
        cacheKey: INTAKE_TODAY_CACHE_KEY,
        ttlMs: TTL_MS,
        generatedAt: initialGeneratedAt,
      })
    }
    return initialData ?? null
  })
  const [error, setError] = useState<string | null>(null)
  /** 수동 재시도 카운터 — 값이 바뀌면 effect 가 다시 돈다. */
  const [retryNonce, setRetryNonce] = useState(0)
  // 첫 실행만 캐시를 쓰고, 이후(동기화·재시도)에는 캐시를 우회한다.
  const startedRef = useRef(false)

  useEffect(() => {
    const fresh = startedRef.current
    startedRef.current = true
    let ignore = false

    const url = `${INTAKE_TODAY_URL}${fresh ? "?fresh=1" : ""}`
    adminFetchJsonCached<IntakeFeedResult>(url, undefined, {
      ttlMs: TTL_MS,
      cacheKey: INTAKE_TODAY_CACHE_KEY,
      force: fresh,
      staleIfError: !fresh,
    })
      .then((response) => {
        if (ignore) return
        setData(response)
        setError(null)
      })
      .catch((e: unknown) => {
        if (ignore) return
        setError(e instanceof Error ? e.message : "오늘 유입 조회 실패")
      })

    return () => {
      ignore = true
    }
  }, [refreshNonce, retryNonce])

  return { data, error, retry: () => setRetryNonce((n) => n + 1) }
}

/** 어제 동시각 대비 — 0 은 "변화 없음"이고 null 은 "비교 불가"다(둘을 같은 문구로 뭉개지 않는다). */
function DeltaLine({ delta }: { delta: number | null }) {
  if (delta == null) {
    return <span className="text-[11px] text-[#1a1a1a]/35">어제 동시각 대비 —</span>
  }
  const Icon = delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight
  const toneClass =
    delta === 0 ? "text-[#1a1a1a]/55" : delta > 0 ? "text-[#084734]" : "text-[#B85C33]"
  return (
    <span className="inline-flex items-center gap-1 text-[11px]">
      <span className="text-[#1a1a1a]/40">어제 동시각 대비</span>
      <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${toneClass}`}>
        <Icon className="h-3 w-3" />
        {delta > 0 ? "+" : ""}
        {COUNT.format(delta)}
      </span>
    </span>
  )
}

function OriginMark({ origins }: { origins: IntakeFeedItem["origins"] }) {
  // 두 원천이 같은 사람을 잡은 항목만 표시한다 — 단일 원천에 배지를 달면 피드가 라벨 밭이 된다.
  if (origins.length < 2) return null
  return (
    <span className="shrink-0 rounded border border-[#e8e8e4] px-1 py-px text-[9.5px] font-medium text-[#1a1a1a]/40">
      양쪽
    </span>
  )
}

function ReinflowMark({ reinflow }: { reinflow: boolean }) {
  // 신규가 기본이라 재유입만 표시한다(단일 원천 배지를 안 다는 OriginMark 와 같은 이유).
  if (!reinflow) return null
  return (
    <span
      className="shrink-0 rounded border border-[#ECD29C] bg-[#FBF1E0] px-1 py-px text-[9.5px] font-medium text-[#7A520F]"
      title="Compass 에 이미 있던 리드가 다시 들어왔습니다"
    >
      재유입
    </span>
  )
}

function FeedRow({ item }: { item: IntakeFeedItem }) {
  const who = item.org ?? item.name ?? "이름 미상"
  const sub = [item.org && item.name ? item.name : null, item.region, item.adName]
    .filter((part): part is string => Boolean(part))
    .join(" · ")
  return (
    <li className="flex items-start gap-2 py-1.5">
      <span className="w-[38px] shrink-0 pt-px text-[11px] tabular-nums text-[#1a1a1a]/40">
        {formatKstTime(item.at)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[12.5px] font-medium text-[#111110]">{who}</p>
          <ReinflowMark reinflow={item.reinflow === true} />
          <OriginMark origins={item.origins} />
        </div>
        {sub && <p className="mt-0.5 truncate text-[11px] text-[#1a1a1a]/45">{sub}</p>}
      </div>
    </li>
  )
}

export function TodayIntakeCard({
  refreshNonce,
  variant = "card",
  maxItems,
  footer,
  initialData,
  initialGeneratedAt,
}: {
  refreshNonce: number
  /** 서버 프리페치(한눈에 층) — 있으면 스켈레톤 없이 시작한다. */
  initialData?: IntakeFeedResult | null
  initialGeneratedAt?: number
  /**
   * hero(한눈에 층): 눈높이 우측의 "지금" 카드 — 값 44px, 눈썹 라벨, 최근 maxItems 건.
   * card(기본): 구 레일용 34px 카드. 데이터·정직 규칙은 두 변형이 동일하다.
   */
  variant?: "card" | "hero"
  /** 피드 최대 행수 — 생략하면 API 가 준 만큼(최대 8). */
  maxItems?: number
  /** 카드 발치 슬롯 — 한눈에 층은 "이 기간 미컨택 광고 리드 N → 신규 리드 큐" 링크를 둔다. */
  footer?: React.ReactNode
}) {
  const { data, error, retry } = useIntakeToday(refreshNonce, initialData, initialGeneratedAt)
  const hero = variant === "hero"
  const items = data ? (maxItems != null ? data.items.slice(0, maxItems) : data.items) : []

  const badges: string[] = []
  if (data) {
    if (data.overlapCount > 0) badges.push(`중복 접음 ${data.overlapCount}`)
    if (!data.adminMeasured) badges.push("어드민 리드 미집계")
    if (!data.compassMeasured) badges.push("Compass 미집계")
    // 브리지가 상한에서 잘랐다(count > 받은 행) — 오늘·어제 건수 둘 다 모자랄 수 있다고 밝힌다.
    if (data.compassTruncated) badges.push("Compass 조회 상한 — 건수·어제 비교 부정확")
  }

  return (
    <section
      className={
        hero
          ? "flex h-full flex-col rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5"
          : "rounded-2xl border border-[#f0f0ec] bg-[#fdfdfc] p-4 sm:p-5"
      }
      aria-label="오늘 유입"
    >
      <div className="mb-3">
        {hero ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A39E98]">지금 · 오늘 유입</p>
        ) : (
          <h2 className="text-[14px] font-semibold text-[#111110]">오늘 유입</h2>
        )}
        <p className={hero ? "sr-only" : "mt-0.5 text-[11px] text-[#1a1a1a]/40"}>
          KST 오늘 00:00~지금 · 어드민 리드 + Compass 마케팅 리드(신규·재유입, 인바운드 제외), 전화 기준 중복 접음
        </p>
      </div>

      {!data ? (
        error ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-[#1a1a1a]/55">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="shrink-0 text-[12px] font-medium text-[#084734] hover:underline"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <div aria-busy="true" className="space-y-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-[92px] w-full rounded-lg" />
          </div>
        )
      ) : (
        <>
          <div className={hero ? "flex flex-col gap-1.5" : "flex items-end justify-between gap-3"}>
            {/* 히어로는 44px·등폭 숫자 없음(큰 숫자에 tabular 는 자간이 벌어져 보인다). */}
            <p
              className={
                hero
                  ? "text-[44px] font-bold leading-none tracking-[-0.03em] text-[#111110]"
                  : "text-[34px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[#111110]"
              }
            >
              {COUNT.format(data.todayCount)}
            </p>
            <DeltaLine delta={data.delta} />
          </div>

          {/* 신규/재유입 구분 — 재유입 판정은 Compass 기록에서만 나온다. Compass 미집계면 가르지 않는다(0 으로 포장 금지). */}
          {data.compassMeasured && data.todayCount > 0 && (
            <p className="mt-1.5 text-[11px] tabular-nums text-[#1a1a1a]/45">
              신규 {COUNT.format(data.todayCount - (data.todayReinflowCount ?? 0))} · 재유입{" "}
              {COUNT.format(data.todayReinflowCount ?? 0)}
            </p>
          )}

          {badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded border border-[#d8d6cf] px-1.5 py-px text-[10px] font-medium text-[#1a1a1a]/45"
                >
                  {badge}
                </span>
              ))}
            </div>
          )}

          {items.length === 0 ? (
            <p className="mt-3 border-t border-[#f0f0ec] pt-3 text-[11.5px] text-[#A39E98]">
              오늘 아직 유입이 없습니다.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[#f0f0ec] border-t border-[#f0f0ec] pt-1">
              {items.map((item) => (
                <FeedRow key={item.key} item={item} />
              ))}
            </ul>
          )}
          {hero && data.items.length > items.length && (
            <p className="mt-1 text-[10.5px] tabular-nums text-[#A39E98]">
              오늘 {COUNT.format(data.todayCount)}건 중 최근 {COUNT.format(items.length)}건
            </p>
          )}

          {/* 재조회 실패는 화면을 비우지 않고 밝히기만 한다(직전 값 유지). */}
          {error && <p className="mt-2 text-[11px] text-[#1a1a1a]/45">{error}</p>}
        </>
      )}
      {footer && <div className={hero ? "mt-auto pt-3" : "mt-3"}>{footer}</div>}
    </section>
  )
}
