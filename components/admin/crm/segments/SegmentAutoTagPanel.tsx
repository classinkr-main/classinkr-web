"use client"

// 세그먼트 허브 — 매일 자동 태그 패널(C안 ②, 2026-09-25 결정).
//  - 매일 KST 06시(디스패처 UTC 21 슬롯) 저장된 조건에 맞는 고객에게 Home 태그를 붙인다. Compass 에는 쓰지 않는다.
//  - 켜기·끄기는 관리자(SUPER_ADMIN·ADMIN)만, 팀 공유 세그먼트만. 관리자가 아니면 토글을 막고 사유를 보인다
//    (서버가 canManageAutoTag 로 알려 준다 — 세션 역할을 추측하지 않는다).
//  - 켜기 전에 반드시 드라이런(POST [id]/run {dryRun:true})으로 "오늘 N명에 붙고 M명에서 뗌"을 먼저 보여 준다.
//    미리보기 뒤 라벨·떼기 설정이나 저장된 조건을 바꾸면 미리보기가 무효가 되어 다시 봐야 켤 수 있다. 저장 안 된
//    변경(dirty)·보관 등 켜기 차단 사유가 생기면 켜기 폼을 닫는다(드라이런 숫자는 저장본 기준이라 초안과 어긋난다).
//  - 떼기(auto_untag)는 기본 끔. 끌 때 이미 붙은 자동 태그를 뗄지는 선택(수동 태그는 절대 지우지 않는다 — 서버 규칙).
//  - NEO 가 오래됐으면 NEO 조건 세그먼트는 매일 건너뛴다(무시 옵션 없음). Compass 가 끊기면 무연락 조건은
//    붙이지도 떼지도 않는다. 둘 다 "켰는데 안 붙는다"로 보이지 않게 이유를 먼저 말한다.
// 확인은 인라인 UI 로만 한다(브라우저 기본 확인창 금지).
// 켜져 있으면 붙인 라벨을 확인할 곳으로 링크한다 — 통합 목록 ?tag= 와 태그 관리(기본 숨김 탭 — 주소로 열린다).

import { useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Eye, Loader2, Play, Power } from "lucide-react"

import type {
  SavedSegmentListItem,
  SavedSegmentLiveStatus,
  SavedSegmentRunResponse,
} from "@/lib/crm/saved-segment-api"
import {
  segmentFilterQueryString,
  segmentFilterUsesContact,
  segmentFilterUsesNeoSignals,
} from "@/lib/crm/customer-segment-filter"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"

import {
  CRM_TAG_ADMIN_PATH,
  SEGMENT_AUTO_TAG_LABEL_MAX,
  autoTagBlockReason,
  describeAutoTagStatus,
  describeBySource,
  describeQualityFlags,
  describeRunOutcome,
  formatKstMonthDay,
  formatRunAt,
  runSavedSegment,
  runSkipReason,
  segmentTagListHref,
  updateSavedSegment,
  validateAutoTagLabel,
  type HubTone,
} from "./segment-hub-api"

export const AUTO_TAG_MANAGER_ONLY_REASON = "자동 태그는 관리자(SUPER_ADMIN·ADMIN)만 켜고 끌 수 있습니다."

/** 라벨 기본값 — 세그먼트 이름을 태그 규칙(공백 1칸·40자)으로 다듬는다. */
export function suggestAutoTagLabel(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, SEGMENT_AUTO_TAG_LABEL_MAX).trim()
}

/** 저장된 조건의 정규형 — 미리보기 키에 넣어, 조건을 바꿔 저장하면 이전 드라이런이 무효가 되게 한다. */
export function autoTagSpecKey(segment: Pick<SavedSegmentListItem, "spec" | "specVersion">): string {
  return `v${segment.specVersion}:${segmentFilterQueryString(segment.spec)}`
}

/**
 * 켜기 드라이런 키 — 저장 조건·라벨·떼기 설정이 모두 같을 때만 같은 키. 드라이런 숫자는 서버의 **저장된** 조건으로
 * 계산되므로 조건을 바꿔 저장하면(관리자는 PATCH 가능) 키가 바뀌어 "켜기"가 다시 막힌다.
 */
