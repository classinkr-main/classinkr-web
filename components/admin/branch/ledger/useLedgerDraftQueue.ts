"use client"

// SalesLedgerWorkbench에서 물리 이동(웨이브 7 2단 F5 — 기계적 분할, 로직 무변경): 서버 입력 큐
// (초안 CRUD·적용·되돌리기·로컬 폴백·레코드별 에러 격리·낙관적 잠금 I4) 훅과 그 전용 헬퍼/타입.
// 회귀 테스트(tests/branch/ledger-record-error-isolation·ledger-draft-optimistic-lock·
// ledger-entry-reverse-action)가 이 파일을 소스 스캔한다 — 함수 본문·의존성 배열 문자열이
// 마커로 쓰이므로 수정 시 해당 테스트도 함께 본다.

import { useCallback, useEffect, useRef, useState } from "react"

import { adminFetch, adminFetchJson } from "../client-api"
import {
  DRAFT_CONFLICT_MESSAGE,
  type DraftKind,
  type DraftQueueMode,
  type DraftStatus,
  type LedgerDraft,
} from "./shared"

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
  // 로컬 폴백(makeLocalDraft)은 적용 불가라 이 값과 무관하게 항상 draft로 강제하고,
  // 재전송 입력(localDraftToInput)도 이 필드를 싣지 않는다(재전송은 항상 draft로 열린다).
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
  error?: string
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

function readLocalDrafts() {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isLedgerDraft) : []
  } catch {
    return []
  }
}

function writeLocalDrafts(drafts: LedgerDraft[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts.slice(0, 50)))
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
// 여기 추가한다. 매칭되지 않는 에러(네트워크 실패·타임아웃·5xx로 감싸진 서버 오류)는 전부
// 기존처럼 5xx/네트워크로 분류돼 큐 전체가 로컬 폴백으로 내려간다.
const DRAFT_RECORD_ERROR_MESSAGES = new Set(["Draft not found"])

export function isDraftRecordError(error: unknown): boolean {
  return error instanceof Error && DRAFT_RECORD_ERROR_MESSAGES.has(error.message)
}

// 레코드별 에러 배지(품질 웨이브 7, 항목 2)에 쓰는 사용자 대상 문구 — 위 판정이 잡아내는 케이스가
// 현재는 전부 "서버에 그 초안이 더 이상 없다"이므로 문구도 하나로 고정한다.
const DRAFT_RECORD_ERROR_MESSAGE =
  "서버에서 이 초안을 찾을 수 없습니다 — 다른 곳에서 이미 처리(적용/삭제)됐거나 목록이 바뀌었을 수 있습니다. 새로고침 후 다시 확인하세요."

