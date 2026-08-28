// 완료된 월~일 주간의 광고 리드 성과를 공유 가능한 보고서로 변환하는 순수 모듈.
// 데이터 조회는 weekly-report-builder.ts가 맡고, 이 파일은 기간 계산·표시 계약·Markdown만 맡는다.
// 정직 규칙: Meta 금액은 USD 네이티브, CRM 광고 리드와 Meta 캠페인 리드는 서로 다른 축으로 밝힌다.

import { shiftDays, type MarketingPerfResponse, type PerfKpi } from "@/lib/marketing/perf"

export interface CompletedMarketingWeek {
  since: string
  until: string
  prevSince: string
  prevUntil: string
}

export interface WeeklyAdLeadCampaignRow {
  campaignId: string
  name: string
  status: string
  leads: number
  spendUsd: number | null
  cplUsd: number | null
  anomalies: string[]
}

export interface WeeklyAdLeadDailyPoint {
  date: string
  leads: number
  isWeekend: boolean
}

export interface WeeklyAdLeadReport {
  version: 2
  title: string
  generatedAt: string
  snapshotAt: string | null
  metaDataThrough: string | null
  dataStatus: "confirmed" | "provisional"
  summary: string
  period: CompletedMarketingWeek
  kpis: {
    spendUsd: PerfKpi
    adLeads: PerfKpi
    cplUsd: PerfKpi
    conversionRate: PerfKpi
  }
  funnel: {
    impressions: number
    clicks: number
    ctrPct: number | null
    adLeads: number
    contacted: number
    contactRatePct: number | null
    convertedLeads: number
  }
  dailyLeads: WeeklyAdLeadDailyPoint[]
  weekendLeads: number | null
  weekendSharePct: number | null
  uncontactedLeads: number | null
  campaigns: WeeklyAdLeadCampaignRow[]
  actions: string[]
  dataCaveats: string[]
  markdown: string
}

const round1 = (value: number) => Math.round(value * 10) / 10

function isoWeekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay()
}

function isWeekendDate(iso: string): boolean {
  const weekday = isoWeekday(iso)
  return weekday === 0 || weekday === 6
}

/**
 * KST 오늘을 기준으로 직전에 완전히 끝난 월요일~일요일을 반환한다.
 * 일요일 당일은 아직 끝나지 않은 주로 보므로 7일 전 일요일을 끝점으로 삼는다.
 */
export function resolveLastCompletedMarketingWeek(today: string): CompletedMarketingWeek {
  const weekday = isoWeekday(today)
  const daysBackToSunday = weekday === 0 ? 7 : weekday
  const until = shiftDays(today, -daysBackToSunday)
  const since = shiftDays(until, -6)
  const prevUntil = shiftDays(since, -1)
  const prevSince = shiftDays(prevUntil, -6)
  return { since, until, prevSince, prevUntil }
}

