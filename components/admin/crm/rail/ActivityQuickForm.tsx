"use client"

// CRM 기록 빠른 생성 폼 SSOT — CrmActivityClient(기록 표면)와 CrmActionRail(우측 레일),
// 기록 탭 상단 컴포저가 같은 폼을 소비한다. 모드별 필드 분기(MODE_FIELDS)·FormData 직렬화·검증 문구는
// 기존 CrmActivityClient 폼과 값·API 계약이 동일하다(/api/admin/crm/events POST).
// variant: full(기본 카드) | compact(레일 장착) | composer(한 줄 컴포저 — 기록 탭 상단·360 드로어 pin).
// 세 변형 모두 같은 상태·검증·필드 조각을 공유한다(필드 스택 SSOT).

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react"
import { Building2, CheckCircle2, ChevronDown, Loader2, Paperclip, PhoneCall } from "lucide-react"

import { adminFetch } from "@/lib/admin-client"
import {
  ACTIVITY_TEMPLATES,
  activityTemplatePrefill,
  applyActivityTemplate,
  type ActivityTemplate,
} from "@/lib/crm/activity-templates"
import { entityIdFromCustomerKey, getRecentCustomers, type RecentCustomer } from "@/lib/crm/recent-customers"
import { STATUS_TONE_CLASS, STATUS_TONE_TEXT_STRONG_CLASS } from "@/lib/crm/status-tone"
import { Toast } from "@/components/admin/crm/leads/shared"
import CrmCustomerPicker, { type CustomerPickValue } from "@/components/admin/crm/CrmCustomerPicker"
import {
  INTERACTIVE_TEXT_CLASS,
  MOBILE_TOUCH_TARGET_CLASS,
  SECONDARY_TEXT_CLASS,
} from "@/components/admin/crm/home/shared"
import { useCrmOwners } from "@/components/admin/crm/useCrmOwners"
import {
  EVENTS_URL,
  CRM_RECORDING_MAX_BYTES,
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
  /** composer = 한 줄 컴포저(기록 탭·드로어 pin용). 미지정 시 compact 여부로 결정. */
  variant?: "full" | "compact" | "composer"
  /** composer에서 대상 피커 숨김(드로어처럼 대상이 고정된 컨텍스트) */
  lockTarget?: boolean
  /** 고객 프리셀렉트 — 대상 타입 (홈/고객DB/기록 딥링크 장착용) */
  defaultTargetType?: ActivityTargetType
  /** 고객 프리셀렉트 — 대상 ID */
  defaultTargetId?: string
  /** 고객 프리셀렉트 — 표시 이름 */
  defaultTargetLabel?: string
  /** 본문 textarea에 부여할 DOM id — 부모 CTA가 getElementById(...).focus()로 포커스를 옮길 때 사용 */
  bodyFieldId?: string
  /** 저장 성공 후 콜백(타임라인 refresh 등). tasksCreated = 함께 생성된 할 일 수 */
  onSaved?: (result: { tasksCreated: number }) => void
  /** 작성 중 여부(isActivityFormDirty)가 플립될 때 통지(드로어 닫기 dirty 가드용) */
  onDirtyChange?: (dirty: boolean) => void
}

/** 닫기 가드가 보는 '작성 중' 판정 — 제출 허용 집합 + 상세 서술 필드. 순수 함수(테스트 고정용). */
export function isActivityFormDirty(fields: {
  body: string
  title: string
  summary: string
  nextActionTitle: string
  decisions: string
  blockers: string
  attendees: string
  meetingPurpose: string
  recordingName: string | null
}): boolean {
  return (
    fields.body.trim().length > 0 ||
    fields.title.trim().length > 0 ||
    fields.summary.trim().length > 0 ||
    fields.nextActionTitle.trim().length > 0 ||
    fields.decisions.trim().length > 0 ||
    fields.blockers.trim().length > 0 ||
    fields.attendees.trim().length > 0 ||
    fields.meetingPurpose.trim().length > 0 ||
    Boolean(fields.recordingName)
  )
}

