"use client"

/**
 * MessageComposeCard — 단체 발송 센터 "메시지" 카드
 *
 * 시안 2a 메시지 카드 + 1a 변수 블록 트레이/실수신자 미리보기의 결합:
 * - 제목/본문은 허브가 소유한 EmailDraft(초안 유지 규칙)를 그대로 편집한다.
 * - 변수 삽입은 마지막 포커스 필드(제목/본문)의 커서 위치에 정확히 들어간다
 *   (EmailComposer.insertVariable과 동일한 selection 처리).
 * - 미리보기는 "실제 수신자 데이터로 치환" — 활성 대상 표본을 ‹ › 로 순환한다.
 * - 채널별 미리보기는 능력 상태를 그대로 반영: 이메일=실렌더, 알림톡=승인 템플릿
 *   기준(이 초안이 그대로 나가지 않음을 명시), 문자=보류 표시. 카카오 노랑은
 *   알림톡 말풍선 미리보기 안에서만 쓴다.
 */

import { useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EmailDraft, Subscriber } from "@/lib/marketing-types"
import type { MessagingTemplate } from "@/lib/messaging-client-types"
import { SEND_UNIT_COST_KRW } from "@/lib/marketing-send-costs"
import VariableBlockTray from "./VariableBlockTray"
import type { VariableBlockDef } from "./send-center-types"

type PreviewChannel = "email" | "kakao" | "sms"
type FocusField = "subject" | "body"

/** 미리보기 순환 표본 상한 — 대상이 수백 명이어도 UI는 앞쪽 표본만 돈다. */
const PREVIEW_SAMPLE_LIMIT = 20

/** 대상이 비었을 때의 예시 수신자 — EmailComposer의 기존 예시와 동일 값 유지 */
const FALLBACK_SAMPLE = { name: "김원장", org: "클래스인 아카데미", role: "원장" }

/**
 * 발송 백엔드(app/api/admin/email/send · replacePlaceholders)와 동일한 치환 규칙:
 * {name}/{org}/{role}만 치환하고, org/role 빈 값은 공백("")이 된다.
 */
function substitute(text: string, sample: { name: string; org?: string; role?: string }) {
  return text
    .replace(/\{name\}/g, sample.name)
    .replace(/\{org\}/g, sample.org ?? "")
    .replace(/\{role\}/g, sample.role ?? "")
}

interface Props {
  draft: EmailDraft
  onChange: (draft: EmailDraft) => void
  /** 미리보기 순환 대상 (태그 모드의 실수신자 목록) */
  recipients: Subscriber[]
  variables: VariableBlockDef[]
  templates: MessagingTemplate[]
  messagingStatusLoaded: boolean
  onOpenKakaoTest: () => void
}

