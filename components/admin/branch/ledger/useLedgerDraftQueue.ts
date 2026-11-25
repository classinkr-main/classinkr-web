"use client"

// SalesLedgerWorkbench에서 물리 이동(웨이브 7 2단 F5 — 기계적 분할, 로직 무변경): 서버 입력 큐
// (초안 CRUD·적용·되돌리기·로컬 폴백·레코드별 에러 격리·낙관적 잠금 I4) 훅과 그 전용 헬퍼/타입.
// 회귀 테스트(tests/branch/ledger-record-error-isolation·ledger-draft-optimistic-lock·
// ledger-entry-reverse-action)가 이 파일을 소스 스캔한다 — 함수 본문·의존성 배열 문자열이
// 마커로 쓰이므로 수정 시 해당 테스트도 함께 본다. 동작은 tests/branch/ledger-draft-queue-hook.test.ts 가
// 훅을 직접 돌려 본다.
//
// 2026-11-25 시트 고정 전 정비(체크 큐 신뢰성):
//  - 한 번의 실패로 큐 전체를 로컬로 내리지 않는다(F-06). 수정·체크·취소·삭제가 실패하면 그 초안에만 행 에러를 달고
//    서버 모드 그대로 둔다. 새 초안 저장 실패는 그 한 건만 로컬 임시 초안이 되고, 다음 저장은 다시 서버로 간다.
//    로컬 큐 모드는 "목록을 처음부터 못 읽었을 때"(또는 서버 큐 미준비)뿐이다.
//  - 같은 칸 저장이 겹치면 잇는다(F-05): 앞선 저장이 끝나면 그 초안을 PATCH 한다(새 초안 금지). 응답을 못 받은
//    저장은 목록을 다시 읽어 같은 칸의 대기 초안이 있으면 그것을 쓴다. 로컬 초안 재전송도 같은 칸 초안이 서버에 있으면
//    새로 만들지 않는다. 칸 "저장 중" 표시는 savingCellKeys.
//  - 반영 중인 초안은 다시 보내지 않는다(F-20) — applyingIds·applyBusy.
//  - 응답을 못 받은 반영은 목록을 다시 읽어 맞추고 "실패"로 단정하지 않는다. 영어 서버 문구는 한국어로(F-33).
//  - 시트 고정이 적용 중이면 행마다 다시 적용하라는 안내를 하지 않는다(sheetWrite.lock).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { adminFetch, adminFetchJson } from "../client-api"
import {
  DRAFT_CONFLICT_MESSAGE,
  type DraftKind,
  type DraftQueueMode,
  type DraftStatus,
  type LedgerDraft,
} from "./shared"
import {
  APPLY_NO_RESPONSE_MESSAGE,
  applyQueueNotice,
  isSheetLockActive,
  koreanRequestError,
  LEDGER_APPLY_CLIENT_TIMEOUT_MS,
  LEDGER_DRAFT_APPLY_LIMIT,
  parseSheetWrites,
  parseSheetWriteState,
  settleNoResponseOutcomes,
  SHEET_WRITE_HISTORY_DELETE_MESSAGE,
  SHEET_WRITE_STATE_OFF,
  toApplyOutcome,
  type ApplySheetOutcome,
  type SheetWriteState,
  type SheetWriteView,
} from "./sheet-write-view"

export interface LedgerEntry {
  id: string
  draftId?: string
  entryType: "manual-new" | "manual-edit"
  entryStatus: "active" | "reversed"
  sourceDealId?: string
  sourceSheetRow: number | null
  sourceSnapshot?: Record<string, unknown>
  customer: string
  manager: string
  team: string
  month: string
  amount: number
  currency?: string
  note: string
  appliedBy: string | null
  appliedAt: string
  // 웨이브 5 — "되돌리기": PATCH .../ledger-drafts/{id} action=reverse 응답에만 실려 온다.
  // GET 목록 엔드포인트는 entry_status=active만 반환하므로(레포지토리 기본 필터) 이 필드들은
  // 되돌리기 직후 로컬로 병합된 항목에서만 값을 가진다 — 서버 재조회 후엔 그 항목 자체가 사라진다.
  reversedAt?: string | null
  reversedBy?: string | null
  reversalReason?: string | null
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface LedgerDraftInput {
  kind: DraftKind
  sourceDealId?: string
  sourceSheetRow?: number | null
  sourceSnapshot?: Record<string, unknown>
  customer: string
  manager: string
  team: string
  month: string
  amount: number
  note: string
  metadata?: Record<string, unknown>
  // 라운드 4(P0-2 자가 체크) — 매트릭스 셀 커밋처럼 입력자=체크자인 저장 경로가 생성 즉시
  // "checked"로 올리고 싶을 때 싣는다. 생략하면 서버가 기존처럼 draft로 만든다(하위호환).
  // 로컬 폴백(makeLocalDraft)은 적용 불가라 이 값과 무관하게 항상 draft로 강제한다. 재전송 입력(localDraftToInput)은
  // 셀 커밋 초안(자가 체크)이면 다시 checked 를 싣는다(F-06 — 재전송에서 자가 체크가 사라지지 않게).
  status?: "draft" | "checked"
}

interface LedgerDraftsResponse {
  health?: { ok: boolean; message: string | null }
  ledgerHealth?: { ok: boolean; message: string | null }
  drafts?: LedgerDraft[]
  entries?: LedgerEntry[]
  // 되돌리기 부활 버그(P0) 수정 — entries는 active만 담기므로, 상쇄된 draft_id는 이 필드로
  // 별도 전달된다(app/api/admin/branch/ledger-drafts/route.ts GET). loadDrafts가 이를
  // reversedDraftIds 클라 상태의 서버 진실 소스로 시드한다.
  reversedDraftIds?: string[]
  // 목록 상한(서버 LEDGER_LIST_MAX)에 닿았는지 — 닿았으면 일부가 화면·합계에서 빠질 수 있어 경고한다.
  truncated?: { openDrafts?: boolean; entries?: boolean }
  // REV 시트 쓰기(ADR-011) — 스위치·마지막 REV 동기화 시각과 초안별 최신 시트 쓰기 시도. 신뢰 경계를 넘어온
  // 값이라 sheet-write-view 의 parse 함수로만 읽는다(모양이 틀리면 꺼짐·빈 객체).
  sheetWrite?: unknown
  sheetWrites?: unknown
  error?: string
}

// 단건 반영(PATCH .../ledger-drafts/{id} action=apply) 응답 — 성공 {draft, sheet}, 실패 {error, sheet} + status.
// 202 는 "시트 반영 여부 모름"(ok:false) — 장부는 반영되지 않았다.
interface LedgerApplyResponse {
  draft?: LedgerDraft
  sheet?: unknown
  error?: string
}

// 서버 목록이 상한에 닿았을 때의 경고 문구(없으면 null). 조용히 잘리면 합계가 틀려도 아무도 모른다.
export function ledgerTruncationNotice(truncated: LedgerDraftsResponse["truncated"]): string | null {
  const parts: string[] = []
  if (truncated?.openDrafts) parts.push("열린 초안이 1,000건을 넘어 일부만 보입니다 — 체크 큐에서 먼저 반영·취소하세요")
  if (truncated?.entries) parts.push("장부 반영값이 1,000건을 넘어 오래된 반영분이 합계에서 빠질 수 있습니다")
  return parts.length > 0 ? parts.join(" · ") : null
}

// 화면에 들고 있는 초안 목록 상한. 열린 초안(draft·checked)과 아직 서버에 못 올린 local-* 초안은 자르지 않고,
// 끝난 초안(applied·cancelled) 이력만 최근 closedLimit 건으로 자른다 — 열린 초안이 잘리면 결재 바 건수와
// 같은 칸 재편집(PATCH vs 새 초안) 판정에서 빠져 이중 계상·누락이 생긴다.
export function capLedgerDrafts(drafts: LedgerDraft[], closedLimit = 50): LedgerDraft[] {
  let closed = 0
  return drafts.filter((draft) => {
    if (draft.status === "draft" || draft.status === "checked" || draft.id.startsWith("local-")) return true
    closed += 1
    return closed <= closedLimit
  })
}

interface LedgerDraftResponse {
  draft?: LedgerDraft
  // POST 전용(웨이브 7 I1→I4 배선): 60초 내 동일 입력의 열린 초안을 재사용(200)했으면 true —
  // 새 리소스가 만들어진 게 아니므로 클라가 "직전 동일 초안 재사용됨"을 안내한다.
  dedupedRecent?: boolean
  error?: string
  // 라운드 4(P0-1) — 단건 PATCH(action=update)도 배치 API와 같은 409 변형을 돌려준다: 다른
  // 사용자가 이미 체크한 초안을 수정하려 한 경우, 일반 낙관적 잠금 충돌과 문구를 구분한다.
  reason?: "checked-by-other"
}

// 웨이브 7 2단(I4): createDraft/updateDraft 공통 반환 — draft만으로는 409 낙관적 잠금 충돌
// (레코드는 서버 현재본으로 새로고침됨)과 일반 실패를 구분할 수 없어 판별 플래그를 함께 싣는다.
export interface DraftMutationResult {
  draft: LedgerDraft | null
  /** updateDraft 전용: 409 충돌 — 이번 수정은 반영되지 않았고 해당 레코드는 서버 현재본으로 교체됨. */
  conflict?: boolean
  /** createDraft 전용: 서버가 60초 내 동일 입력의 열린 초안을 재사용(200)했음 — 새 초안 아님. */
  dedupedRecent?: boolean
  /** 서버 검증 거부(400) 문구 그대로 — 큐 강등·로컬 폴백 없이 호출부가 이 문구만 노출한다. */
  validationMessage?: string
  /** 라운드 4(P0-1) — persistDraftsBatch 전용: 서버가 응답은 했으나 이 항목만 실패했음
      (404 레코드 소실, 503/500 등). validationMessage(400 — 입력 자체가 거부됨)·
      conflict(409 — 낙관적 잠금 충돌)와 원인이 달라 별도 필드로 구분한다 — 로컬 폴백·큐 강등은
      하지 않는다(서버가 응답했으므로 재시도 여부는 호출부 몫). */
  error?: string
}

export interface LedgerEntryResponse {
  entry?: LedgerEntry
  error?: string
}

// 라운드 4(P0-1) — 서버 배치 API 요청/응답 계약(서버 에이전트와 공유, 계약 문서:
// docs/active/sales-ledger-input-speed-plan-2026-09-20.md §4 P0-1). 이 파일 밖에서 쓰이지
// 않으므로 export하지 않는다 — checkDrafts/applyDrafts(PATCH batch)·persistDraftsBatch(POST batch)만
// 이 shape을 소비한다. 다른 응답 타입들과 같은 관례(전 필드 optional + 런타임 status/ok 분기)로
// 느슨하게 받는다 — 서버 응답은 성공/실패 분기가 있는 판별 유니온이지만 신뢰 경계를 넘어오는
// 값이라 TS 유니온으로 좁히지 않고 런타임 분기로만 처리한다.
interface LedgerBatchWriteRequestItem {
  op: "create" | "update"
  id?: string
  input: LedgerDraftInput
  expectedUpdatedAt?: string
}

interface LedgerBatchWriteResult {
  index: number
  ok: boolean
  status: number
  draft?: LedgerDraft
  dedupedRecent?: boolean
  error?: string
  reason?: "checked-by-other"
}

interface LedgerBatchWriteResponse {
  results?: LedgerBatchWriteResult[]
  error?: string
}

interface LedgerBatchActionResult {
  id: string
  ok: boolean
  status: number
  draft?: LedgerDraft
  error?: string
  // action=apply 항목만 — 시트 쓰기 결과 코드 + 고정 문구(lib/branch/sheet-writeback/messages.ts).
  sheet?: unknown
}

interface LedgerBatchActionResponse {
  results?: LedgerBatchActionResult[]
  error?: string
}

// 서버 배치 엔드포인트(POST/PATCH .../ledger-drafts/batch)가 한 요청에서 받는 최대 건수. 매트릭스
// 붙여넣기·일괄 체크/적용이 이보다 많은 건을 모으면 이 크기로 나눠 순차 전송한다 — 청크 하나가
// 실패(네트워크/타임아웃)하면 이후 청크는 보내지 않는 계약을 persistDraftsBatch/checkDrafts/
// applyDrafts가 공유한다(부분 성공을 전체 성공으로 숨기지 않는다).
export const LEDGER_DRAFT_BATCH_LIMIT = 200

const DRAFT_STORAGE_KEY = "classin:sales-ledger-drafts:v1"

function isLedgerDraft(value: unknown): value is LedgerDraft {
  if (!value || typeof value !== "object") return false
  const draft = value as Partial<LedgerDraft>
  return typeof draft.id === "string" && typeof draft.customer === "string" && typeof draft.month === "string"
}

function readLocalDrafts(): LedgerDraft[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isLedgerDraft).filter((draft) => draft.id.startsWith("local-")) : []
  } catch {
    return []
  }
}

