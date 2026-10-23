import "server-only"

// 매출 장부 "반영(apply)"의 유일한 진입점 — 시트 쓰기 스위치가 켜져 있으면 '2. REV' 에도 쓴다.
//
// 꺼짐(off): 지금과 똑같이 각 초안을 applyBranchSalesLedgerDraft 로 장부(DB)에만 반영한다.
// 켜짐(on), 한 번에 REV_WRITE_MAX_DRAFTS 건까지:
//   1) 초안 조회 — checked 가 아니면 409(시트·장부 모두 그대로)
//   2) new-row → 장부에만(new_row_app_only)
//   3) edit-row → 시트 다시 읽기(실패하면 아무것도 쓰지 않음) → 계획(planDraftWrites)
//   4) 거절 → 감사 행 refused · 409 · 초안 checked 그대로
//   5) 같은 딜·월에 이미 활성 정정이 있으면(장부 유일성 제약에 걸릴 것이 확실) 시트에 쓰기 전에 거절(active_correction)
//   6) 쓸 것·이미 쓰인 것·바꿀 것 없음 → 감사 행 sending 을 먼저 남긴다(못 남기면 쓰지 않는다)
//   7) batchUpdate 한 번(재시도 없음) — 4xx 면 failed, 5xx·마감·모름이면 unknown(다시 보내지 않음, 장부 그대로)
//   8) 되읽은 그리드로 확인 — 머리 구조가 바뀌었으면 되돌리지 않고 failed/row_shifted_unrestored, 행이 움직였으면 한 번
//      되돌리기 시도 후 failed/row_shifted(되돌림 확인) 또는 row_shifted_unrestored(못 되돌림), 값이 다르면 verify_mismatch
//   9) 확인된 것·이미 쓰인 것·바꿀 것 없음(no_change)만 장부에 반영 → written. 계획할 때 본 초안(updated_at)이 그대로일
//      때만 적는다(그사이 고쳐졌으면 draft_changed — 시트에 쓴 것과 다른 금액을 장부에 남기지 않는다). 장부 반영이 실패하면
//      written + db_apply_failed(다시 누르면 시트가 이미 의도한 값이라 already_written 경로로 마무리된다)
// 최악 시간: 읽기 8s + 쓰기 8s + 되돌리기 8s + DB — 라우트 maxDuration 60 안.
//
// 항목 오류는 던지지 않고 결과에 담는다(한 건의 실패가 나머지를 막지 않는다). 기존 라우트의 번역과 같은
// 상태·문구: 마이그레이션 미적용 503 · 활성 정정 중복 409 · 0 이하 금액 400 · 그 밖 500.

import { fyOf } from "@/lib/branch/fiscal"
import { getBusinessDateParts } from "@/lib/business-time"
import {
  applyBranchSalesLedgerDraft,
  applyBranchSalesLedgerDraftIfUnchanged,
  fetchBranchSalesLedgerDraftById,
  findActiveManualEditEntries,
  isBranchSalesLedgerDraftChangedError,
  isBranchSalesLedgerDraftsNotReadyError,
  isBranchSalesLedgerDuplicateActiveCorrectionError,
  isBranchSalesLedgerNonPositiveAmountError,
  type BranchSalesLedgerDraft,
} from "@/lib/repositories/branch-sales-ledger-drafts"
import {
  findLedgerEntryIdByDraftId,
  insertSheetWriteAttempts,
  isSheetWritesNotReadyError,
  updateSheetWriteAttempt,
  type SheetWriteAttemptInsert,
  type SheetWriteRecord,
  type SheetWriteStatus,
} from "@/lib/repositories/branch-sales-ledger-sheet-writes"

import { currentSheetWriteMode, REV_WRITE_MAX_DRAFTS, REV_WRITE_TARGET, type SheetWriteMode } from "./config"
import { SHEET_WRITE_MESSAGES, type SheetWriteCode } from "./messages"
import type { RevLayout } from "./layout"
import { planDraftWrites, type DraftForWrite, type DraftPlan, type LiveGrid, type WriteDraftPlan } from "./plan"
import { buildUpdateCellsRequests } from "./requests"
import { assertWriteTarget, batchUpdateAndReadBack, classifyGoogleError, readLiveGrid } from "./sheets-client"
import { restoreRequestsForShift, verifyWrites } from "./verify"

