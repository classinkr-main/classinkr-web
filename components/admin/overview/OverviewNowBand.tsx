"use client"

// Overview 최상단 "지금" 띠 — 오늘 방문 · 오늘 문의 · 응대 전 문의 · 24h+ 미응답 + 오늘 들어온 문의 피드.
// 기획: docs/active/admin-lead-visitor-glance-plan-2026-11-04.md §3.1
//
// 네 칸은 모두 전사 기준이다. 새 문의는 담당이 비어 들어오므로 "내 담당"으로 거르면 사라진다.
// 정직 규칙(기존 Overview·오늘 유입 카드와 같다):
//  - 조회 실패를 0으로 표시하지 않는다 — 그 칸만 "확인 필요 · 다시 시도"로 바꾸고 나머지는 그대로 둔다.
//  - 오늘 문의 원천(어드민·Compass) 중 하나가 빠지면 "미집계"를 밝히고 어제 비교를 하지 않는다.
//  - 응대 전·24h+ 칸은 리드 보드 '응대 전'·'24h+' 카드와 같은 술어라, 눌러서 나오는 목록 수와 같다.

import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRight, RotateCw } from "lucide-react"

import { Skeleton } from "@/components/admin/viz"
import { compassLeadUrl } from "@/lib/compass/normalize"
import type { OverviewLeadMetrics } from "@/lib/admin/overview/lead-summary"
import {
  INTAKE_SOURCE_KIND_LABEL,
  INTAKE_SOURCE_KIND_ORDER,
  type IntakeFeedItem,
  type IntakeFeedResult,
  type IntakeSourceKind,
} from "@/lib/marketing/intake-feed"
import type { LiveIntakeState } from "@/components/admin/overview/useLiveIntake"
import { setNewInquiryAlertEnabled, useNewInquiryAlertEnabled } from "@/components/admin/new-inquiry-alert-pref"

type SourceState = "loading" | "ready" | "error"

const COUNT = new Intl.NumberFormat("ko-KR")
const KST_HHMM = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" })

// 유입 그룹 색점 — lib/crm/lead-attribution SOURCE_GROUP_DOT 과 같은 값(홈페이지·메타·접수·자료실·기타).
const SOURCE_DOT: Record<IntakeSourceKind, string> = {
  homepage: "#1D9E75",
  ad: "#378ADD",
  intake: "#17868F",
  resources: "#BA7517",
  other: "#888780",
}

export const LEADS_BOARD_HREF = "/admin/crm/customers/leads"
const TRAFFIC_HREF = "/admin/traffic"

function formatKst(iso: string | null | undefined) {
  if (!iso) return "—"
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "—" : KST_HHMM.format(date)
}

