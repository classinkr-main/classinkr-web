"use client"

import { useState } from "react"
import { CheckCircle2, Clock, PhoneCall, Sparkles, X } from "lucide-react"

interface QuickCallLogModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function QuickCallLogModal({
  isOpen,
  onClose,
  onSuccess,
}: QuickCallLogModalProps) {
  const [rawText, setRawText] = useState("")
  const [targetLabel, setTargetLabel] = useState("")
  const [title, setTitle] = useState("")
  const [detail, setDetail] = useState("")
  const [status, setStatus] = useState<"done" | "open">("done")
  const [ownerName, setOwnerName] = useState("김민재")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isOpen) return null

  // Auto-parse when raw text changes
  const handleRawTextChange = (text: string) => {
    setRawText(text)
    setErrorMsg(null)

    // Heuristic parser
    let parsedCustomer = ""
    let parsedTitle = ""
    const parsedDetail = text

    if (text.includes(":") || text.includes("：")) {
      const parts = text.split(/[:：]/)
      parsedCustomer = parts[0]?.trim() || ""
      parsedTitle = parts[1]?.trim().slice(0, 50) || ""
    } else if (text.includes("-") || text.includes("/")) {
      const parts = text.split(/[-/]/)
      parsedCustomer = parts[0]?.trim() || ""
      parsedTitle = parts[1]?.trim().slice(0, 50) || ""
    } else {
      parsedCustomer = text.slice(0, 15).trim()
      parsedTitle = text.slice(0, 45).trim()
    }

    if (parsedCustomer) setTargetLabel(parsedCustomer)
    if (parsedTitle) setTitle(parsedTitle)
    setDetail(parsedDetail)

    // Detect if resolved or pending
    if (
      text.includes("해결") ||
      text.includes("완료") ||
      text.includes("안내 완료") ||
      text.includes("조치")
    ) {
      setStatus("done")
    } else if (
      text.includes("예정") ||
      text.includes("요청") ||
      text.includes("후속") ||
      text.includes("대기") ||
      text.includes("확인 필요")
    ) {
      setStatus("open")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rawText.trim() && !title.trim()) {
      setErrorMsg("통화 일지 내용을 입력해주세요.")
      return
    }

    setIsSubmitting(true)
    setErrorMsg(null)

    try {
      const res = await fetch("/api/admin/cs/quick-call-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText,
          targetLabel: targetLabel || "전화 상담 고객",
          title: title || rawText.slice(0, 40),
          detail: detail || rawText,
          status,
          priority: "normal",
          ownerName,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "통화 일지 저장 실패")
      }

      // Reset and close
      setRawText("")
      setTargetLabel("")
      setTitle("")
      setDetail("")
      onSuccess()
      onClose()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "저장에 실패했습니다.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-black/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 bg-[#FAFAF8]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#084734] border border-[#084734]/15">
              <PhoneCall className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-[#111110]">
                사내 전화 일지 빠른 등록 (10초 붙여넣기)
              </h3>
              <p className="text-[12px] text-[#615D59]">
                사내 메신저 통화 메모를 복사해 붙여넣으면 즉시 CS 총량 및 해결률에 반영됩니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#615D59] hover:bg-black/5 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 text-[13px] text-[#B43E3E] bg-[#FEE2E2]/60 rounded-xl border border-[#B43E3E]/20">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-[12px] font-semibold text-[#111110] mb-1.5 flex items-center justify-between">
              <span>사내 메신저 메모 붙여넣기</span>
              <span className="text-[11px] font-normal text-[#615D59] flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-[#084734]" />
                자동 파싱
              </span>
            </label>
            <textarea
              rows={3}
              value={rawText}
              onChange={(e) => handleRawTextChange(e.target.value)}
              placeholder="예: 고려학원 김철수 원장님: 수업 녹화본 저장 위치 문의하셔서 PC 로컬 경로 안내 및 원격 확인 지원 완료함"
              className="w-full rounded-xl border border-black/10 px-3.5 py-2.5 text-[13px] text-[#111110] placeholder:text-[#A39E98] focus:border-[#084734] focus:outline-none focus:ring-1 focus:ring-[#084734]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-medium text-[#615D59] mb-1">
                고객 / 기관명
              </label>
              <input
                type="text"
                value={targetLabel}
                onChange={(e) => setTargetLabel(e.target.value)}
                placeholder="고려학원 김철수 원장"
                className="w-full rounded-lg border border-black/10 px-3 py-1.5 text-[13px] text-[#111110] focus:border-[#084734] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#615D59] mb-1">
                응대 담당자
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="김민재"
                className="w-full rounded-lg border border-black/10 px-3 py-1.5 text-[13px] text-[#111110] focus:border-[#084734] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#615D59] mb-1">
              문의 요약 / 제목
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="수업 녹화본 저장 위치 문의 및 원격 안내"
              className="w-full rounded-lg border border-black/10 px-3 py-1.5 text-[13px] text-[#111110] focus:border-[#084734] focus:outline-none"
            />
          </div>

          {/* Status Selector */}
          <div>
            <label className="block text-[11px] font-medium text-[#615D59] mb-1.5">
              상담 처리 결과
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStatus("done")}
                className={`flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-[12px] font-medium border transition ${
                  status === "done"
                    ? "bg-[#ECFDF5] border-[#084734] text-[#084734] font-semibold"
                    : "bg-white border-black/10 text-[#615D59] hover:bg-black/[0.02]"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>즉시 해결 완료 (+해결률)</span>
              </button>
              <button
                type="button"
                onClick={() => setStatus("open")}
                className={`flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-[12px] font-medium border transition ${
                  status === "open"
                    ? "bg-[#FEF3C7] border-[#A8741A] text-[#A8741A] font-semibold"
                    : "bg-white border-black/10 text-[#615D59] hover:bg-black/[0.02]"
                }`}
              >
                <Clock className="h-4 w-4" />
                <span>후속 처리 대기 (대기 큐 추가)</span>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl px-4 py-2 text-[13px] font-medium text-[#615D59] hover:bg-black/5 transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-[#084734] hover:bg-[#065c41] px-5 py-2 text-[13px] font-semibold text-white shadow-sm transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>등록 중...</span>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>저장하고 대시보드 반영</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
