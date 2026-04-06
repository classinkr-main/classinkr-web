"use client"

import { useState } from "react"
import { MessageSquare, Sparkles, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PRESET_TAGS } from "@/lib/marketing-types"

const SMS_MAX = 90
const LMMS_MAX = 2000

export default function SmsComposer() {
  const [body,       setBody]       = useState("")
  const [targetTags, setTargetTags] = useState<string[]>([])
  const [aiMode,     setAiMode]     = useState(false)
  const [aiBrief,    setAiBrief]    = useState("")

  const toggleTag = (tag: string) =>
    setTargetTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )

  const isLmms   = body.length > SMS_MAX
  const charLimit = isLmms ? LMMS_MAX : SMS_MAX
  const overLimit = body.length > LMMS_MAX

  return (
    <div className="space-y-5">
      {/* 준비 중 배너 */}
      <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
        <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-medium text-amber-700">SMS/LMS 발송 연동 준비 중</p>
          <p className="text-[12px] text-amber-600/80 mt-0.5">
            UI는 완성되어 있으며, Coolsms 등 SMS API 연동 후 실제 발송이 가능합니다.
            현재는 미리보기 전용입니다.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#e8e8e4] p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center">
            <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
          </div>
          <h3 className="text-[15px] font-semibold text-[#111110]">문자(SMS/LMS) 발송</h3>
        </div>

        <div className="space-y-4">
          {/* AI 모드 토글 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAiMode(!aiMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-colors ${
                aiMode
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white text-[#1a1a1a]/50 border-[#e8e8e4] hover:border-violet-300 hover:text-violet-600"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI 개인화 모드
            </button>
            <span className="text-[11px] text-[#1a1a1a]/30">
              {aiMode ? "수신자별 맞춤 문자 자동 생성" : "동일한 문자를 전체 발송"}
            </span>
          </div>

          {/* AI 브리프 (AI 모드일 때) */}
          {aiMode && (
            <div>
              <label className="text-[12px] font-medium text-[#1a1a1a]/60 block mb-1.5">
                AI 생성 지침
              </label>
              <textarea
                value={aiBrief}
                onChange={(e) => setAiBrief(e.target.value)}
                rows={2}
                placeholder="예: 데모 신청 감사 문자. 학원명 포함, 친근한 톤으로 80자 이내."
                className="w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none placeholder:text-[#1a1a1a]/25"
              />
            </div>
          )}

          {/* 문자 내용 */}
          {!aiMode && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-medium text-[#1a1a1a]/60">
                  문자 내용 *
                </label>
                <span className={`text-[11px] font-mono ${
                  overLimit ? "text-red-500" : isLmms ? "text-amber-500" : "text-[#1a1a1a]/40"
                }`}>
                  {body.length} / {charLimit}자
                  {isLmms && !overLimit && <span className="ml-1 text-amber-500">(LMS)</span>}
                </span>
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder={`[클래스인]\n안녕하세요 {name}님,\n{org}에 클래스인을 소개드립니다.`}
                className={`w-full px-3 py-2.5 border rounded-lg text-[13px] focus:outline-none focus:ring-2 resize-none placeholder:text-[#1a1a1a]/25 leading-relaxed ${
                  overLimit
                    ? "border-red-300 focus:ring-red-500/20"
                    : "border-[#e8e8e4] focus:ring-sky-500/20"
                }`}
              />
              <div className="flex gap-3 mt-1.5">
                {body.length <= SMS_MAX && (
                  <p className="text-[10px] text-[#1a1a1a]/30">90자 이하: SMS (단문)</p>
                )}
                {body.length > SMS_MAX && body.length <= LMMS_MAX && (
                  <p className="text-[10px] text-amber-500">90자 초과: LMS (장문, 요금 다름)</p>
                )}
                {overLimit && (
                  <p className="text-[10px] text-red-500">2000자 초과: 발송 불가</p>
                )}
              </div>
            </div>
          )}

          {/* 수신 대상 */}
          <div>
            <label className="text-[12px] font-medium text-[#1a1a1a]/60 block mb-1.5">
              발송 대상 태그 <span className="text-[#1a1a1a]/30 font-normal">(미선택 시 전체)</span>
            </label>
            <div className="flex flex-wrap gap-1.5 p-3 border border-[#e8e8e4] rounded-lg bg-[#FAFAF8]">
              {PRESET_TAGS.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className={`cursor-pointer text-[11px] px-2 py-0.5 transition-colors ${
                    targetTags.includes(tag)
                      ? "bg-sky-600 text-white hover:bg-sky-700"
                      : "bg-white text-[#1a1a1a]/60 hover:bg-sky-50 hover:text-sky-700 border border-[#e8e8e4]"
                  }`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* 발송 미리보기 (폰 목업) */}
          <div>
            <label className="text-[12px] font-medium text-[#1a1a1a]/60 block mb-2">미리보기</label>
            <div className="w-[240px] bg-[#f0f0ec] rounded-2xl p-4 shadow-inner">
              <div className="bg-white rounded-xl p-3 shadow-sm">
                <p className="text-[10px] text-[#1a1a1a]/40 mb-1">클래스인</p>
                <p className="text-[12px] text-[#111110] leading-relaxed whitespace-pre-wrap">
                  {aiMode
                    ? aiBrief
                      ? `✦ AI가 각 수신자에게 맞는 문자를\n  자동으로 생성합니다.`
                      : "(AI 생성 지침을 입력해주세요)"
                    : body || "(문자 내용을 입력해주세요)"}
                </p>
              </div>
            </div>
          </div>

          {/* 발송 버튼 (비활성) */}
          <div className="flex items-center gap-3">
            <Button
              disabled
              className="bg-sky-200 text-sky-400 cursor-not-allowed"
            >
              <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
              문자 발송 (연동 준비 중)
            </Button>
            <p className="text-[11px] text-[#1a1a1a]/30">SMS API 연동 후 활성화됩니다</p>
          </div>
        </div>
      </div>
    </div>
  )
}
