"use client"

/**
 * ReachCoverageCard — 단체 발송 센터 "받는 사람" 카드
 *
 * 시안 2a의 받는 사람 카드: 세그먼트 칩 + 도달 커버리지 바 + 정직한 미도달 카운트.
 * - 커버리지는 현재 선택 대상(active + 태그 필터)의 실데이터 집계다.
 * - 수신거부는 발송 경로에서 자동 제외되므로 문구로만 알린다(숫자는 실값).
 * - "어떤 채널로도 닿지 않는 대상" = 이메일·휴대폰이 모두 빈 수신자 — 0이 아니면
 *   앰버로 정직하게 보여준다.
 * - 직접 입력 모드는 구독자 DB 밖 수신자라 커버리지 바 대신 파싱 결과만 보여준다.
 */

import { useState } from "react"
import { CheckCircle2, ChevronDown, Pencil, TriangleAlert } from "lucide-react"
import type { SavedEmailSegment, Subscriber } from "@/lib/marketing-types"
import TagSelector from "./TagSelector"

type AudienceMode = "tags" | "direct"

interface Props {
  audienceMode: AudienceMode
  onAudienceModeChange: (mode: AudienceMode) => void
  targetTags: string[]
  onTagsChange: (tags: string[]) => void
  countMap?: Record<string, number>
  activeCount: number
  unsubscribedCount: number
  /** 태그 기준 현재 대상 (active + 태그 필터) */
  recipients: Subscriber[]
  directInput: string
  onDirectInputChange: (value: string) => void
  directEmails: string[]
  activeSegment: SavedEmailSegment | null
  savedSegments: Array<SavedEmailSegment & { recipientCount: number }>
  onApplySegment: (segment: SavedEmailSegment) => void
}

function CoverageBar({
  label,
  count,
  total,
  fillClass,
}: {
  label: string
  count: number
  total: number
  fillClass: string
}) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="grid grid-cols-[110px_1fr_92px] items-center gap-3 sm:grid-cols-[130px_1fr_110px]">
      <span className="text-[12px] font-semibold text-[#111110]">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-[#e8e8e4]">
        <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-right text-[12px] tabular-nums text-[#1a1a1a]/60">
        <b className="text-[#111110]">{count}</b>명 · {percent}%
      </span>
    </div>
  )
}

