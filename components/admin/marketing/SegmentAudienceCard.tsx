"use client"

/**
 * SegmentAudienceCard — 단체 발송 센터 "받는 사람" 카드의 고객 세그먼트(CRM) 모드(발송 1단계, 2026-09-25).
 *
 * CRM 세그먼트 허브에서 넘겨받은 저장 세그먼트 id 하나로 서버 미리보기
 * (GET /api/admin/crm/segments/[id]/audience-preview)를 부르고 건수만 보여 준다 — 이메일·전화 원문·표본은
 * 응답에도 화면에도 없다. 이 카드와 발송 센터는 세그먼트로 아무것도 보내지 않는다(실발송 CTA 비활성,
 * 서버 email/send 도 세그먼트 요청을 400 으로 거절). 테스트 발송(관리자 주소 1건)만 그대로 쓸 수 있다.
 *
 * 이름은 '고객 세그먼트(CRM)'로 부른다 — 허브의 localStorage '저장 세그먼트'(구독자 태그 묶음)와 섞지 않는다.
 * SegmentAudienceBreakdown 은 CRM 세그먼트 허브의 미리보기 대화상자도 같이 쓴다(문구 한 곳).
 */

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Loader2, RefreshCw, X } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import {
  CRM_SEGMENT_AUDIENCE_LABEL,
  SEGMENT_SEND_DISABLED_REASON,
  describeAudienceByKind,
  segmentAudiencePreviewUrl,
  segmentHubHref,
  summarizeSegmentAudience,
  type SegmentAudiencePreview,
  type SegmentAudienceTone,
} from "@/lib/crm/segment-audience"
import type { SegmentPreviewStatus } from "./send-center-types"

const NOTICE_TONE_CLASS: Record<SegmentAudienceTone, string> = {
  danger: STATUS_TONE_TEXT_CLASS.danger,
  warning: STATUS_TONE_TEXT_CLASS.warning,
  info: "text-[#615D59]",
}