export interface ApplyItemResult {
  id: string
  ok: boolean
  status: number
  draft?: BranchSalesLedgerDraft
  error?: string
  sheet: { code: SheetWriteCode; message: string }
}

const NOT_CHECKED_MESSAGE = "체크 완료 초안만 적용할 수 있습니다."
const FALLBACK_APPLY_ERROR = "Failed to update sales ledger draft"
const TOO_MANY_MESSAGE = `한 번에 ${REV_WRITE_MAX_DRAFTS}건까지 시트에 반영할 수 있습니다 — 나눠서 다시 반영해 주세요.`
const AUDIT_FAILED_MESSAGE = "시트 쓰기 기록을 남기지 못해 반영하지 않았습니다 — 잠시 뒤 다시 반영해 주세요."
const ACTIVE_CORRECTION_CHECK_FAILED_MESSAGE = "장부 정정 확인에 실패해 반영하지 않았습니다 — 잠시 뒤 다시 반영해 주세요."
const LOG_LABEL = "[branch/sheet-writeback/apply]"

function sheet(code: SheetWriteCode) {
  return { code, message: SHEET_WRITE_MESSAGES[code] }
}

function errorText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 500)
  return String(e).slice(0, 500)
}

/** 기존 라우트(translateWriteError)와 같은 상태·문구. */
function translateApplyError(e: unknown): { status: number; error: string } {
  if (isBranchSalesLedgerDraftsNotReadyError(e)) return { status: 503, error: (e as Error).message }
  if (isBranchSalesLedgerDuplicateActiveCorrectionError(e)) return { status: 409, error: (e as Error).message }
  if (isBranchSalesLedgerNonPositiveAmountError(e)) return { status: 400, error: (e as Error).message }
  return { status: 500, error: FALLBACK_APPLY_ERROR }
}

async function applyAppOnly(id: string, actor: string, code: SheetWriteCode): Promise<ApplyItemResult> {
  try {
    const draft = await applyBranchSalesLedgerDraft(id, actor)
    if (!draft) return { id, ok: false, status: 409, error: NOT_CHECKED_MESSAGE, sheet: sheet(code === "disabled" ? code : "not_applied") }
    return { id, ok: true, status: 200, draft, sheet: sheet(code) }
  } catch (e) {
    console.error(LOG_LABEL, id, e)
    return { id, ok: false, ...translateApplyError(e), sheet: sheet(code === "disabled" ? code : "not_applied") }
  }
}

export async function applyLedgerDraftsWithSheetWrite(
  ids: string[],
  actor: string,
): Promise<{ mode: SheetWriteMode; results: ApplyItemResult[] }> {
  const mode = currentSheetWriteMode()
  if (mode === "off") {
    const results: ApplyItemResult[] = []
    for (const id of ids) results.push(await applyAppOnly(id, actor, "disabled"))
    return { mode, results }
  }
  return { mode, results: await applyWithSheetWrite(ids, actor) }
}

function toDraftForWrite(draft: BranchSalesLedgerDraft): DraftForWrite {
  return {
    id: draft.id,
    kind: draft.kind,
    month: draft.month,
    amount: draft.amount,
    currency: draft.currency,
    customer: draft.customer,
    sourceSnapshot: draft.sourceSnapshot ?? {},
    metadata: draft.metadata ?? {},
    updatedAt: draft.updatedAt,
  }
}

function attemptRow(
  draft: BranchSalesLedgerDraft,
  batchId: string,
  actor: string,
  status: SheetWriteStatus,
  code: SheetWriteCode,
  plan?: DraftPlan,
  error?: string | null,
): SheetWriteAttemptInsert {
  const located = plan && (plan.action === "write" || plan.action === "skip_write") ? plan : null
  return {
    draftId: draft.id,
    batchId,
    status,
    code,
    rowId: located?.rowId ?? null,
    sheetRow: located ? located.rowIndex + 1 : null,
    month: draft.month,
    cells: located?.cells ?? [],
    actor,
    error: error ?? null,
  }
}

/** 거절·실패 기록 — 표가 없으면 생략하고 경고만 남긴다(장부·시트는 이미 그대로라 응답을 바꾸지 않는다). */
async function recordBestEffort(rows: SheetWriteAttemptInsert[]): Promise<void> {
  if (rows.length === 0) return
  try {
    await insertSheetWriteAttempts(rows)
  } catch (e) {
    if (isSheetWritesNotReadyError(e)) console.warn(LOG_LABEL, "감사 표 없음 — 거절·실패 기록 생략", rows.length)
    else console.error(LOG_LABEL, "거절·실패 기록 실패", e)
  }
}

