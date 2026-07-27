// components/admin/campaigns/manage/CampaignRow.tsx
// 캠페인 관리(D1-5) 리스트의 순수 프레젠테이션 조각 — 상태·데이터 fetch 없음.
// CampaignManageClient(클라이언트)와 렌더 테스트가 함께 import 한다(SSOT, 로컬 재구현 금지).
// DESIGN.md §2 팔레트만 사용(AI 파스텔 금지) — 상태칩은 "운영 상태 스케일" 공식 토큰.
//
// 리스트는 크로스채널 롤업을 "행에서" 읽는 화면이다. API(GET /api/admin/marketing-campaigns)가
// 캠페인마다 rollup 을 함께 실어 보내므로, 상세를 열지 않아도 성과 스트립이 보인다.
//
// 정직 규칙(롤업 순수함수·상세 패널과 동일 — 행에서도 절대 완화하지 않는다):
//  - 행사 리드: rollup.eventLeads 는 v1 미집계 자리표시자(항상 0)라 행에서 숫자로 만들지 않는다.
//  - 행사 매출: null → "미입력"(₩0 아님).
//  - Meta 집행: 계정 통화 네이티브(USD 등) — 절대 ₩ 로 접거나 KRW 와 더하지 않는다.
//  - 채널·통화를 가로지르는 종합 합계·ROAS 는 만들지 않는다.
//  - 연결이 없으면 0 의 나열 대신 조용한 "연결 없음".

import {
  CalendarDays,
  Globe,
  Instagram,
  LayoutTemplate,
  Link2,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquare,
  PenLine,
  Search,
  Target,
  User,
  type LucideIcon,
} from "lucide-react"

import {
  CAMPAIGN_STATUS_LABEL,
  type CampaignRollup,
  type CampaignStatus,
  type CampaignWithLinks,
} from "@/lib/types/marketing-campaign"

/* ── 포맷터(순수) ─────────────────────────────────────────────── */

const KRW_CURRENCY = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})

