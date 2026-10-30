"use client"

/**
 * 어드민 콘텐츠 「한눈에」 — 블로그와 인스타그램을 같은 기간으로 본다(2026-10 시안 C안).
 * 요약 네 칸 → 발행 흐름 띠 → 발행한 콘텐츠 표 + 고른 줄 미리보기.
 * 수치 규칙은 lib/admin/content-hub.ts 머리 주석이 정본이다.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { ExternalLink, Star } from "lucide-react"

import AdminErrorBanner from "@/components/admin/ui/AdminErrorBanner"
import ShowMore, { useVisibleCount } from "@/components/admin/ui/ShowMore"
import { adminFetchJsonCached } from "@/lib/admin-client"
import {
  blogViewRanks,
  blogViewsBySlug,
  buildContentHubCadence,
  buildContentHubItems,
  buildContentHubWindow,
  countContentChars,
  formatDateKeyLabel,
  instagramCaptionBody,
  markdownToPreviewText,
  sortContentHubItems,
  type ContentHubChannel,
  type ContentHubInstagramDashboard,
  type ContentHubItem,
  type ContentHubPeriod,
  type ContentHubSort,
} from "@/lib/admin/content-hub"
import { getBlogPostPath } from "@/lib/blog-slug-route"
import { DEFAULT_BLOG_CTA, type BlogPost } from "@/lib/blog-types"

const NUMBER = new Intl.NumberFormat("ko-KR")
const BAR_DAYS = 14
/** 미리보기에서 펼쳐 보여 주는 본문 상한 — 그 뒤는 에디터에서 */
const BODY_PREVIEW_CHARS = 4000

function formatCount(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : NUMBER.format(value)
}

function signed(value: number) {
  return value > 0 ? `+${NUMBER.format(value)}` : NUMBER.format(value)
}

interface PageViewsResponse {
  rangeDays: number
  total: number
  top: Array<{ page: string; count: number }>
}

interface DailyViewsResponse {
  slug: string
  days: number
  dayKeys: string[]
  counts: number[]
  total: number
}

interface Keyed<T> {
  key: string
  data: T | null
  error: string | null
}

const INSTAGRAM_UNCONFIGURED = "unconfigured"

/** 연동 전(설정 없음)은 오류가 아니라 안내로 보인다 — 그 밖의 실패만 오류 띠로. */
function instagramErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("Meta 연동이 설정되지 않았습니다") || message.includes("META_INSTAGRAM_BUSINESS_ACCOUNT_ID")) {
    return INSTAGRAM_UNCONFIGURED
  }
  if (message.includes("META_ACCESS_TOKEN") || message.includes("META_PAGE_ACCESS_TOKEN")) {
    return "인스타그램 인사이트를 읽을 Meta 액세스 토큰이 설정되지 않았습니다."
  }
  return "인스타그램 데이터를 불러오지 못했습니다. 블로그 수치만 표시합니다."
}

/** 새로고침(refreshToken 증가) 뒤 첫 요청만 캐시를 건너뛴다 — 기간을 바꿔 오가는 요청은 캐시를 쓴다. */
function takeForce(lastForced: { current: number }, refreshToken: number) {
  const force = refreshToken !== lastForced.current
  lastForced.current = refreshToken
  return force
}

function shortDayLabel(key: string) {
  const [, m, d] = key.split("-").map(Number)
  return `${m}.${d}`
}

function ChannelMark({ channel, size = 9 }: { channel: ContentHubChannel; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={
        channel === "blog"
          ? "inline-block shrink-0 rounded-[2px] bg-[#084734]"
          : "inline-block shrink-0 rounded-full border-2 border-[#31302E] bg-white"
      }
      style={{ width: size, height: size }}
    />
  )
}

