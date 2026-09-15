"use client"

import { memo, useCallback, useState } from "react"
import { ChevronDown, RotateCcw } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { formatDate, formatNumber } from "./shared"

// 감사(2026-09-07 #4): restore_hardware_sheet_import_snapshot RPC(20260701_hardware_restore_
// snapshot_guard.sql)가 있는데 UI/API 어디에도 연결돼 있지 않았다. 이 패널이 그 안전망을 노출한다.
// 비가역 동작이므로 기본 접힘 + 목록 조회는 언제든, 실제 복원은 hardware.finalize + 확인 모달
// + 서버 감사 로그(POST .../import-snapshots/[id]/restore) 3중 방어로 감싼다.
interface SnapshotSummary {
  id: string
  importRunId: string
  createdAt: string
  createdBy: string | null
  checksum: string
  previousMovementCount: number
  candidateMovementCount: number
}

interface SnapshotRestorePanelProps {
  // hardware.finalize 표시용 — 없으면 복원 버튼을 비활성한다(강제는 서버 게이트).
  canFinalize: boolean
  // 복원 성공 후 부모 대시보드를 다시 불러오는 콜백(HardwareInventoryClient의 refresh).
  onRestored: () => void | Promise<void>
}

function SnapshotRestorePanel({ canFinalize, onRestored }: SnapshotRestorePanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([])
  const [confirmTarget, setConfirmTarget] = useState<SnapshotSummary | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null)

  const loadSnapshots = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const result = await adminFetchJson<{ snapshots: SnapshotSummary[] }>("/api/admin/hardware/import-snapshots")
      setSnapshots(result.snapshots)
      setLoaded(true)
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const toggleExpanded = () => {
    setExpanded((current) => {
      const next = !current
      if (next && !loaded && !loading) void loadSnapshots()
      return next
    })
  }

  const confirmRestore = async () => {
    const target = confirmTarget
    if (!target || restoringId) return
    setRestoringId(target.id)
    setRestoreError(null)
    setRestoreNotice(null)
    try {
      const result = await adminFetchJson<{ restore: { restoredCount: number } }>(
        `/api/admin/hardware/import-snapshots/${target.id}/restore`,
        { method: "POST" }
      )
      setRestoreNotice(
        `${formatDate(target.createdAt)} 스냅샷으로 복원했습니다 — 시트 이관 원장 ${formatNumber(result.restore.restoredCount)}행.`
      )
      setConfirmTarget(null)
      setLoaded(false)
      await onRestored()
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : String(err))
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-5 py-3.5 text-left transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40"
      >
        <span>
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-[#111110]">
            <RotateCcw className="h-3.5 w-3.5 text-[#615D59]" />
            시트 이관 백업 · 되돌리기
          </span>
          <span className="mt-0.5 block text-[11px] text-[#615D59]">
            매 시트 이관 직전 자동 저장된 백업 — 잘못된 이관을 이전 상태로 되돌립니다. 되돌리기는 취소할 수 없습니다.
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#A39E98] transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="border-t border-[rgba(0,0,0,0.08)] px-5 py-4">
          {!canFinalize && (
            <p className="mb-3 rounded-md bg-[#F6F5F4] px-3 py-2 text-[11px] font-semibold text-[#615D59]">
              되돌리기는 확정 권한(hardware.finalize)이 있어야 실행할 수 있습니다. 목록 조회만 가능합니다.
            </p>
          )}
          {restoreNotice && (
            <p className="mb-3 rounded-md border border-[#BDEFD8] bg-[#ECFDF5] px-3 py-2 text-[12px] font-semibold text-[#084734]">
              {restoreNotice}
            </p>
          )}
          {restoreError && (
            <p className="mb-3 rounded-md border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[12px] font-semibold text-[#8F2C2C]">
              {restoreError}
            </p>
          )}
          {loading ? (
            <p className="text-[12px] text-[#615D59]">백업 목록을 불러오는 중…</p>
          ) : listError ? (
            <p className="text-[12px] font-semibold text-[#B43E3E]">{listError}</p>
          ) : snapshots.length === 0 ? (
            <p className="text-[12px] text-[#615D59]">저장된 백업이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-[rgba(0,0,0,0.06)]">
              {snapshots.map((snapshot) => (
                <li key={snapshot.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-bold text-[#111110]">
                      {formatDate(snapshot.createdAt)}
                      <span className="ml-1.5 font-mono text-[10.5px] font-semibold text-[#A39E98]">{snapshot.checksum.slice(0, 8)}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#615D59]">
                      되돌리면 시트 이관 {formatNumber(snapshot.previousMovementCount)}행으로 복원됩니다(현재 이 백업 시점의 이관분 {formatNumber(snapshot.candidateMovementCount)}행을 대체).
                      {snapshot.createdBy ? ` · ${snapshot.createdBy}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmTarget(snapshot)}
                    disabled={!canFinalize || restoringId != null}
                    title={!canFinalize ? "확정 권한(hardware.finalize)이 필요합니다" : undefined}
                    className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[#B43E3E] px-3 text-[11.5px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B43E3E]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    이 시점으로 되돌리기
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {confirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-3 py-4 backdrop-blur-[2px] sm:items-center"
          onClick={() => restoringId == null && setConfirmTarget(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="시트 이관 백업 되돌리기"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
          >
            <div className="border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
              <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">백업으로 되돌리기</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-[#615D59]">
                {formatDate(confirmTarget.createdAt)} 백업으로 되돌립니다. 지금의 시트 이관 원장(이 백업 이후 이관분)은
                사라지고 {formatNumber(confirmTarget.previousMovementCount)}행으로 대체됩니다. 수기 기록(admin_manual)은
                영향받지 않습니다. 되돌릴 수 없는 동작입니다.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                disabled={restoringId != null}
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-4 text-[13px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => void confirmRestore()}
                disabled={restoringId != null}
                className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-[#B43E3E] px-4 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#9A3434] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B43E3E]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {restoringId != null ? "되돌리는 중" : "되돌리기"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default memo(SnapshotRestorePanel)
