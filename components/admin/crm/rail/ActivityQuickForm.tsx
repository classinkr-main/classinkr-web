"use client"

// CRM 기록 빠른 생성 폼 SSOT — CrmActivityClient(기록 표면)와 CrmActionRail(우측 레일)이
// 같은 폼을 소비한다. 모드별 필드 분기(MODE_FIELDS)·FormData 직렬화·검증 문구는
// 기존 CrmActivityClient 폼과 값·API 계약이 동일하다(/api/admin/crm/events POST).

import { useEffect, useId, useRef, useState } from "react"
import { CheckCircle2, ChevronDown, Loader2, Paperclip } from "lucide-react"

import { adminFetch } from "@/lib/admin-client"
import { Toast } from "@/components/admin/crm/leads/shared"
import CrmCustomerPicker from "@/components/admin/crm/CrmCustomerPicker"
import { useCrmOwners } from "@/components/admin/crm/useCrmOwners"
import {
  EVENTS_URL,
  MODE_FIELDS,
  MODE_OPTIONS,
  STAGE_SIGNALS,
  TARGET_OPTIONS,
  appendFormValue,
  localInputToIso,
  toLocalDateTimeInput,
  type ActivityTargetType,
  type FormMode,
  type OptionalFieldKey,
  type Sentiment,
  type TargetType,
} from "./activity-contract"

export interface ActivityQuickFormProps {
  /** true면 레일 장착용 컴팩트 변형(헤더 생략·모드 필 선택기). 필드 구성·계약은 동일. */
  compact?: boolean
  /** 고객 프리셀렉트 — 대상 타입 (홈/고객DB/기록 딥링크 장착용) */
  defaultTargetType?: ActivityTargetType
  /** 고객 프리셀렉트 — 대상 ID */
  defaultTargetId?: string
  /** 고객 프리셀렉트 — 표시 이름 */
  defaultTargetLabel?: string
  /** 저장 성공 후 콜백(타임라인 refresh 등). tasksCreated = 함께 생성된 할 일 수 */
  onSaved?: (result: { tasksCreated: number }) => void
}

