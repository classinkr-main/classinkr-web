"use client"

// Compass(mkt.classin.co.kr) 파이프라인 3칸 — 오늘 데모 · 다음 액션 임박 · BD인계 진행.
//
// CRM 홈(M7 밴드)에서 시작해 2026-09-14 마케팅 한눈에 층도 같은 밴드를 쓰게 되면서
// components/admin/crm/home 에서 공용 위치로 옮겼다(로직 무변경). 원천은
// /api/admin/crm/compass-pipeline(조립 정본 lib/compass/home-band.ts) 하나다.
//
// 리드 단위 작업(콜·케어·BD인계)은 어드민에 만들지 않는다 — 세 숫자만 보여주고 새 탭 딥링크로
// Compass 에 보낸다. down 이면 무음 실패 금지 — 숫자 자리를 전부 걷어내고 무채색 한 줄로 강등한다.

import { useCallback, useEffect, useRef, useState } from "react"
import { ExternalLink } from "lucide-react"
import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"

// /api/admin/crm/compass-pipeline 응답.
export interface CompassPipelineKpis {
  down: boolean
  todayDemoCount: number
  upcomingActionCount: number
  bdOpenCount: number
  generatedAt: string
}

export const COMPASS_PIPELINE_URL = "/api/admin/crm/compass-pipeline"

// Compass 딥링크 — 실측 확인된 것은 lib/compass/normalize.ts의 compassLeadUrl(개별 리드 상세)뿐이다.
// 아래는 crm.stages 실측 어휘(new/demo/bd/quote/won/lost)를 따른 최선 추정 필터 URL이며,
// Compass 쪽 라우팅이 바뀌면 깨질 수 있다(마케팅팀 확인 필요).
const COMPASS_LEADS_BASE_URL = "https://mkt.classin.co.kr/leads"
const COMPASS_DEMO_TODAY_URL = `${COMPASS_LEADS_BASE_URL}?stage=demo`
const COMPASS_UPCOMING_ACTIONS_URL = `${COMPASS_LEADS_BASE_URL}?sort=next_action_at`
const COMPASS_BD_OPEN_URL = `${COMPASS_LEADS_BASE_URL}?stage=bd`

function formatNumber(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("ko-KR")
}

function ValueSkeleton({ className = "h-6 w-20" }: { className?: string }) {
  return <span aria-hidden className={`inline-block animate-pulse rounded-md bg-[#f0f0ec] align-middle ${className}`} />
}

/**
 * 한눈에 층 전용 조회 훅 — CRM 홈과 같은 URL·cacheKey 라 두 화면을 오가면 한 응답을 재사용한다.
 * 403(권한 밖 역할)은 에러가 아니라 "이 계정에는 없는 칸"이다 — forbidden 으로 돌려 소비처가
 * 밴드를 아예 그리지 않게 한다(권한 없는 계정에 빈 숫자 자리를 보여주지 않는다).
 */
export function useCompassPipeline(refreshNonce: number) {
  const [data, setData] = useState<CompassPipelineKpis | null>(() =>
    getCachedAdminJson<CompassPipelineKpis>(COMPASS_PIPELINE_URL, { cacheKey: COMPASS_PIPELINE_URL })
  )
  const [loading, setLoading] = useState(data == null)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const seqRef = useRef(0)

  const load = useCallback(async ({ fresh = false }: { fresh?: boolean } = {}) => {
    const seq = ++seqRef.current
    setLoading(true)
    setError(null)
    try {
      const response = await adminFetchJsonCached<CompassPipelineKpis>(
        fresh ? `${COMPASS_PIPELINE_URL}?force=1` : COMPASS_PIPELINE_URL,
        undefined,
        { ttlMs: 60_000, cacheKey: COMPASS_PIPELINE_URL, force: fresh, staleIfError: !fresh }
      )
      if (seq !== seqRef.current) return
      setData(response)
    } catch (e) {
      if (seq !== seqRef.current) return
      const message = e instanceof Error ? e.message : "Compass 파이프라인 조회 실패"
      if (/\b403\b|forbidden|권한/i.test(message)) setForbidden(true)
      else setError(message)
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handledNonceRef = useRef(refreshNonce)
  useEffect(() => {
    if (refreshNonce === handledNonceRef.current) return
    handledNonceRef.current = refreshNonce
    void load({ fresh: true })
  }, [refreshNonce, load])

  return { data, loading, error, forbidden, retry: () => void load({ fresh: true }) }
}

// 리드 요약과 같은 카드 껍데기(rounded-2xl·white·p-4)를 쓰지만 3항목을 한 행에 눕힌다. 각 항목은
// mkt.classin.co.kr 새 탭 딥링크라 StatTile(href)이 쓰는 next/link로는 target="_blank"를 못 붙여
// 순수 <a>로 직접 구성한다(그래도 bare 변형과 같은 타이포).
export default function CompassPipelineBand({
  data,
  loading,
  error,
  onRetry,
  quiet = false,
}: {
  data: CompassPipelineKpis | null
  loading: boolean
  error: string | null
  onRetry: () => void
  /** 한눈에 층(참조 밴드)용 — 배경을 한 단 물리고 라벨 앞에 "Compass에서 하는 일" 한 줄을 둔다. */
  quiet?: boolean
}) {
  const showDown = (error && !data) || data?.down

  return (
    <section
      className={
        quiet
          ? "rounded-2xl border border-[#f0f0ec] bg-[#fdfdfc] p-4"
          : "mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4"
      }
      aria-label="마케팅 파이프라인(Compass)"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">마케팅 파이프라인(Compass)</p>
          {quiet && (
            <p className="mt-0.5 text-[11px] text-[#A39E98]">리드 단위 작업은 mkt.classin.co.kr 에서 — 여기서는 세 숫자만.</p>
          )}
        </div>
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
              className="flex min-w-[168px] flex-1 items-center justify-between gap-3 border-t border-[#f0f0ec] pt-3 transition-opacity hover:opacity-70"
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
    </section>
  )
}
