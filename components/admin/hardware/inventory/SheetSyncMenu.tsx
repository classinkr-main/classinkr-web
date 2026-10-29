"use client"

import { useRef } from "react"
import { ChevronDown, FileSpreadsheet, RefreshCw, UploadCloud } from "lucide-react"
import { HARDWARE_LEDGER_UPLOAD_ENABLED, HARDWARE_LEDGER_UPLOAD_DISABLED_MESSAGE } from "@/lib/hardware/ledger-upload-policy"

interface Props {
  busy: boolean
  loading: boolean
  canWrite: boolean
  onRefresh: () => void
  onSync: () => void
  onUpload: () => void
}

export default function SheetSyncMenu({ busy, loading, canWrite, onRefresh, onSync, onUpload }: Props) {
  const ref = useRef<HTMLDetailsElement>(null)
  const run = (action: () => void) => { if (ref.current) ref.current.open = false; action() }
  const actionClass = "flex w-full items-center gap-2 px-4 py-3 text-left text-[12px] hover:bg-[#F6F5F4] disabled:opacity-40"
  return (
    <details ref={ref} className="relative" onKeyDown={event => { if (event.key === "Escape" && ref.current?.open) { event.preventDefault(); ref.current.open = false; ref.current.querySelector<HTMLElement>("summary")?.focus() } }}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[12px] font-semibold text-[#31302E] focus-visible:outline-2 focus-visible:outline-[#084734]"><RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />{busy ? "처리 중" : "시트 최신화"}<ChevronDown className="h-3.5 w-3.5" /></summary>
      <div className="absolute left-0 top-full z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-[rgba(0,0,0,0.08)] bg-white py-1 shadow-lg sm:left-auto sm:right-0">
        <button type="button" className={actionClass} disabled={busy || loading} onClick={() => run(onRefresh)}><RefreshCw className="h-4 w-4" /><span>화면 새로고침<small className="block text-[11px] text-[#615D59]">원본 다시 조회 · 시트 반영 없음</small></span></button>
        <button type="button" className={actionClass} disabled={busy || !canWrite} onClick={() => run(onSync)}><UploadCloud className="h-4 w-4" /><span>동기화·백업 후 반영<small className="block text-[11px] text-[#615D59]">최신 시트를 원본에 가져옵니다</small></span></button>
        <button type="button" className={actionClass} disabled={busy || !canWrite || !HARDWARE_LEDGER_UPLOAD_ENABLED} title={!HARDWARE_LEDGER_UPLOAD_ENABLED ? HARDWARE_LEDGER_UPLOAD_DISABLED_MESSAGE : undefined} onClick={() => run(onUpload)}><FileSpreadsheet className="h-4 w-4" /><span>원본 파일 업로드<small className="block text-[11px] text-[#615D59]">{HARDWARE_LEDGER_UPLOAD_ENABLED ? ".xlsx · 자동 백업 후 교체" : "정합성 검증 전까지 중단"}</small></span></button>
      </div>
    </details>
  )
}
