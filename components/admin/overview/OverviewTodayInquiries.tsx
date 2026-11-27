"use client"

// Overview "오늘 들어온 문의" — 직접 문의 먼저(2026-11-27 시안 B 채택).
//
// 위 칸: 홈페이지 폼 · 쇼룸 예약 · 도입 신청 — 사람이 직접 남긴 문의를 카드로 크게. 광고 리드가 많은 날에도
//        묻히지 않도록 서버가 따로 싣는 directItems 를 쓴다(전체 최근 피드 items 에서 거르지 않는다).
// 아래 칸: 광고 · 자료 · 기타 리드를 촘촘한 목록으로.
//
// 정직 규칙("지금" 띠와 같다):
//  - 조회 실패를 0건으로 표시하지 않는다. 어드민 리드가 미측정이면 직접 문의 칸을 "확인 필요"로 둔다
//    (직접 문의는 어드민 리드에서 온다). Compass 가 미측정이면 광고 칸에 그렇다고 밝힌다.
//  - 응대 상태: 어드민 리드는 리드 보드 '응대 전' 술어, Compass 에만 있는 리드는 Compass 단계.
//  - 버튼은 리드를 여는 링크다. 누른다고 상태가 바뀌지 않는다.

import { useState } from "react"
import Link from "next/link"
import { RotateCw } from "lucide-react"

import { Skeleton } from "@/components/admin/viz"
import type { LiveIntakeState } from "@/components/admin/overview/useLiveIntake"
import { compassLeadUrl } from "@/lib/compass/normalize"
import {
  INTAKE_RESPONSE_LABEL,
  INTAKE_SOURCE_KIND_DOT,
  INTAKE_SOURCE_KIND_LABEL,
  isDirectIntakeKind,
  type IntakeFeedItem,
  type IntakeFeedResult,
  type IntakeResponseState,
} from "@/lib/marketing/intake-feed"

const LEADS_BOARD_HREF = "/admin/crm/customers/leads"
const BORDER = "border-[rgba(0,0,0,0.08)]"
const COUNT = new Intl.NumberFormat("ko-KR")
const KST_HHMM = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" })
/** 직접 문의 카드를 처음에 몇 장 보일지 — 나머지는 "더 보기"로 펼친다. */
const DIRECT_INITIAL = 6

function formatKst(iso: string | null | undefined) {
  if (!iso) return "—"
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "—" : KST_HHMM.format(date)
}

function leadLinks(item: IntakeFeedItem) {
  const adminHref = item.adminLeadId ? `${LEADS_BOARD_HREF}?lead=${encodeURIComponent(item.adminLeadId)}` : null
  const compassHref = !adminHref && item.compassLeadId != null ? compassLeadUrl(item.compassLeadId) : null
  return { adminHref, compassHref }
}

function lanes(data: IntakeFeedResult) {
  // 배포 직후 브라우저에 남은 옛 응답(v4)에는 directItems·leadItems 가 없다 — 최근 피드에서 나눠 보여 준다.
  const direct = data.directItems ?? data.items.filter((item) => isDirectIntakeKind(item.sourceKind))
  const leads = data.leadItems ?? data.items.filter((item) => !isDirectIntakeKind(item.sourceKind))
  const bySource = data.todayBySource
  const directCount = bySource ? bySource.homepage + bySource.intake : direct.length
  const leadCount = bySource ? bySource.ad + bySource.resources + bySource.other : leads.length
  return { direct, leads, directCount, leadCount }
}

function countAwaiting(items: readonly IntakeFeedItem[]) {
  return items.filter((item) => item.response === "awaiting").length
}

function KindDot({ item }: { item: IntakeFeedItem }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: INTAKE_SOURCE_KIND_DOT[item.sourceKind ?? "other"] }} />
      {INTAKE_SOURCE_KIND_LABEL[item.sourceKind ?? "other"]}
    </span>
  )
}

function ResponseLabel({ state }: { state: IntakeResponseState | null | undefined }) {
  if (!state) return <span className="text-[12px] text-[#615D59]">상태 확인 전</span>
  if (state === "awaiting") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#7A520F]">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#A8741A]" />
        {INTAKE_RESPONSE_LABEL.awaiting}
      </span>
    )
  }
  return <span className="text-[12px] font-semibold text-[#615D59]">{INTAKE_RESPONSE_LABEL[state]}</span>
}