const COUNT_FMT = new Intl.NumberFormat("ko-KR")
// Meta 집행은 계정 통화 네이티브 — 통화코드 접두 + 소수 보존(상세 패널과 동일 규칙).
const META_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 })

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
      className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[10.5px] font-semibold ${STATUS_TONE[status]}`}
    >
      {CAMPAIGN_STATUS_LABEL[status]}
    </span>
  )
}

/* ── 상태 위계(행 단위) ───────────────────────────────────────── */

// "지금 살아있는 것"을 스캔하기 위한 위계 — 색 채움 카드가 아니라 헤어라인 레일 + 대비 차이.
// 진행 = 그린 레일(액센트), 일시중지 = 웜 경고 틴트 레일, 계획·완료 = 레일 없음.
const STATUS_RAIL: Record<CampaignStatus, string | null> = {
  active: "bg-[#084734]",
  paused: "bg-[#ECD29C]",
  planned: null,
  done: null,
}

// 완료 행은 서피스·타이틀 대비를 낮춰 뒤로 물러나게 한다(정보는 그대로 유지).
const STATUS_SURFACE: Record<CampaignStatus, string> = {
  active: "bg-white hover:bg-[#FAFAF8]",
  planned: "bg-white hover:bg-[#FAFAF8]",
  paused: "bg-white hover:bg-[#FAFAF8]",
  done: "bg-[#FAFAF8] hover:bg-[#F6F5F4]",
}

const STATUS_TITLE: Record<CampaignStatus, string> = {
  active: "text-[#111110]",
  planned: "text-[#111110]",
  paused: "text-[#31302E]",
  done: "text-[#615D59]",
}

/* ── 채널칩 ───────────────────────────────────────────────────── */

// 채널 믹스를 한눈에 스캔하려면 라벨만으론 부족하다 — 채널별 아이콘으로 구분한다.
// 색은 쓰지 않는다: DESIGN.md §2 "신호색은 상태 의미가 있을 때만, 카테고리 구분엔 웜 뉴트럴".
const CHANNEL_ICON: Record<string, LucideIcon> = {
  email: Mail,
  sms: MessageSquare,
  kakao: MessageCircle,
  meta: Target,
  event: CalendarDays,
  search: Search,
  display: LayoutTemplate,
  naver: Globe,
  blog: PenLine,
  instagram: Instagram,
}

function ChannelChip({ channel }: { channel: string }) {
  const Icon = CHANNEL_ICON[channel.toLowerCase()]
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-1.5 py-px text-[10.5px] font-medium text-[#615D59]">
      {Icon ? (
        <Icon className="h-2.5 w-2.5 text-[#A39E98]" aria-hidden />
      ) : (
        // 모르는 채널(자유 입력)은 아이콘 대신 중립 점 — 라벨을 지어내지 않는다.
        <span className="h-1 w-1 rounded-full bg-[#A39E98]" aria-hidden />
      )}
      {channelLabel(channel)}
    </span>
  )
}

/* ── 성과 스트립(순수) ────────────────────────────────────────── */

export interface CampaignRowMetric {
  label: string
  value: string
  // 값이 아니라 "없음"을 말하는 항목(미입력·—) — 숫자와 같은 무게로 읽히지 않게 낮춘다.
  quiet?: boolean
}

// 한 행에 올릴 최대 지표 수 — 넘치면 우선순위 순으로 자른다(나머지는 상세 패널에 전부 있다).
const MAX_ROW_METRICS = 4

/**
 * 롤업 → 행에 올릴 지표 목록(순수). "실제로 연결된 채널의, 실제로 가용한 값"만 만든다.
 * 우선순위: 수신 → 오픈율 → Meta 집행 → 행사 딜 → 행사 매출.
 *
 * 정직:
 *  - 행사 리드(eventLeads)는 v1 미집계 자리표시자라 아예 항목으로 만들지 않는다.
 *  - 오픈율은 분모(수신)가 0 이면 만들지 않는다(거짓 0% 금지).
 *  - Meta 집행은 통화 코드와 함께 네이티브로만 — KRW 합산·환산 없음.
 *  - 채널을 가로지르는 총합·ROAS 는 없다. 수신은 같은 단위(발송 대상 수)의 합만이다.
 */
export function buildCampaignRowMetrics(rollup: CampaignRollup): CampaignRowMetric[] {
  const c = rollup.linkedCounts
  const metrics: CampaignRowMetric[] = []

  if (c.email + c.sms > 0) {
    metrics.push({
      label: "수신",
      value: COUNT_FMT.format(rollup.emailRecipients + rollup.smsRecipients),
    })
  }
  if (c.email > 0 && rollup.emailRecipients > 0) {
    const pct = (rollup.emailOpens / rollup.emailRecipients) * 100
    metrics.push({ label: "오픈", value: `${pct.toFixed(1)}%` })
  }
  if (c.meta > 0) {
    // 통화 혼재·미해석이면 합산 불가 → "—"(0 으로 접지 않는다).
    const known = rollup.metaSpend != null && rollup.metaCurrency != null
    metrics.push({
      label: "Meta",
      value: known ? `${rollup.metaCurrency} ${META_FMT.format(rollup.metaSpend as number)}` : "—",
      quiet: !known,
    })
  }
  if (c.event > 0) {
    metrics.push({ label: "딜", value: COUNT_FMT.format(rollup.eventDeals) })
    metrics.push({
      label: "매출",
      value: rollup.eventRevenue == null ? "미입력" : KRW_CURRENCY.format(rollup.eventRevenue),
      quiet: rollup.eventRevenue == null,
    })
  }

  return metrics.slice(0, MAX_ROW_METRICS)
}

function CampaignRowMetrics({ metrics, dim }: { metrics: CampaignRowMetric[]; dim?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-end gap-x-2.5 gap-y-0.5">
      {metrics.map((metric, i) => (
        <span
          key={metric.label}
          className={`inline-flex items-baseline gap-1 ${
            i > 0 ? "border-l border-[rgba(0,0,0,0.08)] pl-2.5" : ""
          }`}
        >
          <span className="text-[10.5px] text-[#A39E98]">{metric.label}</span>
          <b
            className={`text-[12px] font-semibold tabular-nums ${
              metric.quiet || dim ? "text-[#615D59]" : "text-[#111110]"
            }`}
          >
            {metric.value}
          </b>
        </span>
      ))}
    </div>
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
  // rollup 은 optional(경량 모드 ?rollup=0 이면 없다) — 없으면 지표를 지어내지 않는다.
  const metrics = campaign.rollup ? buildCampaignRowMetrics(campaign.rollup) : []
  const rail = STATUS_RAIL[campaign.status]
  const dim = campaign.status === "done"

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative block w-full rounded-xl border border-[rgba(0,0,0,0.08)] py-2.5 pl-4 pr-3.5 text-left transition hover:border-[#084734]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] ${STATUS_SURFACE[campaign.status]}`}
    >
      {/* 상태 레일 — 보더가 아니라 상태 신호(진행/일시중지만). */}
      {rail && (
        <span aria-hidden className={`absolute inset-y-2 left-0 w-[3px] rounded-r-full ${rail}`} />
      )}

      {/* 1행: 이름·상태 | 예산 */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className={`truncate text-[14px] font-bold ${STATUS_TITLE[campaign.status]}`}>
            {campaign.name}
          </h3>
          <CampaignStatusChip status={campaign.status} />
        </div>
        {/* 예산 미정은 "값"이 아니라 부재 — 숫자와 같은 무게로 읽히지 않게 낮춘다. */}
        <span
          className={`shrink-0 tabular-nums ${
            campaign.budget == null
              ? "text-[11.5px] font-medium text-[#A39E98]"
              : `text-[12.5px] font-semibold ${dim ? "text-[#615D59]" : "text-[#111110]"}`
          }`}
        >
          {formatBudget(campaign.budget)}
        </span>
      </div>

      {/* 2행: 목표 | 기간 · 담당 */}
      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[11.5px] text-[#615D59]">
        <span className="min-w-0 truncate">{campaign.objective ?? ""}</span>
        <span className="shrink-0 tabular-nums">
          {formatCampaignPeriod(campaign.startsAt, campaign.endsAt)}
          {campaign.owner && (
            <>
              <span className="px-1 text-[#A39E98]" aria-hidden>
                ·
              </span>
              <span className="inline-flex items-center gap-0.5">
                <User className="h-2.5 w-2.5 text-[#A39E98]" aria-hidden />
                {campaign.owner}
              </span>
            </>
          )}
        </span>
      </div>

      {/* 3행: 채널 믹스 | 성과 스트립 — 가운데 여백을 성과가 채운다. */}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
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
        {metrics.length > 0 ? (
          <CampaignRowMetrics metrics={metrics} dim={dim} />
        ) : (
          // 0 의 나열 대신 조용한 상태 — 아직 아무 실행도 묶이지 않았다는 사실만 말한다.
          <span className="text-[11px] text-[#A39E98]">연결 없음</span>
        )}
      </div>
    </button>
  )
}

/* ── 빈 상태(순수) ────────────────────────────────────────────── */

export function CampaignManageEmpty({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-6 py-16 text-center">
      <div className="mx-auto mb-3 inline-flex rounded-xl border border-[#BDEFD8] bg-[#ECFDF5] p-2.5 text-[#084734]">
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
