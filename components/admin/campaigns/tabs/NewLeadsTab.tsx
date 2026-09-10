"use client"

// 캠페인 허브 "신규 리드" 탭 — 새로 들어온 리드를 날짜로 잘라 보고, 연락 여부를 체크한다.
//
// 광고 탭의 AdLeadsPanel 과 역할이 다르다(중복 아님):
//  - AdLeadsPanel = **Meta 광고 리드 + 딜 전환**. 광고비·CPL 옆에서 유료 유입 모집단을 보고,
//    액션은 CRM 고객·거래 전환(비가역)이다.
//  - 이 탭 = **전 소스 신규 유입 + 연락 체크**. 메타·구글·홈페이지·자료실을 가리지 않고
//    "이 기간에 새로 들어온 것"을 모아 보고, 액션은 연락 여부 도장 하나다.
//
// 연락 여부는 상태 버튼이 아니라 실제 연락 로그를 근거로 한다. 이 탭에서는 리드 상세의
// 연락 기록 폼으로 이동하고, 로그 저장 API가 상태를 연락중으로 함께 맞춘다.
//
// 필터·기간은 전부 URL 에 보존한다(?nlRange=30d&nlFrom=&nlTo=&nlGroups=…&nlQ=&nlOnly=1).

import { useCallback, useDeferredValue, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Inbox,
  Search,
} from "lucide-react"

import { PeriodToggle } from "@/components/admin/PeriodToggle"
import ShowMore, { useVisibleCount } from "@/components/admin/ui/ShowMore"
import { Skeleton } from "@/components/admin/viz"
import { formatRelativeTime } from "@/components/admin/campaigns/perf/format"
import { CompassBridgeDownNote, CompassLeadChip } from "@/components/admin/compass/CompassLeadChip"
import { useCompassOverlay } from "@/components/admin/compass/use-compass-overlay"
import { buildReinflowIndex, countReinflow } from "@/lib/crm/lead-reinflow"
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
  kstDateKey,
  kstToday,
  parseSourceGroupParam,
  resolveLeadDateRange,
  serializeSourceGroupParam,
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

