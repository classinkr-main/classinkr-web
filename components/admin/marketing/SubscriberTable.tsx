/**
 * SubscriberTable — 구독자 목록 테이블
 * 8컬럼 → 5컬럼으로 압축: 이름+학원 / 이메일 / 태그 / 상태+유입 / 액션
 * 벌크 선택: 체크박스 + 액션 바 (태그 추가 / 선택 삭제)
 */

"use client"

import { useState, useRef, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Send, Trash2, ChevronDown, Check } from "lucide-react"
import type { Subscriber } from "@/lib/marketing-types"
import { PRESET_TAGS } from "@/lib/marketing-types"

interface Props {
  /** 필터셋 전체 — 벌크 선택("전체선택")과 벌크 액션의 대상 유니버스. */
  subscribers: Subscriber[]
  /**
   * 렌더할 행 수 상한("더보기"용). 선택 유니버스는 subscribers 전체를 그대로 두고
   * 화면에 그리는 행만 제한한다. 미지정 시 전체 렌더.
   */
  visibleCount?: number
  /**
   * 필터 시그니처(예: `query|status|source`). 값이 바뀌면 벌크 선택을 리셋한다.
   * subscribers 배열 레퍼런스나 visibleCount("더보기")로는 리셋하지 않아, 목록을
   * 펼쳐도 선택이 보존된다.
   */
  filterSignature?: string
  onDelete: (subscriber: Subscriber) => void
  onCompose?: (subscriber: Subscriber) => void
  onAddSubscriber?: () => void
  onComposeCampaign?: () => void
  onBulkDelete?: (ids: string[]) => Promise<void>
  onBulkTagAdd?: (ids: string[], tags: string[]) => Promise<void>
}

const SOURCE_LABELS: Record<string, string> = {
  demo_modal:   "데모",
  contact_page: "문의",
  newsletter:   "뉴스레터",
  meta_lead_ads: "Meta 리드",
  manual:       "수동",
}

function sourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source
}

