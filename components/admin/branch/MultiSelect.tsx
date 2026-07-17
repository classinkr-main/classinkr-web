"use client"
import { ChevronDown } from "lucide-react"
import { useEffect, useRef, useState } from "react"

// 멀티선택 드롭다운 SSOT(품질 웨이브 4 — 항목 2) — sections/PipelineTable.tsx가 지역
// 컴포넌트로 갖고 있던 것을 그대로(로직 무변경) 이 파일로 추출했다. 소비처:
// PipelineTable.tsx(담당/지역 필터) · BranchPipelineKanban.tsx(담당 필터, 기존 단일
// select를 이걸로 교체해 두 화면의 필터 기능을 동등화).
//
// R5 항목 2. role="listbox" 컨테이너인데 옵션이 plain <button>(role 없음)이라 ARIA
// 트리 정합이 깨져 있었다(listbox는 option 자식만 유효 — 스크린리더가 옵션 개수·선택
// 상태를 못 읽는다). 각 옵션에 role="option"+aria-selected를 부여해 정합을 맞추고,
// "전체 보기"도 논리적으로 하나의 선택지이므로 동일하게 처리한다. Escape로 닫는 동작도
// 추가(기존 outside-click 유지) — 표준 listbox 키보드 관례.

export default function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "전체",
  align = "left",
  width = "w-44",
}: {
  label: string
  options: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  placeholder?: string
  align?: "left" | "right"
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    if (open) {
      document.addEventListener("mousedown", onClick)
      document.addEventListener("keydown", onKeyDown)
    }
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const summary = options.length === 0 || selected.size === 0
    ? placeholder
    : selected.size === 1
    ? Array.from(selected)[0]
    : `${Array.from(selected)[0]} 외 ${selected.size - 1}`

  function toggle(option: string) {
    const next = new Set(selected)
    if (next.has(option)) next.delete(option)
    else next.add(option)
    onChange(next)
  }

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-[#111110]/50">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={options.length === 0}
        // 웨이브 7 — U5(터치 타깃). 좁은 뷰포트(<md)에서 min-h-10(40px)로 확대,
        // 데스크톱은 md:h-8 md:min-h-0으로 기존 밀도 유지.
        className="inline-flex h-10 min-h-10 min-w-[7rem] items-center justify-between gap-2 rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] outline-none transition hover:border-[#111110]/25 focus:border-[#111110]/30 disabled:cursor-not-allowed disabled:opacity-50 md:h-8 md:min-h-0"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected.size === 0 ? "text-[#111110]/55" : "text-[#111110]"}>{summary}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-[#111110]/40 transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="listbox"
          // top-11(44px)/md:top-9(36px) — 트리거가 모바일 h-10(40px)/데스크톱 h-8(32px)로
          // 반응형이라(U5) 드롭다운 오프셋도 같은 브레이크포인트에서 맞춰 겹치지 않게 한다.
          className={`absolute top-11 z-30 max-h-64 ${width} overflow-auto rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-1 shadow-[0_10px_30px_rgba(0,0,0,0.08)] md:top-9 ${align === "right" ? "right-0" : "left-0"}`}
        >
          <button
            type="button"
            role="option"
            aria-selected={selected.size === 0}
            onClick={() => onChange(new Set())}
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] transition ${
              selected.size === 0 ? "bg-[#ECFDF5] text-[#084734]" : "text-[#111110]/65 hover:bg-[#FAFAF8]"
            }`}
          >
            <span>전체 보기</span>
          </button>
          <div className="my-1 h-px bg-[#F6F5F4]" />
          {options.map((opt) => {
            const checked = selected.has(opt)
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggle(opt)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition ${
                  checked ? "bg-[#ECFDF5] text-[#084734]" : "text-[#111110]/75 hover:bg-[#FAFAF8]"
                }`}
              >
                <span className="truncate">{opt}</span>
                <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                  checked ? "border-[#084734] bg-[#084734] text-white" : "border-[#d8d8d4] bg-white"
                }`}>
                  {checked && <span className="text-[10px] font-bold leading-none">✓</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
