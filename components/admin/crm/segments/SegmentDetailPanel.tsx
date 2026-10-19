"use client"

// 세그먼트 허브 상세 — 이름·공유 범위, 조건 빌더(기본 AND + OR 그룹), 조건별 건수, 결과 미리보기(추천순 50행),
// 행동 바(태그·오늘 연락·CSV·담당 배정), 매일 자동 태그 패널.
//  - 미리보기·조건별 건수는 편집 중인 초안 기준(통합 목록 GET 에 같은 조건을 싣는다 — 서버가 or 파라미터를 파싱).
//  - 행동·자동 태그는 저장된 조건 기준(서버가 세그먼트 id 로 회원을 고른다) — 저장 안 된 변경이 있으면 막는다.
//  - OR 이 든 세그먼트도 "통합 목록에서 열기"를 준다(통합 목록은 OR 을 보여 주기만 한다 — "목록에서는 보기만").
//  - 읽을 수 없는 조건 판(specReadable=false — 새 배포가 저장한 세그먼트를 옛 배포가 연 경우): 초안은 모르는 조건이
//    빠져 넓어진 조건이다. 그래서 미리보기 요청·조건별 건수·결과 미리보기·"통합 목록에서 열기"·행동 바를 끄고
//    안내(기록된 건수·8주 추이)만 보인다. 자동 태그 패널은 남긴다(끄기만 할 수 있다).
//  - 권한: 편집은 소유자 또는(팀 세그먼트면) 관리자 — 서버가 canEdit 로 알려 준다. 편집 못 하면 빌더는 읽기 전용.
//  - 확인은 인라인 UI 로만(보관 확인 포함). 보관은 물리 삭제가 아니다(자동 태그 멈춤, 붙은 태그는 둔다).
//  - 미리보기의 Compass 칸은 통합 목록과 같은 공용 판정(UnifiedCompassLink — 360·리드 보드와 같은 기록 위치 규칙)이고,
//    원천 끊김은 표 위 캡션(ContactSourceCaption)이 알린다(2026-09-26 교차 리뷰 [25] 후속 — SegmentPreviewResults).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Archive, ArrowUpRight, Loader2, RotateCcw, Save, X } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { segmentFilterHasOr, segmentFilterQueryString } from "@/lib/crm/customer-segment-filter"
import type {
  SavedSegmentDetailResponse,
  SavedSegmentListItem,
  SavedSegmentLiveStatus,
} from "@/lib/crm/saved-segment-api"
import { SAVED_SEGMENT_DESCRIPTION_MAX, SAVED_SEGMENT_NAME_MAX } from "@/lib/crm/saved-segment-api"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"

import ContactSourceCaption from "../unified/ContactSourceCaption"
import SegmentConditionBar from "../unified/SegmentConditionBar"
import UnifiedCompassLink, {
  unifiedRowNeedsNeoRegistration,
  useUnifiedNeoRegisteredLeadIds,
} from "../unified/UnifiedCompassLink"
import { LastContactCell, NeoSignalLine } from "../unified/row-visuals"
import type { CrmUnifiedCustomers } from "../unified/shared"
import SegmentActionBar from "./SegmentActionBar"
import SegmentAutoTagPanel from "./SegmentAutoTagPanel"
import SegmentOrGroupsEditor from "./SegmentOrGroupsEditor"
import SegmentTrendSpark from "./SegmentTrendSpark"
import {
  SEGMENT_PREVIEW_LIMIT,
  SEGMENT_VISIBILITY_LABEL,
  alignGroupCounts,
  archiveSavedSegment,
  baseConditionCountRows,
  buildCreateRequest,
  buildUpdateRequest,
  createSavedSegment,
  describeBySource,
  describeSpecShort,
  draftFromSegment,
  draftToFilter,
  emptySegmentDraft,
  fetchSegmentDetail,
  formatKstMonthDay,
  formatRunAt,
  isDraftDirty,
  knownDetailAnyOfCounts,
  knownDetailBySource,
  readAnyOfCounts,
  readSummaryAnyOf,
  segmentPreviewUrl,
  unifiedListHref,
  updateSavedSegment,
  validateSegmentDraft,
  type SegmentDraft,
} from "./segment-hub-api"

