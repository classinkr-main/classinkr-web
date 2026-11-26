"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type FormEvent } from "react"

import { adminFetchJson } from "@/lib/admin-client"
import {
  ADMIN_REQUESTS_API, REQUEST_CAPTURE_BYTES, REQUEST_CAPTURE_TYPES, REQUEST_KINDS, REQUEST_STATUSES,
  type AdminRequest, type AdminRequestsPage, type RequestStatus,
} from "@/lib/admin/requests"
import { Button } from "@/components/ui/button"
import { RequestThread } from "./RequestThread"
import { RequestWriteRejection, sendRequestWrite } from "./request-write"

const API = ADMIN_REQUESTS_API
const PANEL = "rounded-xl border border-line-hair bg-surface-sheet p-4 sm:p-6"
const FIELD = "min-h-11 w-full rounded-lg border border-line-control bg-surface-sheet px-3 py-2 font-normal"
const DATE = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" })

type RequestContext = { screen: string | null; testVersion: string | null; errorCode: string | null }
type View = "new" | "mine" | "manage"

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "요청에 실패했습니다."
}

function RequestForm({ context, onSubmit }: { context: RequestContext; onSubmit: (request: AdminRequest) => void }) {
  const [capture, setCapture] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [captureError, setCaptureError] = useState("")
  const upload = useRef<HTMLInputElement>(null)
  const working = useRef(false)
  const [retry, setRetry] = useState<{ id: string; form: FormData } | null>(null)

  function chooseCapture(file: File | null) {
    if (file && (!REQUEST_CAPTURE_TYPES.some((type) => type === file.type) || file.size === 0 || file.size > REQUEST_CAPTURE_BYTES)) {
      setCapture(null)
      setCaptureError("캡처는 2MB 이하의 PNG, JPG 또는 WebP 이미지로 올려 주세요.")
      if (upload.current) upload.current.value = ""
      return
    }
    setCaptureError("")
    setCapture(file)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (working.current || captureError) return

    let submission = retry
    if (!submission) {
      const form = new FormData(event.currentTarget)
      const id = crypto.randomUUID()
      form.set("submissionId", id)
      if (capture) form.set("capture", capture)
      if (context.screen) form.set("screen", context.screen)
      if (context.testVersion) form.set("testVersion", context.testVersion)
      if (context.errorCode) form.set("errorCode", context.errorCode)
      submission = { id, form }
    }

    working.current = true
    setPending(true)
    setError("")
    try {
      const request = await sendRequestWrite("POST", submission.form, submission.id)
      setRetry(null)
      onSubmit(request)
    } catch (cause) {
      if (cause instanceof RequestWriteRejection) {
        setRetry(null)
        setError(cause.message)
      } else {
        setRetry(submission)
        setError("접수 결과를 확인하지 못했습니다. 같은 내용으로 접수를 다시 확인할 수 있습니다.")
      }
    } finally {
      working.current = false
      setPending(false)
    }
  }

  return (
    <form
      className={PANEL + " grid max-w-3xl gap-4"}
      onSubmit={submit}
      onPaste={(event) => {
        if (pending || retry) return
        const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"))
        if (!file) return
        event.preventDefault()
        if (upload.current) upload.current.value = ""
        chooseCapture(file)
      }}
    >
      <fieldset className="grid min-w-0 gap-4" disabled={pending || !!retry}>
        {(context.screen || context.testVersion || context.errorCode) && (
          <dl className="grid gap-1 break-all text-sm text-fg-muted">
            {context.screen && <div><dt className="inline font-semibold">화면 </dt><dd className="inline">{context.screen}</dd></div>}
            {context.testVersion && <div><dt className="inline font-semibold">테스트 버전 </dt><dd className="inline">{context.testVersion}</dd></div>}
            {context.errorCode && <div><dt className="inline font-semibold">오류 코드 </dt><dd className="inline">{context.errorCode}</dd></div>}
          </dl>
        )}
        <label className="grid gap-1.5 text-sm font-semibold">
          분류
          <select className={FIELD} name="kind" defaultValue="bug">
            {Object.entries(REQUEST_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          제목
          <input className={FIELD} name="title" maxLength={120} required />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          내용
          <textarea className={FIELD} name="description" rows={4} maxLength={4000} required placeholder="어떤 화면에서 어떤 동작을 했는지 알려주세요." />
        </label>
        <details className="rounded-lg border border-line-hair p-3">
          <summary className="cursor-pointer py-1.5 text-sm font-semibold">관련 로그 추가 (선택)</summary>
          <label className="mt-2 grid gap-1.5 text-sm">
            오류 메시지 또는 재현 시각
            <textarea className={FIELD} name="logs" rows={4} maxLength={8000} aria-describedby="request-logs-help" />
          </label>
          <p id="request-logs-help" className="mt-2 text-sm text-fg-muted">비밀번호, 키, 고객 연락처를 가려 주세요.</p>
        </details>
        <div className="grid gap-2">
          <label className="grid gap-1.5 text-sm font-semibold">
            캡처 (선택)
            <input
              ref={upload}
              aria-describedby="request-capture-help"
              className={FIELD}
              type="file"
              accept={REQUEST_CAPTURE_TYPES.join(",")}
              onChange={(event) => chooseCapture(event.target.files?.[0] ?? null)}
            />
          </label>
          <p id="request-capture-help" className="text-sm text-fg-muted">이미지를 선택하거나 이 양식에 붙여넣으세요. PNG, JPG, WebP 1장 · 최대 2MB. 담당자 확인 7일 후 삭제됩니다.</p>
          {(capture || captureError) && (
            <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
              {capture && <span className="break-all">{capture.name} 첨부됨</span>}
              <Button type="button" variant="outline" onClick={() => {
                chooseCapture(null)
                if (upload.current) upload.current.value = ""
                upload.current?.focus()
              }}>{capture ? "제거" : "첨부 없이 계속"}</Button>
            </div>
          )}
        </div>
      </fieldset>
      {(error || captureError) && <p role="alert" className="text-sm text-fg-danger">{error || captureError}</p>}
      <Button className="w-fit" type="submit" disabled={pending || !!captureError}>
        {pending ? "접수 중…" : retry ? "접수 다시 확인" : "요청 등록"}
      </Button>
    </form>
  )
}

function RequestList({
  data, manage, generation, openId, onOpen, onSaved, onRefresh,
}: {
  data: AdminRequestsPage
  manage: boolean
  generation: number
  openId: string | null
  onOpen: (id: string | null) => void
  onSaved: (request: AdminRequest, message: string) => void
  onRefresh: () => void
}) {
  const entries = [
    ...data.requests.map((request) => ({ key: request.id, createdAt: request.created_at, request })),
    ...(data.bugs ?? []).map((bug) => ({ key: "bug-" + bug.id, createdAt: bug.createdAt, bug })),
  ].sort((first, second) => second.createdAt.localeCompare(first.createdAt))

  return (
    <div className="grid gap-3">
      {manage && data.bugs === null && (
        <p className="text-sm text-fg-muted">기존 버그 리포트는 <Link href="/admin/dev?tab=bugs" className="text-fg-accent underline">개발 도구</Link>에서도 확인할 수 있습니다.</p>
      )}
      {entries.length === 0 && <p className={PANEL + " text-sm text-fg-muted"}>이 조건에 맞는 요청이 없습니다.</p>}
      {entries.map((entry) => {
        if ("request" in entry) {
          const request = entry.request
          const expanded = openId === request.id
          const needsReview = request.status === "resolved" || request.requester_review === "reopened"
          return (
            <article key={entry.key} className="rounded-xl border border-line-hair bg-surface-sheet px-4 sm:px-6">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={expanded ? `request-${request.id}` : undefined}
                onClick={() => onOpen(expanded ? null : request.id)}
                className="grid min-h-11 w-full gap-1.5 break-words py-3 text-left"
              >
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{request.title}</span>
                  <span className={needsReview ? "text-sm font-semibold text-fg-accent" : "text-sm text-fg-muted"}>
                    {request.requester_review === "reopened" ? "재확인 요청" : REQUEST_STATUSES[request.status]}
                  </span>
                </span>
                <span className="text-sm text-fg-muted">
                  {REQUEST_KINDS[request.kind]} · {request.reporter_name} · {DATE.format(new Date(entry.createdAt))}
                  {!request.acknowledged_at && " · 담당자 확인 전"}
                </span>
              </button>
              {expanded && (
                <RequestThread key={request.id} id={request.id} manage={manage} generation={generation} onSaved={onSaved} onRefresh={onRefresh} />
              )}
            </article>
          )
        }

        return (
          <details key={entry.key} className={PANEL}>
            <summary className="cursor-pointer break-words font-semibold">
              {entry.bug.title}
              <span className="block pt-1 text-sm font-normal text-fg-muted">
                기존 버그 · {entry.bug.status === "resolved" ? "해결" : REQUEST_STATUSES[entry.bug.status]} · {entry.bug.severity} · {entry.bug.assignee || "담당 미지정"}
              </span>
            </summary>
            <p className="whitespace-pre-wrap break-words py-3 text-sm">{entry.bug.description}</p>
            <Link href="/admin/dev?tab=bugs" className="text-sm font-semibold text-fg-accent underline">버그 리포트에서 관리</Link>
          </details>
        )
      })}
    </div>
  )
}

export function RequestsWorkspace({ testSite, ...context }: RequestContext & { testSite: string }) {
  const [view, setView] = useState<View>(context.screen || context.testVersion || context.errorCode ? "new" : "mine")
  const [page, setPage] = useState(0)
  const [generation, setGeneration] = useState(0)
  const [loaded, setLoaded] = useState<{ key: string; data: AdminRequestsPage | null; error?: string }>()
  const [canManage, setCanManage] = useState(false)
  const [notice, setNotice] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const [formOpened, setFormOpened] = useState(view === "new")
  const [formKey, setFormKey] = useState(0)
  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all")
  const listView = view === "manage" ? "manage" : "mine"
  const listKey = listView + ":" + page + ":" + statusFilter + ":"
  const resultKey = listKey + generation
  const result = loaded?.key === resultKey ? loaded : undefined

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ view: listView, page: String(page) })
    if (statusFilter !== "all") query.set("status", statusFilter)
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
  }, [listView, page, listKey, resultKey, statusFilter])

  const changeView = (next: View) => {
    setPage(0)
    if (next === "new") setFormOpened(true)
    setView(next)
    setNotice("")
    setStatusFilter("all")
    setOpenId(null)
  }
  const views: { id: View; label: string }[] = [
    { id: "mine", label: "내 요청" },
    ...(canManage ? [{ id: "manage" as const, label: "요청 관리" }] : []),
    { id: "new", label: "새 요청" },
  ]
  const data = result?.data ?? (loaded?.key.startsWith(listKey) ? loaded.data : null)

  return (
    <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-fg-ink">요청</h1>
        <a href={testSite} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-line-control px-3 text-sm font-semibold text-fg-accent">
          테스트 화면 열기
        </a>
      </header>
      <nav aria-label="요청 메뉴" className="flex flex-wrap gap-2 border-b border-line-hair pb-3">
        {views.map(({ id, label }) => (
          <Button key={id} type="button" aria-pressed={view === id} variant={view === id ? "default" : "outline"} onClick={() => changeView(id)}>{label}</Button>
        ))}
      </nav>
      {notice && <p role="status" className="text-sm font-semibold text-fg-accent">{notice}</p>}
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
      {view !== "new" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              상태
              <select className={FIELD + " w-auto"} value={statusFilter} onChange={(event) => {
                setPage(0)
                setOpenId(null)
                setStatusFilter(event.target.value as typeof statusFilter)
              }}>
                <option value="all">전체</option>
                {Object.entries(REQUEST_STATUSES).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
              </select>
            </label>
            <Button type="button" variant="outline" onClick={() => setGeneration((value) => value + 1)}>새로고침</Button>
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
              generation={generation}
              openId={openId}
              onOpen={setOpenId}
              onRefresh={() => setGeneration((value) => value + 1)}
              onSaved={(updated, message) => {
                setNotice(message)
                if (statusFilter !== "all" && updated.status !== statusFilter) {
                  setGeneration((value) => value + 1)
                }
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
