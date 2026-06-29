"use client"

import { useEffect, useState } from "react"
import { Loader2, UserCircle2 } from "lucide-react"

import { adminFetch, adminFetchJsonCached } from "@/lib/admin-client"

export interface AdminMember {
  userId: string
  name: string
  role: string
}

// 딜 담당자(소유자) 배정 컨트롤 — PATCH로 owner_id를 바꾼다.
// members를 prop으로 주면 자체 fetch를 생략한다(보드처럼 다수 카드를 한 번에 렌더할 때 중복 호출 방지).
export function DealOwnerControl({
  dealId,
  ownerId,
  members: membersProp,
  onAssigned,
}: {
  dealId: string
  ownerId: string | null
  members?: AdminMember[]
  onAssigned: (ownerId: string | null) => void
}) {
  const [fetchedMembers, setFetchedMembers] = useState<AdminMember[]>([])
  const members = membersProp ?? fetchedMembers
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (membersProp) return
    let cancelled = false
    void (async () => {
      try {
        const data = await adminFetchJsonCached<{ members: AdminMember[] }>(
          "/api/admin/members",
          undefined,
          { ttlMs: 300_000 }
        )
        if (!cancelled) setFetchedMembers(Array.isArray(data?.members) ? data.members : [])
      } catch {
        /* noop — 목록 없으면 드롭다운 비활성 */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [membersProp])

  const handleChange = async (value: string) => {
    const nextOwner = value || null
    setSaving(true)
    setFailed(false)
    try {
      const res = await adminFetch(`/api/admin/deals/${dealId}`, {
        method: "PATCH",
        body: JSON.stringify({ owner_id: nextOwner }),
      })
      if (!res.ok) throw new Error("assign failed")
      onAssigned(nextOwner)
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const ownerInList = ownerId ? members.some((m) => m.userId === ownerId) : true

  return (
    <div className="flex items-center gap-2">
      <UserCircle2 className="h-4 w-4 shrink-0 text-[#1a1a1a]/35" />
      <span className="text-xs font-medium text-[#1a1a1a]/45">담당자</span>
      <select
        value={ownerId ?? ""}
        disabled={saving || members.length === 0}
        onChange={(event) => handleChange(event.target.value)}
        className="rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1 text-xs font-medium text-[#1a1a1a] outline-none focus:border-[#c8c8c4] disabled:opacity-50"
      >
        <option value="">미배정</option>
        {members.map((member) => (
          <option key={member.userId} value={member.userId}>
            {member.name}
          </option>
        ))}
        {/* 현재 담당자가 활성 목록에 없을 때(비활성/legacy) 값 유지용 */}
        {!ownerInList && ownerId && <option value={ownerId}>현재 담당자 (목록 외)</option>}
      </select>
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1a1a1a]/40" />}
      {failed && <span className="text-[11px] text-[#B85C33]">저장 실패</span>}
    </div>
  )
}
