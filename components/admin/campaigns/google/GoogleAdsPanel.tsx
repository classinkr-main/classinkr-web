import { AlertTriangle, CalendarRange, CheckCircle2, Circle, ExternalLink, Gauge, Target, Wallet } from "lucide-react"
import { COUNT, compact, money, won } from "@/components/admin/campaigns/event-format"
import { KpiCard } from "@/components/admin/campaigns/tabs/KpiCard"
import { GOOGLE_ADS_CONFIG_HINT, spendCell, type CoverageState } from "@/lib/marketing/channel-coverage"
import {
  GOOGLE_ADS_ACCOUNTS,
  GOOGLE_ADS_API_STEPS,
  GOOGLE_ADS_BILLING,
  GOOGLE_ADS_CAMPAIGN_PLAN,
  GOOGLE_ADS_COUPON,
  GOOGLE_ADS_SETUP_AS_OF,
  GOOGLE_ADS_TODO,
  GOOGLE_ADS_TRACKING,
  GOOGLE_ADS_TRACKING_RULES,
  planBudget,
  planDays,
  planTotal,
} from "@/lib/marketing/google-ads-setup"
import type { MarketingPerfResponse } from "@/lib/marketing/perf"
import { AD_CHANNEL_COLOR } from "@/lib/types/event-metrics"

// Google Ads 패널 — 데이터 층 Meta 캠페인 바로 옆 섹션. 계정 점검 기록(정적,
// lib/marketing/google-ads-setup.ts)에, API 가 연동되면 perf 의 google_ads_daily 집계
// (channelLive · googleCampaigns)로 캠페인 실적 표를 얹는다. 연동 여부는 실제 설정값을 읽는다.

type GooglePerf = Pick<MarketingPerfResponse, "channelLive" | "googleCampaigns" | "period">

const PILL_TONE: Record<"neutral" | "ok" | "warn", string> = {
  neutral: "border-[#e8e8e4] text-[#615D59]",
  ok: "border-[#BDEFD8] text-[#084734]",
  warn: "border-[#ECD29C] text-[#A8741A]",
}