// 브라우저에는 아직 서버에 못 보낸 로컬 임시 초안(local-*)만 남긴다(F-06). 서버 초안 사본을 남기면 목록 조회가 실패했을 때
// 그 사본이 "로컬 큐"로 되살아나 서버 초안이 적용 불가로 보이고, 재연결 때 로컬 사본이 섞여 들어간다.
function writeLocalDrafts(drafts: LedgerDraft[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts.filter((draft) => draft.id.startsWith("local-"))))
  } catch {
    // 저장소가 막혔다(사생활 보호 창·용량) — 화면 상태는 그대로 두고 조용히 넘긴다.
  }
}

function makeLocalDraft(input: LedgerDraftInput): LedgerDraft {
  const now = new Date().toISOString()
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...input,
    currency: "CNY",
    status: "draft",
    createdAt: now,
    updatedAt: now,
  }
}

function applyDraftInput(draft: LedgerDraft, input: LedgerDraftInput): LedgerDraft {
  return {
    ...draft,
    ...input,
    currency: draft.currency ?? "CNY",
    updatedAt: new Date().toISOString(),
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

// 품질 웨이브 7 — 항목 2: updateDraft/toggleDraft/deleteDraft가 4xx(레코드 소실·충돌)와
// 5xx/네트워크를 구분하기 위한 판정. adminFetchJson(lib/admin-client.ts)은 실패한 fetch를
// `new Error(data?.error ?? data?.message ?? "{status} {statusText}")`로만 던지고 HTTP status를
// 던진 Error에 싣지 않는다 — 그 파일은 이 웨이브 소유 범위 밖이라 고치지 않고, 대신 이 라우트
// (app/api/admin/branch/ledger-drafts/[id]/route.ts, 코드로 직접 확인함)가 PATCH(update 액션)·
// DELETE 실패 시 레코드 소실을 항상 이 리터럴 문자열로만 응답하는 계약에 기대 구분한다. 이
// 라우트가 update/delete에서 돌려주는 4xx는 현재 404 "Draft not found" 하나뿐이다(409는
// action=apply 전용 — applyDraft가 이미 별도로 처리) — 다른 4xx 문구가 라우트에 추가되면
// 여기 추가한다. 매칭되지 않는 에러(네트워크 실패·타임아웃·5xx로 감싸진 서버 오류)는 그 초안의
// 행 에러(다시 시도 안내)로 남는다 — 큐 전체를 로컬로 내리지 않는다(F-06, 2026-11-25).
const DRAFT_RECORD_ERROR_MESSAGES = new Set(["Draft not found"])

export function isDraftRecordError(error: unknown): boolean {
  return error instanceof Error && DRAFT_RECORD_ERROR_MESSAGES.has(error.message)
}

// 레코드별 에러 배지(품질 웨이브 7, 항목 2)에 쓰는 사용자 대상 문구 — 위 판정이 잡아내는 케이스가
// 현재는 전부 "서버에 그 초안이 더 이상 없다"이므로 문구도 하나로 고정한다.
const DRAFT_RECORD_ERROR_MESSAGE =
  "서버에서 이 초안을 찾을 수 없습니다 — 다른 곳에서 이미 처리(적용/삭제)됐거나 목록이 바뀌었을 수 있습니다. 새로고침 후 다시 확인하세요."

/**
 * 줄 동작(수정·체크·취소·삭제)이 네트워크·서버 오류로 실패했을 때 그 행에 다는 문구(F-06) — 무엇을 못 했는지 + 한국어
 * 사유 + 다시 시도. action 은 "체크 상태를 바꾸지"처럼 "못했습니다" 앞에 오는 말.
 */
export function rowActionFailureMessage(action: string, error: unknown): string {
  return `${action} 못했습니다(${koreanRequestError(error)}) — 다시 시도하세요`
}

// ── 같은 칸 판정(F-05) ─────────────────────────────────────────────────────────
// 매트릭스·기관별 칸 커밋(origin "rev-matrix-cell")은 "칸 하나 = 대기 초안 하나"다. 칸 = 종류(수정·신규) + 딜(수정은
// 원천 딜 id, 신규는 고객명 — buildMatrixPendingByCell 과 같은 매칭) + 월 + 주차(w1..w5, 없으면 month).

function recordText(record: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = record?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** 셀 커밋(매트릭스·기관별 칸)에서 만든 초안인가 — metadata.origin 또는 sourceSnapshot.origin. */
export function isCellOriginDraft(draft: Pick<LedgerDraftInput, "metadata" | "sourceSnapshot">): boolean {
  return recordText(draft.metadata, "origin") === "rev-matrix-cell" || recordText(draft.sourceSnapshot, "origin") === "rev-matrix-cell"
}

/**
 * 칸 키 — 워크벤치가 칸(행·월·주차)마다 "저장 중"을 그릴 때도 같은 키를 만든다(savingCellKeys.has(ledgerCellKey(...))).
 * week 는 0~4 주차 인덱스 또는 "w1".."w5" 토큰, 없으면 월 칸. 딜(수정: sourceDealId, 신규: 고객명)이 비면 null.
 */
export function ledgerCellKey(parts: {
  kind: DraftKind
  sourceDealId?: string | null
  customer?: string | null
  month: string
  week?: number | string | null
}): string | null {
  const deal = (parts.kind === "edit-row" ? parts.sourceDealId : parts.customer)?.trim() ?? ""
  if (!deal || !parts.month) return null
  const week = typeof parts.week === "number"
    ? (parts.week >= 0 && parts.week <= 4 ? `w${parts.week + 1}` : "month")
    : (typeof parts.week === "string" && /^w[1-5]$/.test(parts.week) ? parts.week : "month")
  return `${parts.kind}|${parts.kind === "edit-row" ? "deal" : "customer"}:${deal}|${parts.month}|${week}`
}

type CellKeySource = Pick<LedgerDraftInput, "kind" | "sourceDealId" | "customer" | "month" | "metadata" | "sourceSnapshot">

/** 초안(입력)의 칸 키. 셀 커밋이 아니면(레일 폼 등) null — 겹친 저장을 잇지 않는다. */
export function draftCellKey(draft: CellKeySource): string | null {
  if (!isCellOriginDraft(draft)) return null
  return ledgerCellKey({
    kind: draft.kind,
    sourceDealId: draft.sourceDealId ?? recordText(draft.metadata, "sourceDealId"),
    customer: draft.customer,
    month: draft.month,
    week: recordText(draft.metadata, "week") ?? recordText(draft.sourceSnapshot, "week"),
  })
}

/** 서버 목록에서 그 칸의 대기(draft·checked) 서버 초안 — 응답을 못 받은 저장·로컬 재전송이 새 초안 대신 쓴다. */
export function findPendingCellDraft(drafts: readonly LedgerDraft[], key: string): LedgerDraft | null {
  return drafts.find((draft) =>
    (draft.status === "draft" || draft.status === "checked") && !draft.id.startsWith("local-") && draftCellKey(draft) === key,
  ) ?? null
}

// 로컬 fallback 초안(local-*)을 서버 재연결 시 POST 재전송하기 위한 입력 복원.
// LedgerDraft는 LedgerDraftInput의 상위집합이라 필드만 골라 뽑는다. 셀 커밋 초안은 자가 체크로 다시 연다(F-06) —
// 로컬 사본은 적용할 수 없어 draft 로 묶여 있었을 뿐 사용자는 이미 확인했다.
export function localDraftToInput(draft: LedgerDraft): LedgerDraftInput {
  const selfChecked = draft.status === "checked" || isCellOriginDraft(draft)
  return {
    kind: draft.kind,
    sourceDealId: draft.sourceDealId,
    sourceSheetRow: draft.sourceSheetRow,
    sourceSnapshot: draft.sourceSnapshot,
    customer: draft.customer,
    manager: draft.manager,
    team: draft.team,
    month: draft.month,
    amount: draft.amount,
    note: draft.note,
    metadata: draft.metadata,
    ...(selfChecked ? { status: "checked" as const } : {}),
  }
}

// id 로 합친다 — 앞 목록이 이긴다(재전송한 초안이 서버 목록의 같은 초안을 덮는다).
function mergeDraftsById(first: readonly LedgerDraft[], second: readonly LedgerDraft[]): LedgerDraft[] {
  const seen = new Set<string>()
  const out: LedgerDraft[] = []
  for (const draft of [...first, ...second]) {
    if (seen.has(draft.id)) continue
    seen.add(draft.id)
    out.push(draft)
  }
  return out
}

async function patchDraftRequest(id: string, input: LedgerDraftInput, expectedUpdatedAt: string): Promise<LedgerDraft> {
  const data = await adminFetchJson<LedgerDraftResponse>(`/api/admin/branch/ledger-drafts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ ...input, expectedUpdatedAt }),
  })
  if (!data.draft) throw new Error(data.error ?? "초안 수정 응답이 비어 있습니다.")
  return data.draft
}

/**
 * 로컬 임시 초안 하나를 서버로 다시 보낸다. 같은 칸의 대기 초안이 서버에 이미 있으면(응답을 못 받은 저장이 실제로는
 * 들어갔던 경우) 새로 만들지 않고 그 초안을 쓴다 — 금액이 같으면 그대로, 다르면 이 값으로 고친다(F-05).
 */
async function resendLocalDraft(draft: LedgerDraft, serverDrafts: readonly LedgerDraft[]): Promise<LedgerDraft> {
  const input = localDraftToInput(draft)
  const key = draftCellKey(input)
  const existing = key ? findPendingCellDraft(serverDrafts, key) : null
  if (existing) {
    if (existing.amount === input.amount) return existing
    return patchDraftRequest(existing.id, input, existing.updatedAt)
  }
  const data = await adminFetchJson<LedgerDraftResponse>("/api/admin/branch/ledger-drafts", {
    method: "POST",
    body: JSON.stringify(input),
  })
  if (!data.draft) throw new Error(data.error ?? "초안 저장 응답이 비어 있습니다.")
  return data.draft
}

// ── 겹친 요청 잇기·진행 중 표시(F-05·F-20) ─────────────────────────────────────
// 훅 콜백의 의존성 배열(테스트 마커)을 건드리지 않도록 ref·setState 를 인자로 받는 모듈 함수로 둔다.

type ChainTails = Map<string, Promise<string | null>>

/**
 * 같은 key 의 작업을 차례로 잇는다. 앞선 작업이 끝나면 그 결과 초안 id(priorId)를 넘겨 task 를 돌린다 — 겹친 같은 칸
 * 저장이 새 초안을 또 만들지 않고 앞선 초안을 고치게. key 가 없으면 바로 돌린다. 앞선 작업이 실패해도 다음은 돈다.
 */
async function runInChain<T>(
  tails: ChainTails,
  key: string | null,
  task: (priorId: string | null) => Promise<T>,
  draftIdOf: (value: T, priorId: string | null) => string | null,
): Promise<T> {
  if (!key) return task(null)
  const previous = tails.get(key)
  let prior: string | null = null
  const run = (previous ?? Promise.resolve(null)).then((priorId) => {
    prior = priorId
    return task(priorId)
  })
  const tail = run.then((value) => draftIdOf(value, prior), () => prior)
  tails.set(key, tail)
  try {
    return await run
  } finally {
    if (tails.get(key) === tail) tails.delete(key)
  }
}

type SetIdSet = (updater: (current: ReadonlySet<string>) => ReadonlySet<string>) => void

/** 칸별 진행 건수를 세고, 0↔1 로 바뀔 때만 savingCellKeys 를 고친다(같은 칸 저장이 겹쳐도 한 번). */
function bumpSaving(counts: Map<string, number>, setSaving: SetIdSet, key: string | null, delta: 1 | -1) {
  if (!key) return
  const next = (counts.get(key) ?? 0) + delta
  if (next <= 0) {
    counts.delete(key)
    setSaving((current) => {
      if (!current.has(key)) return current
      const out = new Set(current)
      out.delete(key)
      return out
    })
    return
  }
  counts.set(key, next)
  if (next === 1) {
    setSaving((current) => {
      if (current.has(key)) return current
      const out = new Set(current)
      out.add(key)
      return out
    })
  }
}

/** 아직 진행 중이 아닌 id 만 잡아 돌려준다(이미 잡힌 것은 빼고). */
function claimIds(held: { current: Set<string> }, setHeld: (next: ReadonlySet<string>) => void, ids: readonly string[]): string[] {
  const claimed = [...new Set(ids)].filter((id) => !held.current.has(id))
  if (claimed.length === 0) return claimed
  for (const id of claimed) held.current.add(id)
  setHeld(new Set(held.current))
  return claimed
}

function releaseIds(held: { current: Set<string> }, setHeld: (next: ReadonlySet<string>) => void, ids: readonly string[]) {
  if (ids.length === 0) return
  for (const id of ids) held.current.delete(id)
  setHeld(new Set(held.current))
}

/** 서버가 돌려준 초안을 목록 미러에 바로 반영한다 — 이어지는 PATCH 의 expectedUpdatedAt 이 렌더를 기다리지 않게(F-05). */
function rememberDraft(draftsRef: { current: LedgerDraft[] }, draft: LedgerDraft) {
  const index = draftsRef.current.findIndex((item) => item.id === draft.id)
  draftsRef.current = index >= 0
    ? draftsRef.current.map((item, itemIndex) => (itemIndex === index ? draft : item))
    : [draft, ...draftsRef.current]
}

/** loadDrafts 결과 — 서버 목록을 읽었는지, 읽은 목록(재전송 반영 뒤), 아직 못 보낸 로컬 초안 수. */
export interface LoadDraftsResult {
  loaded: boolean
  drafts: LedgerDraft[] | null
  unsynced: number
}

export function useLedgerDraftQueue() {
  const [drafts, setDrafts] = useState<LedgerDraft[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([])
  // 웨이브 5 — "되돌리기": 상쇄한 draft id를 세션 동안 별도 보존한다. GET 목록의 entries는
  // entry_status=active만 내려오므로(레포지토리 기본 필터) reversed 항목은 재조회 즉시
  // ledgerEntries에서 통째로 사라진다 — 그것만으로 판단하면 appliedDraftFallbackRows(applied
  // draft를 entries 누락 시 대체 표시하는 안전망)가 "아직 동기화 안 된 신규 적용"과 "방금
  // 상쇄된 적용"을 구분 못 해 되돌린 행을 재조회 후 유령처럼 되살린다. 이 Set이 그 구분자.
  const [reversedDraftIds, setReversedDraftIds] = useState<Set<string>>(new Set())
  const [ledgerHealth, setLedgerHealth] = useState<{ ok: boolean; message: string | null } | null>(null)
  // REV 시트 쓰기(ADR-011) — GET 의 sheetWrite(스위치·마지막 REV 동기화 시각·시트 고정)와 초안별 최신 시트 쓰기 시도.
  // 화면이 칸 아래 힌트·반영 확인 문구·큐 배지·이중 집계 제외(isSheetWriteAbsorbed)에 쓴다. 목록 조회가
  // 실패하면 직전 값을 그대로 둔다(빈 값을 정상처럼 덮지 않는다 — 판정은 반영 때 서버가 다시 한다).
  const [sheetWrite, setSheetWrite] = useState<SheetWriteState>(SHEET_WRITE_STATE_OFF)
  const [sheetWrites, setSheetWrites] = useState<Record<string, SheetWriteView>>({})
  // "local" 은 서버 목록을 처음부터 읽지 못했을 때(또는 서버 큐 미준비)뿐이다 — 줄 동작·저장 한 번의 실패로는 바뀌지 않는다(F-06).
  const [queueMode, setQueueMode] = useState<DraftQueueMode>("server")
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueError, setQueueError] = useState<string | null>(null)
  // 품질 웨이브 7 — 항목 2: 레코드별 에러(404 "레코드 소실" 등) — draft id → 사용자 대상 메시지.
  // 이 Set/Map은 queueMode를 절대 건드리지 않는다(전역 강등 없음) — 그 행에만 배지로 보여주고
  // 새로고침(loadDrafts)을 유도한다. loadDrafts가 서버 목록을 다시 받아오면 통째로 비운다 —
  // 재조회로 실제 상태가 다시 맞춰지므로 오래된 행별 에러를 계속 들고 있을 이유가 없다.
  const [recordErrors, setRecordErrors] = useState<Map<string, string>>(() => new Map())
  // F-05: 저장이 나가 있는 칸 키(ledgerCellKey) — 칸에 "저장 중"을 그린다.
  const [savingCellKeys, setSavingCellKeys] = useState<ReadonlySet<string>>(() => new Set())
  // F-20: 반영 요청이 나가 있는 초안 id — 결재 바·큐 일괄·줄 적용이 같은 초안을 겹쳐 보내지 않게 한 곳에서 잡는다.
  const [applyingIds, setApplyingIds] = useState<ReadonlySet<string>>(() => new Set())
  // 웨이브 7 2단(I4): 409 충돌 배지가 다른 문구(DRAFT_CONFLICT_MESSAGE)를 쓰므로 메시지를 옵션으로
  // 받는다 — 생략하면 기존 레코드 소실 문구 그대로(하위호환, 기존 호출부 무변경).
  const setRecordError = useCallback((id: string, message: string = DRAFT_RECORD_ERROR_MESSAGE) => {
    setRecordErrors((current) => {
      const next = new Map(current)
      next.set(id, message)
      return next
    })
  }, [])
  const clearRecordError = useCallback((id: string) => {
    setRecordErrors((current) => {
      if (!current.has(id)) return current
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }, [])
  // loadDrafts가 drafts state를 deps로 갖지 않아도(안정 identity 유지) 최신 local-* 초안을
  // 읽을 수 있게 미러링한다 — drafts가 바뀔 때마다 렌더 후 effect에서 갱신(렌더 중 ref 쓰기 금지).
  const localDraftsRef = useRef<LedgerDraft[]>([])
  // 웨이브 7 2단(I4): updateDraft가 deps에 drafts를 넣지 않고도(안정 identity 유지 — 매트릭스 셀
  // 커밋 경로에 물려 있어 identity 변동 비용이 큼) 호출 시점 레코드의 updatedAt(낙관적 잠금
  // expectedUpdatedAt 원천)을 읽을 수 있게 전체 목록도 함께 미러링한다. 서버 응답을 받으면 렌더 전에도 바로 고친다
  // (rememberDraft — 이어지는 같은 칸 PATCH 가 낡은 updatedAt 으로 가짜 충돌을 내지 않게).
  const draftsRef = useRef<LedgerDraft[]>([])
  useEffect(() => {
    localDraftsRef.current = drafts.filter((draft) => draft.id.startsWith("local-"))
    draftsRef.current = drafts
  }, [drafts])
  // 콜백이 의존성 없이 읽는 최신 값들(렌더 후 effect·비동기 콜백에서만 쓴다).
  const sheetWriteRef = useRef<SheetWriteState>(SHEET_WRITE_STATE_OFF)
  useEffect(() => {
    sheetWriteRef.current = sheetWrite
  }, [sheetWrite])
  const queueModeRef = useRef<DraftQueueMode>("server")
  // 서버 목록을 한 번이라도 읽었는가 — 읽은 뒤의 조회 실패는 목록을 지우거나 로컬로 내리지 않는다.
  const serverListLoadedRef = useRef(false)
  // 목록 조회는 한 번에 하나씩 — 겹치면 로컬 초안이 두 번 재전송된다.
  const loadChainRef = useRef<Promise<unknown>>(Promise.resolve())
  const createChainsRef = useRef<ChainTails>(new Map())
  const updateChainsRef = useRef<ChainTails>(new Map())
  const savingCountsRef = useRef<Map<string, number>>(new Map())
  const applyingIdsRef = useRef<Set<string>>(new Set())

  const updateLocalDrafts = useCallback((updater: (current: LedgerDraft[]) => LedgerDraft[]) => {
    setDrafts((current) => {
      const next = capLedgerDrafts(updater(current))
      writeLocalDrafts(next)
      return next
    })
  }, [])

  const loadDrafts = useCallback(async (options: { quiet?: boolean } = {}): Promise<LoadDraftsResult> => {
    const loadOnce = async (): Promise<LoadDraftsResult> => {
      setQueueLoading(true)
      try {
        const data = await adminFetchJson<LedgerDraftsResponse>("/api/admin/branch/ledger-drafts?status=all&limit=50", {
          cache: "no-cache",
        })
        // 되돌리기 부활 버그(P0) 수정 — reversedDraftIds는 세션 로컬 Set이라 마운트마다 비워진다.
        // 매 loadDrafts 호출(최초 마운트 포함, 위 useEffect 참조)마다 서버가 돌려준 reversedDraftIds로
        // 시드해 로컬 Set과 합집합한다 — 상쇄는 단방향(되돌린 걸 다시 무르는 기능 없음)이라 합집합이
        // 안전하고, 이걸로 appliedDraftFallbackRows가 재마운트 후에도 방금 상쇄된 draft를 계속 걸러낸다.
        if (data.reversedDraftIds && data.reversedDraftIds.length > 0) {
          const serverReversedDraftIds = data.reversedDraftIds
          setReversedDraftIds((current) => {
            const next = new Set(current)
            for (const draftId of serverReversedDraftIds) next.add(draftId)
            return next
          })
        }
        // 품질 웨이브 7 — 항목 2: 재조회 성공(서버가 응답함, health와 무관)마다 행별 에러를 비운다 —
        // 새 목록이 그 행의 실제 서버 상태를 다시 반영하므로 오래된 배지를 들고 있을 이유가 없다.
        setRecordErrors(new Map())
        setSheetWrite(parseSheetWriteState(data.sheetWrite))
        setSheetWrites(parseSheetWrites(data.sheetWrites))
        if (data.health?.ok === false) {
          const localOnly = readLocalDrafts()
          setDrafts(localOnly)
          setLedgerEntries([])
          setLedgerHealth(data.ledgerHealth ?? null)
          queueModeRef.current = "local"
          setQueueMode("local")
          setQueueError(data.health.message ?? "서버 입력 큐가 아직 준비되지 않았습니다.")
          return { loaded: false, drafts: null, unsynced: localOnly.length }
        }
        // 서버 복구: data.drafts로 무병합 덮어쓰면 오프라인 동안 쌓인 local-* 초안이 화면에서
        // 조용히 사라진다(무음 유실) — 덮어쓰기 전에 잔존 local-* 초안을 서버로 재전송한다.
        // 성공분은 서버 초안으로 교체, 실패분은 local- id 그대로 유지해 계속 보이게 하고 배지로 경고한다.
        // 재전송 대상은 화면의 로컬 초안 + 브라우저에 남은 로컬 초안(새로고침 전에 못 보낸 것 — 마운트 직후엔 화면이 비어 있다).
        // 같은 칸의 서버 초안이 이미 있으면 새로 만들지 않는다(resendLocalDraft, F-05).
        const serverDrafts = data.drafts ?? []
        const staleLocalDrafts = mergeDraftsById(localDraftsRef.current, readLocalDrafts())
        const handledLocalIds = new Set(staleLocalDrafts.map((draft) => draft.id))
        const resent: LedgerDraft[] = []
        const stillLocal: LedgerDraft[] = []
        if (staleLocalDrafts.length > 0) {
          const resendResults = await Promise.allSettled(staleLocalDrafts.map((draft) => resendLocalDraft(draft, serverDrafts)))
          resendResults.forEach((result, index) => {
            if (result.status === "fulfilled") resent.push(result.value)
            else stillLocal.push(staleLocalDrafts[index])
          })
        }
        writeLocalDrafts(stillLocal)
        localDraftsRef.current = stillLocal
        const loadedDrafts = capLedgerDrafts(mergeDraftsById([...resent, ...stillLocal], serverDrafts))
        draftsRef.current = loadedDrafts
        // 조회가 도는 사이 새로 생긴 로컬 초안(이번 재전송 대상이 아니었던 것)은 잃지 않는다.
        setDrafts((current) => capLedgerDrafts(mergeDraftsById(
          current.filter((draft) => draft.id.startsWith("local-") && !handledLocalIds.has(draft.id)),
          loadedDrafts,
        )))
        setQueueError(
          stillLocal.length > 0
            ? `로컬 초안 ${stillLocal.length}건을 서버로 재전송하지 못했습니다 — 재연결 후 다시 시도하세요.`
            : null,
        )
        setLedgerEntries(data.entries ?? [])
        setLedgerHealth(data.ledgerHealth ?? null)
        serverListLoadedRef.current = true
        queueModeRef.current = "server"
        setQueueMode("server")
        const truncatedNotice = ledgerTruncationNotice(data.truncated)
        if (truncatedNotice) setQueueError((current) => (current ? `${current} · ${truncatedNotice}` : truncatedNotice))
        return { loaded: true, drafts: loadedDrafts, unsynced: stillLocal.length }
      } catch (error) {
        // 이미 서버 목록을 들고 있으면(한 번이라도 읽었으면) 한 번의 조회 실패로 목록을 지우거나 로컬 큐로 내리지 않는다
        // (F-06) — 지금 목록을 그대로 두고 알리기만 한다. 처음부터 못 읽었을 때만 로컬 큐로 연다.
        if (serverListLoadedRef.current && queueModeRef.current === "server") {
          if (!options.quiet) setQueueError(`초안 목록을 다시 읽지 못했습니다 — 잠시 뒤 새로고침하세요 (${koreanRequestError(error)})`)
          return { loaded: false, drafts: null, unsynced: localDraftsRef.current.length }
        }
        const localOnly = readLocalDrafts()
        setDrafts(localOnly)
        setLedgerEntries([])
        setLedgerHealth(null)
        queueModeRef.current = "local"
        setQueueMode("local")
        setQueueError(`서버 입력 큐를 불러오지 못해 로컬 큐로 전환했습니다 — ${koreanRequestError(error)}`)
        setRecordErrors(new Map())
        return { loaded: false, drafts: null, unsynced: localOnly.length }
      } finally {
        setQueueLoading(false)
      }
    }
    const run = loadChainRef.current.then(loadOnce, loadOnce)
    loadChainRef.current = run.catch(() => undefined)
    return run
  }, [])

  useEffect(() => {
    void loadDrafts()
  }, [loadDrafts])

  // 웨이브 7 2단(I4) 낙관적 잠금 · F-06 · F-05. 로컬 임시 초안(local-*)은 이 브라우저에서만 고친다(서버에 없다 — 재연결 때
  // 고친 값으로 보낸다). 서버 초안은 큐 모드와 상관없이 늘 서버로 보낸다 — 서버-id 를 로컬에서 낙관 편집하면 재전송
  // 판별(local- 접두)에서 빠져 서버 복구 때 조용히 덮어써진다. 실패는 그 초안의 행 에러로 남기고 큐는 그대로 둔다:
  //  - 404(레코드 소실) → 레코드 오류 배지, 409 → 충돌 배지(서버 현재본으로 교체), 400 → 검증 문구(validationMessage),
  //  - 5xx·네트워크 → "고친 값을 저장하지 못했습니다(사유) — 다시 시도하세요"(error 로도 돌려준다 — 호출부가 로컬 폴백으로
  //    오인하지 않게).
  // 같은 초안의 PATCH 가 겹치면 차례로 보낸다(앞 PATCH 가 바꾼 updatedAt 으로 다음 PATCH 를 보내 가짜 충돌을 막는다).
  const updateDraft = useCallback(async (id: string, input: LedgerDraftInput): Promise<DraftMutationResult> => {
    if (!id.startsWith("local-")) {
      const cellKey = draftCellKey(input)
      bumpSaving(savingCountsRef.current, setSavingCellKeys, cellKey, 1)
      try {
        return await runInChain(updateChainsRef.current, id, async (): Promise<DraftMutationResult> => {
          try {
            // 낙관적 잠금(웨이브 7 2단, I4): 클라가 들고 있는 이 초안의 updatedAt을 expectedUpdatedAt으로
            // 동봉한다 — 서버(action=update)가 DB의 실제 updated_at과 CAS 비교해, 다른 곳에서 먼저
            // 수정됐으면 409 {error, draft(서버 현재본)}로 알려준다. drafts 미러는 서버 응답 원본을 보관하므로
            // (updatedAt은 레포지토리가 내려준 문자열 그대로) 그대로 되돌려 보내면 문자열이 정확히 일치한다.
            // 레코드가 아직 목록에 없으면(이론상) 잠금 없이 기존 무조건 덮어쓰기로 동작한다(서버 계약상
            // expectedUpdatedAt 생략 = 하위호환).
            const expectedUpdatedAt = draftsRef.current.find((draft) => draft.id === id)?.updatedAt
            const response = await adminFetch(`/api/admin/branch/ledger-drafts/${encodeURIComponent(id)}`, {
              method: "PATCH",
              body: JSON.stringify(expectedUpdatedAt ? { ...input, expectedUpdatedAt } : input),
            })
            const data = (await response.json().catch(() => null)) as LedgerDraftResponse | null
            if (response.status === 409 && data?.draft) {
              // 충돌 — 이번 수정은 반영되지 않았다. 로컬 낙관 반영 없이, 응답에 실려 온 서버 현재본으로
              // 해당 레코드만 새로고침하고 그 행에 충돌 배지를 붙인다(레코드 소실과 동일하게 전역 강등
              // 없음 — 큐의 다른 초안 작업은 계속 서버 모드로 진행된다).
              const serverDraft = data.draft
              rememberDraft(draftsRef, serverDraft)
              setDrafts((items) => items.map((draft) => (draft.id === id ? serverDraft : draft)))
              // 라운드 4(P0-1) — 다른 사용자가 이미 체크한 초안을 수정하려 한 경우 서버가 원인이 다른
              // 문구(reason)를 함께 내려준다. 일반 낙관적 잠금 충돌과 표시를 구분해 혼선을 줄인다.
              if (data.reason === "checked-by-other") {
                setRecordError(id, data.error ?? DRAFT_CONFLICT_MESSAGE)
              } else {
                setRecordError(id, DRAFT_CONFLICT_MESSAGE)
              }
              return { draft: null, conflict: true }
            }
            if (response.status === 400) {
              // 검증 거부(감액 양수 검증 등) — 서버 문구 그대로 호출부에 넘긴다. 큐 강등·로컬 폴백 없음.
              return { draft: null, validationMessage: data?.error ?? "저장 요청이 거부되었습니다." }
            }
            if (!response.ok) {
              // 404 등은 서버가 내려준 리터럴(예: "Draft not found")을 그대로 던져 아래 catch의
              // isDraftRecordError 판정(기존 계약)이 동작하게 한다.
              throw new Error(data?.error ?? (`${response.status} ${response.statusText}`.trim() || "요청에 실패했습니다."))
            }
            if (!data?.draft) throw new Error(data?.error ?? "초안 수정 응답이 비어 있습니다.")
            const nextDraft = data.draft
            rememberDraft(draftsRef, nextDraft)
            setDrafts((items) => items.map((draft) => (draft.id === id ? nextDraft : draft)))
            setQueueError(null)
            clearRecordError(id)
            return { draft: nextDraft }
          } catch (error) {
            if (isDraftRecordError(error)) {
              setRecordError(id)
              return { draft: null }
            }
            // 네트워크·서버 오류 — 이 초안에만 알리고 큐는 서버 모드 그대로(F-06). 다시 저장하면 다시 서버로 간다.
            const message = rowActionFailureMessage("고친 값을 저장하지", error)
            setRecordError(id, message)
            return { draft: null, error: message }
          }
        }, () => id)
      } finally {
        bumpSaving(savingCountsRef.current, setSavingCellKeys, cellKey, -1)
      }
    }

    let updated: LedgerDraft | null = null
    updateLocalDrafts((items) => items.map((draft) => {
      if (draft.id !== id) return draft
      updated = applyDraftInput(draft, input)
      return updated
    }))
    return { draft: updated }
  }, [clearRecordError, setRecordError, updateLocalDrafts])

  // 새 초안 — 늘 서버에 먼저 보낸다(로컬 큐 모드여도: 서버가 돌아왔으면 이 저장이 복구의 신호다, F-06).
  //  - 같은 칸의 저장이 아직 나가 있으면 기다렸다가 그 초안을 PATCH 한다(새 초안 금지, F-05).
  //  - 응답을 못 받았으면(네트워크·마감) 목록을 다시 읽어 같은 칸의 대기 초안이 있으면 그것을 쓴다 — 서버가 이미 만들었을 수 있다.
  //  - 서버가 실패를 응답했거나 같은 칸 초안이 없으면 그 한 건만 로컬 임시 초안으로 남긴다. 큐는 내리지 않는다.
  //  - 성공했는데 로컬 큐였거나 못 보낸 로컬 초안이 있으면 목록을 다시 읽는다(서버 모드 복귀 + 재전송).
  const createDraft = useCallback(async (input: LedgerDraftInput): Promise<DraftMutationResult> => {
    const cellKey = draftCellKey(input)
    bumpSaving(savingCountsRef.current, setSavingCellKeys, cellKey, 1)
    try {
      return await runInChain(createChainsRef.current, cellKey, async (priorId): Promise<DraftMutationResult> => {
        if (priorId) return updateDraft(priorId, input)
        let responded = false
        try {
          // 웨이브 7 2단(I4): adminFetchJson 대신 원 Response를 직접 읽는다 — 400(서버 검증 거부)을
          // 상태코드로 구분해 서버 문구를 그대로 노출하고, 성공 바디의 dedupedRecent(60초 내 동일
          // 입력 재사용, 201 아닌 200)도 함께 꺼내기 위해서다.
          const response = await adminFetch("/api/admin/branch/ledger-drafts", {
            method: "POST",
            body: JSON.stringify(input),
          })
          responded = true
          const data = (await response.json().catch(() => null)) as LedgerDraftResponse | null
          if (response.status === 400) {
            // 검증 거부(감액 양수 검증 등) — 서버 문구 그대로 호출부에 넘긴다. 유효하지 않은 입력을
            // 로컬 폴백 초안으로 만들어 두면 재전송 루프가 같은 400을 영원히 반복하므로 폴백하지
            // 않고, 큐 강등도 하지 않는다(서버는 정상 응답했다).
            return { draft: null, validationMessage: data?.error ?? "저장 요청이 거부되었습니다." }
          }
          if (!response.ok) {
            throw new Error(data?.error ?? (`${response.status} ${response.statusText}`.trim() || "요청에 실패했습니다."))
          }
          if (!data?.draft) throw new Error(data?.error ?? "초안 저장 응답이 비어 있습니다.")
          const nextDraft = data.draft
          rememberDraft(draftsRef, nextDraft)
          setDrafts((current) => capLedgerDrafts([nextDraft, ...current.filter((draft) => draft.id !== nextDraft.id)]))
          setQueueError(null)
          if (queueModeRef.current !== "server" || localDraftsRef.current.length > 0) void loadDrafts()
          return { draft: nextDraft, dedupedRecent: data.dedupedRecent === true }
        } catch (error) {
          if (!responded && cellKey) {
            const reloaded = await loadDrafts({ quiet: true })
            const match = reloaded.drafts ? findPendingCellDraft(reloaded.drafts, cellKey) : null
            if (match) return match.amount === input.amount ? { draft: match } : updateDraft(match.id, input)
          }
          // 이 한 건만 로컬 임시 초안 — 큐는 서버 모드 그대로 두고(F-06) 다음 저장은 다시 서버로 보낸다.
          const localDraft = makeLocalDraft(input)
          setQueueError(`서버 저장에 실패해 이 브라우저에 임시 저장했습니다 — 다시 보내기 전에는 장부에 적용할 수 없습니다. ${koreanRequestError(error)}`)
          updateLocalDrafts((current) => [localDraft, ...current])
          return { draft: localDraft }
        }
      }, (result, priorId) => result.draft?.id ?? priorId)
    } finally {
      bumpSaving(savingCountsRef.current, setSavingCellKeys, cellKey, -1)
    }
  }, [loadDrafts, updateDraft, updateLocalDrafts])

  // 아직 못 보낸 로컬 임시 초안을 지금 다시 보낸다(칸 편집기 "다시 시도" · 미전송 배너). 다 보냈으면 true.
  const retryUnsentDrafts = useCallback(async (): Promise<boolean> => {
    const result = await loadDrafts()
    return result.loaded && result.unsynced === 0
  }, [loadDrafts])

  const toggleDraft = useCallback(async (id: string) => {
    const current = drafts.find((draft) => draft.id === id)
    if (!current) return
    const status: DraftStatus = current.status === "checked" ? "draft" : "checked"

    if (!id.startsWith("local-")) {
      try {
        const data = await adminFetchJson<LedgerDraftResponse>(`/api/admin/branch/ledger-drafts/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        })
        if (!data.draft) throw new Error(data.error ?? "초안 수정 응답이 비어 있습니다.")
        const nextDraft = data.draft
        rememberDraft(draftsRef, nextDraft)
        setDrafts((items) => items.map((draft) => (draft.id === id ? nextDraft : draft)))
        clearRecordError(id)
        return
      } catch (error) {
        if (isDraftRecordError(error)) {
          setRecordError(id)
          return
        }
        // 네트워크·서버 오류 — 그 행에만 알리고 큐는 서버 모드 그대로(F-06). 다시 누르면 다시 보낸다.
        setRecordError(id, rowActionFailureMessage("체크 상태를 바꾸지", error))
        return
      }
    }

    updateLocalDrafts((items) => items.map((draft) =>
      draft.id === id ? { ...draft, status, updatedAt: new Date().toISOString() } : draft,
    ))
  }, [clearRecordError, drafts, setRecordError, updateLocalDrafts])

  // 단건 반영 — 반영 서비스(lib/branch/sheet-writeback/apply-service.ts)가 켜짐이면 '2. REV' 에도 쓴다.
  // adminFetchJson 대신 원 Response 를 읽는다: 202(시트 반영 여부 모름)는 2xx 지만 반영 실패이고, 실패 바디의
  // sheet(코드 + 고정 문구)를 사용자에게 그대로 보여야 하기 때문이다. 결과와 무관하게 다시 읽어 큐 배지
  // (sheetWrites)를 서버 기록으로 맞춘다. 반환값은 호출부가 결과를 말할 때 쓴다(큐 카드는 쓰지 않는다).
  // F-20: 이미 반영 요청이 나가 있는 초안이면 보내지 않고 null. F-33: 응답을 못 받으면 목록을 다시 읽어 적용완료가 됐는지
  // 맞추고, 아니면 "응답을 받지 못했습니다 — 새로고침해 확인"으로 말한다(실패로 단정하지 않는다).
  const applyDraft = useCallback(async (id: string): Promise<ApplySheetOutcome | null> => {
    const current = drafts.find((draft) => draft.id === id)
    if (!current || current.status !== "checked") return null
    if (queueMode !== "server" || id.startsWith("local-")) {
      setQueueError("로컬 임시 초안은 DB 장부에 적용할 수 없습니다. 서버 큐가 복구된 뒤 다시 저장/적용하세요.")
      return null
    }
    if (claimIds(applyingIdsRef, setApplyingIds, [id]).length === 0) return null
    const locked = isSheetLockActive(sheetWriteRef.current)

    try {
      const response = await adminFetch(`/api/admin/branch/ledger-drafts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "apply" }),
        adminTimeoutMs: LEDGER_APPLY_CLIENT_TIMEOUT_MS,
      })
      const data = (await response.json().catch(() => null)) as LedgerApplyResponse | null
      const outcome = toApplyOutcome(id, data, response.status)
      if (outcome.ok && data?.draft) {
        const nextDraft = data.draft
        setDrafts((items) => items.map((draft) => (draft.id === id ? nextDraft : draft)))
      }
      const reloaded = await loadDrafts()
      const [settled] = settleNoResponseOutcomes([outcome], reloaded.drafts)
      setQueueError(applyQueueNotice([settled], { single: true, locked }))
      return settled
    } catch {
      const reloaded = await loadDrafts({ quiet: true })
      const noResponse: ApplySheetOutcome = { id, ok: false, status: 0, code: null, message: null, error: APPLY_NO_RESPONSE_MESSAGE }
      const [settled] = settleNoResponseOutcomes([noResponse], reloaded.drafts)
      setQueueError(applyQueueNotice([settled], { single: true, locked }))
      return settled
    } finally {
      releaseIds(applyingIdsRef, setApplyingIds, [id])
    }
  }, [drafts, loadDrafts, queueMode])

  // 일괄 체크(2026-09-14 최초 구현 → 라운드 4 P0-1: 단건 PATCH 순차 전송을 배치 API로 교체).
  // 3단계(초안→체크→적용) 자체는 그대로다. 로컬 id는 기존 로컬 처리 그대로(서버에 실을 것이 없다) —
  // 서버 id만 모아 LEDGER_DRAFT_BATCH_LIMIT건씩 PATCH batch { action: "check", ids }로 순차 전송한다
  // (100건 기준 100왕복 → 1왕복). 실패 건은 행 에러로 남기고 나머지는 진행하는 기존 계약은 그대로 유지한다.
  const checkDrafts = useCallback(async (ids: string[]) => {
    let done = 0
    let failed = 0
    const serverIds: string[] = []
    for (const id of ids) {
      if (id.startsWith("local-")) {
        updateLocalDrafts((items) => items.map((draft) =>
          draft.id === id && draft.status === "draft" ? { ...draft, status: "checked", updatedAt: new Date().toISOString() } : draft,
        ))
        done += 1
        continue
      }
      serverIds.push(id)
    }

    for (let start = 0; start < serverIds.length; start += LEDGER_DRAFT_BATCH_LIMIT) {
      const chunk = serverIds.slice(start, start + LEDGER_DRAFT_BATCH_LIMIT)
      try {
        const data = await adminFetchJson<LedgerBatchActionResponse>("/api/admin/branch/ledger-drafts/batch", {
          method: "PATCH",
          body: JSON.stringify({ action: "check", ids: chunk }),
        })
        // chunk가 최대 200건이라 find의 O(n²)이 무시할 수준이다 — Map 빌드용 튜플 추론 모호성
        // ([id, result] 배열 리터럴이 tuple로 좁혀진다는 보장이 없다)을 피해 그냥 찾는다.
        for (const id of chunk) {
          const result = data.results?.find((entry) => entry.id === id)
          if (result?.ok && result.draft) {
            const next = result.draft
            rememberDraft(draftsRef, next)
            setDrafts((items) => items.map((draft) => (draft.id === id ? next : draft)))
            clearRecordError(id)
            done += 1
            continue
          }
          failed += 1
          if (result?.status === 404) setRecordError(id)
        }
      } catch {
        // 청크 요청 자체 실패(네트워크/타임아웃) — 큐를 강등하지 않는다(F-06). 이 청크 전부 실패로
        // 집계하고 이후 청크는 보내지 않는다(부분 성공을 전체 성공으로 숨기지 않는다).
        failed += chunk.length
        break
      }
    }

    setQueueError(failed > 0 ? `일괄 체크 중 ${failed}건이 실패했습니다 — 해당 행에서 다시 시도하세요.` : null)
    return { done, failed }
  }, [clearRecordError, setRecordError, updateLocalDrafts])

  // 일괄 적용(2026-09-14 최초 구현 → 라운드 4 P0-1: 배치 API로 교체) — 체크된 서버 초안만 모아
  // 적용하고 마지막에 한 번 다시 읽는다. 로컬 임시 초안은 DB 장부에 적용할 수 없으므로 건너뛴다
  // (단건 applyDraft와 같은 규칙).
  // REV 시트 쓰기(ADR-011): 한 요청은 LEDGER_DRAFT_APPLY_LIMIT(50)건 — 켜짐이면 서버가 그보다 많은 몫을 400 으로
  // 돌려준다. 항목별 sheet(코드 + 고정 문구)를 sheetResults 로 돌려줘 ApprovalBar 가 코드별 건수를 말한다.
  // 클라이언트 마감은 서버 maxDuration 보다 길게(LEDGER_APPLY_CLIENT_TIMEOUT_MS) — 먼저 끊으면 서버는 쓰는데
  // 화면은 실패로 센다.
  // F-20: 다른 곳에서 반영 요청이 나가 있는 초안은 빼고 보낸다(남는 것이 없으면 아무것도 하지 않는다).
  // F-33: 4xx(권한·요청 모양)는 서버가 받지 않은 것이라 사유와 함께 실패로, 5xx·네트워크·마감은 결과를 모르는 것이라
  // "응답 없음"으로 두고, 다시 읽은 목록에서 적용완료가 된 초안은 성공으로 센다.
  const applyDrafts = useCallback(async (ids: string[]) => {
    const sheetResults: ApplySheetOutcome[] = []
    if (queueMode !== "server") {
      setQueueError("로컬 임시 초안은 DB 장부에 적용할 수 없습니다. 서버 큐가 복구된 뒤 다시 적용하세요.")
      return { done: 0, failed: ids.length, sheetResults }
    }
    const serverIds = claimIds(applyingIdsRef, setApplyingIds, ids.filter((id) => !id.startsWith("local-")))
    if (serverIds.length === 0) return { done: 0, failed: 0, sheetResults }
    const locked = isSheetLockActive(sheetWriteRef.current)

    try {
      for (let start = 0; start < serverIds.length; start += LEDGER_DRAFT_APPLY_LIMIT) {
        const chunk = serverIds.slice(start, start + LEDGER_DRAFT_APPLY_LIMIT)
        let refusal: { status: number; error: string } | null = null
        try {
          const response = await adminFetch("/api/admin/branch/ledger-drafts/batch", {
            method: "PATCH",
            body: JSON.stringify({ action: "apply", ids: chunk }),
            adminTimeoutMs: LEDGER_APPLY_CLIENT_TIMEOUT_MS,
          })
          const data = (await response.json().catch(() => null)) as LedgerBatchActionResponse | null
          if (!response.ok || !data?.results) {
            if (response.status >= 400 && response.status < 500) {
              refusal = { status: response.status, error: koreanRequestError(data?.error ?? `${response.status} ${response.statusText}`) }
            }
            throw new Error(data?.error ?? `${response.status} ${response.statusText}`)
          }
          const results = data.results
          for (const id of chunk) {
            const result = results.find((entry) => entry.id === id)
            const outcome = toApplyOutcome(id, result)
            sheetResults.push(outcome)
            if (outcome.ok && result?.draft) {
              const next = result.draft
              setDrafts((items) => items.map((draft) => (draft.id === id ? next : draft)))
            }
          }
        } catch {
          // 청크 요청 자체 실패 — checkDrafts와 동일 계약(큐 강등 없음, 이후 청크 중단). 4xx 면 서버가 받지 않았으니 그
          // 사유로, 그 밖(5xx·네트워크·마감)은 서버가 썼는지 모르므로 코드 없이 응답 없음(상태 0)으로 남긴다 — 다시 읽은
          // 목록으로 맞춘다. 보내지 않은 나머지도 같은 결과로 센다(결과 줄 건수와 같게).
          const unsent = serverIds.slice(start)
          for (const id of unsent) {
            sheetResults.push(refusal
              ? { id, ok: false, status: refusal.status, code: null, message: null, error: refusal.error }
              : { id, ok: false, status: 0, code: null, message: null, error: APPLY_NO_RESPONSE_MESSAGE })
          }
          break
        }
      }
      const reloaded = await loadDrafts()
      const settled = settleNoResponseOutcomes(sheetResults, reloaded.drafts)
      const done = settled.filter((outcome) => outcome.ok).length
      setQueueError(applyQueueNotice(settled, { locked }))
      return { done, failed: settled.length - done, sheetResults: settled }
    } finally {
      releaseIds(applyingIdsRef, setApplyingIds, serverIds)
    }
  }, [loadDrafts, queueMode])

  // 품질 감사 2026-09-10 — #8: 이전엔 DraftQueue 어떤 동작도 초안을 "cancelled"로 전이시키지
  // 않았다(DB CHECK 제약엔 있는 상태인데 도달 경로가 없었음) — 취소는 삭제(하드 DELETE, 감사
  // 추적 없음)로만 가능했다. status=cancelled로의 PATCH는 백엔드가 이미 지원한다
  // (updateBranchSalesLedgerDraft가 "applied"만 막는다, DB CHECK도 cancelled를 유효 상태로 이미
  // 허용) — toggleDraft와 동일한 패턴으로 액션만 추가한다(로컬 폴백 포함).
  // 반환값(입력 속도 라운드 4 P1-6): 취소가 실제로 반영됐으면 true, 서버 실패·레코드 소실·대상 없음이면
  // false. 이 훅은 실패를 큐 상태(queueError/recordErrors)로 흡수하고 예외를 던지지 않는
  // 계약이라, 호출부(실행 취소 토스트)가 결과를 정직하게 말하려면 불리언이 필요하다.
  const cancelDraft = useCallback(async (id: string): Promise<boolean> => {
    const current = drafts.find((draft) => draft.id === id)
    if (!current || current.status === "applied" || current.status === "cancelled") return false

    if (!id.startsWith("local-")) {
      try {
        const data = await adminFetchJson<LedgerDraftResponse>(`/api/admin/branch/ledger-drafts/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "cancelled" }),
        })
        if (!data.draft) throw new Error(data.error ?? "초안 취소 응답이 비어 있습니다.")
        // non-null 단언 대신 로컬 상수로 좁혀서 클로저 안 재단언(이 영역 non-null 단언 건수를 늘리지
        // 말라는 지침, updateDraft의 nextDraft 관례를 그대로 따른다).
        const nextDraft = data.draft
        rememberDraft(draftsRef, nextDraft)
        setDrafts((items) => items.map((draft) => (draft.id === id ? nextDraft : draft)))
        clearRecordError(id)
        return true
      } catch (error) {
        if (isDraftRecordError(error)) {
          setRecordError(id)
          return false
        }
        // 네트워크·서버 오류 — 그 행에만 알리고 큐는 서버 모드 그대로(F-06). 실행 취소 토스트는 false 로 정직하게 말한다.
        setRecordError(id, rowActionFailureMessage("초안을 취소하지", error))
        return false
      }
    }

    updateLocalDrafts((items) => items.map((draft) =>
      draft.id === id ? { ...draft, status: "cancelled" as DraftStatus, updatedAt: new Date().toISOString() } : draft,
    ))
    return true
  }, [clearRecordError, drafts, setRecordError, updateLocalDrafts])

  const deleteDraft = useCallback(async (id: string) => {
    if (!id.startsWith("local-")) {
      try {
        await adminFetchJson(`/api/admin/branch/ledger-drafts/${encodeURIComponent(id)}`, { method: "DELETE" })
        draftsRef.current = draftsRef.current.filter((draft) => draft.id !== id)
        setDrafts((items) => items.filter((draft) => draft.id !== id))
        clearRecordError(id)
        return
      } catch (error) {
        if (isDraftRecordError(error)) {
          // 이미 서버에 없는 레코드 — 지우려던 목표는 사실상 달성됐지만, 로컬에서 조용히
          // 지워버리면 "왜 없어졌는지" 신호가 사라진다. 배지+새로고침으로 안내하고, 실제 정리는
          // 다음 loadDrafts(서버 목록 재조회)가 자연히 처리한다.
          setRecordError(id)
          return
        }
        // REV 시트 쓰기(ADR-011): 반영을 시도한 적 있는 초안은 감사 기록 때문에 서버가 삭제를 409 로 막는다 — 서버 장애가
        // 아니므로 그 행에만 "취소로 정리" 안내를 단다.
        if (error instanceof Error && error.message === SHEET_WRITE_HISTORY_DELETE_MESSAGE) {
          setRecordError(id, SHEET_WRITE_HISTORY_DELETE_MESSAGE)
          return
        }
        // 네트워크·서버 오류 — 그 행에만 알리고 큐는 서버 모드 그대로(F-06).
        setRecordError(id, rowActionFailureMessage("초안을 삭제하지", error))
        return
      }
    }

    updateLocalDrafts((items) => items.filter((draft) => draft.id !== id))
  }, [clearRecordError, setRecordError, updateLocalDrafts])

  // "되돌리기" — 적용된(applied) 초안에 연결된 내부 원장 entry를 상쇄한다(active -> reversed).
  // draft.status는 절대 건드리지 않는다(감사 추적 보존, 백엔드도 동일 계약). 로컬 초안은
  // DB 장부에 적용된 적이 없으니 되돌릴 대상도 없다 — applyDraft와 동일하게 서버 큐에서만 허용.
  // 실패는 호출부(토스트)가 말한다 — 서버·브라우저의 영어 문구는 한국어 사유로 바꿔 다시 던진다(F-33).
  const reverseEntry = useCallback(async (draftId: string, reason?: string) => {
    if (queueMode !== "server" || draftId.startsWith("local-")) {
      throw new Error("로컬 임시 초안은 적용을 되돌릴 수 없습니다. 서버 큐가 복구된 뒤 다시 시도하세요.")
    }
    const body: Record<string, unknown> = { action: "reverse" }
    if (reason) body.reason = reason
    let data: LedgerEntryResponse
    try {
      data = await adminFetchJson<LedgerEntryResponse>(`/api/admin/branch/ledger-drafts/${encodeURIComponent(draftId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      })
    } catch (error) {
      throw new Error(koreanRequestError(error))
    }
    if (!data.entry) throw new Error(data.error ?? "해당 초안에 연결된 적용 항목을 찾을 수 없습니다.")
    const reversed = data.entry
    // 서버가 돌려준 entryStatus를 그대로 신뢰(로컬에서 status를 임의로 뒤집지 않는다) —
    // ledgerEntryRows의 기존 active 필터가 이 항목을 매트릭스 파생에서 자연히 제외한다.
    setLedgerEntries((items) => items.map((entry) => (entry.id === reversed.id ? reversed : entry)))
    setReversedDraftIds((current) => {
      const next = new Set(current)
      next.add(draftId)
      return next
    })
    setQueueError(null)
    return reversed
  }, [queueMode])

  // 라운드 4(P0-1) — 매트릭스 붙여넣기 커밋처럼 여러 건을 한 번에 저장할 때 단건 POST/PATCH로
  // 건별 왕복하는 대신 배치 API 하나로 묶는다(계약: docs/active/
  // sales-ledger-input-speed-plan-2026-09-20.md §4 P0-1). 반환은 items와 같은 길이·순서 —
  // 호출부가 인덱스로 원래 셀에 결과를 되꽂을 수 있어야 하므로 이 계약을 지킨다(어떤 경로로도 슬롯을 비워두지 않는다).
  // createDraft 와 같은 규약(F-06): 큐 모드와 상관없이 서버에 먼저 보내고, 청크가 실패하면 그 청크의 새 초안만 로컬 임시
  // 초안으로 남긴다(큐는 내리지 않는다). 로컬 큐였다면 성공이 복구 신호라 목록을 다시 읽는다.
  const persistDraftsBatch = useCallback(async (
    items: Array<{ id?: string; input: LedgerDraftInput }>,
  ): Promise<DraftMutationResult[]> => {
    const results: DraftMutationResult[] = new Array(items.length)

    // local-* update 항목은 서버로 보내지 않는다(updateDraft의 !id.startsWith("local-") 게이트와
    // 동일 계약) — 로컬 갱신으로 바로 처리하고, 나머지 인덱스만 배치 전송 대상에 담는다.
    const serverIndices: number[] = []
    items.forEach((item, index) => {
      if (item.id && item.id.startsWith("local-")) {
        let updated: LedgerDraft | null = null
        updateLocalDrafts((current) => current.map((draft) => {
          if (draft.id !== item.id) return draft
          updated = applyDraftInput(draft, item.input)
          return updated
        }))
        results[index] = { draft: updated }
        return
      }
      serverIndices.push(index)
    })

    let anySent = false
    for (let start = 0; start < serverIndices.length; start += LEDGER_DRAFT_BATCH_LIMIT) {
      const chunkIndices = serverIndices.slice(start, start + LEDGER_DRAFT_BATCH_LIMIT)
      // 낙관적 잠금(웨이브 7 2단 I4)과 동일 원천 — draftsRef.current에서 그 id의 updatedAt.
      const requestItems: LedgerBatchWriteRequestItem[] = chunkIndices.map((itemIndex) => {
        const item = items[itemIndex]
        if (!item.id) return { op: "create", input: item.input }
        const expectedUpdatedAt = draftsRef.current.find((draft) => draft.id === item.id)?.updatedAt
        return { op: "update", id: item.id, input: item.input, expectedUpdatedAt }
      })

      try {
        const response = await adminFetch("/api/admin/branch/ledger-drafts/batch", {
          method: "POST",
          body: JSON.stringify({ items: requestItems }),
        })
        const data = (await response.json().catch(() => null)) as LedgerBatchWriteResponse | null
        if (!response.ok || !data?.results) {
          throw new Error(data?.error ?? (`${response.status} ${response.statusText}`.trim() || "일괄 저장 요청에 실패했습니다."))
        }
        anySent = true

        // 청크가 응답했다는 사실만으로 setQueueError(null)을 하지 않는다 — 항목 실패가 섞여 있을
        // 수 있어(부분 성공) 기존 queueError를 그대로 둔다.
        for (const result of data.results) {
          const itemIndex = chunkIndices[result.index]
          if (itemIndex === undefined) continue
          const item = items[itemIndex]

          if (result.ok && result.draft) {
            const nextDraft = result.draft
            rememberDraft(draftsRef, nextDraft)
            if (item.id) {
              setDrafts((current) => current.map((draft) => (draft.id === item.id ? nextDraft : draft)))
            } else {
              setDrafts((current) => capLedgerDrafts([nextDraft, ...current.filter((draft) => draft.id !== nextDraft.id)]))
            }
            clearRecordError(nextDraft.id)
            results[itemIndex] = { draft: nextDraft, dedupedRecent: result.dedupedRecent === true }
            continue
          }

          if (result.status === 400) {
            results[itemIndex] = { draft: null, validationMessage: result.error ?? "저장 요청이 거부되었습니다." }
            continue
          }
          if (result.status === 409 && result.draft) {
            const serverDraft = result.draft
            const targetId = item.id ?? serverDraft.id
            rememberDraft(draftsRef, serverDraft)
            setDrafts((current) => current.map((draft) => (draft.id === targetId ? serverDraft : draft)))
            setRecordError(targetId, result.reason === "checked-by-other" ? (result.error ?? DRAFT_CONFLICT_MESSAGE) : DRAFT_CONFLICT_MESSAGE)
            results[itemIndex] = { draft: null, conflict: true }
            continue
          }
          if (result.status === 404) {
            if (item.id) setRecordError(item.id)
            results[itemIndex] = { draft: null, error: result.error ?? "Draft not found" }
            continue
          }
          // 503/500 등 — 서버가 응답은 했으니 로컬 폴백·큐 강등 없이 이 항목만 실패로 남긴다.
          results[itemIndex] = { draft: null, error: koreanRequestError(result.error ?? "요청에 실패했습니다.") }
        }

        // 서버가 보낸 결과 배열이 요청보다 짧아 매칭되지 않은 슬롯이 남으면(계약 위반 방어),
        // undefined를 반환값에 흘리지 않고 일반 실패로 채운다.
        for (const itemIndex of chunkIndices) {
          if (results[itemIndex] === undefined) {
            results[itemIndex] = { draft: null, error: "일괄 저장 응답이 비어 있습니다." }
          }
        }
      } catch (error) {
        // 청크 요청 자체 실패(네트워크/타임아웃/비-2xx 봉투) — 단건 createDraft/updateDraft의
        // catch와 같은 규약: create 항목은 로컬 폴백을 만들고, update 항목은 낙관 편집 없이
        // 실패만 반환한다. 이 청크와 이후 청크는 더 이상 보내지 않는다(부분 성공을 전체 성공으로 숨기지
        // 않는다). 큐는 서버 모드 그대로 — 다음 저장은 다시 서버로 간다(F-06). 다시 보낼 때 같은 칸 초안이
        // 서버에 이미 있으면 새로 만들지 않는다(resendLocalDraft).
        const reason = koreanRequestError(error)
        setQueueError(`서버 저장에 실패해 이 브라우저에 임시 저장했습니다 — 다시 보내기 전에는 장부에 적용할 수 없습니다. ${reason}`)
        for (const itemIndex of serverIndices.slice(start)) {
          const item = items[itemIndex]
          if (!item.id) {
            const localDraft = makeLocalDraft(item.input)
            updateLocalDrafts((current) => [localDraft, ...current])
            results[itemIndex] = { draft: localDraft }
          } else {
            results[itemIndex] = { draft: null, error: reason }
          }
        }
        break
      }
    }

    if (anySent && (queueModeRef.current !== "server" || localDraftsRef.current.length > 0)) void loadDrafts()
    return results
  }, [clearRecordError, loadDrafts, setRecordError, updateLocalDrafts])

  // 서버 모드에서 아직 못 보낸 로컬 임시 초안 수 — 미전송 배너(다시 보내기)·칸 편집기 "아직 안 보냄"이 쓴다.
  const unsyncedLocalCount = useMemo(
    () => (queueMode === "server" ? drafts.filter((draft) => draft.id.startsWith("local-")).length : 0),
    [drafts, queueMode],
  )

  return {
    drafts,
    ledgerEntries,
    reversedDraftIds,
    ledgerHealth,
    sheetWrite,
    sheetWrites,
    queueMode,
    queueLoading,
    queueError,
    unsyncedLocalCount,
    recordErrors,
    savingCellKeys,
    applyingIds,
    applyBusy: applyingIds.size > 0,
    createDraft,
    updateDraft,
    toggleDraft,
    applyDraft,
    checkDrafts,
    applyDrafts,
    cancelDraft,
    deleteDraft,
    reverseEntry,
    persistDraftsBatch,
    retryUnsentDrafts,
    reloadDrafts: loadDrafts,
  }
}
