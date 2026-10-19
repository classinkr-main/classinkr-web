"use client"

// 고객DB › 세그먼트 허브(C안 ②, 2026-09-25) — /admin/crm/customers/segments.
// 저장한 조건 묶음(팀 공유/내 것)을 모아 현재 건수·8주 추이·마지막 실행·자동 태그를 한 표로 보고, 고른 세그먼트를
// 아래 상세(SegmentDetailPanel)에서 편집·미리보기·행동·자동 태그로 다룬다.
//  - 선택 상태는 URL ?id=<uuid> 하나(?segment= 는 리드 보드 파라미터라 쓰지 않는다). 범위·보관함은 화면 상태.
//  - "내 것"은 소유자만 본다(서버가 남의 '내 것'을 싣지 않는다 — 관리자 포함).
//  - 표 미적용(available:false)이면 배너로 알리고 "조건은 통합 목록 URL로 공유" 안내 — 새 조건 미리보기는 된다.
//  - 원천 상태(NEO 오래됨·Compass 끊김·건수 평가 실패)는 목록 위에 한 번만 알린다(0 과 "모름"을 구분).
// 메시지 발송(발송 1단계, 2026-09-25): 상세 아래 "메시지 발송" 줄 → 대상 미리보기 대화상자(SegmentSendPreviewDialog —
//   건수·제외 사유만, 발송 없음). 저장 세그먼트이고 발송 권한이 있으면 메시지 탭으로 세그먼트 id 만 넘긴다.
//   미리보기는 저장된 조건 기준이다 — 편집 중 조건(저장 전)은 상세 패널 안에만 있어 여기서 { kind: "draft" } 로
//   열지 못한다(POST /customers/audience-preview 는 계약만 — 상세 패널이 조건을 올려 주면 연결).

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Archive, Plus } from "lucide-react"

import { EmptyState } from "@/components/admin/viz"
import { segmentFilterUsesNeoSignals } from "@/lib/crm/customer-segment-filter"
import type { SavedSegmentListItem, SavedSegmentListResponse, SavedSegmentScope } from "@/lib/crm/saved-segment-api"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"

import CrmNoticeBanner from "../CrmNoticeBanner"
import FreshnessCaption from "../FreshnessCaption"
import { SECONDARY_TEXT_CLASS } from "../home/shared"
import { UNIFIED_CUSTOMERS_PATH } from "../unified/shared"
import SegmentDetailPanel from "./SegmentDetailPanel"
import SegmentSendPreviewDialog, { SegmentSendEntry, type SegmentSendPreviewSource } from "./SegmentSendPreviewDialog"
import SegmentTrendSpark from "./SegmentTrendSpark"
import {
  SEGMENT_NOT_READY_SHARE_HINT,
  SEGMENT_SCOPE_OPTIONS,
  SEGMENT_VISIBILITY_LABEL,
  describeAutoTagColumn,
  describeAutoTagStatus,
  fetchSegmentList,
  formatKstMonthDay,
  formatRunAt,
  readCachedSegmentList,
  segmentsListUrl,
  type HubTone,
} from "./segment-hub-api"

const TONE_TEXT: Record<HubTone, string> = {
  ok: STATUS_TONE_TEXT_CLASS.ok,
  warning: STATUS_TONE_TEXT_CLASS.warning,
  danger: STATUS_TONE_TEXT_CLASS.danger,
  idle: "text-[#615D59]",
}

