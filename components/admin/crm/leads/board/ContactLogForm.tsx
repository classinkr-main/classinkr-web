"use client"

// ─── 연락 로그 폼 ──────────────────────────────────────────────
// LeadsBoardClient.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Save } from "lucide-react"
import type { ContactLogResult, ContactLogType } from "@/lib/repositories/contact-logs"
import { buildContactLogEntry, channelCarriesResult } from "@/lib/crm/contact-log"
import { buildFollowUpQuickSuggestions, type FollowUpQuickSuggestion } from "@/lib/crm/follow-up-presets"
import { MOBILE_TOUCH_TARGET_CLASS } from "@/components/admin/crm/home/shared"
import { LOG_RESULT_LABEL, LOG_TYPE_LABEL } from "../shared"

// 저장 성공 뒤 팔로업 제안 칩을 보여주는 시간(Q1) — 8초 뒤 자동으로 사라지고 폼도 함께 닫힌다.
const FOLLOW_UP_SUGGESTION_VISIBLE_MS = 8000

export default function ContactLogForm({
  onSave,
  onCancel,
  initialType = "call",
  willAutoConfirm = false,
  currentFollowUpDate,
  onSuggestFollowUp,
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
  /**
   * 현재 리드의 팔로업 날짜("YYYY-MM-DD", 없으면 undefined/빈 문자열) — 저장 성공 뒤 낼 제안 칩이
   * 이미 그 날짜를 가리키면 숨기는 데만 쓴다(Q1). LeadDrawer가 서버 정본(savedFollowUp)을 넘긴다.
   */
  currentFollowUpDate?: string
  /**
   * 연락 결과가 부재중(no_answer)·재통화(callback)로 저장에 성공한 직후에만 보여줄 제안 칩
   * ("팔로업 내일"·"팔로업 3일 뒤") 클릭 콜백(Q1) — LeadDrawer가 넘겨 기존 팔로업 저장 경로
   * (saveFollowUp)로 그대로 커밋한다. 없으면(undefined) 제안 칩 자체를 계산·표시하지 않는다.
   */
  onSuggestFollowUp?: (dateKey: string) => void
}) {
  const [type, setType] = useState<ContactLogType>(initialType)
  const [result, setResult] = useState<ContactLogResult>("answered")
  const [notes, setNotes] = useState("")
  const [by, setBy] = useState("")
  const [saving, setSaving] = useState(false)
  const notesRef = useRef<HTMLTextAreaElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  // 감사 2026-09-07 §4 — saving은 리렌더 커밋 전까지 저장 버튼을 막지 못한다. 연락 기록은
  // CRM에서 가장 빈번한 쓰기라 빠른 더블클릭이 실측 가능성이 높다 — 동기 ref로 먼저 잠근다.
  const saveInFlightRef = useRef(false)
  // 저장 성공 뒤 보여줄 팔로업 제안 칩(Q1) — null이면 안 보인다. 폼을 닫는 결정(onCancel)은 이
  // 상태가 있을 때만 타이머/Esc/바깥 클릭으로 미뤄진다 — 없으면 기존과 같이 저장 즉시 닫힌다.
  const [suggestions, setSuggestions] = useState<FollowUpQuickSuggestion[] | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => notesRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])

  // 제안 칩을 접고 폼을 닫는 단일 경로 — 8초 경과·Esc·바깥 클릭·칩 클릭이 전부 여기로 모인다.
  const dismissSuggestions = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
    setSuggestions(null)
    onCancel()
  }, [onCancel])

  useEffect(() => {
    if (!suggestions) return
    dismissTimerRef.current = setTimeout(dismissSuggestions, FOLLOW_UP_SUGGESTION_VISIBLE_MS)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissSuggestions()
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) dismissSuggestions()
    }
    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("pointerdown", handlePointerDown)
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current)
        dismissTimerRef.current = null
      }
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [suggestions, dismissSuggestions])

  const handleSave = async () => {
    if (saveInFlightRef.current) return
    saveInFlightRef.current = true
    setSaving(true)
    try {
      // 채널↔결과 규약은 lib/crm/contact-log가 단일 진실원 — 카카오·이메일은 결과 칩이 숨겨져도
      // 직전에 고른 result가 state에 남아 있어 그대로 전송되던 경로를 여기서 막는다.
      const entry = buildContactLogEntry({ type, result, notes, contacted_by: by })
      await onSave(entry)
      // 부재중/재통화로 저장된 경우에만 제안한다 — buildContactLogEntry가 이미 채널이 결과를
      // 안 나르면(카카오·이메일) result를 지웠으므로 entry.result만 보면 된다.
      const nextSuggestions =
        onSuggestFollowUp && (entry.result === "no_answer" || entry.result === "callback")
          ? buildFollowUpQuickSuggestions({ nowMs: Date.now(), currentFollowUpDate })
          : []
      if (nextSuggestions.length > 0) {
        setSuggestions(nextSuggestions)
      } else {
        onCancel()
      }
    } catch {
      // 상위 핸들러가 오류 토스트를 맡는다. 폼 값은 유지해 사용자가 바로 재시도할 수 있게 한다.
    } finally {
      // 저장 실패 시에도 폼을 다시 조작·재시도할 수 있어야 한다.
      saveInFlightRef.current = false
      setSaving(false)
    }
  }

  return (
    <div ref={containerRef} className="bg-[#fafaf8] border border-[#e8e8e4] rounded-xl p-3 space-y-2.5" aria-busy={saving}>
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

      {/* 부재중/재통화 저장 성공 직후 제안 칩(Q1) — 폼 아래에 8초간, Esc·바깥 클릭·칩 클릭으로 닫힌다. */}
      {suggestions && suggestions.length > 0 && (
        <div
          role="group"
          aria-label="팔로업 제안"
          className={`flex flex-wrap items-center gap-1.5 border-t border-[#e8e8e4] pt-2.5 ${MOBILE_TOUCH_TARGET_CLASS}`}
        >
          <span className="text-[11px] text-[#1a1a1a]/40">다음 팔로업을 바로 잡을까요?</span>
          {suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSuggestFollowUp?.(item.dateKey)
                dismissSuggestions()
              }}
              className="inline-flex items-center rounded-full border border-[#084734] bg-[#ECFDF5] px-3 py-1 text-[11px] font-medium text-[#084734] transition-colors hover:bg-[#084734]/10"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
