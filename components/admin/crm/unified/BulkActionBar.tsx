"use client"

// 선택 + 일괄 행동 바 — 통합 목록에서 고른 행(현재 페이지)에 태그 붙이기 / 할 일 만들기 / CSV.
// 화면 하단 고정 오버레이라 admin 트리 규약대로 document.body 포털로 그린다(조상 transform·overflow 무관).
// 요청·응답 요약은 ./bulk-actions.ts(순수 헬퍼 + 호출)가 소유하고, 여기는 입력·진행 상태만 가진다.
// 성공하면 부모가 목록을 다시 불러오고 토스트를 띄운다(onCompleted). 실패는 바 안에 인라인으로 남긴다.

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { CalendarPlus, Download, Tag, X } from "lucide-react"

import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import { SUGGESTED_TAGS } from "@/lib/crm/tag-suggestions"
import {
  BULK_TAG_MAX_KEYS,
  BULK_TAG_MAX_LENGTH,
  BULK_TASK_MAX_KEYS,
  BULK_TASK_PRESETS,
  BULK_TASK_TITLE_MAX_LENGTH,
  bulkResultTone,
  normalizeBulkTagLabel,
  postBulkTags,
  postBulkTasks,
  resolveBulkTaskDueAt,
  summarizeBulkTagResult,
  summarizeBulkTaskResult,
  validateBulkTagLabel,
  validateBulkTaskTitle,
  type BulkTaskPreset,
} from "./bulk-actions"