/** 미리보기 건수 묶음 — 발송 가능 · 제외 사유 · 이메일 없음 · 문자 정책 · 안내. 순수 표시(상태 없음). */
export function SegmentAudienceBreakdown({ preview }: { preview: SegmentAudiencePreview }) {
  const summary = summarizeSegmentAudience(preview)
  const byKind = describeAudienceByKind(preview)
  return (
    <div className="grid gap-2" data-testid="segment-audience-breakdown">
      <p className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-[#31302E]">
        <span className="font-semibold text-[#111110]">이메일 발송 가능</span>
        <b className="text-[20px] font-bold tabular-nums text-[#084734]">{summary.eligible.toLocaleString("ko-KR")}</b>
        <span>명</span>
        <span className="text-[11px] text-[#1a1a1a]/45">
          · 대상 {preview.totalRows.toLocaleString("ko-KR")}명{byKind ? `(${byKind})` : ""}
        </span>
      </p>
      <ul className="grid gap-1 border-l border-[#e8e8e4] pl-3 text-[12px] text-[#31302E]">
        <li>뉴스레터 구독 중(active)인 고유 주소만 셉니다 — 로그인 프로필 동의만 있는 사람은 이번에 뺍니다.</li>
        {summary.excluded ? <li>{summary.excluded}</li> : null}
        {summary.noEmail ? <li>{summary.noEmail}</li> : null}
        {summary.unresolved ? <li className={STATUS_TONE_TEXT_CLASS.warning}>{summary.unresolved}</li> : null}
        <li>{summary.sms}</li>
      </ul>
      {summary.notices.length > 0 ? (
        <ul className="grid gap-1" aria-label="대상 계산 안내">
          {summary.notices.map((notice) => (
            <li key={notice.message} className={`flex items-start gap-1.5 text-[11.5px] ${NOTICE_TONE_CLASS[notice.tone]}`}>
              <span aria-hidden className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
              <span>{notice.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; preview: SegmentAudiencePreview }
  | { status: "error"; message: string }

interface Props {
  /** 넘겨받은 저장 세그먼트 id(UUID) */
  segmentId: string
  /** 세그먼트 해제 — 발송 센터가 태그 모드로 돌아간다 */
  onRelease: () => void
  /**
   * 미리보기가 바뀔 때(로드 중·실패면 null) — 발송 센터가 채널 도달 수와 최종 확인(대상·수신거부)을 채운다.
   * status 로 로드 중과 실패를 구분한다(레일이 "0명"과 "모름"을 섞지 않게).
   */
  onPreviewChange?: (preview: SegmentAudiencePreview | null, status: SegmentPreviewStatus) => void
}

export default function SegmentAudienceCard({ segmentId, onRelease, onPreviewChange }: Props) {
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [reloadToken, setReloadToken] = useState(0)
  const onPreviewChangeRef = useRef(onPreviewChange)
  useEffect(() => {
    onPreviewChangeRef.current = onPreviewChange
  }, [onPreviewChange])

  // 결과만 상태에 싣는다(응답 뒤) — 늦게 온 옛 응답은 버린다. 로딩 표시는 첫 렌더 기본값과 "다시 계산"이 맡는다.
  // 세그먼트가 바뀌면 부모가 key 로 이 카드를 새로 만든다(SendCenter).
  useEffect(() => {
    let cancelled = false
    adminFetchJson<SegmentAudiencePreview>(segmentAudiencePreviewUrl(segmentId))
      .then((preview) => {
        if (cancelled) return
        setState({ status: "ready", preview })
        onPreviewChangeRef.current?.(preview, "ready")
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: "error",
          message: error instanceof Error && error.message ? error.message : "세그먼트 대상을 불러오지 못했습니다.",
        })
        onPreviewChangeRef.current?.(null, "error")
      })
    return () => {
      cancelled = true
    }
  }, [segmentId, reloadToken])

  const load = () => {
    setState({ status: "loading" })
    onPreviewChangeRef.current?.(null, "loading")
    setReloadToken((token) => token + 1)
  }

  const preview = state.status === "ready" ? state.preview : null

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white" data-testid="segment-audience-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e8e8e4] px-4 py-3.5 sm:px-5">
        <h3 className="text-[14px] font-bold text-[#111110]">받는 사람</h3>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#084734]">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
          {CRM_SEGMENT_AUDIENCE_LABEL}
        </span>
        {preview?.segment.name ? (
          <span className="min-w-0 truncate text-[12px] font-semibold text-[#111110]">{preview.segment.name}</span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={load}
            disabled={state.status === "loading"}
            aria-label="대상 다시 계산"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[#1a1a1a]/45 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] disabled:opacity-40 sm:min-h-8 sm:min-w-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${state.status === "loading" ? "animate-spin" : ""}`} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onRelease}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-[#615D59] transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] sm:min-h-8"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            세그먼트 해제
          </button>
        </div>
      </div>

      <div className="grid gap-3 px-4 py-4 sm:px-5">
        {preview && preview.segment.labels.length > 0 ? (
          <p className="text-[12px] text-[#31302E]">
            <span className="text-[#1a1a1a]/45">조건 </span>
            {preview.segment.labels.join(" · ")}
          </p>
        ) : null}

        {state.status === "loading" ? (
          <p className="inline-flex items-center gap-1.5 text-[12px] text-[#615D59]" aria-live="polite">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            세그먼트 대상과 수신 동의를 확인하는 중…
          </p>
        ) : state.status === "error" ? (
          <p className={`text-[12px] ${STATUS_TONE_TEXT_CLASS.danger}`} role="alert">
            {state.message}
          </p>
        ) : (
          <SegmentAudienceBreakdown preview={state.preview} />
        )}

        <p className="border-t border-[#f0f0ec] pt-2.5 text-[11px] text-[#615D59]">
          {SEGMENT_SEND_DISABLED_REASON}. 저장된 조건 기준이라 CRM 에서 조건을 바꾸면 건수도 바뀝니다.
        </p>
        <Link
          href={segmentHubHref(segmentId)}
          prefetch={false}
          className="inline-flex min-h-11 w-fit items-center gap-1 text-[12px] font-semibold text-[#084734] hover:underline sm:min-h-0"
        >
          고객 DB에서 조건 보기
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  )
}