function formatUsd(value: number | null): string {
  if (value == null) return "미측정"
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatCount(value: number | null): string {
  return value == null ? "미측정" : `${value.toLocaleString("ko-KR")}건`
}

function formatPct(value: number | null): string {
  return value == null
    ? "미산정"
    : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`
}

function deltaLabel(kpi: PerfKpi): string {
  if (kpi.deltaPct == null) return "직전 주 대비 미산정"
  if (kpi.deltaPct === 0) return "직전 주와 동일"
  return `직전 주 대비 ${kpi.deltaPct > 0 ? "+" : ""}${kpi.deltaPct}%`
}

function markdownCell(value: string): string {
  return value
    .replaceAll("|", "\\|")
    .replace(/[\r\n]+/g, " ")
    .trim()
}

function buildDailyLeads(perf: MarketingPerfResponse): WeeklyAdLeadDailyPoint[] {
  if (perf.kpis.adLeads.value == null) return []
  const leadsByDate = new Map(perf.leadDailyBySource.map((point) => [point.date, point.meta ?? 0]))
  const points: WeeklyAdLeadDailyPoint[] = []
  for (let date = perf.period.since; date <= perf.period.until; date = shiftDays(date, 1)) {
    points.push({
      date,
      leads: leadsByDate.get(date) ?? 0,
      isWeekend: isWeekendDate(date),
    })
  }
  return points
}

function buildSummary({
  adLeads,
  weekendLeads,
  uncontactedLeads,
}: {
  adLeads: PerfKpi
  weekendLeads: number | null
  uncontactedLeads: number | null
}): string {
  if (adLeads.value == null) {
    return "CRM 광고 리드 데이터를 확인하지 못했습니다. 원천 연결 상태를 먼저 점검해야 합니다."
  }

  let movement = "직전 주와 비교할 수 없습니다"
  if (adLeads.deltaPct === 0) movement = "직전 주와 같습니다"
  else if (adLeads.deltaPct != null) {
    movement = `직전 주보다 ${Math.abs(adLeads.deltaPct)}% ${adLeads.deltaPct > 0 ? "증가" : "감소"}했습니다`
  }

  const weekend =
    weekendLeads == null ? "주말 실적은 미측정입니다" : `주말 리드는 ${weekendLeads}건입니다`
  const followUp =
    uncontactedLeads == null
      ? "접촉 상태는 미측정입니다"
      : uncontactedLeads > 0
        ? `${uncontactedLeads}건이 아직 미접촉 상태입니다`
        : "모든 광고 리드가 접촉 단계에 들어갔습니다"

  return `광고 리드 ${adLeads.value.toLocaleString("ko-KR")}건으로 ${movement}. ${weekend}. ${followUp}.`
}

function buildActions(
  perf: MarketingPerfResponse,
  campaigns: WeeklyAdLeadCampaignRow[],
  dataStatus: WeeklyAdLeadReport["dataStatus"],
): string[] {
  const actions: string[] = []
  const { adLeads, cplUsd, conversionRate } = {
    adLeads: perf.kpis.adLeads,
    cplUsd: perf.kpis.cplUsd,
    conversionRate: perf.kpis.leadConversionRate,
  }

  const uncontactedLeads = Math.max(0, perf.funnel.adLeads - perf.funnel.contacted)
  if (uncontactedLeads > 0) {
    actions.push(`미접촉 광고 리드 ${uncontactedLeads}건을 우선 배정하고 후속 접촉합니다.`)
  }
  if (dataStatus === "provisional") {
    actions.push("Meta 일별 데이터가 보고 종료일까지 집계됐는지 확인한 뒤 보고서를 확정합니다.")
  }
  if (adLeads.value === 0) {
    actions.push("Meta 리드폼 상태와 CRM 유입 연결을 점검해 광고 리드 0건의 원인을 확인합니다.")
  }
  if (cplUsd.deltaPct != null && cplUsd.deltaPct >= 20) {
    actions.push(`CPL이 직전 주보다 ${cplUsd.deltaPct}% 상승해 소재·타겟·예산 배분을 점검합니다.`)
  }
  if (conversionRate.deltaPct != null && conversionRate.deltaPct <= -20) {
    actions.push(
      `광고 리드 전환율이 직전 주보다 ${Math.abs(conversionRate.deltaPct)}% 낮아져 리드 품질과 후속 응대를 확인합니다.`,
    )
  }
  const anomalous = campaigns.filter((campaign) => campaign.anomalies.length > 0)
  if (anomalous.length > 0) {
    actions.push(
      `이상 신호가 있는 캠페인 ${anomalous
        .slice(0, 3)
        .map((campaign) => `「${campaign.name}」`)
        .join(", ")}을 확인합니다.`,
    )
  }

  if (actions.length === 0) {
    const top = campaigns[0]
    actions.push(
      top
        ? `리드 기여가 가장 큰 「${top.name}」의 소재·타겟 조건을 다음 주 운영 기준으로 검토합니다.`
        : "캠페인 연결 상태와 주간 업데이트를 확인해 다음 주 실행 기준을 남깁니다.",
    )
  }
  return actions.slice(0, 3)
}

function buildMarkdown(report: Omit<WeeklyAdLeadReport, "markdown">): string {
  const lines = [
    `# ${report.title}`,
    "",
    `- 보고 기간: ${report.period.since} ~ ${report.period.until} (KST, 월~일)`,
    `- 비교 기간: ${report.period.prevSince} ~ ${report.period.prevUntil}`,
    `- 데이터 상태: ${report.dataStatus === "confirmed" ? "확정" : "잠정"}`,
    `- Meta 집계 완료일: ${report.metaDataThrough ?? "미확인"}`,
    `- 생성 시각: ${report.generatedAt}`,
    `- Meta 스냅샷: ${report.snapshotAt ?? "미적재"}`,
    "",
    "## 핵심 성과",
    "",
    report.summary,
    "",
    "| 지표 | 이번 주 | 직전 주 | 변화 |",
    "| --- | ---: | ---: | ---: |",
    `| Meta 광고비 (USD) | ${formatUsd(report.kpis.spendUsd.value)} | ${formatUsd(report.kpis.spendUsd.previous)} | ${deltaLabel(report.kpis.spendUsd)} |`,
    `| 광고 리드 (CRM) | ${formatCount(report.kpis.adLeads.value)} | ${formatCount(report.kpis.adLeads.previous)} | ${deltaLabel(report.kpis.adLeads)} |`,
    `| CPL (USD) | ${formatUsd(report.kpis.cplUsd.value)} | ${formatUsd(report.kpis.cplUsd.previous)} | ${deltaLabel(report.kpis.cplUsd)} |`,
    `| 광고 리드 전환율 | ${formatPct(report.kpis.conversionRate.value)} | ${formatPct(report.kpis.conversionRate.previous)} | ${deltaLabel(report.kpis.conversionRate)} |`,
    "",
    "## 요일별 광고 리드",
    "",
    report.dailyLeads.length > 0
      ? report.dailyLeads
          .map((point) => `${point.date} ${point.leads}건${point.isWeekend ? " (주말)" : ""}`)
          .join(" · ")
      : "요일별 광고 리드 미측정",
    `- 주말 리드: ${formatCount(report.weekendLeads)}${report.weekendSharePct == null ? "" : ` · 전체의 ${formatPct(report.weekendSharePct)}`}`,
    "",
    "## 광고 퍼널",
    "",
    `- 노출 ${report.funnel.impressions.toLocaleString("ko-KR")}회 → 클릭 ${report.funnel.clicks.toLocaleString("ko-KR")}회 (CTR ${formatPct(report.funnel.ctrPct)})`,
    `- 광고 리드 ${report.funnel.adLeads.toLocaleString("ko-KR")}건 → 접촉 ${report.funnel.contacted.toLocaleString("ko-KR")}건 (접촉률 ${formatPct(report.funnel.contactRatePct)}) → 전환 ${report.funnel.convertedLeads.toLocaleString("ko-KR")}건`,
    "",
    "## 캠페인 성과",
    "",
  ]

  if (report.campaigns.length === 0) {
    lines.push("- 기간 내 측정된 연결 캠페인이 없습니다.")
  } else {
    lines.push("| 캠페인 | Meta 리드 | 광고비 (USD) | CPL (USD) | 이상 신호 |")
    lines.push("| --- | ---: | ---: | ---: | --- |")
    for (const campaign of report.campaigns) {
      lines.push(
        `| ${markdownCell(campaign.name)} | ${campaign.leads.toLocaleString("ko-KR")} | ${formatUsd(campaign.spendUsd)} | ${formatUsd(campaign.cplUsd)} | ${campaign.anomalies.length > 0 ? campaign.anomalies.map(markdownCell).join(", ") : "없음"} |`,
      )
    }
  }

  lines.push("", "## 다음 주 액션", "")
  report.actions.forEach((action, index) => lines.push(`${index + 1}. ${action}`))
  lines.push("", "## 데이터 기준", "")
  report.dataCaveats.forEach((caveat) => lines.push(`- ${caveat}`))
  return lines.join("\n")
}