export default function ReachCoverageCard({
  audienceMode,
  onAudienceModeChange,
  targetTags,
  onTagsChange,
  countMap,
  activeCount,
  unsubscribedCount,
  recipients,
  directInput,
  onDirectInputChange,
  directEmails,
  activeSegment,
  savedSegments,
  onApplySegment,
}: Props) {
  const [tagEditorOpen, setTagEditorOpen] = useState(false)

  const total = recipients.length
  const emailCount = recipients.filter((s) => (s.email ?? "").trim().length > 0).length
  const phoneCount = recipients.filter((s) => (s.phone ?? "").trim().length > 0).length
  const unreachable = recipients.filter(
    (s) => (s.email ?? "").trim().length === 0 && (s.phone ?? "").trim().length === 0
  ).length

  // 빠른 적용 칩 — 현재 적용 중인 세그먼트는 이미 헤더 칩으로 보이므로 제외
  const quickSegments = savedSegments.filter((s) => s.id !== activeSegment?.id).slice(0, 3)

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e8e8e4] px-4 py-3.5 sm:px-5">
        <h3 className="text-[14px] font-bold text-[#111110]">받는 사람</h3>

        {audienceMode === "tags" ? (
          <>
            <span className="rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-semibold text-[#084734]">
              {activeSegment
                ? activeSegment.name
                : targetTags.length > 0
                  ? targetTags.slice(0, 3).join(" + ") + (targetTags.length > 3 ? ` 외 ${targetTags.length - 3}` : "")
                  : "전체 활성 구독자"}
            </span>
            {quickSegments.map((segment) => (
              <button
                key={segment.id}
                type="button"
                onClick={() => onApplySegment(segment)}
                title={`저장 세그먼트 적용 · 예상 ${segment.recipientCount}명`}
                className="rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/55 transition-colors hover:border-[#084734]/35 hover:text-[#084734]"
              >
                {segment.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTagEditorOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/55 transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
            >
              <Pencil className="h-3 w-3" />
              태그 편집
              <ChevronDown className={`h-3 w-3 transition-transform ${tagEditorOpen ? "rotate-180" : ""}`} />
            </button>
          </>
        ) : (
          <span className="rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-semibold text-[#084734]">
            직접 입력 {directEmails.length}명
          </span>
        )}

        <span className="ml-auto text-[11px] text-[#1a1a1a]/40">
          수신거부 {unsubscribedCount}명 자동 제외
        </span>
      </div>

      {/* 대상 모드 토글 — EmailComposer의 태그/직접 입력 이원 구조를 그대로 승계 */}
      <div className="flex border-b border-[#e8e8e4]">
        {([
          { key: "tags", label: "태그 필터" },
          { key: "direct", label: "직접 입력" },
        ] as const).map((mode) => (
          <button
            key={mode.key}
            type="button"
            onClick={() => onAudienceModeChange(mode.key)}
            className={`flex-1 px-4 py-2 text-[12px] font-medium transition-colors ${
              audienceMode === mode.key
                ? "border-b-2 border-[#084734] bg-[#084734]/5 text-[#084734]"
                : "text-[#1a1a1a]/45 hover:text-[#111110]"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        {audienceMode === "tags" ? (
          <>
            {tagEditorOpen && (
              <div className="rounded-xl border border-[#e8e8e4] bg-white p-3">
                <TagSelector
                  selected={targetTags}
                  onChange={onTagsChange}
                  countMap={countMap}
                  totalCount={activeCount}
                />
              </div>
            )}

            <div className="space-y-2.5">
              <CoverageBar label="이메일 보유" count={emailCount} total={total} fillClass="bg-[#084734]" />
              <CoverageBar label="휴대폰 보유" count={phoneCount} total={total} fillClass="bg-[#111110]" />
            </div>

            {unreachable === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-[#D1FAE5] bg-[#ECFDF5] px-3 py-2 text-[12px] font-medium text-[#084734]">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                어떤 채널로도 닿지 않는 대상 0명 — 전원 도달 가능
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[12px] font-medium text-[#7A520F]">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-[#A8741A]" />
                {unreachable}명은 이메일·휴대폰이 모두 없어 어떤 채널로도 닿지 않습니다
              </div>
            )}

            <p className="text-[11px] text-[#1a1a1a]/35">
              커버리지는 활성(active) 대상 {total}명 기준 — 수신거부는 발송 시 자동 제외됩니다.
            </p>
          </>
        ) : (
          <>
            <p className="text-[11px] font-medium text-[#1a1a1a]/40">
              구독자 DB 밖 수신자 — 이메일 주소를 줄바꿈·콤마·세미콜론으로 구분해 입력하세요.
            </p>
            <textarea
              value={directInput}
              onChange={(e) => onDirectInputChange(e.target.value)}
              rows={5}
              placeholder={"hong@example.com\nkim@school.kr"}
              className="w-full resize-y rounded-lg border border-[#e8e8e4] p-3 font-mono text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#084734]/20"
            />
            <div className="flex items-center justify-between rounded-lg border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2 text-[12px]">
              <span className={directEmails.length > 0 ? "font-medium text-[#084734]" : "text-[#1a1a1a]/45"}>
                {directEmails.length > 0
                  ? `유효한 이메일 ${directEmails.length}개 — 이메일 채널로만 발송됩니다`
                  : "입력하면 자동으로 파싱됩니다"}
              </span>
              {directInput.trim() && (
                <button
                  type="button"
                  onClick={() => onDirectInputChange("")}
                  className="text-[11px] text-[#1a1a1a]/35 hover:text-[#111110]"
                >
                  비우기
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
