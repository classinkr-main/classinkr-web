"use client"

import { RotateCcw } from "lucide-react"
import { TAG_GROUPS } from "@/lib/marketing-types"

interface Props {
  selected: string[]
  onChange: (tags: string[]) => void
  /** 각 태그에 해당하는 구독자 수. 없으면 표시 안 함 */
  countMap?: Record<string, number>
  /** 태그 없을 때 기본 발송 수 (전체 active) */
  totalCount?: number
}

export default function TagSelector({ selected, onChange, countMap, totalCount }: Props) {
  const toggle = (tag: string) => {
    onChange(
      selected.includes(tag)
        ? selected.filter((t) => t !== tag)
        : [...selected, tag]
    )
  }

  const toggleGroup = (tags: readonly string[]) => {
    const allSelected = tags.every((t) => selected.includes(t))
    if (allSelected) {
      onChange(selected.filter((t) => !tags.includes(t)))
    } else {
      const next = [...selected]
      for (const t of tags) {
        if (!next.includes(t)) next.push(t)
      }
      onChange(next)
    }
  }

  const clearAll = () => onChange([])

  return (
    <div className="space-y-3">
      {TAG_GROUPS.map((group) => {
        const allSelected = group.tags.every((t) => selected.includes(t))
        const someSelected = group.tags.some((t) => selected.includes(t))

        return (
          <div key={group.label} className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/35">
                {group.label}
              </span>
              <button
                type="button"
                onClick={() => toggleGroup(group.tags)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  allSelected
                    ? "bg-[#084734]/10 text-[#084734]"
                    : someSelected
                      ? "bg-[#084734]/5 text-[#084734]/70 hover:bg-[#084734]/10"
                      : "text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60"
                }`}
              >
                {allSelected ? "전체 해제" : "전체 선택"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.tags.map((tag) => {
                const active = selected.includes(tag)
                const count = countMap?.[tag]
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggle(tag)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-all ${
                      active
                        ? "border-[#084734] bg-[#084734] text-white shadow-[0_1px_4px_rgba(8,71,52,0.25)]"
                        : "border-[#e8e8e4] bg-white text-[#1a1a1a]/60 hover:border-[#084734]/40 hover:text-[#084734]"
                    }`}
                  >
                    {tag}
                    {count !== undefined && (
                      <span className={`text-[10px] ${active ? "text-white/70" : "text-[#1a1a1a]/35"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* 선택 요약 바 */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e8e8e4] bg-white px-3 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {selected.length === 0 ? (
            <span className="text-[12px] text-[#1a1a1a]/40">
              전체 active 구독자{totalCount !== undefined ? ` ${totalCount}명` : ""}에게 발송됩니다.
            </span>
          ) : (
            <>
              <span className="text-[12px] text-[#1a1a1a]/45">선택 {selected.length}개:</span>
              {selected.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-medium text-[#084734]"
                >
                  {tag}
                </span>
              ))}
            </>
          )}
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="flex shrink-0 items-center gap-1 text-[11px] text-[#1a1a1a]/35 hover:text-[#111110]"
          >
            <RotateCcw className="h-3 w-3" />
            초기화
          </button>
        )}
      </div>
    </div>
  )
}