export function autoTagPreviewKey(label: string, untag: boolean, specKey: string): string {
  return `assume|${specKey}|${label.trim().replace(/\s+/g, " ").toLowerCase()}|${untag ? 1 : 0}`
}

/** 켜진 세그먼트의 "오늘 실행 미리보기"·"지금 한 번 적용" 결과 키 — 역시 저장 조건에 묶는다. */
export function autoTagRunKey(kind: "current" | "applied", specKey: string): string {
  return `${kind}|${specKey}`
}

type Mode = "view" | "enabling" | "disabling"

/**
 * 켜기 폼·켜기 버튼 게이트(순수). 켜기를 막는 사유(권한·저장 전 변경·표 미적용·보관·조건 판·공유 범위)가 있으면
 * 폼을 닫고, 지금 저장 조건·입력과 같은 키의 드라이런이 있고 라벨이 유효할 때만 켤 수 있다.
 */
export function autoTagEnableGate(input: {
  mode: Mode
  enabled: boolean
  enableBlock: string | null
  previewKey: string | null
  currentKey: string
  labelError: string | null
}): { formOpen: boolean; previewMatches: boolean; canEnable: boolean } {
  const formOpen = input.mode === "enabling" && !input.enabled && !input.enableBlock
  const previewMatches = formOpen && input.previewKey != null && input.previewKey === input.currentKey
  return { formOpen, previewMatches, canEnable: previewMatches && !input.labelError }
}

/** NEO·Compass 원천 상태로 인한 경고 문구(없으면 빈 배열). */
export function autoTagSourceWarnings(
  segment: Pick<SavedSegmentListItem, "spec">,
  live: SavedSegmentLiveStatus | null
): string[] {
  const warnings: string[] = []
  if (live?.neoStale && segmentFilterUsesNeoSignals(segment.spec)) {
    const day = formatKstMonthDay(live.neoLatestSyncedAt)
    const basis = day ? `${day} 기준으로 ` : ""
    warnings.push(
      `NEO 값이 ${basis}오래됐습니다 — 이 세그먼트는 NEO 조건(만료·소진·잔액·위험·과금)을 써서 자동 태그가 동기화 복구 전까지 매일 건너뜁니다(건수 기록은 계속).`
    )
  }
  if ((live?.compass === "down" || live?.compass === "partial") && segmentFilterUsesContact(segment.spec)) {
    warnings.push("Compass 연결이 끊기거나 일부만 읽힌 날에는 무연락 조건 자동 태그를 붙이지도 떼지도 않습니다.")
  }
  return warnings
}

const TONE_TEXT: Record<HubTone, string> = {
  ok: STATUS_TONE_TEXT_CLASS.ok,
  warning: STATUS_TONE_TEXT_CLASS.warning,
  danger: STATUS_TONE_TEXT_CLASS.danger,
  idle: "text-[#615D59]",
}

