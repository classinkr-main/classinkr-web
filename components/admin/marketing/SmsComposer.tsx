"use client"

import { useState } from "react"
import { MessageSquare, Sparkles, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import TagSelector from "./TagSelector"

const SMS_MAX = 90
const LMS_MAX = 2000

interface Props {
  subscriberCount?: number
  countMap?: Record<string, number>
}

export default function SmsComposer({ subscriberCount = 0, countMap }: Props) {
  const [body, setBody] = useState("")
  const [targetTags, setTargetTags] = useState<string[]>([])
  const [aiMode, setAiMode] = useState(false)
  const [aiBrief, setAiBrief] = useState("")

  const isLms = body.length > SMS_MAX
  const charLimit = isLms ? LMS_MAX : SMS_MAX
  const overLimit = body.length > LMS_MAX

  return (
    <div className="space-y-4">
      {/* 준비 중 배너 */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div>
          <p className="text-[13px] font-medium text-amber-700">SMS/LMS 발송 연동 준비 중</p>
          <p className="mt-0.5 text-[12px] text-amber-600/80">
            UI는 완성되어 있으며 Coolsms 등 SMS API 연동 후 실제 발송이 가능합니다. 현재는 미리보기 전용입니다.
          </p>
        </div>
      </div>

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
                onChange={(e) => setBody(e.target.value)}
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
            onChange={setTargetTags}
            countMap={countMap}
            totalCount={subscriberCount}
          />
        </div>
      </div>

      {/* ── 발송 버튼 (비활성) ──────────────────────── */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3">
        <p className="text-[12px] text-[#1a1a1a]/40">SMS API 연동 후 활성화됩니다.</p>
        <Button disabled className="cursor-not-allowed opacity-40">
          <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
          문자 발송 (준비 중)
        </Button>
      </div>
    </div>
  )
}
