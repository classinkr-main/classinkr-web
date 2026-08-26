"use client"

// 캠페인 허브 "신규 리드" 탭 — 새로 들어온 리드를 날짜로 잘라 보고, 연락 여부를 체크한다.
//
// 광고 탭의 AdLeadsPanel 과 역할이 다르다(중복 아님):
//  - AdLeadsPanel = **Meta 광고 리드 + 딜 전환**. 광고비·CPL 옆에서 유료 유입 모집단을 보고,
//    액션은 CRM 고객·거래 전환(비가역)이다.
//  - 이 탭 = **전 소스 신규 유입 + 연락 체크**. 메타·구글·홈페이지·자료실을 가리지 않고
//    "이 기간에 새로 들어온 것"을 모아 보고, 액션은 연락 여부 도장 하나다.
//
// 체크 버튼은 PATCH /api/admin/leads/{id} 로 status="contacted" 를 보낸다. 라우트가
// status 가 "new" 를 벗어나면 confirmed_at 을 서버 시각으로 함께 찍으므로(app/api/admin/
// leads/[id]/route.ts sanitizeLeadPatch), 이 한 번의 요청으로 "확인 도장"까지 끝난다.
//
// 필터·기간은 전부 URL 에 보존한다(?nlRange=30d&nlFrom=&nlTo=&nlGroups=…&nlQ=&nlOnly=1).

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Inbox,
  Loader2,
  Search,
} from "lucide-react"

import { PeriodToggle } from "@/components/admin/PeriodToggle"
import ShowMore, { useVisibleCount } from "@/components/admin/ui/ShowMore"
import { Skeleton } from "@/components/admin/viz"
import { formatRelativeTime } from "@/components/admin/campaigns/perf/format"
import { adminFetchJson } from "@/lib/admin-client"
import { getLeadMagnetTitle } from "@/lib/lead-magnets"
import { useUrlState } from "@/lib/use-url-state"
import {
  SOURCE_GROUP_DOT,
  SOURCE_GROUP_LABEL,
  SOURCE_GROUP_ORDER,
  getLeadSourceGroup,
  getMetaAdInfo,
  isContactedLead,
  type LeadSourceGroup,
} from "@/lib/crm/lead-attribution"
import {
  NEW_LEAD_RANGE_PRESETS,
  countBySourceGroup,
  filterNewLeads,
  isNewLeadRangePreset,
  kstToday,
  parseSourceGroupParam,
  resolveLeadDateRange,
  serializeSourceGroupParam,
  type LeadDateRange,
  type NewLeadRangePreset,
} from "@/lib/marketing/new-leads"
import type { LeadRecord } from "@/lib/repositories/leads"

const PAGE_STEP = 30

const DATE_INPUT_CLASS =
  "h-8 rounded-md border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#111110] " +
  "transition focus:border-[#084734] focus:outline-none focus:ring-2 focus:ring-[#084734]/15 " +
  "aria-[invalid=true]:border-[#B85C33] aria-[invalid=true]:ring-[#B85C33]/15"

/** 행에 붙일 캠페인·광고 표기. Meta 광고명 → 세부 유입 → 리드마그넷 순으로 떨어진다. */
function adLabelOf(lead: LeadRecord): string | null {
  const meta = getMetaAdInfo(lead)
  const fromMeta = meta?.ad?.trim() || meta?.campaign?.trim()
  if (fromMeta) return fromMeta
  const detail = lead.source_detail?.trim()
  if (detail) return detail
  const magnet = lead.lead_magnet?.trim()
  if (!magnet) return null
  // 슬러그 → 자료 제목. 표에 없는 슬러그는 지어내지 않고 원값을 그대로 보여 준다.
  return getLeadMagnetTitle(magnet) || magnet
}

function SourceDot({ group }: { group: LeadSourceGroup }) {
  return (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: SOURCE_GROUP_DOT[group] }}
    />
  )
}

export interface NewLeadsTabProps {
  leads: LeadRecord[]
  loading: boolean
  /** 조회 실패 — 빈 목록과 구분해서 표면화한다(실패 ≠ 0건). */
  error?: string | null
  /** 체크 성공/롤백을 상위 리드 배열에 반영한다(전량 재조회 없이 해당 건만 교체). */
  onLeadUpdated: (lead: LeadRecord) => void
}

