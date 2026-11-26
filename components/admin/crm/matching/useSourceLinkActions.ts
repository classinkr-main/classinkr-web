"use client"

// 소스 링크 확정·제외·되돌리기 공용 훅 — 매칭 인박스와 매출시트(rev-sheet)가 함께 쓴다.
//
// - 행별 Set 잠금(감사 2B.4): 스칼라 하나로 잡으면 B행을 누르는 순간 A행 버튼이 요청 중인데도
//   다시 활성화돼 같은 링크에 PATCH가 두 번 나갈 수 있다.
// - 낙관적 반영: 누르는 즉시 행 상태를 바꾸고, 서버가 거절한 id만 요청 전 값으로 되돌린다.
// - 되돌리기: 성공한 확정·제외는 SOURCE_LINK_UNDO_WINDOW_MS 동안 "되돌리기"를 띄운다(→ 재검수).
// 서버 경로는 기존 그대로(PATCH /api/admin/crm/source-links/[id]·/bulk) — 권한은 서버가 다시 검사한다.

import { useCallback, useEffect, useRef, useState } from "react"

import { adminFetchJson } from "@/lib/admin-client"
import type { CrmSourceLinkStatus } from "@/lib/admin-crm-revenue-types"
import {
  SOURCE_LINK_UNDO_WINDOW_MS,
  applyOptimisticLinkPatch,
  describeBulkSourceLinkResult,
  describeBulkSourceLinkUndo,
  describeSingleSourceLinkResult,
  restoreLinkRows,
  runBulkSourceLinkAction,
  runSingleSourceLinkAction,
  undoActionFor,
  type BulkSourceLinkRun,
  type SingleSourceLinkRun,
  type SourceLinkAction,
  type SourceLinkFetchJson,
} from "@/lib/crm/source-link-actions"

interface LinkRow {
  linkId: string | null
  linkStatus: CrmSourceLinkStatus | null
}

export interface SourceLinkUndoState {
  ids: string[]
  action: SourceLinkAction
  message: string
}

export interface UseSourceLinkActionsOptions<T extends LinkRow> {
  /** 호스트 화면의 행 배열을 함수형으로 갱신한다(낙관적 반영·복원에 쓴다). */
  updateRows: (updater: (rows: T[]) => T[]) => void
  /** 한 행에 새 링크 상태를 입힌다 — 화면마다 따라 바뀌는 필드(confirmedAt 등)가 다르다. */
  patchRow: (row: T, status: CrmSourceLinkStatus) => T
  /** 성공 뒤 서버 집계(요약 타일·커버리지)를 다시 읽는다. */
  refresh?: () => Promise<void> | void
  /** 낙관적 반영 직후 — 선택 해제 등. */
  onApplied?: (ids: string[]) => void
  /** 실패·결과 문구에 쓸 행 이름. */
  labelOf?: (linkId: string) => string | undefined
}