type Mode = "idle" | "tag" | "task"

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function BulkActionBar({
  selectedKeys,
  onClearSelection,
  onCompleted,
  onExportSelected,
  canExportCsv,
  exporting,
}: {
  selectedKeys: readonly string[]
  onClearSelection: () => void
  /** 쓰기 성공(부분 실패 포함) — 부모가 토스트를 띄우고 목록을 다시 불러온다. */
  onCompleted: (message: string, tone: "success" | "error") => void
  /** 선택 행만 CSV(서버 내보내기 — 관리자만). */
  onExportSelected: () => void
  canExportCsv: boolean
  exporting: boolean
}) {
  const [mounted, setMounted] = useState(false)
  const [mode, setMode] = useState<Mode>("idle")
  const [tagLabel, setTagLabel] = useState("")
  const [taskTitle, setTaskTitle] = useState("")
  const [taskPreset, setTaskPreset] = useState<BulkTaskPreset | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const count = selectedKeys.length
  if (!mounted || count === 0) return null

  const resetForms = () => {
    setMode("idle")
    setTagLabel("")
    setTaskTitle("")
    setTaskPreset(null)
    setError(null)
  }

  const submitTag = async () => {
    const label = normalizeBulkTagLabel(tagLabel)
    const invalid = validateBulkTagLabel(label)
    if (invalid) {
      setError(invalid)
      return
    }
    setPending(true)
    setError(null)
    try {
      const result = await postBulkTags(selectedKeys, label)
      onCompleted(summarizeBulkTagResult(result, label), bulkResultTone(result))
      resetForms()
    } catch (cause) {
      setError(errorMessage(cause, "태그를 붙이지 못했습니다."))
    } finally {
      setPending(false)
    }
  }

  const submitTask = async () => {
    const title = taskTitle.trim()
    const invalid = validateBulkTaskTitle(title)
    if (invalid) {
      setError(invalid)
      return
    }
    setPending(true)
    setError(null)
    try {
      const dueAt = taskPreset ? resolveBulkTaskDueAt(taskPreset, Date.now()) : null
      const result = await postBulkTasks(selectedKeys, { title, dueAt })
      onCompleted(summarizeBulkTaskResult(result, title), bulkResultTone(result))
      resetForms()
    } catch (cause) {
      setError(errorMessage(cause, "할 일을 만들지 못했습니다."))
    } finally {
      setPending(false)
    }
  }

  const overTagLimit = count > BULK_TAG_MAX_KEYS
  const overTaskLimit = count > BULK_TASK_MAX_KEYS

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div
        /* 포털이라 본문 래퍼의 터치·포커스 규약([&_button]:min-h-11 …)이 닿지 않는다 — 같은 규약을 여기 다시 건다. */
        className="pointer-events-auto w-full max-w-3xl rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3 shadow-[0_12px_32px_-12px_rgba(17,17,16,0.28)] [&_button]:min-h-11 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-[#084734] [&_input]:min-h-11 lg:[&_button]:min-h-0 lg:[&_input]:min-h-0"
        role="region"
        aria-label="선택한 고객 일괄 행동"
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-semibold text-[#111110]">
            <span className="tabular-nums">{count.toLocaleString("ko-KR")}</span>명 선택
            <span className="ml-1 text-[11px] font-medium text-[#1a1a1a]/40">(이 페이지)</span>
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setError(null)
                setMode(mode === "tag" ? "idle" : "tag")
              }}
              aria-pressed={mode === "tag"}
              disabled={pending || overTagLimit}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#fafaf8] disabled:opacity-40"
            >
              <Tag className="h-3.5 w-3.5" aria-hidden />
              태그 붙이기
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setMode(mode === "task" ? "idle" : "task")
              }}
              aria-pressed={mode === "task"}
              disabled={pending || overTaskLimit}
              title={overTaskLimit ? `할 일은 한 번에 ${BULK_TASK_MAX_KEYS}명까지 만들 수 있습니다.` : undefined}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#fafaf8] disabled:opacity-40"
            >
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
              할 일 만들기
            </button>
            <button
              type="button"
              onClick={onExportSelected}
              disabled={pending || exporting || !canExportCsv}
              title={canExportCsv ? "선택한 고객만 CSV로 내려받습니다(연락처 포함)." : "CSV 내보내기는 관리자(ADMIN) 권한이 필요합니다."}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#fafaf8] disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {exporting ? "내보내는 중" : "CSV"}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForms()
                onClearSelection()
              }}
              aria-label="선택 해제"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#1a1a1a]/45 transition-colors hover:bg-[#fafaf8] hover:text-[#111110]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {mode === "tag" ? (
          <form
            className="mt-2 flex flex-wrap items-center gap-2 border-t border-[#f0f0ec] pt-2"
            onSubmit={(event) => {
              event.preventDefault()
              void submitTag()
            }}
          >
            <input
              value={tagLabel}
              onChange={(event) => setTagLabel(event.target.value)}
              maxLength={BULK_TAG_MAX_LENGTH}
              placeholder="붙일 태그(예: 재계약)"
              aria-label="붙일 태그"
              className="h-8 min-w-0 flex-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
            />
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_TAGS.slice(0, 4).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagLabel(tag)}
                  className="h-7 rounded-full border border-[#e8e8e4] bg-white px-2 text-[11px] font-medium text-[#1a1a1a]/58 hover:text-[#111110]"
                >
                  {tag}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-8 items-center rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "붙이는 중" : `${count.toLocaleString("ko-KR")}명에 붙이기`}
            </button>
          </form>
        ) : null}

        {mode === "task" ? (
          <form
            className="mt-2 flex flex-col gap-2 border-t border-[#f0f0ec] pt-2"
            onSubmit={(event) => {
              event.preventDefault()
              void submitTask()
            }}
          >
            <div className="flex flex-wrap gap-1" role="group" aria-label="할 일 프리셋">
              {BULK_TASK_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={taskPreset?.id === preset.id}
                  onClick={() => {
                    setTaskPreset(preset)
                    setTaskTitle(preset.label)
                  }}
                  className={`h-7 rounded-full border px-2.5 text-[11px] font-semibold transition-colors ${
                    taskPreset?.id === preset.id
                      ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                      : "border-[#e8e8e4] bg-white text-[#1a1a1a]/60 hover:text-[#111110]"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                maxLength={BULK_TASK_TITLE_MAX_LENGTH}
                placeholder="할 일 제목"
                aria-label="할 일 제목"
                className="h-8 min-w-0 flex-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
              />
              <span className="text-[11px] font-medium text-[#1a1a1a]/45">
                {taskPreset ? `기한 ${taskPreset.label.replace(/ (재통화|연락)$/, "")}` : "기한 없음"}
              </span>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-8 items-center rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "만드는 중" : `${count.toLocaleString("ko-KR")}명에 만들기`}
              </button>
            </div>
          </form>
        ) : null}

        {error ? (
          <p className={`mt-2 text-[12px] font-semibold ${STATUS_TONE_TEXT_CLASS.danger}`} role="status" aria-live="polite">
            {error}
          </p>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