function Pill({ tone = "neutral", children }: { tone?: keyof typeof PILL_TONE; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${PILL_TONE[tone]}`}>
      {children}
    </span>
  )
}

const apiTone = (state: CoverageState | undefined) => (state === "live" ? "ok" : state === "none" ? "warn" : "neutral")

/** 1_822_000 → "₩182.2만" — KPI 대표 숫자 칸에 일곱 자리 원화가 넘치지 않게. */
const wonMan = (n: number) => `₩${compact.format(n)}`

/** "2026-11-03" → "11/3" */
const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

/** 통화를 모르는 금액은 그리지 않는다(채널 믹스와 같은 정직 규칙). */
const amount = (n: number | null, currency: string | null) =>
  n == null || currency == null ? "—" : currency === "KRW" ? won(n) : money(n, currency)
const count = (n: number | null) => (n == null ? "—" : COUNT.format(n))

export default function GoogleAdsPanel({
  perf,
  perfFailed = false,
}: {
  /** perf 응답(채널 라이브 · Google 캠페인 · 기간). 아직 안 왔으면 null. */
  perf: GooglePerf | null
  /** perf 조회가 실패해 API 연동 여부를 알 수 없다. */
  perfFailed?: boolean
}) {
  const live = perf?.channelLive.find((entry) => entry.channel === "google")
  const api = perf ? spendCell(live, GOOGLE_ADS_CONFIG_HINT) : null
  const campaigns = perf?.googleCampaigns ?? []
  const todo = api?.state === "none" ? [...GOOGLE_ADS_TODO, ...GOOGLE_ADS_API_STEPS] : GOOGLE_ADS_TODO
  const primary = GOOGLE_ADS_ACCOUNTS.find((account) => account.primary)
  const couponPct = Math.round((GOOGLE_ADS_COUPON.reservedSpend / GOOGLE_ADS_COUPON.spendTarget) * 100)
  const dailyAll = GOOGLE_ADS_CAMPAIGN_PLAN.reduce((sum, campaign) => sum + campaign.dailyBudget, 0)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: AD_CHANNEL_COLOR.google }} />
            <div>
              <h3 className="text-[14px] font-bold text-[#111110]">주 계정 {primary?.id}</h3>
              <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
                {primary?.login} · 선불 · {GOOGLE_ADS_SETUP_AS_OF} 점검 기록
              </p>
            </div>
            <Pill>정적 기록</Pill>
            <Pill tone={apiTone(api?.state)}>
              {api ? `API ${api.note}` : perfFailed ? "API 상태 확인 실패" : "API 상태 확인 중"}
            </Pill>
          </div>
          <a
            href="https://ads.google.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 self-start whitespace-nowrap rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110] lg:self-auto"
          >
            Google Ads
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {api && api.state !== "none" && (
        <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8e8e4] px-4 py-3 sm:px-5">
            <h3 className="text-[14px] font-semibold text-[#111110]">캠페인 실적 — API</h3>
            {perf && (
              <span className="text-[11px] text-[#84827a]">
                {shortDate(perf.period.since)}~{shortDate(perf.period.until)} · 일 1회 동기화
              </span>
            )}
          </div>
          {campaigns.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-[#A39E98]">
              {api.state === "live" ? "이 기간 노출이 있는 캠페인이 없습니다." : api.note}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#f0f0ec] text-left text-[12px]">
                <thead className="bg-[#fafaf8] text-[#1a1a1a]/45">
                  <tr>
                    <th className="px-4 py-3 font-semibold">캠페인</th>
                    <th className="px-4 py-3 text-right font-semibold">광고비</th>
                    <th className="px-4 py-3 text-right font-semibold">노출</th>
                    <th className="px-4 py-3 text-right font-semibold">클릭</th>
                    <th className="px-4 py-3 text-right font-semibold">전환</th>
                    <th className="px-4 py-3 text-right font-semibold">전환당 비용</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0ec]">
                  {campaigns.map((campaign) => (
                    <tr key={campaign.campaignId}>
                      <td className="max-w-[320px] truncate px-4 py-3 font-semibold text-[#111110]">
                        {campaign.campaignName ?? campaign.campaignId}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{amount(campaign.spend, campaign.currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{count(campaign.impressions)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{count(campaign.clicks)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{count(campaign.conversions)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">
                        {amount(campaign.costPerConversion, campaign.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {live && (
                  <tfoot className="border-t border-[#e8e8e4] bg-[#fdfdfc] font-semibold text-[#111110]">
                    <tr>
                      <td className="px-4 py-3">합계 {live.campaignCount}개</td>
                      <td className="px-4 py-3 text-right tabular-nums">{amount(live.spend, live.currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{count(live.impressions)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{count(live.clicks)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{count(live.conversions)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{amount(live.costPerConversion, live.currency)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Wallet className="h-3.5 w-3.5" />}
          label="선불 잔액"
          value={won(GOOGLE_ADS_BILLING.balance)}
          hint={`자동 충전 ${GOOGLE_ADS_BILLING.autoRecharge ? "켜짐" : "꺼짐"} · 카드 ${GOOGLE_ADS_BILLING.cardRegistered ? "등록" : "미등록"} — 충전 전엔 광고 미게재`}
          tone="warn"
        />
        <KpiCard
          icon={<Gauge className="h-3.5 w-3.5" />}
          label="쿠폰 진행"
          value={`${couponPct}%`}
          hint={`예약 ${won(GOOGLE_ADS_COUPON.reservedSpend)} / ${wonMan(GOOGLE_ADS_COUPON.spendTarget)} → 크레딧 ${wonMan(GOOGLE_ADS_COUPON.credit)}`}
        />
        <KpiCard
          icon={<CalendarRange className="h-3.5 w-3.5" />}
          label="필요 일 지출"
          value={won(GOOGLE_ADS_COUPON.dailyNeeded)}
          hint={`남은 ${GOOGLE_ADS_COUPON.daysLeft}일 동안 하루 약 — 쿠폰 조건 기준`}
        />
        <KpiCard
          icon={<Target className="h-3.5 w-3.5" />}
          label="캠페인 계획 합계"
          value={wonMan(planTotal())}
          hint={`${won(planTotal())} · C1~C4 · 4개 동시 집행 시 하루 ${won(dailyAll)}`}
          tone="success"
        />
      </div>

      <div className="rounded-2xl border border-[#e8e8e4] border-l-2 border-l-[#084734] bg-white px-4 py-3 sm:px-5">
        <h3 className="text-[13px] font-semibold text-[#111110]">남은 일 — 사용자가 직접</h3>
        <ul className="mt-2 space-y-1.5">
          {todo.map((item) => (
            <li key={item} className="flex items-start gap-2 text-[12.5px] text-[#111110]">
              <Circle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A39E98]" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
        <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-3 sm:px-5">
          <h3 className="text-[14px] font-semibold text-[#111110]">395 캠페인 계획</h3>
          <Pill>쿠폰 계획 · 상태는 광고 탭</Pill>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#f0f0ec] text-left text-[12px]">
            <thead className="bg-[#fafaf8] text-[#1a1a1a]/45">
              <tr>
                <th className="px-4 py-3 font-semibold">캠페인</th>
                <th className="px-4 py-3 font-semibold">유형 · 설정</th>
                <th className="px-4 py-3 text-right font-semibold">일 예산</th>
                <th className="px-4 py-3 font-semibold">기간</th>
                <th className="px-4 py-3 text-right font-semibold">기간 예산</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0ec]">
              {GOOGLE_ADS_CAMPAIGN_PLAN.map((campaign) => (
                <tr key={campaign.key} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-[#111110]">
                    {campaign.key} {campaign.goal}
                  </td>
                  <td className="min-w-[240px] px-4 py-3">
                    <p className="font-medium text-[#111110]">{campaign.type}</p>
                    {campaign.settings !== "—" && <p className="mt-0.5 text-[10.5px] text-[#1a1a1a]/45">{campaign.settings}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#111110]">{won(campaign.dailyBudget)}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[#111110]">
                    {shortDate(campaign.start)}~{shortDate(campaign.end)}
                    <span className="ml-1 text-[#A39E98]">({planDays(campaign)}일)</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#111110]">{won(planBudget(campaign))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-[#e8e8e4] bg-[#fdfdfc]">
              <tr>
                <td colSpan={2} className="px-4 py-3 font-semibold text-[#111110]">합계</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#615D59]">{won(dailyAll)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-[11px] text-[#84827a]">4개 동시(11/23~)</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-[#084734]">{won(planTotal())}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-4 sm:px-5">
          <h3 className="text-[14px] font-semibold text-[#111110]">계정 구조</h3>
          <ul className="mt-3 divide-y divide-[#f0f0ec]">
            {GOOGLE_ADS_ACCOUNTS.map((account) => (
              <li key={account.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold tabular-nums text-[#111110] text-[13px]">{account.id}</span>
                  <Pill tone={account.primary ? "ok" : "neutral"}>{account.role}</Pill>
                </div>
                <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">{account.login ?? "로그인 계정 미기록"}</p>
                <ul className="mt-1.5 space-y-0.5">
                  {account.notes.map((note) => (
                    <li key={note} className="text-[12px] leading-[1.5] text-[#615D59]">
                      · {note}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-[#111110]">전환 추적</h3>
            <a
              href="https://analytics.google.com/analytics/web/#/p543942005/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110]"
            >
              GA4
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <dl className="mt-3 space-y-2">
            {GOOGLE_ADS_TRACKING.map((fact) => (
              <div key={fact.label} className="grid grid-cols-[84px_minmax(0,1fr)] gap-2 text-[12px]">
                <dt className="font-semibold text-[#1a1a1a]/45">{fact.label}</dt>
                <dd className="flex items-start gap-1.5 leading-[1.5] text-[#111110]">
                  {fact.tone === "ok" && <CheckCircle2 aria-label="정상" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#084734]" />}
                  {fact.tone === "warn" && <AlertTriangle aria-label="주의" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A8741A]" />}
                  <span>{fact.value}</span>
                </dd>
              </div>
            ))}
          </dl>
          <ul className="mt-3 space-y-1 border-t border-[#f0f0ec] pt-3">
            {GOOGLE_ADS_TRACKING_RULES.map((rule) => (
              <li key={rule} className="text-[11.5px] leading-[1.5] text-[#84827a]">
                {rule}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
