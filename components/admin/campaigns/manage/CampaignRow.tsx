// components/admin/campaigns/manage/CampaignRow.tsx
// 캠페인 관리(D1-5) 리스트의 순수 프레젠테이션 조각 — 상태·데이터 fetch 없음.
// CampaignManageClient(클라이언트)와 렌더 테스트가 함께 import 한다(SSOT, 로컬 재구현 금지).
// DESIGN.md §2 팔레트만 사용(AI 파스텔 금지) — 상태칩은 "운영 상태 스케일" 공식 토큰.

import { Link2, Megaphone, User } from "lucide-react"

import {
  CAMPAIGN_STATUS_LABEL,
  type CampaignStatus,
  type CampaignWithLinks,
} from "@/lib/types/marketing-campaign"

/* ── 포맷터(순수) ─────────────────────────────────────────────── */

const KRW_CURRENCY = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})

// budget: null → "예산 미정", 그 외 → ₩1,234,000
export function formatBudget(budget: number | null): string {
  if (budget == null) return "예산 미정"
  return KRW_CURRENCY.format(budget)
}

// "YYYY-MM-DD"(또는 ISO) → "YYYY.MM.DD". 형식이 아니면 원문 그대로(정직).
function toDot(value: string): string {
  const head = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head.replace(/-/g, ".") : value
}

// 기간: 양쪽 null → "기간 미정", 한쪽만 있으면 열린 구간으로 표기.
export function formatCampaignPeriod(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt && !endsAt) return "기간 미정"
  if (startsAt && !endsAt) return `${toDot(startsAt)} ~`
  if (!startsAt && endsAt) return `~ ${toDot(endsAt)}`
  return `${toDot(startsAt as string)} ~ ${toDot(endsAt as string)}`
}

// 선언 채널(정보성)의 표시 라벨 — 알려진 키만 매핑, 그 외는 원문 유지(폴백).
const CHANNEL_LABEL: Record<string, string> = {
  email: "이메일",
  sms: "문자",
  kakao: "카카오",
  meta: "Meta",
  event: "행사",
  search: "검색",
  display: "디스플레이",
  naver: "네이버",
  blog: "블로그",
  instagram: "인스타그램",
}

export function channelLabel(channel: string): string {
  return CHANNEL_LABEL[channel.toLowerCase()] ?? channel
}

/* ── 상태칩 ───────────────────────────────────────────────────── */

// DESIGN.md §2 운영 상태 스케일 + 웜 뉴트럴. 냉색/AI 파스텔 없음.
const STATUS_TONE: Record<CampaignStatus, string> = {
  // 진행 = Success·Info
  active: "bg-[#ECFDF5] text-[#084734] border-[#BDEFD8]",
  // 일시중지 = Warning
  paused: "bg-[#FBF1E0] text-[#A8741A] border-[#ECD29C]",
  // 계획 = 웜 뉴트럴
  planned: "bg-[#F6F5F4] text-[#615D59] border-[rgba(0,0,0,0.08)]",
  // 완료 = 더 희미한 뉴트럴(아카이브 느낌)
  done: "bg-[#F6F5F4] text-[#A39E98] border-[rgba(0,0,0,0.08)]",
}

export function CampaignStatusChip({ status }: { status: CampaignStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status]}`}
    >
      {CAMPAIGN_STATUS_LABEL[status]}
    </span>
  )
}

/* ── 채널칩 ───────────────────────────────────────────────────── */

function ChannelChip({ channel }: { channel: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[rgba(0,0,0,0.08)] bg-[#fafaf8] px-2 py-0.5 text-[10.5px] font-medium text-[#615D59]">
      {channelLabel(channel)}
    </span>
  )
}

/* ── 리스트 행(순수) ──────────────────────────────────────────── */

export function CampaignRow({
  campaign,
  onOpen,
}: {
  campaign: CampaignWithLinks
  onOpen?: () => void
}) {
  const linkCount = campaign.links.length

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-3.5 text-left transition hover:border-[#084734]/25 hover:bg-[#fafaf8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-bold text-[#111110]">{campaign.name}</h3>
            <CampaignStatusChip status={campaign.status} />
          </div>
          {campaign.objective && (
            <p className="mt-0.5 truncate text-[12px] text-[#615D59]">{campaign.objective}</p>
          )}
          {campaign.channels.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {campaign.channels.map((channel) => (
                <ChannelChip key={channel} channel={channel} />
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13px] font-semibold tabular-nums text-[#111110]">
            {formatBudget(campaign.budget)}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-[#615D59]">
            {formatCampaignPeriod(campaign.startsAt, campaign.endsAt)}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#615D59]">
        <span className="inline-flex items-center gap-1">
          <Link2 className="h-3 w-3" />
          연결 {linkCount}
        </span>
        {campaign.owner && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" />
            {campaign.owner}
          </span>
        )}
      </div>
    </button>
  )
}

/* ── 빈 상태(순수) ────────────────────────────────────────────── */

export function CampaignManageEmpty({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-6 py-16 text-center">
      <div className="mx-auto mb-3 inline-flex rounded-xl bg-[#ECFDF5] p-2.5 text-[#084734]">
        <Megaphone className="h-5 w-5" />
      </div>
      <p className="text-[14px] font-semibold text-[#111110]">아직 캠페인이 없습니다</p>
      <p className="mt-1 text-[12px] text-[#615D59]">새 캠페인으로 시작하세요.</p>
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3.5 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41]"
        >
          새 캠페인
        </button>
      )}
    </div>
  )
}