/** 글자색 + 점(채움 배지 대신 — DESIGN.md 어드민 상태 표기). */
export function HubStatus({ tone, children }: { tone: HubTone; children: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${TONE_TEXT[tone]}`}>
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  )
}

/** 목록 위 원천 상태 안내(표 미적용 제외) — 순수 함수라 테스트가 문구를 고정한다. */
export function segmentHubSourceNotices(
  data: Pick<SavedSegmentListResponse, "available" | "trendWarning" | "live"> | null
): Array<{ tone: "warning" | "info"; message: string }> {
  if (!data || !data.available) return []
  const notices: Array<{ tone: "warning" | "info"; message: string }> = []
  if (!data.live.ok) {
    notices.push({ tone: "warning", message: "지금 건수를 계산하지 못해 마지막 기록(저장·매일 06시 실행 시점)을 보여 줍니다." })
  }
  if (data.live.neoStale) {
    const day = formatKstMonthDay(data.live.neoLatestSyncedAt)
    notices.push({
      tone: "warning",
      message: `NEO 값이 ${day ? `${day} 기준입니다` : "오래됐습니다"}(자동 동기화 멈춤). NEO 조건(만료·소진·잔액·위험·과금)이 든 세그먼트는 그 날짜 기준으로 세고, 자동 태그는 동기화 복구 전까지 건너뜁니다.`,
    })
  }
  if (data.live.compass === "down") {
    notices.push({ tone: "info", message: "Compass 연결 끊김 — 무연락 조건 건수가 Home 기록만으로 계산돼 실제보다 크게 보일 수 있습니다." })
  } else if (data.live.compass === "partial") {
    notices.push({ tone: "info", message: "Compass 활동을 일부만 읽었습니다 — 무연락 조건 건수가 실제보다 클 수 있습니다." })
  }
  if (data.trendWarning) notices.push({ tone: "info", message: data.trendWarning })
  return notices
}

function ListSkeleton() {
  return (
    <div aria-hidden className="grid gap-2 p-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-11 animate-pulse rounded-lg bg-[#f5f5f2]" />
      ))}
    </div>
  )
}

function SegmentRow({
  item,
  selected,
  nowMs,
  neoStale,
  onSelect,
}: {
  item: SavedSegmentListItem
  selected: boolean
  nowMs: number
  neoStale: boolean
  onSelect: (id: string) => void
}) {
  const count = item.count ?? item.lastCount
  const autoTag = describeAutoTagColumn(item)
  const lastRun = item.lastRunStatus ? describeAutoTagStatus(item.lastRunStatus, item.lastRunDetail) : null
  const neoSkip = item.autoTag.enabled && neoStale && segmentFilterUsesNeoSignals(item.spec)
  return (
    <tr className={`border-b border-[#f0f0ec] last:border-b-0 ${selected ? "bg-[#ECFDF5]" : "hover:bg-[#fafaf8]"}`}>
      <td className="px-3 py-2.5 align-top">
        <button
          type="button"
          onClick={() => onSelect(item.id)}
          aria-current={selected ? "true" : undefined}
          className={`inline-flex min-h-11 items-center text-left text-[13px] font-semibold hover:underline sm:min-h-0 ${selected ? "text-[#084734]" : "text-[#111110] hover:text-[#084734]"}`}
        >
          {item.name}
        </button>
        <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
          {SEGMENT_VISIBILITY_LABEL[item.visibility]} · {item.owner.name ?? "알 수 없음"}
          {item.archivedAt ? ` · 보관됨` : ""}
        </p>
      </td>
      <td className="max-w-[280px] px-3 py-2.5 align-top text-[12px] text-[#31302E]">
        <span className="line-clamp-2">{item.labels.length ? item.labels.join(" · ") : "조건 없음"}</span>
        {!item.specReadable ? <span className={`block text-[11px] ${STATUS_TONE_TEXT_CLASS.warning}`}>새 조건 판 — 이 배포가 못 읽음</span> : null}
      </td>
      <td className="px-3 py-2.5 text-right align-top">
        <span className="text-[14px] font-bold tabular-nums text-[#111110]">{count == null ? "—" : count.toLocaleString("ko-KR")}</span>
        {item.count == null && item.lastCount != null ? (
          <span className="block text-[11px] text-[#1a1a1a]/40">마지막 기록</span>
        ) : null}
      </td>
      <td className="px-3 py-2.5 align-top">
        <SegmentTrendSpark trend={item.trend} trendDays={item.trendDays} />
      </td>
      <td className="px-3 py-2.5 align-top">
        <span className="block text-[12px] text-[#31302E]">{formatRunAt(item.lastEvaluatedAt, nowMs)}</span>
        {lastRun && item.autoTag.enabled ? <HubStatus tone={lastRun.tone}>{lastRun.text}</HubStatus> : null}
      </td>
      <td className="px-3 py-2.5 align-top">
        <HubStatus tone={autoTag.tone}>{autoTag.text}</HubStatus>
        {neoSkip ? <span className={`block text-[11px] ${STATUS_TONE_TEXT_CLASS.warning}`}>NEO 오래됨 — 복구 전까지 건너뜀</span> : null}
      </td>
    </tr>
  )
}

export default function SegmentHubClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get("id")?.trim() || null

  const [scope, setScope] = useState<SavedSegmentScope>("all")
  const [archived, setArchived] = useState(false)
  const [data, setData] = useState<SavedSegmentListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [receivedAt, setReceivedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [sendPreview, setSendPreview] = useState<SegmentSendPreviewSource | null>(null)
  const loadSeq = useRef(0)
  const detailRef = useRef<HTMLDivElement>(null)
  const scrollOnOpen = useRef(false)

  const load = useCallback(
    async (options?: { force?: boolean }) => {
      const url = segmentsListUrl(scope, archived)
      const force = Boolean(options?.force)
      const seq = ++loadSeq.current
      if (!force) {
        // 강등 응답(평가 실패·표 미적용)은 캐시에 남기지 않는다 — 남아 있던 것은 그리되 지우고 네트워크로 다시 받는다.
        const cached = readCachedSegmentList(url)
        if (cached) setData(cached)
        setLoading(!cached)
      }
      setRefreshing(force)
      setError(null)
      try {
        const next = await fetchSegmentList(url, {
          force,
          onRevalidated: (fresh) => {
            if (seq === loadSeq.current) {
              setData(fresh)
              setReceivedAt(Date.now())
            }
          },
        })
        if (seq !== loadSeq.current) return
        setData(next)
        setReceivedAt(Date.now())
        setNowMs(Date.now())
      } catch (err) {
        if (seq !== loadSeq.current) return
        setError(`세그먼트 목록을 불러오지 못했습니다(${err instanceof Error && err.message ? err.message : "알 수 없는 오류"}).`)
      } finally {
        if (seq === loadSeq.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [scope, archived]
  )

  useEffect(() => {
    void load()
  }, [load])

  // 사용자가 목록에서 고르거나 새로 만들 때만 상세로 스크롤한다(딥링크 착지는 그대로 둔다).
  useEffect(() => {
    if (!scrollOnOpen.current) return
    scrollOnOpen.current = false
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    detailRef.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" })
  }, [selectedId, creating])

  const replaceId = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (id) params.set("id", id)
      else params.delete("id")
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const selectSegment = (id: string) => {
    scrollOnOpen.current = true
    setCreating(false)
    replaceId(id)
  }

  const startNew = () => {
    scrollOnOpen.current = true
    setCreating(true)
    replaceId(null)
  }

  const closeDetail = () => {
    setCreating(false)
    replaceId(null)
  }

  const closeSendPreview = useCallback(() => setSendPreview(null), [])

  const showNotice = useCallback((message: string, tone: "success" | "danger") => setNotice({ message, tone }), [])

  const handleSaved = (item: SavedSegmentListItem, created: boolean) => {
    setData((prev) => {
      if (!prev) return prev
      const exists = prev.segments.some((segment) => segment.id === item.id)
      const segments = exists
        ? prev.segments.map((segment) => (segment.id === item.id ? item : segment))
        : [item, ...prev.segments]
      return { ...prev, segments }
    })
    if (created) {
      setCreating(false)
      replaceId(item.id)
    }
    void load({ force: true })
  }

  const handleArchived = (id: string) => {
    setData((prev) => (prev ? { ...prev, segments: prev.segments.filter((segment) => segment.id !== id) } : prev))
    closeDetail()
    void load({ force: true })
  }

  const segments = data?.segments ?? []
  const available = data?.available ?? true
  const selectedItem = selectedId ? (segments.find((segment) => segment.id === selectedId) ?? null) : null
  const sourceNotices = segmentHubSourceNotices(data)
  const showDetail = creating || Boolean(selectedId)

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">세그먼트</h1>
          <p className={`mt-1 max-w-2xl text-[12px] ${SECONDARY_TEXT_CLASS}`}>
            저장한 조건 묶음을 팀과 공유하고 매일 건수를 쌓습니다. 결과로 태그 붙이기·오늘 연락에 넣기·CSV·담당 배정(리드)을
            하고, 팀 공유 세그먼트는 매일 06시 자동 태그를 켤 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FreshnessCaption
            generatedAt={data?.generatedAt}
            receivedAt={receivedAt}
            refreshing={refreshing}
            staleReason={error ? "error" : null}
            onRefresh={() => void load({ force: true })}
          />
          <button
            type="button"
            onClick={startNew}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#084734] px-3.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 sm:min-h-9"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />새 세그먼트
          </button>
        </div>
      </div>

      {notice ? (
        <CrmNoticeBanner tone={notice.tone} className="mb-3" message={notice.message} onDismiss={() => setNotice(null)} />
      ) : null}

      {error ? (
        <CrmNoticeBanner
          tone="danger"
          className="mb-3"
          message={error}
          action={{ label: "다시 시도", onClick: () => void load({ force: true }), pending: refreshing }}
        />
      ) : null}

      {data && !data.available ? (
        <CrmNoticeBanner
          tone="warning"
          className="mb-3"
          title="세그먼트 저장이 아직 준비되지 않았습니다"
          message={
            <>
              {data.warning ? <span className="block">{data.warning}</span> : null}
              <span className="block">{SEGMENT_NOT_READY_SHARE_HINT}</span>
            </>
          }
          action={{ label: "통합 목록 열기", onClick: () => router.push(UNIFIED_CUSTOMERS_PATH) }}
        />
      ) : null}

      {sourceNotices.map((item) => (
        <CrmNoticeBanner key={item.message} tone={item.tone} className="mb-3" message={item.message} />
      ))}

      <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8e8e4] px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="세그먼트 범위">
            <span className="mr-1 text-[11px] font-semibold text-[#1a1a1a]/40">범위</span>
            {SEGMENT_SCOPE_OPTIONS.map((option) => {
              const active = scope === option.key
              const count = data?.scopeCounts[option.key]
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setScope(option.key)}
                  aria-pressed={active}
                  className={`inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-[12px] font-semibold transition-colors sm:min-h-8 ${
                    active
                      ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                      : "border-[#e8e8e4] bg-white text-[#1a1a1a]/60 hover:border-[#c8c8c4] hover:text-[#111110]"
                  }`}
                >
                  {option.label}
                  {count != null && !archived ? <span className="tabular-nums opacity-70">{count.toLocaleString("ko-KR")}</span> : null}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setArchived((value) => !value)}
            aria-pressed={archived}
            className={`inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold transition-colors sm:min-h-8 ${
              archived ? "text-[#084734]" : "text-[#615D59] hover:text-[#111110]"
            }`}
          >
            <Archive className="h-3.5 w-3.5" aria-hidden />
            {archived ? "보관함 보는 중 — 활성으로" : "보관함"}
          </button>
        </div>

        {loading && !data ? (
          <ListSkeleton />
        ) : segments.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={archived ? "보관된 세그먼트가 없습니다" : "저장된 세그먼트가 없습니다"}
              description={
                archived
                  ? "보관한 세그먼트는 여기서 열어 복구할 수 있습니다."
                  : available
                    ? "조건을 골라 저장하면 매일 건수를 쌓고 팀과 공유할 수 있습니다. 예: 만료 60일 이내 · (위험 긴급 또는 무연락 60일+)."
                    : SEGMENT_NOT_READY_SHARE_HINT
              }
              action={
                archived ? null : (
                  <button
                    type="button"
                    onClick={startNew}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#084734] hover:border-[#c8c8c4] sm:min-h-9"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    {available ? "새 세그먼트" : "조건 미리보기"}
                  </button>
                )
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left" aria-label="저장 세그먼트">
              <thead>
                <tr className="border-b border-[#e8e8e4] text-[11px] font-semibold text-[#1a1a1a]/45">
                  <th className="px-3 py-2.5">세그먼트</th>
                  <th className="px-3 py-2.5">조건 요약</th>
                  <th className="px-3 py-2.5 text-right">현재 건수</th>
                  <th className="px-3 py-2.5">8주 추이</th>
                  <th className="px-3 py-2.5">마지막 실행</th>
                  <th className="px-3 py-2.5">자동 태그</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((item) => (
                  <SegmentRow
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    nowMs={nowMs}
                    neoStale={Boolean(data?.live.neoStale)}
                    onSelect={selectSegment}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div ref={detailRef} className="scroll-mt-4">
        {showDetail ? (
          <SegmentDetailPanel
            key={creating ? "new" : (selectedId ?? "none")}
            segmentId={creating ? null : selectedId}
            listItem={creating ? null : selectedItem}
            live={data?.live ?? null}
            available={available}
            nowMs={nowMs}
            onSaved={handleSaved}
            onArchived={handleArchived}
            onClose={closeDetail}
            onNotice={showNotice}
            onRefreshList={() => void load({ force: true })}
          />
        ) : null}
        {showDetail ? (
          <SegmentSendEntry
            segmentId={creating ? null : selectedId}
            available={available}
            onOpen={() => {
              if (!creating && selectedId) {
                setSendPreview({ kind: "saved", segmentId: selectedId, name: selectedItem?.name ?? "세그먼트" })
              }
            }}
          />
        ) : null}
      </div>

      <SegmentSendPreviewDialog source={sendPreview} onClose={closeSendPreview} />
    </div>
  )
}
