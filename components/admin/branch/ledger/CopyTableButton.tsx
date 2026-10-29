"use client"

// 카드 표 "복사" 버튼(라운드 5 B2) — 누르는 순간 getText()로 TSV를 만들어 클립보드에 쓰고, 결과를 버튼 자체와
// 스크린리더 알림(role=status)으로 2.5초 알린다. DSH 카드들은 워크벤치 토스트 스택 밖이라 자체 피드백을 갖는다.
// 성공 여부는 copyTextToClipboard의 실제 결과만 말한다(권한 거부면 "복사 실패").

import { Check, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { copyTextToClipboard } from "@/lib/export/browser-download"

type CopyState = "idle" | "copied" | "failed"

export function CopyTableButton({
  getText,
  label = "표 복사",
  title,
  ariaLabel,
  disabled = false,
}: {
  getText: () => string
  label?: string
  title?: string
  ariaLabel?: string
  disabled?: boolean
}) {
  const [state, setState] = useState<CopyState>("idle")
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  const onClick = async () => {
    const copied = await copyTextToClipboard(getText())
    setState(copied ? "copied" : "failed")
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setState("idle"), 2500)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30 disabled:cursor-not-allowed disabled:opacity-40 ${
          state === "copied"
            ? "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]"
            : state === "failed"
              ? "border-[#F2B8B8] bg-white text-[#B43E3E]"
              : "border-[rgba(0,0,0,0.08)] bg-white text-[#615D59] hover:text-[#111110]"
        }`}
      >
        {state === "copied" ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        {state === "copied" ? "복사됨" : state === "failed" ? "복사 실패" : label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied"
          ? "표를 클립보드에 복사했습니다 — 스프레드시트에 붙여 넣으면 칸이 나뉩니다."
          : state === "failed"
            ? "클립보드에 복사하지 못했습니다 — 브라우저의 클립보드 권한을 확인하세요."
            : ""}
      </span>
    </>
  )
}
