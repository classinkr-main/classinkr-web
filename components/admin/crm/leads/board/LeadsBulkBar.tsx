"use client"

// 벌크 작업 바 — 선택 요약·확인/배정/종료/삭제와 배정 안전성 미리보기.
// 선택 상태와 실제 mutation은 부모(LeadsBoardClient)가 소유하고 여기는 표시·콜백만 담당한다.
// LeadsBoardClient.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { Check, Loader2, Trash2, UserPlus, Users } from "lucide-react"
import type { CrmOwnerOption } from "@/components/admin/crm/useCrmOwners"
import {
  buildLeadAssignmentProfile,
  formatLeadAssignmentProfile,
} from "@/lib/crm/lead-assignment-profile"
import type { LeadAssignmentPreviewResponse } from "./shared"

export default function LeadsBulkBar({
  selectedFilteredCount,
  selectedBeyondVisibleCount,
  filteredCount,
  selectedUnconfirmedIds,
  selectedDeleting,
  bulkWorking,
  bulkAssignOpen,
  bulkOwnerKey,
  crmOwners,
  crmOwnerHealth,
  assignmentPreview,
  assignmentPreviewLoading,
  assignmentPreviewError,
  assignmentPreviewOtherBlockers,
  assignmentApplyReady,
  selectedAssignmentProfile,
  onSelectAllFiltered,
  onClearSelection,
  onConfirmSelectedUnconfirmed,
  onToggleAssignOpen,
  onOwnerKeyChange,
  onAssign,
  onUnassign,
  onCloseSelected,
  onDeleteSelected,
  onSelectSafeTargets,
}: {
  selectedFilteredCount: number
  selectedBeyondVisibleCount: number
  filteredCount: number
  selectedUnconfirmedIds: string[]
  selectedDeleting: boolean
  bulkWorking: boolean
  bulkAssignOpen: boolean
  bulkOwnerKey: string
  crmOwners: CrmOwnerOption[]
  crmOwnerHealth: { ok: boolean; message: string | null } | null
  assignmentPreview: LeadAssignmentPreviewResponse | null
  assignmentPreviewLoading: boolean
  assignmentPreviewError: string | null
  assignmentPreviewOtherBlockers: number
  assignmentApplyReady: boolean
  selectedAssignmentProfile: ReturnType<typeof buildLeadAssignmentProfile> | null
  onSelectAllFiltered: () => void
  onClearSelection: () => void
  onConfirmSelectedUnconfirmed: () => void
  onToggleAssignOpen: () => void
  onOwnerKeyChange: (ownerKey: string) => void
  onAssign: () => void
  onUnassign: () => void
  onCloseSelected: () => void
  onDeleteSelected: () => void
  onSelectSafeTargets: (safeLeadIds: string[]) => void
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#F6D5C5] bg-[#FEF8F5] px-4 py-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[13px] font-semibold text-[#111110]">
            {selectedFilteredCount}건 선택됨
            {selectedBeyondVisibleCount > 0 ? (
              <span className="ml-1.5 font-medium text-[#B85C33]">
                (화면 밖 {selectedBeyondVisibleCount}건 포함)
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedFilteredCount < filteredCount && filteredCount > 0 ? (
            <button
              type="button"
              onClick={onSelectAllFiltered}
              title="더보기로 아직 화면에 그리지 않은 리드까지 포함해 현재 조건의 결과 전체를 선택합니다."
              className="rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#111110] transition-colors hover:border-[#c8c8c4]"
            >
              결과 전체 {filteredCount}건 선택
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#1a1a1a]/55 transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
          >
            선택 해제
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-[#F6D5C5]/60 pt-2.5">
        {selectedUnconfirmedIds.length > 0 ? (
          <button
            type="button"
            onClick={onConfirmSelectedUnconfirmed}
            disabled={bulkWorking}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#084734] px-3 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            미확인 {selectedUnconfirmedIds.length}건 확인
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggleAssignOpen}
          disabled={bulkWorking}
          aria-expanded={bulkAssignOpen}
          aria-controls="bulk-lead-assignment"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#111110] transition-colors hover:border-[#c8c8c4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Users className="h-3.5 w-3.5" />
          담당자 지정
        </button>
        <button
          type="button"
          onClick={onCloseSelected}
          disabled={bulkWorking}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#c8c8c4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-50"
        >
          종료 처리
        </button>
        <button
          type="button"
          onClick={onDeleteSelected}
          disabled={selectedDeleting || bulkWorking}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#B85C33] px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#9A4A27] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {selectedDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          선택 삭제
        </button>
      </div>
      {bulkAssignOpen ? (
        <div
          id="bulk-lead-assignment"
          className="grid gap-3 border-t border-[#F6D5C5]/60 pt-3 lg:grid-cols-[minmax(220px,360px)_auto_1fr] lg:items-end"
        >
          <label className="grid gap-1.5 text-[12px] font-semibold text-[#111110]">
            배정할 담당자
            <select
              value={bulkOwnerKey}
              onChange={(event) => onOwnerKeyChange(event.target.value)}
              disabled={bulkWorking || crmOwnerHealth?.ok !== true || crmOwners.length === 0}
              className="h-11 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] focus:border-[#084734] focus:outline-none focus:ring-2 focus:ring-[#084734]/15 disabled:cursor-not-allowed disabled:bg-[#F6F5F4]"
            >
              <option value="">담당자를 선택하세요</option>
              {crmOwners.map((owner) => (
                <option key={owner.ownerKey} value={owner.ownerKey}>
                  {owner.displayName} · {owner.teamRoleLabel}{owner.branchName ? ` · ${owner.branchName}` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAssign}
              disabled={bulkWorking || assignmentPreviewLoading || !bulkOwnerKey || !assignmentApplyReady}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-[#084734] px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {bulkWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              {selectedFilteredCount}건 배정
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirm(`선택한 ${selectedFilteredCount}건의 담당자 배정을 해제할까요?`)) return
                onUnassign()
              }}
              disabled={bulkWorking}
              className="min-h-11 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-medium text-[#1a1a1a]/60 hover:border-[#c8c8c4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25 disabled:cursor-not-allowed disabled:opacity-45"
            >
              배정 해제
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-[#1a1a1a]/50 lg:pb-3">
            {crmOwnerHealth?.ok === false
              ? crmOwnerHealth.message ?? "담당자 정본 명단 상태를 확인해 주세요."
              : crmOwners.length > 0
              ? `활성 CRM 담당자 ${crmOwners.length}명 중 선택합니다. 한 번의 서버 요청으로 적용됩니다.`
              : crmOwnerHealth?.message ?? "CRM 담당자 명단을 불러오는 중입니다."}
          </p>
          <div className="grid grid-cols-2 gap-2 lg:col-span-3 lg:grid-cols-4" aria-busy={assignmentPreviewLoading}>
            {[
              ["자동 근거 있음", assignmentPreview?.automaticEvidenceReady ?? 0, "현재 권위 있는 owner 연결 없음"],
              ["검토 후 지정 가능", assignmentPreview?.manualReviewReady ?? 0, "확인·최근성·중복 조건 통과"],
              ["확인 필요", assignmentPreview?.blockerCounts.unconfirmed ?? 0, "확인 전에는 배정 차단"],
              ["기타 차단", assignmentPreviewOtherBlockers, "테스트·부분 중복·30일+ 등"],
            ].map(([label, value, hint]) => (
              <div key={String(label)} className="rounded-xl border border-black/[0.08] bg-white px-3 py-2.5">
                <p className="text-[10px] font-semibold text-[#1a1a1a]/45">{label}</p>
                <p className="mt-1 text-[20px] font-semibold tabular-nums text-[#111110]">
                  {assignmentPreviewLoading ? "…" : value}
                </p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-[#1a1a1a]/40">{hint}</p>
              </div>
            ))}
          </div>
          {assignmentPreviewError ? (
            <p role="alert" className="rounded-lg border border-[#F6D5C5] bg-white px-3 py-2 text-[11px] text-[#B85C33] lg:col-span-3">
              {assignmentPreviewError}
            </p>
          ) : null}
          {assignmentPreview && assignmentPreview.blockedLeadIds.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#F6D5C5] bg-white px-3 py-2 lg:col-span-3">
              <p className="text-[11px] leading-relaxed text-[#8A4529]">
                선택 중 {assignmentPreview.blockedLeadIds.length}건은 안전 조건을 통과하지 못해 전체 배정이 차단됩니다.
              </p>
              <button
                type="button"
                onClick={() => onSelectSafeTargets(assignmentPreview.safeLeadIds)}
                disabled={assignmentPreview.safeLeadIds.length === 0 || bulkWorking}
                className="min-h-9 rounded-lg border border-[#F6D5C5] bg-[#FFF9F5] px-3 text-[11px] font-semibold text-[#8A4529] disabled:cursor-not-allowed disabled:opacity-45"
              >
                안전 대상 {assignmentPreview.safeLeadIds.length}건만 선택
              </button>
            </div>
          ) : assignmentPreview && assignmentApplyReady ? (
            <p role="status" className="rounded-lg border border-[#DDEBE5] bg-[#F7FBF9] px-3 py-2 text-[11px] text-[#084734] lg:col-span-3">
              선택한 {assignmentPreview.manualReviewReady}건이 수동 검토 배정 조건을 통과했습니다. 적용 직전에 서버가 다시 검증합니다.
            </p>
          ) : null}
          {selectedAssignmentProfile ? (
            <div
              role={selectedAssignmentProfile.duplicateClusters > 0 ? "alert" : "status"}
              className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed lg:col-span-3 ${
                selectedAssignmentProfile.duplicateClusters > 0
                  ? "border-[#F6D5C5] bg-[#FFF9F5] text-[#8A4529]"
                  : "border-[#DDEBE5] bg-[#F7FBF9] text-[#084734]"
              }`}
            >
              <span className="font-semibold">배정 전 선택 구성</span>
              <span className="ml-1.5">{formatLeadAssignmentProfile(selectedAssignmentProfile)}</span>
              {selectedAssignmentProfile.duplicateClusters > 0 ? (
                <span className="ml-1.5 font-medium">선택 밖 중복 상대까지 서버가 다시 확인합니다.</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
