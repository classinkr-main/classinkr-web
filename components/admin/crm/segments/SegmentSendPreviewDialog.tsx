"use client"

// 세그먼트 허브 — "메시지 발송" 대상 미리보기 대화상자(발송 1단계, 2026-09-25).
//
// 이 대화상자는 아무것도 보내지 않는다. 서버가 저장된 조건으로 대상을 풀고 원천 연락처·수신 동의를 확인해 건수만
// 돌려준다(이메일·전화 원문·표본·행 키 없음):
//  - 저장 세그먼트: GET /api/admin/crm/segments/[id]/audience-preview
//  - 저장 전 조건: POST /api/admin/crm/customers/audience-preview { params } (검색어가 URL 에 남지 않게 본문으로)
//    — 이번 라운드는 라우트·{ kind: "draft" } 계약만 둔다. 편집 중인 조건은 SegmentDetailPanel 안에만 있어 허브가
//    읽을 길이 없다(상세 패널이 현재 조건을 올려 주는 prop 이 생기면 허브에서 draft 로 연결 — 통합 요청 사항).
//    그때까지 허브의 "메시지 발송"은 저장된 조건 기준이고, 새 세그먼트는 저장한 뒤에 열린다.
// 발송 권한(SUPER_ADMIN·ADMIN)이 있고 저장 세그먼트이며 동의 조회가 되고 상한 안이면 "메시지 탭에서 열기" —
// URL 에는 세그먼트 id 만 싣는다(lib/crm/segment-handoff.ts). 메시지 탭도 세그먼트 실발송은 막혀 있다(미리보기·테스트만).
// 화면 하단·중앙 고정 오버레이라 admin 트리 규약대로 document.body 포털로 그린다.

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { ArrowUpRight, Loader2, MailCheck, RefreshCw, X } from "lucide-react"

import { SegmentAudienceBreakdown } from "@/components/admin/marketing/SegmentAudienceCard"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"
import { adminFetchJson } from "@/lib/admin-client"
import {
  CUSTOMERS_AUDIENCE_PREVIEW_URL,
  SEGMENT_HANDOFF_UNSAVED_REASON,
  segmentAudiencePreviewUrl,
  segmentHandoffBlockReason,
  type SegmentAudiencePreview,
} from "@/lib/crm/segment-audience"
import { buildSegmentHandoffHref } from "@/lib/crm/segment-handoff"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"

export type SegmentSendPreviewSource =
  /** 저장 세그먼트 — 이름은 제목 표시용(응답 이름이 오면 그것을 쓴다) */
  | { kind: "saved"; segmentId: string; name: string }
  /** 저장 전 조건 — 통합 목록 쿼리스트링(메시지 탭으로 넘기지 않는다) */
  | { kind: "draft"; params: string }

type LoadState =
  | { status: "loading" }
  | { status: "ready"; preview: SegmentAudiencePreview }
  | { status: "error"; message: string }

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "발송 대상을 계산하지 못했습니다."
}

function fetchPreview(source: SegmentSendPreviewSource) {
  if (source.kind === "saved") return adminFetchJson<SegmentAudiencePreview>(segmentAudiencePreviewUrl(source.segmentId))
  return adminFetchJson<SegmentAudiencePreview>(CUSTOMERS_AUDIENCE_PREVIEW_URL, {
    method: "POST",
    body: JSON.stringify({ params: source.params }),
  })
}