/** 미연결 경고 블록이 보여 주는 최근 고객 수 상한(기획 §11.2 A3). */
export const UNLINKED_RECENT_LIMIT = 5

export type ActivitySubmitGate = "save" | "warn_unlinked"

/**
 * 저장 게이트(A3) — 고객이 연결되지 않은 채 저장을 누르면 조용히 미연결로 저장하지 않고 경고를 띄운다.
 * lockTarget(드로어처럼 부모가 대상을 고정한 컨텍스트)이나 "미연결로 저장"을 명시적으로 누른 뒤(allowUnlinked)에만
 * 그대로 저장한다. 순수 함수(테스트 고정용).
 */
export function resolveActivitySubmitGate(input: {
  targetId: string
  lockTarget: boolean
  allowUnlinked: boolean
}): ActivitySubmitGate {
  if (input.targetId.trim()) return "save"
  if (input.lockTarget || input.allowUnlinked) return "save"
  return "warn_unlinked"
}

/** 최근 고객 항목 → 피커와 같은 선택값(targetType/targetId/targetLabel). */
export function recentCustomerToPick(recent: RecentCustomer): CustomerPickValue {
  return { targetType: recent.source, targetId: entityIdFromCustomerKey(recent.key), targetLabel: recent.name }
}

/** 경고 블록에 올릴 최근 고객 — 상한을 넘기지 않고, 이름이 없는 항목은 거른다. 순수 함수. */
export function recentCustomersForUnlinkedWarning(recents: RecentCustomer[]): RecentCustomer[] {
  return recents.filter((recent) => recent.key && recent.name.trim()).slice(0, UNLINKED_RECENT_LIMIT)
}

/**
 * 인라인 확인 블록(템플릿 덮어쓰기·미연결 경고)의 공통 닫힘 규칙 — 바깥 클릭(mousedown)·Esc 에 닫힌다.
 * 열리는 클릭의 mousedown 은 리스너 등록 전에 이미 지나갔으므로 열자마자 닫히지 않는다.
 */
function useDismissOnOutside(ref: RefObject<HTMLElement | null>, active: boolean, onDismiss: () => void) {
  const onDismissRef = useRef(onDismiss)
  useEffect(() => {
    onDismissRef.current = onDismiss
  })
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      onDismissRef.current()
    }
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (ref.current && ref.current.contains(target)) return
      onDismissRef.current()
    }
    document.addEventListener("keydown", onKeyDown, true)
    document.addEventListener("mousedown", onMouseDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      document.removeEventListener("mousedown", onMouseDown)
    }
  }, [active, ref])
}

