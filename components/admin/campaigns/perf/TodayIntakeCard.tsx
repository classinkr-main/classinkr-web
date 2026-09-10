"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { Skeleton } from "@/components/admin/viz"
import { COUNT } from "@/components/admin/campaigns/event-format"
import { adminFetchJsonCached } from "@/lib/admin-client"
import type { IntakeFeedItem, IntakeFeedResult } from "@/lib/marketing/intake-feed"

// 오늘 유입 — 어드민 public.leads 와 Compass 리드를 전화 키로 접은 라이브 카운트 + 실명 피드.
//
// 정직 규칙(집계는 lib/marketing/intake-feed 가, 표시는 여기가 지킨다):
//  - 두 원천이 같은 사람을 잡으면 1건이다. 접힌 건수는 배지로 밝힌다(합계가 덧셈이 아닌 이유).
//  - 원천 하나가 죽으면 남은 쪽 숫자를 "전체"라고 부르지 않는다 — "미집계" 배지를 단다.
//  - 비교는 "어제 같은 시각까지" 창이다. 어제 하루 전체와 견주면 오전엔 늘 급감으로 보인다.

const TTL_MS = 20_000

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
function useIntakeToday(refreshNonce: number) {
  const [data, setData] = useState<IntakeFeedResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 수동 재시도 카운터 — 값이 바뀌면 effect 가 다시 돈다. */
  const [retryNonce, setRetryNonce] = useState(0)
  // 첫 실행만 캐시를 쓰고, 이후(동기화·재시도)에는 캐시를 우회한다.
  const startedRef = useRef(false)

  useEffect(() => {
    const fresh = startedRef.current
    startedRef.current = true
    let ignore = false

    const url = `/api/admin/marketing/intake-today${fresh ? "?fresh=1" : ""}`
    adminFetchJsonCached<IntakeFeedResult>(url, undefined, {
      ttlMs: TTL_MS,
      cacheKey: "marketing-intake-today",
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
          <OriginMark origins={item.origins} />
        </div>
        {sub && <p className="mt-0.5 truncate text-[11px] text-[#1a1a1a]/45">{sub}</p>}
      </div>
    </li>
  )
}

export function TodayIntakeCard({ refreshNonce }: { refreshNonce: number }) {
  const { data, error, retry } = useIntakeToday(refreshNonce)

  const badges: string[] = []
  if (data) {
    if (data.overlapCount > 0) badges.push(`중복 접음 ${data.overlapCount}`)
    if (!data.adminMeasured) badges.push("어드민 리드 미집계")
    if (!data.compassMeasured) badges.push("Compass 미집계")
    // 잘리면 어제 이른 시각부터 사라져 델타가 부풀려진다 — 비교 자체를 못 믿는다고 밝힌다.
    if (data.compassTruncated) badges.push("Compass 조회 상한 — 어제 비교 부정확")
  }

  return (
    <section
      className="rounded-2xl border border-[#f0f0ec] bg-[#fdfdfc] p-4 sm:p-5"
      aria-label="오늘 유입"
    >
      <div className="mb-3">
        <h2 className="text-[14px] font-semibold text-[#111110]">오늘 유입</h2>
        <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
          KST 오늘 00:00~지금 · 어드민 리드 + Compass, 전화 기준 중복 접음
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
          <div className="flex items-end justify-between gap-3">
            <p className="text-[34px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[#111110]">
              {COUNT.format(data.todayCount)}
            </p>
            <DeltaLine delta={data.delta} />
          </div>

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

          {data.items.length === 0 ? (
            <p className="mt-3 border-t border-[#f0f0ec] pt-3 text-[11.5px] text-[#A39E98]">
              오늘 아직 유입이 없습니다.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[#f0f0ec] border-t border-[#f0f0ec] pt-1">
              {data.items.map((item) => (
                <FeedRow key={item.key} item={item} />
              ))}
            </ul>
          )}

          {/* 재조회 실패는 화면을 비우지 않고 밝히기만 한다(직전 값 유지). */}
          {error && <p className="mt-2 text-[11px] text-[#1a1a1a]/45">{error}</p>}
        </>
      )}
    </section>
  )
}