function Cell({ label, href, linkLabel, children }: { label: string; href: string; linkLabel: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[148px] flex-col gap-2.5 bg-white px-5 pb-5 pt-4 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-[#615D59]">{label}</span>
        <Link href={href} className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-[#084734] hover:underline">
          {linkLabel}
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
      {children}
    </div>
  )
}

function BigValue({ value, unit, tone = "text-[#111110]" }: { value: string; unit: string; tone?: string }) {
  return (
    <p className={`text-[40px] font-bold leading-none tracking-[-0.03em] tabular-nums ${tone}`}>
      {value}
      <span className="ml-1 text-[16px] font-semibold tracking-normal">{unit}</span>
    </p>
  )
}

/** what 은 받침 없는 낱말(…집계·…문의)만 넘긴다 — 조사가 "를"로 고정이다. */
function Unavailable({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-[16px] font-bold text-[#8F2C2C]">확인 필요</p>
      <p className="text-[12px] leading-relaxed text-[#615D59]">{what}를 불러오지 못했습니다. 0으로 표시하지 않습니다.</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-semibold text-[#111110] hover:border-[#C8C8C4]"
      >
        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
        다시 시도
      </button>
    </div>
  )
}

function ValueSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-24" />
      <Skeleton className="h-3 w-36" />
    </div>
  )
}

function sourceBreakdown(data: IntakeFeedResult): string | null {
  // 배포 직후 브라우저에 남은 옛 응답에는 분해가 없다 — 없으면 줄을 그리지 않는다.
  if (!data.todayBySource) return null
  const parts = INTAKE_SOURCE_KIND_ORDER.filter((kind) => data.todayBySource[kind] > 0).map(
    (kind) => `${INTAKE_SOURCE_KIND_LABEL[kind]} ${COUNT.format(data.todayBySource[kind])}`
  )
  return parts.length > 0 ? parts.join(" · ") : null
}

function DeltaLine({ data }: { data: IntakeFeedResult }) {
  const partial = !data.adminMeasured || !data.compassMeasured || data.compassTruncated
  if (partial || data.delta == null) return null
  const sign = data.delta > 0 ? "▲ " : data.delta < 0 ? "▼ " : ""
  const tone = data.delta > 0 ? "text-[#084734]" : data.delta < 0 ? "text-[#B43E3E]" : "text-[#615D59]"
  return (
    <p className={`text-[12px] font-semibold ${tone}`}>
      {sign}
      {data.delta === 0 ? "어제와 같음" : COUNT.format(Math.abs(data.delta))}
      <span className="font-normal text-[#615D59]"> · 어제 이 시각 {COUNT.format(data.yesterdayCount)}건</span>
    </p>
  )
}

function PartialNote({ data }: { data: IntakeFeedResult }) {
  if (!data.compassMeasured) {
    return (
      <p className="text-[12px] leading-relaxed text-[#615D59]">
        <span className="font-bold text-[#7A520F]">미집계 · Compass 연결 끊김</span> — 어드민 리드만 셌습니다. 광고 리드가 빠졌을 수 있어 어제와 비교하지 않습니다.
      </p>
    )
  }
  if (!data.adminMeasured) {
    return (
      <p className="text-[12px] leading-relaxed text-[#615D59]">
        <span className="font-bold text-[#7A520F]">미집계 · 어드민 리드 조회 실패</span> — Compass 리드만 셌습니다.
      </p>
    )
  }
  if (data.compassTruncated) {
    return (
      <p className="text-[12px] leading-relaxed text-[#615D59]">
        <span className="font-bold text-[#7A520F]">일부만 집계</span> — Compass 조회가 상한에 닿아 실제보다 적을 수 있습니다.
      </p>
    )
  }
  return null
}

function FeedRow({ item }: { item: IntakeFeedItem }) {
  const kind: IntakeSourceKind = item.sourceKind ?? "other"
  const who = item.name ?? item.org ?? "이름 미상"
  const detail = [item.name ? item.org : null, item.adName].filter((part): part is string => Boolean(part)).join(" · ")
  const adminHref = item.adminLeadId ? `${LEADS_BOARD_HREF}?lead=${encodeURIComponent(item.adminLeadId)}` : null
  const compassHref = !adminHref && item.compassLeadId != null ? compassLeadUrl(item.compassLeadId) : null
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-t border-[rgba(0,0,0,0.06)] px-5 py-2 sm:grid-cols-[52px_minmax(0,1fr)_auto] sm:gap-4 sm:px-6">
      <span className="text-[12px] tabular-nums text-[#615D59] sm:text-[13px]">{formatKst(item.at)}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
        <span className="truncate text-[14px] font-semibold text-[#111110]">{who}</span>
        {detail ? <span className="truncate text-[12px] text-[#615D59] sm:text-[13px]">{detail}</span> : null}
        <span className="inline-flex items-center gap-1.5 text-[12px] text-[#31302E]">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: SOURCE_DOT[kind] }} />
          {INTAKE_SOURCE_KIND_LABEL[kind]}
        </span>
        {item.reinflow ? <span className="text-[12px] font-bold text-[#7A520F]">재유입</span> : null}
      </span>
      {adminHref ? (
        <Link href={adminHref} className="inline-flex items-center text-[13px] font-semibold text-[#084734] hover:underline">
          보기 →
        </Link>
      ) : compassHref ? (
        <a href={compassHref} target="_blank" rel="noreferrer" className="inline-flex items-center text-[13px] font-semibold text-[#084734] hover:underline">
          Compass →
        </a>
      ) : (
        <span />
      )}
    </li>
  )
}