const PREVIEW_DEBOUNCE_MS = 300

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

/** 조건별 건수 막대 한 줄 — 길이는 조건 전 모집단 대비. */
function CountRow({
  label,
  count,
  baseTotal,
  hint,
  final = false,
}: {
  label: string
  count: number | null
  baseTotal: number | null
  hint?: string
  final?: boolean
}) {
  const ratio = count != null && baseTotal ? Math.max(0.008, Math.min(1, count / baseTotal)) : 0
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[12px]">
      <span className={final ? "font-semibold text-[#111110]" : "text-[#31302E]"}>
        {label}
        {hint ? <span className="block text-[11px] font-medium text-[#1a1a1a]/40">{hint}</span> : null}
      </span>
      <span className={`text-right font-bold tabular-nums ${final ? "text-[16px] text-[#084734]" : "text-[#111110]"}`}>
        {count == null ? "…" : count.toLocaleString("ko-KR")}
      </span>
      <span aria-hidden className="col-span-2 h-1.5 overflow-hidden rounded-full bg-[#f0f0ec]">
        <span className="block h-full rounded-full bg-[#084734]" style={{ width: `${(ratio * 100).toFixed(1)}%` }} />
      </span>
    </li>
  )
}

/**
 * 읽을 수 없는 조건 판(specReadable=false) 안내 — 이 배포가 모르는 조건이 빠져 넓어진 초안으로 미리보기·건수·목록 링크·
 * 행동을 만들지 않고, 기록된 건수(매일 06시 실행 — 새 배포가 잰 값)와 8주 추이만 보인다.
 */
export function UnreadableSegmentNotice({ segment, nowMs }: { segment: SavedSegmentListItem; nowMs: number }) {
  return (
    <div className="grid gap-2 px-4 py-4" data-testid="segment-unreadable-notice" role="status">
      <p className={`text-[13px] font-semibold ${STATUS_TONE_TEXT_CLASS.warning}`}>
        이 배포가 읽지 못하는 새 조건 판(v{segment.specVersion})으로 저장된 세그먼트입니다.
      </p>
      <p className="text-[12px] leading-relaxed text-[#31302E]">
        모르는 조건이 빠진 채로 보면 대상이 실제보다 넓어집니다. 그래서 결과 미리보기·조건별 건수·통합 목록 링크·행동(태그·오늘
        연락·CSV·담당 배정)을 끕니다. 새 배포에서 여세요.
      </p>
      <p className="text-[12px] text-[#615D59]">
        마지막 기록{" "}
        <b className="tabular-nums text-[#111110]">
          {segment.lastCount == null ? "—" : `${segment.lastCount.toLocaleString("ko-KR")}명`}
        </b>{" "}
        · {formatRunAt(segment.lastEvaluatedAt, nowMs)}
      </p>
      <div className="grid gap-1">
        <p className="text-[11px] font-semibold text-[#615D59]">8주 추이(기록된 건수)</p>
        <SegmentTrendSpark trend={segment.trend} trendDays={segment.trendDays} width={180} height={36} />
      </div>
    </div>
  )
}

/** 미리보기에 그리는 행 — 추천순 앞 SEGMENT_PREVIEW_LIMIT 행. 링크 판정 원천 조회 여부도 이 행들로만 정한다. */
export function segmentPreviewRows(preview: Pick<CrmUnifiedCustomers, "rows"> | null | undefined) {
  return preview ? preview.rows.slice(0, SEGMENT_PREVIEW_LIMIT) : []
}