async function updateBestEffort(record: SheetWriteRecord | undefined, patch: Parameters<typeof updateSheetWriteAttempt>[1]) {
  if (!record) return
  try {
    await updateSheetWriteAttempt(record.id, patch)
  } catch (e) {
    console.error(LOG_LABEL, "감사 행 갱신 실패", record.id, e)
  }
}

type ProceedingPlan = Extract<DraftPlan, { action: "write" | "skip_write" | "noop" }>

/**
 * 같은 (딜, 월)에 활성 정정(manual-edit) 항목이 이미 있는 초안 — 장부 반영 RPC 가 유일성 인덱스(23505)로 실패할 것이
 * 확실하다. 자기 자신에게서 나온 항목은 세지 않는다. sourceDealId 가 없는 초안은 인덱스 대상이 아니다.
 */
async function draftsWithActiveCorrection(drafts: BranchSalesLedgerDraft[]): Promise<Set<string>> {
  const candidates = drafts.filter((draft) => Boolean(draft.sourceDealId))
  if (candidates.length === 0) return new Set()
  const entries = await findActiveManualEditEntries(
    candidates.map((draft) => ({ sourceDealId: draft.sourceDealId as string, month: draft.month })),
  )
  const blocked = new Set<string>()
  for (const draft of candidates) {
    const clash = entries.some(
      (entry) => entry.sourceDealId === draft.sourceDealId && entry.month === draft.month && entry.draftId !== draft.id,
    )
    if (clash) blocked.add(draft.id)
  }
  return blocked
}

/**
 * 쓰는 사이 행이 움직인 계획마다 되돌리기 한 번 — 계획마다 따로 판정해 되돌린 것("restored")과 못 되돌린 것
 * ("restore_not_found": 옮겨 온 행에 Row ID 가 없거나 원래 칸이 수식·글자, "restore_failed: …": 되돌리기 호출 실패)을
 * 나눈다. 되돌릴 수 있는 칸만 한 번의 batchUpdate 로 보낸다(재시도 없음).
 */
async function restoreShifted(
  before: LiveGrid,
  after: LiveGrid,
  shifted: WriteDraftPlan[],
  layout: RevLayout,
): Promise<Array<{ plan: WriteDraftPlan; note: string }>> {
  const perPlan = shifted.map((plan) => ({
    plan,
    requests: restoreRequestsForShift(before, after, [plan], REV_WRITE_TARGET.sheetId, layout),
  }))
  const restorable = perPlan.filter((item) => item.requests.length > 0)
  let failure: string | null = null
  if (restorable.length > 0) {
    try {
      await batchUpdateAndReadBack(
        REV_WRITE_TARGET.spreadsheetId,
        restorable.flatMap((item) => item.requests),
        layout,
        undefined,
        { allowClear: true },
      )
    } catch (e) {
      failure = `restore_failed: ${errorText(e)}`
    }
  }
  return perPlan.map(({ plan, requests }) => ({
    plan,
    note: requests.length === 0 ? "restore_not_found" : failure ?? "restored",
  }))
}

async function applyWithSheetWrite(ids: string[], actor: string): Promise<ApplyItemResult[]> {
  const unique = [...new Set(ids)]
  const inScope = unique.slice(0, REV_WRITE_MAX_DRAFTS)
  const results = new Map<string, ApplyItemResult>()
  for (const id of unique.slice(REV_WRITE_MAX_DRAFTS)) {
    results.set(id, { id, ok: false, status: 400, error: TOO_MANY_MESSAGE, sheet: sheet("not_applied") })
  }

  const editDrafts: BranchSalesLedgerDraft[] = []
  for (const id of inScope) {
    let draft: BranchSalesLedgerDraft | null
    try {
      draft = await fetchBranchSalesLedgerDraftById(id)
    } catch (e) {
      console.error(LOG_LABEL, id, e)
      results.set(id, { id, ok: false, ...translateApplyError(e), sheet: sheet("not_applied") })
      continue
    }
    if (!draft || draft.status !== "checked") {
      results.set(id, { id, ok: false, status: 409, error: NOT_CHECKED_MESSAGE, sheet: sheet("not_applied") })
      continue
    }
    if (draft.kind === "new-row") {
      results.set(id, await applyAppOnly(id, actor, "new_row_app_only"))
      continue
    }
    editDrafts.push(draft)
  }

  if (editDrafts.length > 0) {
    for (const result of await applyEditDrafts(editDrafts, actor)) results.set(result.id, result)
  }
  return ids.map((id) => results.get(id) as ApplyItemResult)
}

