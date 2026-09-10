"use client"

// components/admin/campaigns/projects/ProjectFormDrawer.tsx
// 마케팅 프로젝트 생성/편집 드로어(D3-3) — CampaignFormDrawer 셸 패턴 재사용
// (fixed overlay + 모바일 바텀시트). POST(신규)·PATCH(편집)·DELETE(편집).
// 저장 실패 시 인라인 에러 + 입력 보존. 프로젝트는 채널 필드가 없다(멤버 캠페인이 채널을 가진다).

import { useCallback, useRef, useState } from "react"
import { Trash2, X } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"
import { blurOnWheel } from "@/components/admin/number-input-guards"
import { BUDGET_INVALID_MESSAGE, parseBudgetInput } from "@/lib/marketing/input-normalize"
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABEL,
  type MarketingProject,
  type ProjectStatus,
} from "@/lib/types/marketing-campaign"

// 작성 중 닫기 확인 문구 — AdLeadImportDialog(붙여넣기 다이얼로그)와 같은 결.
const CLOSE_CONFIRM = "입력한 내용이 있습니다. 닫으면 사라집니다. 닫을까요?"

interface ProjectFormDrawerProps {
  initial: MarketingProject | null // null = 생성, 값 = 편집
  onClose: () => void
  onSuccess: (message: string) => void // 부모가 목록/상세 리페치 + 닫기 + 토스트
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
  const [budgetInvalid, setBudgetInvalid] = useState(false)
  const [nameInvalid, setNameInvalid] = useState(false)
  // 사용자가 한 필드라도 고쳤는지 — 확인 없이 닫아 입력이 사라지는 것을 막는 데만 쓴다.
  const [dirty, setDirty] = useState(false)

  async function handleSave() {
    if (!name.trim()) {
      setNameInvalid(true)
      setErr("프로젝트 이름은 필수입니다.")
      return
    }
    setNameInvalid(false)
    // 음수·비수치 예산을 조용히 null(예산 없음)로 바꿔 보내면 유실 사실이 드러나지 않는다 —
    // 서버 sanitizer 도 하드 게이트로 거부하므로 여기서 폼 검증 에러로 표면화한다.
    const parsedBudget = parseBudgetInput(budget)
    if (parsedBudget === "invalid") {
      setBudgetInvalid(true)
      setErr(BUDGET_INVALID_MESSAGE)
      return
    }
    setBudgetInvalid(false)
    setSaving(true)
    setErr(null)

    const payload = {
      name: name.trim(),
      objective: objective.trim() || null,
      status,
      startsAt: startsAt || null,
      endsAt: endsAt || null,
      budget: parsedBudget,
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

  // 접근성 — 열릴 때 닫기 버튼으로 포커스 이동, Escape 닫기 + Tab 트랩, 닫히면 이전 포커스 복귀
  // (AdLeadImportDialog와 동일 패턴).
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  // 작성 중 닫기(Escape·X·취소)는 확인을 거친다. 저장·삭제 성공 경로는 부모(onSuccess)가 닫으므로 무관.
  const requestClose = useCallback(() => {
    if (dirty && !window.confirm(CLOSE_CONFIRM)) return
    onClose()
  }, [dirty, onClose])
  useDialogFocus(true, requestClose, closeButtonRef)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "프로젝트 편집" : "새 프로젝트"}
        className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between border-b border-[rgba(0,0,0,0.08)] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#615D59]">
              {isEdit ? "프로젝트 편집" : "새 프로젝트"}
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-[#111110]">
              {isEdit ? initial.name : "마케팅 프로젝트"}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            onClick={requestClose}
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
              // 라벨의 * 와 실제 접근성 상태를 맞춘다 — 저장 시 비어 있으면 aria-invalid + 인라인 에러.
              aria-required="true"
              aria-invalid={nameInvalid || undefined}
              onChange={(e) => {
                setDirty(true)
                setName(e.target.value)
                setNameInvalid(false)
              }}
              placeholder="예: 2026 하반기 신규 학원 확보"
              className={`w-full rounded-lg border bg-white px-3 py-2 text-[13px] focus:border-[#084734] focus:outline-none focus:ring-1 focus:ring-[#084734] ${
                nameInvalid ? "border-[#F2B8B8]" : "border-[#E5E5E0]"
              }`}
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
              onChange={(e) => {
                setDirty(true)
                setObjective(e.target.value)
              }}
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
              onChange={(e) => {
                setDirty(true)
                setStatus(e.target.value as ProjectStatus)
              }}
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
                onChange={(e) => {
                  setDirty(true)
                  setStartsAt(e.target.value)
                }}
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
                onChange={(e) => {
                  setDirty(true)
                  setEndsAt(e.target.value)
                }}
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
                onWheel={blurOnWheel}
                aria-invalid={budgetInvalid || undefined}
                onChange={(e) => {
                  setDirty(true)
                  setBudget(e.target.value)
                  setBudgetInvalid(false)
                }}
                placeholder="0"
                className={`w-full rounded-lg border bg-white px-3 py-2 text-[13px] tabular-nums focus:border-[#084734] focus:outline-none focus:ring-1 focus:ring-[#084734] ${
                  budgetInvalid ? "border-[#F2B8B8]" : "border-[#E5E5E0]"
                }`}
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
                onChange={(e) => {
                  setDirty(true)
                  setOwner(e.target.value)
                }}
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
              onClick={requestClose}
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