export default function MessageComposeCard({
  draft,
  onChange,
  recipients,
  variables,
  templates,
  messagingStatusLoaded,
  onOpenKakaoTest,
}: Props) {
  const [previewChannel, setPreviewChannel] = useState<PreviewChannel>("email")
  const [sampleIndex, setSampleIndex] = useState(0)

  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const lastFocusRef = useRef<FocusField>("body")

  const samplePool = useMemo(() => recipients.slice(0, PREVIEW_SAMPLE_LIMIT), [recipients])

  // 태그 변경 등으로 표본이 줄어도 안전하도록 렌더 시점에 클램프한 인덱스만 쓴다
  // (effect로 state를 되돌리면 캐스케이드 렌더 — 파생값으로 충분하다).
  const safeSampleIndex = samplePool.length === 0 ? 0 : Math.min(sampleIndex, samplePool.length - 1)
  const currentSample = samplePool[safeSampleIndex] ?? null
  const sampleValues = currentSample
    ? { name: currentSample.name, org: currentSample.org, role: currentSample.role }
    : FALLBACK_SAMPLE

  const usedTokens = useMemo(() => {
    const source = `${draft.subject} ${draft.body}`
    return variables.map((v) => v.token).filter((token) => source.includes(token))
  }, [draft.subject, draft.body, variables])

  const previewSubject = substitute(draft.subject, sampleValues)
  const previewBody = substitute(draft.body, sampleValues)

  // 현재 표본에서 공백으로 치환되는 변수 — 정직하게 캡션으로 알린다.
  const emptyTokensForSample = useMemo(() => {
    if (!currentSample) return []
    const empties: string[] = []
    if (usedTokens.includes("{org}") && !(currentSample.org ?? "").trim()) empties.push("{org}")
    if (usedTokens.includes("{role}") && !(currentSample.role ?? "").trim()) empties.push("{role}")
    return empties
  }, [currentSample, usedTokens])

  const updateDraft = (patch: Partial<EmailDraft>) => onChange({ ...draft, ...patch })

  // EmailComposer.insertVariable과 동일한 커서 삽입 — 대상 필드만 제목/본문 이원화
  const insertToken = (token: string) => {
    const field = lastFocusRef.current
    const el = field === "subject" ? subjectRef.current : bodyRef.current
    const key = field === "subject" ? "subject" : "body"
    const text = field === "subject" ? draft.subject : draft.body
    if (!el) {
      updateDraft({ [key]: text + token })
      return
    }
    const start = el.selectionStart ?? text.length
    const end = el.selectionEnd ?? text.length
    updateDraft({ [key]: text.slice(0, start) + token + text.slice(end) })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const cycleSample = (delta: number) => {
    if (samplePool.length === 0) return
    // 클램프된 현재 인덱스 기준으로 순환 — 표본이 줄었을 때도 항상 유효 범위에 든다.
    setSampleIndex((safeSampleIndex + delta + samplePool.length) % samplePool.length)
  }

  const approvedTemplates = templates.filter((t) => t.status?.toUpperCase() === "APPROVED")

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e8e8e4] px-4 py-3.5 sm:px-5">
        <h3 className="text-[14px] font-bold text-[#111110]">메시지</h3>
        <span className="text-[11px] text-[#1a1a1a]/40">
          이메일 기준 작성 — 변수는 발송 시 수신자별로 치환됩니다
        </span>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {/* 제목 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="send-center-subject" className="text-[12px] font-medium text-[#1a1a1a]/55">
              제목 <span className="text-red-400">*</span>
            </Label>
            <span className="text-[11px] text-[#1a1a1a]/30">{draft.subject.length}자</span>
          </div>
          <Input
            id="send-center-subject"
            ref={subjectRef}
            value={draft.subject}
            onChange={(e) => updateDraft({ subject: e.target.value })}
            onFocus={() => {
              lastFocusRef.current = "subject"
            }}
            placeholder="예) {name}님, 클래스인 4월 세미나에 초대합니다"
            className="text-[13px]"
          />
        </div>

        {/* 변수 블록 트레이 — 1a */}
        <VariableBlockTray variables={variables} onInsert={insertToken} usedTokens={usedTokens} />

        {/* 본문 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="send-center-body" className="text-[12px] font-medium text-[#1a1a1a]/55">
              본문 <span className="text-red-400">*</span>
            </Label>
            <span className="text-[11px] text-[#1a1a1a]/30">
              {draft.body.replace(/\s+/g, " ").trim().length}자
            </span>
          </div>
          <textarea
            id="send-center-body"
            ref={bodyRef}
            value={draft.body}
            onChange={(e) => updateDraft({ body: e.target.value })}
            onFocus={() => {
              lastFocusRef.current = "body"
            }}
            rows={9}
            placeholder={`안녕하세요 {name}님,\n\nClassin에서 준비한 소식을 전해드립니다.\n\n{org} 관계자 여러분을 위한...\n\n감사합니다.\nClassin 팀`}
            className="w-full resize-y rounded-lg border border-[#e8e8e4] p-3 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#084734]/20"
          />
        </div>

        {/* 채널별 미리보기 */}
        <div className="overflow-hidden rounded-xl border border-[#e8e8e4] bg-[#fafaf8]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#e8e8e4] px-3.5 py-2.5">
            <span className="text-[12px] font-semibold text-[#111110]">미리보기</span>
            <span className="hidden text-[11px] text-[#1a1a1a]/40 sm:inline">실제 수신자 데이터로 치환</span>

            <div className="flex gap-1 rounded-lg border border-[#e8e8e4] bg-white p-0.5">
              {([
                { key: "email", label: "이메일" },
                { key: "kakao", label: "알림톡" },
                { key: "sms", label: "문자" },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPreviewChannel(tab.key)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    previewChannel === tab.key
                      ? "bg-[#111110] text-white"
                      : "text-[#1a1a1a]/50 hover:text-[#111110]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 표본 순환 — 1a "김민준 (1/3)" */}
            <div className="ml-auto flex items-center gap-1.5 text-[11.5px] text-[#1a1a1a]/55">
              {samplePool.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => cycleSample(-1)}
                    aria-label="이전 수신자 표본"
                    className="rounded-md p-0.5 text-[#1a1a1a]/40 transition-colors hover:bg-[#f0f0ec] hover:text-[#111110]"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="font-medium text-[#111110]">
                    {sampleValues.name}
                    <span className="ml-1 tabular-nums text-[#1a1a1a]/40">
                      ({safeSampleIndex + 1}/{samplePool.length}
                      {recipients.length > PREVIEW_SAMPLE_LIMIT ? ` · 표본 ${PREVIEW_SAMPLE_LIMIT}` : ""})
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => cycleSample(1)}
                    aria-label="다음 수신자 표본"
                    className="rounded-md p-0.5 text-[#1a1a1a]/40 transition-colors hover:bg-[#f0f0ec] hover:text-[#111110]"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <span className="text-[#1a1a1a]/40">대상 없음 — 예시 값으로 표시</span>
              )}
            </div>
          </div>

          <div className="p-3.5">
            {previewChannel === "email" && (
              <div className="overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">
                <div className="space-y-1.5 border-b border-[#e8e8e4] px-4 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="w-10 shrink-0 text-[10px] text-[#1a1a1a]/35">보낸 이</span>
                    <span className="text-[12px] text-[#1a1a1a]/60">Classin &lt;no-reply@classin.kr&gt;</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="w-10 shrink-0 text-[10px] text-[#1a1a1a]/35">제목</span>
                    <span className="text-[13px] font-semibold text-[#111110]">
                      {previewSubject || <span className="font-normal text-[#1a1a1a]/25">(제목 없음)</span>}
                    </span>
                  </div>
                </div>
                <div className="min-h-[110px] px-4 py-4">
                  {previewBody ? (
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#111110]">{previewBody}</p>
                  ) : (
                    <p className="text-[12px] text-[#1a1a1a]/25">(본문을 작성해주세요)</p>
                  )}
                </div>
                {emptyTokensForSample.length > 0 && (
                  <p className="border-t border-[#e8e8e4] bg-[#FBF1E0] px-4 py-2 text-[11px] text-[#7A520F]">
                    이 수신자는 {emptyTokensForSample.join(", ")} 값이 비어 있어 공백으로 발송됩니다.
                  </p>
                )}
              </div>
            )}

            {previewChannel === "kakao" && (
              <div className="space-y-3">
                {approvedTemplates.length > 0 ? (
                  /* 카카오 노랑(#FEE500)은 이 말풍선 미리보기 안에서만 허용 */
                  <div className="w-full max-w-[280px] rounded-2xl bg-[#B2C7DA] p-3">
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#FEE500] text-[8px] font-bold text-[#3C1E1E]">
                        톡
                      </span>
                      <span className="text-[10px] font-medium text-[#3C1E1E]/70">알림톡 도착</span>
                    </div>
                    <div className="rounded-xl rounded-tl-sm bg-[#FEE500] p-3">
                      <p className="mb-1 text-[10px] font-semibold text-[#3C1E1E]/60">
                        {approvedTemplates[0].name}
                      </p>
                      <p className="text-[12px] leading-relaxed text-[#3C1E1E]/80">
                        발송 문구·버튼은 카카오에 승인된 템플릿 본문 기준입니다 — 이 초안이 그대로
                        발송되지 않습니다.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 text-[12px] leading-relaxed text-[#1a1a1a]/55">
                    {messagingStatusLoaded
                      ? "승인된 알림톡 템플릿이 없습니다 — solapi 콘솔에서 템플릿을 등록·검수받으면 여기서 발송할 수 있습니다."
                      : "알림톡 템플릿 상태를 확인 중입니다."}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2">
                  <span className="text-[11.5px] font-medium text-[#7A520F]">
                    대량 발송 미구현 — 테스트 발송만 가능 · 예상 단가 {SEND_UNIT_COST_KRW.kakaoAlimtalk}원/건(오픈 시 적용)
                  </span>
                  <button
                    type="button"
                    onClick={onOpenKakaoTest}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#084734]/35 hover:text-[#084734]"
                  >
                    <MessageCircle className="h-3 w-3" />
                    테스트 발송 열기
                  </button>
                </div>
              </div>
            )}

            {previewChannel === "sms" && (
              <div className="rounded-xl border border-dashed border-[#d8d7d0] bg-white px-4 py-4 text-[12px] leading-relaxed text-[#1a1a1a]/50">
                <p className="font-semibold text-[#1a1a1a]/60">문자(SMS/LMS)는 운영 보류 중입니다</p>
                <p className="mt-1">
                  발신번호는 등록되어 있어 우선순위가 오르면 바로 활성화됩니다. 오픈 시 본문은 LMS
                  기준으로 발송되며 예상 단가는 {SEND_UNIT_COST_KRW.lms}원/건입니다.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
