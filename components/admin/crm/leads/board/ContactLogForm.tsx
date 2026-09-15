"use client"

// ─── 연락 로그 폼 ──────────────────────────────────────────────
// LeadsBoardClient.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { useEffect, useRef, useState } from "react"
import { Loader2, Save } from "lucide-react"
import type { ContactLogResult, ContactLogType } from "@/lib/repositories/contact-logs"
import { buildContactLogEntry, channelCarriesResult } from "@/lib/crm/contact-log"
import { LOG_RESULT_LABEL, LOG_TYPE_LABEL } from "../shared"

export default function ContactLogForm({
  onSave,
  onCancel,
  initialType = "call",
  willAutoConfirm = false,
}: {
  onSave: (entry: { type: ContactLogType; result?: ContactLogResult; notes?: string; contacted_by?: string }) => Promise<void>
  onCancel: () => void
  initialType?: ContactLogType
  /**
   * true면 이 저장이 리드를 자동으로 "확인" 처리한다(app/api/admin/leads/[id]/logs/route.ts가
   * status==="new"인 리드에 confirmed_at을 즉시 채운다). 감사 2026-09-07 §3 — confirmed_at은
   * 찍히면 되돌릴 API가 없는데 폼에 경고 문구가 전혀 없었다. 매번 막는 대신(가장 빈번한 쓰기라
   * 확인 다이얼로그를 걸면 CRM 실무 속도가 떨어진다) 해당될 때만 저장 버튼 위에 명시한다.
   */
  willAutoConfirm?: boolean
}) {
  const [type, setType] = useState<ContactLogType>(initialType)
  const [result, setResult] = useState<ContactLogResult>("answered")
  const [notes, setNotes] = useState("")
  const [by, setBy] = useState("")
  const [saving, setSaving] = useState(false)
  const notesRef = useRef<HTMLTextAreaElement | null>(null)
  // 감사 2026-09-07 §4 — saving은 리렌더 커밋 전까지 저장 버튼을 막지 못한다. 연락 기록은
  // CRM에서 가장 빈번한 쓰기라 빠른 더블클릭이 실측 가능성이 높다 — 동기 ref로 먼저 잠근다.
  const saveInFlightRef = useRef(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => notesRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const handleSave = async () => {
    if (saveInFlightRef.current) return
    saveInFlightRef.current = true
    setSaving(true)
    try {
      // 채널↔결과 규약은 lib/crm/contact-log가 단일 진실원 — 카카오·이메일은 결과 칩이 숨겨져도
      // 직전에 고른 result가 state에 남아 있어 그대로 전송되던 경로를 여기서 막는다.
      await onSave(buildContactLogEntry({ type, result, notes, contacted_by: by }))
    } catch {
      // 상위 핸들러가 오류 토스트를 맡는다. 폼 값은 유지해 사용자가 바로 재시도할 수 있게 한다.
    } finally {
      // 저장 실패 시에도 폼을 다시 조작·재시도할 수 있어야 한다.
      saveInFlightRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="bg-[#fafaf8] border border-[#e8e8e4] rounded-xl p-3 space-y-2.5" aria-busy={saving}>
      {/* 채널 */}
      <div className="flex gap-1.5">
        {(["call", "sms", "kakao", "email"] as ContactLogType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            aria-pressed={type === t}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
              type === t ? "bg-[#111110] text-white border-[#111110]" : "border-[#e8e8e4] text-[#1a1a1a]/50 hover:border-[#c8c8c4]"
            }`}
          >
            {LOG_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {/* 결과 (전화/문자만) — 표시 조건도 저장 규약과 같은 표를 본다 */}
      {channelCarriesResult(type) && (
        <div className="flex gap-1.5">
          {(["answered", "no_answer", "callback", "meeting_set"] as ContactLogResult[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setResult(r)}
              aria-pressed={result === r}
              className={`flex-1 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                result === r ? "bg-[#084734] text-white border-[#084734]" : "border-[#e8e8e4] text-[#1a1a1a]/40 hover:border-[#c8c8c4]"
              }`}
            >
              {LOG_RESULT_LABEL[r]}
            </button>
          ))}
        </div>
      )}

      {/* 담당자 */}
      <input
        value={by}
        aria-label="연락 담당자"
        onChange={(e) => setBy(e.target.value)}
        placeholder="담당자 이름"
        className="w-full text-[12px] bg-white border border-[#e8e8e4] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c8c8c4] placeholder:text-[#1a1a1a]/40"
      />

      {/* 메모 */}
      <textarea
        ref={notesRef}
        value={notes}
        aria-label="연락 메모"
        onChange={(e) => setNotes(e.target.value)}
        placeholder="메모 (선택)"
        rows={2}
        autoFocus
        className="w-full text-[12px] bg-white border border-[#e8e8e4] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c8c8c4] resize-none placeholder:text-[#1a1a1a]/40"
      />

      {willAutoConfirm && (
        <p className="text-[11px] text-[#B85C33]" role="note">
          저장하면 이 리드가 자동으로 확인 처리됩니다 — 되돌릴 수 없습니다.
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-[12px] text-[#1a1a1a]/40 hover:text-[#1a1a1a]/60 px-2 py-1">취소</button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          aria-label={saving ? "연락 기록 저장 중" : "연락 기록 저장"}
          className="flex items-center gap-1 text-[12px] font-medium bg-[#111110] text-white px-3 py-1.5 rounded-lg disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          저장
        </button>
      </div>
    </div>
  )
}