async function applyEditDrafts(drafts: BranchSalesLedgerDraft[], actor: string): Promise<ApplyItemResult[]> {
  const batchId = globalThis.crypto.randomUUID()
  const byId = new Map(drafts.map((draft) => [draft.id, draft]))
  const results = new Map<string, ApplyItemResult>()
  const failAll = async (code: SheetWriteCode, status: number, logError: unknown) => {
    await recordBestEffort(drafts.map((draft) => attemptRow(draft, batchId, actor, code === "not_allowed" ? "refused" : "failed", code, undefined, errorText(logError))))
    return drafts.map((draft): ApplyItemResult => ({ id: draft.id, ok: false, status, error: SHEET_WRITE_MESSAGES[code], sheet: sheet(code) }))
  }

  // 대상 확인 — 상수와 env 가 다르면 읽지도 쓰지도 않는다.
  try {
    assertWriteTarget(REV_WRITE_TARGET.spreadsheetId)
  } catch (e) {
    console.error(LOG_LABEL, "쓰기 대상 불일치 — GOOGLE_BRANCH_DASHBOARD_SHEET_ID 확인", e)
    return failAll("not_allowed", 409, e)
  }

  let live: LiveGrid
  try {
    live = await readLiveGrid(REV_WRITE_TARGET.spreadsheetId)
  } catch (e) {
    // 읽기만 실패했으므로 쓴 것은 없다 — "결과 모름"은 "호출 실패(바뀐 것 없음)"로 낮춘다.
    const code = classifyGoogleError(e) === "sheet_permission" ? "sheet_permission" : "sheet_error"
    console.error(LOG_LABEL, "시트 다시 읽기 실패", e)
    return failAll(code, 502, e)
  }

  const { plans, layout, layoutError } = planDraftWrites(live, drafts.map(toDraftForWrite), {
    today: getBusinessDateParts().date,
    refFy: fyOf(new Date()),
  })
  if (layoutError) console.error(LOG_LABEL, "시트 머리 구조 이상", layoutError)

  // 거절 — 기록은 최선, 응답은 409.
  const refused = plans.filter((plan): plan is Extract<DraftPlan, { action: "refuse" }> => plan.action === "refuse")
  await recordBestEffort(refused.map((plan) => attemptRow(byId.get(plan.draftId)!, batchId, actor, "refused", plan.code, plan)))
  for (const plan of refused) {
    results.set(plan.draftId, { id: plan.draftId, ok: false, status: 409, error: SHEET_WRITE_MESSAGES[plan.code], sheet: sheet(plan.code) })
  }

  let proceeding = plans.filter(
    (plan): plan is ProceedingPlan => plan.action === "write" || plan.action === "skip_write" || plan.action === "noop",
  )

  // 같은 딜·월에 활성 정정이 이미 있으면 장부 반영은 유일성 제약(딜·월당 활성 정정 1건)에 걸린다 — 시트를 먼저 쓰고
  // 장부에서 실패하면 시트만 바뀐 채 남으므로, 시트에 쓰기 전에 멈춘다. 확인 자체가 실패하면 쓰지 않는다(fail closed).
  if (proceeding.length > 0) {
    let blocked: Set<string>
    try {
      blocked = await draftsWithActiveCorrection(proceeding.map((plan) => byId.get(plan.draftId)!))
    } catch (e) {
      console.error(LOG_LABEL, "활성 정정 확인 실패 — 시트에 쓰지 않음", e)
      const translated = isBranchSalesLedgerDraftsNotReadyError(e)
        ? { status: 503, error: (e as Error).message }
        : { status: 500, error: ACTIVE_CORRECTION_CHECK_FAILED_MESSAGE }
      await recordBestEffort(proceeding.map((plan) => attemptRow(byId.get(plan.draftId)!, batchId, actor, "failed", "not_applied", plan, errorText(e))))
      for (const plan of proceeding) {
        results.set(plan.draftId, { id: plan.draftId, ok: false, ...translated, sheet: sheet("not_applied") })
      }
      return drafts.map((draft) => results.get(draft.id) as ApplyItemResult)
    }
    const stopped = proceeding.filter((plan) => blocked.has(plan.draftId))
    await recordBestEffort(stopped.map((plan) => attemptRow(byId.get(plan.draftId)!, batchId, actor, "refused", "active_correction", plan)))
    for (const plan of stopped) {
      results.set(plan.draftId, { id: plan.draftId, ok: false, status: 409, error: SHEET_WRITE_MESSAGES.active_correction, sheet: sheet("active_correction") })
    }
    proceeding = proceeding.filter((plan) => !blocked.has(plan.draftId))
  }

  // 시트에 쓰기 전에 감사 행부터 — 못 남기면 아무것도 쓰지 않는다.
  const attempts = new Map<string, SheetWriteRecord>()
  if (proceeding.length > 0) {
    try {
      const inserted = await insertSheetWriteAttempts(
        proceeding.map((plan) =>
          attemptRow(byId.get(plan.draftId)!, batchId, actor, "sending", plan.action === "write" ? "written" : plan.code, plan),
        ),
      )
      for (const record of inserted) attempts.set(record.draftId, record)
      if (proceeding.some((plan) => !attempts.has(plan.draftId))) throw new Error("감사 행 일부가 돌아오지 않았습니다")
    } catch (e) {
      console.error(LOG_LABEL, "감사 행 기록 실패 — 시트에 쓰지 않음", e)
      for (const plan of proceeding) {
        results.set(plan.draftId, { id: plan.draftId, ok: false, status: 500, error: AUDIT_FAILED_MESSAGE, sheet: sheet("not_applied") })
      }
      return drafts.map((draft) => results.get(draft.id) as ApplyItemResult)
    }
  }

  const toApply: Array<{ draftId: string; code: "written" | "already_written" | "no_change" }> = []
  for (const plan of proceeding) {
    if (plan.action === "skip_write") toApply.push({ draftId: plan.draftId, code: "already_written" })
    if (plan.action === "noop") toApply.push({ draftId: plan.draftId, code: plan.code })
  }

  const writePlans = proceeding.filter((plan): plan is WriteDraftPlan => plan.action === "write")
  if (writePlans.length > 0 && layout) {
    let after: LiveGrid | null = null
    try {
      const requests = buildUpdateCellsRequests(writePlans, REV_WRITE_TARGET.sheetId)
      after = await batchUpdateAndReadBack(REV_WRITE_TARGET.spreadsheetId, requests, layout)
    } catch (e) {
      const code: SheetWriteCode = e instanceof Error && e.message === "not_allowed" ? "not_allowed" : classifyGoogleError(e)
      console.error(LOG_LABEL, "시트 쓰기 실패", code, e)
      const status: SheetWriteStatus = code === "outcome_unknown" ? "unknown" : "failed"
      const httpStatus = code === "outcome_unknown" ? 202 : code === "sheet_error" ? 502 : 409
      for (const plan of writePlans) {
        await updateBestEffort(attempts.get(plan.draftId), { status, code, error: errorText(e) })
        results.set(plan.draftId, { id: plan.draftId, ok: false, status: httpStatus, error: SHEET_WRITE_MESSAGES[code], sheet: sheet(code) })
      }
    }

    if (after) {
      const verified = verifyWrites(after, writePlans, layout)
      const shifted: WriteDraftPlan[] = []
      for (const [index, outcome] of verified.entries()) {
        const plan = writePlans[index]
        if (outcome.ok) {
          toApply.push({ draftId: plan.draftId, code: "written" })
          continue
        }
        if (outcome.code === "row_shifted") {
          shifted.push(plan)
          continue
        }
        if (outcome.code === "layout_changed") {
          // 쓰는 사이 열이 끼거나 빠졌다 — 옛 열 번호로 쓴 칸은 다른 칸에 들어갔고, Row ID 열도 어긋나 되돌릴 행을 고를 수
          // 없다. 되돌리기를 시도하지 않는다(또 다른 칸을 덮는다) — 감사 행 cells 로 사람이 복구한다.
          console.error(LOG_LABEL, "쓰는 사이 시트 머리 구조가 바뀜 — 되돌리지 않음", plan.draftId)
          await updateBestEffort(attempts.get(plan.draftId), { status: "failed", code: "row_shifted_unrestored", error: "layout_changed" })
          results.set(plan.draftId, {
            id: plan.draftId,
            ok: false,
            status: 409,
            error: SHEET_WRITE_MESSAGES.row_shifted_unrestored,
            sheet: sheet("row_shifted_unrestored"),
          })
          continue
        }
        console.error(LOG_LABEL, "쓴 값 확인 불일치", plan.draftId)
        await updateBestEffort(attempts.get(plan.draftId), { status: "failed", code: "verify_mismatch" })
        results.set(plan.draftId, { id: plan.draftId, ok: false, status: 502, error: SHEET_WRITE_MESSAGES.verify_mismatch, sheet: sheet("verify_mismatch") })
      }

      if (shifted.length > 0) {
        for (const outcome of await restoreShifted(live, after, shifted, layout)) {
          const { plan, note } = outcome
          const code: SheetWriteCode = note === "restored" ? "row_shifted" : "row_shifted_unrestored"
          console.error(LOG_LABEL, "쓰는 사이 행이 움직임", plan.draftId, note)
          await updateBestEffort(attempts.get(plan.draftId), { status: "failed", code, error: note })
          results.set(plan.draftId, { id: plan.draftId, ok: false, status: 409, error: SHEET_WRITE_MESSAGES[code], sheet: sheet(code) })
        }
      }
    }
  } else if (writePlans.length > 0) {
    // layout 없이 write 계획이 나올 수 없다 — 방어선.
    for (const plan of writePlans) {
      await updateBestEffort(attempts.get(plan.draftId), { status: "failed", code: "layout_changed" })
      results.set(plan.draftId, { id: plan.draftId, ok: false, status: 409, error: SHEET_WRITE_MESSAGES.layout_changed, sheet: sheet("layout_changed") })
    }
  }

  // 시트가 의도한 값을 가진 것만 장부에 반영한다 — 계획할 때 본 초안 그대로일 때만(updated_at 비교, 한 트랜잭션).
  for (const { draftId, code } of toApply) {
    const attempt = attempts.get(draftId)
    const writtenAt = new Date().toISOString()
    try {
      const applied = await applyBranchSalesLedgerDraftIfUnchanged(draftId, actor, byId.get(draftId)!.updatedAt)
      if (!applied) {
        await updateBestEffort(attempt, { status: "written", code: "db_apply_failed", writtenAt, error: NOT_CHECKED_MESSAGE })
        results.set(draftId, { id: draftId, ok: false, status: 500, error: SHEET_WRITE_MESSAGES.db_apply_failed, sheet: sheet("db_apply_failed") })
        continue
      }
      let entryId: string | null = null
      try {
        entryId = await findLedgerEntryIdByDraftId(draftId)
      } catch (e) {
        console.warn(LOG_LABEL, "장부 항목 id 조회 실패(감사 행 entry_id 생략)", draftId, e)
      }
      await updateBestEffort(attempt, { status: "written", code, writtenAt, entryId })
      results.set(draftId, { id: draftId, ok: true, status: 200, draft: applied, sheet: sheet(code) })
    } catch (e) {
      if (isBranchSalesLedgerDraftChangedError(e)) {
        console.error(LOG_LABEL, "시트 쓰기 사이 초안이 바뀜 — 장부에 적지 않음", draftId)
        await updateBestEffort(attempt, { status: "written", code: "draft_changed", writtenAt, error: errorText(e) })
        results.set(draftId, { id: draftId, ok: false, status: 409, error: SHEET_WRITE_MESSAGES.draft_changed, sheet: sheet("draft_changed") })
        continue
      }
      console.error(LOG_LABEL, "시트 반영 뒤 장부 기록 실패", draftId, e)
      const translated = translateApplyError(e)
      await updateBestEffort(attempt, { status: "written", code: "db_apply_failed", writtenAt, error: errorText(e) })
      results.set(draftId, {
        id: draftId,
        ok: false,
        status: translated.status === 409 ? 409 : 500,
        error: translated.status === 409 ? translated.error : SHEET_WRITE_MESSAGES.db_apply_failed,
        sheet: sheet("db_apply_failed"),
      })
    }
  }

  return drafts.map((draft) => results.get(draft.id) as ApplyItemResult)
}
