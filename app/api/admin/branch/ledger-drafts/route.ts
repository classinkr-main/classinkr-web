import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { BRANCH_READ_ADMIN_API_ROLES, CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { isLedgerDraftBodyError, parseLedgerDraftCreateBody } from "@/lib/branch/ledger-draft-body"
import { currentSheetWriteMode } from "@/lib/branch/sheet-writeback/config"
import { isSheetWriteCode, SHEET_WRITE_MESSAGES } from "@/lib/branch/sheet-writeback/messages"
import {
  BRANCH_SALES_LEDGER_DRAFT_STATUSES,
  createBranchSalesLedgerDraft,
  isBranchSalesLedgerDraftsNotReadyError,
  LEDGER_LIST_MAX,
  listBranchSalesLedgerDrafts,
  listBranchSalesLedgerEntries,
  mergeRecentAndOpenDraftRows,
  type BranchSalesLedgerDraftStatus,
} from "@/lib/repositories/branch-sales-ledger-drafts"
import {
  isSheetWritesNotReadyError,
  lastSuccessfulRevSyncStartedAt,
  latestSheetWritesByDraftIds,
  type SheetWriteRecord,
} from "@/lib/repositories/branch-sales-ledger-sheet-writes"

const STATUSES = new Set<string>(BRANCH_SALES_LEDGER_DRAFT_STATUSES)

type SheetWriteView = Pick<SheetWriteRecord, "status" | "code" | "writtenAt" | "rowId"> & { message: string }

const SHEET_WRITE_UNKNOWN_CODE_MESSAGE = "시트 쓰기 상태를 알 수 없습니다 — 관리자 확인 필요"
const SHEET_WRITES_READ_FAILED_MESSAGE = "시트 쓰기 기록을 읽지 못했습니다 — 시트 반영 상태가 비어 보일 수 있습니다."
const REV_SYNC_READ_FAILED_MESSAGE = "마지막 REV 동기화 시각을 읽지 못했습니다."

/**
 * 감사 행 → 화면용 한 줄. "sending" 은 시트에 보내는 중이거나 보낸 뒤 결과를 못 적은 채 끝난 시도라
 * (감사 행의 code 는 계획한 결과 "written" 이 미리 들어가 있다) 문구를 "결과 모름"으로 보인다 — 반영됐다고
 * 말하지 않는다. code 는 저장된 값 그대로 둔다.
 */
function toSheetWriteView(record: SheetWriteRecord): SheetWriteView {
  const message =
    record.status === "sending"
      ? SHEET_WRITE_MESSAGES.outcome_unknown
      : isSheetWriteCode(record.code)
        ? SHEET_WRITE_MESSAGES[record.code]
        : SHEET_WRITE_UNKNOWN_CODE_MESSAGE
  return { status: record.status, code: record.code, message, writtenAt: record.writtenAt, rowId: record.rowId }
}

/**
 * 목록에 나온 초안 + 장부 항목의 초안 id 마다 가장 최근 시트 쓰기 시도. 감사 표가 아직 없으면(마이그레이션 전)
 * 시트에 쓴 적이 없으므로 빈 객체가 정상이다. 그 밖의 조회 실패는 장부 화면 전체를 막지 않고 빈 객체 +
 * health 로 알린다(시트 반영 표시만 비고, 반영 자체는 서버가 다시 읽어 판정한다).
 */
async function readSheetWrites(draftIds: string[]): Promise<{
  sheetWrites: Record<string, SheetWriteView>
  health: { ok: boolean; message: string | null }
}> {
  try {
    const latest = await latestSheetWritesByDraftIds(draftIds)
    const sheetWrites: Record<string, SheetWriteView> = {}
    for (const [draftId, record] of latest) sheetWrites[draftId] = toSheetWriteView(record)
    return { sheetWrites, health: { ok: true, message: null } }
  } catch (error) {
    if (isSheetWritesNotReadyError(error)) return { sheetWrites: {}, health: { ok: true, message: null } }
    console.error("[GET /api/admin/branch/ledger-drafts] sheet writes", error)
    return { sheetWrites: {}, health: { ok: false, message: SHEET_WRITES_READ_FAILED_MESSAGE } }
  }
}

async function readLastRevSyncStartedAt(): Promise<{ value: string | null; failed: boolean }> {
  try {
    return { value: await lastSuccessfulRevSyncStartedAt(), failed: false }
  } catch (error) {
    console.error("[GET /api/admin/branch/ledger-drafts] last rev sync", error)
    return { value: null, failed: true }
  }
}

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(Math.floor(parsed), max))
}

