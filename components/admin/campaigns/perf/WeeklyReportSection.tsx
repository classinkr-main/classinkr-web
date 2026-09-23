"use client"

import { useEffect } from "react"
import { Loader2 } from "lucide-react"
import {
  WeeklyReportActions,
  WeeklyReportBody,
  WeeklyReportStatusBadge,
  formatReportDate,
  useWeeklyReport,
} from "./weekly-report-view"

// 주간 보고서 — 데이터 층 인라인 판. 헤더 다이얼로그와 같은 본문·액션(weekly-report-view)을 쓴다.
// 데이터 층에 두는 이유: 복사·다운로드가 있는 "내보내기" 면이라 목록·입력과 같은 층이다(기획 §3.5).

export function WeeklyReportSection({ refreshNonce }: { refreshNonce: number }) {
  const { response, loading, error, copyState, load, copy, download } = useWeeklyReport()

  useEffect(() => {
    void load()
    // 첫 마운트 1회 + 헤더 동기화(nonce) 때만 다시 받는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce])

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-[#F6F5F4] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#084734]">Weekly report</p>
            {response ? <WeeklyReportStatusBadge report={response.report} /> : null}
          </div>
          <h3 className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#111110]">마케팅 광고 리드 주간 보고서</h3>
          {response ? (
            <p className="mt-1 text-[11.5px] text-[#615D59]">
              {formatReportDate(response.report.period.since)} ~ {formatReportDate(response.report.period.until)} · 월~일 완료 주간
            </p>
          ) : null}
        </div>
        <WeeklyReportActions
          loading={loading}
          hasReport={response != null}
          copyState={copyState}
          onRegenerate={() => void load({ fresh: true })}
          onDownload={download}
          onCopy={() => void copy()}
        />
      </div>

      {loading && !response ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-[13px] text-[#615D59]">
          <Loader2 className="h-4 w-4 animate-spin text-[#084734]" aria-hidden />
          완료 주간 데이터를 집계하고 있습니다…
        </div>
      ) : error && !response ? (
        <div className="flex min-h-40 flex-col items-center justify-center text-center">
          <p className="text-[14px] font-semibold text-[#111110]">보고서를 만들지 못했습니다</p>
          <p className="mt-1 max-w-md text-[12px] leading-relaxed text-[#B43E3E]">{error}</p>
          <button
            type="button"
            onClick={() => void load({ fresh: true })}
            className="mt-4 rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[#065c41]"
          >
            다시 시도
          </button>
        </div>
      ) : response ? (
        <WeeklyReportBody response={response} loading={loading} error={error} />
      ) : null}
    </div>
  )
}
