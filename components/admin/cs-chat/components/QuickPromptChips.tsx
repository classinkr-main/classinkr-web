"use client"

import {
  Monitor,
  Touchpad,
  PenTool,
  KeyRound,
  FileText,
  Building,
  Sparkles,
} from "lucide-react"

interface QuickPromptChipsProps {
  onSelectPrompt: (promptText: string) => void
  disabled?: boolean
}

const PRESET_CHIPS = [
  {
    icon: Monitor,
    label: "OPS 부팅 불가/블랙스크린",
    prompt: "전자칠판 OPS 부팅이 안 되고 블랙스크린 상태일 때 점검 절차와 확인 질문 정리해줘",
  },
  {
    icon: Touchpad,
    label: "터치 좌표 틀어짐 보정",
    prompt: "전자칠판 터치 좌표가 어긋나거나 필기 포인트가 밀릴 때 캘리브레이션 초기화 방법 안내해줘",
  },
  {
    icon: PenTool,
    label: "스마트펜 블루투스 페어링",
    prompt: "ClassIn 스마트펜 블루투스 연결이 끊어지거나 미인식될 때 재페어링 절차 확인해줘",
  },
  {
    icon: KeyRound,
    label: "ClassIn 라이선스 갱신/배정",
    prompt: "학원 기관 관리자 페이지에서 교사 및 학생 라이선스 추가 배정 및 갱신 방법 알려줘",
  },
  {
    icon: FileText,
    label: "고객 대기 문자 표준 초안",
    prompt: "기술 이슈 확인 중 고객에게 보낼 정중하고 신속한 대기 안내 문자 초안 작성해줘",
  },
  {
    icon: Building,
    label: "본사 기술지원(HQ) 인계문",
    prompt: "현장에서 미해결된 이슈를 본사 기술지원팀(HQ)에 에스컬레이션할 공식 인계문 작성해줘",
  },
]

export default function QuickPromptChips({
  onSelectPrompt,
  disabled = false,
}: QuickPromptChipsProps) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1.5 scrollbar-none" aria-label="빠른 CS 작업 프리셋">
      <div className="flex shrink-0 items-center gap-1 pr-1 text-[11px] font-bold text-[#084734]">
        <Sparkles className="h-3 w-3" />
        <span className="hidden sm:inline">빠른 질문:</span>
      </div>
      {PRESET_CHIPS.map((chip, idx) => {
        const Icon = chip.icon
        return (
          <button
            key={idx}
            type="button"
            disabled={disabled}
            onClick={() => onSelectPrompt(chip.prompt)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.08] bg-[#F6F5F4] px-2.5 py-1 text-[11px] font-medium text-[#31302E] transition-all hover:border-[#084734]/30 hover:bg-[#ECFDF5] hover:text-[#084734] disabled:opacity-40"
          >
            <Icon className="h-3 w-3 text-[#615D59] group-hover:text-[#084734]" />
            <span>{chip.label}</span>
          </button>
        )
      })}
    </div>
  )
}