function notReadyResponse(error: unknown) {
  if (isBranchSalesLedgerDraftsNotReadyError(error)) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, BRANCH_READ_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const url = new URL(req.url)
    const statusParam = url.searchParams.get("status")
    const status: BranchSalesLedgerDraftStatus | "all" =
      statusParam && STATUSES.has(statusParam) ? (statusParam as BranchSalesLedgerDraftStatus) : "all"
    const limit = parseBoundedInt(url.searchParams.get("limit"), 50, 1, 200)
    // 되돌리기 부활 버그(P0) 수정: 이 GET은 entries에 active만 담아 내려주므로(레포지토리 기본
    // 필터), 상쇄(reversed)된 draft_id를 클라가 알 방법이 없었다 — reversedDraftIds는 클라
    // useState(new Set())라 새로고침/재마운트마다 비워지고, entries 목록에서도 사라진 항목은
    // "아직 동기화 안 된 신규 적용"으로 오인돼 되살아났다. reversed 항목을 별도(status:"reversed")로
    // 200 한도까지 조회해 draft_id 목록을 함께 내려준다 — active 조회와 합쳐서 하나의 200 한도로
    // 자르면 reversed가 밀려날 수 있어 반드시 별도 조회+별도 한도를 쓴다.
    //
    // 누락 방지: status=all 이어도 열린 초안(draft·checked)은 한도 안에서 전부 내려준다 — 최근 N건으로
    // 자르면 큰 붙여넣기 뒤 열린 초안이 목록에서 빠져 결재 바 건수·같은 칸 재편집(PATCH vs 새 초안) 판정이
    // 틀린다. limit 은 끝난 초안(applied·cancelled) 이력에만 건다. 장부 반영값(entries)도 최근 200건으로
    // 자르면 오래된 반영분이 합계에서 조용히 빠지므로 상한까지 받고, 상한에 닿으면 truncated 로 알린다.
    const [openDraftResult, closedDraftResult, entryResult, reversedEntryResult, lastRevSync] = await Promise.all([
      status === "all"
        ? listBranchSalesLedgerDrafts({ statuses: ["draft", "checked"], limit: LEDGER_LIST_MAX })
        : listBranchSalesLedgerDrafts({ status, limit }),
      status === "all"
        ? listBranchSalesLedgerDrafts({ statuses: ["applied", "cancelled"], limit })
        : null,
      listBranchSalesLedgerEntries({ limit: LEDGER_LIST_MAX }),
      listBranchSalesLedgerEntries({ status: "reversed", limit: LEDGER_LIST_MAX }),
      readLastRevSyncStartedAt(),
    ])
    const draftResult = closedDraftResult
      ? {
          generatedAt: openDraftResult.generatedAt,
          health: openDraftResult.health.ok ? closedDraftResult.health : openDraftResult.health,
          // 두 조회는 상태로 나뉘어 겹치지 않지만, 혹시 겹쳐도 같은 초안을 두 번 내려주지 않는다.
          drafts: mergeRecentAndOpenDraftRows(closedDraftResult.drafts, openDraftResult.drafts),
        }
      : openDraftResult

    const reversedDraftIds = Array.from(
      new Set(
        reversedEntryResult.entries
          .map((entry) => entry.draftId)
          .filter((draftId): draftId is string => Boolean(draftId)),
      ),
    )

    // REV 시트 쓰기(ADR-011) — 화면이 칸 아래 힌트·배지·이중 집계 제외(writtenAt < lastRevSyncStartedAt)에 쓴다.
    // 스위치가 꺼져 있어도 예전에 쓴 기록은 그대로 내려준다(되돌리기 가드·이중 집계 제외는 스위치와 무관).
    const { sheetWrites, health: sheetWritesHealth } = await readSheetWrites([
      ...draftResult.drafts.map((draft) => draft.id),
      ...entryResult.entries.map((entry) => entry.draftId).filter((draftId): draftId is string => Boolean(draftId)),
    ])
    const sheetWriteHealth = !sheetWritesHealth.ok
      ? sheetWritesHealth
      : lastRevSync.failed
        ? { ok: false, message: REV_SYNC_READ_FAILED_MESSAGE }
        : sheetWritesHealth

    return adminCachedJson({
      ...draftResult,
      entries: entryResult.entries,
      ledgerHealth: entryResult.health,
      reversedDraftIds,
      truncated: {
        openDrafts: status === "all" && openDraftResult.drafts.length >= LEDGER_LIST_MAX,
        entries: entryResult.entries.length >= LEDGER_LIST_MAX,
      },
      sheetWrite: {
        mode: currentSheetWriteMode(),
        lastRevSyncStartedAt: lastRevSync.value,
        health: sheetWriteHealth,
      },
      sheetWrites,
    })
  } catch (error) {
    console.error("[GET /api/admin/branch/ledger-drafts]", error)
    return NextResponse.json({ error: "Failed to load sales ledger drafts" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const actor = adminActorName(admin)

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const raw = body as Record<string, unknown>
    // 라운드4(P0-1) — 검증 순서·문구는 lib/branch/ledger-draft-body.ts로 옮겨졌고, 배치 라우트
    // (app/api/admin/branch/ledger-drafts/batch)도 같은 파서를 쓴다. 응답은 기존과 바이트 단위로
    // 동일하다(tests/api/branch-ledger-drafts-route.test.ts 회귀 보호).
    const parsed = parseLedgerDraftCreateBody(raw)
    if (isLedgerDraftBodyError(parsed)) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status })
    }

    const { draft, dedupedRecent } = await createBranchSalesLedgerDraft(parsed, actor)

    // dedupedRecent=true: 직전 60초 내 동일 입력의 열린 초안을 그대로 돌려준 것(더블클릭/더블탭
    // 방어, 웨이브7 I1) — 새 리소스를 만들지 않았으므로 201이 아니라 200으로 응답한다.
    return NextResponse.json({ draft, dedupedRecent }, { status: dedupedRecent ? 200 : 201 })
  } catch (error) {
    console.error("[POST /api/admin/branch/ledger-drafts]", error)
    return notReadyResponse(error) ?? NextResponse.json({ error: "Failed to create sales ledger draft" }, { status: 500 })
  }
}
