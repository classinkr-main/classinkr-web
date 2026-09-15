"use client"

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CalendarClock, CheckCircle2, Clock3, ExternalLink, Filter, RefreshCw, XCircle } from "lucide-react"

import { adminFetchJsonCached, getCachedAdminJson, seedAdminRequestCache } from "@/lib/admin-client"
import type { DeferredPrefetch } from "@/lib/admin/prefetch-budget"
import { CRM_CACHE_SWR_MS } from "@/lib/crm/client-cache"
import { runOptimistic } from "@/lib/crm/optimistic-update"
import type { CrmPriorityBucket, CrmPriorityItem, CrmPriorityLane } from "@/lib/crm/priority"
// CRM 홈 서버 프리페치(lib/admin/crm/home-prefetch.ts)와 같은 캐시 키를 만들기 위해 공유하는
// 중립 모듈(2026-09-07 감사 #7) — QUEUE_POOL_LIMIT·queueUrl의 정본은 여기가 아니라 그 파일.
import { QUEUE_POOL_LIMIT, queueUrl } from "@/lib/crm/priority-queue-request"
import { STATUS_TONE_CLASS, STATUS_TONE_TEXT_STRONG_CLASS } from "@/lib/crm/status-tone"
import { TODAY_CALL_SLOTS, pickTodayCalls, type TodayCall, type TodayCallSlotKey } from "@/lib/crm/today-calls"
import { kstDayStart } from "@/lib/crm/week-ahead"
import CrmNoticeBanner from "./CrmNoticeBanner"
import { INTERACTIVE_TEXT_CLASS, SECONDARY_TEXT_CLASS } from "./home/shared"
import { buildOwnerSelectOptions, useCrmOwners } from "./useCrmOwners"

// 홈 우선순위 패널 = "오늘 전화할 N건" 카드. 숫자 타일·레인 탭·시점 탭을 걷어내고
// 쿼터 믹스(신규 응대 2 · 돈 임박 2 · 다시 움직임 1)로 뽑은 카드만 남긴다.
// 판단(누굴 뽑나)은 lib/crm/today-calls.ts 한 곳에 있다 — 화면은 뽑힌 결과를 그릴 뿐이다.
// 탐색·전수 조회는 고객DB(/admin/crm/customers/unified)가 담당한다.
type LeadContactType = "call" | "sms" | "kakao" | "email"
type LeadContactResult = "answered" | "no_answer" | "callback" | "meeting_set"
type LeadNextSchedule = "keep" | "tomorrow" | "clear"

interface LeadContactDraft {
  itemId: string
  type: LeadContactType
  result: LeadContactResult
  notes: string
  nextSchedule: LeadNextSchedule
}

// export — CRM 홈 서버 프리페치(lib/admin/crm/home-prefetch.ts)가 이 화면의 기본(담당자
// 전체) 호출과 같은 캐시 키를 만들 때 재사용한다(2026-09-07 감사 #7 팬아웃 축소).
export interface CrmPriorityQueue {
  generatedAt: string
  sources: {
    leadsOk: boolean
    neoAccountsOk: boolean
    tasksOk: boolean
    warnings: string[]
  }
  summary: {
    total: number
    critical: number
    high: number
    leadCount: number
    neoAccountCount: number
    taskCount: number
    ownerCount: number
    bucketCounts: Record<CrmPriorityBucket, number>
    laneTotals: Record<CrmPriorityLane, number>
    laneCritical: number
    sourceTotals?: { lead: number; neoAccount: number; task: number }
    demo?: { total: number; matched: number; unmatched: number; down?: boolean }
  }
  buckets: Array<{ bucket: CrmPriorityBucket; label: string; count: number }>
  lanes: Array<{ lane: CrmPriorityLane; label: string; count: number }>
  owners: Array<{ ownerName: string; count: number }>
  items: CrmPriorityItem[]
}

const QUEUE_TTL_MS = 90_000
const QUEUE_PREVIEW_COUNT = 5
const CURRENT_OWNER_VALUE = "__me"
/** '내일로'·'종료' 성공 배너의 되돌리기 버튼이 살아 있는 시간(UX 규약 1). */
export const QUEUE_UNDO_WINDOW_MS = 8_000
/**
 * 낙관 제거한 카드를 서버 응답에서 다시 걸러내는 시간. 서버 스냅샷(crm-priority-queue.ts
 * unstable_cache 60초)은 리드 쓰기로 즉시 만료되지 않아, force 없는 백그라운드 재검증이
 * 방금 처리한 카드를 한 번 더 돌려줄 수 있다 — 그 창 동안만 로컬에서 숨긴다.
 * 헤더 새로고침(force)은 이 목록을 비운다(서버가 전량 재수집하므로).
 */
const QUEUE_SUPPRESS_MS = 120_000

// owner 필터가 걸려 있어 서버 프리페치(담당 전체 기준)를 쓸 수 없을 때 use()에 넘기는
// 안정된 싱글턴 — React use()에 매 렌더 새 promise를 주면 안 되므로(무한 서스펜스로
// 오인될 수 있다) 모듈 상수 하나를 재사용한다.
const RESOLVED_NULL_PROMISE: Promise<CrmPriorityQueue | null> = Promise.resolve(null)

// 슬롯 색: 신규 응대=그린 틴트, 돈 임박=Warning 캐논, 다시 움직임=중립 — 카드 성격을 한 눈에.
const SLOT_CHIP_CLASS: Record<TodayCallSlotKey, string> = {
  new_response: "bg-[#ECFDF5] text-[#084734]",
  money: "bg-[#FBF1E0] text-[#7A520F]",
  reengage: "bg-[#f0f0ec] text-[#31302E]",
}

// queueUrl이 source를 항상 "customer"로 고정한다(레인·시점 탭을 걷어낸 뒤로 값이 바뀐 적이
// 없다) — 즉 서버가 돌려주는 item.source는 lead/neo_account만 가능하고 "task"는 절대
// 오지 않는다. (2026-09-07 감사 #4: 예전엔 item.source === "task" 렌더 분기·
// handleTaskAction이 죽은 채 남아 있었다 — 제거했다. 할 일 존재는 아래 "이 목록에는 할
// 일이 빠져 있습니다" 요약 줄로만 알린다.)

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

// 좌측 경계선 색 — 긴급은 상태 스케일 Danger 텍스트색(lib/crm/status-tone.ts STATUS_TONE.danger.text).
function severityBorderClass(item: CrmPriorityItem) {
  if (item.severity === "critical") return "border-l-[#B43E3E]"
  if (item.severity === "high") return "border-l-[#084734]"
  return "border-l-[#A39E98]"
}

// 메타 칩의 "경과 시간" — 유입 시각(dueAt) 기준. 밴드는 함축이 목적이라 시간 단위 하나만 쓴다.
function formatAgeHours(value: string | null) {
  if (!value) return null
  const diff = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(diff) || diff < 0) return null
  const hours = Math.floor(diff / 3_600_000)
  return hours >= 24 ? `${Math.floor(hours / 24)}일` : `${hours}h`
}

function leadIdFromPriorityItem(item: CrmPriorityItem) {
  return item.source === "lead" && item.id.startsWith("lead:") ? item.id.slice("lead:".length) : null
}

const DAY_MS = 24 * 60 * 60 * 1000
const KST_MORNING_OFFSET_MS = 9 * 60 * 60 * 1000

// 미루기 기본값: 내일 오전 9시(KST). 브라우저 로컬 시각이 아니라 서버 할 일 미루기
// (lib/repositories/crm-tasks.ts defaultSnoozeUntil)와 같은 KST 규칙으로 고정한다 —
// kstDayStart(내일 00:00 KST) + 9시간 = 내일 09:00 KST = 내일 00:00 UTC.
function tomorrowMorningIso(nowMs = Date.now()) {
  return new Date(kstDayStart(nowMs) + DAY_MS + KST_MORNING_OFFSET_MS).toISOString()
}

function errorDetail(err: unknown) {
  return err instanceof Error && err.message ? err.message : "알 수 없는 오류"
}

