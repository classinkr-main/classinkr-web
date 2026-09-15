"use client"

// ClassIn 고객 DB(통합 고객) 본체 — URL·캐시·드로어 상태와 저장 보기 로직만 소유하고,
// 검색 패널·결과 테이블·행 시각 요소·정렬은 components/admin/crm/unified/* 로 분해했다(2026-08-28).

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import dynamic from "next/dynamic"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronRight, Filter, RefreshCw, UserPlus } from "lucide-react"

import { adminFetchJsonCachedWithMeta, getCachedAdminJson } from "@/lib/admin-client"
import { CRM_CACHE_SWR_MS } from "@/lib/crm/client-cache"
import type { CrmUnifiedCustomerRow } from "@/lib/repositories/crm-unified-customers"
import { buildOwnerSelectOptions, useCrmOwners } from "./useCrmOwners"
import Account360Lens from "./Account360Lens"
import CrmNoticeBanner from "./CrmNoticeBanner"
import Customer360DrawerSkeleton from "./Customer360DrawerSkeleton"
import SavedViewButton from "./unified/SavedViewButton"
import CustomerSearchPanel from "./unified/CustomerSearchPanel"
import CustomerResultsSection from "./unified/CustomerResultsSection"
import UnconfirmedToggle from "./unified/UnconfirmedToggle"
import { SORT_DEFAULT_DIRECTION, sortRows, type SortKey, type SortState } from "./unified/sort"
import {
  CACHE_TTL_MS,
  CURRENT_OWNER_VALUE,
  OWNER_STORAGE_KEY,
  PRIMARY_SAVED_VIEW_FILTERS,
  SAVED_VIEW_FILTERS,
  SECONDARY_SAVED_VIEW_FILTERS,
  listUrl,
  mergePage,
  normalizeText,
  type CrmUnifiedCustomers,
  type LifecycleFilter,
  type SavedViewFilter,
  type SourceFilter,
} from "./unified/shared"

// 드로어·리드 등록 모달 코드 스플리팅(41af51a4 패턴) — 목록 첫 로드에서 청크를 제외하고
// 행 클릭/딥링크(?account=)·리드 등록 클릭 시점에만 내려받는다. 열림 상태에서만 렌더하므로
// 로딩 폴백이 닫힌 화면에 노출될 일은 없다. 드로어 폴백은 실제 드로어와 같은 골격의
// 스켈레톤(딥링크 첫 페인트가 빈 화면으로 깜빡이지 않게), props 계약은 그대로다.
const Customer360Drawer = dynamic(() => import("./Customer360Drawer"), {
  loading: () => <Customer360DrawerSkeleton />,
})
const LeadRegisterModal = dynamic(() => import("./LeadRegisterModal"), {
  // 모달 본체는 document.body 포털(조상 transform 대비)이라 폴백도 뷰포트 기준이 안전하지만,
  // 한 프레임짜리 전환이라 골격 없이 딤 배경만 먼저 깔아 클릭 무반응처럼 보이는 것만 막는다.
  loading: () => <div className="fixed inset-0 z-50 bg-black/20" aria-hidden />,
})

// 검색 디바운스 — ⌘K 팔레트(CrmCommandPalette.tsx)와 같은 200ms 고정 지연 규약(2026-09-07
// 감사 #6). useDeferredValue는 React 스케줄러 사정에 따라 지연 폭이 들쭉날쭉해 타이핑 중
// 서버 왕복 수를 안정적으로 줄이지 못한다 — 고정 타이머로 바꾼다. 레이스 가드는 아래
// requestSeq(기존 loadPage 계약)가 이미 맡고 있어 그대로 둔다.
const SEARCH_DEBOUNCE_MS = 200

const LOAD_FAILURE_FALLBACK_MESSAGE = "통합 고객 목록을 불러오지 못했습니다."

function describeLoadError(error: unknown) {
  return error instanceof Error && error.message ? error.message : LOAD_FAILURE_FALLBACK_MESSAGE
}

// 갱신 실패 배너의 기준 시각 — 화면에 남아 있는 결과가 언제 것인지 명시한다(UX 규약 4).
function formatShownAt(iso: string | null | undefined) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
}

// 갱신 실패(이전 결과 표시 중) — 목록 자체를 못 불러온 `error`(danger)와 구분되는 warning 상태.
// staleIfError 폴백·백그라운드 재검증 실패·다음 페이지 실패가 모두 여기로 모인다.
// 재시도는 항상 force(no-store·staleIfError 없음)로 나간다 — 같은 만료 캐시를 다시 받는 헛돌기를 막는다.
interface RefreshFailure {
  message: string
  retryOffset: number
  retryAppend: boolean
}