export default function NewLeadsTab({ leads, loading, error, onLeadUpdated }: NewLeadsTabProps) {
  // ─── 필터 상태(전부 URL 보존) ────────────────────────────────
  const [rangeParam, setRangeParam] = useUrlState("nlRange", "30d")
  const [fromParam, setFromParam] = useUrlState("nlFrom", "")
  const [toParam, setToParam] = useUrlState("nlTo", "")
  const [groupsParam, setGroupsParam] = useUrlState("nlGroups", "")
  const [queryParam, setQueryParam] = useUrlState("nlQ", "")
  const [onlyParam, setOnlyParam] = useUrlState("nlOnly", "1")

  const preset: NewLeadRangePreset = isNewLeadRangePreset(rangeParam) ? rangeParam : "30d"
  const selectedGroups = useMemo(() => parseSourceGroupParam(groupsParam), [groupsParam])
  // 이 탭의 목적이 "새로 들어온 것 처리"라 기본은 아직 연락 안 한 리드만 본다.
  const onlyUncontacted = onlyParam !== "0"
  const deferredQuery = useDeferredValue(queryParam)

  // KST 기준 오늘 — 마운트 시 1회 고정(렌더마다 새 Date 를 만들면 메모가 매번 깨진다).
  const [today] = useState(() => kstToday())

  const resolvedRange = useMemo(
    () => resolveLeadDateRange(preset, { from: fromParam, to: toParam }, today),
    [preset, fromParam, toParam, today]
  )
  // 커스텀 범위가 깨진 동안에는 목록을 비우지 않고 직전 유효 범위를 유지한다.
  const lastValidRangeRef = useRef<LeadDateRange | null>(null)
  useEffect(() => {
    if (resolvedRange) lastValidRangeRef.current = resolvedRange
  }, [resolvedRange])
  const fallbackRange = useMemo(() => resolveLeadDateRange("30d", null, today)!, [today])
  const range = resolvedRange ?? lastValidRangeRef.current ?? fallbackRange
  const customInvalid = preset === "custom" && resolvedRange === null

  // ─── 파생 목록 ───────────────────────────────────────────────
  // inRange: 기간만 적용(진짜 없음 vs 필터 때문 구분용)
  // scoped : 그룹을 제외한 나머지 필터 적용(칩 건수 — 그룹을 고르면 다른 칩이 0이 되지 않게)
  // visible: 전체 필터 적용
  const inRange = useMemo(() => filterNewLeads(leads, range), [leads, range])
  const scoped = useMemo(
    () => filterNewLeads(leads, { ...range, query: deferredQuery, onlyUncontacted }),
    [leads, range, deferredQuery, onlyUncontacted]
  )
  const groupCounts = useMemo(() => countBySourceGroup(scoped), [scoped])
  const visible = useMemo(
    () =>
      filterNewLeads(leads, {
        ...range,
        groups: selectedGroups,
        query: deferredQuery,
        onlyUncontacted,
      }),
    [leads, range, selectedGroups, deferredQuery, onlyUncontacted]
  )

  const list = useVisibleCount(visible.length, PAGE_STEP)

  // ─── 연락함 체크 ─────────────────────────────────────────────
  // setState 는 비동기라 상태만으로는 연타 중 두 번째 요청을 못 막는다 — 동기 ref 로 잠근다
  // (MetaTab 의 runningRef · AdLeadsPanel 의 convertingRef 와 같은 패턴).
  const pendingRef = useRef<Set<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<readonly string[]>([])
  const [actionError, setActionError] = useState<{ leadId: string; message: string } | null>(null)

  const markContacted = useCallback(
    async (lead: LeadRecord) => {
      if (pendingRef.current.has(lead.id) || isContactedLead(lead)) return
      pendingRef.current.add(lead.id)
      setPendingIds((prev) => [...prev, lead.id])
      setActionError((prev) => (prev?.leadId === lead.id ? null : prev))

      // 낙관적 갱신 — 체크 표시가 즉시 뜬다. confirmed_at 은 서버 시각이 정본이라 여기서
      // 만든 값은 응답이 오면 그대로 갈아끼운다(실패하면 원본으로 되돌린다).
      onLeadUpdated({ ...lead, status: "contacted", confirmed_at: new Date().toISOString() })

      try {
        const data = await adminFetchJson<{ lead: LeadRecord }>(`/api/admin/leads/${lead.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "contacted" }),
        })
        if (data?.lead) onLeadUpdated(data.lead)
      } catch (e) {
        onLeadUpdated(lead)
        setActionError({
          leadId: lead.id,
          message: e instanceof Error ? e.message : "연락 처리에 실패했습니다.",
        })
      } finally {
        pendingRef.current.delete(lead.id)
        setPendingIds((prev) => prev.filter((id) => id !== lead.id))
      }
    },
    [onLeadUpdated]
  )

  const toggleGroup = useCallback(
    (group: LeadSourceGroup) => {
      const next = selectedGroups.includes(group)
        ? selectedGroups.filter((item) => item !== group)
        : [...selectedGroups, group]
      setGroupsParam(serializeSourceGroupParam(next))
    },
    [selectedGroups, setGroupsParam]
  )

  const handlePresetChange = useCallback(
    (next: NewLeadRangePreset) => {
      setRangeParam(next)
      // 직접 지정으로 처음 들어오면 현재 유효 범위를 그대로 채워 준다 — 빈 칸 두 개를
      // 던져 놓으면 목록이 왜 안 바뀌는지 알 수 없다.
      if (next === "custom" && (!fromParam || !toParam)) {
        setFromParam(range.since)
        setToParam(range.until)
      }
    },
    [fromParam, toParam, range.since, range.until, setFromParam, setRangeParam, setToParam]
  )

  const rows = visible.slice(0, list.visible)

  return (
    <section className="mt-1">
      <header className="mb-4">
        <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">신규 리드</h2>
        <p className="mt-1 text-[12px] leading-[1.6] text-[#615D59]">
          기간 안에 새로 들어온 리드를 유입 채널 가리지 않고 모아 본다 — 메타·홈페이지·자료실·뉴스레터·채널톡·챗봇·수기까지.{" "}
          여기서의 액션은 <strong className="font-semibold text-[#111110]">연락 여부 체크</strong> 하나다.{" "}
          광고비·CPL 옆에서 보는 유료 유입과 CRM 딜 전환은 <span className="font-semibold">광고</span> 탭의 광고 리드 섹션이 담당한다.
        </p>
      </header>

      {/* ─── 컨트롤 바 ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <PeriodToggle
            options={NEW_LEAD_RANGE_PRESETS.map((item) => ({ id: item.id, label: item.label }))}
            value={preset}
            onChange={handlePresetChange}
            ariaLabel="유입 기간"
            className="bg-white"
          />

          {preset === "custom" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <label className="sr-only" htmlFor="new-leads-from">
                유입 시작일
              </label>
              <input
                id="new-leads-from"
                type="date"
                value={fromParam}
                max={toParam || undefined}
                onChange={(event) => setFromParam(event.target.value)}
                aria-invalid={customInvalid}
                aria-describedby={customInvalid ? "new-leads-range-error" : undefined}
                className={DATE_INPUT_CLASS}
              />
              <span aria-hidden className="text-[12px] text-[#A39E98]">
                ~
              </span>
              <label className="sr-only" htmlFor="new-leads-to">
                유입 종료일
              </label>
              <input
                id="new-leads-to"
                type="date"
                value={toParam}
                min={fromParam || undefined}
                onChange={(event) => setToParam(event.target.value)}
                aria-invalid={customInvalid}
                aria-describedby={customInvalid ? "new-leads-range-error" : undefined}
                className={DATE_INPUT_CLASS}
              />
            </div>
          )}

          <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-[320px]">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]"
            />
            <input
              type="search"
              value={queryParam}
              onChange={(event) => setQueryParam(event.target.value)}
              aria-label="신규 리드 검색"
              placeholder="이름·기관·이메일·캠페인·광고명 검색"
              className="h-8 w-full rounded-md border border-[#e8e8e4] bg-white pl-8 pr-2.5 text-[12px] text-[#111110] placeholder:text-[#A39E98] transition focus:border-[#084734] focus:outline-none focus:ring-2 focus:ring-[#084734]/15"
            />
          </div>

          <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#615D59] transition hover:border-[#d8d8d2]">
            <input
              type="checkbox"
              checked={onlyUncontacted}
              onChange={(event) => setOnlyParam(event.target.checked ? "1" : "0")}
              className="h-3.5 w-3.5 accent-[#084734]"
            />
            미연락만 보기
          </label>
        </div>

        {customInvalid && (
          <p
            id="new-leads-range-error"
            role="alert"
            className="mt-2 text-[11px] font-semibold text-[#B85C33]"
          >
            시작일이 종료일보다 뒤입니다 — 날짜를 고칠 때까지 직전 범위({range.since} ~ {range.until})를 그대로 보여 줍니다.
          </p>
        )}

        {/* 유입 묶음 칩 — 색은 점으로만(채움 금지). 건수는 그룹을 제외한 나머지 필터 기준이라
            한 그룹을 골라도 다른 칩의 건수가 0으로 무너지지 않는다. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="유입 묶음 필터">
          <button
            type="button"
            onClick={() => setGroupsParam("")}
            aria-pressed={selectedGroups.length === 0}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
              selectedGroups.length === 0
                ? "border-[#111110] bg-white text-[#111110]"
                : "border-[#e8e8e4] bg-white text-[#615D59] hover:border-[#d8d8d2]"
            }`}
          >
            전체
            <span className="tabular-nums text-[#A39E98]">{scoped.length.toLocaleString("ko-KR")}</span>
          </button>
          {SOURCE_GROUP_ORDER.map((group) => {
            const active = selectedGroups.includes(group)
            return (
              <button
                key={group}
                type="button"
                onClick={() => toggleGroup(group)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "border-[#111110] bg-white text-[#111110]"
                    : "border-[#e8e8e4] bg-white text-[#615D59] hover:border-[#d8d8d2]"
                }`}
              >
                <SourceDot group={group} />
                {SOURCE_GROUP_LABEL[group]}
                <span className="tabular-nums text-[#A39E98]">
                  {groupCounts[group].toLocaleString("ko-KR")}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── 목록 ─────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-white px-4 py-3 text-[12px] text-[#B85C33]"
        >
          <AlertCircle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{error} — 아래 목록은 비어 있는 게 아니라 조회에 실패한 상태입니다.</span>
        </div>
      )}

      {loading && leads.length === 0 ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-[58px] w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-[#e8e8e4] bg-white px-5 py-10 text-center">
          <Inbox aria-hidden className="mx-auto h-5 w-5 text-[#A39E98]" />
          {inRange.length === 0 ? (
            <>
              <p className="mt-2.5 text-[13px] font-semibold text-[#111110]">
                {range.since} ~ {range.until} 사이에 새로 들어온 리드가 없습니다.
              </p>
              <p className="mt-1 text-[12px] text-[#615D59]">
                기간을 넓혀 보세요. 유입이 실제로 없었던 것과 조회 범위가 좁은 것은 다릅니다.
              </p>
            </>
          ) : (
            <>
              <p className="mt-2.5 text-[13px] font-semibold text-[#111110]">
                지금 조건에 맞는 리드가 없습니다.
              </p>
              <p className="mt-1 text-[12px] text-[#615D59]">
                이 기간에 유입은 {inRange.length.toLocaleString("ko-KR")}건 있습니다 — 유입 묶음·검색어
                {onlyUncontacted ? "·미연락만 보기" : ""} 조건을 풀면 보입니다.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between gap-2 px-0.5">
            <p className="text-[11px] font-semibold text-[#615D59]">
              {range.since} ~ {range.until} ·{" "}
              <span className="tabular-nums text-[#111110]">{visible.length.toLocaleString("ko-KR")}</span>건
              {onlyUncontacted ? " (미연락)" : ""}
            </p>
          </div>

          <ul className="mt-1.5 divide-y divide-[#f0f0ec] overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">
            {rows.map((lead) => {
              const group = getLeadSourceGroup(lead)
              const contacted = isContactedLead(lead)
              const pending = pendingIds.includes(lead.id)
              const adLabel = adLabelOf(lead)
              const contact = lead.phone?.trim() || lead.email?.trim() || null
              const rowError = actionError?.leadId === lead.id ? actionError.message : null

              return (
                <li key={lead.id} className="px-3.5 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="truncate text-[13px] font-bold text-[#111110]">
                          {lead.org?.trim() || lead.name?.trim() || "이름 미기재"}
                        </span>
                        {lead.org?.trim() && lead.name?.trim() && (
                          <span className="truncate text-[12px] text-[#615D59]">{lead.name.trim()}</span>
                        )}
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#615D59]">
                          <SourceDot group={group} />
                          {SOURCE_GROUP_LABEL[group]}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#A39E98]">
                        <span className="tabular-nums">{formatRelativeTime(lead.timestamp)}</span>
                        {adLabel && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="truncate text-[#615D59]">{adLabel}</span>
                          </>
                        )}
                        {contact && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="tabular-nums">{contact}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <Link
                      href={`/admin/crm/customers/leads?lead=${encodeURIComponent(lead.id)}`}
                      className="hidden shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-semibold text-[#615D59] transition hover:bg-[#f0f0ec] hover:text-[#111110] sm:inline-flex"
                    >
                      상세
                      <ArrowUpRight aria-hidden className="h-3 w-3" />
                    </Link>

                    {contacted ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#BDEFD8] px-2.5 py-1.5 text-[11px] font-semibold text-[#084734]">
                        <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                        연락함
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void markContacted(lead)}
                        disabled={pending}
                        aria-label={`${lead.org?.trim() || lead.name?.trim() || "이 리드"} 연락함으로 표시`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#111110] transition hover:border-[#084734] hover:text-[#084734] disabled:opacity-60"
                      >
                        {pending ? (
                          <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check aria-hidden className="h-3.5 w-3.5" />
                        )}
                        연락함
                      </button>
                    )}
                  </div>

                  {rowError && (
                    <p role="alert" className="mt-1.5 text-[11px] font-semibold text-[#B85C33]">
                      {rowError} — 상태는 되돌렸습니다. 다시 시도해 주세요.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>

          {(list.canMore || list.canCollapse) && (
            <div className="mt-3">
              <ShowMore
                visible={list.visible}
                total={visible.length}
                step={PAGE_STEP}
                onMore={list.showMore}
                onCollapse={list.canCollapse ? list.collapse : undefined}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}