const PRIMARY_ACTION =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-[#084734] px-3.5 text-[13px] font-semibold text-white hover:bg-[#065c41]"
const SECONDARY_ACTION =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-[#E8E8E4] bg-white px-3.5 text-[13px] font-semibold text-[#111110] hover:border-[#C8C8C4]"

function CardAction({ item, who }: { item: IntakeFeedItem; who: string }) {
  const { adminHref, compassHref } = leadLinks(item)
  const awaiting = item.response === "awaiting"
  if (adminHref) {
    return (
      <Link href={adminHref} aria-label={`${who} 리드 열기`} className={awaiting ? PRIMARY_ACTION : SECONDARY_ACTION}>
        {awaiting ? "응대 시작" : "리드 열기"}
      </Link>
    )
  }
  if (compassHref) {
    return (
      <a href={compassHref} target="_blank" rel="noreferrer" aria-label={`${who} Compass 에서 열기`} className={awaiting ? PRIMARY_ACTION : SECONDARY_ACTION}>
        Compass에서 열기
      </a>
    )
  }
  return null
}

function DirectCard({ item }: { item: IntakeFeedItem }) {
  const who = item.name ?? item.org ?? "이름 미상"
  const orgLine = [item.name ? item.org : null, item.region].filter((part): part is string => Boolean(part)).join(" · ")
  const via = [item.formLabel, item.adName].filter((part): part is string => Boolean(part)).join(" · ")
  const awaiting = item.response === "awaiting"
  return (
    <li className={`flex min-w-0 flex-col gap-2.5 rounded-xl border bg-white p-4 ${awaiting ? "border-[#ECD29C]" : BORDER}`}>
      <div className="flex items-center justify-between gap-2 text-[12px] text-[#31302E]">
        <KindDot item={item} />
        <span className="tabular-nums text-[#615D59]">
          <time dateTime={item.at}>{formatKst(item.at)}</time>
          {item.reinflow ? <span className="ml-1.5 font-bold text-[#7A520F]">재유입</span> : null}
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[17px] font-bold text-[#111110]">{who}</p>
        {orgLine ? <p className="mt-0.5 truncate text-[13px] text-[#615D59]">{orgLine}</p> : null}
      </div>
      {via ? <p className="truncate text-[13px] text-[#31302E]">{via}</p> : null}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <ResponseLabel state={item.response} />
        <CardAction item={item} who={who} />
      </div>
    </li>
  )
}

function LeadRow({ item }: { item: IntakeFeedItem }) {
  const who = item.name ?? item.org ?? "이름 미상"
  const detail = item.name ? item.org : null
  const via = item.adName ?? item.formLabel
  const { adminHref, compassHref } = leadLinks(item)
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-t border-[rgba(0,0,0,0.06)] py-2.5 sm:grid-cols-[52px_minmax(0,1.1fr)_minmax(0,1fr)_84px_auto] sm:gap-4">
      <time dateTime={item.at} className="text-[12px] tabular-nums text-[#615D59] sm:text-[13px]">{formatKst(item.at)}</time>
      <span className="min-w-0">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[14px] font-semibold text-[#111110]">{who}</span>
          {detail ? <span className="truncate text-[13px] text-[#615D59]">{detail}</span> : null}
          {item.reinflow ? <span className="shrink-0 text-[12px] font-bold text-[#7A520F]">재유입</span> : null}
        </span>
        {/* 좁은 화면: 경로·상태를 이름 아래 한 줄로 */}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-[#31302E] sm:hidden">
          <KindDot item={item} />
          <ResponseLabel state={item.response} />
        </span>
      </span>
      <span className="hidden min-w-0 truncate text-[13px] text-[#31302E] sm:block">
        <KindDot item={item} />
        {via ? <span className="text-[#615D59]"> · {via}</span> : null}
      </span>
      <span className="hidden sm:block">
        <ResponseLabel state={item.response} />
      </span>
      {adminHref ? (
        <Link href={adminHref} aria-label={`${who} 리드 열기`} className="inline-flex items-center justify-end text-[13px] font-semibold text-[#084734] hover:underline">
          보기 →
        </Link>
      ) : compassHref ? (
        <a href={compassHref} target="_blank" rel="noreferrer" aria-label={`${who} Compass 에서 열기`} className="inline-flex items-center justify-end text-[13px] font-semibold text-[#084734] hover:underline">
          Compass →
        </a>
      ) : (
        <span />
      )}
    </li>
  )
}

function Unavailable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="status" className="flex flex-col items-start gap-2 py-4">
      <p className="text-[14px] font-bold text-[#8F2C2C]">확인 필요</p>
      <p className="text-[12px] leading-relaxed text-[#615D59]">{message} 0건으로 표시하지 않습니다.</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-semibold text-[#111110] hover:border-[#C8C8C4]"
      >
        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
        다시 시도
      </button>
    </div>
  )
}

function LaneHeading({ id, title, count, meta }: { id: string; title: string; count: number | null; meta: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h3 id={id} className="text-[15px] font-bold text-[#111110]">
        {title}
        {count != null ? <span className="ml-1.5 font-semibold tabular-nums text-[#615D59]">{COUNT.format(count)}</span> : null}
      </h3>
      <p className="text-[12px] text-[#615D59]">{meta}</p>
    </div>
  )
}

export function OverviewTodayInquiries({ intake, className = "" }: { intake: LiveIntakeState; className?: string }) {
  const [showAllDirect, setShowAllDirect] = useState(false)
  const data = intake.data
  const measured = data ? data.adminMeasured || data.compassMeasured : false
  const asOf = data?.windows.nowIso ?? null
  const view = data && measured ? lanes(data) : null
  const directShown = view ? (showAllDirect ? view.direct : view.direct.slice(0, DIRECT_INITIAL)) : []
  const directAwaiting = view ? countAwaiting(view.direct) : 0
  const leadAwaiting = view ? countAwaiting(view.leads) : 0
  const partial = data ? !data.adminMeasured || !data.compassMeasured || data.compassTruncated : false

  const leadMeta = (() => {
    if (!data?.todayBySource) return "광고 · 자료 · 기타"
    const parts = (["ad", "resources", "other"] as const)
      .filter((kind) => data.todayBySource[kind] > 0)
      .map((kind) => `${INTAKE_SOURCE_KIND_LABEL[kind]} ${COUNT.format(data.todayBySource[kind])}`)
    if (view && view.leads.length === view.leadCount && leadAwaiting > 0) parts.push(`응대 전 ${COUNT.format(leadAwaiting)}`)
    return parts.length ? parts.join(" · ") : "광고 · 자료 · 기타"
  })()
  const directMeta = view
    ? `홈페이지 폼 · 쇼룸 예약 · 도입 신청${directAwaiting > 0 ? ` · 응대 전 ${COUNT.format(directAwaiting)}` : ""}`
    : "홈페이지 폼 · 쇼룸 예약 · 도입 신청"

  return (
    <section aria-labelledby="overview-today-inquiries-heading" className={className}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="overview-today-inquiries-heading" className="text-xl font-bold tracking-[-0.025em] text-[#111110]">
            오늘 들어온 문의
            {data && measured ? (
              <span className="ml-2 font-semibold tabular-nums text-[#615D59]">
                {partial ? "최소 " : ""}
                {COUNT.format(data.todayCount)}
              </span>
            ) : null}
          </h2>
          <span className="text-xs text-[#615D59]">전사{asOf ? ` · ${formatKst(asOf)} 기준` : ""} · 1분마다 갱신</span>
        </div>
        <Link href={`${LEADS_BOARD_HREF}?sort=newest&unconfirmed=1`} className="inline-flex items-center text-[13px] font-semibold text-[#084734] hover:underline">
          리드 목록 →
        </Link>
      </div>

      {!data && !intake.error ? (
        <div className="grid gap-4" aria-busy="true">
          <div className={`rounded-2xl border ${BORDER} bg-white p-5 sm:p-6`}>
            <Skeleton className="h-5 w-40" />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
            </div>
          </div>
          <div className={`rounded-2xl border ${BORDER} bg-white p-5 sm:p-6`}>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-4 h-10 w-full" />
            <Skeleton className="mt-2 h-10 w-full" />
          </div>
        </div>
      ) : !data || !view ? (
        <div className={`rounded-2xl border ${BORDER} bg-white px-5 sm:px-6`}>
          <Unavailable message="오늘 문의를 불러오지 못했습니다." onRetry={intake.retry} />
        </div>
      ) : (
        <div className="grid gap-4">
          <section aria-labelledby="overview-direct-inquiries-heading" className={`rounded-2xl border ${BORDER} bg-white p-5 sm:p-6`}>
            <LaneHeading
              id="overview-direct-inquiries-heading"
              title="직접 문의"
              count={data.adminMeasured ? view.directCount : null}
              meta={directMeta}
            />
            {!data.adminMeasured ? (
              <Unavailable message="홈페이지·쇼룸·도입 문의(어드민 리드)를 불러오지 못했습니다." onRetry={intake.retry} />
            ) : view.direct.length === 0 ? (
              <p className={`mt-4 rounded-xl border border-dashed ${BORDER} px-4 py-6 text-center text-[13px] text-[#615D59]`}>
                오늘 들어온 홈페이지·쇼룸·도입 문의가 아직 없습니다.
              </p>
            ) : (
              <>
                <ul aria-label="직접 문의 목록" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {directShown.map((item) => (
                    <DirectCard key={item.key} item={item} />
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  {view.direct.length > DIRECT_INITIAL ? (
                    <button
                      type="button"
                      onClick={() => setShowAllDirect((value) => !value)}
                      aria-expanded={showAllDirect}
                      className="inline-flex min-h-11 items-center text-[13px] font-semibold text-[#111110] hover:underline"
                    >
                      {showAllDirect ? "접기" : `${COUNT.format(view.direct.length - DIRECT_INITIAL)}건 더 보기`}
                    </button>
                  ) : (
                    <span />
                  )}
                  {view.directCount > view.direct.length ? (
                    <Link href={`${LEADS_BOARD_HREF}?sort=newest&unconfirmed=1`} className="text-[12px] font-semibold text-[#084734] hover:underline">
                      오늘 {COUNT.format(view.directCount)}건 중 최근 {COUNT.format(view.direct.length)}건 · 리드 목록에서 모두 보기 →
                    </Link>
                  ) : null}
                </div>
              </>
            )}
          </section>

          <section aria-labelledby="overview-lead-inquiries-heading" className={`rounded-2xl border ${BORDER} bg-white p-5 sm:p-6`}>
            <LaneHeading id="overview-lead-inquiries-heading" title="광고 · 자료 리드" count={view.leadCount} meta={leadMeta} />
            {!data.compassMeasured ? (
              <p className="mt-3 text-[12px] leading-relaxed text-[#615D59]">
                <span className="font-bold text-[#7A520F]">미집계 · Compass 연결 끊김</span> — 어드민 리드만 셌습니다. 광고 리드가 빠졌을 수 있습니다.
              </p>
            ) : data.compassTruncated ? (
              <p className="mt-3 text-[12px] leading-relaxed text-[#615D59]">
                <span className="font-bold text-[#7A520F]">일부만 집계</span> — Compass 조회가 상한에 닿아 실제보다 적을 수 있습니다.
              </p>
            ) : null}
            {view.leads.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#615D59]">오늘 들어온 광고·자료 리드가 아직 없습니다.</p>
            ) : (
              <ul aria-label="광고·자료 리드 목록" className="mt-3">
                {view.leads.map((item) => (
                  <LeadRow key={item.key} item={item} />
                ))}
              </ul>
            )}
            {view.leadCount > view.leads.length ? (
              <p className="mt-2 text-[12px] text-[#615D59]">
                오늘 {COUNT.format(view.leadCount)}건 중 최근 {COUNT.format(view.leads.length)}건 ·{" "}
                <Link href={`${LEADS_BOARD_HREF}?sort=newest&unconfirmed=1`} className="font-semibold text-[#084734] hover:underline">
                  모두 보기 →
                </Link>
              </p>
            ) : null}
          </section>

          <p className="text-[11px] leading-relaxed text-[#615D59]">
            어드민 리드 + Compass 리드 · 전화번호가 같으면 1건{data.overlapCount > 0 ? `(겹침 ${COUNT.format(data.overlapCount)}건)` : ""} · 상태는 어드민 리드면 리드 보드 기준, Compass 에만 있으면 Compass 단계 · 버튼은 리드를 여는 링크입니다
          </p>
        </div>
      )}
    </section>
  )
}
