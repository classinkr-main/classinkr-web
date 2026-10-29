"use client"

// 표 출력 버튼 한 쌍 — [복사](TSV, 스프레드시트·메신저에 그대로 붙음) · [CSV](파일, 엑셀 한글 BOM). 하드웨어 라운드 2 B.
// 행은 누를 때 만든다(buildRows) — 렌더마다 수천 행을 조립하지 않는다. 복사가 실패하면 "복사됨"이라고 말하지 않는다.

import { memo, useEffect, useRef, useState } from "react"
import { Copy, Download } from "lucide-react"

import { copyTextToClipboard, downloadCsvFile } from "@/lib/export/browser-download"
import { fileDateStamp, safeFileName, toCsv, toTsv, type DelimitedCell } from "@/lib/export/delimited"

interface ExportActionsProps {
  // 머리글을 포함한 표. 비어 있으면(머리글만) 버튼을 막는다 — 호출부가 행 수를 넘긴다.
  buildRows: () => DelimitedCell[][]
  rowCount: number
  // 파일 이름 앞부분(날짜 스탬프가 붙는다) — 예: "하드웨어_내역".
  fileBaseName: string
  // CSV 머리에 붙이는 설명 줄(범위·기준). 클립보드 TSV 에는 넣지 않는다(붙여 넣은 표가 밀리지 않게).
  csvPreamble?: string[]
  // 버튼 라벨의 대상 — 스크린리더에 "내역 복사" 처럼 읽힌다.
  subject: string
  showCsv?: boolean
  showCopy?: boolean
  size?: "sm" | "xs"
}

const BUTTON_CLASS =
  "inline-flex cursor-pointer items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white font-bold text-[#31302E] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50"

function ExportActions({
  buildRows,
  rowCount,
  fileBaseName,
  csvPreamble,
  subject,
  showCsv = true,
  showCopy = true,
  size = "sm",
}: ExportActionsProps) {
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const timerRef = useRef<number | null>(null)
  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
  }, [])

  const flash = (next: { tone: "ok" | "error"; text: string }) => {
    setFeedback(next)
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    // 3~5초 뒤 사라진다(toast-dismiss) — 포커스는 옮기지 않는다(toast-accessibility).
    timerRef.current = window.setTimeout(() => setFeedback(null), 4000)
  }

  const copy = async () => {
    const rows = buildRows()
    const ok = await copyTextToClipboard(toTsv(rows))
    flash(ok ? { tone: "ok", text: `${Math.max(0, rows.length - 1)}행 복사됨` } : { tone: "error", text: "복사하지 못했습니다 — CSV로 받으세요" })
  }

  const download = () => {
    const rows = buildRows()
    const preamble = (csvPreamble ?? []).filter(Boolean).map((line) => [line])
    downloadCsvFile(`${safeFileName(fileBaseName)}_${fileDateStamp()}.csv`, toCsv([...preamble, ...rows]))
    flash({ tone: "ok", text: `${Math.max(0, rows.length - 1)}행 CSV` })
  }

  const sizeClass = size === "xs" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-[11.5px]"
  const disabled = rowCount === 0
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {showCopy && (
        <button
          type="button"
          onClick={() => void copy()}
          disabled={disabled}
          aria-label={`${subject} 표 복사(스프레드시트에 붙여넣기)`}
          title="탭으로 구분된 표로 복사 — 스프레드시트에 그대로 붙습니다"
          className={`${BUTTON_CLASS} ${sizeClass}`}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          복사
        </button>
      )}
      {showCsv && (
        <button
          type="button"
          onClick={download}
          disabled={disabled}
          aria-label={`${subject} CSV 내려받기`}
          title="CSV 파일로 내려받기(엑셀 호환)"
          className={`${BUTTON_CLASS} ${sizeClass}`}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          CSV
        </button>
      )}
      <span role="status" aria-live="polite" className={`text-[11px] font-semibold ${feedback?.tone === "error" ? "text-[#8F2C2C]" : "text-[#084734]"}`}>
        {feedback?.text ?? ""}
      </span>
    </span>
  )
}

export default memo(ExportActions)
