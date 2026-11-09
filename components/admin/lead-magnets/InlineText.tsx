"use client"

import type { CSSProperties } from "react"

/**
 * 미리보기 위 인라인 편집 칸 — 공개 화면의 글자 모양 그대로 보이고, 눌러서 바로 고친다.
 * 글자 크기·굵기·색은 바깥(span, className)에 주고 입력칸은 그대로 물려받는다(font: inherit).
 * 고친 칸(original 과 다름)은 연두 바탕으로 남는다. 높이는 글 길이·줄바꿈으로 맞춘다
 * (field-sizing 을 지원하는 브라우저는 그것을 쓴다).
 */
export function InlineText({
  label,
  value,
  original,
  onChange,
  onFocus,
  perLine = 28,
  singleLine = false,
  fit = false,
  className = "",
  controlClassName = "",
  style,
  placeholder,
}: {
  label: string
  value: string
  original?: string
  onChange: (value: string) => void
  onFocus?: () => void
  /** 한 줄에 들어가는 대략의 글자 수 — rows 계산용 */
  perLine?: number
  singleLine?: boolean
  /** 한 줄 칸을 글 길이만큼만 차지하게(뒤에 다른 글이 이어 붙을 때) */
  fit?: boolean
  /** 글자 모양(크기·굵기·색·정렬) — 바깥 span 에 붙는다 */
  className?: string
  /** 입력칸 자체에 붙일 상태 모양(예: 초록 버튼 위 focus 색) */
  controlClassName?: string
  style?: CSSProperties
  placeholder?: string
}) {
  const changed = original !== undefined && value !== original
  const control = [
    "block -mx-1.5 rounded px-1.5 py-0.5 bg-transparent resize-none overflow-hidden",
    "[font:inherit] [letter-spacing:inherit] [color:inherit] [text-align:inherit]",
    "outline outline-1 outline-dashed outline-transparent outline-offset-0 hover:outline-[#084734]/55",
    "focus:outline-2 focus:outline-solid focus:outline-[#084734] focus:bg-white disabled:hover:outline-transparent",
    fit ? "max-w-full [field-sizing:content]" : "w-[calc(100%+12px)]",
    changed ? "bg-[#ECFDF5]" : "",
    controlClassName,
  ].join(" ")

  if (singleLine) {
    // field-sizing 이 없는 브라우저용 폭 — 한글은 영문 두 칸쯤으로 센다
    const width = Array.from(value).reduce((total, char) => total + (char.charCodeAt(0) > 255 ? 2 : 1), 0) + 2
    return (
      <span className={`${fit ? "inline-block max-w-full" : "block"} ${className}`} style={style}>
        <input
          type="text"
          aria-label={label}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          size={fit ? Math.max(4, width) : undefined}
          className={control}
        />
      </span>
    )
  }
  const rows = Math.max(
    1,
    value.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / perLine)), 0)
  )
  return (
    <span className={`block ${className}`} style={style}>
      <textarea
        aria-label={label}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        className={`${control} [field-sizing:content]`}
      />
    </span>
  )
}