/**
 * 결과 미리보기 본문(presentational — 상태·fetch 없음). 통합 목록(CustomerResultsSection)과 같은 규칙을 쓴다.
 *  - 위 캡션: 응답 meta 로 원천 끊김을 알린다(ContactSourceCaption). 특히 compassRefs=down 이면 "Compass 연결 끊김 —
 *    Compass 링크를 표시하지 못함" — 링크가 없는 것이 "Compass 매칭 없음"이 아니라 조회 실패임을 구분한다.
 *  - Compass 칸: UnifiedCompassLink(공용 판정 resolveCrmWriteSurface). 리드만이 아니라 NEO·전환 고객 행도 같은 전화의
 *    Compass 리드가 있으면 보조 "Compass 기록", 전환·NEO 등록 확정 리드도 "Compass 기록"(Home 정본), 그 밖의 매칭 리드만
 *    "Compass에서 열기". href 는 응답 문자열(compass.url)이 아니라 id 로 다시 만든다(compassLeadUrl 하나).
 *  - 등록 확정 원천(neoRegisteredLeadIds)은 부모가 useUnifiedNeoRegisteredLeadIds 로 읽어 넘긴다 — 생략하면 행 값만 본다.
 */
export function SegmentPreviewResults({
  preview,
  nowMs,
  loading = false,
  neoRegisteredLeadIds = null,
}: {
  preview: CrmUnifiedCustomers
  nowMs: number
  loading?: boolean
  neoRegisteredLeadIds?: ReadonlySet<string> | null
}) {
  const rows = segmentPreviewRows(preview)
  return (
    <>
      <ContactSourceCaption meta={preview.meta} className="mb-1.5" />
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-[#1a1a1a]/40">지금 이 조건에 맞는 고객이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e8e8e4]">
          <table className="w-full min-w-[640px] border-collapse text-left text-[12px]" aria-label="결과 미리보기">
            <thead>
              <tr className="border-b border-[#e8e8e4] text-[11px] font-semibold text-[#1a1a1a]/45">
                <th className="px-3 py-2">고객</th>
                <th className="px-3 py-2">종류</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">마지막 연락</th>
                <th className="px-3 py-2">담당</th>
                <th className="w-12 px-3 py-2">
                  <span className="sr-only">Compass</span>
                </th>
              </tr>
            </thead>
            <tbody className={loading ? "opacity-60" : undefined}>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-[#f0f0ec] last:border-b-0">
                  <td className="px-3 py-2 align-top">
                    <Link href={row.href} prefetch={false} className="font-semibold text-[#111110] hover:text-[#084734] hover:underline">
                      {row.name}
                    </Link>
                    <NeoSignalLine row={row} />
                  </td>
                  <td className="px-3 py-2 align-top text-[#31302E]">{row.sourceLabel}</td>
                  <td className="px-3 py-2 align-top text-[#31302E]">{row.statusLabel}</td>
                  <td className="px-3 py-2 align-top">
                    <LastContactCell row={row} nowMs={nowMs} />
                  </td>
                  <td className="px-3 py-2 align-top text-[#31302E]">{row.ownerName ?? "미배정"}</td>
                  <td className="px-3 py-2 align-top">
                    <UnifiedCompassLink row={row} variant="icon" neoRegisteredLeadIds={neoRegisteredLeadIds} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function PreviewSkeleton() {
  return (
    <div aria-hidden className="grid gap-2 py-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-9 animate-pulse rounded-lg bg-[#f5f5f2]" />
      ))}
    </div>
  )
}

export default function SegmentDetailPanel({
  segmentId,
  listItem,
  live,
  available,
  nowMs,
  onSaved,
  onArchived,
  onClose,
  onNotice,
  onRefreshList,
}: {
  /** null = 새 세그먼트 초안 */
  segmentId: string | null
  listItem: SavedSegmentListItem | null
  live: SavedSegmentLiveStatus | null
  /** 세그먼트 표 적용 여부 — false 면 저장·행동·자동 태그를 막고 미리보기만 한다. */
  available: boolean
  nowMs: number
  onSaved: (item: SavedSegmentListItem, created: boolean) => void
  onArchived: (id: string) => void
  onClose: () => void
  onNotice: (message: string, tone: "success" | "danger") => void
  onRefreshList: () => void
}) {
  const [saved, setSaved] = useState<SavedSegmentListItem | null>(listItem)
  const [draft, setDraft] = useState<SegmentDraft | null>(() =>
    listItem ? draftFromSegment(listItem) : segmentId ? null : emptySegmentDraft()
  )
  const [detail, setDetail] = useState<SavedSegmentDetailResponse | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailToken, setDetailToken] = useState(0)
  const [preview, setPreview] = useState<CrmUnifiedCustomers | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [archiveConfirm, setArchiveConfirm] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const previewSeq = useRef(0)

  // 상세(56일 점·원천별 건수·OR 그룹 건수) — 저장된 세그먼트만. 목록에 없던 id(다른 범위·딥링크)면 상세가 원본이 된다.
  useEffect(() => {
    if (!segmentId) return
    let cancelled = false
    setDetailError(null)
    fetchSegmentDetail(segmentId)
      .then((next) => {
        if (cancelled) return
        if (!next) {
          setDetailError("세그먼트를 읽지 못했습니다.")
          return
        }
        setDetail(next)
        setSaved((prev) => prev ?? next.segment)
        setDraft((prev) => prev ?? draftFromSegment(next.segment))
      })
      .catch((error) => {
        if (!cancelled) setDetailError(errorMessage(error, "세그먼트 상세를 불러오지 못했습니다."))
      })
    return () => {
      cancelled = true
    }
  }, [segmentId, detailToken])

  const filter = useMemo(() => (draft ? draftToFilter(draft) : null), [draft])
  const filterKey = filter ? segmentFilterQueryString(filter) : null
  // 읽을 수 없는 판 — 초안이 넓어진 조건이라 미리보기·링크·행동을 만들지 않는다.
  const unreadable = Boolean(saved && !saved.specReadable)

  // 미리보기 — 초안 조건을 통합 목록 GET 에 싣는다(디바운스, 늦게 온 옛 응답은 버린다). 읽을 수 없는 판은 부르지 않는다.
  useEffect(() => {
    if (unreadable || filterKey == null || !filter) return
    const seq = ++previewSeq.current
    setPreviewLoading(true)
    const timer = window.setTimeout(() => {
      adminFetchJson<CrmUnifiedCustomers>(segmentPreviewUrl(filter))
        .then((data) => {
          if (seq !== previewSeq.current) return
          setPreview(data)
          setPreviewError(null)
        })
        .catch((error) => {
          if (seq !== previewSeq.current) return
          setPreviewError(errorMessage(error, "미리보기를 불러오지 못했습니다."))
        })
        .finally(() => {
          if (seq === previewSeq.current) setPreviewLoading(false)
        })
    }, PREVIEW_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
    // filterKey 가 조건의 정규형 — filter 객체 정체성이 아니라 문자열이 바뀔 때만 다시 부른다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, unreadable])

  // Compass 링크 문구의 등록 확정 원천 — 통합 목록(CustomerResultsSection)과 같게, 문구가 바뀔 수 있는 행(Compass 링크가
  // 있는 전환 아닌 리드)이 미리보기에 있을 때만 읽고 미리보기 응답이 새로 오면(generatedAt) 다시 읽는다(라우트 응답은 30초
  // 브라우저 캐시). 조회 전·실패는 미등록 폴백 — 리드 보드·360 과 같은 쪽으로 떨어진다(읽기 전용, 문구만 바뀐다).
  const neoRegisteredLeadIds = useUnifiedNeoRegisteredLeadIds(
    segmentPreviewRows(preview).some(unifiedRowNeedsNeoRegistration),
    preview?.generatedAt ?? null
  )

  const dirty = draft ? isDraftDirty(draft, saved) : false
  const canEdit = saved ? saved.canEdit && saved.specReadable && !saved.archivedAt : true
  const validation = draft ? validateSegmentDraft(draft, { autoTagEnabled: saved?.autoTag.enabled }) : null
  const summary = preview?.segment
  const baseTotal = summary?.baseTotal ?? null
  const hasOr = draft ? segmentFilterHasOr(draftToFilter(draft)) : false

  // 상세의 원천별·그룹별 건수는 라이브 평가가 성공했을 때만 쓴다 — 실패하면 서버가 0 으로 채워 보내므로
  // 그대로 쓰면 "0"과 "모름"이 섞인다(담당 배정이 "리드 없음"으로 잘못 막히고 그룹 건수가 0 으로 보인다).
  const detailBySource = knownDetailBySource(detail)
  const detailAnyOfCounts = knownDetailAnyOfCounts(detail)

  // OR 그룹 건수 — 초안 미리보기(서버가 anyOfCounts 를 실으면) 우선, 없고 저장본 그대로면 상세 응답.
  const previewAnyOf = readAnyOfCounts(summary)
  const groupCounts: Array<number | null> = !draft
    ? []
    : previewAnyOf
      ? alignGroupCounts(draft.groups, previewAnyOf, readSummaryAnyOf(summary))
      : !dirty && detailAnyOfCounts && saved
        ? alignGroupCounts(draft.groups, detailAnyOfCounts, saved.spec.anyOf ?? [])
        : draft.groups.map(() => null)
  const orUnsupported = hasOr && summary != null && previewAnyOf == null

  const baseRows = draft ? baseConditionCountRows(draft.base, summary?.conditionCounts) : []
  const listHref = draft && !unreadable ? unifiedListHref(draftToFilter(draft)) : null
  const previewNowMs = preview ? Date.parse(preview.generatedAt) || nowMs : nowMs
  const resultSources = preview
    ? describeBySource({
        lead: preview.summary.leadCount,
        neo_account: preview.summary.accountCount,
        customer: preview.summary.customerCount ?? 0,
      })
    : null

  const updateDraft = useCallback((patch: Partial<SegmentDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
    setSaveError(null)
  }, [])

  const save = async () => {
    if (!draft || !canEdit || !available) return
    if (validation) {
      setSaveError(validation)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      if (!saved) {
        const created = await createSavedSegment(buildCreateRequest(draft))
        setSaved(created)
        setDraft(draftFromSegment(created))
        onSaved(created, true)
        onNotice(`'${created.name}' 세그먼트를 저장했습니다 — 내일 06시부터 건수를 쌓습니다.`, "success")
        return
      }
      const request = buildUpdateRequest(draft, saved)
      if (Object.keys(request).length === 0) return
      const next = await updateSavedSegment(saved.id, request)
      setSaved(next)
      setDraft(draftFromSegment(next))
      onSaved(next, false)
      setDetailToken((token) => token + 1)
      onNotice(
        request.spec ? `조건을 저장했습니다 — 8주 추이는 오늘부터 새 조건으로 이어집니다(이전 점은 흐리게).` : "저장했습니다.",
        "success"
      )
    } catch (error) {
      setSaveError(errorMessage(error, "저장하지 못했습니다."))
    } finally {
      setSaving(false)
    }
  }

  const revert = () => {
    setDraft(saved ? draftFromSegment(saved) : emptySegmentDraft())
    setSaveError(null)
  }

  const archive = async () => {
    if (!saved) return
    setArchiving(true)
    try {
      await archiveSavedSegment(saved.id)
      onNotice(`'${saved.name}' 세그먼트를 보관했습니다 — 자동 태그는 멈추고 붙은 태그는 그대로 둡니다.`, "success")
      onArchived(saved.id)
    } catch (error) {
      setSaveError(errorMessage(error, "보관하지 못했습니다."))
      setArchiving(false)
      setArchiveConfirm(false)
    }
  }

  const restore = async () => {
    if (!saved) return
    setSaving(true)
    try {
      const next = await updateSavedSegment(saved.id, { restore: true })
      setSaved(next)
      setDraft(draftFromSegment(next))
      onSaved(next, false)
      onNotice(`'${next.name}' 세그먼트를 복구했습니다.`, "success")
    } catch (error) {
      setSaveError(errorMessage(error, "복구하지 못했습니다."))
    } finally {
      setSaving(false)
    }
  }

  const handleSegmentChange = (next: SavedSegmentListItem) => {
    setSaved(next)
    onSaved(next, false)
  }

  if (!draft) {
    return (
      <section className="mt-4 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-6" aria-busy={!detailError}>
        {detailError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className={`text-[13px] ${STATUS_TONE_TEXT_CLASS.danger}`} role="alert">
              {detailError}
            </p>
            <button type="button" onClick={onClose} className="text-[12px] font-semibold text-[#615D59] hover:text-[#111110]">
              닫기
            </button>
          </div>
        ) : (
          <PreviewSkeleton />
        )}
      </section>
    )
  }

  const statusText = !saved ? "새 세그먼트 — 저장 전" : dirty ? "변경됨 — 저장 안 됨" : "저장됨"
  const statusTone = !saved || dirty ? STATUS_TONE_TEXT_CLASS.warning : STATUS_TONE_TEXT_CLASS.ok
  const savedCount = detail?.segment.count ?? saved?.count ?? saved?.lastCount ?? null
  const neoDay = formatKstMonthDay(live?.neoLatestSyncedAt)

  return (
    <section
      className="mt-4 overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white"
      aria-label={saved ? `세그먼트 상세 — ${saved.name}` : "새 세그먼트"}
      data-testid="segment-detail"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e8e8e4] px-4 py-3.5">
        <div className="grid min-w-0 flex-1 basis-[280px] gap-1.5">
          <label htmlFor="segment-name" className="sr-only">
            세그먼트 이름
          </label>
          <input
            id="segment-name"
            value={draft.name}
            onChange={(event) => updateDraft({ name: event.target.value })}
            maxLength={SAVED_SEGMENT_NAME_MAX}
            placeholder="세그먼트 이름(예: 만료 60일 · 위험 또는 무연락)"
            disabled={!canEdit || saving}
            autoComplete="off"
            className="h-11 w-full max-w-[460px] rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[16px] font-bold text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 disabled:bg-[#fafaf8] sm:h-10"
          />
          <label htmlFor="segment-description" className="sr-only">
            설명
          </label>
          <input
            id="segment-description"
            value={draft.description}
            onChange={(event) => updateDraft({ description: event.target.value })}
            maxLength={SAVED_SEGMENT_DESCRIPTION_MAX}
            placeholder="설명(선택) — 무엇을 위한 묶음인지"
            disabled={!canEdit || saving}
            autoComplete="off"
            className="h-11 w-full max-w-[460px] rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] text-[#31302E] outline-none focus:border-[#084734] disabled:bg-[#fafaf8] sm:h-8"
          />
          <p className="text-[11px] text-[#615D59]">
            {saved
              ? `만든 사람 ${saved.owner.name ?? "알 수 없음"} · 마지막 실행 ${formatRunAt(saved.lastEvaluatedAt, nowMs)} · 저장 조건 ${
                  savedCount == null ? "—" : `${savedCount.toLocaleString("ko-KR")}명`
                }`
              : "저장하면 매일 06시(KST)에 건수를 기록해 8주 추이를 쌓습니다(소급 불가)."}
            {saved?.archivedAt ? ` · 보관됨 ${formatKstMonthDay(saved.archivedAt) ?? ""}` : ""}
          </p>
          {saved && !saved.canEdit ? (
            <p className="text-[11px] text-[#615D59]">이 세그먼트는 소유자(또는 팀 세그먼트면 관리자)만 고칠 수 있습니다 — 미리보기와 행동은 쓸 수 있습니다.</p>
          ) : null}
          {saved && !saved.specReadable ? (
            <p className={`text-[11px] ${STATUS_TONE_TEXT_CLASS.warning}`}>
              새 조건 판(v{saved.specVersion})으로 저장돼 이 화면에서 편집·행동할 수 없습니다.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="segment-visibility" className="sr-only">
            공유 범위
          </label>
          <select
            id="segment-visibility"
            value={draft.visibility}
            onChange={(event) => updateDraft({ visibility: event.target.value === "team" ? "team" : "mine" })}
            disabled={!canEdit || saving}
            className="h-11 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] focus:border-[#084734] focus:outline-none disabled:bg-[#fafaf8] sm:h-9"
          >
            <option value="team">{SEGMENT_VISIBILITY_LABEL.team}</option>
            {/* '내 것'으로 바꾸기는 소유자만(서버 403) — 남의 팀 세그먼트를 고치는 관리자에게는 막아 둔다. */}
            <option value="mine" disabled={Boolean(saved && !saved.isMine)}>
              {SEGMENT_VISIBILITY_LABEL.mine}
            </option>
          </select>
          <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${statusTone}`} role="status">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
            {statusText}
          </span>
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={revert}
                disabled={!dirty || saving || !saved}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#31302E] hover:border-[#c8c8c4] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                되돌리기
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!dirty || saving || !available || Boolean(validation)}
                title={!available ? "세그먼트 표가 아직 적용되지 않았습니다." : (validation ?? undefined)}
                aria-busy={saving || undefined}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-[#084734] px-3.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
                저장
              </button>
            </>
          ) : null}
          {listHref ? (
            <Link
              href={listHref}
              prefetch={false}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-[#084734] hover:underline sm:min-h-9"
            >
              통합 목록에서 열기
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
          {listHref && hasOr ? (
            <span
              className="inline-flex min-h-11 items-center px-2 text-[11px] font-medium text-[#615D59] sm:min-h-9"
              title="통합 목록은 OR 조건을 보여 주기만 합니다 — OR 그룹 편집은 여기서 합니다."
            >
              OR 포함 — 목록에서는 보기만
            </span>
          ) : null}
          {saved && saved.canEdit && !saved.archivedAt && available ? (
            <button
              type="button"
              onClick={() => setArchiveConfirm((value) => !value)}
              aria-expanded={archiveConfirm}
              disabled={archiving}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-[#615D59] hover:text-[#B43E3E] sm:min-h-9"
            >
              <Archive className="h-3.5 w-3.5" aria-hidden />
              보관
            </button>
          ) : null}
          {saved?.archivedAt && saved.canEdit && available ? (
            <button
              type="button"
              onClick={() => void restore()}
              disabled={saving}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#084734] hover:border-[#c8c8c4] sm:min-h-9"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              복구
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="상세 닫기"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#1a1a1a]/45 hover:bg-[#fafaf8] hover:text-[#111110] sm:h-9 sm:w-9"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {archiveConfirm && saved ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#e8e8e4] bg-[#FAFAF8] px-4 py-3">
          <p className="min-w-0 flex-1 text-[12px] text-[#31302E]">
            보관하면 목록에서 숨고 매일 기록·자동 태그가 멈춥니다. 이미 붙은 태그는 그대로 둡니다. 보관함에서 복구할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => void archive()}
            disabled={archiving}
            aria-busy={archiving || undefined}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-[#B43E3E] px-3 text-[12px] font-semibold text-white hover:bg-[#8F2C2C] disabled:opacity-50 sm:min-h-9"
          >
            {archiving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            보관 확인
          </button>
          <button
            type="button"
            onClick={() => setArchiveConfirm(false)}
            disabled={archiving}
            className="inline-flex min-h-11 items-center px-2 text-[12px] font-semibold text-[#615D59] hover:text-[#111110] sm:min-h-9"
          >
            취소
          </button>
        </div>
      ) : null}

      {saveError ? (
        <p className={`border-b border-[#e8e8e4] px-4 py-2 text-[12px] ${STATUS_TONE_TEXT_CLASS.danger}`} role="alert">
          {saveError}
        </p>
      ) : canEdit && dirty && validation ? (
        <p className="border-b border-[#e8e8e4] px-4 py-2 text-[12px] text-[#615D59]" role="status" data-testid="segment-validation">
          저장하려면: {validation}
        </p>
      ) : null}

      {unreadable && saved ? (
        <UnreadableSegmentNotice segment={saved} nowMs={nowMs} />
      ) : (
        <>
          <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <div className="grid min-w-0 content-start gap-3">
              <SegmentConditionBar
                spec={draft.base}
                onChange={(next) => updateDraft({ base: next })}
                segment={summary}
                total={summary ? summary.total : null}
                loading={previewLoading}
                title="기본 조건"
                ariaLabel="기본 조건(모두 AND)"
                idleHint="모두 AND로 묶입니다 · 칩 숫자는 그 조건 하나만 켰을 때 인원"
                className="rounded-xl border border-[#e8e8e4] bg-white px-3 py-2.5"
                readOnly={!canEdit}
                testId="segment-base-conditions"
              />
              <SegmentOrGroupsEditor
                groups={draft.groups}
                onChange={(next) => updateDraft({ groups: next })}
                segment={summary}
                groupCounts={groupCounts}
                loading={previewLoading}
                readOnly={!canEdit}
              />
            </div>

            <div className="grid min-w-0 content-start gap-3 rounded-xl border border-[#e8e8e4] p-3" aria-busy={previewLoading}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1a1a1a]/40">조건별 건수</p>
              <ol className="grid gap-2.5">
                <CountRow label="조건 전 — 통합 고객 기본 모집단" count={baseTotal} baseTotal={baseTotal} />
                {baseRows.map((row) => (
                  <CountRow key={row.key} label={row.label} count={row.count} baseTotal={baseTotal} hint="이 조건 하나만" />
                ))}
                {draft.groups.map((group, index) => (
                  <CountRow
                    key={`g${index}`}
                    label={`그룹 ${index + 1}: ${describeSpecShort(group)}`}
                    count={groupCounts[index] ?? null}
                    baseTotal={baseTotal}
                    hint="기본 조건 ∧ 이 그룹"
                  />
                ))}
                <CountRow label="결과" count={summary ? summary.total : null} baseTotal={baseTotal} final />
              </ol>
              {resultSources ? <p className="text-[11px] text-[#615D59]">{resultSources}</p> : null}
              {orUnsupported ? (
                <p className={`text-[11px] font-medium ${STATUS_TONE_TEXT_CLASS.warning}`}>
                  서버가 OR 그룹 건수를 돌려주지 않았습니다 — 미리보기가 기본 조건만 반영했을 수 있습니다.
                </p>
              ) : null}
              <p className="text-[11px] leading-relaxed text-[#1a1a1a]/45">
                숫자는 통합 목록 기본 화면과 같은 모집단(미확인 리드 제외)입니다.
                {neoDay ? ` NEO 값은 ${neoDay} 기준.` : ""}
                {live?.compass === "down" ? " Compass 연결 끊김 — 무연락 건수는 Home 기록만으로 셉니다." : ""}
              </p>
              {saved ? (
                <div className="grid gap-1 border-t border-[#f0f0ec] pt-2">
                  <p className="text-[11px] font-semibold text-[#615D59]">8주 추이(저장된 조건)</p>
                  <SegmentTrendSpark trend={saved.trend} trendDays={saved.trendDays} width={180} height={36} />
                </div>
              ) : null}
            </div>
          </div>

          <div className="px-4 pb-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1a1a1a]/40">
              결과 미리보기
              <span className="ml-1.5 normal-case tracking-normal text-[#615D59]">
                {preview
                  ? `${preview.summary.total.toLocaleString("ko-KR")}명 중 앞 ${Math.min(preview.rows.length, SEGMENT_PREVIEW_LIMIT).toLocaleString("ko-KR")}명(추천순)`
                  : ""}
              </span>
            </p>
            {previewError ? (
              <p className={`py-3 text-[12px] ${STATUS_TONE_TEXT_CLASS.danger}`} role="alert">
                {previewError}
              </p>
            ) : !preview ? (
              <PreviewSkeleton />
            ) : (
              <SegmentPreviewResults
                preview={preview}
                nowMs={previewNowMs}
                loading={previewLoading}
                neoRegisteredLeadIds={neoRegisteredLeadIds}
              />
            )}
          </div>
        </>
      )}

      {saved ? (
        <>
          {unreadable ? null : (
            <SegmentActionBar
              segment={saved}
              dirty={dirty}
              available={available}
              total={savedCount}
              bySource={detailBySource}
              onNotice={onNotice}
            />
          )}
          <SegmentAutoTagPanel
            key={saved.id}
            segment={saved}
            live={live}
            dirty={dirty}
            available={available}
            nowMs={nowMs}
            onSegmentChange={handleSegmentChange}
            onNotice={onNotice}
            onRefresh={() => {
              setDetailToken((token) => token + 1)
              onRefreshList()
            }}
          />
        </>
      ) : (
        <p className="border-t border-[#e8e8e4] px-4 py-3 text-[12px] text-[#615D59]">
          {available
            ? "저장하면 태그 붙이기·오늘 연락에 넣기·CSV·담당 배정과 매일 자동 태그를 쓸 수 있습니다."
            : "세그먼트 표가 아직 적용되지 않아 저장할 수 없습니다 — 조건은 위 '통합 목록에서 열기' 주소로 공유하세요."}
        </p>
      )}
    </section>
  )
}
