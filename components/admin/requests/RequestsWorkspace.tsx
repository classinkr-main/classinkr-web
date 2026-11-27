"use client"

import { ArrowLeft, ChevronDown, ChevronRight, Inbox, RefreshCw, Search, Send, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { adminFetchJson } from "@/lib/admin-client"
import {
  ADMIN_REQUESTS_API, ADMIN_REQUESTS_HREF, ADMIN_REQUEST_QUEUES, REQUEST_KINDS, REQUEST_SEARCH_MAX_LENGTH, REQUEST_STATUSES,
  type AdminRequest, type AdminRequestQueue, type AdminRequestsPage, type RequestKind, type RequestStatus,
} from "@/lib/admin/requests"
import { Button } from "@/components/ui/button"
import { RequestThread } from "./RequestThread"
import { RequestForm, type RequestContext } from "./RequestForm"

const API = ADMIN_REQUESTS_API
const PANEL = "rounded-xl border border-line-hair bg-surface-sheet p-4 sm:p-6"
const FIELD = "min-h-11 w-full rounded-lg border border-line-control bg-surface-sheet px-3 py-2 font-normal"

type View = "new" | "mine" | "manage"

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "요청에 실패했습니다."
}

function RequestList({
  data, manage, showLegacyFallback, generation, openId, onOpen, onSaved, onRefresh,
}: {
  data: AdminRequestsPage
  manage: boolean
  showLegacyFallback: boolean
  generation: number
  openId: string | null
  onOpen: (id: string | null) => void
  onSaved: (request: AdminRequest, message: string) => void
  onRefresh: () => void
}) {
  const entries = [
    ...data.requests.map((request) => ({
      key: request.id, createdAt: request.created_at, title: request.title, kind: REQUEST_KINDS[request.kind],
      status: request.requester_review === "reopened" ? "재확인 요청" : REQUEST_STATUSES[request.status],
      unacknowledged: !request.acknowledged_at, request, bug: null,
    })),
    ...(data.bugs ?? []).map((bug) => ({
      key: "bug-" + bug.id, createdAt: bug.createdAt, title: bug.title, kind: "기존 버그",
      status: bug.status === "resolved" ? "해결" : REQUEST_STATUSES[bug.status],
      unacknowledged: false, request: null, bug,
    })),
  ].sort((first, second) => second.createdAt.localeCompare(first.createdAt))

  return (
    <div className="grid gap-2">
      {showLegacyFallback && data.bugs === null && (
        <p className="text-sm text-fg-muted">기존 버그 리포트는 <Link href="/admin/dev?tab=bugs" className="text-fg-accent underline">개발 도구</Link>에서도 확인할 수 있습니다.</p>
      )}
      {entries.length === 0 ? (
        <p className={PANEL + " text-sm text-fg-muted"}>이 조건에 맞는 요청이 없습니다.</p>
      ) : (
        <ul aria-label="요청 목록" className="overflow-hidden divide-y divide-line-hair rounded-xl border border-line-hair bg-surface-sheet">
          {entries.map((entry) => {
            const expanded = openId === entry.key
            const { request, bug, title, kind, status, unacknowledged } = entry
            const detailId = `request-${entry.key}`
            const Chevron = expanded ? ChevronDown : ChevronRight

            return (
              <li key={entry.key}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={expanded ? detailId : undefined}
                  onClick={() => onOpen(expanded ? null : entry.key)}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fg-accent sm:gap-3 sm:px-4"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg-ink" title={title}>{title}</span>
                  {unacknowledged && <span className="hidden shrink-0 text-xs font-semibold text-fg-ink sm:inline">미확인</span>}
                  <span className="hidden shrink-0 text-xs text-fg-muted sm:inline">{kind}</span>
                  <span className="shrink-0 text-xs text-fg-muted">{status}</span>
                  <Chevron className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                </button>
                {expanded && (
                  request ? (
                    <div className="px-3 pb-4 sm:px-4">
                      <RequestThread key={request.id} id={request.id} manage={manage} generation={generation} onSaved={onSaved} onRefresh={onRefresh} />
                    </div>
                  ) : bug && (
                    <div id={detailId} className="grid gap-2 border-t border-line-hair px-3 py-3 text-sm sm:px-4">
                      <h2 className="break-words font-semibold text-fg-ink">{bug.title}</h2>
                      <p className="text-xs text-fg-muted">기존 버그 · {bug.severity} · {bug.assignee || "담당 미지정"}</p>
                      <p className="whitespace-pre-wrap break-words">{bug.description}</p>
                      <Link href="/admin/dev?tab=bugs" className="w-fit font-semibold text-fg-accent underline">버그 리포트에서 관리</Link>
                    </div>
                  )
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function RequestsWorkspace({ testSite, initialCanManage, initialRequest, ...context }: RequestContext & {
  testSite: string
  initialCanManage: boolean
  initialRequest: string | null
}) {
  const [view, setView] = useState<View>(!initialRequest && (context.screen || context.testVersion || context.errorCode) ? "new" : initialCanManage ? "manage" : "mine")
  const [page, setPage] = useState(0)
  const [generation, setGeneration] = useState(0)
  const [loaded, setLoaded] = useState<{ key: string; data: AdminRequestsPage | null; error?: string }>()
  const [canManage, setCanManage] = useState(initialCanManage)
  const [notice, setNotice] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const [formOpened, setFormOpened] = useState(view === "new")
  const [formKey, setFormKey] = useState(0)
  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all")
  const [kindFilter, setKindFilter] = useState<"all" | RequestKind>("all")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [queue, setQueue] = useState<AdminRequestQueue | null>(null)
  const listView = view === "manage" ? "manage" : "mine"
  const listKey = JSON.stringify([listView, page, statusFilter, kindFilter, queue, search]) + ":"
  const resultKey = listKey + generation
  const result = loaded?.key === resultKey ? loaded : undefined

  useEffect(() => {
    if (initialRequest) return
    const controller = new AbortController()
    const query = new URLSearchParams({ view: listView, page: String(page) })
    if (statusFilter !== "all") query.set("status", statusFilter)
    if (queue) query.set("queue", queue)
    if (kindFilter !== "all") query.set("kind", kindFilter)
    if (search) query.set("q", search)
    void adminFetchJson<AdminRequestsPage>(API + "?" + query, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        if (!Array.isArray(data?.requests)) throw new Error("요청 목록을 확인하지 못했습니다.")
        setCanManage(data.canManage)
        setLoaded((previous) => {
          if (!previous?.key.startsWith(listKey) || !previous.data) return { key: resultKey, data }
          const current = new Map(previous.data.requests.map((request) => [request.id, request]))
          return {
            key: resultKey,
            data: {
              ...data,
              requests: data.requests.map((request) => {
                const newer = current.get(request.id)
                return newer && newer.revision > request.revision ? newer : request
              }),
            },
          }
        })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setLoaded((previous) => ({
          key: resultKey,
          data: previous?.key.startsWith(listKey) ? previous.data : null,
          error: messageFor(error),
        }))
      })
    return () => controller.abort()
  }, [initialRequest, listView, page, listKey, resultKey, statusFilter, queue, kindFilter, search])

  const changeView = (next: View) => {
    setPage(0)
    if (next === "new") setFormOpened(true)
    setView(next)
    setNotice("")
    setStatusFilter("all")
    setKindFilter("all")
    setSearchInput("")
    setSearch("")
    setQueue(null)
    setOpenId(null)
  }
  const views: { id: View; label: string; icon?: LucideIcon }[] = [
    { id: "mine", label: "내 요청", icon: Inbox },
    ...(canManage ? [{ id: "manage" as const, label: "요청 관리" }] : []),
    { id: "new", label: "요청 보내기", icon: Send },
  ]
  const data = result?.data ?? (loaded?.key.startsWith(listKey) ? loaded.data : null)
  const counts = loaded?.key.startsWith(`[${JSON.stringify(listView)},`) ? loaded.data?.queueCounts : null
  const queues: AdminRequestQueue[] = view === "manage" ? ["unacknowledged", "reopened"] : ["review"]

  function changeQueue(next: AdminRequestQueue) {
    setPage(0)
    setOpenId(null)
    setStatusFilter("all")
    setQueue((current) => current === next ? null : next)
  }

  function filterTitle(value: string) {
    setSearch(value.trim())
    setPage(0)
    setOpenId(null)
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-fg-ink">요청</h1>
        <a href={testSite} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-line-control px-3 text-sm font-semibold text-fg-accent">
          테스트 화면 열기
        </a>
      </header>
      {initialRequest ? (
        <Button asChild size="md" variant="ghost" className="w-fit px-0">
          <Link href={ADMIN_REQUESTS_HREF}><ArrowLeft aria-hidden="true" /> 요청 목록</Link>
        </Button>
      ) : <nav aria-label="요청 메뉴" className="flex flex-wrap items-center gap-2 border-b border-line-hair pb-3">
        {views.map(({ id, label, icon: Icon }) => (
          <Button
            key={id} type="button" aria-pressed={view === id}
            aria-label={Icon ? label : undefined} title={Icon ? label : undefined}
            size={Icon ? "icon-md" : "default"}
            variant={Icon ? "ghost" : view === id ? "default" : "outline"}
            className={Icon ? "text-fg-muted hover:text-fg-accent aria-pressed:text-fg-accent [&_svg]:size-5 aria-pressed:[&_svg]:stroke-[2.5]" : undefined}
            onClick={() => changeView(id)}
          >
            {Icon ? <Icon aria-hidden="true" /> : label}
          </Button>
        ))}
      </nav>}
      {notice && <p role="status" className="text-sm font-semibold text-fg-accent">{notice}</p>}
      {initialRequest && (
        <div className={PANEL}>
          <RequestThread id={initialRequest} manage={canManage} standalone generation={generation}
            onSaved={(_, message) => setNotice(message)} onRefresh={() => setGeneration((value) => value + 1)} />
        </div>
      )}
      {formOpened && (
        <div hidden={view !== "new"}>
          <RequestForm key={formKey} context={context} onSubmit={(request) => {
            changeView("mine")
            setFormKey((value) => value + 1)
            setOpenId(request.id)
            setNotice("요청이 접수되었습니다.")
            setGeneration((value) => value + 1)
          }} />
        </div>
      )}
      {!initialRequest && view !== "new" && (
        <>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={view === "manage" ? "담당자 처리할 요청" : "내 차례"}>
            {queues.map((item) => (
              <Button
                key={item}
                type="button"
                variant={queue === item ? "default" : "outline"}
                aria-pressed={queue === item}
                onClick={() => changeQueue(item)}
              >
                {ADMIN_REQUEST_QUEUES[item]}
                {typeof counts?.[item] === "number" && <span className="tabular-nums">{counts[item]}건</span>}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {view === "manage" && (
              <form role="search" className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-1" onSubmit={(event) => {
                event.preventDefault()
                filterTitle(searchInput)
              }}>
                <input type="search" aria-label="요청 제목 검색" placeholder="요청 제목 검색" className={FIELD + " min-w-36 flex-1 text-sm"} value={searchInput}
                  onChange={(event) => { setSearchInput(event.target.value); if (!event.target.value) filterTitle("") }} maxLength={REQUEST_SEARCH_MAX_LENGTH} />
                <Button type="submit" size="icon-md" variant="ghost" aria-label="검색" title="검색"><Search aria-hidden="true" /></Button>
              </form>
            )}
            <label className="flex items-center gap-2 text-sm">
              상태
              <select className={FIELD + " w-auto"} value={statusFilter} onChange={(event) => {
                setPage(0)
                setOpenId(null)
                setQueue(null)
                setStatusFilter(event.target.value as typeof statusFilter)
              }}>
                <option value="all">전체</option>
                {Object.entries(REQUEST_STATUSES).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
              </select>
            </label>
            {view === "manage" && (
              <label className="flex items-center gap-2 text-sm">
                분류
                <select className={FIELD + " w-auto"} value={kindFilter} onChange={(event) => {
                  setPage(0)
                  setOpenId(null)
                  setKindFilter(event.target.value as typeof kindFilter)
                }}>
                  <option value="all">전체</option>
                  {Object.entries(REQUEST_KINDS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
                </select>
              </label>
            )}
            <Button type="button" size="icon-md" variant="ghost" aria-label="새로고침" title="새로고침" onClick={() => setGeneration((value) => value + 1)}><RefreshCw aria-hidden="true" /></Button>
          </div>
          {!result && <p role="status" className="text-sm text-fg-muted">요청을 불러오는 중…</p>}
          {result?.error && <p role="alert" className="text-sm text-fg-danger">{result.error}</p>}
          {data && (
            <RequestList
              data={statusFilter === "all" ? data : {
                ...data,
                requests: data.requests.filter((request) => request.status === statusFilter),
              }}
              manage={view === "manage"}
              showLegacyFallback={view === "manage" && !queue && page === 0 && (kindFilter === "all" || kindFilter === "bug")}
              generation={generation}
              openId={openId}
              onOpen={setOpenId}
              onRefresh={() => setGeneration((value) => value + 1)}
              onSaved={(updated, message) => {
                setNotice(message)
                setGeneration((value) => value + 1)
                setLoaded((previous) => previous?.data && previous.key.startsWith(listKey) ? {
                  ...previous,
                  data: {
                    ...previous.data,
                    requests: previous.data.requests.map((request) => request.id === updated.id && request.revision <= updated.revision ? {
                      ...request,
                      status: updated.status,
                      acknowledged_at: updated.acknowledged_at,
                      requester_review: updated.requester_review,
                      revision: updated.revision,
                      updated_at: updated.updated_at,
                    } : request),
                  },
                } : previous)
              }}
            />
          )}
          {(page > 0 || data?.hasMore) && (
            <nav aria-label="요청 목록 페이지" className="flex gap-2">
              <Button type="button" variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>이전</Button>
              <Button type="button" variant="outline" disabled={!data?.hasMore} onClick={() => setPage((value) => value + 1)}>다음</Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