// 로컬 fallback 초안(local-*)을 서버 재연결 시 POST 재전송하기 위한 입력 복원.
// LedgerDraft는 LedgerDraftInput의 상위집합이라 필드만 골라 뽑는다.
function localDraftToInput(draft: LedgerDraft): LedgerDraftInput {
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
  }
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
  const [queueMode, setQueueMode] = useState<DraftQueueMode>("server")
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueError, setQueueError] = useState<string | null>(null)
  // 서버 재연결 시 재전송에 실패해 여전히 로컬에만 있는 초안 수 — 배지 경고용(항목 2).
  const [unsyncedLocalCount, setUnsyncedLocalCount] = useState(0)
  // 품질 웨이브 7 — 항목 2: 레코드별 에러(404 "레코드 소실" 등) — draft id → 사용자 대상 메시지.
  // 이 Set/Map은 queueMode를 절대 건드리지 않는다(전역 강등 없음) — 그 행에만 배지로 보여주고
  // 새로고침(loadDrafts)을 유도한다. loadDrafts가 서버 목록을 다시 받아오면 통째로 비운다 —
  // 재조회로 실제 상태가 다시 맞춰지므로 오래된 행별 에러를 계속 들고 있을 이유가 없다.
  const [recordErrors, setRecordErrors] = useState<Map<string, string>>(() => new Map())
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
  // expectedUpdatedAt 원천)을 읽을 수 있게 전체 목록도 함께 미러링한다.
  const draftsRef = useRef<LedgerDraft[]>([])
  useEffect(() => {
    localDraftsRef.current = drafts.filter((draft) => draft.id.startsWith("local-"))
    draftsRef.current = drafts
  }, [drafts])

  const updateLocalDrafts = useCallback((updater: (current: LedgerDraft[]) => LedgerDraft[]) => {
    setDrafts((current) => {
      const next = updater(current).slice(0, 50)
      writeLocalDrafts(next)
      return next
    })
  }, [])

  const loadDrafts = useCallback(async () => {
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
      if (data.health?.ok === false) {
        setDrafts(readLocalDrafts())
        setLedgerEntries([])
        setLedgerHealth(data.ledgerHealth ?? null)
        setQueueMode("local")
        setQueueError(data.health.message ?? "서버 입력 큐가 아직 준비되지 않았습니다.")
        return
      }
      // 서버 복구: data.drafts로 무병합 덮어쓰면 오프라인 동안 쌓인 local-* 초안이 화면에서
      // 조용히 사라진다(무음 유실) — 덮어쓰기 전에 잔존 local-* 초안을 서버로 재전송한다.
      // 성공분은 서버 초안으로 교체, 실패분은 local- id 그대로 유지해 계속 보이게 하고 배지로 경고한다.
      const staleLocalDrafts = localDraftsRef.current
      if (staleLocalDrafts.length === 0) {
        setUnsyncedLocalCount(0)
        setDrafts(data.drafts ?? [])
        setQueueError(null)
      } else {
        const resendResults = await Promise.allSettled(
          staleLocalDrafts.map((draft) =>
            adminFetchJson<LedgerDraftResponse>("/api/admin/branch/ledger-drafts", {
              method: "POST",
              body: JSON.stringify(localDraftToInput(draft)),
            }),
          ),
        )
        const resent: LedgerDraft[] = []
        const stillLocal: LedgerDraft[] = []
        resendResults.forEach((result, index) => {
          if (result.status === "fulfilled" && result.value.draft) {
            resent.push(result.value.draft)
          } else {
            stillLocal.push(staleLocalDrafts[index])
          }
        })
        writeLocalDrafts(stillLocal)
        setUnsyncedLocalCount(stillLocal.length)
        setDrafts([...resent, ...stillLocal, ...(data.drafts ?? [])].slice(0, 50))
        setQueueError(
          stillLocal.length > 0
            ? `로컬 초안 ${stillLocal.length}건을 서버로 재전송하지 못했습니다 — 재연결 후 다시 시도하세요.`
            : null,
        )
      }
      setLedgerEntries(data.entries ?? [])
      setLedgerHealth(data.ledgerHealth ?? null)
      setQueueMode("server")
    } catch (error) {
      setDrafts(readLocalDrafts())
      setLedgerEntries([])
      setLedgerHealth(null)
      setQueueMode("local")
      setQueueError(`서버 입력 큐를 불러오지 못해 로컬 큐로 전환했습니다. ${errorMessage(error)}`)
      setRecordErrors(new Map())
    } finally {
      setQueueLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDrafts()
  }, [loadDrafts])

  const createDraft = useCallback(async (input: LedgerDraftInput): Promise<DraftMutationResult> => {
    if (queueMode === "server") {
      try {
        // 웨이브 7 2단(I4): adminFetchJson 대신 원 Response를 직접 읽는다 — 400(서버 검증 거부)을
        // 상태코드로 구분해 서버 문구를 그대로 노출하고, 성공 바디의 dedupedRecent(60초 내 동일
        // 입력 재사용, 201 아닌 200)도 함께 꺼내기 위해서다.
        const response = await adminFetch("/api/admin/branch/ledger-drafts", {
          method: "POST",
          body: JSON.stringify(input),
        })
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
        setDrafts((current) => [nextDraft, ...current.filter((draft) => draft.id !== nextDraft.id)].slice(0, 50))
        setQueueError(null)
        return { draft: nextDraft, dedupedRecent: data.dedupedRecent === true }
      } catch (error) {
        const localDraft = makeLocalDraft(input)
        setQueueMode("local")
        setQueueError(`서버 저장에 실패해 로컬 큐에 임시 저장했습니다. ${errorMessage(error)}`)
        updateLocalDrafts((current) => [localDraft, ...current])
        return { draft: localDraft }
      }
    }

    const localDraft = makeLocalDraft(input)
    updateLocalDrafts((current) => [localDraft, ...current])
    return { draft: localDraft }
  }, [queueMode, updateLocalDrafts])

  // 품질 웨이브 7 — 항목 2: 이전에는 이 catch가 에러 종류와 무관하게 무조건 setQueueMode("local")
  // 후 이 서버-id 초안을 같은 id로 로컬 낙관 반영했다("서버-id 섀도 편집"). 문제는 두 가지였다:
  // (1) 404(레코드 소실 — 다른 곳에서 이미 삭제/적용됨) 하나 때문에 큐 전체가 로컬로 강등돼
  //     무관한 다른 초안 저장까지 전부 로컬 폴백으로 떨어졌다. (2) 서버-id(예: "srv-1")는
  //     localDraftsRef가 "local-"로 시작하는 것만 재전송 대상으로 보므로(위 useEffect 참조),
  //     이 낙관 편집은 재전송 판별에서 아예 보이지 않아 서버가 복구되면 다음 loadDrafts가
  //     data.drafts(서버의 예전 값)로 조용히 덮어써 편집이 무음 소실됐다. 지금은: 404류
  //     레코드 오류는 전역 강등 없이 그 행에만 에러를 붙이고(recordErrors), 5xx/네트워크만
  //     기존처럼 큐를 로컬로 내리되 — 두 경우 모두 서버-id 레코드를 로컬에서 낙관 편집하지
  //     않는다(그 편집은 그냥 실패로 끝난다 — 성공한 척 로컬에만 남기지 않음).
  const updateDraft = useCallback(async (id: string, input: LedgerDraftInput): Promise<DraftMutationResult> => {
    if (queueMode === "server" && !id.startsWith("local-")) {
      try {
        // 낙관적 잠금(웨이브 7 2단, I4): 클라가 들고 있는 이 초안의 updatedAt을 expectedUpdatedAt으로
        // 동봉한다 — 서버(action=update)가 DB의 실제 updated_at과 CAS 비교해, 다른 곳에서 먼저
        // 수정됐으면 409 {error, draft(서버 현재본)}로 알려준다. drafts state는 항상 서버 응답
        // 원본을 보관하므로(updatedAt은 레포지토리가 내려준 문자열 그대로) 그대로 되돌려 보내면
        // 문자열이 정확히 일치한다. 레코드가 아직 목록에 없으면(이론상) 잠금 없이 기존 무조건
        // 덮어쓰기로 동작한다(서버 계약상 expectedUpdatedAt 생략 = 하위호환).
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
        setDrafts((items) => items.map((draft) => (draft.id === id ? nextDraft : draft)))
        setQueueError(null)
        clearRecordError(id)
        return { draft: nextDraft }
      } catch (error) {
        if (isDraftRecordError(error)) {
          setRecordError(id)
          return { draft: null }
        }
        setQueueMode("local")
        setQueueError(`서버 초안 수정에 실패했습니다(네트워크/서버 오류) — 재연결 후 다시 시도하세요. ${errorMessage(error)}`)
        return { draft: null }
      }
    }

    let updated: LedgerDraft | null = null
    updateLocalDrafts((items) => items.map((draft) => {
      if (draft.id !== id) return draft
      updated = applyDraftInput(draft, input)
      return updated
    }))
    return { draft: updated }
  }, [clearRecordError, queueMode, setRecordError, updateLocalDrafts])

  const toggleDraft = useCallback(async (id: string) => {
    const current = drafts.find((draft) => draft.id === id)
    if (!current) return
    const status: DraftStatus = current.status === "checked" ? "draft" : "checked"

    if (queueMode === "server" && !id.startsWith("local-")) {
      try {
        const data = await adminFetchJson<LedgerDraftResponse>(`/api/admin/branch/ledger-drafts/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        })
        if (!data.draft) throw new Error(data.error ?? "초안 수정 응답이 비어 있습니다.")
        setDrafts((items) => items.map((draft) => (draft.id === id ? data.draft! : draft)))
        setQueueError(null)
        clearRecordError(id)
        return
      } catch (error) {
        if (isDraftRecordError(error)) {
          setRecordError(id)
          return
        }
        setQueueMode("local")
        setQueueError(`서버 체크 상태 변경에 실패했습니다(네트워크/서버 오류) — 재연결 후 다시 시도하세요. ${errorMessage(error)}`)
        return
      }
    }

    updateLocalDrafts((items) => items.map((draft) =>
      draft.id === id ? { ...draft, status, updatedAt: new Date().toISOString() } : draft,
    ))
  }, [clearRecordError, drafts, queueMode, setRecordError, updateLocalDrafts])

  const applyDraft = useCallback(async (id: string) => {
    const current = drafts.find((draft) => draft.id === id)
    if (!current || current.status !== "checked") return
    if (queueMode !== "server" || id.startsWith("local-")) {
      setQueueError("로컬 임시 초안은 DB 장부에 적용할 수 없습니다. 서버 큐가 복구된 뒤 다시 저장/적용하세요.")
      return
    }

    if (queueMode === "server" && !id.startsWith("local-")) {
      try {
        const data = await adminFetchJson<LedgerDraftResponse>(`/api/admin/branch/ledger-drafts/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "apply" }),
        })
        if (!data.draft) throw new Error(data.error ?? "초안 적용 응답이 비어 있습니다.")
        setDrafts((items) => items.map((draft) => (draft.id === id ? data.draft! : draft)))
        await loadDrafts()
        setQueueError(null)
        return
      } catch (error) {
        setQueueError(`DB 장부 반영에 실패했습니다. 로컬 임시 적용으로 대체하지 않습니다. ${errorMessage(error)}`)
        return
      }
    }

  }, [drafts, loadDrafts, queueMode])

  // 일괄 체크(2026-09-14 최초 구현 → 라운드 4 P0-1: 단건 PATCH 순차 전송을 배치 API로 교체).
  // 3단계(초안→체크→적용) 자체는 그대로다. 로컬 id·비서버 모드는 기존 로컬 처리 그대로(서버에
  // 실을 것이 없다) — 서버 id만 모아 LEDGER_DRAFT_BATCH_LIMIT건씩 PATCH batch
  // { action: "check", ids }로 순차 전송한다(100건 기준 100왕복 → 1왕복). 실패 건은 행 에러로
  // 남기고 나머지는 진행하는 기존 계약은 그대로 유지한다.
  const checkDrafts = useCallback(async (ids: string[]) => {
    let done = 0
    let failed = 0
    const serverIds: string[] = []
    for (const id of ids) {
      if (queueMode !== "server" || id.startsWith("local-")) {
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
            setDrafts((items) => items.map((draft) => (draft.id === id ? next : draft)))
            clearRecordError(id)
            done += 1
            continue
          }
          failed += 1
          if (result?.status === 404) setRecordError(id)
        }
      } catch {
        // 청크 요청 자체 실패(네트워크/타임아웃) — 기존 checkDrafts도 5xx/네트워크에서 큐를
        // 강등하지 않았다(그 계약 그대로 유지). 이 청크 전부 실패로 집계하고 이후 청크는
        // 보내지 않는다(부분 성공을 전체 성공으로 숨기지 않는다).
        failed += chunk.length
        break
      }
    }

    setQueueError(failed > 0 ? `일괄 체크 중 ${failed}건이 실패했습니다 — 해당 행에서 다시 시도하세요.` : null)
    return { done, failed }
  }, [clearRecordError, queueMode, setRecordError, updateLocalDrafts])

  // 일괄 적용(2026-09-14 최초 구현 → 라운드 4 P0-1: 배치 API로 교체) — 체크된 서버 초안만 모아
  // 적용하고 마지막에 한 번 다시 읽는다. 로컬 임시 초안은 DB 장부에 적용할 수 없으므로 건너뛴다
  // (단건 applyDraft와 같은 규칙).
  const applyDrafts = useCallback(async (ids: string[]) => {
    if (queueMode !== "server") {
      setQueueError("로컬 임시 초안은 DB 장부에 적용할 수 없습니다. 서버 큐가 복구된 뒤 다시 적용하세요.")
      return { done: 0, failed: ids.length }
    }
    let done = 0
    let failed = 0
    const serverIds = ids.filter((id) => !id.startsWith("local-"))

    for (let start = 0; start < serverIds.length; start += LEDGER_DRAFT_BATCH_LIMIT) {
      const chunk = serverIds.slice(start, start + LEDGER_DRAFT_BATCH_LIMIT)
      try {
        const data = await adminFetchJson<LedgerBatchActionResponse>("/api/admin/branch/ledger-drafts/batch", {
          method: "PATCH",
          body: JSON.stringify({ action: "apply", ids: chunk }),
        })
        for (const id of chunk) {
          const result = data.results?.find((entry) => entry.id === id)
          if (result?.ok && result.draft) {
            const next = result.draft
            setDrafts((items) => items.map((draft) => (draft.id === id ? next : draft)))
            done += 1
            continue
          }
          failed += 1
        }
      } catch {
        // 청크 요청 자체 실패 — checkDrafts와 동일 계약(큐 강등 없음, 이후 청크 중단).
        failed += chunk.length
        break
      }
    }
    await loadDrafts()
    setQueueError(failed > 0 ? `일괄 적용 중 ${failed}건이 DB 장부에 반영되지 않았습니다 — 해당 행에서 다시 적용하세요.` : null)
    return { done, failed }
  }, [loadDrafts, queueMode])

  // 품질 감사 2026-09-10 — #8: 이전엔 DraftQueue 어떤 동작도 초안을 "cancelled"로 전이시키지
  // 않았다(DB CHECK 제약엔 있는 상태인데 도달 경로가 없었음) — 취소는 삭제(하드 DELETE, 감사
  // 추적 없음)로만 가능했다. status=cancelled로의 PATCH는 백엔드가 이미 지원한다
  // (updateBranchSalesLedgerDraft가 "applied"만 막는다, DB CHECK도 cancelled를 유효 상태로 이미
  // 허용) — toggleDraft와 동일한 패턴으로 액션만 추가한다(로컬 폴백 포함).
  // 반환값(입력 속도 라운드 4 P1-6): 취소가 실제로 반영됐으면 true, 서버 실패·레코드 소실·대상 없음이면
  // false. 이 훅은 실패를 큐 상태(queueMode/queueError/recordErrors)로 흡수하고 예외를 던지지 않는
  // 계약이라, 호출부(실행 취소 토스트)가 결과를 정직하게 말하려면 불리언이 필요하다.
  const cancelDraft = useCallback(async (id: string): Promise<boolean> => {
    const current = drafts.find((draft) => draft.id === id)
    if (!current || current.status === "applied" || current.status === "cancelled") return false

    if (queueMode === "server" && !id.startsWith("local-")) {
      try {
        const data = await adminFetchJson<LedgerDraftResponse>(`/api/admin/branch/ledger-drafts/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "cancelled" }),
        })
        if (!data.draft) throw new Error(data.error ?? "초안 취소 응답이 비어 있습니다.")
        // non-null 단언 대신 로컬 상수로 좁혀서 클로저 안 재단언(toggleDraft의 data.draft! 관례를
        // 따르지 않는다 — 이 영역 non-null 단언 건수를 늘리지 말라는 지침, updateDraft의
        // nextDraft 관례를 그대로 따른다).
        const nextDraft = data.draft
        setDrafts((items) => items.map((draft) => (draft.id === id ? nextDraft : draft)))
        setQueueError(null)
        clearRecordError(id)
        return true
      } catch (error) {
        if (isDraftRecordError(error)) {
          setRecordError(id)
          return false
        }
        setQueueMode("local")
        setQueueError(`서버 초안 취소에 실패했습니다(네트워크/서버 오류) — 재연결 후 다시 시도하세요. ${errorMessage(error)}`)
        return false
      }
    }

    updateLocalDrafts((items) => items.map((draft) =>
      draft.id === id ? { ...draft, status: "cancelled" as DraftStatus, updatedAt: new Date().toISOString() } : draft,
    ))
    return true
  }, [clearRecordError, drafts, queueMode, setRecordError, updateLocalDrafts])

  const deleteDraft = useCallback(async (id: string) => {
    if (queueMode === "server" && !id.startsWith("local-")) {
      try {
        await adminFetchJson(`/api/admin/branch/ledger-drafts/${encodeURIComponent(id)}`, { method: "DELETE" })
        setDrafts((items) => items.filter((draft) => draft.id !== id))
        setQueueError(null)
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
        setQueueMode("local")
        setQueueError(`서버 삭제에 실패했습니다(네트워크/서버 오류) — 재연결 후 다시 시도하세요. ${errorMessage(error)}`)
        return
      }
    }

    updateLocalDrafts((items) => items.filter((draft) => draft.id !== id))
  }, [clearRecordError, queueMode, setRecordError, updateLocalDrafts])

  // "되돌리기" — 적용된(applied) 초안에 연결된 내부 원장 entry를 상쇄한다(active -> reversed).
  // draft.status는 절대 건드리지 않는다(감사 추적 보존, 백엔드도 동일 계약). 로컬 초안은
  // DB 장부에 적용된 적이 없으니 되돌릴 대상도 없다 — applyDraft와 동일하게 서버 큐에서만 허용.
  const reverseEntry = useCallback(async (draftId: string, reason?: string) => {
    if (queueMode !== "server" || draftId.startsWith("local-")) {
      throw new Error("로컬 임시 초안은 적용을 되돌릴 수 없습니다. 서버 큐가 복구된 뒤 다시 시도하세요.")
    }
    const body: Record<string, unknown> = { action: "reverse" }
    if (reason) body.reason = reason
    const data = await adminFetchJson<LedgerEntryResponse>(`/api/admin/branch/ledger-drafts/${encodeURIComponent(draftId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
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
  // 호출부가 인덱스로 원래 셀에 결과를 되꽂을 수 있어야 하므로 로컬/서버 두 분기 모두 이 계약을
  // 지킨다(어떤 경로로도 슬롯을 비워두지 않는다).
  const persistDraftsBatch = useCallback(async (
    items: Array<{ id?: string; input: LedgerDraftInput }>,
  ): Promise<DraftMutationResult[]> => {
    const results: DraftMutationResult[] = new Array(items.length)

    if (queueMode !== "server") {
      // 비서버 모드 — createDraft/updateDraft의 로컬 분기와 동일한 규약을 각 항목에 반복한다.
      items.forEach((item, index) => {
        if (!item.id) {
          const localDraft = makeLocalDraft(item.input)
          updateLocalDrafts((current) => [localDraft, ...current])
          results[index] = { draft: localDraft }
          return
        }
        let updated: LedgerDraft | null = null
        updateLocalDrafts((current) => current.map((draft) => {
          if (draft.id !== item.id) return draft
          updated = applyDraftInput(draft, item.input)
          return updated
        }))
        results[index] = { draft: updated }
      })
      return results
    }

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

        // 청크가 응답했다는 사실만으로 setQueueError(null)을 하지 않는다 — 항목 실패가 섞여 있을
        // 수 있어(부분 성공) 기존 queueError를 그대로 둔다.
        for (const result of data.results) {
          const itemIndex = chunkIndices[result.index]
          if (itemIndex === undefined) continue
          const item = items[itemIndex]

          if (result.ok && result.draft) {
            const nextDraft = result.draft
            if (item.id) {
              setDrafts((current) => current.map((draft) => (draft.id === item.id ? nextDraft : draft)))
            } else {
              setDrafts((current) => [nextDraft, ...current.filter((draft) => draft.id !== nextDraft.id)].slice(0, 50))
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
          results[itemIndex] = { draft: null, error: result.error ?? "요청에 실패했습니다." }
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
        // 실패만 반환한다. 이 청크와 이후 청크는 전부 로컬 규약으로 마무리하고 더 이상 서버로
        // 보내지 않는다(부분 성공을 전체 성공으로 숨기지 않는다).
        setQueueMode("local")
        setQueueError(`서버 저장에 실패해 로컬 큐에 임시 저장했습니다. ${errorMessage(error)}`)
        for (const itemIndex of serverIndices.slice(start)) {
          const item = items[itemIndex]
          if (!item.id) {
            const localDraft = makeLocalDraft(item.input)
            updateLocalDrafts((current) => [localDraft, ...current])
            results[itemIndex] = { draft: localDraft }
          } else {
            results[itemIndex] = { draft: null }
          }
        }
        break
      }
    }

    return results
  }, [clearRecordError, queueMode, setRecordError, updateLocalDrafts])

  return {
    drafts,
    ledgerEntries,
    reversedDraftIds,
    ledgerHealth,
    queueMode,
    queueLoading,
    queueError,
    unsyncedLocalCount,
    recordErrors,
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
    reloadDrafts: loadDrafts,
  }
}
