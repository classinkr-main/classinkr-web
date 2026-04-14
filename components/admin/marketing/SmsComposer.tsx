"use client"

import { useState } from "react"
import { MessageSquare, Sparkles, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import TagSelector from "./TagSelector"
import type { SendSmsRequest } from "@/lib/marketing-types"

const SMS_MAX = 90
const LMS_MAX = 2000

interface Props {
  subscriberCount?: number
  countMap?: Record<string, number>
}

type SendState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

export default function SmsComposer({ subscriberCount = 0, countMap }: Props) {
  const [body, setBody] = useState("")
  const [targetTags, setTargetTags] = useState<string[]>([])
  const [aiMode, setAiMode] = useState(false)
  const [aiBrief, setAiBrief] = useState("")
  const [sendState, setSendState] = useState<SendState>({ kind: "idle" })

  const isLms = body.length > SMS_MAX
  const charLimit = isLms ? LMS_MAX : SMS_MAX
  const overLimit = body.length > LMS_MAX

  // 발송 대상 수 계산
  const recipientCount =
    targetTags.length === 0
      ? subscriberCount
      : targetTags.reduce((sum, tag) => sum + (countMap?.[tag] ?? 0), 0)

  const canSend =
    !aiMode &&
    body.trim().length > 0 &&
    !overLimit &&
    recipientCount > 0 &&
    sendState.kind !== "loading"

  async function handleSend() {
    if (!canSend) return

    setSendState({ kind: "loading" })

    try {
      const payload: SendSmsRequest = {
        message: body.trim(),
        targetTags,
        recipientCount,
      }

      const res = await fetch("/api/admin/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok || !data.ok) {
        setSendState({
          kind: "error",
          message: data.error ?? "발송 중 오류가 발생했습니다.",
        })
        return
      }

      const typeLabel = data.type === "LMS" ? "LMS" : "SMS"
      setSendState({
        kind: "success",
        message: `문자 발송이 완료되었습니다. (${typeLabel} ${data.recipientCount}명)`,
      })
      // 성공 후 폼 초기화
      setBody("")
      setTargetTags([])
    } catch {
      setSendState({
        kind: "error",
        message: "네트워크 오류가 발생했습니다. 다시 시도해주세요.",
      })
    }
  }

  return (
    <div className="space-y-4">
      {/* 발송 결과 피드백 */}
      {sendState.kind === "success" && (
        <div className="flex items-start gap-3 rounded-xl border border-[#bbf7d0] bg-[#ECFDF5] px-4 py-3">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#084734]" />
          <p className="text-[13px] font-medium text-[#084734]">{sendState.message}</p>
        </div>
      )}
      {sendState.kind === "error" && (
        <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="text-[13px] font-medium text-red-700">{sendState.message}</p>
        </div>
      )}

      {/* ── Step 1: 내용 ────────────────────────────── */}
      <div className="rounded-xl border border-[#e8e8e4] bg-white">
        <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-4 py-3">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#084734] text-[10px] font-bold text-white">1</span>
          <span className="text-[13px] font-semibold text-[#111110]">문자 내용</span>
          {/* AI 모드 토글 */}
          <button
            onClick={() => setAiMode(!aiMode)}
            className={`ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors ${
              aiMode
                ? "border-[#084734] bg-[#084734] text-white"
                : "border-[#e8e8e4] bg-white text-[#1a1a1a]/50 hover:border-[#084734]/40 hover:text-[#084734]"
            }`}
          >
            <Sparkles className="h-3 w-3" />
            AI 개인화
          </button>
        </div>
        <div className="space-y-3 p-4">
          {aiMode ? (
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[#1a1a1a]/60">
                AI 생성 지침
              </label>
              <textarea
                value={aiBrief}
                onChange={(e) => setAiBrief(e.target.value)}
                rows={3}
                placeholder="예: 데모 신청 감사 문자. 학원명 포함, 친근한 톤으로 80자 이내."
                className="w-full resize-none rounded-lg border border-[#e8e8e4] px-3 py-2 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#084734]/20 placeholder:text-[#1a1a1a]/25"
              />
              <p className="text-[11px] text-[#1a1a1a]/35">수신자별 맞춤 문자를 자동 생성합니다. (연동 후 활성화)</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-medium text-[#1a1a1a]/60">문자 내용 *</label>
                <span className={`font-mono text-[11px] ${
                  overLimit ? "text-red-500" : isLms ? "text-amber-500" : "text-[#1a1a1a]/40"
                }`}>
                  {body.length} / {charLimit}자
                  {isLms && !overLimit && <span className="ml-1 text-amber-500">(LMS)</span>}
                </span>
              </div>
              <textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value)
                  if (sendState.kind !== "idle") setSendState({ kind: "idle" })
                }}
                rows={4}
                placeholder={`[클래스인]\n안녕하세요 {name}님,\n{org}에 클래스인을 소개드립니다.`}
                className={`w-full resize-none rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed focus:outline-none focus:ring-2 placeholder:text-[#1a1a1a]/25 ${
                  overLimit
                    ? "border-red-300 focus:ring-red-500/20"
                    : "border-[#e8e8e4] focus:ring-[#084734]/20"
                }`}
              />
              <div className="flex gap-3">
                {body.length <= SMS_MAX && (
                  <p className="text-[10px] text-[#1a1a1a]/30">{SMS_MAX}자 이하 → SMS (단문)</p>
                )}
                {body.length > SMS_MAX && !overLimit && (
                  <p className="text-[10px] text-amber-500">{SMS_MAX}자 초과 → LMS (장문, 요금 다름)</p>
                )}
                {overLimit && (
                  <p className="text-[10px] text-red-500">{LMS_MAX}자 초과 → 발송 불가</p>
                )}
              </div>
            </div>
          )}

          {/* 폰 미리보기 */}
          <div>
            <p className="mb-2 text-[11px] font-medium text-[#1a1a1a]/40">미리보기</p>
            <div className="w-[220px] rounded-2xl bg-[#f0f0ec] p-3 shadow-inner">
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="mb-1 text-[10px] text-[#1a1a1a]/40">클래스인</p>
                <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#111110]">
                  {aiMode
                    ? aiBrief
                      ? "✦ AI가 수신자별 맞춤 문자를 자동 생성합니다."
                      : <span className="text-[#1a1a1a]/30">(AI 지침을 입력해주세요)</span>
                    : body || <span className="text-[#1a1a1a]/30">(내용을 입력해주세요)</span>}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Step 2: 발송 대상 ────────────────────────── */}
      <div className="rounded-xl border border-[#e8e8e4] bg-white">
        <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-4 py-3">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#084734] text-[10px] font-bold text-white">2</span>
          <span className="text-[13px] font-semibold text-[#111110]">발송 대상 선택</span>
        </div>
        <div className="p-4">
          <TagSelector
            selected={targetTags}
            onChange={(tags) => {
              setTargetTags(tags)
              if (sendState.kind !== "idle") setSendState({ kind: "idle" })
            }}
            countMap={countMap}
            totalCount={subscriberCount}
          />
        </div>
      </div>

      {/* ── 발송 버튼 ──────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3">
        <div className="text-[12px] text-[#1a1a1a]/50">
          {aiMode ? (
            "AI 개인화 모드에서는 직접 발송이 비활성화됩니다."
          ) : recipientCount > 0 ? (
            <>
              발송 대상{" "}
              <span className="font-semibold text-[#111110]">{recipientCount}명</span>
              {" "}· {isLms ? <span className="text-amber-600 font-medium">LMS (장문)</span> : "SMS (단문)"}
            </>
          ) : (
            "발송 대상을 선택하거나 구독자를 확인해주세요."
          )}
        </div>
        <Button
          onClick={handleSend}
          disabled={!canSend}
          className={`transition-opacity ${
            canSend
              ? "cursor-pointer bg-[#084734] text-white hover:bg-[#065c41] active:scale-[0.97]"
              : "cursor-not-allowed opacity-40"
          }`}
        >
          <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
          {sendState.kind === "loading"
            ? "발송 중…"
            : "문자 발송"}
        </Button>
      </div>
    </div>
  )
}