export default function NewLeadsTab({ leads, loading, error }: NewLeadsTabProps) {
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
  // 커스텀 범위가 깨진 동안에도 목록을 비우지 않고 안전한 기본 30일 범위를 보여 준다.
  const fallbackRange = useMemo(() => resolveLeadDateRange("30d", null, today)!, [today])
  const range = resolvedRange ?? fallbackRange
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

  // Compass(마케팅팀 앱) 콜 상태 병기 — 전량 배열로 한 번 조회하고, 아래 필터는 요청을 유발하지 않는다.
  const compass = useCompassOverlay(leads)

  // 재유입 축 — 판정은 **전량**에서 하고(기간 밖 선행 유입을 놓치지 않게), 세는 것만 화면 집합으로 한다.
  const reinflowIndex = useMemo(() => buildReinflowIndex(leads), [leads])
  const reinflowVisible = useMemo(
    () => countReinflow(visible, reinflowIndex),
    [visible, reinflowIndex]
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

  // ─── 상단 수치 ───────────────────────────────────────────────
  // 아래 칩·검색과 달리 **기간 전체**를 말한다(inRange 기준) — 검색어를 칠 때마다 상단 숫자가
  // 같이 흔들리면 "이 기간에 몇 건 들어왔나"라는 기준선이 사라진다. 목록 위 요약 줄이
  // 필터 적용 건수를 따로 말하므로 역할이 겹치지 않는다.
  // 값은 전부 이미 가진 배열에서 세기만 한다 — 새로 만들어 내는 수치는 없다.
  const headStats = useMemo(() => {
    const uncontacted = inRange.filter((lead) => !isContactedLead(lead)).length
    // 기간이 오늘을 품을 때만 "오늘"이 의미 있다. 과거 구간을 골라 놓고 "오늘 0건"을 띄우면
    // 참이지만 쓸모없는 숫자다 — 그때는 마지막 유입일을 대신 보여 준다(inRange 는 최신순).
    const coversToday = range.since <= today && today <= range.until
    const third = coversToday
      ? {
          label: "오늘 유입",
          value: inRange.filter((lead) => kstDateKey(lead.timestamp) === today).length.toLocaleString("ko-KR"),
          hint: today,
        }
      : {
          label: "마지막 유입",
          value: inRange[0] ? (kstDateKey(inRange[0].timestamp) ?? "—") : "—",
          hint: "이 기간 안에서",
        }
    return [
      {
        label: "기간 유입",
        value: inRange.length.toLocaleString("ko-KR"),
        // MM-DD 압축 — 좁은 폭(모바일 114px)에서 연도까지 넣으면 잘린다. 연도 포함 전체 범위는
        // 바로 아래 목록 요약 줄이 그대로 말하므로 여기서 빠져도 잃는 정보가 없다.
        hint: `${range.since.slice(5)} ~ ${range.until.slice(5)}`,
      },
      {
        label: "미연락",
        value: uncontacted.toLocaleString("ko-KR"),
        hint: inRange.length > 0 ? `전체의 ${Math.round((uncontacted / inRange.length) * 100)}%` : "—",
      },
      third,
    ]
  }, [inRange, range.since, range.until, today])

  return (
    <section className="mt-1">
      <header className="mb-4">
        <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">신규 리드</h2>
        <p className="mt-1 text-[12px] leading-[1.6] text-[#615D59]">
          전 소스 신규 유입 — 액션은 연락 체크. 유료 성과는 광고 탭.
        </p>
      </header>

      {/* 상단 수치 — 채움 없이 테두리·구분선만. 값은 tabular-nums 로 자릿수를 고정해
          세 칸의 숫자 밑동이 같은 자리에서 시작하게 한다. */}
      <div className="mb-3 grid grid-cols-3 divide-x divide-[#f0f0ec] overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">
        {headStats.map((stat) => (
          <div key={stat.label} className="px-3.5 py-2.5 sm:px-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#A39E98]">
              {stat.label}
            </p>
            <p className="mt-1 text-[20px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[#111110]">
              {stat.value}
            </p>
            <p className="mt-1 truncate text-[10.5px] tabular-nums text-[#84827a]">{stat.hint}</p>
          </div>
        ))}
      </div>

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
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-0.5">
            <p className="text-[11px] font-semibold text-[#615D59]">
              {range.since} ~ {range.until} ·{" "}
              <span className="tabular-nums text-[#111110]">{visible.length.toLocaleString("ko-KR")}</span>건
              {onlyUncontacted ? " (미연락)" : ""}
              {/* 재유입 = 같은 전화·이메일의 더 이른 리드가 이미 있는 건. 0이면 아예 말하지 않는다. */}
              {reinflowVisible > 0 ? (
                <span
                  title="같은 전화·이메일로 더 이른 리드가 이미 있는 건수입니다. 자체 리드는 재제출 시 행을 새로 만들기 때문에 같은 학원이 여러 행으로 남습니다."
                  className="ml-1.5 inline-flex items-center rounded-md border border-[#e8e8e4] bg-white px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums text-[#84827a]"
                >
                  재유입 {reinflowVisible.toLocaleString("ko-KR")} 포함
                </span>
              ) : null}
            </p>
            {compass.down ? <CompassBridgeDownNote /> : null}
          </div>

          <ul className="mt-1.5 divide-y divide-[#f0f0ec] overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">
            {rows.map((lead) => {
              const group = getLeadSourceGroup(lead)
              const contacted = isContactedLead(lead)
              const adLabel = adLabelOf(lead)
              const contact = lead.phone?.trim() || lead.email?.trim() || null
              const compassEntry = compass.lookup(lead)
              const reinflow = reinflowIndex.has(lead.id)

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
                        {reinflow && (
                          <span
                            title="같은 전화·이메일의 더 이른 리드가 이미 있습니다(첫 유입이 아님)."
                            className="inline-flex items-center rounded-md border border-[#e8e8e4] bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-[#84827a]"
                          >
                            재유입
                          </span>
                        )}
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
                      {/* Compass 병기 — 매칭이 있을 때만. 링크는 새 탭으로 마케팅팀 리드 상세를 연다. */}
                      {compassEntry && (
                        <div className="mt-1 flex">
                          <CompassLeadChip entry={compassEntry} />
                        </div>
                      )}
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
                      <Link
                        href={`/admin/crm/customers/leads?lead=${encodeURIComponent(lead.id)}&action=contact`}
                        aria-label={`${lead.org?.trim() || lead.name?.trim() || "이 리드"} 연락 기록 남기기`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#111110] transition hover:border-[#084734] hover:text-[#084734] disabled:opacity-60"
                      >
                        <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                        연락 기록
                      </Link>
                    )}
                  </div>
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
