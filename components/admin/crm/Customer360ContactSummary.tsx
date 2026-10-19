// 고객 360 헤더 "마지막 연락 · 다음 연락" 두 줄(CT9) — 드로어 헤더와 상세 헤더가 같이 쓴다.
// 문구·신호색 판정은 lib/crm/customer-contact-summary.ts(순수)가 정하고 여기서는 그리기만 한다.
//
// 표기 규약(DESIGN.md 어드민 밀집 화면): 채움 배지 없이 점 + 글자색. 신호색은 상태 의미가 있을 때만
// (마지막 연락 14일+ 경고·21일+ 위험, 다음 연락 기한 지남 위험). 좁은 화면에서는 두 줄로 쌓고
// 넓으면 한 줄에 이어 쓴다 — 각 줄은 말줄임(truncate)으로 가로 넘침을 막는다.

import {
  contactSummaryCaptions,
  formatLastContactText,
  formatNextContactText,
  lastContactTone,
  nextContactTone,
  type CustomerContactSummary,
} from "@/lib/crm/customer-contact-summary"
import { STATUS_TONE_TEXT_CLASS, type StatusTone } from "@/lib/crm/status-tone"

const DEFINITION_HINT =
  "마지막 연락 = 통합 고객 목록과 같은 정의 — Home 콜·문자·회의록·녹음·연락 로그 + Compass 사람 활동(자동 작성자 제외, 내부 메모·자동 유입은 Home 에서 제외). 조회 시각 기준."

function ContactLine({
  text,
  tone,
  muted,
  testId,
}: {
  text: string
  tone: StatusTone | null
  muted: boolean
  testId: string
}) {
  const colorClass = tone ? STATUS_TONE_TEXT_CLASS[tone] : muted ? "text-[#1a1a1a]/40" : "text-[#1a1a1a]/60"
  return (
    <p
      data-testid={testId}
      data-tone={tone ?? "none"}
      title={text}
      className={`flex min-w-0 max-w-full items-center gap-1.5 text-[12px] font-medium ${colorClass}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{text}</span>
    </p>
  )
}

export default function Customer360ContactSummary({
  summary,
  className = "",
}: {
  /** 옛 캐시 페이로드에는 없을 수 있다 — 없으면 아무것도 그리지 않는다. */
  summary: CustomerContactSummary | null | undefined
  className?: string
}) {
  if (!summary) return null
  const captions = contactSummaryCaptions(summary)
  return (
    <div data-testid="c360-contact-summary" className={`min-w-0 max-w-full ${className}`} title={DEFINITION_HINT}>
      <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
        <ContactLine
          testId="c360-last-contact"
          text={formatLastContactText(summary)}
          tone={lastContactTone(summary)}
          muted={!summary.last}
        />
        <ContactLine
          testId="c360-next-contact"
          text={formatNextContactText(summary)}
          tone={nextContactTone(summary)}
          muted={!summary.next}
        />
      </div>
      {captions.length > 0 ? (
        <p data-testid="c360-contact-caption" className={`mt-0.5 text-[11px] ${STATUS_TONE_TEXT_CLASS.warning}`}>
          {captions.join(" · ")}
        </p>
      ) : null}
    </div>
  )
}