// 라이브 리전 문구 — 상태 우선순위를 진행 중 > 완료 순으로 고정한 순수 함수라 RTL 없이도
// 실제 입력·출력으로 검증할 수 있다(2026-09-12 리뷰 #1: refreshFailure를 놓치고 실패
// 직후에도 성공 문구 "N명 결과를 불러왔습니다"를 읽어주던 결함). error·refreshFailure는
// 각자의 CrmNoticeBanner(role=alert/status)가 스스로 통지하므로 여기서는 성공 문구만
// 억제해 상충하는 두 안내가 동시에 읽히지 않게 한다.
export function describeUnifiedListStatus(input: {
  refreshing: boolean
  loadingMore: boolean
  loading: boolean
  error: string | null
  refreshFailure: unknown
  totalCount: number | null
}): string {
  if (input.refreshing) return "통합 고객 목록을 새로고치는 중입니다."
  if (input.loadingMore) return "다음 고객 목록을 불러오는 중입니다."
  if (input.loading) return "통합 고객 목록을 불러오는 중입니다."
  if (input.error || input.refreshFailure) return ""
  if (input.totalCount == null) return ""
  return `통합 고객 ${input.totalCount.toLocaleString("ko-KR")}명 결과를 불러왔습니다.`
}

// 실패 분류의 질의 키 — offset만 다른 재요청(다음/이전 페이지·새로고침 재시도)은 "같은 질의"로
// 보고, 검색어·필터가 바뀐 뒤의 재요청은 "다른 질의"로 가른다(2026-09-12 리뷰 #2: 필터를
// 바꾼 직후 요청이 실패하면 무관한 이전 필터 결과가 약한 경고만 띄운 채 그대로 남던 결함).
export function queryKeyFromUrl(url: string): string {
  const [path, qs = ""] = url.split("?")
  const params = new URLSearchParams(qs)
  params.delete("offset")
  params.sort()
  return `${path}?${params.toString()}`
}

// 화면에 남아 있는 데이터가 지금 실패한 요청과 같은 질의에서 온 것인지 — 같을 때만 "갱신
// 실패"(warning, 이전 결과 유지)로 보내고, 다르면 "조회 실패"(danger)로 보내며 무관한
// 데이터를 비운다.
export function isSameLoadQuery(lastQueryKey: string | null, requestUrl: string): boolean {
  return lastQueryKey !== null && lastQueryKey === queryKeyFromUrl(requestUrl)
}

