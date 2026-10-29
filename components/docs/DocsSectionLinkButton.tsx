"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Link2 } from "lucide-react"

import { cn } from "./utils"

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  // 보안 연결이 아니라 clipboard API 가 없을 때의 대체 경로.
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand("copy")
  textarea.remove()
  if (!ok) throw new Error("copy_failed")
}

/** 섹션 제목 옆 링크 복사 버튼 — `#section-N` 주소를 복사하고 주소창도 그 섹션으로 바꾼다. */
export function DocsSectionLinkButton({
  sectionId,
  title,
  className,
}: {
  sectionId: string
  title: string
  className?: string
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle")
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const handleClick = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${sectionId}`
    window.history.replaceState(window.history.state, "", `#${sectionId}`)

    try {
      await copyText(url)
      setStatus("copied")
    } catch {
      setStatus("failed")
    }

    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setStatus("idle"), 2000)
  }

  const copied = status === "copied"

  return (
    <span className={cn("relative inline-flex shrink-0 print:hidden", className)}>
      <button
        type="button"
        onClick={() => void handleClick()}
        aria-label={`'${title}' 섹션 링크 복사`}
        title="이 섹션 링크 복사"
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-[6px] transition-[opacity,color,background-color] duration-150 hover:bg-black/[0.05] hover:text-[#084734] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]",
          copied
            ? "text-[#084734] opacity-100"
            : "text-[#615D59] opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/heading:opacity-100"
        )}
      >
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
      </button>
      <span
        role="status"
        className={cn(
          "pointer-events-none absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap rounded-[6px] bg-[#111110] px-2 py-1 text-xs font-semibold text-white transition-opacity duration-150",
          status === "idle" ? "opacity-0" : "opacity-100"
        )}
      >
        {status === "copied" ? "링크를 복사했어요" : status === "failed" ? "주소창의 링크를 복사해 주세요" : ""}
      </span>
    </span>
  )
}