export default function ActivityQuickForm({
  compact = false,
  defaultTargetType,
  defaultTargetId,
  defaultTargetLabel,
  onSaved,
}: ActivityQuickFormProps) {
  const presetTargetType: ActivityTargetType = defaultTargetType ?? "unknown"

  const [mode, setMode] = useState<FormMode>("manual_note")
  const [targetType, setTargetType] = useState<TargetType>(presetTargetType)
  const [targetLabel, setTargetLabel] = useState(defaultTargetLabel ?? "")
  const [targetId, setTargetId] = useState(defaultTargetId ?? "")
  const [title, setTitle] = useState("")
  const [occurredAt, setOccurredAt] = useState(() => toLocalDateTimeInput(new Date()))
  const [ownerName, setOwnerName] = useState("")
  const [attendees, setAttendees] = useState("")
  const [meetingPurpose, setMeetingPurpose] = useState("")
  const [summary, setSummary] = useState("")
  const [body, setBody] = useState("")
  const [decisions, setDecisions] = useState("")
  const [blockers, setBlockers] = useState("")
  const [nextActionTitle, setNextActionTitle] = useState("")
  const [nextActionOwner, setNextActionOwner] = useState("")
  const [nextActionDueAt, setNextActionDueAt] = useState("")
  const [sentiment, setSentiment] = useState<Exclude<Sentiment, "all">>("neutral")
  const [stageSignal, setStageSignal] = useState("")
  const [tags, setTags] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [recordingName, setRecordingName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { owners: crmOwners, health: ownerHealth } = useCrmOwners()
  const ownerListId = useId()

  // 딥링크/부모가 대상을 지정하면 폼 대상을 1회 프리셋한다(같은 대상 재지정은 무시).
  const presetRef = useRef<string | null>(defaultTargetId ?? null)
  useEffect(() => {
    if (!defaultTargetId) return
    if (presetRef.current === defaultTargetId) return
    presetRef.current = defaultTargetId
    setTargetId(defaultTargetId)
    if (defaultTargetType) setTargetType(defaultTargetType)
    if (defaultTargetLabel) setTargetLabel(defaultTargetLabel)
  }, [defaultTargetId, defaultTargetType, defaultTargetLabel])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const resetForm = () => {
    setMode("manual_note")
    // 프리셀렉트가 있으면 초기화 후에도 그 고객으로 돌아온다(레일 장착 UX).
    setTargetType(presetTargetType)
    setTargetLabel(defaultTargetLabel ?? "")
    setTargetId(defaultTargetId ?? "")
    setTitle("")
    setOccurredAt(toLocalDateTimeInput(new Date()))
    setOwnerName("")
    setAttendees("")
    setMeetingPurpose("")
    setSummary("")
    setBody("")
    setDecisions("")
    setBlockers("")
    setNextActionTitle("")
    setNextActionOwner("")
    setNextActionDueAt("")
    setSentiment("neutral")
    setStageSignal("")
    setTags("")
    setShowAdvanced(false)
    setRecordingName(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSubmit = async () => {
    const file = fileInputRef.current?.files?.[0] ?? null
    if (!title.trim() && !summary.trim() && !body.trim() && !nextActionTitle.trim() && !file) {
      setToast({ msg: "제목, 요약, 메모, 다음 액션 또는 녹음파일 중 하나는 필요합니다.", type: "error" })
      return
    }

    const formData = new FormData()
    formData.append("sourceType", mode)
    formData.append("targetType", targetType)
    appendFormValue(formData, "targetLabel", targetLabel)
    appendFormValue(formData, "targetId", targetId)
    appendFormValue(formData, "title", title)
    appendFormValue(formData, "occurredAt", localInputToIso(occurredAt))
    appendFormValue(formData, "ownerName", ownerName)
    appendFormValue(formData, "attendees", attendees)
    appendFormValue(formData, "meetingPurpose", meetingPurpose)
    appendFormValue(formData, "summary", summary)
    appendFormValue(formData, "body", body)
    appendFormValue(formData, "decisions", decisions)
    appendFormValue(formData, "blockers", blockers)
    appendFormValue(formData, "nextActionTitle", nextActionTitle)
    appendFormValue(formData, "nextActionOwner", nextActionOwner)
    appendFormValue(formData, "nextActionDueAt", localInputToIso(nextActionDueAt))
    formData.append("sentiment", sentiment)
    appendFormValue(formData, "stageSignal", stageSignal)
    appendFormValue(formData, "tags", tags)
    if (file) formData.append("recording", file)

    setSaving(true)
    try {
      const response = await adminFetch(EVENTS_URL, { method: "POST", body: formData })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? "CRM 기록 저장에 실패했습니다.")
      const tasksCreated = typeof payload?.tasksCreated === "number" ? payload.tasksCreated : 0
      setToast({
        msg: tasksCreated > 0 ? `CRM 기록 저장 · 할 일 ${tasksCreated}건 생성` : "CRM 기록을 저장했습니다.",
        type: "success",
      })
      resetForm()
      onSaved?.({ tasksCreated })
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "CRM 기록 저장에 실패했습니다.", type: "error" })
    } finally {
      setSaving(false)
    }
  }

  const fieldHasValue = (key: OptionalFieldKey): boolean => {
    switch (key) {
      case "body":
        return body.trim().length > 0
      case "attendees":
        return attendees.trim().length > 0
      case "meetingPurpose":
        return meetingPurpose.trim().length > 0
      case "decisions":
        return decisions.trim().length > 0
      case "blockers":
        return blockers.trim().length > 0
      case "nextAction":
        return Boolean(nextActionTitle.trim() || nextActionOwner.trim() || nextActionDueAt.trim())
      case "sentiment":
        return sentiment !== "neutral"
      case "stageSignal":
        return stageSignal.trim().length > 0
      case "tags":
        return tags.trim().length > 0
      case "recording":
        return Boolean(recordingName)
      default:
        return false
    }
  }

  const showField = (key: OptionalFieldKey) => {
    const config = MODE_FIELDS[mode]
    return config.primary.includes(key) || fieldHasValue(key) || (config.advanced.includes(key) && showAdvanced)
  }

  return (
    <div>
      {toast ? <Toast msg={toast.msg} type={toast.type} /> : null}

      {!compact ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-[#111110]">빠른 입력</h2>
            <p className="mt-0.5 text-[12px] text-[#1a1a1a]/42">원문은 짧게 붙이고, 액션만 빠뜨리지 않게 남깁니다.</p>
          </div>
          <Paperclip className="h-4 w-4 text-[#1a1a1a]/30" />
        </div>
      ) : null}

      {compact ? (
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="기록 종류 선택">
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon
            const active = mode === option.key
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setMode(option.key)
                  setShowAdvanced(false)
                }}
                className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-semibold transition-colors ${
                  active
                    ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                    : "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55 hover:border-[#c8c8c4]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon
            const active = mode === option.key
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setMode(option.key)
                  setShowAdvanced(false)
                }}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                  active ? "border-[#084734] bg-[#ECFDF5]" : "border-[#e8e8e4] bg-[#fafaf8] hover:border-[#c8c8c4]"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    active ? "bg-[#084734] text-white" : "bg-white text-[#1a1a1a]/45"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold text-[#111110]">{option.label}</span>
                  <span className="mt-0.5 block text-[11px] text-[#1a1a1a]/42">{option.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className={compact ? "mt-3 grid gap-2.5" : "mt-4 grid gap-3"}>
        <datalist id={ownerListId}>
          {crmOwners.map((owner) => (
            <option
              key={owner.ownerKey}
              value={owner.ownerKey}
              label={`${owner.displayName} · ${owner.teamRoleLabel}${owner.branchName ? ` · ${owner.branchName}` : ""}`}
            />
          ))}
        </datalist>

        {ownerHealth?.ok === false && ownerHealth.message ? (
          <div className="rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
            {ownerHealth.message}
          </div>
        ) : null}

        <div className={compact ? "grid gap-2" : "grid grid-cols-[130px_minmax(0,1fr)] gap-2"}>
          <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
            대상
            <select
              value={targetType}
              onChange={(event) => setTargetType(event.target.value as TargetType)}
              className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
            >
              {TARGET_OPTIONS.filter((option) => option.key !== "all").map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
            고객/리드
            <CrmCustomerPicker
              label={targetLabel}
              linkedId={targetId}
              onPick={(pick) => {
                setTargetType(pick.targetType)
                setTargetId(pick.targetId)
                setTargetLabel(pick.targetLabel)
              }}
              onFreeText={(text) => {
                setTargetLabel(text)
                setTargetId("")
              }}
              onClear={() => {
                setTargetLabel("")
                setTargetId("")
              }}
            />
          </label>
        </div>

        {targetId ? (
          <p className="text-[11px] text-[#1a1a1a]/40">연결된 대상에 기록이 저장되어 고객 360 타임라인에 바로 표시됩니다.</p>
        ) : (
          <p className="text-[11px] text-[#1a1a1a]/40">
            고객을 선택하면 360 타임라인에 연결됩니다. 직접 입력하면 미연결 기록으로 저장됩니다.
          </p>
        )}

        {showField("recording") ? (
          <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
            녹음파일
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/mp4,video/quicktime"
              onChange={(event) => setRecordingName(event.target.files?.[0]?.name ?? null)}
              className="mt-1 block w-full rounded-lg border border-dashed border-[#d8d8d2] bg-[#fafaf8] px-3 py-2 text-[12px] font-medium text-[#1a1a1a]/60 file:mr-3 file:rounded-md file:border-0 file:bg-[#111110] file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-white"
            />
            <span className="mt-1 block text-[11px] font-medium text-[#1a1a1a]/35">mp3, m4a, wav, webm, ogg, mp4 · 최대 50MB</span>
          </label>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
            기록 시각
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none focus:border-[#084734]"
            />
          </label>
          <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
            담당자
            <input
              list={ownerListId}
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
              placeholder="담당자 이름 또는 계정 선택"
              className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
            />
          </label>
        </div>

        <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
          제목
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={mode === "recording" ? "녹음 요약 제목" : "미팅/메모 제목"}
            className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
          />
        </label>

        <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
          한 줄 요약
          <input
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="예: 7월 도입 검토, 하드웨어 견적 요청"
            className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
          />
        </label>

        {showField("body") ? (
          <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
            원문 메모 / 회의록
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={compact ? 3 : 5}
              placeholder="회의록, 카톡 요약, 통화 메모를 그대로 붙여넣기"
              className="mt-1 w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] font-medium leading-5 text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
            />
          </label>
        ) : null}

        {MODE_FIELDS[mode].advanced.length ? (
          <button
            type="button"
            onClick={() => setShowAdvanced((value) => !value)}
            className="inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-lg border border-[#e8e8e4] bg-[#fafaf8] px-3 text-[12px] font-semibold text-[#1a1a1a]/60 transition-colors hover:bg-[#f0f0ec]"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            {showAdvanced ? "상세 입력 접기" : "상세 입력 펼치기"}
          </button>
        ) : null}

        {showField("attendees") || showField("meetingPurpose") ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {showField("attendees") ? (
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                참석자
                <input
                  value={attendees}
                  onChange={(event) => setAttendees(event.target.value)}
                  placeholder="쉼표 또는 줄바꿈"
                  className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
                />
              </label>
            ) : null}
            {showField("meetingPurpose") ? (
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                미팅 목적
                <input
                  value={meetingPurpose}
                  onChange={(event) => setMeetingPurpose(event.target.value)}
                  placeholder="상담, 데모, 견적, 갱신"
                  className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
                />
              </label>
            ) : null}
          </div>
        ) : null}

        {showField("decisions") || showField("blockers") ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {showField("decisions") ? (
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                결정/합의
                <textarea
                  value={decisions}
                  onChange={(event) => setDecisions(event.target.value)}
                  rows={2}
                  placeholder="줄바꿈으로 입력"
                  className="mt-1 w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] font-medium leading-5 text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
                />
              </label>
            ) : null}
            {showField("blockers") ? (
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                리스크/이견
                <textarea
                  value={blockers}
                  onChange={(event) => setBlockers(event.target.value)}
                  rows={2}
                  placeholder="가격, 일정, 의사결정자 등"
                  className="mt-1 w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] font-medium leading-5 text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
                />
              </label>
            ) : null}
          </div>
        ) : null}

        {showField("nextAction") ? (
          <div className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3">
            <p className="mb-2 text-[12px] font-bold text-[#111110]">다음 액션</p>
            <div className="grid gap-2">
              <input
                value={nextActionTitle}
                onChange={(event) => setNextActionTitle(event.target.value)}
                placeholder="예: 견적서 발송, 데모 일정 확정"
                className="h-10 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  list={ownerListId}
                  value={nextActionOwner}
                  onChange={(event) => setNextActionOwner(event.target.value)}
                  placeholder="담당자"
                  className="h-10 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
                />
                <input
                  type="datetime-local"
                  value={nextActionDueAt}
                  onChange={(event) => setNextActionDueAt(event.target.value)}
                  className="h-10 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none focus:border-[#084734]"
                />
              </div>
            </div>
          </div>
        ) : null}

        {showField("sentiment") || showField("stageSignal") ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {showField("sentiment") ? (
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                분위기
                <select
                  value={sentiment}
                  onChange={(event) => setSentiment(event.target.value as Exclude<Sentiment, "all">)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
                >
                  <option value="neutral">중립</option>
                  <option value="positive">긍정</option>
                  <option value="risk">리스크</option>
                </select>
              </label>
            ) : null}
            {showField("stageSignal") ? (
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                단계 신호
                <select
                  value={stageSignal}
                  onChange={(event) => setStageSignal(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
                >
                  {STAGE_SIGNALS.map((signal) => (
                    <option key={signal.value || "none"} value={signal.value}>
                      {signal.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        {showField("tags") ? (
          <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
            태그
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="견적, 갱신, 하드웨어"
              className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
            />
          </label>
        ) : null}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={resetForm}
            className="h-10 flex-1 rounded-lg border border-[#e8e8e4] bg-white text-[13px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#fafaf8]"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="inline-flex h-10 flex-[1.4] items-center justify-center gap-2 rounded-lg bg-[#084734] text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-45"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
