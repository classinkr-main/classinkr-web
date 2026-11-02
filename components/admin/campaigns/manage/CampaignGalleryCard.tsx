// components/admin/campaigns/manage/CampaignGalleryCard.tsx
// 캠페인 갤러리 카드 — 마케팅 프로젝트 갤러리형(1b) 시안의 카드 문법을 캠페인에 그대로 옮긴 것.
// 캠페인 관리가 프로젝트와 한 화면(탭)이 되면서(2026-10) 두 탭이 같은 카드·묶음·툴바를 쓴다.
// 순수 프레젠테이션 — 상태·데이터 fetch 없음. CampaignsPane 과 렌더 테스트가 import 한다.
//
// 프로젝트 카드와 다른 점(정직 규칙):
//  - 캠페인 롤업에는 KRW 소진 원천이 없다(Meta 는 계정 통화, 이메일·문자는 집행비 개념 없음).
//    그래서 "예산 소진" 미터와 페이싱 판정을 그리지 않고, 기간 경과 미터 + 배정 예산 수치만 둔다.
//  - 성과는 리스트 행과 같은 buildCampaignRowMetrics(실제로 연결된 채널의 가용 값만)를 쓴다.
//  - 상태칩은 없다 — 상태는 카드가 속한 묶음 머리가 말한다(프로젝트 카드와 동일).

import { Link2 } from "lucide-react"

import { computeScheduleProgress } from "@/lib/marketing/project-pacing"
import { metaObjectiveLabel } from "@/lib/marketing/campaign-labels"
import type { CampaignWithLinks } from "@/lib/types/marketing-campaign"

import { DDAY_TONE_TEXT, PacingBar } from "../projects/ProjectCard"
import {
  CampaignProjectTag,
  CampaignRowMetrics,
  ChannelChip,
  buildCampaignRowMetrics,
  formatBudget,
  formatCampaignPeriod,
} from "./CampaignRow"

export function CampaignGalleryCard({
  campaign,
  projectName,
  today,
  onOpen,
}: {
  campaign: CampaignWithLinks
  projectName: string | null
  today: string // KST "YYYY-MM-DD" — 부모가 목록을 읽은 날로 고정해 내려준다.
  onOpen?: () => void
}) {
  const schedule = computeScheduleProgress(
    { status: campaign.status, startsAt: campaign.startsAt, endsAt: campaign.endsAt },
    today,
  )
  // rollup 은 optional(경량 모드) — 없으면 지표를 지어내지 않는다.
  const metrics = campaign.rollup ? buildCampaignRowMetrics(campaign.rollup) : []
  const linkCount = campaign.links.length
  const done = campaign.status === "done"
  const objective = metaObjectiveLabel(campaign.objective)

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full flex-col gap-3.5 rounded-xl border border-[rgba(0,0,0,0.08)] px-[18px] py-4 text-left leading-tight transition hover:border-[#084734]/25 hover:shadow-[0_4px_18px_rgba(0,0,0,0.04)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] ${
        done ? "bg-[#FAFAF8]" : "bg-white"
      }`}
    >
      {/* 1행: 소속 프로젝트 · 이름 · 목표 | D-day */}
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* 미배정도 같은 자리에 흐리게 적어 같은 줄 카드들의 높이를 맞춘다. */}
          <CampaignProjectTag name={projectName} showUnassigned />
          <h3
            className={`mt-1 truncate text-[14px] font-bold leading-5 ${
              done ? "text-[#615D59]" : "text-[#111110]"
            }`}
          >
            {campaign.name}
          </h3>
          <p className="mt-0.5 min-h-4 truncate text-[11.5px] leading-4 text-[#615D59]">
            {objective ?? ""}
          </p>
        </div>
        <span
          className={`shrink-0 text-[11px] font-semibold tabular-nums ${DDAY_TONE_TEXT[schedule.dday.tone]}`}
        >
          {schedule.dday.label}
        </span>
      </div>

      {/* 2행: 기간 경과 — 프로젝트 카드와 같은 폭·같은 미터(소진 미터는 원천이 없어 두지 않는다). */}
      <div className="grid w-full grid-cols-[56px_minmax(0,1fr)_52px] items-center gap-x-2.5">
        <span className="text-[10.5px] text-[#A39E98]">기간 경과</span>
        <PacingBar
          pct={schedule.elapsedPct ?? 0}
          fillClass="bg-[#A39E98]"
          empty={schedule.elapsedPct == null}
          className="h-[3px]"
        />
        <span className="text-right text-[12px] font-semibold tabular-nums text-[#615D59]">
          {schedule.elapsedPct == null ? "—" : `${schedule.elapsedPct}%`}
        </span>
      </div>

      {/* 3행: 채널 믹스 · 연결 수 | 배정 예산 */}
      <div className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {campaign.channels.map((channel) => (
            <ChannelChip key={channel} channel={channel} />
          ))}
          {linkCount > 0 && (
            <span className="inline-flex items-center gap-1 pl-0.5 text-[11px] tabular-nums text-[#A39E98]">
              <Link2 className="h-3 w-3" aria-hidden />
              연결 {linkCount}
            </span>
          )}
        </div>
        {/* 예산 미정은 "값"이 아니라 부재 — 숫자와 같은 무게로 읽히지 않게 낮춘다. */}
        <span
          className={`shrink-0 tabular-nums ${
            campaign.budget == null
              ? "text-[11px] font-medium text-[#A39E98]"
              : `text-[12px] font-semibold ${done ? "text-[#615D59]" : "text-[#31302E]"}`
          }`}
        >
          {formatBudget(campaign.budget)}
        </span>
      </div>

      {/* 4행: 성과 스트립 | 기간·담당 */}
      <div className="flex w-full flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-t border-[rgba(0,0,0,0.08)] pt-3">
        {metrics.length > 0 ? (
          <CampaignRowMetrics metrics={metrics} dim={done} align="start" />
        ) : (
          // 0 의 나열 대신 조용한 상태 — 아직 아무 실행도 묶이지 않았다는 사실만 말한다.
          <span className="text-[11px] text-[#A39E98]">연결 없음</span>
        )}
        {/* ml-auto — 지표가 길어 줄이 넘어가도 기간·담당은 오른쪽에 남는다(카드끼리 자리 일치). */}
        <span className="ml-auto text-right text-[11px] tabular-nums text-[#615D59]">
          {formatCampaignPeriod(campaign.startsAt, campaign.endsAt)}
          {campaign.owner && (
            <>
              <span className="px-1 text-[#A39E98]" aria-hidden>
                ·
              </span>
              {campaign.owner}
            </>
          )}
        </span>
      </div>
    </button>
  )
}