export default function CrmUnifiedCustomersClient() {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [query])
  const [source, setSource] = useState<SourceFilter>("all")
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>("all")
  const [owner, setOwner] = useState("")
  const [savedView, setSavedView] = useState<SavedViewFilter>("all")
  const [tagFilter, setTagFilter] = useState("")
  // 확인 게이트 우회 — 기본 false(미확인 리드 숨김 + 건수만 표시). 리드 보드의 includeUnconfirmed와 같은 이름·UX.
  // URL에 싣지 않는 세션 한정 토글이며, 요청 URL(=캐시 키)에는 includeUnconfirmed=1로 실린다.
  const [includeUnconfirmed, setIncludeUnconfirmed] = useState(false)
  // 정렬 상태 — null=추천순(서버 버킷→점수→시각 순서 그대로). 탐색용 일회성 상태라 URL·저장소에 영속하지 않는다.
  const [sort, setSort] = useState<SortState | null>(null)
  const [data, setData] = useState<CrmUnifiedCustomers | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshFailure, setRefreshFailure] = useState<RefreshFailure | null>(null)
  const [drawer, setDrawer] = useState<{ key: string; name: string } | null>(null)
  const [leadModalOpen, setLeadModalOpen] = useState(false)
  const requestSeq = useRef(0)
  // loadPage 콜백이 "지금 화면에 결과가 있는가"를 deps 없이 읽기 위한 거울 — 실패를 danger(조회
  // 실패)로 띄울지 warning(갱신 실패·이전 결과 표시 중)으로 띄울지 가른다. 데이터 유무만으로는
  // 부족하다 — 검색어·필터를 바꾼 뒤 실패하면 화면엔 무관한 이전 질의 결과가 남는다.
  // lastLoadedQueryKeyRef 로 "그 데이터가 지금 요청과 같은 질의인가"까지 함께 본다.
  const hasDataRef = useRef(false)
  const lastLoadedQueryKeyRef = useRef<string | null>(null)
  useEffect(() => {
    hasDataRef.current = data != null
  }, [data])
  // 드로어 컴포저 dirty — 뒤로가기(?account= 소실) 닫기 경로가 드로어 내부 닫기 가드와
  // 같은 확인을 거치게 한다(가드 없이는 뒤로가기가 작성 중 기록을 무음 폐기).
  const drawerDirtyRef = useRef(false)

  // 드로어를 ?account= 에 동기화 — 딥링크/뒤로가기 (C9)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setDrawerUrl = useCallback(
    (key: string | null, mode: "push" | "replace") => {
      const params = new URLSearchParams(Array.from(searchParams.entries()))
      if (key) params.set("account", key)
      else params.delete("account")
      const qs = params.toString()
      const href = qs ? `${pathname}?${qs}` : pathname
      if (mode === "push") router.push(href, { scroll: false })
      else router.replace(href, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  // 열 때 push로 히스토리 항목을 남겨 브라우저 '뒤로가기'가 드로어를 닫게 한다.
  const openDrawer = useCallback(
    (key: string, name: string) => {
      setDrawer({ key, name })
      setDrawerUrl(key, "push")
    },
    [setDrawerUrl]
  )

  // 행 더블클릭 = 드로어 열기. 이름 버튼이 유일한 진입점이라 "행을 눌렀는데 안 열린다"가 반복됐다.
  // 단일 클릭은 그대로 비워 둔다 — 행 안의 링크·복사 버튼과 충돌하고, 스캔 중 오작동이 잦다.
  // 내부 인터랙티브 요소 위의 더블클릭은 그 요소가 처리하므로 제외한다(연락처 복사 버튼 등).
  // 전환 고객은 360 드로어 미지원(파트너 워크스페이스행) — 이름 링크와 같은 규칙을 따른다.
  const handleRowDoubleClick = useCallback(
    (event: MouseEvent<HTMLElement>, row: CrmUnifiedCustomerRow) => {
      if (row.source === "customer") return
      if ((event.target as HTMLElement).closest("a, button, input, textarea, select")) return
      // 더블클릭의 브라우저 기본 동작(텍스트 선택)이 드로어 위에 남지 않게 지운다.
      window.getSelection()?.removeAllRanges()
      openDrawer(row.key, row.name)
    },
    [openDrawer]
  )

  // 닫을 때는 replace로 account만 제거(불필요한 히스토리 항목을 남기지 않음).
  // dirty 리셋: 드로어가 dynamic 전환으로 닫힘=언마운트가 되면서, 마운트 유지 시절
  // 드로어 내부 리셋 효과가 하던 onDirtyChange(false) 통지가 사라졌다 — 부모가 직접 리셋한다.
  const closeDrawer = useCallback(() => {
    drawerDirtyRef.current = false
    setDrawer(null)
    setDrawerUrl(null, "replace")
  }, [setDrawerUrl])

  // URL ↔ 드로어 상태 양방향 동기화 — 딥링크 복원 + 뒤로/앞으로가기(popstate) 대응.
  // drawerRef: 이 효과는 searchParams 변화에만 반응해야 한다 — 드로어 상태를 deps에 넣으면
  // closeDrawer의 replace가 착지하기 전 중간 렌더(드로어 null·URL은 아직 account 보유)에서
  // 드로어를 되살린다.
  const drawerRef = useRef(drawer)
  useEffect(() => {
    drawerRef.current = drawer
  }, [drawer])

  useEffect(() => {
    const account = searchParams.get("account")
    const current = drawerRef.current
    if (!account) {
      if (!current) return
      // 뒤로가기로 ?account=가 사라질 때: 컴포저에 작성 중 기록이 있으면 확인 후에만 닫는다.
      // 거부 시 라우터 push로 account를 복원(히스토리 한 단계 재적재) — raw history API는
      // useSearchParams와 desync되므로 금지.
      if (drawerDirtyRef.current && !window.confirm("작성 중인 기록이 있습니다. 닫을까요?")) {
        setDrawerUrl(current.key, "push")
        return
      }
      // 언마운트 닫기라 드로어 내부 리셋 효과의 dirty=false 통지가 없다 — 여기서 직접 리셋.
      drawerDirtyRef.current = false
      setDrawer(null)
      return
    }
    if (current?.key === account) return
    setDrawer({ key: account, name: current?.name ?? "" })
  }, [searchParams, setDrawerUrl])

  // 리드 전환 완료 패널 '고객 보기' 딥링크(?q=) → 검색어 1회 복원.
  const restoredQueryRef = useRef(false)
  useEffect(() => {
    if (restoredQueryRef.current) return
    restoredQueryRef.current = true
    const q = searchParams.get("q")?.trim()
    if (q) setQuery(q)
  }, [searchParams])

  // 사이드바 저장된 세그먼트 링크(?view=) → 저장 뷰 동기화.
  // 사이드바 칩 카운트는 전역(검색·담당·라벨 무필터) 기준이므로, 딥링크 착지 시 남아 있는
  // 로컬 필터를 함께 초기화해 목록 건수가 칩 숫자와 일치하게 한다(착지 정합).
  // view 값이 실제로 바뀔 때만 실행 — 드로어(?account=) push 등 다른 쿼리 변경에는 불변.
  const lastViewParamRef = useRef<string | null>(null)
  useEffect(() => {
    const view = searchParams.get("view")
    if (view === lastViewParamRef.current) return
    lastViewParamRef.current = view
    if (!view) return
    const known = SAVED_VIEW_FILTERS.some((filter) => filter.key === view)
    setSavedView(known ? (view as SavedViewFilter) : "all")
    setSource("all")
    setLifecycle("all")
    setTagFilter("")
    setQuery("")
    setOwner(view === "my_owner" ? CURRENT_OWNER_VALUE : "")
  }, [searchParams])

  // 칩 클릭 ↔ URL 동기화 — setDrawerUrl과 동일하게 라우터 경유(router.replace).
  // raw history API는 useSearchParams와 desync되어 드로어 열기/닫기가 ?view=를 유실한다.
  // replace라 히스토리를 오염시키지 않고(뒤로가기 안전), lastViewParamRef를 라우터 호출보다
  // 먼저 갱신해 우리 자신의 URL 변경이 위 착지 effect(필터 초기화)를 재발화시키지 않게 한다.
  const syncViewParam = useCallback(
    (view: SavedViewFilter) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()))
      if (view === "all") params.delete("view")
      else params.set("view", view)
      lastViewParamRef.current = view === "all" ? null : view
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams]
  )
  const { owners: crmOwners, currentOwner, health: ownerHealth } = useCrmOwners()
  const ownerOptions = useMemo(() => buildOwnerSelectOptions(data?.owners, crmOwners), [crmOwners, data?.owners])

  const currentOwnerCount = useMemo(() => {
    const selected = normalizeText(owner === CURRENT_OWNER_VALUE ? currentOwner?.ownerKey : owner)
    if (!selected) return 0
    return ownerOptions.find((option) => normalizeText(option.ownerName) === selected)?.count ?? 0
  }, [currentOwner?.ownerKey, owner, ownerOptions])

  const loadPage = useCallback(
    async (offset: number, options?: { force?: boolean; append?: boolean }) => {
      const append = Boolean(options?.append)
      const url = listUrl({
        query: debouncedQuery,
        source,
        lifecycle,
        owner,
        view: savedView,
        tag: tagFilter,
        includeUnconfirmed,
        offset,
      })
      const cached = !append && !options?.force ? getCachedAdminJson<CrmUnifiedCustomers>(url, { cacheKey: url }) : null
      const requestId = ++requestSeq.current

      if (cached) {
        setData(cached)
        hasDataRef.current = true
        lastLoadedQueryKeyRef.current = queryKeyFromUrl(url)
      }

      setLoading(!append && !cached)
      setLoadingMore(append)
      setRefreshing(Boolean(options?.force))
      setError(null)
      const failRefresh = (cause: unknown) => {
        setRefreshFailure({ message: describeLoadError(cause), retryOffset: offset, retryAppend: append })
      }
      try {
        const result = await adminFetchJsonCachedWithMeta<CrmUnifiedCustomers>(
          options?.force ? `${url}&force=1` : url,
          undefined,
          {
            cacheKey: url,
            ttlMs: CACHE_TTL_MS,
            staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
            force: options?.force,
            // 새로고침(force)은 실패를 만료 캐시로 대체하지 않고 throw 한다 — '방금 새로고침했으니
            // 최신'이라는 오인을 막는다. 일반 로드는 폴백을 허용하되 아래 staleReason으로 드러낸다.
            staleIfError: !options?.force,
            // 배경 갱신도 포그라운드와 같은 병합 규칙을 탄다 — 더 늦게 시작한 요청이
            // 이미 화면을 갈아치웠다면(필터 변경·다음 페이지) 이 결과는 버린다.
            onRevalidated: ({ data: fresh, error: revalidateError }) => {
              if (requestId !== requestSeq.current) return
              if (revalidateError !== undefined) {
                failRefresh(revalidateError)
                return
              }
              if (!fresh) return
              setData((current) => mergePage(current, fresh, append))
              hasDataRef.current = true
              lastLoadedQueryKeyRef.current = queryKeyFromUrl(url)
              setRefreshFailure(null)
            },
          }
        )
        if (requestId !== requestSeq.current) return
        setData((current) => mergePage(current, result.data, append))
        hasDataRef.current = true
        lastLoadedQueryKeyRef.current = queryKeyFromUrl(url)
        if (result.stale && result.staleReason === "error") {
          // staleIfError 폴백 — 네트워크로 새로 받은 게 아니라 만료 캐시다. 성공처럼 두지 않는다.
          failRefresh(result.staleError)
        } else if (!result.stale) {
          setRefreshFailure(null)
        }
      } catch (err) {
        if (requestId !== requestSeq.current) return
        // 화면에 남은 데이터가 "지금 실패한 이 질의"에서 온 것일 때만 갱신 실패(warning)로
        // 묶어 이전 결과를 유지한다. 검색어·필터를 바꾼 뒤의 실패는 무관한 이전 질의 결과이므로
        // 조회 실패(danger)로 보내고 화면도 비운다.
        if (hasDataRef.current && isSameLoadQuery(lastLoadedQueryKeyRef.current, url)) {
          failRefresh(err)
        } else {
          setRefreshFailure(null)
          setData(null)
          hasDataRef.current = false
          setError(describeLoadError(err))
        }
      } finally {
        if (requestId === requestSeq.current) {
          setLoading(false)
          setLoadingMore(false)
          setRefreshing(false)
        }
      }
    },
    [debouncedQuery, source, lifecycle, owner, savedView, tagFilter, includeUnconfirmed]
  )

  useEffect(() => {
    void loadPage(0)
  }, [loadPage])

  useEffect(() => {
    if (typeof window === "undefined") return
    // 세그먼트 딥링크(?view=) 착지 시에는 저장된 담당자 필터를 복원하지 않는다 — 칩 카운트(전역 기준) 정합.
    if (new URLSearchParams(window.location.search).get("view")) return
    const storedOwner = window.localStorage.getItem(OWNER_STORAGE_KEY)
    if (storedOwner) setOwner(storedOwner)
  }, [])

  // 담당자 필터 영속화 — 사용자가 직접 바꿀 때만 기록한다.
  // (딥링크 착지가 프로그램적으로 owner를 비울 때 저장된 선호가 지워지지 않도록 effect 영속화 대신 액션 시점에 호출.)
  const persistOwner = useCallback((next: string) => {
    if (typeof window === "undefined") return
    if (next) window.localStorage.setItem(OWNER_STORAGE_KEY, next)
    else window.localStorage.removeItem(OWNER_STORAGE_KEY)
  }, [])

  const selectSavedView = (view: SavedViewFilter) => {
    if (view === "my_owner") {
      if (!currentOwner) return
      if (savedView === "my_owner") {
        setOwner("")
        persistOwner("")
        setSavedView("all")
        syncViewParam("all")
        return
      }
      setOwner(CURRENT_OWNER_VALUE)
      persistOwner(CURRENT_OWNER_VALUE)
      setSavedView(view)
      syncViewParam(view)
      setSource("all")
      setLifecycle("all")
      return
    }

    const next: SavedViewFilter = savedView === view ? "all" : view
    setSavedView(next)
    syncViewParam(next)
    if (view === "new_leads") {
      setSource("lead")
      setLifecycle("all")
    }
    if (view === "needs_care") {
      setSource("neo_account")
      setLifecycle("all")
    }
    if (view === "priority") {
      setSource("all")
      setLifecycle("all")
    }
  }

  // 빠른 보기 모드 — 칩(저장 뷰) 진입 시 검색 UI를 접고 결과 스트립만 보여준다.
  // 숨김이지 리셋이 아님: query/owner 등 로컬 상태는 메모리에 유지된다.
  const quickMode = savedView !== "all"

  // 스트립의 '전체 보기' 전용 탈출 — selectSavedView와 달리 무조건 해제한다.
  // (?view=my_owner 딥링크 착지 후 currentOwner가 없으면 selectSavedView는 조기 return이라
  // 토글 해제가 막히는 탈출 트랩 방지. my_owner가 걸어둔 owner 필터도 함께 해제.)
  const exitQuickView = useCallback(() => {
    if (savedView === "my_owner") {
      setOwner("")
      persistOwner("")
    }
    setSavedView("all")
    syncViewParam("all")
  }, [persistOwner, savedView, syncViewParam])

  // 빠른 보기 잔존 필터 힌트 — 숨김≠리셋 설계라 접힌 검색 패널의 검색어/담당/라벨이 남아
  // 결과를 조용히 좁힐 수 있다. 남은 필터를 스트립에 명시하고 '해제'로 뷰는 유지한 채 푼다.
  // my_owner 뷰의 담당 필터는 뷰 정의 그 자체라 잔존 필터로 치지 않는다(해제하면 뷰가 0건이 됨).
  const trimmedQuery = query.trim()
  const lingeringOwner = savedView !== "my_owner" ? owner : ""
  const lingeringOwnerLabel = useMemo(() => {
    if (!lingeringOwner) return null
    if (lingeringOwner === CURRENT_OWNER_VALUE) return currentOwner?.displayName ?? "내 담당"
    return ownerOptions.find((option) => option.ownerName === lingeringOwner)?.label ?? lingeringOwner
  }, [currentOwner?.displayName, lingeringOwner, ownerOptions])
  const lingeringParts = [
    trimmedQuery ? `검색 "${trimmedQuery}"` : null,
    lingeringOwnerLabel ? `담당 ${lingeringOwnerLabel}` : null,
    tagFilter ? `라벨 ${tagFilter}` : null,
  ].filter((part): part is string => Boolean(part))

  const clearLingeringFilters = useCallback(() => {
    setQuery("")
    setTagFilter("")
    if (savedView !== "my_owner") {
      setOwner("")
      persistOwner("")
    }
  }, [persistOwner, savedView])

  // 빈 상태 다음 행동 안내 — 필터가 걸려 있으면 초기화를, 아니면 리드 등록/매칭 연결을 권한다.
  const hasActiveFilters =
    Boolean(query.trim()) ||
    source !== "all" ||
    lifecycle !== "all" ||
    Boolean(owner) ||
    savedView !== "all" ||
    Boolean(tagFilter) ||
    includeUnconfirmed

  const resetFilters = useCallback(() => {
    setQuery("")
    setSource("all")
    setLifecycle("all")
    setOwner("")
    persistOwner("")
    setSavedView("all")
    syncViewParam("all")
    setTagFilter("")
    setIncludeUnconfirmed(false)
  }, [persistOwner, syncViewParam])

  const hiddenUnconfirmedCount = data?.summary.hiddenUnconfirmedCount ?? 0

  // 같은 키 재클릭=방향 토글, 다른 키=성격별 기본 방향으로 진입. 추천순 복귀는 전용 버튼만 담당한다.
  const toggleSort = useCallback((key: SortKey) => {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: SORT_DEFAULT_DIRECTION[key] }
    )
  }, [])

  const sortedRows = useMemo(() => {
    const rows = data?.rows ?? []
    return sort ? sortRows(rows, sort) : rows
  }, [data?.rows, sort])

  return (
    <div
      className="mx-auto max-w-7xl [&_a]:min-h-11 [&_a]:focus-visible:outline-none [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-[#084734] [&_a]:focus-visible:ring-offset-2 [&_button]:min-h-11 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-[#084734] [&_button]:focus-visible:ring-offset-2 [&_input:not([type=checkbox]):not([type=file])]:min-h-11 [&_input:not([type=checkbox]):not([type=file])]:focus-visible:outline-none [&_input:not([type=checkbox]):not([type=file])]:focus-visible:ring-2 [&_input:not([type=checkbox]):not([type=file])]:focus-visible:ring-[#084734] [&_select]:min-h-11 [&_select]:focus-visible:outline-none [&_select]:focus-visible:ring-2 [&_select]:focus-visible:ring-[#084734] lg:[&_a]:min-h-6 lg:[&_button]:min-h-6 lg:[&_input:not([type=checkbox]):not([type=file])]:min-h-0 lg:[&_select]:min-h-0"
      aria-busy={loading || loadingMore || refreshing}
    >
        {/* 항상 마운트된 sr-only 진행 상태 live region(polite) — 로딩·새로고침·완료만 담당한다.
            조회 실패(danger)·갱신 실패(warning)는 아래 CrmNoticeBanner가 새로 마운트되며
            role=alert/role=status로 스스로 통지하므로, 여기서는 성공 문구만 억제해 상충하는
            두 안내가 동시에 읽히지 않게 한다(과거엔 실패 중에도 성공 문구를 읽었고, 별도 상시
            role=alert div가 CrmNoticeBanner와 같은 문구를 중복으로 읽었다 — 2026-09-12 리뷰). */}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {describeUnifiedListStatus({
            refreshing,
            loadingMore,
            loading,
            error,
            refreshFailure,
            totalCount: data?.summary.total ?? null,
          })}
        </div>
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">ClassIn 고객 DB</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setLeadModalOpen(true)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <UserPlus className="h-3.5 w-3.5" />
              리드 등록
            </button>
            <button
              type="button"
              onClick={() => void loadPage(0, { force: true })}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={refreshing}
              aria-busy={refreshing || undefined}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              새로고침
            </button>
          </div>
        </div>

        {/* 행동 빈도가 높은 보기만 1차 노출하고, 참조성 보기는 한 묶음으로 접는다. */}
        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="빠른 고객 필터">
          <span className="inline-flex h-8 shrink-0 items-center gap-1.5 text-[12px] font-semibold text-[#1a1a1a]/45">
            <Filter className="h-3.5 w-3.5" />
            빠른 필터
          </span>
          {PRIMARY_SAVED_VIEW_FILTERS.map((filter) => (
            <SavedViewButton
              key={filter.key}
              filter={filter}
              active={savedView === filter.key}
              disabled={filter.key === "my_owner" && !currentOwner}
              count={data?.summary.viewCounts?.[filter.key]}
              currentOwnerCount={currentOwnerCount}
              onSelect={selectSavedView}
            />
          ))}
          <details className="group relative shrink-0">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-full border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#1a1a1a]/58 transition-colors hover:bg-[#fafaf8] hover:text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] lg:h-8 lg:min-h-0">
              추가 보기
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            </summary>
            <div className="absolute right-0 top-10 z-30 flex w-[min(430px,calc(100vw-3rem))] flex-wrap gap-2 rounded-xl border border-[#e8e8e4] bg-white p-3 shadow-xl">
              <p className="w-full text-[11px] font-semibold text-[#1a1a1a]/40">최근 진행·유입·만료 보기</p>
              {SECONDARY_SAVED_VIEW_FILTERS.map((filter) => (
                <SavedViewButton
                  key={filter.key}
                  filter={filter}
                  active={savedView === filter.key}
                  disabled={false}
                  count={data?.summary.viewCounts?.[filter.key]}
                  currentOwnerCount={currentOwnerCount}
                  onSelect={selectSavedView}
                />
              ))}
            </div>
          </details>
        </div>

        {quickMode ? (
          // 빠른 보기 스트립 — 활성 뷰 이름 + 결과 건수 + 전체 보기(토글 해제) 복귀 버튼.
          <div className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-[#111110]">
                {SAVED_VIEW_FILTERS.find((f) => f.key === savedView)?.label}
                <span className="ml-2 text-[12px] font-medium text-[#1a1a1a]/45 tabular-nums">
                  {data ? `${data.summary.total.toLocaleString("ko-KR")}건` : error ? "불러오지 못했습니다" : "불러오는 중"}
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {/* 빠른 보기에서도 게이트로 숨긴 건수를 알리고 포함할 수 있어야 한다 — 검색 패널이 접혀 있으므로 여기서 노출. */}
                <UnconfirmedToggle
                  includeUnconfirmed={includeUnconfirmed}
                  hiddenUnconfirmedCount={hiddenUnconfirmedCount}
                  onToggle={() => setIncludeUnconfirmed((prev) => !prev)}
                />
                <button
                  type="button"
                  onClick={exitQuickView}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#1a1a1a]/60 hover:bg-[#fafaf8]"
                >
                  전체 보기 (검색·필터)
                </button>
              </div>
            </div>
            {lingeringParts.length > 0 ? (
              // 잔존 필터 힌트 — 접힌 검색 패널의 필터가 이 뷰 결과를 좁히고 있음을 알린다.
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/55">
                  {lingeringParts.join(" · ")} 적용 중
                </span>
                <button
                  type="button"
                  onClick={clearLingeringFilters}
                  className="h-6 rounded-md px-1.5 text-[11px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
                >
                  해제
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <CustomerSearchPanel
            query={query}
            onQueryChange={setQuery}
            source={source}
            onSourceChange={setSource}
            lifecycle={lifecycle}
            onLifecycleChange={setLifecycle}
            owner={owner}
            onOwnerChange={(nextOwner) => {
              // 이 패널은 quickMode(savedView !== "all")에서 렌더되지 않으므로
              // 여기 도달 시 savedView는 항상 "all" — my_owner 해제 가드 불필요.
              setOwner(nextOwner)
              persistOwner(nextOwner)
            }}
            currentOwner={currentOwner}
            currentOwnerCount={currentOwnerCount}
            ownerOptions={ownerOptions}
            tagFilter={tagFilter}
            onTagFilterChange={setTagFilter}
            includeUnconfirmed={includeUnconfirmed}
            onIncludeUnconfirmedChange={setIncludeUnconfirmed}
            data={data}
            loading={loading}
          />
        )}

        {/* 조회 실패(danger) · 갱신 실패/부분 데이터/담당자 매핑(warning) — 톤은 status-tone SSOT.
            목록 자체를 못 불러온 것과 '이전 결과가 남아 있는 갱신 실패'·참고 경고를 색과 role로 가른다. */}
        {error ? (
          <CrmNoticeBanner
            tone="danger"
            className="mb-4"
            title="조회 실패"
            message={error}
            action={{ label: "다시 시도", onClick: () => void loadPage(0, { force: true }), pending: loading || refreshing }}
            onDismiss={() => setError(null)}
          />
        ) : null}

        {refreshFailure ? (
          <CrmNoticeBanner
            tone="warning"
            className="mb-4"
            title="갱신 실패 — 이전 결과 표시 중"
            message={
              <>
                {refreshFailure.message}
                {formatShownAt(data?.generatedAt) ? ` · 표시 중인 목록은 ${formatShownAt(data?.generatedAt)} 기준` : null}
              </>
            }
            action={{
              label: "다시 시도",
              onClick: () => void loadPage(refreshFailure.retryOffset, { force: true, append: refreshFailure.retryAppend }),
              pending: loading || loadingMore || refreshing,
            }}
            onDismiss={() => setRefreshFailure(null)}
          />
        ) : null}

        {data?.sources.warnings.length ? (
          <CrmNoticeBanner
            tone="warning"
            className="mb-4"
            title="일부 원천 참고 지연"
            message={data.sources.warnings.join(" ")}
          />
        ) : null}

        {ownerHealth?.ok === false && ownerHealth.message ? (
          <CrmNoticeBanner tone="warning" className="mb-4" title="담당자 매핑 참고" message={ownerHealth.message} />
        ) : null}

        <CustomerResultsSection
          data={data}
          rows={sortedRows}
          loading={loading}
          loadingMore={loadingMore}
          refreshing={refreshing}
          sort={sort}
          onToggleSort={toggleSort}
          onClearSort={() => setSort(null)}
          savedView={savedView}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={resetFilters}
          onOpenDrawer={openDrawer}
          onRowDoubleClick={handleRowDoubleClick}
          onLoadPage={(offset) => void loadPage(offset)}
          onOpenLeadModal={() => setLeadModalOpen(true)}
        />

        {/* REV 스파인은 참조 렌즈다. 검색 결과와 고객 작업을 먼저 보여준 뒤 하단에 둔다. */}
        <div className="mt-4">
          <Account360Lens />
        </div>

      {/* 열림 상태에서만 렌더 — 닫힘=null 렌더였던 기존과 동일 화면이면서, dynamic 청크를
          열 때만 내려받고 닫힌 첫 로드에 로딩 폴백이 새어 나오지 않는다. */}
      {drawer ? (
        <Customer360Drawer
          customerKey={drawer.key}
          name={drawer.name}
          onClose={closeDrawer}
          onDirtyChange={(dirty) => {
            drawerDirtyRef.current = dirty
          }}
        />
      ) : null}

      {leadModalOpen ? (
        <LeadRegisterModal
          open
          onClose={() => setLeadModalOpen(false)}
          onDone={() => void loadPage(0, { force: true })}
        />
      ) : null}
    </div>
  )
}