// ─── 순수 헬퍼(export — tests/crm/priority-queue-optimistic.test.tsx) ─────────────

/** 카드 낙관 제거 — 같은 응답 안의 overflow가 다음 후보로 자동 승격된다(pickTodayCalls). */
export function removeQueueItem(data: CrmPriorityQueue | null, itemId: string): CrmPriorityQueue | null {
  if (!data) return data
  if (!data.items.some((item) => item.id === itemId)) return data
  return { ...data, items: data.items.filter((item) => item.id !== itemId) }
}

/** 되돌리기 뒤 카드 복원 — 이미 있으면 그대로, 없으면 다시 넣는다(정렬은 pickTodayCalls가 한다). */
export function restoreQueueItem(data: CrmPriorityQueue | null, item: CrmPriorityItem): CrmPriorityQueue | null {
  if (!data) return data
  if (data.items.some((existing) => existing.id === item.id)) return data
  return { ...data, items: [...data.items, item] }
}

/**
 * '내일로'·'종료'를 되돌릴 때 PATCH할 이전 값. 큐 항목은 리드 원본을 갖고 있지 않아
 * 카드에 남은 파생 필드로 복원한다:
 *  - status: statusLabel은 lead.status === "new" 일 때만 "신규 리드"(priority.ts) → 그 외는 contacted.
 *    (converted/closed 리드는 큐에 오지 않는다.)
 *  - follow_up_at: dueAt은 follow_up_at이되 데모 일정이 있으면 demo.date로 덮이고, updatedAt은
 *    `follow_up_at ?? timestamp` 다. dueAt이 없으면 follow_up_at도 없던 것이고, 있으면 updatedAt이
 *    원래 follow_up_at(데모 덮어쓰기 이전 값)을 더 정확히 보존한다. 단 "follow_up_at 없음 + 데모
 *    있음"인 리드는 updatedAt이 유입 시각이라 그 시각이 팔로업으로 남는다 — 되돌리기 문구로
 *    리드 보드 확인을 권한다.
 */
export function previousLeadScheduleForUndo(item: CrmPriorityItem): {
  status: "new" | "contacted"
  followUpAt: string | null
} {
  const status = item.statusLabel === "신규 리드" ? "new" : "contacted"
  const followUpAt = item.dueAt == null ? null : (item.updatedAt ?? item.dueAt)
  return { status, followUpAt }
}

/** 화면에 그리는 카드 목록(미리보기 + 펼친 다음 후보). 포커스 이동 계산과 렌더가 같은 규칙을 쓴다. */
export function computeVisibleCalls(items: CrmPriorityItem[], cardCount: number, showMore: boolean): TodayCall[] {
  const { calls, overflow } = pickTodayCalls(items, { limit: cardCount })
  return showMore ? [...calls, ...overflow.slice(0, cardCount)] : calls
}

/**
 * 카드가 빠진 뒤 포커스를 옮길 카드 id — 같은 자리(승격된 다음 후보 포함), 없으면 앞 카드,
 * 그것도 없으면 null(섹션 heading으로).
 */
export function focusTargetAfterRemoval(
  items: CrmPriorityItem[],
  removedId: string,
  cardCount: number,
  showMore: boolean
): string | null {
  const before = computeVisibleCalls(items, cardCount, showMore)
  const index = before.findIndex((call) => call.item.id === removedId)
  const after = computeVisibleCalls(
    items.filter((item) => item.id !== removedId),
    cardCount,
    showMore
  )
  if (after.length === 0) return null
  const at = index < 0 ? 0 : Math.min(index, after.length - 1)
  return after[at]?.item.id ?? null
}

const DEFAULT_DRAFT: Omit<LeadContactDraft, "itemId"> = { type: "call", result: "answered", notes: "", nextSchedule: "keep" }

/** 작성 중 입력이 있는가 — 기본값에서 하나라도 바뀌었으면 닫기 전에 묻는다(UX 규약 1). */
export function isContactDraftDirty(draft: LeadContactDraft | null) {
  if (!draft) return false
  return (
    draft.notes.trim() !== "" ||
    draft.type !== DEFAULT_DRAFT.type ||
    draft.result !== DEFAULT_DRAFT.result ||
    draft.nextSchedule !== DEFAULT_DRAFT.nextSchedule
  )
}

interface QueueNotice {
  tone: "success" | "warning"
  message: string
  undo?: { run: () => Promise<void> }
}

interface QueueError {
  message: string
  retry?: () => void
}

/**
 * CrmPriorityQueuePanel의 Suspense fallback(호출부: CrmHomeClient.tsx) — 이 컴포넌트가
 * use()로 서버 레인을 직접 소비하게 되면서(2026-09-10 스트리밍 전환), 레인이 settle되기
 * 전(극히 짧은 창 — owner 필터가 없는 한 대부분 SSR 스트림 안에서 곧장 끝난다) 상위
 * <Suspense>가 이 fallback을 보여준다. "새 로딩 UI를 발명하지 마라"는 이번 작업 지시에
 * 따라, 실제 패널이 loading && !data일 때 쓰는 것과 같은 크롬(제목)·스켈레톤 행 모양을
 * 그대로 재사용한다 — 값이 오면(대부분의 경우) 바로 이 자리에서 진짜 패널로 교체된다.
 */
export function CrmPriorityQueuePanelSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`rounded-xl border border-[#e8e8e4] bg-white p-4 ${compact ? "" : "mb-4"}`} aria-hidden>
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">
          ClassIn Operation
        </p>
        <h2 className="mt-1 text-[18px] font-bold text-[#111110]">오늘 전화할 고객</h2>
      </div>
      <div className="divide-y divide-[#f0f0ec] overflow-hidden border-y border-[#f0f0ec]">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={`sk-${index}`} className="flex items-center gap-3 p-3">
            <div className="h-5 w-16 animate-pulse rounded-full bg-[#f0f0ec]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-4 w-1/3 animate-pulse rounded bg-[#f0f0ec]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[#f5f5f2]" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function CrmPriorityQueuePanel({
  refreshKey = 0,
  compact = false,
  embedded = false,
  previewCount = QUEUE_PREVIEW_COUNT,
  initialData = null,
}: {
  refreshKey?: number
  compact?: boolean
  embedded?: boolean
  /** 처음 그릴 카드 수(=쿼터 믹스 총량). "다음 후보"는 같은 응답 안에서 펼친다. */
  previewCount?: number
  /**
   * CRM 홈 서버 프리페치 레인(담당 전체 기준, openPrefetchLane) — 있으면 로딩 스켈레톤·
   * 첫 네트워크 왕복을 건너뛴다(2026-09-07 감사 #7, 홈 첫 로드 팬아웃 축소). URL에 담당자
   * 필터(?owner=)가 이미 걸려 있으면 프리페치와 범위가 달라 쓰지 않는다.
   *
   * 2026-09-10 스트리밍 전환: 값이 아니라 {promise, generatedAt} 레인이 온다 — 이 컴포넌트가
   * React use()로 직접 풀어 소비한다(이 패널은 CRM 홈에 단 한 곳에서만 쓰여, 값을 여러
   * 자리에 나눠 먹이는 다리 컴포넌트가 필요 없다). 호출부(CrmHomeClient)는 이 컴포넌트를
   * <Suspense fallback={...}>로 감싸야 한다 — use()가 pending 프라미스를 만나면 그 상위
   * 경계까지 던진다.
   */
  initialData?: DeferredPrefetch<CrmPriorityQueue> | null
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [showMore, setShowMore] = useState(false)
  // 담당자 필터 → URL(?owner=) 착지 복원. 2026-08-06 감사 지적(필터가 새로고침·공유
  // 링크에서 유실) 최소 대응 — CrmUnifiedCustomersClient의 syncViewParam과 같은 패턴.
  const initialOwner = searchParams.get("owner")?.trim() ?? ""
  const [owner, setOwnerState] = useState(initialOwner)
  // 서버 프리페치는 owner 필터가 없을 때만 유효하다 — 필터가 이미 걸려 있으면 범위가 달라
  // 그 레인을 쓰지 않는다. use()는 조건부로 호출할 수 없으므로(hooks 규칙), "안 쓴다"는
  // 판단을 promise 자체를 이미 resolve된 값(RESOLVED_NULL_PROMISE)으로 바꿔 표현한다.
  // `initialData != null`을 조건식 안에 직접 써서 TypeScript가 참 분기에서 initialData를
  // non-null로 좁히게 한다(단언 없이).
  const prefetchPromise = !initialOwner && initialData != null ? initialData.promise : RESOLVED_NULL_PROMISE
  // use()는 이 promise가 settle될 때까지 컴포넌트 렌더를 서스펜드한다 — 그 뒤로는 항상
  // 동기 값처럼 즉시 반환된다. 덕분에 아래 useState들은 "나중에 도착할 수도 있는 값"이
  // 아니라 "이미 확정된 값"으로 초기화된다(예전 hasUsableInitialData/skippedInitialLoadRef
  // 조합이 풀어야 했던 "언제 도착할지 모른다" 문제 자체가 사라졌다).
  const prefetchSeed = use(prefetchPromise)
  const [data, setData] = useState<CrmPriorityQueue | null>(prefetchSeed)
  const [loading, setLoading] = useState(!prefetchSeed)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<QueueError | null>(null)
  // 백그라운드 재검증 실패는 처리 실패와 톤을 나눈다(warning) — 화면의 목록이 처리 전 기준일 수 있다는 참고.
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<QueueNotice | null>(null)
  const [undoPending, setUndoPending] = useState(false)
  // 항상 마운트된 SR 통지 영역(UX 규약 7) — 배너는 조건부 마운트라 첫 등장이 읽히지 않을 수 있다.
  const [liveMessage, setLiveMessage] = useState("")
  const [leadContactDraft, setLeadContactDraft] = useState<LeadContactDraft | null>(null)
  // 작성 중 입력을 버리기 전 확인('계속 작성 / 버리고 닫기'). onDiscard가 실제 전환을 수행한다.
  const [discardPrompt, setDiscardPrompt] = useState<{ itemId: string; onDiscard: () => void } | null>(null)
  // '종료' 인라인 확인 행이 열린 카드. 같은 카드의 '연락 결과' 초안과는 상호 배타다(둘 다 열리면
  // 어떤 처리가 진행 중인지 알 수 없고 Escape가 서로 다른 폼만 닫는다) — 한쪽을 열면 다른 쪽을 닫는다.
  const [closeConfirmId, setCloseConfirmId] = useState<string | null>(null)
  // 연락 기록(POST)은 남았지만 다음 일정 PATCH만 실패해 카드를 되살린 건 — 서버 스냅샷이 아직
  // 옛 상태를 돌려줄 수 있어, 카드에 "기록은 저장됨" 표식을 얹어 같은 결과를 다시 저장하지 않게 한다.
  // 값은 저장 시각. 일정 재시도 성공·다른 처리로 카드가 빠지거나 헤더 새로고침(force)이면 지운다.
  const [contactLoggedAt, setContactLoggedAt] = useState<Map<string, string>>(() => new Map())
  const { owners: crmOwners, currentOwner, health: ownerHealth } = useCrmOwners()

  const suppressedRef = useRef(new Map<string, number>())
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const closeTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const closeCancelRef = useRef<HTMLButtonElement | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ itemId: string | null; seq: number } | null>(null)

  const lastOwnerParamRef = useRef<string | null>(searchParams.get("owner"))
  useEffect(() => {
    const param = searchParams.get("owner")
    if (param === lastOwnerParamRef.current) return
    lastOwnerParamRef.current = param
    setOwnerState(param?.trim() ?? "")
  }, [searchParams])

  const setOwner = useCallback(
    (next: string) => {
      setOwnerState(next)
      lastOwnerParamRef.current = next || null
      const params = new URLSearchParams(Array.from(searchParams.entries()))
      if (next) params.set("owner", next)
      else params.delete("owner")
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const cardCount = compact ? Math.min(previewCount, 4) : previewCount
  const url = useMemo(() => queueUrl(owner, QUEUE_POOL_LIMIT), [owner])
  const ownerOptions = useMemo(() => buildOwnerSelectOptions(data?.owners, crmOwners), [crmOwners, data?.owners])

  // 낙관 제거한 카드를 서버 응답에서 걸러낸다(QUEUE_SUPPRESS_MS 참고).
  const withoutSuppressed = useCallback((next: CrmPriorityQueue | null) => {
    if (!next) return next
    const map = suppressedRef.current
    if (map.size === 0) return next
    const now = Date.now()
    for (const [id, until] of map) if (until <= now) map.delete(id)
    if (map.size === 0) return next
    return { ...next, items: next.items.filter((item) => !map.has(item.id)) }
  }, [])
  const suppress = useCallback((itemId: string) => {
    suppressedRef.current.set(itemId, Date.now() + QUEUE_SUPPRESS_MS)
  }, [])
  const unsuppress = useCallback((itemId: string) => {
    suppressedRef.current.delete(itemId)
  }, [])

  // 필터를 연타하면 요청이 겹친다. 늦게 끝난 이전 요청이 최신 화면을 덮어쓰지 않게
  // 마지막 요청만 상태에 반영한다.
  const requestSeq = useRef(0)

  const load = useCallback(
    async (options?: { force?: boolean; background?: boolean }) => {
      const seq = ++requestSeq.current
      const isLatest = () => requestSeq.current === seq
      const force = Boolean(options?.force)
      // background: 쓰기 성공 뒤 재검증 — 화면의 목록·오류 배너를 건드리지 않고 조용히 받아와
      // 도착한 값만 반영한다(force 없음: 서버 스냅샷 SWR을 그대로 탄다).
      const background = Boolean(options?.background) && !force

      if (force) {
        suppressedRef.current.clear()
        // 서버가 전량 재수집하므로 "기록은 저장됨" 표식도 서버 값에 맡긴다.
        setContactLoggedAt((current) => (current.size === 0 ? current : new Map()))
      }
      if (!background) {
        const cached = getCachedAdminJson<CrmPriorityQueue>(url, { cacheKey: url })
        if (cached && !force) setData(withoutSuppressed(cached))
        // 담당자 필터가 바뀌어 새 URL 캐시가 없으면 이전 큐를 남기지 않는다.
        else if (!force) setData(null)
        setLoading(!cached)
        setError(null)
      }
      setRefreshing(force)
      setRefreshWarning(null)
      try {
        const next = await adminFetchJsonCached<CrmPriorityQueue>(
          force ? `${url}&force=1` : url,
          undefined,
          {
            cacheKey: url,
            ttlMs: QUEUE_TTL_MS,
            staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
            force,
            // 캐시를 즉시 보여준 회차의 백그라운드 갱신 결과를 화면에 반영한다.
            // 이 통로가 없으면 SWR 창 길이만큼 낡은 큐를 들고 있게 된다.
            onRevalidated: ({ data: fresh }) => {
              if (fresh && isLatest()) setData(withoutSuppressed(fresh))
            },
          }
        )
        if (!isLatest()) return
        setData(withoutSuppressed(next))
      } catch (err) {
        if (!isLatest()) return
        const detail = err instanceof Error ? err.message : "오늘 전화 목록을 불러오지 못했습니다."
        if (background) {
          setRefreshWarning(`목록 갱신에 실패했습니다(${detail}). 표시된 목록은 처리 전 기준일 수 있습니다.`)
        } else {
          setError({ message: detail, retry: () => void load({ force: true }) })
        }
      } finally {
        if (isLatest()) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [url, withoutSuppressed]
  )

  // 홈 새로고침(refreshKey 증가)은 "지금 다시 세어 달라"는 뜻이다. force 없이 load()만
  // 다시 부르면 90초 TTL 캐시가 그대로 돌아와 화면이 아무것도 바뀌지 않는다.
  const lastRefreshKey = useRef(refreshKey)
  // 서버 프리페치가 이번 마운트의 데이터를 이미 줬으면 최초 1회는 재요청을 건너뛴다 —
  // initialData를 prop으로만 받고 그래도 load()를 부르면 팬아웃이 그대로다(2026-09-07 감사
  // #7). use()가 이미 이 렌더 이전에 prefetchSeed를 확정지어 주므로(위 참고), "나중에
  // 도착할 수도 있다"는 경우가 없어져 hasUsableInitialData 같은 별도 플래그 없이
  // prefetchSeed 자체의 진위만 보면 된다. 담당자 필터 변경·강제 새로고침 등 이후의 정상적인
  // load()는 그대로 동작한다.
  const didInitialLoadRef = useRef(false)
  useEffect(() => {
    const forced = lastRefreshKey.current !== refreshKey
    lastRefreshKey.current = refreshKey
    if (!didInitialLoadRef.current) {
      didInitialLoadRef.current = true
      if (!forced && prefetchSeed) {
        // 이 마운트의 요청 캐시에도 심어 둔다 — prop은 이 렌더에만 존재하므로, 심어 두지
        // 않으면 다른 탭에 갔다가 돌아왔을 때(이 컴포넌트가 다시 마운트될 때) 같은 데이터를
        // 또 네트워크로 받아온다(홈의 다른 세 소스와 같은 이유, CrmHomeClient 참고).
        seedAdminRequestCache(url, prefetchSeed, {
          ttlMs: QUEUE_TTL_MS,
          staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
          generatedAt: initialData?.generatedAt,
        })
        return
      }
      void load(forced ? { force: true } : undefined)
      return
    }
    void load(forced ? { force: true } : undefined)
  }, [load, refreshKey, prefetchSeed, url, initialData])

  // 배너 타이머 정리.
  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
  }, [])

  // 처리 뒤 포커스 이동 — 카드가 사라진 자리의 다음 카드 첫 액션, 없으면 섹션 heading(tabIndex=-1).
  useEffect(() => {
    if (!focusRequest) return
    const card = focusRequest.itemId ? cardRefs.current.get(focusRequest.itemId) : null
    const target =
      card?.querySelector<HTMLElement>("button:not([disabled]), a[href]") ?? headingRef.current ?? listRef.current
    target?.focus()
  }, [focusRequest])

  // 인라인 종료 확인이 열리면 '취소'에 포커스(Enter 오탭으로 종료되지 않게), 닫히면 트리거로 복귀.
  const prevCloseConfirmRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevCloseConfirmRef.current
    prevCloseConfirmRef.current = closeConfirmId
    if (closeConfirmId) {
      closeCancelRef.current?.focus()
    } else if (prev) {
      closeTriggerRefs.current.get(prev)?.focus()
    }
  }, [closeConfirmId])

  const announce = useCallback((text: string) => setLiveMessage(text), [])
  const requestFocus = useCallback((itemId: string | null) => {
    setFocusRequest((prev) => ({ itemId, seq: (prev?.seq ?? 0) + 1 }))
  }, [])
  const markContactLogged = useCallback((itemId: string, at: string) => {
    setContactLoggedAt((current) => new Map(current).set(itemId, at))
  }, [])
  const clearContactLogged = useCallback((itemId: string) => {
    setContactLoggedAt((current) => {
      if (!current.has(itemId)) return current
      const next = new Map(current)
      next.delete(itemId)
      return next
    })
  }, [])

  const showNotice = useCallback((next: QueueNotice) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    setNotice(next)
    if (next.undo) {
      // 되돌리기 창이 닫히면 버튼만 거둔다 — 성공 문구는 다음 처리·닫기 전까지 남긴다.
      noticeTimerRef.current = setTimeout(() => {
        setNotice((current) => (current === next ? { tone: next.tone, message: next.message } : current))
      }, QUEUE_UNDO_WINDOW_MS)
    }
  }, [])

  const { calls, overflow, totals, meta } = useMemo(
    () => pickTodayCalls(data?.items ?? [], { limit: cardCount }),
    [data, cardCount]
  )
  const visibleCalls = useMemo(
    () => (showMore ? [...calls, ...overflow.slice(0, cardCount)] : calls),
    [calls, overflow, showMore, cardCount]
  )
  const slotSummary = TODAY_CALL_SLOTS.map((slot) => `${slot.label} ${slot.quota}`).join(" · ")

  // 작성 중인 연락 결과를 버리는 전환은 먼저 묻는다(UX 규약 1). proceed가 실제 전환을 수행한다.
  const guardDraft = useCallback(
    (proceed: () => void) => {
      if (leadContactDraft && isContactDraftDirty(leadContactDraft)) {
        setDiscardPrompt({ itemId: leadContactDraft.itemId, onDiscard: proceed })
        return
      }
      proceed()
    },
    [leadContactDraft]
  )
  // 폼 열기·닫기·다른 카드로 전환 — 필드 편집은 setLeadContactDraft를 직접 쓴다.
  const changeDraft = useCallback(
    (next: LeadContactDraft | null) => {
      guardDraft(() => {
        setDiscardPrompt(null)
        setLeadContactDraft(next)
        // 같은 카드에 '종료' 확인이 열려 있으면 닫는다(두 폼 상호 배타).
        if (next) setCloseConfirmId((current) => (current === next.itemId ? null : current))
      })
    },
    [guardDraft]
  )
  // '종료' 확인 행 토글 — 같은 카드의 연락 결과 초안은 닫는다(dirty면 guardDraft가 먼저 묻는다).
  const toggleCloseConfirm = useCallback(
    (itemId: string) => {
      guardDraft(() => {
        setDiscardPrompt(null)
        setLeadContactDraft((current) => (current?.itemId === itemId ? null : current))
        setCloseConfirmId((current) => (current === itemId ? null : itemId))
      })
    },
    [guardDraft]
  )

  const undoLeadPatch = useCallback(
    async (item: CrmPriorityItem, body: Record<string, string | null>, doneMessage: string) => {
      const leadId = leadIdFromPriorityItem(item)
      if (!leadId) return
      setUndoPending(true)
      try {
        await adminFetchJsonCached<{ lead: unknown }>(`/api/admin/leads/${encodeURIComponent(leadId)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        })
        unsuppress(item.id)
        setData((prev) => restoreQueueItem(prev, item))
        showNotice({ tone: "success", message: doneMessage })
        announce(doneMessage)
        requestFocus(item.id)
        void load({ background: true })
      } catch (err) {
        setError({
          message: `되돌리기에 실패했습니다(${errorDetail(err)}). 리드 보드에서 상태를 확인하세요.`,
          retry: () => void undoLeadPatch(item, body, doneMessage),
        })
      } finally {
        setUndoPending(false)
      }
    },
    [announce, load, requestFocus, showNotice, unsuppress]
  )

  const handleLeadAction = useCallback(
    async (item: CrmPriorityItem, action: "snooze" | "close") => {
      const leadId = leadIdFromPriorityItem(item)
      if (!leadId) return
      const items = data?.items ?? []
      const nextFocusId = focusTargetAfterRemoval(items, item.id, cardCount, showMore)
      const previous = previousLeadScheduleForUndo(item)
      const body =
        action === "close"
          ? { status: "closed", follow_up_at: null }
          : // 미루기는 실제 연락 결과가 아니다. 상태와 연락 로그는 건드리지 않는다.
            { follow_up_at: tomorrowMorningIso() }
      const actionLabel = action === "close" ? "종료" : "내일로 미루기"

      setActingId(`${item.id}:${action}`)
      setNotice(null)
      setError(null)
      setCloseConfirmId(null)
      const result = await runOptimistic<CrmPriorityQueue | null>({
        snapshot: () => data,
        apply: () => {
          suppress(item.id)
          setData((prev) => removeQueueItem(prev, item.id))
          setLeadContactDraft((current) => (current?.itemId === item.id ? null : current))
          setDiscardPrompt(null)
          clearContactLogged(item.id)
        },
        commit: () =>
          adminFetchJsonCached<{ lead: unknown }>(`/api/admin/leads/${encodeURIComponent(leadId)}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          }),
        rollback: (saved) => {
          unsuppress(item.id)
          setData((current) => restoreQueueItem(current ?? saved, item))
        },
        onError: (err) => {
          const message = `'${item.title}' ${actionLabel} 처리에 실패했습니다(${errorDetail(err)}). 카드를 다시 목록에 두었습니다.`
          setError({ message, retry: () => void handleLeadAction(item, action) })
          announce(message)
        },
      })
      setActingId(null)
      if (!result.ok) {
        requestFocus(item.id)
        return
      }

      if (action === "close") {
        const message = `'${item.title}' 리드를 종료 처리해 오늘 전화 목록에서 제외했습니다.`
        showNotice({
          tone: "success",
          message,
          undo: {
            run: () =>
              undoLeadPatch(
                item,
                { status: previous.status, follow_up_at: previous.followUpAt },
                `'${item.title}' 종료를 되돌렸습니다 — 카드가 다시 목록에 있습니다.`
              ),
          },
        })
        announce(`${message} 다음 카드로 이동합니다.`)
      } else {
        const message = `'${item.title}' 리드를 연락 결과 없이 내일 오전 9시 팔로업으로 옮겼습니다.`
        showNotice({
          tone: "success",
          message,
          undo: {
            run: () =>
              undoLeadPatch(
                item,
                { follow_up_at: previous.followUpAt },
                `'${item.title}' 팔로업 일정을 이전 값(${previous.followUpAt ? formatDate(previous.followUpAt) : "없음"})으로 되돌렸습니다.`
              ),
          },
        })
        announce(`${message} 다음 카드로 이동합니다.`)
      }
      requestFocus(nextFocusId)
      void load({ background: true })
    },
    [announce, cardCount, clearContactLogged, data, load, requestFocus, showMore, showNotice, suppress, undoLeadPatch, unsuppress]
  )

  // 연락 기록은 남았는데 일정 PATCH만 실패한 경우의 재시도 — 로그를 다시 만들지 않는다.
  const retryFollowUpPatch = useCallback(
    async (item: CrmPriorityItem, patch: { follow_up_at?: string | null }) => {
      const leadId = leadIdFromPriorityItem(item)
      if (!leadId || !("follow_up_at" in patch)) return
      setActingId(`${item.id}:contact`)
      setError(null)
      try {
        await adminFetchJsonCached<{ lead: unknown }>(`/api/admin/leads/${encodeURIComponent(leadId)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        })
        suppress(item.id)
        setData((prev) => removeQueueItem(prev, item.id))
        clearContactLogged(item.id)
        const message = `'${item.title}' 다음 일정을 반영했습니다.`
        showNotice({ tone: "success", message })
        announce(message)
        void load({ background: true })
      } catch (err) {
        setError({
          message: `다음 일정 반영에 다시 실패했습니다(${errorDetail(err)}). 리드 보드에서 일정을 확인하세요.`,
          retry: () => void retryFollowUpPatch(item, patch),
        })
      } finally {
        setActingId(null)
      }
    },
    [announce, clearContactLogged, load, showNotice, suppress]
  )

  const saveLeadContactResult = useCallback(
    async (item: CrmPriorityItem, draftOverride?: LeadContactDraft) => {
      const leadId = leadIdFromPriorityItem(item)
      const draft = draftOverride ?? leadContactDraft
      if (!leadId || !draft || draft.itemId !== item.id) return
      // 다음 일정을 바꾸면(내일·비우기) 리드가 오늘 목록을 떠나는 게 확정이라 카드를 낙관 제거한다.
      // '기존 일정 유지'는 서버가 오늘 다시 뽑을 수 있어 카드를 두고 폼만 닫는다(재검증이 문구를 갱신).
      const removesCard = draft.nextSchedule !== "keep"
      const items = data?.items ?? []
      const nextFocusId = removesCard ? focusTargetAfterRemoval(items, item.id, cardCount, showMore) : item.id
      const patch: { follow_up_at?: string | null } = {}
      if (draft.nextSchedule === "tomorrow") patch.follow_up_at = tomorrowMorningIso()
      if (draft.nextSchedule === "clear") patch.follow_up_at = null
      const leadUrl = `/api/admin/leads/${encodeURIComponent(leadId)}`

      setActingId(`${item.id}:contact`)
      setNotice(null)
      setError(null)
      // 로그 POST가 연락중 상태까지 한 계약으로 맞춘다. 다음 일정만 별도 PATCH이며,
      // 그 부분 실패에서는 저장된 기록을 다시 입력하지 않도록 폼을 닫고 범위를 밝힌다.
      let logSaved = false
      let warning: string | undefined
      const result = await runOptimistic<CrmPriorityQueue | null>({
        snapshot: () => data,
        apply: () => {
          setLeadContactDraft(null)
          setDiscardPrompt(null)
          if (removesCard) {
            suppress(item.id)
            setData((prev) => removeQueueItem(prev, item.id))
          }
        },
        commit: async () => {
          const contactResult = await adminFetchJsonCached<{
            log: unknown
            statusSync: "updated" | "unchanged" | "failed"
            warning?: string
          }>(`${leadUrl}/logs`, {
            method: "POST",
            body: JSON.stringify({
              type: draft.type,
              result: draft.result,
              notes: draft.notes.trim() || undefined,
            }),
          })
          logSaved = true
          warning = contactResult.warning
          if ("follow_up_at" in patch) {
            await adminFetchJsonCached<{ lead: unknown }>(leadUrl, { method: "PATCH", body: JSON.stringify(patch) })
          }
        },
        rollback: (saved) => {
          if (removesCard) {
            unsuppress(item.id)
            setData((current) => restoreQueueItem(current ?? saved, item))
          }
          // 기록이 안 남았을 때만 입력을 되살린다 — 남았으면 재입력(중복 기록)을 막는다.
          if (!logSaved) setLeadContactDraft(draft)
        },
        onError: (err) => {
          const detail = errorDetail(err)
          if (logSaved) {
            const message = `연락 기록·상태는 저장됐지만 다음 일정 반영에 실패했습니다(${detail}). 일정만 다시 시도하거나 리드 보드에서 확인하세요.`
            setError({ message, retry: () => void retryFollowUpPatch(item, patch) })
            announce(message)
            // 되살린 카드는 로그 저장 전 원본이다(상태·근거 문구가 옛 값). 방금 남긴 기록을 다시
            // 입력하지 않도록 카드에 표식을 얹고, 서버 반영분(상태·reason)은 백그라운드 재검증으로 당긴다.
            markContactLogged(item.id, new Date().toISOString())
            void load({ background: true })
          } else {
            setError({
              message: `연락 기록을 저장하지 못했습니다(${detail}). 입력은 그대로 두었으니 다시 시도하세요.`,
              retry: () => void saveLeadContactResult(item, draft),
            })
          }
        },
      })
      setActingId(null)
      if (!result.ok) {
        requestFocus(item.id)
        return
      }
      const message = warning ?? `'${item.title}' 연락 기록을 저장했습니다.`
      showNotice({ tone: warning ? "warning" : "success", message })
      announce(removesCard ? `${message} 다음 카드로 이동합니다.` : message)
      requestFocus(nextFocusId)
      void load({ background: true })
    },
    [announce, cardCount, data, leadContactDraft, load, markContactLogged, requestFocus, retryFollowUpPatch, showMore, showNotice, suppress, unsuppress]
  )

  const isActing = (item: CrmPriorityItem) => actingId?.startsWith(`${item.id}:`) === true

  return (
    <section className={embedded ? "" : `rounded-xl border border-[#e8e8e4] bg-white p-4 ${compact ? "" : "mb-4"}`}>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {embedded ? null : (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">
              ClassIn Operation
            </p>
            <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-[18px] font-bold text-[#111110] outline-none">
              오늘 전화할 {calls.length > 0 ? `${calls.length}건` : "고객"}
            </h2>
            <p className={`mt-0.5 text-[11px] leading-relaxed ${SECONDARY_TEXT_CLASS}`}>
              {slotSummary} 믹스 · 처리하면 다음 후보가 올라옵니다
              {/* 캐시로 뜨는 목록이라 "지금 상태"인지 아닌지를 화면에서 알 수 있어야 한다. */}
              {data?.generatedAt ? ` · 기준 ${formatDate(data.generatedAt)}` : ""}
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className={`flex h-9 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] ${SECONDARY_TEXT_CLASS}`}>
            <Filter className="h-3.5 w-3.5" />
            <select
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
              className="h-full min-w-[112px] bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
              aria-label="담당자 필터"
            >
              <option value="">담당 전체</option>
              {currentOwner ? (
                <option value={CURRENT_OWNER_VALUE}>내 담당 · {currentOwner.displayName}</option>
              ) : null}
              {ownerOptions.map((option) => (
                <option key={option.ownerName} value={option.ownerName}>
                  {option.label}
                  {option.teamRoleLabel ? ` · ${option.teamRoleLabel}` : ""}
                  {option.count > 0 ? ` (${option.count})` : ""}
                </option>
              ))}
            </select>
          </label>
          {/* force 재조회는 이 명시 새로고침 버튼에만 남긴다(UX 규약 2). */}
          <button
            type="button"
            onClick={() => void load({ force: true })}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
            disabled={refreshing}
            aria-busy={refreshing || undefined}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>
      </div>

      {/* 항상 마운트된 SR 통지 영역 — 카드가 사라지는 처리·되돌리기·실패를 읽어 준다. */}
      <p role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {/*
        Compass 실측 데모 중 우리 리드/계정 전화로 붙지 않은 건 — 조용히 버리면
        "데모가 없다"로 오인되므로 건수를 그대로 드러낸다. 연결이 끊긴 것과 데모가
        없는 것도 구분해서 말한다.
      */}
      {data?.summary.demo?.down ? (
        <CrmNoticeBanner
          tone="warning"
          className="mb-3"
          message="Compass 연결이 끊겨 데모 신호가 빠졌습니다 — 데모가 없는 것이 아니라 확인할 수 없는 상태입니다."
        />
      ) : data?.summary.demo && data.summary.demo.unmatched > 0 ? (
        <div className={`mb-3 flex items-start gap-2 border-l-2 border-[#A39E98] px-3 py-2 text-[12px] ${SECONDARY_TEXT_CLASS}`}>
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Compass 데모 {data.summary.demo.total}건 중 {data.summary.demo.unmatched}건은 전화가
            일치하는 리드·고객이 없어 우선순위에 반영되지 않았습니다.
          </span>
        </div>
      ) : null}

      {ownerHealth?.ok === false && ownerHealth.message ? (
        <CrmNoticeBanner tone="warning" className="mb-3" message={ownerHealth.message} />
      ) : null}

      {error ? (
        <CrmNoticeBanner
          tone="danger"
          className="mb-3"
          message={error.message}
          action={error.retry ? { label: "다시 시도", onClick: error.retry, pending: actingId != null || refreshing } : undefined}
          onDismiss={() => setError(null)}
        />
      ) : null}

      {refreshWarning ? (
        <CrmNoticeBanner
          tone="warning"
          className="mb-3"
          message={refreshWarning}
          action={{ label: "다시 시도", onClick: () => void load({ force: true }), pending: refreshing }}
          onDismiss={() => setRefreshWarning(null)}
        />
      ) : null}

      {notice ? (
        <CrmNoticeBanner
          tone={notice.tone}
          className="mb-3"
          message={notice.message}
          action={notice.undo ? { label: "되돌리기", onClick: () => void notice.undo?.run(), pending: undoPending } : undefined}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      {data?.sources.warnings.length ? (
        <CrmNoticeBanner tone="warning" className="mb-3" message={data.sources.warnings.join(" ")} />
      ) : null}

      <div ref={listRef} tabIndex={-1} className="overflow-hidden border-y border-[#f0f0ec] outline-none">
        {loading && !data ? (
          <div className="divide-y divide-[#f0f0ec]" aria-hidden>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`sk-${index}`} className="flex items-center gap-3 p-3">
                <div className="h-5 w-16 animate-pulse rounded-full bg-[#f0f0ec]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-[#f0f0ec]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[#f5f5f2]" />
                </div>
              </div>
            ))}
          </div>
        ) : data && visibleCalls.length > 0 ? (
          <div className="divide-y divide-[#f0f0ec]">
            {visibleCalls.map((call: TodayCall) => {
              const item = call.item
              const acting = isActing(item)
              const draftOpen = item.source === "lead" && leadContactDraft?.itemId === item.id
              const closeOpen = closeConfirmId === item.id
              const draftFormId = `queue-contact-${item.id}`
              const closeFormId = `queue-close-${item.id}`
              const loggedAt = contactLoggedAt.get(item.id)
              return (
                <div
                  key={item.id}
                  ref={(node) => {
                    if (node) cardRefs.current.set(item.id, node)
                    else cardRefs.current.delete(item.id)
                  }}
                  data-queue-card={item.id}
                  className={`grid gap-2.5 border-l-2 p-3 transition-colors hover:bg-[#fafaf8] lg:grid-cols-[minmax(0,1fr)_150px_auto] ${severityBorderClass(item)}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[11px] font-semibold ${SLOT_CHIP_CLASS[call.slot]}`}>
                        {call.slotLabel}
                      </span>
                      <Link href={item.href} className="group inline-flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[14px] font-bold text-[#111110]">{item.title}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/25 group-hover:text-[#111110]" />
                      </Link>
                      {item.subtitle ? (
                        <span className={`truncate text-[12px] ${SECONDARY_TEXT_CLASS}`}>{item.subtitle}</span>
                      ) : null}
                      {call.groupedCount > 0 ? (
                        <span className={`shrink-0 rounded-md bg-[#f0f0ec] px-1.5 py-0.5 text-[10px] font-semibold ${SECONDARY_TEXT_CLASS}`}>
                          같은 기관 +{call.groupedCount}건
                        </span>
                      ) : null}
                    </div>
                    {/* 왜 오늘 이 사람인가 — 점수 숫자 대신 근거 문장이 카드의 중심이다. */}
                    <p className="mt-1 text-[13px] font-semibold text-[#111110]">{item.reason}</p>
                    <p className={`mt-0.5 text-[11px] font-medium ${SECONDARY_TEXT_CLASS}`}>
                      {item.actionLabel} · {item.statusLabel}
                    </p>
                    {/* 기록은 남았는데 일정만 못 바꾼 카드 — 미처리 카드처럼 보여 같은 결과를 다시 저장하지 않게 한다. */}
                    {loggedAt ? (
                      <p
                        className={`mt-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE_CLASS.warning}`}
                      >
                        <CheckCircle2 className="h-3 w-3" aria-hidden />
                        연락 기록 저장됨 {formatDate(loggedAt)} · 다음 일정만 미반영
                      </p>
                    ) : null}
                  </div>
                  <div className="lg:pt-0.5">
                    <p className={`text-[11px] font-semibold ${SECONDARY_TEXT_CLASS}`}>담당·기준일</p>
                    <p className="mt-1 truncate text-[12px] font-medium text-[#111110]">{item.ownerName ?? "미배정"}</p>
                    <p className={`text-[11px] ${SECONDARY_TEXT_CLASS}`}>{formatDate(item.dueAt ?? item.updatedAt)}</p>
                  </div>
                  {/* 파괴적 '종료'는 인접 버튼과 gap-3 이상 떨어뜨린다(UX 규약 5). 44px 터치 타깃은 홈 루트가 강제한다. */}
                  <div className="flex flex-wrap items-start gap-3 lg:justify-end">
                    <div className="flex flex-wrap items-start gap-1.5">
                      {/* 큐는 source=customer(리드 + ClassIn 고객)로만 조회한다 — task 항목은 오지 않으므로
                          할 일 액션 분기는 두지 않는다(할 일은 CrmWeekAheadPanel이 담당). */}
                      {item.source === "lead" ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              changeDraft(draftOpen ? null : { itemId: item.id, ...DEFAULT_DRAFT })
                            }
                            aria-expanded={draftOpen}
                            // 접혀 있을 때는 form이 DOM에 없어 존재하지 않는 id를 가리키게 된다 — 열려 있을 때만 연결한다.
                            aria-controls={draftOpen ? draftFormId : undefined}
                            disabled={acting}
                            aria-busy={acting || undefined}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold text-[#084734] transition-colors hover:border-[#084734] disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            연락 결과
                          </button>
                          <button
                            type="button"
                            onClick={() => guardDraft(() => void handleLeadAction(item, "snooze"))}
                            disabled={acting}
                            aria-busy={acting || undefined}
                            className={`inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] disabled:opacity-50 ${INTERACTIVE_TEXT_CLASS}`}
                          >
                            <Clock3 className="h-3 w-3" />
                            {actingId === `${item.id}:snooze` ? "옮기는 중" : "내일로"}
                          </button>
                        </>
                      ) : null}
                      <Link
                        href={item.href}
                        className={`inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] ${INTERACTIVE_TEXT_CLASS}`}
                      >
                        열기
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                    {item.source === "lead" ? (
                      <button
                        type="button"
                        ref={(node) => {
                          if (node) closeTriggerRefs.current.set(item.id, node)
                          else closeTriggerRefs.current.delete(item.id)
                        }}
                        onClick={() => toggleCloseConfirm(item.id)}
                        aria-expanded={closeOpen}
                        // 접혀 있을 때는 form이 DOM에 없어 존재하지 않는 id를 가리키게 된다 — 열려 있을 때만 연결한다.
                        aria-controls={closeOpen ? closeFormId : undefined}
                        disabled={acting}
                        aria-busy={acting || undefined}
                        // hover 색은 status-tone Danger 토큰(#B43E3E/#F2B8B8)과 같은 값 — Tailwind 정적 스캔용 리터럴.
                        className={`inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold transition-colors hover:border-[#F2B8B8] hover:text-[#B43E3E] disabled:opacity-50 ${INTERACTIVE_TEXT_CLASS}`}
                      >
                        <XCircle className="h-3 w-3" />
                        {actingId === `${item.id}:close` ? "종료 중" : "종료"}
                      </button>
                    ) : null}
                  </div>
                  {closeOpen ? (
                    <form
                      id={closeFormId}
                      aria-label={`${item.title} 리드 종료 확인`}
                      onSubmit={(event) => {
                        event.preventDefault()
                        void handleLeadAction(item, "close")
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault()
                          setCloseConfirmId(null)
                        }
                      }}
                      className={`rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed lg:col-span-3 ${STATUS_TONE_CLASS.danger}`}
                    >
                      <p className={`font-semibold ${STATUS_TONE_TEXT_STRONG_CLASS.danger}`}>
                        &lsquo;{item.title}&rsquo; 리드를 종료합니다
                      </p>
                      <p className="mt-0.5">
                        현재 {item.statusLabel} · 오늘 전화 목록과 리드 보드 활성 목록에서 빠집니다
                        {call.groupedCount > 0 ? ` · 같은 기관 접힌 ${call.groupedCount}건은 그대로 남습니다` : ""}
                        {" · "}종료 뒤 8초 안에 되돌릴 수 있습니다
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <button
                          type="submit"
                          disabled={acting}
                          aria-busy={acting || undefined}
                          className={`inline-flex min-h-11 items-center rounded-lg border bg-white px-3 text-[12px] font-semibold disabled:opacity-50 sm:h-8 sm:min-h-0 ${STATUS_TONE_CLASS.danger}`}
                        >
                          종료
                        </button>
                        <button
                          type="button"
                          ref={closeCancelRef}
                          onClick={() => setCloseConfirmId(null)}
                          disabled={acting}
                          className={`inline-flex min-h-11 items-center rounded-lg px-3 text-[12px] font-semibold hover:bg-white/60 disabled:opacity-50 sm:h-8 sm:min-h-0 ${INTERACTIVE_TEXT_CLASS}`}
                        >
                          취소
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {draftOpen && leadContactDraft ? (
                    <form
                      id={draftFormId}
                      aria-label={`${item.title} 연락 결과 입력`}
                      onSubmit={(event) => {
                        event.preventDefault()
                        void saveLeadContactResult(item)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault()
                          changeDraft(null)
                        }
                      }}
                      className="border-l-2 border-[#084734] bg-white p-3 lg:col-span-3"
                    >
                      <div className="grid gap-2 lg:grid-cols-[140px_160px_minmax(180px,1fr)_170px_auto] lg:items-end">
                        <label className={`grid gap-1 text-[11px] font-semibold ${SECONDARY_TEXT_CLASS}`}>
                          연락 채널
                          <select
                            value={leadContactDraft.type}
                            onChange={(event) =>
                              setLeadContactDraft((current) =>
                                current ? { ...current, type: event.target.value as LeadContactType } : current
                              )
                            }
                            className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                          >
                            <option value="call">콜</option>
                            <option value="sms">문자</option>
                            <option value="kakao">카카오톡</option>
                            <option value="email">이메일</option>
                          </select>
                        </label>
                        <label className={`grid gap-1 text-[11px] font-semibold ${SECONDARY_TEXT_CLASS}`}>
                          실제 결과
                          <select
                            value={leadContactDraft.result}
                            onChange={(event) =>
                              setLeadContactDraft((current) =>
                                current ? { ...current, result: event.target.value as LeadContactResult } : current
                              )
                            }
                            className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                          >
                            <option value="answered">연결됨</option>
                            <option value="no_answer">부재</option>
                            <option value="callback">콜백 요청</option>
                            <option value="meeting_set">미팅 확정</option>
                          </select>
                        </label>
                        <label className={`grid gap-1 text-[11px] font-semibold ${SECONDARY_TEXT_CLASS}`}>
                          한 줄 메모
                          <input
                            value={leadContactDraft.notes}
                            onChange={(event) =>
                              setLeadContactDraft((current) =>
                                current ? { ...current, notes: event.target.value } : current
                              )
                            }
                            placeholder="확인한 사실만 기록"
                            className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] text-[#111110] outline-none placeholder:text-[#1a1a1a]/30 focus-visible:ring-2 focus-visible:ring-[#084734]"
                          />
                        </label>
                        <label className={`grid gap-1 text-[11px] font-semibold ${SECONDARY_TEXT_CLASS}`}>
                          다음 일정
                          <select
                            value={leadContactDraft.nextSchedule}
                            onChange={(event) =>
                              setLeadContactDraft((current) =>
                                current ? { ...current, nextSchedule: event.target.value as LeadNextSchedule } : current
                              )
                            }
                            className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                          >
                            <option value="keep">기존 일정 유지</option>
                            <option value="tomorrow">내일 오전 9시</option>
                            <option value="clear">일정 비우기</option>
                          </select>
                        </label>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => changeDraft(null)}
                            disabled={actingId === `${item.id}:contact`}
                            className={`h-9 rounded-lg px-3 text-[12px] font-semibold hover:text-[#111110] disabled:opacity-50 ${INTERACTIVE_TEXT_CLASS}`}
                          >
                            취소
                          </button>
                          <button
                            type="submit"
                            disabled={actingId === `${item.id}:contact`}
                            aria-busy={actingId === `${item.id}:contact` || undefined}
                            className="h-9 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {actingId === `${item.id}:contact` ? "저장 중" : "결과 저장"}
                          </button>
                        </div>
                      </div>
                      {discardPrompt?.itemId === item.id ? (
                        <div
                          role="alertdialog"
                          aria-label="작성 중인 연락 결과"
                          className={`mt-2 flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 text-[12px] ${STATUS_TONE_CLASS.warning}`}
                        >
                          {/* 어느 카드의 초안인지 밝힌다 — 다른 카드의 버튼에서 이 프롬프트가 뜰 수 있다(guardDraft). */}
                          <span className="min-w-0 flex-1">
                            &lsquo;{item.title}&rsquo; 카드에 작성 중인 연락 결과가 있습니다. 버리고 닫을까요?
                          </span>
                          <button
                            type="button"
                            autoFocus
                            onClick={() => setDiscardPrompt(null)}
                            className={`inline-flex min-h-11 items-center rounded-lg border bg-white px-2.5 font-semibold sm:h-7 sm:min-h-0 ${STATUS_TONE_CLASS.warning}`}
                          >
                            계속 작성
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const proceed = discardPrompt.onDiscard
                              setDiscardPrompt(null)
                              // '버리고 닫기'는 초안을 실제로 버린다 — 다른 카드의 처리로 넘어가는 경우에도 남기지 않는다.
                              setLeadContactDraft(null)
                              proceed()
                            }}
                            className={`inline-flex min-h-11 items-center rounded-lg px-2.5 font-semibold underline underline-offset-2 sm:h-7 sm:min-h-0 ${STATUS_TONE_TEXT_STRONG_CLASS.warning}`}
                          >
                            버리고 닫기
                          </button>
                        </div>
                      ) : null}
                    </form>
                  ) : null}
                </div>
              )
            })}
            {overflow.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowMore((value) => !value)}
                aria-expanded={showMore}
                className={`w-full bg-white py-2 text-[12px] font-semibold transition-colors hover:bg-[#fafaf8] hover:text-[#111110] ${INTERACTIVE_TEXT_CLASS}`}
              >
                {showMore
                  ? `접기 · 오늘 전화 ${calls.length}건만`
                  : `다음 후보 ${Math.min(cardCount, overflow.length)}건 더 보기`}
              </button>
            ) : null}
          </div>
        ) : !data ? (
          // 실패와 "할 일 없음"은 다른 상태다 — 못 불러온 것을 "없다"로 말하지 않는다.
          <div className="px-4 py-6 text-center">
            <p className={`text-[13px] font-semibold ${STATUS_TONE_TEXT_STRONG_CLASS.danger}`}>
              오늘 전화 목록을 불러오지 못했습니다 — 후보가 없는 것이 아니라 확인할 수 없는 상태입니다.
            </p>
            <button
              type="button"
              onClick={() => void load({ force: true })}
              disabled={refreshing}
              aria-busy={refreshing || undefined}
              className={`mt-3 inline-flex min-h-11 items-center rounded-lg border bg-white px-3 text-[12px] font-semibold disabled:opacity-50 sm:h-8 sm:min-h-0 ${STATUS_TONE_CLASS.danger}`}
            >
              다시 시도
            </button>
          </div>
        ) : (
          <div className="px-4 py-6 text-center">
            <p className="text-[13px] font-semibold text-[#111110]">
              {owner ? "선택한 담당자의 오늘 전화 후보가 없습니다" : "오늘 전화할 후보가 없습니다"}
            </p>
            <p className={`mt-1 text-[12px] ${SECONDARY_TEXT_CLASS}`}>
              {owner
                ? "담당 전체로 넓히면 다른 담당자의 후보가 보일 수 있습니다."
                : "처리할 후보가 없다는 뜻입니다 — 데이터 누락이 아닙니다."}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              {owner ? (
                <button
                  type="button"
                  onClick={() => setOwner("")}
                  className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
                >
                  담당 전체로 보기
                </button>
              ) : null}
              <Link
                href="/admin/crm/customers/unified"
                className={`inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] ${INTERACTIVE_TEXT_CLASS}`}
              >
                고객DB에서 찾아보기
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* 메타 광고 리드 — 절대다수 유입원이라 카드에 섞지 않는다. 건수 + 상위 몇 건만
          한 줄로 함축하고, 응대 작업은 리드 보드의 메타 필터 뷰로 보낸다. 카드가 비어도 보인다. */}
      {data && meta.total > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg bg-[#fafaf8] px-3 py-2.5">
          <span className="inline-flex h-[22px] items-center rounded-full bg-[#111110] px-2 text-[11px] font-semibold text-white">
            메타 광고
          </span>
          {/* 풀 상한(50건) 안에서 센 수 — 상한에 닿았으면 "+"로 절단을 드러낸다. */}
          <span className="text-[12px] font-semibold tabular-nums text-[#111110]">
            리드 {meta.total.toLocaleString("ko-KR")}건{(data?.items.length ?? 0) >= QUEUE_POOL_LIMIT ? "+" : ""}
          </span>
          <span className={`text-[11px] tabular-nums ${SECONDARY_TEXT_CLASS}`}>
            오늘 응대 대상 {meta.today.toLocaleString("ko-KR")}건{(data?.items.length ?? 0) >= QUEUE_POOL_LIMIT ? "+" : ""}
          </span>
          <span aria-hidden className="text-[#1a1a1a]/20">·</span>
          {meta.top.map((item) => {
            const age = formatAgeHours(item.dueAt)
            return (
              <Link
                key={item.id}
                href={item.href}
                className="inline-flex h-[22px] max-w-[160px] items-center gap-1 rounded-full border border-[#e8e8e4] bg-white px-2 text-[11px] font-medium text-[#111110] transition-colors hover:border-[#c8c8c4]"
              >
                <span className="truncate">{item.title}</span>
                {age ? <span className={`shrink-0 tabular-nums ${SECONDARY_TEXT_CLASS}`}>{age}</span> : null}
              </Link>
            )
          })}
          {meta.total > meta.top.length ? (
            <span className={`text-[11px] tabular-nums ${SECONDARY_TEXT_CLASS}`}>+{meta.total - meta.top.length}</span>
          ) : null}
          <Link
            href="/admin/crm/customers/leads?group=meta&filter=unresponded"
            className="ml-auto shrink-0 text-[11px] font-semibold text-[#084734] underline-offset-2 hover:underline"
          >
            메타 리드만 보기
          </Link>
        </div>
      ) : null}

      {/* 판단 근거를 요약 한 줄로 — "왜 5건뿐인가"에 답하고, 전수 탐색은 고객DB로 보낸다.
          풀 상한(QUEUE_POOL_LIMIT) 안에서 센 수라는 범위를 문구에 명시한다(UX 규약 4). */}
      {data ? (
        <p className={`mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px] ${SECONDARY_TEXT_CLASS}`}>
          <span>
            오늘 후보 <b className="font-semibold text-[#111110]">{totals.today.toLocaleString("ko-KR")}건</b>
            {" · "}신규 응대 {totals.slots.new_response.toLocaleString("ko-KR")} · 돈 임박{" "}
            {totals.slots.money.toLocaleString("ko-KR")} · 다시 움직임 {totals.slots.reengage.toLocaleString("ko-KR")}
            {data.summary.laneCritical > 0 ? (
              <>
                {" · "}
                <span className={`font-semibold ${STATUS_TONE_TEXT_STRONG_CLASS.danger}`}>
                  긴급 {data.summary.laneCritical.toLocaleString("ko-KR")}
                </span>
              </>
            ) : null}
            {" · "}상위 {QUEUE_POOL_LIMIT}건 풀 기준
          </span>
          <Link href="/admin/crm/customers/unified" className="font-semibold text-[#084734] underline-offset-2 hover:underline">
            전체는 고객DB에서 보기
          </Link>
        </p>
      ) : null}

      {/*
        할 일은 이 큐에서 의도적으로 뺐다(매출 기회와 경쟁시키지 않기 위해). 그런데 건수를
        아무 데도 안 보여주면 "할 일이 없다"로 읽힌다 — 규모와 갈 곳을 한 줄로 남긴다.
      */}
      {(data?.summary.sourceTotals?.task ?? 0) > 0 ? (
        <p className={`mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] ${SECONDARY_TEXT_CLASS}`}>
          <span>
            이 목록에는 할 일이 빠져 있습니다 · 활성 할 일{" "}
            <b className="font-semibold text-[#111110]">
              {(data?.summary.sourceTotals?.task ?? 0).toLocaleString("ko-KR")}건
            </b>
          </span>
          <Link href="/admin/crm/activity" className="font-semibold text-[#084734] underline-offset-2 hover:underline">
            할 일에서 보기
          </Link>
        </p>
      ) : null}
    </section>
  )
}