/** 메시지 탭 넘김 영역 — 넘길 수 있으면 링크, 아니면 사유. 순수 표시(테스트가 문구를 고정한다). */
export function SegmentHandoffAction({ preview }: { preview: SegmentAudiencePreview }) {
  const reason = segmentHandoffBlockReason(preview)
  const href = !reason && preview.segment.id ? buildSegmentHandoffHref(preview.segment.id) : null
  if (!href) {
    return (
      <p className="text-[12px] text-[#615D59]" data-testid="segment-handoff-blocked">
        {reason ?? SEGMENT_HANDOFF_UNSAVED_REASON}
      </p>
    )
  }
  return (
    <div className="grid gap-1">
      <Link
        href={href}
        prefetch={false}
        className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg bg-[#084734] px-3.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 sm:min-h-9"
      >
        <MailCheck className="h-3.5 w-3.5" aria-hidden />
        메시지 탭에서 열기
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
      <p className="text-[11px] text-[#615D59]">
        세그먼트 id 만 넘깁니다. 메시지 탭에서도 세그먼트로는 보내지 않습니다 — 대상 미리보기와 테스트 발송만 됩니다.
      </p>
    </div>
  )
}

export const SEGMENT_SEND_ENTRY_UNSAVED_REASON = "저장하면 발송 대상을 미리 보고 메시지 탭으로 넘길 수 있어요."
export const SEGMENT_SEND_ENTRY_NOT_READY_REASON = "세그먼트 표가 아직 적용되지 않아 저장된 조건으로 대상을 계산할 수 없습니다."

/** 세그먼트 허브 상세 아래 "메시지 발송" 줄 — 누르면 미리보기 대화상자를 연다(발송 없음). */
export function SegmentSendEntry({
  segmentId,
  available,
  onOpen,
}: {
  /** 저장 세그먼트 id — 새 세그먼트(저장 전)면 null */
  segmentId: string | null
  /** 세그먼트 표 적용 여부 */
  available: boolean
  onOpen: () => void
}) {
  const disabledReason = !available ? SEGMENT_SEND_ENTRY_NOT_READY_REASON : !segmentId ? SEGMENT_SEND_ENTRY_UNSAVED_REASON : null
  return (
    <section
      aria-label="메시지 발송"
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3"
      data-testid="segment-send-entry"
    >
      <div className="min-w-0 flex-1 basis-[260px]">
        <p className="text-[13px] font-semibold text-[#111110]">메시지 발송</p>
        <p className="mt-0.5 text-[11px] text-[#615D59]">
          저장된 조건의 대상 중 이메일 구독 중인 사람만 셉니다. 문자는 수신 동의 정책 결정 대기 — 여기서는 보내지 않습니다.
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        disabled={Boolean(disabledReason)}
        title={disabledReason ?? "발송 대상 건수와 제외 사유를 미리 봅니다."}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:border-[#c8c8c4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9"
      >
        <MailCheck className="h-3.5 w-3.5" aria-hidden />
        메시지 발송
      </button>
      {disabledReason ? <p className="w-full text-[11px] text-[#615D59]">{disabledReason}</p> : null}
    </section>
  )
}

export default function SegmentSendPreviewDialog({
  source,
  onClose,
}: {
  /** null 이면 닫힘 */
  source: SegmentSendPreviewSource | null
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const seq = useRef(0)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const sourceKey = source ? (source.kind === "saved" ? `saved:${source.segmentId}` : `draft:${source.params}`) : null

  useEffect(() => {
    setMounted(true)
  }, [])

  // 훅은 조기 반환보다 위 — 열림 키(대상)가 바뀌면 포커스를 다시 잡는다.
  useDialogFocus(sourceKey, onClose, closeButtonRef)

  const load = useCallback(async (target: SegmentSendPreviewSource) => {
    const current = ++seq.current
    setState({ status: "loading" })
    try {
      const preview = await fetchPreview(target)
      if (current === seq.current) setState({ status: "ready", preview })
    } catch (error) {
      if (current === seq.current) setState({ status: "error", message: errorMessage(error) })
    }
  }, [])

  useEffect(() => {
    if (!source) {
      seq.current += 1
      return
    }
    void load(source)
    // sourceKey 가 대상의 정체 — 부모가 같은 대상을 새 객체로 넘겨도 다시 부르지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, load])

  if (!mounted || !source || typeof document === "undefined") return null

  const title = source.kind === "saved" ? source.name : "저장 전 조건"
  const preview = state.status === "ready" ? state.preview : null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} aria-hidden />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_12px_32px_-12px_rgba(17,17,16,0.28)] sm:rounded-2xl [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-[#084734]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="segment-send-preview-title"
        data-testid="segment-send-preview"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e8e8e4] px-5 py-4">
          <div className="min-w-0">
            <h2 id="segment-send-preview-title" className="text-[15px] font-bold text-[#111110]">
              메시지 발송 대상 미리보기
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-[#615D59]">
              {preview?.segment.name ?? title} · {source.kind === "saved" ? "저장된 조건 기준" : "지금 조건 기준"} · 발송 없음
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void load(source)}
              disabled={state.status === "loading"}
              aria-label="다시 계산"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#1a1a1a]/45 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] disabled:opacity-40 sm:h-8 sm:w-8"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${state.status === "loading" ? "animate-spin" : ""}`} aria-hidden />
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] sm:h-8 sm:w-8"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="grid gap-3 overflow-y-auto px-5 py-4">
          {preview && preview.segment.labels.length > 0 ? (
            <p className="text-[12px] text-[#31302E]">
              <span className="text-[#1a1a1a]/45">조건 </span>
              {preview.segment.labels.join(" · ")}
            </p>
          ) : null}

          {state.status === "loading" ? (
            <p className="inline-flex items-center gap-1.5 py-4 text-[12px] text-[#615D59]" aria-live="polite">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              대상 연락처와 수신 동의를 확인하는 중…
            </p>
          ) : state.status === "error" ? (
            <p className={`py-2 text-[12px] ${STATUS_TONE_TEXT_CLASS.danger}`} role="alert">
              {state.message}
            </p>
          ) : (
            <SegmentAudienceBreakdown preview={state.preview} />
          )}

          <div className="border-t border-[#f0f0ec] pt-3">
            {preview ? (
              <SegmentHandoffAction preview={preview} />
            ) : source.kind === "draft" ? (
              <p className="text-[12px] text-[#615D59]">{SEGMENT_HANDOFF_UNSAVED_REASON}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
