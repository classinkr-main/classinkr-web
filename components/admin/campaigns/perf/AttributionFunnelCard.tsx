"use client"

import { COUNT, PCT1 } from "@/components/admin/campaigns/event-format"
import type { AttributionFunnel, AttributionFunnelStage } from "@/lib/marketing/attribution-funnel"

/**
 * 귀속 폭포 — 이 기간 리드가 "어느 광고가 데려왔나"까지 가는 길에서 **어디서 끊기는지**.
 *
 * 채널별 리드 수만 보면 귀속이 안 된 리드는 그냥 사라진다. "메타 40건"은 보이는데
 * "채널을 아예 못 말하는 60건"은 어느 화면에도 안 뜬다. 이 카드는 그 60건이 어느 단계에서
 * 빠졌는지를 보여준다 — 고칠 곳이 단계마다 다르기 때문이다:
 *   트래킹 신호 없음 → 수집 경로(랜딩 스크립트·폼 전달)
 *   채널 못 말함     → utm_source 규약
 *   캠페인·소재 못 감 → 광고 네이밍
 *
 * ⚠️ 위 퍼널 카드(FunnelCard)와 **다른 축**이다. 저쪽은 "리드가 고객이 되는 과정",
 * 이쪽은 "리드에 출처를 붙일 수 있는가". 나란히 두되 같은 카드에 섞지 않는다.
 *
 * 정직 규칙: 비율 null 은 0% 가 아니라 "분모가 없다" — `—` 로 그린다.
 * 0 은 진짜 0 이다(총 리드는 있는데 한 건도 못 이은 상태).
 */
export interface AttributionFunnelCardProps {
  funnel: AttributionFunnel
  /** 리드 소스가 실패했으면 폭포 전체가 빈 값이다 — 0 을 성과로 읽히지 않게 문구를 바꾼다. */
  leadsMeasured: boolean
}

/** 단계별 한 줄 설명 — 상태만으로는 "여기서 빠지면 무엇을 고쳐야 하나"가 안 보인다. */
const STAGE_HINT: Record<AttributionFunnelStage["key"], string> = {
  total: "테스트 리드 제외",
  tracked: "utm · 클릭ID · 리드마그넷 · 랜딩 중 하나라도",
  channel: "어느 채널에서 왔는지 말할 수 있다",
  campaign: "어느 캠페인인지 말할 수 있다",
  creative: "어느 광고 · 소재인지 말할 수 있다",
}

const pct = (value: number | null) => (value == null ? "—" : `${PCT1.format(value)}%`)

export function AttributionFunnelCard({ funnel, leadsMeasured }: AttributionFunnelCardProps) {
  const first = funnel.stages[0]
  const totalCount = first?.count ?? 0
  // 막대 길이는 총 리드 기준 — 단계 간 잔존율(retentionPct)로 그리면 100%가 반복돼
  // "거의 안 빠졌다"로 보인다. 실제로 줄어든 모습이 보여야 이 카드가 일을 한다.
  const widthPct = (count: number) => (totalCount > 0 ? (count / totalCount) * 100 : 0)

  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[13.5px] font-semibold text-[#111110]">귀속 폭포</h3>
        <p className="text-[11.5px] tabular-nums text-[#A39E98]">
          소재까지 {pct(funnel.endToEndPct)}
        </p>
      </header>

      {!leadsMeasured ? (
        <p className="py-6 text-center text-[12.5px] text-[#A39E98]">
          리드를 불러오지 못했습니다 — 0 이 아니라 미측정입니다.
        </p>
      ) : totalCount === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-[#A39E98]">이 기간 리드가 없습니다.</p>
      ) : (
        <>
          <ol className="flex flex-col gap-2.5">
            {funnel.stages.map((stage) => (
              <li key={stage.key} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12.5px] font-medium text-[#111110]">{stage.label}</span>
                  <span className="shrink-0 text-[12.5px] tabular-nums text-[#111110]">
                    {COUNT.format(stage.count)}
                    {stage.retentionPct != null && (
                      <span className="ml-1.5 text-[11px] font-normal text-[#A39E98]">
                        {pct(stage.retentionPct)}
                      </span>
                    )}
                  </span>
                </div>
                {/* 막대는 장식이 아니라 줄어드는 폭 자체가 정보다. 브랜드 그린 단색 —
                    단계마다 색을 바꾸면 "나쁜 단계"가 있는 것처럼 읽힌다. */}
                <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f0ec]">
                  <div
                    className="h-full rounded-full bg-[#084734]"
                    style={{ width: `${widthPct(stage.count)}%` }}
                  />
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[11px] text-[#A39E98]">{STAGE_HINT[stage.key]}</span>
                  {stage.drop > 0 && (
                    <span className="shrink-0 text-[11px] tabular-nums text-[#B85C33]">
                      −{COUNT.format(stage.drop)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {funnel.byChannel.length > 0 && (
            <div className="mt-3 border-t border-[#f0f0ec] pt-3">
              <p className="mb-1.5 text-[10.5px] uppercase tracking-[0.1em] text-[#A39E98]">
                식별된 채널
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {funnel.byChannel.map((entry) => (
                  <span
                    key={entry.channel}
                    className="text-[11.5px] tabular-nums text-[#615D59]"
                  >
                    {entry.channel}{" "}
                    <span className="font-semibold text-[#111110]">
                      {COUNT.format(entry.count)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