export function useSourceLinkActions<T extends LinkRow>(options: UseSourceLinkActionsOptions<T>) {
  const [pendingLinkIds, setPendingLinkIds] = useState<Set<string>>(() => new Set())
  const [bulkPending, setBulkPending] = useState(false)
  const [undo, setUndo] = useState<SourceLinkUndoState | null>(null)

  // 콜백은 매 렌더 새로 오므로 ref로 최신값을 읽는다(반환 함수의 정체성을 고정해 effect 루프를 막는다).
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })
  // 진행 중 id — state 업데이트 타이밍과 무관하게 같은 tick의 이중 클릭을 막는다.
  const inFlightRef = useRef<Set<string>>(new Set())
  const undoTimerRef = useRef<number | null>(null)

  const clearUndoTimer = useCallback(() => {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }
  }, [])

  useEffect(() => clearUndoTimer, [clearUndoTimer])

  const dismissUndo = useCallback(() => {
    clearUndoTimer()
    setUndo(null)
  }, [clearUndoTimer])

  const offerUndo = useCallback(
    (ids: string[], action: SourceLinkAction, message: string) => {
      clearUndoTimer()
      if (ids.length === 0 || undoActionFor(action) === null) {
        setUndo(null)
        return
      }
      setUndo({ ids, action, message })
      undoTimerRef.current = window.setTimeout(() => {
        undoTimerRef.current = null
        setUndo(null)
      }, SOURCE_LINK_UNDO_WINDOW_MS)
    },
    [clearUndoTimer]
  )

  const lock = useCallback((ids: string[]) => {
    for (const id of ids) inFlightRef.current.add(id)
    setPendingLinkIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      return next
    })
  }, [])

  const unlock = useCallback((ids: string[]) => {
    for (const id of ids) inFlightRef.current.delete(id)
    setPendingLinkIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
  }, [])

  /** 낙관적 반영·복원 핸들러 한 쌍 — 스냅샷은 이 요청 한 번에만 묶인다. */
  const createHandlers = useCallback(() => {
    let snapshot = new Map<string, T>()
    return {
      apply: (ids: string[], status: CrmSourceLinkStatus) => {
        const { updateRows, patchRow, onApplied } = optionsRef.current
        updateRows((rows) => {
          const patched = applyOptimisticLinkPatch(rows, ids, (row) => patchRow(row, status))
          // StrictMode에서 updater가 두 번 돌아도 같은 입력이라 같은 스냅샷이다. 이미 잡은 값은 지키지 않고 덮는다.
          snapshot = patched.previous
          return patched.rows
        })
        onApplied?.(ids)
      },
      rollback: (ids: string[]) => {
        optionsRef.current.updateRows((rows) => restoreLinkRows(rows, snapshot, ids))
      },
    }
  }, [])

  const updateSourceLink = useCallback(
    async (linkId: string, action: SourceLinkAction): Promise<SingleSourceLinkRun | null> => {
      if (inFlightRef.current.has(linkId)) return null
      lock([linkId])
      try {
        const run = await runSingleSourceLinkAction(
          adminFetchJson as SourceLinkFetchJson,
          linkId,
          action,
          createHandlers()
        )
        if (run.ok) {
          const label = optionsRef.current.labelOf?.(linkId)
          offerUndo([linkId], action, describeSingleSourceLinkResult(action, label))
          await optionsRef.current.refresh?.()
        }
        return run
      } finally {
        unlock([linkId])
      }
    },
    [createHandlers, lock, offerUndo, unlock]
  )

  const bulkUpdate = useCallback(
    async (ids: string[], action: SourceLinkAction): Promise<(BulkSourceLinkRun & { message?: string }) | null> => {
      const free = ids.filter((id) => !inFlightRef.current.has(id))
      if (free.length === 0) return null
      lock(free)
      setBulkPending(true)
      try {
        const run = await runBulkSourceLinkAction(adminFetchJson as SourceLinkFetchJson, free, action, createHandlers())
        if (!run.ok) return run
        const message = describeBulkSourceLinkResult(action, run.result, optionsRef.current.labelOf)
        offerUndo(run.succeededIds, action, describeBulkSourceLinkUndo(action, run.succeededIds.length))
        await optionsRef.current.refresh?.()
        return { ...run, message }
      } finally {
        setBulkPending(false)
        unlock(free)
      }
    },
    [createHandlers, lock, offerUndo, unlock]
  )

  /** 직전 확정·제외를 재검수로 되돌린다 — 되돌리기 자체는 다시 되돌리기를 띄우지 않는다. */
  const undoLast = useCallback(async (): Promise<SingleSourceLinkRun | BulkSourceLinkRun | null> => {
    const current = undo
    if (!current) return null
    const reverse = undoActionFor(current.action)
    dismissUndo()
    if (!reverse) return null
    const free = current.ids.filter((id) => !inFlightRef.current.has(id))
    if (free.length === 0) return null
    lock(free)
    try {
      const handlers = createHandlers()
      const run =
        free.length === 1
          ? await runSingleSourceLinkAction(adminFetchJson as SourceLinkFetchJson, free[0], reverse, handlers)
          : await runBulkSourceLinkAction(adminFetchJson as SourceLinkFetchJson, free, reverse, handlers)
      if (run.ok) await optionsRef.current.refresh?.()
      return run
    } finally {
      unlock(free)
    }
  }, [createHandlers, dismissUndo, lock, undo, unlock])

  return { pendingLinkIds, bulkPending, updateSourceLink, bulkUpdate, undo, undoLast, dismissUndo }
}
