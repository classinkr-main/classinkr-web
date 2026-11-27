"use client"

import { ClipboardCopy, FileText, Link2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { adminFetchJson } from "@/lib/admin-client"
import { copyText } from "@/lib/admin-ai/copy"
import { buildRequestAiBrief } from "@/lib/admin/request-ai-brief"
import {
  ADMIN_REQUESTS_API, ADMIN_REQUESTS_HREF, REQUEST_STATUSES, type AdminRequest, type RequestReview, type RequestStatus,
} from "@/lib/admin/requests"
import { RequestWriteRejection, sendRequestWrite, verifyRequestData } from "./request-write"

const FIELD = "min-h-11 w-full rounded-lg border border-line-control bg-surface-sheet px-3 py-2 font-normal"
const DATE = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" })

function formatDate(value: string) {
  return DATE.format(new Date(value))
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다."
}

type Change = { status: RequestStatus; acknowledge: boolean; reply: string }
  | { action: "review"; review: RequestReview; reply: string }

type Attempt = { change: Change; revision: number; mutationId: string }

function RequestAiMaterials({ request }: { request: AdminRequest }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [feedback, setFeedback] = useState("")
  const markdownUrl = ADMIN_REQUESTS_API + "?" + new URLSearchParams({ id: request.id, view: "manage", format: "markdown" })

  return (
    <details className="grid gap-2 rounded-lg border border-line-hair px-3 py-2.5" onToggle={(event) => {
      if (event.currentTarget.open) setDraft((current) => current ?? buildRequestAiBrief(request))
    }}>
      <summary className="cursor-pointer font-semibold text-fg-ink">AI 점검 자료</summary>
      {draft !== null && (
        <div className="mt-2 grid gap-2">
          <label className="grid gap-1.5 font-semibold">
            공유할 내용
            <textarea className={FIELD + " font-mono text-xs"} rows={7} value={draft} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <p className="text-xs text-fg-muted">공유 전 민감정보가 남아 있는지 확인하세요. 원본 로그와 캡처는 요청 상세에서 확인할 수 있습니다.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={async () => {
              setFeedback(await copyText(draft) ? "AI 점검 자료를 복사했습니다." : "복사하지 못했습니다. 공유할 내용을 직접 선택해 주세요.")
            }}><ClipboardCopy aria-hidden="true" /> 점검 자료 복사</Button>
            <Button asChild variant="ghost">
              <a href={markdownUrl} target="_blank" rel="noreferrer"><FileText aria-hidden="true" /> Markdown 원본</a>
            </Button>
          </div>
          <span role="status" className="text-xs text-fg-muted">{feedback}</span>
        </div>
      )}
    </details>
  )
}

function ThreadContent({
  request, manage, standalone, onChange,
}: {
  request: AdminRequest
  manage: boolean
  standalone: boolean
  onChange: (attempt: Attempt) => Promise<"saved" | "rejected" | "uncertain">
}) {
  const [editedStatus, setEditedStatus] = useState<RequestStatus | null>(null)
  const status = editedStatus ?? request.status
  const [reply, setReply] = useState("")
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState<Attempt | null>(null)
  const [linkFeedback, setLinkFeedback] = useState("")
  const working = useRef(false)

  async function save(attempt: Attempt) {
    if (working.current) return
    working.current = true
    setBusy(true)
    try {
      const outcome = await onChange(attempt)
      setRetry(outcome === "uncertain" ? attempt : null)
      const { change } = attempt
      if (outcome === "saved" && ("action" in change || !change.acknowledge)) {
        setReply("")
        setEditedStatus(null)
      }
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  function startChange(change: Change) {
    if (!retry && !working.current) {
      void save({ change, revision: request.revision, mutationId: crypto.randomUUID() })
    }
  }

  return (
    <div className="grid gap-4 pb-1 pt-4 text-sm">
      {standalone && (
        <div className="grid gap-1">
          <h2 className="break-words text-xl font-semibold text-fg-ink">{request.title}</h2>
          <p className="text-fg-muted">{REQUEST_STATUSES[request.status]} · {formatDate(request.created_at)}</p>
        </div>
      )}
      <p className="whitespace-pre-wrap break-words">{request.description}</p>
      {(request.screen || request.test_version || request.error_code) && (
        <dl className="flex flex-wrap gap-x-5 gap-y-1 break-all text-fg-muted">
          {request.screen && <div><dt className="inline font-semibold">화면 </dt><dd className="inline">{request.screen}</dd></div>}
          {request.test_version && <div><dt className="inline font-semibold">테스트 버전 </dt><dd className="inline">{request.test_version}</dd></div>}
          {request.error_code && <div><dt className="inline font-semibold">오류 코드 </dt><dd className="inline">{request.error_code}</dd></div>}
        </dl>
      )}
      {request.logs && (
        <details className="rounded-lg border border-line-hair p-3">
          <summary className="cursor-pointer font-semibold">관련 로그</summary>
          <pre className="mt-2 whitespace-pre-wrap break-all text-xs">{request.logs}</pre>
        </details>
      )}
      {request.capture_mime ? (
        <div className="flex flex-wrap items-center gap-2">
          <a href={ADMIN_REQUESTS_API + "?capture=" + request.id} target="_blank" rel="noreferrer" className="font-semibold text-fg-accent underline">캡처 열기</a>
          {request.capture_expires_at && <span className="text-fg-muted">{formatDate(request.capture_expires_at)}까지 열기 가능</span>}
        </div>
      ) : request.capture_expires_at && <p className="text-fg-muted">캡처 보관 기간이 지났습니다.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" className="px-0" onClick={async () => {
          const url = new URL(ADMIN_REQUESTS_HREF, window.location.origin)
          url.searchParams.set("request", request.id)
          setLinkFeedback(await copyText(url.href) ? "요청 링크를 복사했습니다." : url.href)
        }}><Link2 aria-hidden="true" /> 요청 링크 복사</Button>
        <span role="status" className="break-all text-xs text-fg-muted">{linkFeedback}</span>
      </div>
      {manage && <RequestAiMaterials key={request.revision} request={request} />}
      <div className="grid gap-2 rounded-lg bg-surface-sunken p-3 text-fg-muted">
        <p>
          {request.acknowledged_at
            ? `담당자 확인 · ${request.acknowledged_by} · ${formatDate(request.acknowledged_at)}`
            : "담당자 확인 전"}
        </p>
        {request.requester_reviewed_at && (
          <p>
            {request.requester_review === "confirmed" ? "요청자가 해결 확인" : "요청자가 재확인 요청"} · {formatDate(request.requester_reviewed_at)}
          </p>
        )}
        {request.status === "resolved" && <p>요청자의 해결 확인을 기다리고 있습니다.</p>}
      </div>
      {request.replies.length > 0 && (
        <ol aria-label="답변 기록" className="grid gap-3">
          {request.replies.map((entry, index) => (
            <li key={entry.at + index} className="border-l-2 border-line-strong pl-3">
              <p className="text-fg-muted">
                <strong>{entry.author}</strong> · {entry.from === "reporter" ? "요청자" : "담당자"} · {formatDate(entry.at)}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words">{entry.text}</p>
            </li>
          ))}
        </ol>
      )}

      {manage ? (
        <form className="grid gap-3 border-t border-line-hair pt-4" onSubmit={(event) => {
          event.preventDefault()
          startChange({ status, reply, acknowledge: false })
        }}>
          <fieldset disabled={busy || !!retry} className="grid gap-3">
            {!request.acknowledged_at && (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" onClick={() => startChange({ status: request.status, reply: "", acknowledge: true })}>확인함</Button>
                {request.capture_mime && <span className="text-fg-muted">확인한 시점부터 7일간 캡처를 볼 수 있습니다.</span>}
              </div>
            )}
            <label className="grid gap-1.5 font-semibold">
              상태
              <select className={FIELD} value={status} onChange={(event) => setEditedStatus(event.target.value as RequestStatus)}>
                {Object.entries(REQUEST_STATUSES).filter(([value]) => value !== "closed" || request.status === "closed")
                  .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 font-semibold">
              답변
              <textarea className={FIELD} rows={3} maxLength={4000} value={reply} onChange={(event) => setReply(event.target.value)} />
            </label>
            <Button type="submit" className="w-fit" disabled={!reply.trim() && status === request.status}>
              {busy ? "저장 중…" : "변경 저장"}
            </Button>
          </fieldset>
        </form>
      ) : request.status === "resolved" && (
        <fieldset disabled={busy || !!retry} className="grid gap-3 border-t border-line-hair pt-4">
          <legend className="font-semibold">처리 결과 확인</legend>
          <label className="grid gap-1.5 font-semibold">
            남은 문제 (선택)
            <textarea className={FIELD} rows={2} maxLength={4000} value={reply} onChange={(event) => setReply(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => startChange({ action: "review", review: "confirmed", reply: "" })}>해결 확인</Button>
            <Button type="button" variant="outline" onClick={() => startChange({ action: "review", review: "reopened", reply })}>재확인 요청</Button>
          </div>
        </fieldset>
      )}
      {retry && (
        <Button type="button" className="w-fit" variant="outline" disabled={busy} onClick={() => void save(retry)}>
          {busy ? "저장 결과 확인 중…" : "저장 결과 다시 확인"}
        </Button>
      )}
    </div>
  )
}

export function RequestThread({
  id, manage, standalone = false, generation, onSaved, onRefresh,
}: {
  id: string
  manage: boolean
  standalone?: boolean
  generation: number
  onSaved: (request: AdminRequest, message: string) => void
  onRefresh: () => void
}) {
  const [request, setRequest] = useState<AdminRequest>()
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ id, view: manage ? "manage" : "mine" })
    void adminFetchJson<AdminRequest>(ADMIN_REQUESTS_API + "?" + query, { signal: controller.signal })
      .then((data) => verifyRequestData(data, id))
      .then((data) => {
        if (controller.signal.aborted) return
        setRequest((previous) => previous && previous.revision > data.revision ? previous : data)
        setError("")
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(messageFor(cause))
      })
    return () => controller.abort()
  }, [id, manage, generation])

  async function save({ change, revision, mutationId }: Attempt) {
    setError("")
    try {
      const updated = await sendRequestWrite("PATCH", JSON.stringify({ ...change, id, revision, mutationId }), id)
      setRequest((previous) => previous && previous.revision > updated.revision ? previous : updated)
      const message = "action" in change
        ? change.review === "confirmed" ? "해결을 확인했습니다." : "담당자에게 재확인을 요청했습니다."
        : change.acknowledge ? "담당자 확인을 기록했습니다." : "변경을 저장했습니다."
      onSaved(updated, message)
      return "saved" as const
    } catch (cause) {
      if (cause instanceof RequestWriteRejection) {
        setError(cause.message)
        return "rejected" as const
      }
      setError("저장 결과를 확인하지 못했습니다. 같은 내용으로 저장 여부를 다시 확인할 수 있습니다.")
      return "uncertain" as const
    }
  }

  return (
    <div id={`request-${id}`} className={standalone ? undefined : "border-t border-line-hair"}>
      {request && <ThreadContent request={request} manage={manage} standalone={standalone} onChange={save} />}
      {error ? (
        <div className="flex flex-wrap items-center gap-2 py-3">
          <p role="alert" className="text-sm text-fg-danger">{error}</p>
          <Button type="button" variant="outline" onClick={onRefresh}>최신 상태 불러오기</Button>
        </div>
      ) : !request && <p className="py-3 text-sm text-fg-muted" role="status">요청 내용을 불러오는 중…</p>}
    </div>
  )
}