export default function SubscriberTable({
  subscribers,
  visibleCount,
  filterSignature,
  onDelete,
  onCompose,
  onAddSubscriber,
  onComposeCampaign,
  onBulkDelete,
  onBulkTagAdd,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const [chosenTags, setChosenTags] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close tag dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false)
      }
    }
    if (tagDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [tagDropdownOpen])

  // 필터가 바뀔 때만(=filterSignature 변경) 벌크 선택을 리셋한다. 부모가 매 렌더
  // 새 배열 레퍼런스로 넘기는 subscribers나 "더보기"(visibleCount)로는 리셋하지 않아,
  // 목록을 펼쳐도 선택이 유지된다. 벌크 액션 성공 후 리셋은 각 핸들러가 직접 처리한다.
  useEffect(() => {
    setSelectedIds(new Set())
  }, [filterSignature])

  // subscribers prop 자체가 바뀌면(단건 삭제·새로고침 등으로 사라진 행) 선택 집합을
  // 현재 id 집합과의 교집합으로 정리한다 — 사라진 id가 선택 상태로 남아 벌크 대상에
  // 끼는 것을 막는다. 교집합이 기존과 같으면 prev를 그대로 반환하므로, "더보기"로
  // 배열 레퍼런스만 바뀌고 내용은 그대로일 때는 리렌더를 유발하지 않는다.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const currentIds = new Set(subscribers.map((s) => String(s.id)))
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (currentIds.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [subscribers])

  if (subscribers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-5 py-12 text-center">
        <p className="text-[14px] font-medium text-[#111110]">구독자가 없습니다.</p>
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-[#1a1a1a]/40">
          뉴스레터 구독, 데모 신청, 문의 유입이 들어오면 이 테이블에서 바로 정리할 수 있습니다.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            size="sm"
            className="bg-[#084734] hover:bg-[#084734]/90"
            onClick={onAddSubscriber}
            disabled={!onAddSubscriber}
          >
            구독자 추가
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onComposeCampaign}
            disabled={!onComposeCampaign}
          >
            이메일 작성
          </Button>
        </div>
      </div>
    )
  }

  const allIds = subscribers.map((s) => String(s.id))
  const allChecked = allIds.length > 0 && allIds.every((id) => selectedIds.has(id))
  const someChecked = allIds.some((id) => selectedIds.has(id)) && !allChecked

  function toggleAll() {
    if (allChecked) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allIds))
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleChosenTag(tag: string) {
    setChosenTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) {
        next.delete(tag)
      } else {
        next.add(tag)
      }
      return next
    })
  }

  async function handleBulkTagConfirm() {
    if (!onBulkTagAdd || chosenTags.size === 0) return
    setBulkLoading(true)
    try {
      await onBulkTagAdd(Array.from(selectedIds), Array.from(chosenTags))
      setSelectedIds(new Set())
      setChosenTags(new Set())
      setTagDropdownOpen(false)
    } finally {
      setBulkLoading(false)
    }
  }

  async function handleBulkDelete() {
    if (!onBulkDelete) return
    const count = selectedIds.size
    if (!window.confirm(`선택한 ${count}명의 구독자를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return
    setBulkLoading(true)
    try {
      await onBulkDelete(Array.from(selectedIds))
      setSelectedIds(new Set())
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div>
      {/* ─── 벌크 액션 바 ─────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#e8e8e4] bg-[#ECFDF5] px-4 py-2.5">
          <span className="text-[13px] font-semibold text-[#084734]">
            {selectedIds.size}개 선택됨
          </span>

          {/* 태그 추가 드롭다운 */}
          <div className="relative" ref={dropdownRef}>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 border-[#c6e8d9] bg-white px-2.5 text-[11px] text-[#084734] hover:bg-[#084734]/5"
              onClick={() => setTagDropdownOpen((v) => !v)}
              disabled={bulkLoading || !onBulkTagAdd}
            >
              태그 추가
              <ChevronDown className="h-3 w-3" />
            </Button>

            {tagDropdownOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 w-64 rounded-xl border border-[#e8e8e4] bg-white p-3 shadow-lg">
                <p className="mb-2 text-[11px] font-semibold text-[#615D59]">추가할 태그 선택</p>
                <div className="max-h-48 overflow-y-auto">
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_TAGS.map((tag) => {
                      const isChosen = chosenTags.has(tag)
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleChosenTag(tag)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            isChosen
                              ? "bg-[#084734] text-white"
                              : "bg-[#ECFDF5] text-[#084734] hover:bg-[#D1FAE5]"
                          }`}
                        >
                          {isChosen && <Check className="h-2.5 w-2.5" />}
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2 border-t border-[#e8e8e4] pt-2.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => { setTagDropdownOpen(false); setChosenTags(new Set()) }}
                  >
                    취소
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 bg-[#084734] px-2.5 text-[11px] hover:bg-[#065c41]"
                    onClick={() => void handleBulkTagConfirm()}
                    disabled={chosenTags.size === 0 || bulkLoading}
                  >
                    {bulkLoading ? "추가 중..." : `태그 추가 (${chosenTags.size})`}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* 선택 삭제 */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 border-red-200 bg-white px-2.5 text-[11px] text-red-600 hover:bg-red-50"
            onClick={() => void handleBulkDelete()}
            disabled={bulkLoading || !onBulkDelete}
          >
            <Trash2 className="h-3 w-3" />
            선택 삭제
          </Button>

          {/* 선택 해제 */}
          <button
            type="button"
            className="ml-auto text-[11px] text-[#615D59] underline-offset-2 hover:underline"
            onClick={() => setSelectedIds(new Set())}
          >
            선택 해제
          </button>
        </div>
      )}

      {/* ─── 테이블 ──────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e8e8e4] bg-[#FAFAF8]">
              {/* 체크박스 헤더 */}
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked }}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 cursor-pointer accent-[#084734]"
                />
              </th>
              <th className="px-4 py-3 text-left text-[12px] font-medium text-[#1a1a1a]/50">이름 / 학원</th>
              <th className="px-4 py-3 text-left text-[12px] font-medium text-[#1a1a1a]/50">이메일</th>
              <th className="px-4 py-3 text-left text-[12px] font-medium text-[#1a1a1a]/50">태그</th>
              <th className="px-4 py-3 text-left text-[12px] font-medium text-[#1a1a1a]/50">상태 / 유입</th>
              <th className="px-4 py-3 text-right text-[12px] font-medium text-[#1a1a1a]/50"></th>
            </tr>
          </thead>
          <tbody>
            {subscribers.slice(0, visibleCount ?? subscribers.length).map((s) => {
              const sid = String(s.id)
              const isSelected = selectedIds.has(sid)
              return (
                <tr
                  key={s.id}
                  className={`border-b border-[#e8e8e4] transition-colors ${
                    isSelected ? "bg-[#ECFDF5]/60" : "hover:bg-[#FAFAF8]/60"
                  }`}
                >
                  {/* 체크박스 */}
                  <td className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(sid)}
                      className="h-3.5 w-3.5 cursor-pointer accent-[#084734]"
                    />
                  </td>

                  {/* 이름 + 학원 */}
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-medium text-[#111110]">{s.name}</p>
                    {s.org && (
                      <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">{s.org}</p>
                    )}
                  </td>

                  {/* 이메일 */}
                  <td className="max-w-[180px] px-4 py-3">
                    <p className="truncate text-[12px] text-[#1a1a1a]/60">{s.email}</p>
                    {s.phone && (
                      <p className="mt-0.5 text-[11px] text-[#1a1a1a]/35">{s.phone}</p>
                    )}
                  </td>

                  {/* 태그 */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.tags.length > 0 ? s.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="border-0 bg-[#084734]/10 px-1.5 py-0.5 text-[10px] text-[#084734]"
                        >
                          {tag}
                        </Badge>
                      )) : (
                        <span className="text-[11px] text-[#1a1a1a]/30">—</span>
                      )}
                    </div>
                  </td>

                  {/* 상태 + 유입 */}
                  <td className="px-4 py-3">
                    <Badge
                      variant="secondary"
                      className={`mb-1 border-0 text-[10px] ${
                        s.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-600"
                      }`}
                    >
                      {s.status === "active" ? "수신중" : "거부"}
                    </Badge>
                    <p className="text-[11px] text-[#1a1a1a]/35">{sourceLabel(s.source)}</p>
                  </td>

                  {/* 액션 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {onCompose && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 border-[#e8e8e4] px-2.5 text-[11px] text-[#084734] hover:bg-[#084734]/5"
                          onClick={() => onCompose(s)}
                        >
                          <Send className="h-3 w-3" />
                          <span className="hidden sm:inline">발송</span>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-[#1a1a1a]/25 hover:text-red-500"
                        onClick={() => onDelete(s)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