function Thumb({ url, className }: { url: string | null; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block shrink-0 rounded-md bg-[#F0F0EC] bg-cover bg-center ${className}`}
      style={url ? { backgroundImage: `url("${url.replace(/"/g, "%22")}")` } : undefined}
    />
  )
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
}: {
  label: string
  options: ReadonlyArray<{ value: T; label: string; count?: number }>
  value: T
  onChange: (value: T) => void
  size?: "sm" | "md"
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-lg bg-[#F0EFEC] p-[3px]">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 font-semibold transition-colors ${
              size === "sm" ? "h-[30px] text-[12px]" : "h-[34px] text-[13px]"
            } ${active ? "bg-white text-[#111110] shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-[#615D59] hover:text-[#111110]"}`}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="text-[12px] font-medium tabular-nums text-[#615D59]">{option.count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export { Segmented as ContentHubSegmented }

interface StatCell {
  channel: ContentHubChannel
  label: string
  value: string
  note: string
}

export default function ContentHub({
  posts,
  postsLoading,
  period,
  refreshToken,
  nowMs,
  draftCount,
  trashCount,
  onPeriodChange,
  onOpenManage,
  onEdit,
}: {
  posts: BlogPost[]
  postsLoading: boolean
  period: ContentHubPeriod
  /** 새로고침마다 1씩 오른다 — 그 뒤 첫 요청은 캐시를 건너뛴다 */
  refreshToken: number
  /** '오늘'의 기준 시각 — 새로고침 때 부모가 다시 잡는다(자정을 넘겨 켜 둔 화면) */
  nowMs: number
  draftCount: number
  trashCount: number
  onPeriodChange: (period: ContentHubPeriod) => void
  onOpenManage: (tab: "private" | "trash") => void
  onEdit: (post: BlogPost) => void
}) {
  const hubWindow = useMemo(() => buildContentHubWindow(period, new Date(nowMs)), [period, nowMs])

  const pvKey = `${hubWindow.days}:${refreshToken}`
  const [pageViewsState, setPageViewsState] = useState<Keyed<PageViewsResponse> | null>(null)
  const pvForced = useRef(0)
  useEffect(() => {
    let cancelled = false
    const force = takeForce(pvForced, refreshToken)
    adminFetchJsonCached<PageViewsResponse>(
      `/api/admin/content/page-views?prefix=%2Fblog%2F&days=${hubWindow.days}&limit=200`,
      undefined,
      { ttlMs: 300_000, force }
    )
      .then((data) => {
        if (!cancelled) setPageViewsState({ key: pvKey, data, error: null })
      })
      .catch(() => {
        if (!cancelled) setPageViewsState({ key: pvKey, data: null, error: "블로그 조회수를 불러오지 못했습니다." })
      })
    return () => {
      cancelled = true
    }
  }, [pvKey, hubWindow.days, refreshToken])

  const igKey = `${period}:${refreshToken}`
  const [igState, setIgState] = useState<Keyed<ContentHubInstagramDashboard> | null>(null)
  const igForced = useRef(0)
  useEffect(() => {
    let cancelled = false
    const force = takeForce(igForced, refreshToken)
    // 미디어 목록은 기간과 무관하게 최근 N개다 — 90일만 넉넉히(서버 캐시 키가 datePreset·limit 이라 나머지는 25 로 맞춘다).
    adminFetchJsonCached<ContentHubInstagramDashboard>(
      `/api/admin/meta/instagram?datePreset=${period}&limit=${period === "last_90d" ? 50 : 25}`,
      undefined,
      { ttlMs: 120_000, force }
    )
      .then((data) => {
        if (!cancelled) setIgState({ key: igKey, data, error: null })
      })
      .catch((error: unknown) => {
        if (!cancelled) setIgState({ key: igKey, data: null, error: instagramErrorMessage(error) })
      })
    return () => {
      cancelled = true
    }
  }, [igKey, period, refreshToken])

  const pvReady = pageViewsState?.key === pvKey
  const igReady = igState?.key === igKey
  const pageViews = pvReady ? pageViewsState.data : null
  const pageViewsError = pvReady ? pageViewsState.error : null
  const instagram = igReady ? igState.data : null
  const instagramUnconfigured = igReady && igState.error === INSTAGRAM_UNCONFIGURED
  const instagramError = igReady && !instagramUnconfigured ? igState.error : null
  const igNote = instagramUnconfigured ? "연결 전" : instagramError ? "불러오지 못함" : " "
  const loading = postsLoading || !pvReady || !igReady

  const viewsBySlug = useMemo(() => (pageViews ? blogViewsBySlug(pageViews.top, posts) : null), [pageViews, posts])
  const ranks = useMemo(() => (viewsBySlug ? blogViewRanks(viewsBySlug) : null), [viewsBySlug])
  const items = useMemo(
    () => buildContentHubItems({ posts, viewsBySlug, media: instagram?.media ?? null, window: hubWindow }),
    [posts, viewsBySlug, instagram, hubWindow]
  )
  const cadence = useMemo(() => buildContentHubCadence(items, hubWindow), [items, hubWindow])

  const [channel, setChannel] = useState<"all" | ContentHubChannel>("all")
  const [sort, setSort] = useState<ContentHubSort>("recent")
  const visibleItems = useMemo(
    () => sortContentHubItems(channel === "all" ? items : items.filter((item) => item.channel === channel), sort),
    [items, channel, sort]
  )
  const rows = useVisibleCount(visibleItems.length, 20)

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = visibleItems.find((item) => item.key === selectedKey) ?? visibleItems[0] ?? null

  const igInWindow = items.filter((item) => item.channel === "ig")
  const stats: StatCell[] = [
    {
      channel: "blog",
      label: "블로그 조회",
      value: pageViews ? NUMBER.format(pageViews.total) : "-",
      note: pageViewsError
        ? "불러오지 못함"
        : viewsBySlug
          ? `조회된 글 ${[...viewsBySlug.values()].filter((count) => count > 0).length}편`
          : " ",
    },
    {
      channel: "ig",
      label: "인스타 조회",
      value: instagram ? NUMBER.format(igInWindow.reduce((sum, item) => sum + (item.views ?? 0), 0)) : "-",
      note: instagram ? `기간 안 게시물 ${igInWindow.length}개 · 게시 뒤 누적` : igNote,
    },
    {
      channel: "ig",
      label: "인스타 도달",
      value: instagram
        ? NUMBER.format(igInWindow.reduce((sum, item) => sum + (item.media?.insights.reach ?? 0), 0))
        : "-",
      note: instagram ? "같은 게시물 기준" : igNote,
    },
    {
      channel: "ig",
      label: "팔로워",
      value: instagram ? signed(instagram.summary.followerDelta) : "-",
      note: instagram ? `지금 ${NUMBER.format(instagram.account.followersCount)}명` : igNote,
    },
  ]

  const channelOptions = [
    { value: "all" as const, label: "전체", count: items.length },
    { value: "blog" as const, label: "블로그", count: items.filter((item) => item.channel === "blog").length },
    { value: "ig" as const, label: "인스타", count: igInWindow.length },
  ]

  return (
    <div className="flex flex-col gap-5">
      {instagramError ? <AdminErrorBanner title="인스타그램" message={instagramError} /> : null}
      {pageViewsError ? <AdminErrorBanner title="블로그 조회수" message={pageViewsError} /> : null}

      <section aria-label="기간 요약" className="flex flex-wrap rounded-xl border border-[#e8e8e4] bg-white">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={`flex min-w-[180px] flex-1 flex-col gap-0.5 px-5 py-4 ${index > 0 ? "border-l border-[#e8e8e4]" : ""}`}
          >
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[#615D59]">
              <ChannelMark channel={stat.channel} size={8} />
              {stat.label}
            </span>
            {stat.value === "-" && (stat.channel === "blog" ? !pvReady : !igReady) ? (
              <span className="my-1 h-7 w-24 animate-pulse rounded bg-[#F0F0EC]" />
            ) : (
              <span className="text-[26px] font-bold leading-tight tracking-[-0.5px] tabular-nums text-[#111110]">{stat.value}</span>
            )}
            <span className="text-[12px] text-[#615D59]">{stat.note}</span>
          </div>
        ))}
      </section>
      {instagramUnconfigured ? (
        <p className="-mt-2 text-[12px] text-[#615D59]">
          인스타그램 계정이 아직 연결되지 않아 블로그만 보입니다. Meta Instagram Business 계정 ID 또는 연결된 Page ID를 설정하면 게시물 성과가 함께 보입니다.
        </p>
      ) : null}

      <CadenceStrip cadence={cadence} startKey={hubWindow.startKey} endKey={hubWindow.endKey} selected={selected} />

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <section aria-label="발행한 콘텐츠" className="min-w-0 flex-1 overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[15px] font-bold text-[#111110]">발행한 콘텐츠</h2>
              <Segmented label="채널" options={channelOptions} value={channel} onChange={setChannel} size="sm" />
              <Segmented
                label="정렬"
                options={[
                  { value: "recent" as const, label: "최신순" },
                  { value: "views" as const, label: "조회순" },
                ]}
                value={sort}
                onChange={setSort}
                size="sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold">
              <button type="button" onClick={() => onOpenManage("private")} className="text-[#084734] hover:underline">
                작성 중인 글 {draftCount}편
              </button>
              <button type="button" onClick={() => onOpenManage("trash")} className="text-[#615D59] hover:text-[#111110] hover:underline">
                휴지통 {trashCount}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-[14px]">
              <thead>
                <tr className="bg-[#FAFAF8] text-left text-[12px] text-[#615D59]">
                  <th scope="col" className="px-5 py-2.5 font-medium">콘텐츠</th>
                  <th scope="col" className="w-[92px] px-3 py-2.5 font-medium">채널</th>
                  <th scope="col" className="w-[90px] px-3 py-2.5 font-medium">발행</th>
                  <th scope="col" className="w-[84px] px-3 py-2.5 text-right font-medium">조회</th>
                  <th scope="col" className="w-[84px] py-2.5 pl-3 pr-5 text-right font-medium">반응</th>
                </tr>
              </thead>
              <tbody>
                {loading && visibleItems.length === 0
                  ? Array.from({ length: 6 }, (_, index) => (
                      <tr key={index} className="border-t border-[#e8e8e4]">
                        <td colSpan={5} className="px-5 py-3">
                          <span className="block h-10 animate-pulse rounded-md bg-[#F0F0EC]" />
                        </td>
                      </tr>
                    ))
                  : visibleItems.slice(0, rows.visible).map((item) => {
                      const active = selected?.key === item.key
                      return (
                        <tr key={item.key} className={`border-t border-[#e8e8e4] ${active ? "bg-[#F3F2EF]" : "bg-white"}`}>
                          <td className="p-0">
                            <button
                              type="button"
                              aria-pressed={active}
                              onClick={() => setSelectedKey(item.key)}
                              className="flex min-h-[60px] w-full items-center gap-3 py-2.5 pl-5 pr-3 text-left"
                            >
                              <Thumb url={item.thumbnailUrl} className={`h-10 ${item.channel === "blog" ? "w-14" : "w-10"}`} />
                              <span className="flex min-w-0 flex-col">
                                <span className={`truncate text-[#111110] ${active ? "font-bold" : "font-semibold"}`}>{item.title}</span>
                                <span className="truncate text-[12px] text-[#615D59]">
                                  {item.kind}
                                  {item.summary ? ` · ${item.summary}` : ""}
                                </span>
                              </span>
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-[13px] text-[#31302E]">
                            <span className="inline-flex items-center gap-1.5">
                              <ChannelMark channel={item.channel} />
                              {item.channel === "blog" ? "블로그" : "인스타"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-[13px] tabular-nums text-[#615D59]">
                            {item.dateKey ? formatDateKeyLabel(item.dateKey) : "-"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[#111110]">{formatCount(item.views)}</td>
                          <td className={`py-2.5 pl-3 pr-5 text-right tabular-nums ${item.reactions === null ? "text-[#615D59]" : "text-[#111110]"}`}>
                            {formatCount(item.reactions)}
                          </td>
                        </tr>
                      )
                    })}
                {!loading && visibleItems.length === 0 ? (
                  <tr className="border-t border-[#e8e8e4]">
                    <td colSpan={5} className="px-5 py-14 text-center text-[13px] text-[#615D59]">
                      이 기간에 발행했거나 조회된 콘텐츠가 없습니다.
                      {period !== "last_90d" ? (
                        <button
                          type="button"
                          onClick={() => onPeriodChange("last_90d")}
                          className="ml-2 font-semibold text-[#084734] hover:underline"
                        >
                          90일로 넓혀 보기
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {rows.canMore || rows.canCollapse ? (
            <div className="flex justify-center border-t border-[#e8e8e4] py-3">
              <ShowMore
                visible={rows.visible}
                total={visibleItems.length}
                step={20}
                onMore={rows.showMore}
                onCollapse={rows.canCollapse ? rows.collapse : undefined}
              />
            </div>
          ) : null}
        </section>

        <ContentPreview
          item={selected}
          rank={selected?.post && ranks ? ranks.get(selected.post.slug) ?? null : null}
          rankTotal={ranks?.size ?? 0}
          refreshToken={refreshToken}
          onEdit={onEdit}
        />
      </div>
    </div>
  )
}

function CadenceStrip({
  cadence,
  startKey,
  endKey,
  selected,
}: {
  cadence: ReturnType<typeof buildContentHubCadence>
  startKey: string
  endKey: string
  selected: ContentHubItem | null
}) {
  const total = cadence.days.length
  const summary = `${formatDateKeyLabel(startKey)}부터 오늘까지 블로그 ${cadence.blogCount}편, 인스타 ${cadence.igCount}개 발행`
  return (
    <section aria-label="발행 흐름" className="flex flex-col gap-3 rounded-xl border border-[#e8e8e4] bg-white px-5 pb-3.5 pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <h2 className="text-[15px] font-bold text-[#111110]">
          발행 흐름{" "}
          <span className="text-[12px] font-medium text-[#615D59]">
            {formatDateKeyLabel(startKey)} ~ {formatDateKeyLabel(endKey)}
          </span>
        </h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#615D59]">
          <span className="inline-flex items-center gap-1.5">
            <ChannelMark channel="blog" size={10} />
            블로그 {cadence.blogCount}편
            {cadence.blogAverageGapDays !== null ? ` · 평균 ${cadence.blogAverageGapDays}일 간격` : ""}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ChannelMark channel="ig" size={10} />
            인스타 {cadence.igCount}개
            {cadence.igAverageGapDays !== null ? ` · 평균 ${cadence.igAverageGapDays}일 간격` : ""}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="flex flex-col gap-1.5" style={{ minWidth: Math.max(320, total * 14) }}>
          <div role="img" aria-label={summary} className="flex gap-[3px] border-b border-[#e8e8e4]">
            {cadence.days.map((day) => {
              const selectedHere = selected?.inWindow && selected.dateKey === day.key ? selected.channel : null
              return (
                <div
                  key={day.key}
                  title={`${formatDateKeyLabel(day.key)} · 블로그 ${day.blog} · 인스타 ${day.ig}`}
                  className={`flex h-[46px] flex-1 flex-col-reverse items-center gap-1 rounded-t pb-[5px] ${
                    day.isToday ? "bg-[#ECFDF5]" : ""
                  }`}
                >
                  {day.blog > 0 ? (
                    <span
                      className={`h-2.5 w-2.5 rounded-[2px] bg-[#084734] ${selectedHere === "blog" ? "ring-2 ring-[#111110] ring-offset-2" : ""}`}
                    />
                  ) : null}
                  {day.ig > 0 ? (
                    <span
                      className={`h-2.5 w-2.5 rounded-full border-2 border-[#31302E] bg-white ${selectedHere === "ig" ? "ring-2 ring-[#111110] ring-offset-2" : ""}`}
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
          <div aria-hidden="true" className="flex gap-[3px] text-[11.5px] tabular-nums text-[#615D59]">
            {cadence.days.map((day, index) => {
              const fromEnd = total - 1 - index
              const label = day.isToday ? "오늘" : fromEnd % 7 === 0 ? shortDayLabel(day.key) : ""
              return (
                <span key={day.key} className={`flex-1 overflow-visible whitespace-nowrap ${day.isToday ? "font-bold" : ""}`}>
                  {label}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

function ContentPreview({
  item,
  rank,
  rankTotal,
  refreshToken,
  onEdit,
}: {
  item: ContentHubItem | null
  rank: number | null
  rankTotal: number
  refreshToken: number
  onEdit: (post: BlogPost) => void
}) {
  const slug = item?.post?.slug ?? null
  const dailyKey = slug ? `${slug}:${refreshToken}` : null
  const [daily, setDaily] = useState<Keyed<DailyViewsResponse> | null>(null)
  const dailyForced = useRef(0)
  useEffect(() => {
    if (!slug || !dailyKey) return
    let cancelled = false
    const force = takeForce(dailyForced, refreshToken)
    adminFetchJsonCached<DailyViewsResponse>(
      `/api/admin/content/page-views/daily?slug=${encodeURIComponent(slug)}&days=${BAR_DAYS}`,
      undefined,
      { ttlMs: 300_000, force }
    )
      .then((data) => {
        if (!cancelled) setDaily({ key: dailyKey, data, error: null })
      })
      .catch(() => {
        if (!cancelled) setDaily({ key: dailyKey, data: null, error: "일별 조회를 불러오지 못했습니다." })
      })
    return () => {
      cancelled = true
    }
  }, [dailyKey, slug, refreshToken])

  if (!item) {
    return (
      <aside aria-label="고른 콘텐츠" className="rounded-xl border border-dashed border-[#e8e8e4] bg-white px-5 py-14 text-center text-[13px] text-[#615D59] xl:w-[360px] xl:shrink-0">
        표에서 콘텐츠를 고르면 여기에 성과가 보입니다.
      </aside>
    )
  }

  const post = item.post
  const media = item.media
  const metrics: Array<[string, string]> = post
    ? [
        ["기간 조회", item.views === null ? "-" : `${NUMBER.format(item.views)}회`],
        ["조회 순위", rank ? `${rank}위 / ${rankTotal}편` : "-"],
        ["읽는 시간", post.readTime || "-"],
        ["주요 글", post.featured ? "설정됨" : "아님"],
      ]
    : media
      ? [
          ["조회", NUMBER.format(media.insights.views)],
          ["도달", NUMBER.format(media.insights.reach)],
          ["좋아요", NUMBER.format(media.insights.likes)],
          ["댓글", NUMBER.format(media.insights.comments)],
          ["저장", NUMBER.format(media.insights.saved)],
          ["공유", NUMBER.format(media.insights.shares)],
        ]
      : []

  const dailyReady = daily && daily.key === dailyKey ? daily : null
  const counts = dailyReady?.data?.counts ?? null
  const peak = counts ? Math.max(1, ...counts) : 1

  return (
    <aside
      aria-label="고른 콘텐츠"
      className="flex flex-col gap-4 rounded-xl border border-[#e8e8e4] bg-white p-5 xl:sticky xl:top-6 xl:w-[360px] xl:shrink-0"
    >
      <Thumb url={item.thumbnailUrl} className="h-44 w-full rounded-lg" />
      <div className="flex flex-col gap-1">
        <span className="inline-flex flex-wrap items-center gap-1.5 text-[12px] text-[#615D59]">
          <ChannelMark channel={item.channel} />
          {item.channel === "blog" ? "블로그" : "인스타그램"} · {item.kind}
          {item.dateKey ? ` · ${formatDateKeyLabel(item.dateKey)} 발행` : ""}
        </span>
        <h3 className="flex items-start gap-1.5 text-[18px] font-bold leading-snug tracking-[-0.2px] text-[#111110]">
          {post?.featured ? <Star aria-label="주요 글" className="mt-1 h-4 w-4 shrink-0 fill-[#084734] text-[#084734]" /> : null}
          <span className="min-w-0 break-words">{post ? post.title : item.title}</span>
        </h3>
      </div>

      <ContentBody key={item.key} item={item} />

      <dl className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-[#e8e8e4]">
        {metrics.map(([label, value], index) => (
          <div
            key={label}
            className={`flex flex-col px-3.5 py-3 ${index >= 2 ? "border-t border-[#e8e8e4]" : ""} ${index % 2 === 1 ? "border-l border-[#e8e8e4]" : ""}`}
          >
            <dt className="text-[12px] text-[#615D59]">{label}</dt>
            <dd className="truncate text-[17px] font-bold tabular-nums text-[#111110]">{value}</dd>
          </div>
        ))}
      </dl>

      {post ? (
        <div className="flex flex-col gap-2">
          <span className="text-[12px] text-[#615D59]">최근 {BAR_DAYS}일 일별 조회</span>
          {counts ? (
            <>
              <div
                role="img"
                aria-label={`최근 ${BAR_DAYS}일 일별 조회 ${counts.join(", ")}회`}
                className="flex h-16 items-end gap-1 border-b border-[#e8e8e4]"
              >
                {counts.map((count, index) => (
                  <span
                    key={dailyReady?.data?.dayKeys[index] ?? index}
                    className={`flex-1 rounded-t-[2px] ${count > 0 ? "bg-[#084734]" : "bg-[#e8e8e4]"}`}
                    style={{ height: count > 0 ? Math.max(3, Math.round((count / peak) * 60)) : 2 }}
                  />
                ))}
              </div>
              <div aria-hidden="true" className="flex justify-between text-[11.5px] tabular-nums text-[#615D59]">
                <span>{dailyReady?.data?.dayKeys[0] ? formatDateKeyLabel(dailyReady.data.dayKeys[0]) : ""}</span>
                <span>오늘</span>
              </div>
            </>
          ) : dailyReady?.error ? (
            <p role="alert" className="text-[12px] text-[#B43E3E]">{dailyReady.error}</p>
          ) : (
            <span className="block h-16 animate-pulse rounded bg-[#F0F0EC]" />
          )}
        </div>
      ) : media ? (
        <p className="text-[12px] text-[#615D59]">
          인스타 수치는 게시 뒤 누적입니다.
          {media.insightsError ? <span className="mt-1 block text-[#A8741A]">이 게시물의 인사이트 권한을 확인하지 못해 0으로 보일 수 있습니다.</span> : null}
        </p>
      ) : null}

      {post ? (
        <>
          <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
            <dt className="text-[#615D59]">하단 CTA</dt>
            <dd className="truncate text-[#111110]">{post.cta?.buttonLabel || DEFAULT_BLOG_CTA.buttonLabel}</dd>
            <dt className="text-[#615D59]">연결 자료</dt>
            <dd className={`truncate ${post.leadMagnetSlug ? "text-[#111110]" : "text-[#615D59]"}`}>
              {post.leadMagnetSlug || "연결 안 함"}
            </dd>
            <dt className="text-[#615D59]">라벨</dt>
            <dd className={`truncate ${post.tags.length > 0 ? "text-[#111110]" : "text-[#615D59]"}`}>
              {post.tags.length > 0 ? post.tags.join(" · ") : "없음"}
            </dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onEdit(post)}
              className="inline-flex h-10 min-w-[140px] flex-1 items-center justify-center rounded-md bg-[#084734] text-[14px] font-semibold text-white transition-colors hover:bg-[#065c41]"
            >
              에디터에서 열기
            </button>
            <a
              href={getBlogPostPath(post.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 min-w-[140px] flex-1 items-center justify-center gap-1.5 rounded-md bg-[rgba(0,0,0,0.05)] text-[14px] font-semibold text-[#111110] transition-colors hover:bg-[rgba(0,0,0,0.08)]"
            >
              공개 페이지
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
          </div>
        </>
      ) : media?.permalink ? (
        <a
          href={media.permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-[rgba(0,0,0,0.05)] text-[14px] font-semibold text-[#111110] transition-colors hover:bg-[rgba(0,0,0,0.08)]"
        >
          인스타그램에서 보기
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </aside>
  )
}

/** 미리보기의 「내용」 — 블로그는 요약 + 본문(마크다운 기호를 걷은 글), 인스타는 캡션 첫 줄 뒤. 고른 줄이 바뀌면 접힌 상태로 돌아간다(key). */
function ContentBody({ item }: { item: ContentHubItem }) {
  const [expanded, setExpanded] = useState(false)
  const bodyId = useId()
  const post = item.post
  const lead = post?.excerpt?.trim() ?? ""
  const body = useMemo(
    () => (post ? markdownToPreviewText(post.contentMarkdown) : instagramCaptionBody(item.media?.caption)),
    [post, item.media?.caption]
  )
  const chars = countContentChars(post ? body : item.media?.caption ?? "")
  const label = post ? "본문" : "캡션"
  const long = body.length > 240 || body.split("\n").length > 6
  const cut = expanded && body.length > BODY_PREVIEW_CHARS

  if (!lead && !body) {
    return (
      <section aria-label="내용" className="rounded-lg bg-[#FAFAF8] px-3.5 py-3 text-[13px] text-[#615D59]">
        {post ? "요약과 본문이 비어 있습니다." : "캡션이 한 줄뿐입니다."}
      </section>
    )
  }

  return (
    <section aria-label="내용" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[12px] font-semibold text-[#615D59]">내용</h4>
        {chars > 0 ? (
          <span className="text-[12px] tabular-nums text-[#615D59]">
            {label} {NUMBER.format(chars)}자
          </span>
        ) : null}
      </div>
      {lead ? <p className="break-words text-[14px] leading-relaxed text-[#111110]">{lead}</p> : null}
      {body ? (
        <div
          id={bodyId}
          className={`whitespace-pre-line break-words rounded-lg bg-[#FAFAF8] px-3.5 py-3 text-[13px] leading-relaxed text-[#31302E] ${
            expanded ? "max-h-[420px] overflow-y-auto" : "line-clamp-6"
          }`}
        >
          {cut ? `${body.slice(0, BODY_PREVIEW_CHARS)}…` : body}
        </div>
      ) : null}
      {body && long ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((open) => !open)}
          className="self-start text-[13px] font-semibold text-[#084734] hover:underline"
        >
          {expanded ? "접기" : `${label} 펼치기`}
        </button>
      ) : null}
      {cut ? (
        <p className="text-[12px] text-[#615D59]">앞 {NUMBER.format(BODY_PREVIEW_CHARS)}자까지만 보입니다. 전체는 에디터에서 봅니다.</p>
      ) : null}
    </section>
  )
}
