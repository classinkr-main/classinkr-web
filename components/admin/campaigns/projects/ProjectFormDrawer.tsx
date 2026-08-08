"use client"

// components/admin/campaigns/projects/ProjectFormDrawer.tsx
// 마케팅 프로젝트 생성/편집 드로어(D3-3) — CampaignFormDrawer 셸 패턴 재사용
// (fixed overlay + 모바일 바텀시트). POST(신규)·PATCH(편집)·DELETE(편집).
// 저장 실패 시 인라인 에러 + 입력 보존. 프로젝트는 채널 필드가 없다(멤버 캠페인이 채널을 가진다).

import { useState } from "react"
import { Trash2, X } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABEL,
  type MarketingProject,
  type ProjectStatus,
} from "@/lib/types/marketing-campaign"

interface ProjectFormDrawerProps {
  initial: MarketingProject | null // null = 생성, 값 = 편집
  onClose: () => void
  onSuccess: (message: string) => void // 부모가 목록/상세 리페치 + 닫기 + 토스트
}

// budget: 정수 문자열 → number, 빈값 → null. (sanitizer 가 음수/비정수 거부하므로 round)
function parseBudget(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

export function ProjectFormDrawer({ initial, onClose, onSuccess }: ProjectFormDrawerProps) {
  const isEdit = initial != null

  const [name, setName] = useState(initial?.name ?? "")
  const [objective, setObjective] = useState(initial?.objective ?? "")
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? "planned")
  const [startsAt, setStartsAt] = useState(initial?.startsAt ?? "")
  const [endsAt, setEndsAt] = useState(initial?.endsAt ?? "")
  const [budget, setBudget] = useState(initial?.budget != null ? String(initial.budget) : "")
  const [owner, setOwner] = useState(initial?.owner ?? "")

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) {
      setErr("프로젝트 이름은 필수입니다.")
      return
    }
    setSaving(true)
    setErr(null)

    const payload = {
      name: name.trim(),
      objective: objective.trim() || null,
      status,
      startsAt: startsAt || null,
      endsAt: endsAt || null,
      budget: parseBudget(budget),
      owner: owner.trim() || null,
    }

    try {
      if (isEdit) {
        await adminFetchJson(`/api/admin/marketing-projects/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        onSuccess("프로젝트를 저장했습니다.")
      } else {
        await adminFetchJson("/api/admin/marketing-projects", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        onSuccess("프로젝트를 만들었습니다.")
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!isEdit) return
    if (
      !window.confirm(
        `"${initial.name}" 프로젝트를 삭제할까요? 멤버 캠페인은 삭제되지 않고 소속만 해제됩니다.`,
      )
    )
      return
    setDeleting(true)
    setErr(null)
    try {
      await adminFetchJson(`/api/admin/marketing-projects/${initial.id}`, { method: "DELETE" })
      onSuccess("프로젝트를 삭제했습니다.")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "삭제에 실패했습니다.")
      setDeleting(false)
    }
  }

  const busy = saving || deleting

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        {/* 헤더 */}
        <div className="flex items-start justify-between border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#615D59]">
              {isEdit ? "프로젝트 편집" : "새 프로젝트"}
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-[#111110]">
              {isEdit ? initial.name : "마케팅 프로젝트"}
            </h2>
          </div>
          <button
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
            <label htmlFor="project-name" className="mb-1 block text-[11px] font-medium text-[#615D59]">
              이름 <span className="text-[#B43E3E]">*</span>
            </label>
            <input
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 2026 하반기 신규 학원 확보"
              className="w-full rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-[13px] focus:border-[#084734] focus:outline-none focus:ring-1 focus:ring-[#084734]"
            />
          </div>

          {/* 목표 */}
          <div>
            <label htmlFor="project-objective" className="mb-1 block text-[11px] font-medium text-[#615D59]">
              목표
            </label>
            <textarea
              id="project-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={2}
              placeholder="이 프로젝트로 달성하려는 목표"
              className="w-full resize-none rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-[13px] focus:border-[#084734] focus:outline-none focus:ring-1 focus:ring-[#084734]"
            />
          </div>

          {/* 상태 */}
          <div>
            <label htmlFor="project-status" className="mb-1 block text-[11px] font-medium text-[#615D59]">
              상태
            </label>
            <select
              id="project-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className="w-full rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-[13px] focus:border-[#084734] focus:outline-none focus:ring-1 focus:ring-[#084734]"
            >
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CAMPAIGN_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          {/* 기간 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="project-starts" className="mb-1 block text-[11px] font-medium text-[#615D59]">
                시작일
              </label>
              <input
                id="project-starts"
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-[13px] focus:border-[#084734] focus:outline-none focus:ring-1 focus:ring-[#084734]"
              />
            </div>
            <div>
              <label htmlFor="project-ends" className="mb-1 block text-[11px] font-medium text-[#615D59]">
                종료일
              </label>
              <input
                id="project-ends"
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
              <label htmlFor="project-budget" className="mb-1 block text-[11px] font-medium text-[#615D59]">
                배정 예산 (원)
              </label>
              <input
                id="project-budget"
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
              <label htmlFor="project-owner" className="mb-1 block text-[11px] font-medium text-[#615D59]">
                담당자
              </label>
              <input
                id="project-owner"
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
        <div className="flex items-center justify-between gap-2 border-t border-[#e8e8e4] px-4 py-3 sm:px-6">
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
