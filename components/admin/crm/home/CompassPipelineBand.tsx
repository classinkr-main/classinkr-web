"use client"

// CRM 홈 — M7 마케팅 파이프라인(Compass) 밴드. app/admin/crm/page.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { ExternalLink } from "lucide-react"
import { formatNumber, ValueSkeleton, type CompassPipelineKpis } from "./shared"

// Compass(mkt.classin.co.kr) 딥링크 — 실측 확인된 것은 lib/compass/normalize.ts의
// compassLeadUrl(개별 리드 상세)뿐이다. 아래는 crm.stages 실측 어휘(new/demo/bd/quote/won/lost)를
// 따른 최선 추정 필터 URL이며, Compass 쪽 라우팅이 바뀌면 깨질 수 있다(마케팅팀 확인 필요).
const COMPASS_LEADS_BASE_URL = "https://mkt.classin.co.kr/leads"
const COMPASS_DEMO_TODAY_URL = `${COMPASS_LEADS_BASE_URL}?stage=demo`
const COMPASS_UPCOMING_ACTIONS_URL = `${COMPASS_LEADS_BASE_URL}?sort=next_action_at`
const COMPASS_BD_OPEN_URL = `${COMPASS_LEADS_BASE_URL}?stage=bd`

// M7 — 마케팅 파이프라인(Compass) 한 줄 밴드. 리드 요약과 같은 카드 껍데기(rounded-2xl·white·p-4)를
// 쓰지만 3항목을 한 행에 눕힌다. 각 항목은 mkt.classin.co.kr 새 탭 딥링크라 StatTile(href)이 쓰는
// next/link로는 target="_blank"를 못 붙여 순수 <a>로 직접 구성한다(그래도 bare 변형과 같은 타이포).
// down이면 무음 실패 금지 — 숫자 자리를 전부 걷어내고 무채색 한 줄 "Compass 연결 끊김"로 강등한다.
export default function CompassPipelineBand({
  data,
  loading,
  error,
  onRetry,
}: {
  data: CompassPipelineKpis | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const showDown = (error && !data) || data?.down

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
