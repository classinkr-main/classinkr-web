"use client"

import { useMemo, useRef, useState } from "react"
import { X } from "lucide-react"

import { getTeamMemberColor } from "@/lib/team-member-colors"

interface AssigneePickerProps {
  /** 선택된 담당자 이름들 */
  value: string[]
  onChange: (next: string[]) => void
  /** 추천 목록(팀 명부 + 최근 일정에 등장한 이름). 이미 선택된 이름은 자동으로 빠진다. */
  suggestions: string[]
  id: string
  describedBy?: string
  disabled?: boolean
}

/** 이름 첫 글자 배지. 색은 팀원 고정색(lib/team-member-colors)을 그대로 쓴다. */
function NameDot({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
      style={{ backgroundColor: getTeamMemberColor(name) }}
    >
      {name.charAt(0)}
    </span>
  )
}

/**
 * 담당자 칩 입력.
 *
 * 원래는 "홍길동, 김철수" 를 손으로 치는 텍스트 한 줄이었다. 쉼표를 빠뜨리거나 이름을
 * 한 글자 틀리면 담당자 필터·스윔레인에서 그 사람이 별도 행으로 갈라져 나오기 때문에,
 * 이름을 직접 치는 대신 명부에서 고르는 걸 기본 경로로 만든다. 자유 입력은 명부에 없는
 * 외부 참석자를 위해 남겨둔다.
 */
export function AssigneePicker({
  value,
  onChange,
  suggestions,
  id,
  describedBy,
  disabled,
}: AssigneePickerProps) {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const available = useMemo(() => {
    const selected = new Set(value)
    const keyword = query.trim().toLowerCase()
    return suggestions
      .filter((name) => !selected.has(name))
      .filter((name) => !keyword || name.toLowerCase().includes(keyword))
  }, [suggestions, value, query])

  const add = (name: string) => {
    const target = name.trim()
    if (!target || value.includes(target)) {
      setQuery("")
      return
    }
    onChange([...value, target])
    setQuery("")
  }

  const remove = (name: string) => onChange(value.filter((item) => item !== name))

  return (
    <div className="space-y-1.5">
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-[6px] border border-[#E5E5E0] bg-white px-2 py-1.5 shadow-[0_1px_2px_rgba(17,17,16,0.04)] transition-all duration-150 ${
          disabled
            ? "cursor-not-allowed bg-[#F6F5F4] opacity-60"
            : "cursor-text hover:border-[#D8D8D2] focus-within:border-[#084734] focus-within:ring-2 focus-within:ring-[#084734]/20"
        }`}
      >
        {value.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-[#F6F5F4] py-0.5 pl-1 pr-1 text-[12px] font-medium text-[#111110]"
          >
            <NameDot name={name} />
            {name}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                remove(name)
              }}
              disabled={disabled}
              aria-label={`${name} 담당자에서 제외`}
              className="rounded-full p-0.5 text-[#A39E98] transition-colors hover:bg-black/[0.06] hover:text-[#111110] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={query}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(event) => {
            // 쉼표를 치면 곧바로 칩이 된다 — 기존 "쉼표로 구분" 습관을 그대로 받아준다.
            const next = event.target.value
            if (next.includes(",")) {
              const pieces = next.split(",")
              const tail = pieces.pop() ?? ""
              const added = pieces.map((piece) => piece.trim()).filter(Boolean)
              if (added.length > 0) {
                const merged = [...value]
                for (const name of added) if (!merged.includes(name)) merged.push(name)
                onChange(merged)
              }
              setQuery(tail)
              return
            }
            setQuery(next)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              // 엔터로 칩을 확정한다. 입력값이 있을 때만 폼 제출을 가로챈다.
              if (query.trim()) {
                event.preventDefault()
                add(query)
              }
              return
            }
            if (event.key === "Backspace" && !query && value.length > 0) {
              remove(value[value.length - 1])
            }
          }}
          onBlur={() => {
            if (query.trim()) add(query)
          }}
          placeholder={value.length === 0 ? "이름을 고르거나 직접 입력" : ""}
          className="h-6 min-w-[7rem] flex-1 border-0 bg-transparent px-1 text-[14px] text-[#111110] outline-none placeholder:text-[#A39E98] disabled:cursor-not-allowed"
        />
      </div>

      {available.length > 0 && !disabled && (
        <div className="flex flex-wrap gap-1">
          {available.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => add(name)}
              className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-white px-2 py-1 text-[11px] font-medium text-[#615D59] transition-colors hover:border-[#084734]/30 hover:bg-[#ECFDF5] hover:text-[#084734] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            >
              <NameDot name={name} />
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