export default function ActivityQuickForm({
  compact = false,
  variant,
  lockTarget = false,
  defaultTargetType,
  defaultTargetId,
  defaultTargetLabel,
  bodyFieldId,
  onSaved,
  onDirtyChange,
}: ActivityQuickFormProps) {
  // 변형 정규화 — 명시 variant 우선, 없으면 기존 compact prop으로 결정(기존 호출부 무수정).
  const resolvedVariant: "full" | "compact" | "composer" = variant ?? (compact ? "compact" : "full")
  const isComposer = resolvedVariant === "composer"
  const isCompact = resolvedVariant === "compact"

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
  // A2 — 템플릿 칩. pendingTemplate = 본문이 이미 있어 덮어쓰기 확인을 기다리는 템플릿,
  // appliedTemplateId = 마지막으로 적용한 템플릿(칩 aria-pressed·다음 액션 제안 캡션용).
  const [pendingTemplate, setPendingTemplate] = useState<ActivityTemplate | null>(null)
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null)
  // A3 — 고객 미연결 저장 경고. null 이면 닫힘, 열리면 그 시점의 최근 고객 목록을 들고 있다.
  const [unlinkedWarning, setUnlinkedWarning] = useState<{ recents: RecentCustomer[] } | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const templateConfirmRef = useRef<HTMLDivElement | null>(null)
  const templateConfirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const unlinkedWarningRef = useRef<HTMLDivElement | null>(null)
  const { owners: crmOwners, health: ownerHealth } = useCrmOwners()
  const ownerListId = useId()
  // 감사 2026-09-07 §4 — saving은 리렌더가 커밋된 뒤에야 버튼을 비활성화한다. 저장 버튼을
  // 빠르게 두 번 누르면 두 클릭 모두 saving=false를 보고 같은 기록을 두 번 만든다
  // (CaptureInboxClient의 analyzeInFlightRef와 같은 패턴 — 동기 ref로 먼저 잠근다).
  const submitInFlightRef = useRef(false)

  // 딥링크/부모가 대상을 지정하면 폼 대상을 1회 프리셋한다(같은 대상 재지정은 무시).
  // 범위 해제(고객 스코프 → 전체)도 같은 축으로 처리해야 한다. /activity?targetId=A 에서
  // '전체 보기'를 누르면 같은 라우트라 이 컴포넌트가 리마운트되지 않는데, falsy에서 그냥
  // early-return 하면 화면은 "전체"인데 컴포저 대상은 A로 남아 상태가 어긋난다.
  const presetRef = useRef<string | null>(defaultTargetId ?? null)
  useEffect(() => {
    if (!defaultTargetId) {
      // 프리셋으로 채워졌던 대상만 되돌린다(사용자가 직접 고른 적 없는 상태에서만 발생).
      if (presetRef.current == null) return
      presetRef.current = null
      setTargetId("")
      setTargetLabel("")
      setTargetType(presetTargetType)
      return
    }
    if (presetRef.current === defaultTargetId) return
    presetRef.current = defaultTargetId
    setTargetId(defaultTargetId)
    if (defaultTargetType) setTargetType(defaultTargetType)
    if (defaultTargetLabel) setTargetLabel(defaultTargetLabel)
  }, [defaultTargetId, defaultTargetType, defaultTargetLabel, presetTargetType])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  // dirty 통지 — 닫기 가드용. c360-05: 제출을 허용하는 필드 집합(제목·요약·본문·다음 액션·녹음파일)과
  // '+상세'에서 적는 서술 필드(참석자·미팅 목적·결정·리스크)까지 포함한다. 본문/제목만 보면
  // 회의 참석자·다음 액션을 적다가 드로어를 닫아도 확인 없이 사라졌다.
  const isDirty = isActivityFormDirty({
    body,
    title,
    summary,
    nextActionTitle,
    decisions,
    blockers,
    attendees,
    meetingPurpose,
    recordingName,
  })
  const onDirtyChangeRef = useRef(onDirtyChange)
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange
  })
  useEffect(() => {
    onDirtyChangeRef.current?.(isDirty)
  }, [isDirty])

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
    setPendingTemplate(null)
    setAppliedTemplateId(null)
    setUnlinkedWarning(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // 인라인 확인 블록 닫힘 규칙(바깥 클릭·Esc) — 둘 다 저장하지 않고 닫기만 한다.
  useDismissOnOutside(templateConfirmRef, pendingTemplate != null, () => setPendingTemplate(null))
  useDismissOnOutside(unlinkedWarningRef, unlinkedWarning != null, () => setUnlinkedWarning(null))

  // 열리면 포커스를 블록으로 옮긴다 — 키보드 사용자가 Esc·확인 버튼에 바로 닿고, role=alert 낭독과도 맞물린다.
  useEffect(() => {
    if (pendingTemplate) templateConfirmButtonRef.current?.focus()
  }, [pendingTemplate])
  useEffect(() => {
    if (unlinkedWarning) unlinkedWarningRef.current?.focus()
  }, [unlinkedWarning])

  const applyTemplate = (template: ActivityTemplate) => {
    const prefill = activityTemplatePrefill(template)
    setMode(prefill.mode)
    setBody(prefill.body)
    setSentiment(prefill.sentiment)
    setShowAdvanced(false)
    setAppliedTemplateId(template.id)
    setPendingTemplate(null)
  }

  const handleTemplateClick = (template: ActivityTemplate) => {
    const result = applyActivityTemplate(template, { body })
    if (result.needsConfirm) {
      // 본문이 있으면 덮어쓰지 않는다 — 인라인 확인(확인/취소)을 거친 뒤에만 applyTemplate.
      setPendingTemplate(template)
      return
    }
    applyTemplate(template)
  }

  const handleSubmit = async (options?: { targetOverride?: CustomerPickValue; allowUnlinked?: boolean }) => {
    // 동기 ref 잠금 — state(saving) 갱신이 반영되기 전의 두 번째 클릭을 여기서 막는다.
    if (submitInFlightRef.current) return
    submitInFlightRef.current = true

    // 최근 고객 칩으로 방금 연결한 대상은 state 반영을 기다리지 않고 override 로 바로 쓴다.
    const override = options?.targetOverride ?? null
    const effectiveTargetType: TargetType = override?.targetType ?? targetType
    const effectiveTargetId = override?.targetId ?? targetId
    const effectiveTargetLabel = override?.targetLabel ?? targetLabel

    const file = fileInputRef.current?.files?.[0] ?? null
    if (!title.trim() && !summary.trim() && !body.trim() && !nextActionTitle.trim() && !file) {
      setToast({ msg: "제목, 요약, 메모, 다음 액션 또는 녹음파일 중 하나는 필요합니다.", type: "error" })
      submitInFlightRef.current = false
      return
    }

    // A3 — 고객 미연결이면 저장하지 않고 경고 블록을 연다(최근 고객 원클릭·"미연결로 저장" 명시 확인).
    const gate = resolveActivitySubmitGate({
      targetId: effectiveTargetId,
      lockTarget,
      allowUnlinked: options?.allowUnlinked === true,
    })
    if (gate === "warn_unlinked") {
      setUnlinkedWarning({ recents: recentCustomersForUnlinkedWarning(getRecentCustomers()) })
      submitInFlightRef.current = false
      return
    }
    setUnlinkedWarning(null)

    const formData = new FormData()
    formData.append("sourceType", mode)
    formData.append("targetType", effectiveTargetType)
    appendFormValue(formData, "targetLabel", effectiveTargetLabel)
    appendFormValue(formData, "targetId", effectiveTargetId)
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
      submitInFlightRef.current = false
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

  // ---- 공유 필드 조각(SSOT) — full/compact 스택과 composer 상세 영역이 같은 조각을 렌더한다 ----

  const ownerDatalist = (
    <datalist id={ownerListId}>
      {crmOwners.map((owner) => (
        <option
          key={owner.ownerKey}
          value={owner.ownerKey}
          label={`${owner.displayName} · ${owner.teamRoleLabel}${owner.branchName ? ` · ${owner.branchName}` : ""}`}
        />
      ))}
    </datalist>
  )

  const ownerHealthNotice =
    ownerHealth?.ok === false && ownerHealth.message ? (
      <div className={`rounded-xl border px-3 py-2 text-[12px] ${STATUS_TONE_CLASS.danger}`}>
        {ownerHealth.message}
      </div>
    ) : null

  const customerPicker = (
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
  )

  // ⌘/Ctrl+Enter 저장 — 본문 textarea 에서. 조합 입력(한글 IME) 중의 Enter 는 무시한다. 저장 게이트(A3)는 같은 handleSubmit 을 탄다.
  const onBodyKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || event.nativeEvent.isComposing) return
    event.preventDefault()
    void handleSubmit()
  }

  const appliedTemplate = appliedTemplateId
    ? (ACTIVITY_TEMPLATES.find((template) => template.id === appliedTemplateId) ?? null)
    : null
  const nextActionHint =
    appliedTemplate?.nextActionHint && !nextActionTitle.trim() ? appliedTemplate.nextActionHint : null

  // A2 — 템플릿 칩 행(텍스트 버튼·44px 터치 타깃·포커스 링) + 덮어쓰기 확인 + 다음 액션 제안 캡션.
  const templateChipRow = (
    <div data-testid="activity-template-row">
      <div className={`flex flex-wrap items-center gap-x-0.5 gap-y-0.5 ${MOBILE_TOUCH_TARGET_CLASS}`} role="group" aria-label="기록 템플릿">
        <span className={`mr-1 text-[11px] font-semibold ${SECONDARY_TEXT_CLASS}`}>템플릿</span>
        {ACTIVITY_TEMPLATES.map((template) => {
          const active = appliedTemplateId === template.id
          return (
            <button
              key={template.id}
              type="button"
              aria-pressed={active}
              onClick={() => handleTemplateClick(template)}
              className={`inline-flex h-8 items-center rounded-md px-2 text-[12px] font-semibold transition-colors hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-1 ${
                active ? "text-[#084734] underline underline-offset-4" : INTERACTIVE_TEXT_CLASS
              }`}
            >
              {template.label}
            </button>
          )
        })}
      </div>

      {pendingTemplate ? (
        <div
          ref={templateConfirmRef}
          role="group"
          aria-label="템플릿 덮어쓰기 확인"
          data-testid="activity-template-confirm"
          className={`mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[12px] ${STATUS_TONE_CLASS.warning} ${MOBILE_TOUCH_TARGET_CLASS}`}
        >
          <span role="status" className="min-w-0 flex-1">
            <strong className={`font-bold ${STATUS_TONE_TEXT_STRONG_CLASS.warning}`}>본문을 바꿀까요?</strong>{" "}
            ‘{pendingTemplate.label}’ 템플릿이 지금 적힌 본문을 대체합니다.
          </span>
          <button
            ref={templateConfirmButtonRef}
            type="button"
            onClick={() => applyTemplate(pendingTemplate)}
            className={`inline-flex h-8 items-center rounded-md border border-current bg-white px-2.5 text-[12px] font-semibold ${STATUS_TONE_TEXT_STRONG_CLASS.warning} transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]`}
          >
            확인
          </button>
          <button
            type="button"
            onClick={() => setPendingTemplate(null)}
            className={`inline-flex h-8 items-center rounded-md px-2 text-[12px] font-semibold ${INTERACTIVE_TEXT_CLASS} hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]`}
          >
            취소
          </button>
        </div>
      ) : null}

      {nextActionHint ? (
        <p className={`mt-1 flex flex-wrap items-center gap-1 text-[11px] ${SECONDARY_TEXT_CLASS} ${MOBILE_TOUCH_TARGET_CLASS}`}>
          다음 액션 제안: <span className="font-semibold text-[#111110]">{nextActionHint}</span>
          <button
            type="button"
            onClick={() => {
              setNextActionTitle(nextActionHint)
              setShowAdvanced(true)
            }}
            className={`inline-flex h-6 items-center rounded px-1 font-semibold underline underline-offset-2 ${INTERACTIVE_TEXT_CLASS} hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]`}
          >
            다음 액션으로 넣기
          </button>
        </p>
      ) : null}
    </div>
  )

  // A3 — 고객 미연결 경고 블록. role=alert 로 낭독, 최근 고객 원클릭(연결 후 바로 저장), "미연결로 저장"은 명시 확인.
  const unlinkedWarningBlock = unlinkedWarning ? (
    <div
      ref={unlinkedWarningRef}
      role="alert"
      tabIndex={-1}
      data-testid="activity-unlinked-warning"
      className={`rounded-xl border px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[#084734] ${STATUS_TONE_CLASS.warning} ${MOBILE_TOUCH_TARGET_CLASS}`}
    >
      <p className={`text-[12px] font-bold ${STATUS_TONE_TEXT_STRONG_CLASS.warning}`}>연결된 고객이 없습니다</p>
      <p className="mt-0.5 text-[11px]">고객을 연결해야 360 타임라인에 붙습니다. 최근 고객을 고르면 연결하고 바로 저장합니다.</p>
      {unlinkedWarning.recents.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="최근 고객">
          {unlinkedWarning.recents.map((recent) => (
            <button
              key={recent.key}
              type="button"
              onClick={() => {
                const pick = recentCustomerToPick(recent)
                setTargetType(pick.targetType)
                setTargetId(pick.targetId)
                setTargetLabel(pick.targetLabel)
                setUnlinkedWarning(null)
                void handleSubmit({ targetOverride: pick })
              }}
              className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-[#ECD29C] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            >
              <span className={SECONDARY_TEXT_CLASS} aria-hidden>
                {recent.source === "lead" ? <PhoneCall className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
              </span>
              <span className="truncate">{recent.name}</span>
              <span className={`text-[10px] font-medium ${SECONDARY_TEXT_CLASS}`}>{recent.sourceLabel}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px]">최근 고객 없음 · 위 검색으로 연결</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSubmit({ allowUnlinked: true })}
          disabled={saving}
          className={`inline-flex h-8 items-center rounded-md border border-current bg-white px-2.5 text-[12px] font-semibold ${STATUS_TONE_TEXT_STRONG_CLASS.warning} transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:opacity-45`}
        >
          미연결로 저장
        </button>
        <button
          type="button"
          onClick={() => setUnlinkedWarning(null)}
          className={`inline-flex h-8 items-center rounded-md px-2 text-[12px] font-semibold ${INTERACTIVE_TEXT_CLASS} hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]`}
        >
          취소
        </button>
      </div>
    </div>
  ) : null

  const recordingField = showField("recording") ? (
    <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
      녹음파일
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/mp4,video/quicktime"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null
          // 상한 검사가 서버에만 있으면, 300MB 파일도 일단 전부 올린 뒤에야 거절당한다
          // (느린 회선에서 수 분). 고르는 즉시 막고 입력을 비운다.
          if (file && file.size > CRM_RECORDING_MAX_BYTES) {
            event.target.value = ""
            setRecordingName(null)
            setToast({
              msg: `녹음파일은 ${Math.round(CRM_RECORDING_MAX_BYTES / (1024 * 1024))}MB 이하만 올릴 수 있습니다.`,
              type: "error",
            })
            return
          }
          setRecordingName(file?.name ?? null)
        }}
        className="mt-1 block w-full rounded-lg border border-dashed border-[#d8d8d2] bg-[#fafaf8] px-3 py-2 text-[12px] font-medium text-[#1a1a1a]/60 file:mr-3 file:rounded-md file:border-0 file:bg-[#111110] file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-white"
      />
      <span className="mt-1 block text-[11px] font-medium text-[#1a1a1a]/35">mp3, m4a, wav, webm, ogg, mp4 · 최대 50MB</span>
    </label>
  ) : null

  const metaFields = (
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
  )

  const titleField = (
    <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
      제목
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={mode === "recording" ? "녹음 요약 제목" : "미팅/메모 제목"}
        className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
      />
    </label>
  )

  const summaryField = (
    <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
      한 줄 요약
      <input
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        placeholder="예: 7월 도입 검토, 하드웨어 견적 요청"
        className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
      />
    </label>
  )

  const advancedFieldStack = (
    <>
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
    </>
  )

  // ---- composer: 한 줄 컴포저(모드 칩 → 대상+본문+저장 → 힌트/상세 토글 → 상세 스택) ----
  if (isComposer) {
    return (
      <div>
        {toast ? <Toast msg={toast.msg} type={toast.type} /> : null}
        {ownerDatalist}

        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-2.5">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="기록 종류 선택">
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
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition-colors ${
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

          <div className="mt-1.5">{templateChipRow}</div>

          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
            {!lockTarget ? (
              // 컴포저에는 보이는 라벨이 없어 sr-only 라벨로 접근 가능한 이름을 준다.
              <label className="shrink-0 sm:w-52">
                <span className="sr-only">고객/리드</span>
                {customerPicker}
              </label>
            ) : null}
            <textarea
              id={bodyFieldId}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={onBodyKeyDown}
              rows={2}
              placeholder={targetLabel ? `${targetLabel} 기록 남기기` : "무슨 일이 있었나요? (본문만 적어도 저장됩니다)"}
              className="min-w-0 flex-1 resize-none rounded-lg border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2 text-[13px] font-medium leading-5 text-[#111110] outline-none placeholder:text-[#1a1a1a]/30 focus:border-[#084734]"
            />
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#084734] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-45"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              저장
            </button>
          </div>

          {/* 녹음 모드: 파일 입력을 컴포저 줄 바로 아래 인라인 노출(상세 토글 없이 첨부 가능) */}
          {recordingField ? <div className="mt-2 grid">{recordingField}</div> : null}

          {unlinkedWarningBlock ? <div className="mt-2">{unlinkedWarningBlock}</div> : null}

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="text-[11px] text-[#1a1a1a]/35">
              {targetId ? "고객 360 타임라인에 연결됩니다." : "고객을 고르지 않으면 저장 전에 확인합니다. ⌘/Ctrl+Enter 저장"}
            </p>
            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="shrink-0 text-[11px] font-semibold text-[#1a1a1a]/50 transition-colors hover:text-[#111110]"
            >
              {showAdvanced ? "상세 접기" : "+ 상세 (제목·다음 액션 등)"}
            </button>
          </div>

          {showAdvanced ? (
            <div className="mt-2.5 grid gap-2.5 border-t border-[#f0f0ec] pt-2.5">
              {ownerHealthNotice}
              {metaFields}
              {titleField}
              {summaryField}
              {advancedFieldStack}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  // ---- full / compact ----
  return (
    <div>
      {toast ? <Toast msg={toast.msg} type={toast.type} /> : null}

      {!isCompact ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-[#111110]">빠른 입력</h2>
            <p className="mt-0.5 text-[12px] text-[#1a1a1a]/42">원문은 짧게 붙이고, 액션만 빠뜨리지 않게 남깁니다.</p>
          </div>
          <Paperclip className="h-4 w-4 text-[#1a1a1a]/30" />
        </div>
      ) : null}

      {isCompact ? (
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

      <div className="mt-2">{templateChipRow}</div>

      <div className={isCompact ? "mt-3 grid gap-2.5" : "mt-4 grid gap-3"}>
        {ownerDatalist}
        {ownerHealthNotice}

        <div className={isCompact ? "grid gap-2" : "grid grid-cols-[130px_minmax(0,1fr)] gap-2"}>
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
            {customerPicker}
          </label>
        </div>

        {targetId ? (
          <p className="text-[11px] text-[#1a1a1a]/40">연결된 대상에 기록이 저장되어 고객 360 타임라인에 바로 표시됩니다.</p>
        ) : (
          <p className="text-[11px] text-[#1a1a1a]/40">
            고객을 선택하면 360 타임라인에 연결됩니다. 고르지 않으면 저장 전에 확인합니다.
          </p>
        )}

        {recordingField}

        {metaFields}

        {titleField}

        {summaryField}

        {showField("body") ? (
          <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
            원문 메모 / 회의록
            <textarea
              id={bodyFieldId}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={onBodyKeyDown}
              rows={isCompact ? 3 : 5}
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

        {advancedFieldStack}

        {unlinkedWarningBlock}

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