function StatusText({ tone, children }: { tone: HubTone; children: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${TONE_TEXT[tone]}`}>
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  )
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

type Pending = "preview" | "save" | "apply" | null

function RunResult({ run, live }: { run: SavedSegmentRunResponse; live: SavedSegmentLiveStatus | null }) {
  const skip = runSkipReason(run)
  const flags = describeQualityFlags(run.flags, live?.neoLatestSyncedAt)
  const sources = describeBySource(run.bySource)
  return (
    <div className="grid gap-1 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2" role="status" aria-live="polite">
      <p className="text-[13px] font-semibold text-[#111110]" data-testid="segment-auto-tag-outcome">
        {describeRunOutcome(run)}
      </p>
      <p className="text-[11px] text-[#615D59]">
        지금 조건 {run.total.toLocaleString("ko-KR")}명{sources ? ` · ${sources}` : ""}
      </p>
      {skip ? (
        <p className={`text-[12px] font-medium ${STATUS_TONE_TEXT_CLASS.warning}`}>
          {run.dryRun ? `지금 켜도 오늘은 ${skip}` : skip}
        </p>
      ) : null}
      {run.dryRun && run.autoTagStatus === "off" ? (
        <p className="text-[11px] text-[#615D59]">
          서버가 꺼진 상태로 계산했습니다 — 붙일 인원은 켠 뒤 첫 실행에서 확정됩니다.
        </p>
      ) : null}
      {flags.length ? <p className={`text-[11px] ${STATUS_TONE_TEXT_CLASS.warning}`}>{flags.join(" · ")}</p> : null}
    </div>
  )
}

export default function SegmentAutoTagPanel({
  segment,
  live,
  dirty,
  available,
  nowMs,
  onSegmentChange,
  onNotice,
  onRefresh,
}: {
  segment: SavedSegmentListItem
  live: SavedSegmentLiveStatus | null
  /** 조건·이름을 바꾸고 아직 저장하지 않았는지 — 저장 전에는 켤 수 없다. */
  dirty: boolean
  /** 세그먼트 표 적용 여부(available:false 면 쓰기 전부 막음). */
  available: boolean
  nowMs: number
  onSegmentChange: (next: SavedSegmentListItem) => void
  onNotice: (message: string, tone: "success" | "danger") => void
  /** 적용 뒤 목록·상세를 다시 읽는다(마지막 실행 갱신). */
  onRefresh?: () => void
}) {
  const enabled = segment.autoTag.enabled
  const [mode, setMode] = useState<Mode>("view")
  const [label, setLabel] = useState(() => segment.autoTag.label ?? suggestAutoTagLabel(segment.name))
  const [untag, setUntag] = useState(segment.autoTag.untag)
  const [detach, setDetach] = useState(false)
  const [preview, setPreview] = useState<{ key: string; run: SavedSegmentRunResponse } | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<string | null>(null)

  const enableBlock = autoTagBlockReason(segment, { dirty, available })
  const disableBlock = !segment.canManageAutoTag
    ? AUTO_TAG_MANAGER_ONLY_REASON
    : !available
      ? "세그먼트 표가 아직 적용되지 않았습니다."
      : null
  const toggleBlock = enabled ? disableBlock : enableBlock
  const warnings = autoTagSourceWarnings(segment, live)
  const labelError = mode === "enabling" ? validateAutoTagLabel(label, segment.spec) : null
  // 미리보기 키는 저장 조건까지 담는다 — 드라이런 뒤 조건을 바꿔 저장하면(패널은 key=id 라 상태가 남는다) 키가 달라져
  // 한 번도 드라이런하지 않은 조건으로 켜지지 않는다. 저장 전 변경(dirty)·보관 등 켜기 차단 사유가 생기면 폼을 닫는다.
  const specKey = autoTagSpecKey(segment)
  const currentKey = autoTagPreviewKey(label, untag, specKey)
  const { formOpen, previewMatches, canEnable } = autoTagEnableGate({
    mode,
    enabled,
    enableBlock,
    previewKey: preview?.key ?? null,
    currentKey,
    labelError,
  })
  const currentRunKey = autoTagRunKey("current", specKey)
  const appliedRunKey = autoTagRunKey("applied", specKey)
  const lastRun = describeAutoTagStatus(segment.lastRunStatus, segment.lastRunDetail)
  const canPreview = available && !dirty && segment.specReadable && !segment.archivedAt
  // 켜진 세그먼트의 결과 줄 — 지금 저장 조건으로 잰 미리보기·적용 결과만(조건이 바뀐 뒤의 옛 숫자는 숨긴다).
  const viewRun = preview && (preview.key === currentRunKey || preview.key === appliedRunKey) ? preview.run : null
  const canApplyNow = segment.canManageAutoTag && canPreview && preview?.key === currentRunKey

  const resetTransient = () => {
    setPreview(null)
    setError(null)
    setDetach(false)
  }

  const onToggle = () => {
    if (toggleBlock || pending) return
    resetTransient()
    if (enabled) setMode(mode === "disabling" ? "view" : "disabling")
    else {
      setLabel(segment.autoTag.label ?? suggestAutoTagLabel(segment.name))
      setUntag(segment.autoTag.untag)
      setMode(mode === "enabling" ? "view" : "enabling")
    }
  }

  const runPreview = async (assume: boolean) => {
    if (assume) {
      // 켜기 차단 사유(저장 전 변경 등)가 있으면 드라이런하지 않는다 — 숫자는 화면 초안이 아니라 저장본 기준이다.
      const blocked = !formOpen ? (enableBlock ?? "자동 태그 켜기 화면이 닫혀 있습니다.") : labelError
      if (blocked) {
        setError(blocked)
        return
      }
    } else if (!canPreview) {
      return
    }
    // 요청 시점의 키로 묶는다 — 응답을 기다리는 사이 조건을 바꿔 저장하면 이 결과로는 켤 수 없다.
    const key = assume ? currentKey : currentRunKey
    setPending("preview")
    setError(null)
    try {
      const normalizedLabel = label.trim().replace(/\s+/g, " ")
      const run = await runSavedSegment(segment.id, {
        dryRun: true,
        assumeAutoTag: assume ? { label: normalizedLabel, untag } : undefined,
      })
      setPreview({ key, run })
    } catch (err) {
      setError(`미리보기를 계산하지 못했습니다(${errorMessage(err, "알 수 없는 오류")}).`)
    } finally {
      setPending(null)
    }
  }

  const confirmEnable = async () => {
    // 폼이 닫혔거나(차단 사유) 지금 저장 조건·입력과 같은 드라이런이 없으면 켜지 않는다.
    if (!canEnable) return
    setPending("save")
    setError(null)
    const normalizedLabel = label.trim().replace(/\s+/g, " ")
    try {
      const next = await updateSavedSegment(segment.id, { autoTag: { enabled: true, label: normalizedLabel, untag } })
      onSegmentChange(next)
      onNotice(`자동 태그를 켰습니다 — ${next.autoTag.scheduleLabel} #${next.autoTag.label ?? normalizedLabel}`, "success")
      setMode("view")
      setPreview(null)
    } catch (err) {
      setError(errorMessage(err, "자동 태그를 켜지 못했습니다."))
    } finally {
      setPending(null)
    }
  }

  const confirmDisable = async () => {
    if (disableBlock) return
    setPending("save")
    setError(null)
    try {
      const next = await updateSavedSegment(segment.id, { autoTag: { enabled: false, detachExisting: detach } })
      onSegmentChange(next)
      onNotice(detach ? "자동 태그를 끄고 이미 붙은 자동 태그를 뗐습니다." : "자동 태그를 껐습니다 — 이미 붙은 태그는 그대로 둡니다.", "success")
      setMode("view")
      setDetach(false)
    } catch (err) {
      setError(errorMessage(err, "자동 태그를 끄지 못했습니다."))
    } finally {
      setPending(null)
    }
  }

  const applyNow = async () => {
    if (!canApplyNow) return
    setPending("apply")
    setError(null)
    try {
      const run = await runSavedSegment(segment.id, { dryRun: false })
      setPreview({ key: appliedRunKey, run })
      const skip = runSkipReason(run)
      onNotice(skip ? `오늘 실행: ${skip}` : `오늘 실행: ${describeRunOutcome(run)}`, skip || run.failed ? "danger" : "success")
      onRefresh?.()
    } catch (err) {
      setError(`적용하지 못했습니다(${errorMessage(err, "알 수 없는 오류")}).`)
    } finally {
      setPending(null)
    }
  }

  return (
    <section aria-label="매일 자동 태그" className="grid gap-2 border-t border-[#e8e8e4] px-4 py-3" data-testid="segment-auto-tag">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-describedby={toggleBlock ? "segment-auto-tag-block" : undefined}
          onClick={onToggle}
          disabled={Boolean(toggleBlock) || pending !== null}
          className="group inline-flex min-h-11 items-center gap-2.5 rounded-lg pr-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] disabled:cursor-not-allowed sm:min-h-9"
        >
          <span
            aria-hidden
            className={`relative inline-flex h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${
              enabled ? "bg-[#084734]" : "bg-[#d9d9d4]"
            } group-disabled:opacity-50`}
          >
            <span
              className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${
                enabled ? "left-[19px]" : "left-[3px]"
              }`}
            />
          </span>
          <span className="text-[13px] font-semibold text-[#111110]">매일 자동 태그</span>
        </button>
        <p className="min-w-0 flex-1 text-[12px] text-[#615D59]">
          {enabled
            ? `${segment.autoTag.scheduleLabel} · #${segment.autoTag.label ?? "(라벨 없음)"} · 조건에서 빠지면 떼기 ${segment.autoTag.untag ? "켬" : "끔"}`
            : "매일 06시(KST) 저장된 조건에 맞는 고객에게 Home 태그를 붙입니다 — Compass 에는 쓰지 않습니다."}
        </p>
        {enabled || segment.lastRunStatus ? (
          <span className="flex flex-wrap items-center gap-2">
            <StatusText tone={lastRun.tone}>{lastRun.text}</StatusText>
            <span className="text-[11px] text-[#1a1a1a]/40">{formatRunAt(segment.lastEvaluatedAt, nowMs)}</span>
          </span>
        ) : null}
      </div>

      {enabled && segment.autoTag.label ? (
        <p className="flex flex-wrap items-center gap-x-3 text-[12px]" data-testid="segment-auto-tag-links">
          <Link
            href={segmentTagListHref(segment.autoTag.label)}
            prefetch={false}
            className="inline-flex min-h-11 items-center gap-0.5 font-semibold text-[#084734] underline-offset-2 hover:underline sm:min-h-0"
          >
            #{segment.autoTag.label} 붙은 고객 보기
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <Link
            href={CRM_TAG_ADMIN_PATH}
            prefetch={false}
            className="inline-flex min-h-11 items-center gap-0.5 font-semibold text-[#084734] underline-offset-2 hover:underline sm:min-h-0"
          >
            태그 관리
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </p>
      ) : null}

      {toggleBlock ? (
        <p id="segment-auto-tag-block" className="text-[12px] text-[#615D59]" data-testid="segment-auto-tag-block">
          {toggleBlock}
        </p>
      ) : null}

      {warnings.map((warning) => (
        <p key={warning} className={`text-[12px] font-medium ${STATUS_TONE_TEXT_CLASS.warning}`}>
          {warning}
        </p>
      ))}

      {formOpen ? (
        <div className="grid gap-2 rounded-xl border border-[#e8e8e4] bg-[#FAFAF8] p-3" data-testid="segment-auto-tag-enable-form">
          <div className="flex flex-wrap items-end gap-3">
            <label htmlFor="segment-auto-tag-label" className="grid gap-1 text-[12px] font-semibold text-[#111110]">
              붙일 태그
              <input
                id="segment-auto-tag-label"
                value={label}
                maxLength={SEGMENT_AUTO_TAG_LABEL_MAX}
                onChange={(event) => setLabel(event.target.value)}
                disabled={pending !== null}
                className="h-11 w-[min(260px,70vw)] rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 sm:h-9"
              />
            </label>
            <label htmlFor="segment-auto-untag" className="inline-flex min-h-11 items-center gap-2 text-[12px] text-[#31302E] sm:min-h-9">
              <input
                id="segment-auto-untag"
                type="checkbox"
                checked={untag}
                onChange={(event) => setUntag(event.target.checked)}
                disabled={pending !== null}
                className="h-4 w-4 accent-[#084734]"
              />
              조건에서 빠진 고객의 자동 태그 떼기(기본 끔)
            </label>
          </div>
          {labelError ? (
            <p className={`text-[12px] ${STATUS_TONE_TEXT_CLASS.danger}`} role="alert">
              {labelError}
            </p>
          ) : null}
          <p className="text-[11px] text-[#615D59]">
            켜기 전에 오늘 실행하면 몇 명에게 붙고 몇 명에서 떼는지 먼저 봅니다. 세그먼트당 1,000명이 넘거나 전날보다 크게
            바뀌면, 또는 NEO·Compass 가 막 복구돼 비교할 정상 기록이 없으면 그날은 건너뜁니다.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void runPreview(true)}
              disabled={pending !== null || Boolean(labelError)}
              aria-busy={pending === "preview" || undefined}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:border-[#c8c8c4] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
            >
              {pending === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
              {preview && !previewMatches ? "조건·설정이 바뀌었습니다 — 다시 미리보기" : "미리보기(드라이런)"}
            </button>
            <button
              type="button"
              onClick={() => void confirmEnable()}
              disabled={!canEnable || pending !== null}
              aria-busy={pending === "save" || undefined}
              title={previewMatches ? undefined : "먼저 미리보기로 오늘 붙일·뗄 인원을 확인하세요"}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9"
            >
              {pending === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Power className="h-3.5 w-3.5" aria-hidden />}
              켜기
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("view")
                resetTransient()
              }}
              disabled={pending === "save"}
              className="inline-flex min-h-11 items-center px-2 text-[12px] font-semibold text-[#615D59] hover:text-[#111110] sm:min-h-9"
            >
              취소
            </button>
          </div>
          {preview && previewMatches ? <RunResult run={preview.run} live={live} /> : null}
        </div>
      ) : null}

      {mode === "disabling" && enabled && !disableBlock ? (
        <div className="grid gap-2 rounded-xl border border-[#e8e8e4] bg-[#FAFAF8] p-3">
          <p className="text-[12px] text-[#31302E]">끄면 내일부터 붙이지 않습니다. 수동으로 붙인 태그는 어느 쪽이든 그대로 둡니다.</p>
          <label htmlFor="segment-auto-detach" className="inline-flex min-h-11 items-center gap-2 text-[12px] text-[#31302E] sm:min-h-9">
            <input
              id="segment-auto-detach"
              type="checkbox"
              checked={detach}
              onChange={(event) => setDetach(event.target.checked)}
              disabled={pending !== null}
              className="h-4 w-4 accent-[#084734]"
            />
            이 세그먼트가 자동으로 붙인 #{segment.autoTag.label ?? "태그"}도 지금 떼기
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void confirmDisable()}
              disabled={pending !== null}
              aria-busy={pending === "save" || undefined}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-colors disabled:opacity-50 sm:min-h-9 ${
                detach ? "bg-[#B43E3E] text-white hover:bg-[#8F2C2C]" : "border border-[#e8e8e4] bg-white text-[#111110] hover:border-[#c8c8c4]"
              }`}
            >
              {pending === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {detach ? "끄고 자동 태그 떼기" : "자동 태그 끄기"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("view")
                resetTransient()
              }}
              disabled={pending === "save"}
              className="inline-flex min-h-11 items-center px-2 text-[12px] font-semibold text-[#615D59] hover:text-[#111110] sm:min-h-9"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {enabled && mode === "view" && canPreview ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void runPreview(false)}
              disabled={pending !== null}
              aria-busy={pending === "preview" || undefined}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:border-[#c8c8c4] disabled:opacity-50 sm:min-h-9"
            >
              {pending === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
              오늘 실행 미리보기
            </button>
            {canApplyNow ? (
              <button
                type="button"
                onClick={() => void applyNow()}
                disabled={pending !== null}
                aria-busy={pending === "apply" || undefined}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-45 sm:min-h-9"
              >
                {pending === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
                지금 한 번 적용
              </button>
            ) : null}
          </div>
          {viewRun ? <RunResult run={viewRun} live={live} /> : null}
        </div>
      ) : null}

      {error ? (
        <p className={`text-[12px] ${STATUS_TONE_TEXT_CLASS.danger}`} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
