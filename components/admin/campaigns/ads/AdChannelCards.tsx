import Link from "next/link"
import { ArrowUpRight, ExternalLink } from "lucide-react"
import { COUNT } from "@/components/admin/campaigns/event-format"
import type { AdBoard, AdBoardBucket, AdBoardCampaign, AdBoardChannel, AdBoardStatus } from "@/lib/marketing/ad-board"
import { YOUTUBE_STUDIO_RECORD } from "@/lib/marketing/google-ads-setup"
import type { PerfChannelLive } from "@/lib/marketing/perf"
import { AD_CHANNEL_COLOR } from "@/lib/types/event-metrics"

// 광고 탭 채널 카드(시안 C, 2026-11-06) — Google 395 · Meta · 유튜브 스튜디오 카드 3장.
// 카드 안 캠페인 줄: 상태 · 기간·일 예산 · 기간 집행 · 우리 DB 리드 · 리드당 비용.
// 플랫폼이 센 리드·전환은 회색 참고 줄로만 — 성과 판단은 DB 리드로 한다(lib/marketing/ad-board.ts).
// 시안: docs/active/mockups/campaign-channel-tree-2026-11-06.html
// 상태는 채움 없이 점 모양·글자색으로만 가른다(DESIGN.md 어드민 라벨 단순화).

const STATUS_LABEL: Record<AdBoardStatus, string> = {
  running: "운영",
  planned: "예정",
  held: "보류",
  paused: "일시중지",
  ended: "종료",
}

const STATUS_TEXT: Record<AdBoardStatus, string> = {
  running: "font-semibold text-[#084734]",
  planned: "text-[#615D59]",
  held: "font-semibold text-[#A8741A]",
  paused: "text-[#615D59]",
  ended: "text-[#84827a]",
}

const STATUS_DOT: Record<AdBoardStatus, string> = {
  running: "bg-[#084734]",
  planned: "border-[1.5px] border-dashed border-[#84827a]",
  held: "border-[1.5px] border-dashed border-[#A8741A]",
  paused: "border-[1.5px] border-[#615D59]",
  ended: "bg-[#E8E8E4]",
}

/** "2026-11-03" → "11/3" */
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

/** 집행 표기 — 통화를 모르면 0 만 그린다(통화 모르는 금액 금지). */
function amount(n: number | null, currency: string | null, digits = 0): string {
  if (n == null) return "—"
  if (!currency) return n === 0 ? "0" : "—"
  const symbol = currency === "KRW" ? "₩" : currency === "USD" ? "$" : `${currency} `
  return `${symbol}${new Intl.NumberFormat("en-US", { maximumFractionDigits: currency === "KRW" ? 0 : digits, minimumFractionDigits: 0 }).format(n)}`
}

function costPerLead(spend: number | null, leads: number | null, currency: string | null): string | null {
  if (spend == null || leads == null || leads === 0) return null
  return amount(spend / leads, currency, 1)
}

function periodText(row: Pick<AdBoardCampaign, "start" | "end">): string | null {
  if (row.start && row.end) return `${md(row.start)}~${md(row.end)}`
  if (row.start) return `${md(row.start)}~`
  if (row.end) return `~${md(row.end)}`
  return null
}

