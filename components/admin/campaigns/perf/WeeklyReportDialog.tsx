"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { FileText, Loader2, X } from "lucide-react"
import {
  WeeklyReportActions,
  WeeklyReportBody,
  WeeklyReportStatusBadge,
  formatReportDate,
  useWeeklyReport,
} from "./weekly-report-view"

// 주간 보고서 다이얼로그 — 허브 헤더의 "주간 보고서" 버튼. 본문·액션은 weekly-report-view 와 공유하고
// 이 파일은 모달 껍데기(포커스 트랩·ESC·스크롤 잠금)만 담당한다. 인라인 판은 데이터 층의
// WeeklyReportSection.

const FOCUSABLE_SELECTOR = ["a[href]", "button:not([disabled])", "details > summary", "[tabindex]:not([tabindex='-1'])"].join(",")

export function WeeklyReportDialog() {
  const [open, setOpen] = useState(false)
  const { response, loading, error, copyState, load, copy, download } = useWeeklyReport()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  const show = useCallback(() => {
    setOpen(true)
    if (!response && !loading) void load()
  }, [load, loading, response])

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const frame = requestAnimationFrame(() => {
      dialog?.querySelector<HTMLElement>("[data-autofocus]")?.focus()
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== "Tab" || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [close, open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={show}
        className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
      >
        <FileText className="h-3.5 w-3.5" aria-hidden />
        주간 보고서
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="weekly-report-title"
            aria-describedby={response ? "weekly-report-summary" : undefined}
            aria-busy={loading}
            className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] shadow-2xl sm:max-h-[88vh] sm:rounded-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[rgba(0,0,0,0.08)] bg-white px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#084734]">Weekly report</p>
                  {response ? <WeeklyReportStatusBadge report={response.report} /> : null}
                </div>
                <h2 id="weekly-report-title" className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-[#111110]">
                  마케팅 광고 리드 주간 보고서
                </h2>
                {response ? (
                  <p className="mt-1 text-[11.5px] text-[#615D59]">
                    {formatReportDate(response.report.period.since)} ~ {formatReportDate(response.report.period.until)} · 월~일 완료 주간
                  </p>
                ) : null}
              </div>
              <button
                data-autofocus
                type="button"
                onClick={close}
                aria-label="주간 보고서 닫기"
                className="rounded-md p-1.5 text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {loading && !response ? (
                <div className="flex min-h-72 items-center justify-center gap-2 text-[13px] text-[#615D59]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#084734]" aria-hidden />
                  완료 주간 데이터를 집계하고 있습니다…
                </div>
              ) : error && !response ? (
                <div className="flex min-h-72 flex-col items-center justify-center text-center">
                  <p className="text-[14px] font-semibold text-[#111110]">보고서를 만들지 못했습니다</p>
                  <p className="mt-1 max-w-md text-[12px] leading-relaxed text-[#B43E3E]">{error}</p>
                  <button
                    type="button"
                    onClick={() => void load({ fresh: true })}
                    className="mt-4 rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[#065c41] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                  >
                    다시 시도
                  </button>
                </div>
              ) : response ? (
                <WeeklyReportBody response={response} loading={loading} error={error} />
              ) : null}
            </div>

            <footer className="border-t border-[rgba(0,0,0,0.08)] bg-white px-4 py-3 sm:px-6">
              <WeeklyReportActions
                loading={loading}
                hasReport={response != null}
                copyState={copyState}
                onRegenerate={() => void load({ fresh: true })}
                onDownload={download}
                onCopy={() => void copy()}
              />
            </footer>
          </section>
        </div>
      ) : null}
    </>
  )
}
