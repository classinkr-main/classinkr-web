"use client"

import { ImageIcon, Inbox, List, MessageSquarePlus, Send, X } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { ADMIN_REQUESTS_HREF, REQUEST_CAPTURE_BYTES, REQUEST_CAPTURE_TYPES, REQUEST_KINDS, type AdminRequest } from "@/lib/admin/requests"
import { RequestWriteRejection, sendRequestWrite } from "./request-write"

const PANEL = "grid max-w-3xl gap-4 rounded-xl border border-line-hair bg-surface-sheet p-4 sm:p-6"
const FIELD = "min-h-11 w-full rounded-lg border border-line-control bg-surface-sheet px-3 py-2 font-normal"
const FIELD_COMPACT = "min-h-10 w-full rounded-lg border border-line-control bg-surface-sheet px-2.5 py-1.5 text-sm font-normal"

export type RequestContext = { screen: string | null; testVersion: string | null; errorCode: string | null }

export function RequestForm({ context, onSubmit, widget }: {
  context: RequestContext
  onSubmit: (request: AdminRequest) => void
  widget?: { screenLabel: string; titleId: string; onClose: () => void }
}) {
  const router = useRouter()
  const compact = Boolean(widget)
  const helpId = useId()
  const [showLogs, setShowLogs] = useState(false)
  const field = compact ? FIELD_COMPACT : FIELD
  const [leaveHref, setLeaveHref] = useState<string | null>(null)
  const formElement = useRef<HTMLFormElement>(null)
  const [capture, setCapture] = useState<{ file: File; url: string } | null>(null)
  const [draggingCapture, setDraggingCapture] = useState(false)
  const [hasDraftText, setHasDraftText] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [captureError, setCaptureError] = useState("")
  const captureButton = useRef<HTMLButtonElement>(null)
  const upload = useRef<HTMLInputElement>(null)
  const working = useRef(false)
  const [retry, setRetry] = useState<{ id: string; form: FormData } | null>(null)
  const hasDraft = hasDraftText || capture !== null
  const captureUrl = capture?.url
  const canAttach = !pending && !retry && !leaveHref
  const showDropTarget = draggingCapture && canAttach

  useEffect(() => {
    if (captureUrl) return () => URL.revokeObjectURL(captureUrl)
  }, [captureUrl])

  useEffect(() => {
    if (!hasDraft) return

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    const confirmLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return
      const next = new URL(anchor.href, window.location.href)
      if (next.origin !== window.location.origin) return
      if (next.pathname === window.location.pathname && next.search === window.location.search) return
      event.preventDefault()
      event.stopPropagation()
      setLeaveHref(next.pathname + next.search + next.hash)
    }
    window.addEventListener("beforeunload", beforeUnload)
    if (!compact) document.addEventListener("click", confirmLink, true)
    return () => {
      window.removeEventListener("beforeunload", beforeUnload)
      document.removeEventListener("click", confirmLink, true)
    }
  }, [hasDraft, compact])

  const chooseCapture = useCallback((file: File | null) => {
    if (file && (!REQUEST_CAPTURE_TYPES.some((type) => type === file.type) || file.size === 0 || file.size > REQUEST_CAPTURE_BYTES)) {
      setCapture(null)
      setCaptureError("캡처는 2MB 이하의 PNG, JPG 또는 WebP 이미지로 올려 주세요.")
      if (upload.current) upload.current.value = ""
      return
    }
    setCaptureError("")
    setCapture(file ? { file, url: URL.createObjectURL(file) } : null)
  }, [])

  useEffect(() => {
    const form = formElement.current
    if (!form || !canAttach) return

    function pasteCapture(event: Event) {
      if (!(event instanceof ClipboardEvent) || event.defaultPrevented || working.current) return
      const target = event.target
      const pageHasNoFocus = target === document.body || target === document.documentElement || target === document
      if (!pageHasNoFocus && !(target instanceof Node && form?.contains(target))) return

      const clipboard = event.clipboardData
      if (!clipboard) return
      const file = Array.from(clipboard.files).find((item) => item.type.startsWith("image/"))
        ?? Array.from(clipboard.items).find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile()
      if (!file) return

      event.preventDefault()
      if (upload.current) upload.current.value = ""
      chooseCapture(file)
    }

    const pasteTarget = compact ? document : form
    pasteTarget.addEventListener("paste", pasteCapture)
    return () => pasteTarget.removeEventListener("paste", pasteCapture)
  }, [canAttach, chooseCapture, compact])

  function dragOverCapture(event: DragEvent<HTMLFormElement>) {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    event.dataTransfer.dropEffect = canAttach ? "copy" : "none"
    setDraggingCapture(canAttach)
  }

  function dropCapture(event: DragEvent<HTMLFormElement>) {
    const files = Array.from(event.dataTransfer.files)
    if (files.length === 0) return
    event.preventDefault()
    setDraggingCapture(false)
    if (!canAttach || working.current) return

    if (upload.current) upload.current.value = ""
    chooseCapture(files.find((file) => file.type.startsWith("image/")) ?? files[0])
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (working.current || captureError) return

    let submission = retry
    if (!submission) {
      const form = new FormData(event.currentTarget)
      const id = crypto.randomUUID()
      form.set("submissionId", id)
      if (capture) form.set("capture", capture.file)
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

  function discardAndLeave() {
    if (!leaveHref) return

    formElement.current?.reset()
    chooseCapture(null)
    setHasDraftText(false)
    setRetry(null)
    setError("")
    setLeaveHref(null)
    widget?.onClose()
    if (leaveHref !== "close") router.push(leaveHref)
  }

  function leaveWidget(href: string) {
    if (pending) return
    if (hasDraft) {
      setLeaveHref(href)
      return
    }

    widget?.onClose()
    if (href !== "close") router.push(href)
  }

  return (
    <form
      ref={formElement}
      tabIndex={compact ? -1 : undefined}
      className={compact ? "flex min-h-0 flex-col" : PANEL}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (widget && event.key === "Escape" && !leaveHref) {
          event.stopPropagation()
          leaveWidget("close")
        }
      }}
      onChange={(event) => {
        const form = new FormData(event.currentTarget)
        setHasDraftText(form.get("kind") !== "bug" || ["title", "description", "logs"].some(
          (name) => String(form.get(name) ?? "").trim() !== "",
        ))
      }}
      onDragOver={dragOverCapture}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
          setDraggingCapture(false)
        }
      }}
      onDrop={dropCapture}
    >
      {widget && (
        <header className="flex shrink-0 items-center justify-between gap-2 px-4 pt-2">
          <h2 id={widget.titleId} className="flex items-center gap-2 text-base font-bold text-fg-ink">
            <MessageSquarePlus className="size-5" aria-hidden="true" />
            빠른 요청
          </h2>
          <Button type="button" size="icon-md" variant="ghost" aria-label="빠른 요청 닫기" onClick={() => leaveWidget("close")} disabled={pending}>
            <X aria-hidden="true" />
          </Button>
        </header>
      )}
      <fieldset
        className={compact ? "grid min-h-0 min-w-0 gap-2.5 overflow-y-auto overscroll-contain px-4 pb-2" : "grid min-w-0 gap-4"}
        disabled={pending || !!retry}
      >
        {widget ? (
          <p className="text-xs text-fg-muted">현재 화면 · {widget.screenLabel}</p>
        ) : (context.screen || context.testVersion || context.errorCode) && (
          <dl className="grid gap-1 break-all text-sm text-fg-muted">
            {context.screen && <div><dt className="inline font-semibold">화면 </dt><dd className="inline">{context.screen}</dd></div>}
            {context.testVersion && <div><dt className="inline font-semibold">테스트 버전 </dt><dd className="inline">{context.testVersion}</dd></div>}
            {context.errorCode && <div><dt className="inline font-semibold">오류 코드 </dt><dd className="inline">{context.errorCode}</dd></div>}
          </dl>
        )}
        <label className="grid gap-1.5 text-sm font-semibold">
          분류
          <select className={field} name="kind" defaultValue="bug">
            {Object.entries(REQUEST_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          제목
          <input className={field} name="title" maxLength={120} required />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          내용
          <textarea
            className={`${field}${showDropTarget ? " border-fg-accent bg-surface-sunken" : ""}`}
            name="description" rows={compact ? 2 : 4} maxLength={4000} required
            placeholder="어떤 화면에서 어떤 동작을 했는지 알려주세요."
          />
        </label>
        {compact ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button" variant="outline" size="sm"
                className={showDropTarget ? "min-h-10 border-fg-accent bg-surface-sunken" : "min-h-10"}
                ref={captureButton} aria-describedby={helpId + "-capture"} onClick={() => upload.current?.click()}
              >
                <ImageIcon aria-hidden="true" /> 캡처 붙이기
              </Button>
              <Button
                type="button" variant="outline" size="sm" className="min-h-10"
                aria-expanded={showLogs} aria-controls={helpId + "-log-field"} onClick={() => setShowLogs((open) => !open)}
              >
                <List aria-hidden="true" /> 로그 추가
              </Button>
            </div>
            <label id={helpId + "-log-field"} hidden={!showLogs} className="text-xs font-semibold text-fg-ink">
              오류 메시지 또는 재현 시각
              <textarea className={field + " mt-1"} name="logs" rows={3} maxLength={8000} aria-describedby={helpId + "-logs"} />
              <span id={helpId + "-logs"} className="font-normal text-fg-muted">비밀번호, 키, 고객 연락처를 가려 주세요.</span>
            </label>
          </>
        ) : (
          <details className="rounded-lg border border-line-hair p-3">
            <summary className="cursor-pointer py-1.5 text-sm font-semibold">관련 로그 추가 (선택)</summary>
            <label className="mt-2 grid gap-1.5 text-sm">
              오류 메시지 또는 재현 시각
              <textarea className={field} name="logs" rows={4} maxLength={8000} aria-describedby={helpId + "-logs"} />
            </label>
            <p id={helpId + "-logs"} className="mt-2 text-sm text-fg-muted">비밀번호, 키, 고객 연락처를 가려 주세요.</p>
          </details>
        )}
        <div className="grid gap-2">
          <label hidden={compact} className={compact ? undefined : "grid gap-1.5 text-sm font-semibold"}>
            캡처 (선택)
            <input
              ref={upload}
              aria-describedby={helpId + "-capture"}
              className={field}
              type="file"
              accept={REQUEST_CAPTURE_TYPES.join(",")}
              onChange={(event) => chooseCapture(event.target.files?.[0] ?? null)}
            />
          </label>
          <p id={helpId + "-capture"} className={compact ? "text-xs text-fg-muted" : "text-sm text-fg-muted"}>
            {compact ? (
              <>사진 드래그 또는 Ctrl+V(⌘V)<br />캡처는 담당자 확인 7일 후 삭제됩니다.</>
            ) : "사진을 선택하거나 끌어다 놓거나 Ctrl+V(⌘V)로 붙여넣으세요. PNG, JPG, WebP 1장 · 최대 2MB. 담당자 확인 7일 후 삭제됩니다."}
          </p>
          {capture && (
            <Image
              src={capture.url}
              alt="첨부할 캡처 미리보기"
              width={480}
              height={320}
              unoptimized
              className={compact ? "h-auto max-h-20 w-auto max-w-full rounded-lg border border-line-hair object-contain" : "h-auto max-h-64 w-auto max-w-full rounded-lg border border-line-hair object-contain"}
            />
          )}
          {(capture || captureError) && (
            <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
              {capture && <span className="break-all">{capture.file.name} 첨부됨</span>}
              <Button type="button" variant="outline" onClick={() => {
                chooseCapture(null)
                if (upload.current) upload.current.value = ""
                const target = captureButton.current ?? upload.current
                target?.focus()
              }}>{capture ? "제거" : "첨부 없이 계속"}</Button>
            </div>
          )}
        </div>
      </fieldset>
      {hasDraft && !compact && <p className="text-sm text-fg-muted">등록 전에 페이지를 벗어나면 작성한 내용이 지워집니다.</p>}
      {(error || captureError) && <p role="alert" className={compact ? "px-4 text-xs text-fg-danger" : "text-sm text-fg-danger"}>{error || captureError}</p>}
      <footer className={compact ? "flex shrink-0 items-center justify-between gap-2 px-4 pb-3 pt-1.5" : undefined}>
        {widget && (
          <Button type="button" size="sm" variant="link" className="min-h-11 px-0 text-fg-ink" onClick={() => leaveWidget(ADMIN_REQUESTS_HREF)} disabled={pending}>
            <Inbox aria-hidden="true" />
            내 요청
          </Button>
        )}
        <Button type="submit" size={compact ? "md" : "default"} className="w-fit" disabled={pending || !!captureError}>
          <Send aria-hidden="true" />
          {pending ? "접수 중…" : retry ? "접수 다시 확인" : "요청 보내기"}
        </Button>
      </footer>
      <Dialog open={leaveHref !== null} onOpenChange={(open) => { if (!open) setLeaveHref(null) }}>
        <DialogContent className="z-[70]">
          <DialogTitle>작성 중인 요청이 있습니다</DialogTitle>
          <DialogDescription>{leaveHref === "close" ? "위젯을 닫으면 작성한 내용과 첨부가 지워집니다." : "페이지를 이동하면 작성한 내용과 첨부가 지워집니다."}</DialogDescription>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={discardAndLeave}>{leaveHref === "close" ? "닫기" : "이동하기"}</Button>
            <Button type="button" autoFocus onClick={() => setLeaveHref(null)}>계속 작성</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}