export function AdStatusLabel({ status, label }: { status: AdBoardStatus; label?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] ${STATUS_TEXT[status]}`}>
      <span aria-hidden className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
      {label ?? STATUS_LABEL[status]}
    </span>
  )
}

function Dot({ color, faded = false }: { color: string; faded?: boolean }) {
  return <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color, opacity: faded ? 0.45 : 1 }} />
}

function Num({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-[#615D59]">{label}</div>
      <div className={`text-[20px] font-bold leading-tight tracking-[-0.02em] ${muted ? "text-[#84827a]" : "text-[#111110]"}`}>{value}</div>
    </div>
  )
}

function CampaignItem({
  row,
  currency,
  stoppedLabel,
}: {
  row: AdBoardCampaign
  currency: string | null
  /** 계획표 없는 채널(Meta)은 '일시중지'인지 '종료'인지 모른다 — 집행이 멈췄다고만 말한다. */
  stoppedLabel?: string
}) {
  const left = [
    // 보류는 기간이 의미 없다(계획만) — 예산·메모만 남긴다.
    row.status === "held" ? null : row.status === "paused" && row.lastActive && !row.start ? `마지막 집행 ${md(row.lastActive)}` : periodText(row),
    row.dailyBudget != null ? `일 ${amount(row.dailyBudget, "KRW")}` : null,
    row.note,
  ].filter(Boolean)
  const cpl = costPerLead(row.spend, row.dbLeads, currency)
  const contactPct = row.dbLeads ? Math.round((row.contacted / row.dbLeads) * 100) : null
  const hasResult = row.spend != null || row.dbLeads != null
  const right = hasResult
    ? [
        row.spend != null ? amount(row.spend, currency) : "집행 미집계",
        row.dbLeads != null ? `리드 ${COUNT.format(row.dbLeads)}` : null,
        cpl,
      ].filter(Boolean)
    : null
  // 유튜브(동영상)·디맨드젠은 클릭보다 조회가 성과 지표다 — 조회수가 있으면 앞에 둔다.
  // 빈 날이 섞인 조회수는 하한(「이상」)이고 조회당 비용은 내지 않는다(summarizeVideo 가 null).
  const video = row.video?.videoViews != null && row.video.videoViews > 0 ? row.video : null
  const videoPart = video
    ? [
        `조회 ${COUNT.format(video.videoViews ?? 0)}${video.viewsPartial ? " 이상" : ""}`,
        // 원화 조회당 비용은 100원 아래가 보통이라 소수 한 자리(₩11.3) — amount() 의 원화 정수 규칙(CPL 등)은 그대로 둔다.
        video.costPerView != null
          ? `조회당 ${currency === "KRW" && video.costPerView < 100 ? `₩${video.costPerView.toFixed(1)}` : amount(video.costPerView, currency, 1)}`
          : null,
      ].filter(Boolean)
    : []
  const platform =
    row.platformLeads != null
      ? row.clicks != null && currency === "KRW"
        ? [...videoPart, `클릭 ${COUNT.format(row.clicks)}`, `전환 ${COUNT.format(row.platformLeads)}`].join(" · ")
        : `플랫폼 리드 ${COUNT.format(row.platformLeads)}`
      : null

  return (
    <li className="border-b border-[#f0f0ec] px-4 py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-[12.5px] font-semibold text-[#111110]" title={row.name}>
          {row.key && <span className="mr-1.5 text-[11px] font-bold text-[#84827a]">{row.key}</span>}
          {row.name}
        </p>
        <span className="flex shrink-0 items-center gap-2">
          {row.planMismatch && (
            <span className="text-[11px] text-[#A8741A]" title="계획표 상태와 광고 스냅샷이 다릅니다 — lib/marketing/google-ads-setup.ts 를 고치거나 광고 상태를 확인하세요">
              ⚠ 계획과 다름
            </span>
          )}
          <AdStatusLabel status={row.status} label={row.status === "paused" ? stoppedLabel : undefined} />
        </span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[11.5px] tabular-nums text-[#615D59]">
        <span className="min-w-0 truncate" title={left.join(" · ")}>
          {left.join(" · ") || "—"}
        </span>
        <span className="shrink-0 text-right">
          {right ? right.join(" · ") : "—"}
          {contactPct != null && <span className="text-[#84827a]"> · 연락 {contactPct}%</span>}
        </span>
      </div>
      {platform && (
        <p className="mt-0.5 text-right text-[11px] tabular-nums text-[#A39E98]">참고 · {platform}</p>
      )}
    </li>
  )
}

function Buckets({ buckets }: { buckets: AdBoardBucket[] }) {
  if (buckets.length === 0) return null
  return (
    <ul className="border-t border-[#e8e8e4] px-4 py-2">
      {buckets.map((bucket) => (
        <li key={bucket.label} className="flex items-baseline justify-between gap-3 py-0.5 text-[11.5px]">
          <span className="min-w-0 truncate text-[#615D59]" title={bucket.note}>
            {bucket.label} <span className="text-[#84827a]">· {bucket.note}</span>
          </span>
          <span className="shrink-0 tabular-nums text-[#111110]">
            리드 {COUNT.format(bucket.dbLeads)}
            <span className="text-[#84827a]"> · 연락 {COUNT.format(bucket.contacted)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function CardShell({ children }: { children: React.ReactNode }) {
  return <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">{children}</section>
}

function syncLine(live: PerfChannelLive | undefined): string {
  if (!live) return "동기화 정보 없음"
  const through = live.dataThrough ? `${md(live.dataThrough)}까지` : "스냅샷 없음"
  return live.configured ? `API 읽기 · ${through}` : `API 미연동 · ${through}`
}

function leadsValue(channel: AdBoardChannel, measured: boolean) {
  return measured ? COUNT.format(channel.dbLeads) : "—"
}

export function AdChannelCards({
  board,
  channelLive,
  links,
}: {
  board: AdBoard
  channelLive: PerfChannelLive[]
  links: { google: string; metaCreatives: string; metaTable: string }
}) {
  const { google, meta, leadsMeasured } = board
  const googleLive = channelLive.find((entry) => entry.channel === "google")
  const metaLive = channelLive.find((entry) => entry.channel === "meta")
  const googleCurrency = google.currency ?? googleLive?.currency ?? null
  const metaCurrency = meta.currency ?? metaLive?.currency ?? null
  const runningGoogle = google.campaigns.filter((row) => row.status === "running").length
  const legacyLeads = google.legacy.reduce((total, row) => total + (row.dbLeads ?? 0), 0)

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <CardShell>
        <header className="border-b border-[#e8e8e4] px-4 pb-3 pt-3.5">
          <h3 className="flex items-center gap-2 text-[14px] font-bold text-[#111110]">
            <Dot color={AD_CHANNEL_COLOR.google} />
            Google Ads 395
          </h3>
          <p className="mt-0.5 text-[11px] text-[#84827a]">
            {googleCurrency ?? "KRW"} · {syncLine(googleLive)}
          </p>
          <div className="mt-2.5 grid grid-cols-3 gap-3">
            <Num label="집행" value={amount(google.spend, googleCurrency)} muted={google.spend == null} />
            <Num label="DB 리드" value={leadsValue(google, leadsMeasured)} />
            <Num label="운영" value={COUNT.format(runningGoogle)} />
          </div>
        </header>
        <ul>
          {google.campaigns.map((row) => (
            <CampaignItem key={row.id} row={row} currency={googleCurrency} />
          ))}
        </ul>
        <Buckets buckets={google.unmatched} />
        {google.legacy.length > 0 && (
          <details className="group border-t border-[#e8e8e4]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-[11.5px] text-[#615D59] hover:text-[#111110]">
              <span className="flex items-center gap-2">
                <Dot color={AD_CHANNEL_COLOR.google} faded />
                924(옛 계정) · API 권한 없음 · {google.legacy.length}개
              </span>
              <span className="tabular-nums">
                {leadsMeasured ? `리드 ${COUNT.format(legacyLeads)}` : ""} <span className="group-open:hidden">▸</span>
                <span className="hidden group-open:inline">▾</span>
              </span>
            </summary>
            <ul className="border-t border-[#f0f0ec] bg-[#fdfdfc]">
              {google.legacy.map((row) => (
                <CampaignItem key={row.id} row={row} currency={googleCurrency} />
              ))}
            </ul>
          </details>
        )}
        <footer className="border-t border-[#e8e8e4] px-4 py-2 text-[11px] text-[#84827a]">
          계획(예정·보류·기간·예산)은 계획표, 운영 여부·집행은 스냅샷 ·{" "}
          <Link href={links.google} className="font-semibold text-[#084734] hover:underline">
            계정·결제·전환 기록 → 데이터
          </Link>
        </footer>
      </CardShell>

      <CardShell>
        <header className="border-b border-[#e8e8e4] px-4 pb-3 pt-3.5">
          <h3 className="flex items-center gap-2 text-[14px] font-bold text-[#111110]">
            <Dot color={AD_CHANNEL_COLOR.meta} />
            Meta
          </h3>
          <p className="mt-0.5 text-[11px] text-[#84827a]">
            {metaCurrency ?? "USD"} · 리드 광고 · 일 스냅샷{metaLive?.dataThrough ? ` · ${md(metaLive.dataThrough)}까지` : ""}
          </p>
          <div className="mt-2.5 grid grid-cols-3 gap-3">
            <Num label="집행" value={amount(meta.spend, metaCurrency)} muted={meta.spend == null} />
            <Num label="DB 리드" value={leadsValue(meta, leadsMeasured)} />
            <Num label="리드당" value={costPerLead(meta.spend, leadsMeasured ? meta.dbLeads : null, metaCurrency) ?? "—"} />
          </div>
        </header>
        {meta.campaigns.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-[#84827a]">
            {meta.measured ? "이 기간 집행한 Meta 캠페인이 없습니다." : "Meta 스냅샷을 읽지 못했습니다."}
          </p>
        ) : (
          <ul>
            {meta.campaigns.map((row) => (
              <CampaignItem key={row.id} row={row} currency={metaCurrency} stoppedLabel="멈춤" />
            ))}
          </ul>
        )}
        <Buckets buckets={meta.unmatched} />
        <footer className="flex flex-wrap gap-x-3 gap-y-1 border-t border-[#e8e8e4] px-4 py-2 text-[11px]">
          <Link href={links.metaCreatives} className="font-semibold text-[#084734] hover:underline">
            소재별 → 상세 › 소재
          </Link>
          <Link href={links.metaTable} className="font-semibold text-[#084734] hover:underline">
            재개·중지 → 데이터 › Meta
          </Link>
        </footer>
      </CardShell>

      <CardShell>
        <header className="border-b border-[#e8e8e4] px-4 pb-3 pt-3.5">
          <h3 className="flex items-center gap-2 text-[14px] font-bold text-[#111110]">
            <Dot color={AD_CHANNEL_COLOR.youtube} />
            유튜브 스튜디오
          </h3>
          <p className="mt-0.5 text-[11px] text-[#84827a]">프로모션 {YOUTUBE_STUDIO_RECORD.promotions}개 · API 밖 기록</p>
        </header>
        <ul className="space-y-1 px-4 py-3 text-[12px] text-[#615D59]">
          {YOUTUBE_STUDIO_RECORD.notes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
          <li className="text-[11.5px] text-[#84827a]">
            상태·집행은 스튜디오에서 확인 — 395 API 에 캠페인으로 잡히면 Google 카드에 함께 집계된다
          </li>
        </ul>
        <footer className="border-t border-[#e8e8e4] px-4 py-2 text-[11px]">
          <a
            href="https://studio.youtube.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-[#084734] hover:underline"
          >
            YouTube 스튜디오 <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </footer>
      </CardShell>
    </div>
  )
}

function RunningCount({ rows }: { rows: AdBoardCampaign[] }) {
  const running = rows.filter((row) => row.status === "running").length
  return <AdStatusLabel status={running > 0 ? "running" : "paused"} label={`운영 ${running}`} />
}

/** 한눈에 층 — 우산 캠페인 Top 3 자리에 채널 3칸. 누르면 광고 탭. */
export function AdChannelStrip({ board, href }: { board: AdBoard; href: string }) {
  const { google, meta, leadsMeasured } = board
  const googleCurrency = google.currency ?? "KRW"
  const metaCurrency = meta.currency ?? "USD"
  const googleSub = [
    ...google.campaigns.filter((row) => row.status === "planned").map((row) => `예정 ${row.key ?? row.name}${row.start ? ` ${md(row.start)}` : ""}`),
    ...google.campaigns.filter((row) => row.status === "held").map((row) => `보류 ${row.key ?? row.name}`),
  ].join(" · ")
  const metaTop = [...meta.campaigns]
    .filter((row) => (row.dbLeads ?? 0) > 0)
    .sort((a, b) => (b.dbLeads ?? 0) - (a.dbLeads ?? 0))
    .slice(0, 2)
    .map((row) => `${row.name} ${COUNT.format(row.dbLeads ?? 0)}`)
    .join(" · ")
  const metaCpl = costPerLead(meta.spend, leadsMeasured ? meta.dbLeads : null, metaCurrency)

  const cell = "min-w-0 px-4 py-3"
  return (
    <section className="rounded-xl border border-[#e8e8e4] bg-white" aria-labelledby="ad-channel-strip-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#e8e8e4] px-4 py-2.5">
        <h3 id="ad-channel-strip-title" className="text-[14px] font-semibold text-[#111110]">
          광고 채널 <span className="ml-1 text-[11px] font-normal text-[#84827a]">리드 = 우리 DB(캠페인 짝짓기)</span>
        </h3>
        <Link href={href} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#084734] hover:underline">
          캠페인 전체 → 광고 <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
      <div className="grid sm:grid-cols-3 sm:divide-x sm:divide-[#e8e8e4] max-sm:divide-y max-sm:divide-[#e8e8e4]">
        <div className={cell}>
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#111110]">
            <Dot color={AD_CHANNEL_COLOR.google} />
            Google 395
            <span className="ml-auto">
              <RunningCount rows={google.campaigns} />
            </span>
          </div>
          <p className="mt-1 text-[22px] font-bold tracking-[-0.02em] text-[#111110]">
            {amount(google.spend, googleCurrency)}
            <span className="ml-1.5 text-[12px] font-medium tracking-normal text-[#615D59]">DB 리드 {leadsValue(google, leadsMeasured)}</span>
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-[#615D59]">{googleSub || "예정·보류 없음"}</p>
        </div>
        <div className={cell}>
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#111110]">
            <Dot color={AD_CHANNEL_COLOR.meta} />
            Meta
            <span className="ml-auto">
              <RunningCount rows={meta.campaigns} />
            </span>
          </div>
          <p className="mt-1 text-[22px] font-bold tracking-[-0.02em] text-[#111110]">
            {amount(meta.spend, metaCurrency)}
            <span className="ml-1.5 text-[12px] font-medium tracking-normal text-[#615D59]">
              DB 리드 {leadsValue(meta, leadsMeasured)}
              {metaCpl ? ` · ${metaCpl}` : ""}
            </span>
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-[#615D59]">{metaTop || "리드 있는 캠페인 없음"}</p>
        </div>
        <div className={cell}>
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#111110]">
            <Dot color={AD_CHANNEL_COLOR.youtube} />
            유튜브 스튜디오
          </div>
          <p className="mt-1 text-[22px] font-bold tracking-[-0.02em] text-[#84827a]">
            —<span className="ml-1.5 text-[12px] font-medium tracking-normal text-[#615D59]">기록만</span>
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-[#615D59]">
            프로모션 {YOUTUBE_STUDIO_RECORD.promotions}개 · {YOUTUBE_STUDIO_RECORD.notes[0]}
          </p>
        </div>
      </div>
    </section>
  )
}
