"use client"

// components/admin/campaigns/manage/CampaignFormDrawer.tsx
// 캠페인 생성/편집 드로어(D1-5) — MetricsEditor 드로어 셸 패턴 재사용
// (fixed overlay + 모바일 바텀시트). 상세/링크 피커는 D1-6(여기 아님).
// POST(신규)·PATCH(편집)·DELETE(편집). 저장 실패 시 인라인 에러 + 입력 보존.

import { useRef, useState } from "react"
import { Trash2, X } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABEL,
  type CampaignStatus,
  type CampaignWithLinks,
} from "@/lib/types/marketing-campaign"

import { channelLabel } from "./CampaignRow"

// 토글로 노출할 공통 선언 채널(정보성). 편집 시 목록에 없는 기존 채널도 병합해 보존.
const COMMON_CHANNELS = ["email", "sms", "kakao", "meta", "event", "search", "display"]

interface CampaignFormDrawerProps {
  initial: CampaignWithLinks | null // null = 생성, 값 = 편집
  onClose: () => void
  onSuccess: (message: string) => void // 부모가 목록 리페치 + 닫기 + 토스트
}

// budget: 정수 문자열 → number, 빈값 → null. (sanitizer 가 음수/비정수 거부하므로 round)
function parseBudget(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

export function CampaignFormDrawer({ initial, onClose, onSuccess }: CampaignFormDrawerProps) {
  const isEdit = initial != null

  const [name, setName] = useState(initial?.name ?? "")
  const [objective, setObjective] = useState(initial?.objective ?? "")
  const [status, setStatus] = useState<CampaignStatus>(initial?.status ?? "planned")
  const [channels, setChannels] = useState<string[]>(initial?.channels ?? [])
  const [startsAt, setStartsAt] = useState(initial?.startsAt ?? "")
  const [endsAt, setEndsAt] = useState(initial?.endsAt ?? "")
  const [budget, setBudget] = useState(initial?.budget != null ? String(initial.budget) : "")
  const [owner, setOwner] = useState(initial?.owner ?? "")

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // 편집 시 preset 밖의 기존 채널도 토글로 보이도록 병합(선택 상태 보존).
  const channelOptions = Array.from(new Set([...COMMON_CHANNELS, ...channels]))

  function toggleChannel(channel: string) {
    setChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel],
    )
  }

  async function handleSave() {
    if (!name.trim()) {
      setErr("캠페인 이름은 필수입니다.")
      return
    }
    setSaving(true)
    setErr(null)

    const payload = {
      name: name.trim(),
      objective: objective.trim() || null,
      status,
      channels,
      startsAt: startsAt || null,
      endsAt: endsAt || null,
      budget: parseBudget(budget),
      owner: owner.trim() || null,
    }

    try {
      if (isEdit) {
        await adminFetchJson(`/api/admin/marketing-campaigns/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        onSuccess("캠페인을 저장했습니다.")
      } else {
        await adminFetchJson("/api/admin/marketing-campaigns", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        onSuccess("캠페인을 만들었습니다.")
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!isEdit) return
    if (!window.confirm(`"${initial.name}" 캠페인을 삭제할까요? 되돌릴 수 없습니다.`)) return
    setDeleting(true)
    setErr(null)
    try {
      await adminFetchJson(`/api/admin/marketing-campaigns/${initial.id}`, { method: "DELETE" })
      onSuccess("캠페인을 삭제했습니다.")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "삭제에 실패했습니다.")
      setDeleting(false)
    }
  }

  const busy = saving || deleting

  // 접근성 — 열릴 때 닫기 버튼으로 포커스 이동, Escape 닫기 + Tab 트랩, 닫히면 이전 포커스 복귀
  // (AdLeadImportDialog와 동일 패턴).
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useDialogFocus(true, onClose, closeButtonRef)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "캠페인 편집" : "새 캠페인"}
        className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between border-b border-[rgba(0,0,0,0.08)] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#615D59]">
              {isEdit ? "캠페인 편집" : "새 캠페인"}
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-[#111110]">
              {isEdit ? initial.name : "크로스채널 캠페인"}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="닫기"
            className="text-[#615D59] transition-colors hover:text-[#111110]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="max-h-[calc(100dvh-9rem)] space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {err && (
            <div className="rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[12px] text-[#B43E3E]">
              {err}
            </div>
          )}

          {/* 이름 */}
          <div>
            <label htmlFor="campaign-name" className="mb-1 block text-[11px] font-medium text-[#615D59]">
              이름 <span className="text-[#B43E3E]">*</span>
            </label>
            <input
              id="campaign-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 2026 여름 신규반 모집"
              className="w-full rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-[13px] focus:border-[#084734] focus:outline-none focus:ring-1 focus:ring-[#084734]"
            />
          </div>

          {/* 목표 */}
          <div>
            <label htmlFor="campaign-objective" className="mb-1 block text-[11px] font-medium text-[#615D59]">
              목표
            </label>
            <textarea
              id="campaign-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={2}
              placeholder="이 캠페인으로 달성하려는 목표"
              className="w-full resize-none rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-[13px] focus:border-[#084734] focus:outline-none focus:ring-1 focus:ring-[#084734]"
            />
          </div>

          {/* 상태 */}
          <div>
            <label htmlFor="campaign-status" className="mb-1 block text-[11px] font-medium text-[#615D59]">
              상태
            </label>
            <select
              id="campaign-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as CampaignStatus)}
              className="w-full rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-[13px] focus:border-[#084734] focus:outline-none focus:ring-1 focus:ring-[#084734]"
            >
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CAMPAIGN_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          {/* 채널 */}
          <div>
            <p className="mb-1.5 block text-[11px] font-medium text-[#615D59]">채널 (선언 · 정보성)</p>
            <div className="flex flex-wrap gap-1.5">
              {channelOptions.map((channel) => {
                const active = channels.includes(channel)
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => toggleChannel(channel)}
                    aria-pressed={active}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                      active
                        ? "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]"
                        : "border-[rgba(0,0,0,0.08)] bg-white text-[#615D59] hover:bg-[#fafaf8]"
                    }`}
                  >
                    {channelLabel(channel)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 기간 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="campaign-starts" className="mb-1 block text-[11px] font-medium text-[#615D59]">
                시작일
              </label>
              <input
                id="campaign-starts"
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-[13px] focus:border-[#084734] focus:outline-none focus:ring-1 focus:ring-[#084734]"
              />
            </div>
            <div>
              <label htmlFor="campaign-ends" className="mb-1 block text-[11px] font-medium text-[#615D59]">
                종료일
              </label>
              <input
                id="campaign-ends"
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-[13px] focus:border-[#084734] focus:outline-none focus:ring-1 focus:ring-[#084734]"
              />
            </div>
          </div>

          {/* 예산 · 담당자 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="campaign-budget" className="mb-1 block text-[11px] font-medium text-[#615D59]">
                예산 (원)
              </label>
              <input
                id="campaign-budget"
                type="number"
                min={0}
                step={1}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-[13px] tabular-nums focus:border-[#084734] focus:outline-none focus:ring-1 focus:ring-[#084734]"
              />
            </div>
            <div>
              <label htmlFor="campaign-owner" className="mb-1 block text-[11px] font-medium text-[#615D59]">
                담당자
              </label>
              <input
                id="campaign-owner"
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="담당자 이름"
                className="w-full rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-[13px] focus:border-[#084734] focus:outline-none focus:ring-1 focus:ring-[#084734]"
              />
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between gap-2 border-t border-[rgba(0,0,0,0.08)] px-4 py-3 sm:px-6">
          {isEdit ? (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#F2B8B8] bg-white px-3 py-2 text-[13px] font-medium text-[#B43E3E] transition-colors hover:bg-[#FCE9E9] disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? "삭제 중..." : "삭제"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 text-[13px] text-[#615D59] transition-colors hover:text-[#111110] disabled:opacity-40"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={busy}
              className="rounded-lg bg-[#084734] px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#065c41] disabled:opacity-40"
            >
              {saving ? "저장 중..." : isEdit ? "저장" : "만들기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