export function buildWeeklyAdLeadReport(
  perf: MarketingPerfResponse,
  { generatedAt }: { generatedAt: string },
): WeeklyAdLeadReport {
  const campaigns = perf.scoreboard
    .map((row): WeeklyAdLeadCampaignRow => ({
      campaignId: row.campaignId,
      name: row.name,
      status: row.status,
      leads: row.leads,
      spendUsd: row.spendUsd,
      cplUsd: row.cpl,
      anomalies: row.anomalies,
    }))
    .filter((row) => row.leads > 0 || (row.spendUsd ?? 0) > 0)
    .sort((a, b) => b.leads - a.leads || (b.spendUsd ?? 0) - (a.spendUsd ?? 0))
    .slice(0, 10)

  const ctrPct =
    perf.funnel.impressions > 0
      ? round1((perf.funnel.clicks / perf.funnel.impressions) * 100)
      : null
  const contactRatePct =
    perf.funnel.adLeads > 0 ? round1((perf.funnel.contacted / perf.funnel.adLeads) * 100) : null
  const dailyLeads = buildDailyLeads(perf)
  const weekendLeads =
    dailyLeads.length > 0
      ? dailyLeads.reduce((total, point) => total + (point.isWeekend ? point.leads : 0), 0)
      : null
  const weekendSharePct =
    weekendLeads != null && perf.kpis.adLeads.value != null && perf.kpis.adLeads.value > 0
      ? round1((weekendLeads / perf.kpis.adLeads.value) * 100)
      : null
  const uncontactedLeads =
    perf.kpis.adLeads.value == null
      ? null
      : Math.max(0, perf.funnel.adLeads - perf.funnel.contacted)
  const dataStatus: WeeklyAdLeadReport["dataStatus"] =
    perf.metaDataThrough != null &&
    perf.metaDataThrough >= perf.period.until &&
    perf.kpis.spendUsd.value != null &&
    perf.kpis.adLeads.value != null
      ? "confirmed"
      : "provisional"
  const summary = buildSummary({
    adLeads: perf.kpis.adLeads,
    weekendLeads,
    uncontactedLeads,
  })
  const dataCaveats = [
    "Meta 광고비와 CPL은 계정 통화인 USD 네이티브이며 KRW 수기 예산과 합산하지 않습니다.",
    "광고 리드는 CRM의 meta_lead_ads 유입, 캠페인별 리드는 Meta 플랫폼 귀속값이라 서로 다를 수 있습니다.",
  ]
  if (perf.snapshotAt == null || perf.kpis.spendUsd.value == null) {
    dataCaveats.push("Meta 스냅샷이 없거나 조회에 실패해 광고비·CPL 일부가 미측정입니다.")
  }
  if (perf.metaDataThrough == null || perf.metaDataThrough < perf.period.until) {
    dataCaveats.push(
      `Meta 일별 데이터가 보고 종료일(${perf.period.until})까지 확인되지 않아 이 보고서는 잠정 수치입니다.`,
    )
  }
  if (perf.kpis.adLeads.value == null) {
    dataCaveats.push("CRM 리드 조회에 실패해 광고 리드·전환율이 미측정입니다.")
  }
  if (campaigns.length === 0) {
    dataCaveats.push("기간 내 리드가 측정된 연결 캠페인이 없어 캠페인 순위를 표시하지 않습니다.")
  }

  const base: Omit<WeeklyAdLeadReport, "markdown"> = {
    version: 2,
    title: "마케팅 광고 리드 주간 보고서",
    generatedAt,
    snapshotAt: perf.snapshotAt,
    metaDataThrough: perf.metaDataThrough,
    dataStatus,
    summary,
    period: {
      since: perf.period.since,
      until: perf.period.until,
      prevSince: perf.period.prevSince,
      prevUntil: perf.period.prevUntil,
    },
    kpis: {
      spendUsd: perf.kpis.spendUsd,
      adLeads: perf.kpis.adLeads,
      cplUsd: perf.kpis.cplUsd,
      conversionRate: perf.kpis.leadConversionRate,
    },
    funnel: {
      impressions: perf.funnel.impressions,
      clicks: perf.funnel.clicks,
      ctrPct,
      adLeads: perf.funnel.adLeads,
      contacted: perf.funnel.contacted,
      contactRatePct,
      convertedLeads: perf.funnel.convertedLeads,
    },
    dailyLeads,
    weekendLeads,
    weekendSharePct,
    uncontactedLeads,
    campaigns,
    actions: buildActions(perf, campaigns, dataStatus),
    dataCaveats,
  }
  return { ...base, markdown: buildMarkdown(base) }
}

/** DB jsonb에서 읽은 최신 브리핑 payload가 새 보고서 계약인지 확인하는 최소 런타임 가드. */
export function isWeeklyAdLeadReport(value: unknown): value is WeeklyAdLeadReport {
  if (!value || typeof value !== "object") return false
  const report = value as Partial<WeeklyAdLeadReport>
  return (
    report.version === 2 &&
    typeof report.title === "string" &&
    typeof report.generatedAt === "string" &&
    typeof report.markdown === "string" &&
    (report.dataStatus === "confirmed" || report.dataStatus === "provisional") &&
    typeof report.summary === "string" &&
    Boolean(report.period && typeof report.period.until === "string") &&
    Boolean(report.kpis && report.kpis.adLeads) &&
    Boolean(report.funnel && typeof report.funnel.adLeads === "number") &&
    Array.isArray(report.dailyLeads) &&
    Array.isArray(report.campaigns) &&
    Array.isArray(report.actions) &&
    Array.isArray(report.dataCaveats)
  )
}