export interface OverviewNowBandProps {
  visitorState: SourceState
  visitorToday: { visitors: number; homeVisitors: number } | null
  onVisitorRetry: () => void
  leadState: SourceState
  /** 전사 리드 집계(lead summary 의 company.metrics). */
  companyMetrics: Pick<OverviewLeadMetrics, "unrespondedCount" | "unresponded24hCount" | "unrespondedUnconfirmedCount"> | null
  onLeadRetry: () => void
  intake: LiveIntakeState
  maxItems?: number
}

export function OverviewNowBand({
  visitorState,
  visitorToday,
  onVisitorRetry,
  leadState,
  companyMetrics,
  onLeadRetry,
  intake,
  maxItems = 5,
}: OverviewNowBandProps) {
  const intakeData = intake.data
  const intakeMeasured = intakeData ? intakeData.adminMeasured || intakeData.compassMeasured : false
  const intakePartial = intakeData ? !intakeData.adminMeasured || !intakeData.compassMeasured || intakeData.compassTruncated : false
  const breakdown = intakeData && intakeMeasured ? sourceBreakdown(intakeData) : null
  const asOf = intakeData?.windows.nowIso ?? null
  const feed = intakeData?.items.slice(0, maxItems) ?? []
  const leadsReady = leadState === "ready" && companyMetrics != null
  const unresponded = companyMetrics?.unrespondedCount ?? 0
  const late = companyMetrics?.unresponded24hCount ?? 0
  const unconfirmed = companyMetrics?.unrespondedUnconfirmedCount ?? 0
  const alertEnabled = useNewInquiryAlertEnabled()

  return (
    <section
      aria-labelledby="overview-now-heading"
      className="relative mb-7 overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[rgba(0,0,0,0.04)_0px_4px_18px,rgba(0,0,0,0.027)_0px_2px_7.8px,rgba(0,0,0,0.02)_0px_0.8px_2.9px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="overview-now-heading" className="text-[16px] font-bold text-[#111110]">지금</h2>
          <span className="text-[12px] text-[#615D59]">전사 기준{asOf ? ` · ${formatKst(asOf)} 기준` : ""} · 1분마다 갱신</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={alertEnabled}
            onClick={() => setNewInquiryAlertEnabled(!alertEnabled)}
            title="어드민 어느 화면에서나 새 문의가 들어오면 오른쪽 아래에 알립니다. 이 브라우저에만 저장됩니다."
            className="inline-flex items-center rounded-md px-3 text-[12px] font-semibold text-[#615D59] hover:bg-[rgba(0,0,0,0.05)] hover:text-[#111110]"
          >
            새 문의 알림 {alertEnabled ? "켬" : "끔"}
          </button>
          <button
            type="button"
            onClick={intake.retry}
            className="inline-flex items-center gap-1.5 rounded-md bg-[rgba(0,0,0,0.05)] px-3 text-[12px] font-semibold text-[#111110] hover:bg-[rgba(0,0,0,0.08)]"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            새로 고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-[rgba(0,0,0,0.08)] lg:grid-cols-4">
        <Cell label="오늘 방문" href={TRAFFIC_HREF} linkLabel="트래픽">
          {visitorState === "loading" && !visitorToday ? (
            <ValueSkeleton />
          ) : visitorState === "error" || !visitorToday ? (
            <Unavailable what="방문 집계" onRetry={onVisitorRetry} />
          ) : (
            <>
              <BigValue value={COUNT.format(visitorToday.visitors)} unit="명" />
              <p className="text-[12px] text-[#615D59]">홈 방문 {COUNT.format(visitorToday.homeVisitors)}명 · 오늘 0시부터</p>
            </>
          )}
        </Cell>

        <Cell label="오늘 문의" href={`${LEADS_BOARD_HREF}?sort=newest&unconfirmed=1`} linkLabel="목록">
          {!intakeData && !intake.error ? (
            <ValueSkeleton />
          ) : !intakeData || !intakeMeasured ? (
            <Unavailable what="오늘 문의" onRetry={intake.retry} />
          ) : (
            <>
              <BigValue value={`${intakePartial ? "최소 " : ""}${COUNT.format(intakeData.todayCount)}`} unit="건" />
              <DeltaLine data={intakeData} />
              {breakdown ? <p className="text-[12px] text-[#615D59]">{breakdown}</p> : null}
              <PartialNote data={intakeData} />
            </>
          )}
        </Cell>

        <Cell label="응대 전 문의" href={`${LEADS_BOARD_HREF}?filter=unresponded`} linkLabel="확인하기">
          {leadState === "loading" && !companyMetrics ? (
            <ValueSkeleton />
          ) : !leadsReady ? (
            <Unavailable what="리드 집계" onRetry={onLeadRetry} />
          ) : (
            <>
              <BigValue value={COUNT.format(unresponded)} unit="건" />
              {unresponded > 0 ? (
                <>
                  <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#7A520F]">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#A8741A]" />
                    확인 필요
                  </p>
                  <p className="text-[12px] text-[#615D59]">신규 상태 · 그중 아직 아무도 안 본 문의 {COUNT.format(unconfirmed)}건</p>
                </>
              ) : (
                <p className="text-[12px] text-[#615D59]">들어온 문의를 모두 응대했습니다</p>
              )}
            </>
          )}
        </Cell>

        <Cell label="24h+ 미응답" href={`${LEADS_BOARD_HREF}?filter=unresponded_24h&focus=risk`} linkLabel="목록">
          {leadState === "loading" && !companyMetrics ? (
            <ValueSkeleton />
          ) : !leadsReady ? (
            <Unavailable what="리드 집계" onRetry={onLeadRetry} />
          ) : (
            <>
              <BigValue value={COUNT.format(late)} unit="건" tone={late > 0 ? "text-[#B43E3E]" : "text-[#111110]"} />
              <p className="text-[12px] text-[#615D59]">응대 대상 소스 · 24시간 넘게 신규 상태</p>
            </>
          )}
        </Cell>
      </div>

      <div className="border-t border-[rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between gap-3 px-5 pb-1.5 pt-3.5 sm:px-6">
          <h3 className="text-[13px] font-bold text-[#111110]">오늘 들어온 문의</h3>
          <span className="text-[12px] text-[#615D59]">최근순</span>
        </div>
        {!intakeData && !intake.error ? (
          <div className="space-y-2 px-5 pb-4 pt-1 sm:px-6">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : !intakeData || !intakeMeasured ? (
          <p className="px-5 pb-5 pt-1 text-[13px] text-[#615D59] sm:px-6">오늘 문의 목록을 불러오지 못했습니다.</p>
        ) : feed.length === 0 ? (
          <p className="px-5 pb-5 pt-1 text-[13px] text-[#615D59] sm:px-6">오늘 들어온 문의가 아직 없습니다.</p>
        ) : (
          <ul>
            {feed.map((item) => (
              <FeedRow key={item.key} item={item} />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-5 py-2 sm:px-6">
          <span className="text-[12px] text-[#615D59]">
            {intakeData && !intakeData.compassMeasured
              ? "Compass 연결이 끊겨 어드민 리드만 셉니다 · 연결되면 자동으로 다시 셉니다"
              : `어드민 리드 + Compass 리드 · 전화번호가 같으면 1건으로 셉니다${intakeData && intakeData.overlapCount > 0 ? ` (겹침 ${COUNT.format(intakeData.overlapCount)}건)` : ""}`}
          </span>
          <Link href={`${LEADS_BOARD_HREF}?sort=newest&unconfirmed=1`} className="inline-flex items-center text-[13px] font-semibold text-[#084734] hover:underline">
            리드 목록 모두 보기 →
          </Link>
        </div>
      </div>
    </section>
  )
}
