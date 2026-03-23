/**
 * ─────────────────────────────────────────────────────────────
 * SubscriberForm  —  구독자 수동 추가 폼
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-18] 관리자가 직접 구독자를 등록할 때 사용.
 *   오프라인 행사 참석자, 명함 수집 등의 케이스.
 *   PRESET_TAGS에서 빠르게 태그를 선택할 수 있음.
 */

"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"
import { PRESET_TAGS } from "@/lib/marketing-types"

interface Props {
  onSave: (data: {
    name: string
    email: string
    org?: string
    role?: string
    phone?: string
    tags: string[]
  }) => void
  onCancel: () => void
  loading?: boolean
}

export default function SubscriberForm({ onSave, onCancel, loading }: Props) {
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    onSave({
      name: fd.get("name") as string,
      email: fd.get("email") as string,
      org: (fd.get("org") as string) || undefined,
      role: (fd.get("role") as string) || undefined,
      phone: (fd.get("phone") as string) || undefined,
      tags: selectedTags,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="sub-name">이름 *</Label>
        <Input id="sub-name" name="name" placeholder="홍길동" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sub-email">이메일 *</Label>
        <Input id="sub-email" name="email" type="email" placeholder="email@example.com" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="sub-org">학원명</Label>
          <Input id="sub-org" name="org" placeholder="클래스인 아카데미" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sub-role">직책</Label>
          <Input id="sub-role" name="role" placeholder="원장" />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sub-phone">전화번호</Label>
        <Input id="sub-phone" name="phone" placeholder="010-1234-5678" />
      </div>

      {/* [NOTE-18] 태그 선택 영역 */}
      <div className="grid gap-2">
        <Label>성향 태그 (클릭하여 선택)</Label>
        <div className="flex flex-wrap gap-1.5 p-3 border rounded-lg bg-[#FAFAF8]">
          {PRESET_TAGS.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className={`cursor-pointer text-[11px] px-2 py-0.5 transition-colors ${
                selectedTags.includes(tag)
                  ? "bg-[#084734] text-white hover:bg-[#084734]/90"
                  : "bg-white text-[#1a1a1a]/60 hover:bg-[#084734]/10 border border-[#e8e8e4]"
              }`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>
        {selectedTags.length > 0 && (
          <p className="text-[11px] text-[#1a1a1a]/40">
            선택됨: {selectedTags.join(", ")}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? (
            <span className="flex items-center">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />저장 중...
            </span>
          ) : (
            "구독자 추가"
          )}
        </Button>
      </div>
    </form>
  )
}
