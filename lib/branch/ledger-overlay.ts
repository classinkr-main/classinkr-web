// 장부 오버레이(D1) — 시트 행 + 적용된 장부 항목(+항목 없는 적용 초안) − 상쇄 − 시트가 이미 읽은 초안.
// 정정(edit-row)은 원본 시트 행의 "그 달"을 대체하고, 신규(new-row)는 더한다. 순수 모듈(클라이언트·서버 겸용).
//
// 장부 화면(SalesLedgerWorkbench)의 useMemo 묶음을 그대로 옮긴 것이 buildLedgerOverlay 이고, 서버 집계·DSH·대조
// 스크립트가 REV 딜(BranchRevDeal) 단위로 같은 규칙을 쓰도록 mergeLedgerIntoDeals 를 함께 둔다 — 두 함수는
// planLedgerOverlay 한 몸통을 공유한다(규칙을 따로 짜지 않는다).
//
// 화면 동작과 다른 점(2026-11-25, 12/1 잠금 준비):
//   a) 같은 (원본 시트 행, 달)을 가리키는 살아 있는 정정이 둘 이상이면 가장 늦게 반영한 것(appliedAt, 그다음 id)만
//      센다. 나머지는 superseded 로 돌린다 — 재동기화로 행 id 가 바뀐 뒤 두 번째 정정이 쌓여 이중 계상되던 F-04.
//   b) drift — 정정을 만들 때 본 시트 칸(sourceSnapshot.sheetBaseline)의 달 합계와 지금 시트 행의 달 합계가 다르다(F-16).
//   c) duplicates — 장부 신규 행과 같은 고객(normalizedAccountKey)·같은 달에 시트 금액(0 아님)이 있다(F-16).
//   d) 정정 행이 자기 스냅샷에 없는 계약·경로·목표·중요도·상품(+지역·첫 결제일)을 찾은 원본 시트 행에서 가져온다(F-17).
//   e) 음수(환불) 달은 그대로 통과한다 — 이 모듈 어디서도 0으로 자르지 않는다(D2).
//
// server-only·React·브라우저 API 금지. 타입은 화면 행 모양(BranchPipelineRow)을 그대로 쓴다(타입 전용 import).

import type { BranchPipelineRow } from "@/components/admin/branch/types"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { normalizedAccountKey } from "@/lib/branch/account-key"
import { listRevRevenue } from "@/lib/branch/computations/pipeline"
import { confirmedMonthAmountWithColor, dealHasColorData } from "@/lib/branch/computations/rev-confirmed"
import { ledgerRowHasColor } from "@/lib/branch/computations/revenue-core"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"
import { parseSheetBaseline } from "@/lib/branch/sheet-writeback/baseline"
import { absorptionCutoff, isSheetWriteAbsorbed, oldestSyncedAt } from "@/lib/branch/sheet-writeback/ledger-rules"
import {
  appliedDraftConfidenceMaps,
  isRecord,
  metadataString,
  snapshotField,
  snapshotSheetRowId,
  snapshotText,
  weeklyPaymentsFromDraftMetadata,
  type DraftKind,
} from "./ledger-draft-metadata"

// ── 행 모양 ─────────────────────────────────────────────────────────────────────────────

/** 장부 화면·오버레이의 한 행 — 파이프라인 시트 행(BranchPipelineRow) + 오버레이 출처. */
export type LedgerRevenueRow = BranchPipelineRow & {
  ledgerOrigin: "sheet" | "draft"
  draftId?: string
  draftKind?: DraftKind
  draftMonth?: string
  draftNote?: string
  draftMetadata?: Record<string, unknown>
  sourceDealId?: string
  /** 수정초안 오버라이드로 색 맵을 로컬 삭제한 파생 행이 원본의 색 보유 여부를 보존하는 힌트
      (lib/branch/computations/revenue-core.ts 캐논 무색상 폴백 판정용). */
  confidenceColorHint?: boolean
  /** REV Importance(KA 등). 시트 행은 파이프라인이 실어 줄 때만, 장부 행은 스냅샷·원본 행(F-17)에서. */
  importance?: string | null
}

// ── 입력 모양(화면 훅 타입과 서버 저장소 타입이 둘 다 맞는 최소 구조) ─────────────────────────

/** 장부 반영 항목(활성·상쇄). 화면 LedgerEntry 와 서버 BranchSalesLedgerEntry 가 둘 다 맞는다. */
export interface LedgerOverlayEntry {
  id: string
  draftId?: string
  entryType: "manual-new" | "manual-edit"
  entryStatus: "active" | "reversed"
  sourceDealId?: string
  sourceSheetRow: number | null
  sourceSnapshot?: Record<string, unknown> | null
  customer: string
  manager: string
  team: string
  month: string
  amount: number
  note: string
  appliedAt: string
  metadata?: Record<string, unknown> | null
}

/** 장부 초안. applied 만 오버레이 안전망(항목 없는 적용 초안)에 쓰고, 나머지는 Row ID 판독에만 쓴다. */
export interface LedgerOverlayDraft {
  id: string
  kind: DraftKind
  status: string
  sourceDealId?: string
  sourceSheetRow?: number | null
  sourceSnapshot?: Record<string, unknown> | null
  customer: string
  manager: string
  team: string
  month: string
  amount: number
  note: string
  metadata?: Record<string, unknown> | null
  /** 서버 JSON 에는 실려 온다(화면 타입엔 없음). 없으면 updatedAt 으로 순서를 정한다. */
  appliedAt?: string | null
  updatedAt?: string
}

/** 초안별 가장 최근 시트 쓰기 시도(GET ledger-drafts 의 sheetWrites[draftId]). */
export interface LedgerOverlaySheetWrite {
  status: string
  writtenAt: string | null
}

interface LedgerOverlaySources {
  ledgerEntries: ReadonlyArray<LedgerOverlayEntry>
  drafts?: ReadonlyArray<LedgerOverlayDraft>
  /** 상쇄된 항목의 draftId — draft.status 는 상쇄 뒤에도 applied 라 이것 없이는 안전망이 되살린다. */
  reversedDraftIds?: ReadonlySet<string>
  sheetWrites?: Readonly<Record<string, LedgerOverlaySheetWrite>>
  /** 서버의 마지막 성공 REV 동기화 시작 시각(이중 집계 제외 기준의 한쪽). */
  lastRevSyncStartedAt?: string | null
  /** 이 달들의 항목만 얹는다(화면 = 회계연도 12개월). 없으면 전부. */
  months?: readonly string[]
  /** 이 팀의 항목만 얹는다. 없거나 "ALL"이면 전부. */
  team?: string | null
}

export interface LedgerOverlayInput extends LedgerOverlaySources {
  /** 오버레이 전 시트 행(파이프라인 rows 또는 listRevRevenue 결과). ledgerOrigin 은 "sheet"로 맞춘다. */
  sheetRows: ReadonlyArray<BranchPipelineRow>
}

// ── 출력 모양 ───────────────────────────────────────────────────────────────────────────

/** 같은 (원본 행, 달)을 더 늦은 정정이 대신해 세지 않는 정정(F-04). */
export interface LedgerOverlaySuperseded {
  row: LedgerRevenueRow
  /** 원본 시트 행 id */
  targetId: string
  month: string
  /** 대신 세는 정정 행 id */
  winnerId: string
}

/** 정정 뒤 시트 칸이 바뀐 정정(F-16). 값은 고르지 않는다 — 잠금 전엔 시트, 잠금 뒤엔 장부가 이긴다. */
export interface LedgerOverlayDrift {
  row: LedgerRevenueRow
  targetId: string
  month: string
  /** 정정을 만들 때 본 그 달 주차 칸 합(sourceSnapshot.sheetBaseline.weeks) */
  baselineTotal: number
  /** 지금 원본 행의 그 달 주차 칸 합(baseline 과 같은 출처) */
  currentTotal: number
  correctionAmount: number
}

/** 장부 신규 행과 같은 고객·같은 달에 시트 금액이 있다(이중 입력 의심, F-16). */
export interface LedgerOverlayDuplicate {
  row: LedgerRevenueRow
  month: string
  accountKey: string
  sheetRowIds: string[]
  /** 그 고객·달의 시트 금액 합(0 아닌 행만) */
  sheetAmount: number
}

export interface LedgerOverlayResult {
  /** 오버레이 전 시트 행(ledgerOrigin "sheet") */
  sheetRows: LedgerRevenueRow[]
  /** 범위 안 활성 항목 행(상쇄·흡수 제외 전) */
  entryRows: LedgerRevenueRow[]
  /** 범위 안 적용 초안 행(로컬·상쇄 제외, 흡수 제외 전) */
  fallbackRows: LedgerRevenueRow[]
  /** 시트가 이미 읽은 시트 쓰기 초안 id(오버레이에서 뺀다) */
  absorbedDraftIds: Set<string>
  /** 실제로 얹는 장부 행(흡수·superseded 제외, F-17 보강) */
  appliedRows: LedgerRevenueRow[]
  /** 더하는 행(new-row, 로컬 제외) */
  additiveRows: LedgerRevenueRow[]
  /** 대체하는 행(edit-row — 원본을 못 찾은 정정 포함) */
  replacementRows: LedgerRevenueRow[]
  /** 정정한 달을 지운 시트 행(정정이 없으면 sheetRows 그대로) */
  adjustedSheetRows: LedgerRevenueRow[]
  /** [...appliedRows, ...adjustedSheetRows] */
  rows: LedgerRevenueRow[]
  /** 원본 시트 행 id → 정정으로 대체된 달 */
  overrides: Map<string, Set<string>>
  /** 원본 시트 행을 찾지 못한 정정 행(따로 더해진다 — 화면이 경고) */
  unresolved: LedgerRevenueRow[]
  /** 센 정정(같은 칸 최신, F-17 보강 뒤 행)과 그 원본 시트 행 — 대조 스크립트가 근거 글에 쓴다(같은 짝을 다시 찾지 않게) */
  resolved: Array<{ correction: LedgerRevenueRow; target: LedgerRevenueRow; month: string }>
  superseded: LedgerOverlaySuperseded[]
  drift: LedgerOverlayDrift[]
  duplicates: LedgerOverlayDuplicate[]
}

/** drift·중복 판정에서 같은 금액으로 보는 허용 오차(¥). */
export const LEDGER_OVERLAY_AMOUNT_TOLERANCE = 0.5

// ── 원본 시트 행 찾기 ───────────────────────────────────────────────────────────────────

// 수정(edit-row) 초안·반영값 → 그 수정이 가리키는 지금의 원본 시트 행 찾기. 시트를 다시 가져오면 시트 행 id
// (임포트 줄 id)가 새로 만들어지므로 id 만 보면 원본을 못 찾는다. 그래서
//   1) 같은 시트 Row ID('2. REV' 숨김 열, ADR-011 — 정렬·행 삽입에도 안 바뀐다) → 2) 같은 id
//   → 3) 같은 시트 행 번호 + 같은 고객 → 4) 같은 고객 + 같은 상품인 행이 딱 하나
// 순서로 찾고, 모두 실패하면 undefined(고르지 않는다 — 잘못 붙이는 것보다 경고가 낫다).
export interface SheetRowRef {
  /** 초안·반영값이 만들 때 본 시트 Row ID(sourceSnapshot.sheetBaseline.rowId). */
  sheetRowId?: string | null
  sourceDealId?: string | null
  sheetRow?: number | null
  customer: string
  productVersion?: string | null
}

/** 원본 행 찾기에 쓰는 시트 행 필드. */
export type SheetRowLookup = Pick<BranchPipelineRow, "id" | "customer" | "sheetRow" | "rowId" | "rowIdIssue" | "productVersion">

export function createSheetRowResolver<S extends SheetRowLookup>(sheetRows: ReadonlyArray<S>): (ref: SheetRowRef) => S | undefined {
  const byId = new Map(sheetRows.map((row) => [row.id, row]))
  // 형식이 맞고 한 번만 나온 Row ID 만 키로 쓴다(rowIdIssue 가 있으면 그 행은 Row ID 로 찾지 않는다).
  const byRowId = new Map<string, S>()
  for (const row of sheetRows) if (row.rowId && !row.rowIdIssue) byRowId.set(row.rowId, row)
  const byAccount = new Map<string, S[]>()
  for (const row of sheetRows) {
    const key = normalizedAccountKey(row.customer)
    const list = byAccount.get(key)
    if (list) list.push(row)
    else byAccount.set(key, [row])
  }
  const sameText = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim() === (b ?? "").trim()
  return (ref) => {
    const stable = ref.sheetRowId ? byRowId.get(ref.sheetRowId) : undefined
    if (stable) return stable
    const exact = ref.sourceDealId ? byId.get(ref.sourceDealId) : undefined
    if (exact) return exact
    const sameAccount = byAccount.get(normalizedAccountKey(ref.customer)) ?? []
    const sameRow = ref.sheetRow != null ? sameAccount.filter((row) => row.sheetRow === ref.sheetRow) : []
    if (sameRow.length === 1) return sameRow[0]
    const sameProduct = ref.productVersion ? sameAccount.filter((row) => sameText(row.productVersion, ref.productVersion)) : []
    return sameProduct.length === 1 ? sameProduct[0] : undefined
  }
}

/** 원본을 찾을 정정 행의 필드. */
export interface CorrectionLike {
  draftMonth?: string
  sourceDealId?: string | null
  sheetRow?: number | null
  customer: string
  productVersion?: string | null
}

// 적용된 수정 → 대체하는 원본 시트 행의 달. 못 찾은 수정은 unresolved — 원본이 지워졌는지 이름이 바뀌었는지
// 알 수 없으므로 조용히 넘기지 않고 화면이 경고한다(정정 금액은 별도 행으로 남는다).
export interface CorrectionTargetResult<C = LedgerRevenueRow, S = LedgerRevenueRow> {
  /** 원본 시트 행 id → 정정으로 대체된 달 */
  overrides: Map<string, Set<string>>
  /** 원본 시트 행을 찾지 못한 정정 행 */
  unresolved: C[]
  /** 찾은 정정 → 원본 시트 행(정정 순서 그대로) */
  resolved: Array<{ correction: C; target: S; month: string }>
}

export function resolveCorrectionTargets<C extends CorrectionLike, S extends SheetRowLookup>(
  corrections: ReadonlyArray<C>,
  sheetRows: ReadonlyArray<S>,
  /** 정정 행 → 만들 때 본 시트 Row ID(반영값 sourceSnapshot). 없으면 Row ID 단계를 건너뛴다. */
  sheetRowIdOf: (correction: C) => string | null = () => null,
): CorrectionTargetResult<C, S> {
  const overrides = new Map<string, Set<string>>()
  const unresolved: C[] = []
  const resolved: Array<{ correction: C; target: S; month: string }> = []
  if (corrections.length === 0) return { overrides, unresolved, resolved }
  const resolve = createSheetRowResolver(sheetRows)
  for (const correction of corrections) {
    const month = correction.draftMonth
    if (!month) continue
    const target = resolve({ ...correction, sheetRowId: sheetRowIdOf(correction) })
    if (!target) {
      unresolved.push(correction)
      continue
    }
    const months = overrides.get(target.id) ?? new Set<string>()
    months.add(month)
    overrides.set(target.id, months)
    resolved.push({ correction, target, month })
  }
  return { overrides, unresolved, resolved }
}

// ── 시트가 이미 읽은 시트 쓰기(ADR-011) ──────────────────────────────────────────────────

/**
 * 오버레이에서 뺄 초안 id. cutoff 는 absorptionCutoff(lastRevSyncStartedAt, 가진 시트 행의 oldestSyncedAt) —
 * 서버 동기화 시각만 쓰면 화면이 그 동기화 전 행을 들고 있을 때 정정이 화면에서 사라진다.
 */
export function sheetAbsorbedDraftIds(
  sheetWrites: Readonly<Record<string, LedgerOverlaySheetWrite>>,
  cutoff: string | null,
): Set<string> {
  const ids = new Set<string>()
  if (!cutoff) return ids
  for (const [draftId, sw] of Object.entries(sheetWrites)) {
    if (isSheetWriteAbsorbed(sw, cutoff)) ids.add(draftId)
  }
  return ids
}

/** 적용 초안 오버레이에서 미러가 이미 읽은 시트 쓰기 초안을 뺀다(draftId 없는 행은 그대로). */
export function excludeSheetAbsorbedRows<T extends { draftId?: string }>(rows: T[], absorbed: ReadonlySet<string>): T[] {
  if (absorbed.size === 0) return rows
  return rows.filter((row) => !row.draftId || !absorbed.has(row.draftId))
}

export { absorptionCutoff, oldestSyncedAt }

// ── 항목·초안 → 장부 행 ─────────────────────────────────────────────────────────────────

interface OverlayCandidate {
  row: LedgerRevenueRow
  /** 순서 기준(appliedAt, 없으면 초안 updatedAt) */
  appliedAt: string
  /** 같은 시각일 때 순서 — 항목 id 또는 초안 id */
  sortId: string
  snapshot: Record<string, unknown> | null
  amount: number
  entryId?: string
}

function snapshotOf(value: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

// 스냅샷의 분류 필드를 행에 싣는다. importance 는 값이 있을 때만 키를 둔다(시트 행 모양과 같게).
function snapshotRowFields(snapshot: Record<string, unknown> | null) {
  const importance = snapshotText(snapshot, "importance")
  return {
    region: snapshotText(snapshot, "region"),
    status: snapshotText(snapshot, "status"),
    dealType: snapshotText(snapshot, "dealType"),
    productVersion: snapshotText(snapshot, "productVersion"),
    firstPayment: snapshotText(snapshot, "firstPayment"),
    contractTarget: Number(snapshotField(snapshot, "contractTarget") ?? 0),
    ...(importance ? { importance } : {}),
  }
}

function entryCandidate(entry: LedgerOverlayEntry): OverlayCandidate {
  const snapshot = snapshotOf(entry.sourceSnapshot)
  const metadata = entry.metadata ?? undefined
  const row: LedgerRevenueRow = {
    id: `ledger-${entry.id}`,
    sheetRow: entry.sourceSheetRow ?? undefined,
    customer: entry.customer || "고객명 미입력",
    manager: entry.manager || null,
    team: entry.team || null,
    ...snapshotRowFields(snapshot),
    revenue: entry.amount,
    monthlyPayments: { [entry.month]: entry.amount },
    ...appliedDraftConfidenceMaps(entry.month, entry.amount, metadata),
    // 주차 초안: 병합 배열(metadata.weekly) 우선, 없으면 단일 주차 토큰(metadata.week). 주차합==월합 유지.
    weeklyPayments: weeklyPaymentsFromDraftMetadata(entry.month, entry.amount, metadata),
    ledgerOrigin: "draft",
    draftId: entry.draftId,
    draftKind: entry.entryType === "manual-edit" ? "edit-row" : "new-row",
    draftMonth: entry.month,
    draftNote: entry.note,
    draftMetadata: metadata,
    sourceDealId: entry.sourceDealId,
  }
  return { row, appliedAt: entry.appliedAt, sortId: entry.id, snapshot, amount: entry.amount, entryId: entry.id }
}

function draftCandidate(draft: LedgerOverlayDraft): OverlayCandidate {
  const snapshot = snapshotOf(draft.sourceSnapshot)
  const metadata = draft.metadata ?? undefined
  const row: LedgerRevenueRow = {
    id: `draft-${draft.id}`,
    sheetRow: draft.sourceSheetRow ?? undefined,
    customer: draft.customer || "고객명 미입력",
    manager: draft.manager || null,
    team: draft.team || null,
    ...snapshotRowFields(snapshot),
    revenue: draft.amount,
    monthlyPayments: { [draft.month]: draft.amount },
    ...appliedDraftConfidenceMaps(draft.month, draft.amount, metadata),
    weeklyPayments: weeklyPaymentsFromDraftMetadata(draft.month, draft.amount, metadata),
    ledgerOrigin: "draft",
    draftId: draft.id,
    draftKind: draft.kind,
    draftMonth: draft.month,
    draftNote: draft.note,
    draftMetadata: metadata,
    sourceDealId: draft.sourceDealId,
  }
  return { row, appliedAt: draft.appliedAt ?? draft.updatedAt ?? "", sortId: draft.id, snapshot, amount: draft.amount }
}

function toSheetRow(row: BranchPipelineRow): LedgerRevenueRow {
  const origin = (row as Partial<LedgerRevenueRow>).ledgerOrigin
  return origin === "sheet" ? (row as LedgerRevenueRow) : { ...row, ledgerOrigin: "sheet" }
}

function timeOf(value: string): number | null {
  const at = Date.parse(value)
  return Number.isFinite(at) ? at : null
}

// 반영 순서 — appliedAt(해석 못 하면 가장 이른 것으로) → id. 양수면 a 가 b 보다 늦다.
function compareApplied(a: OverlayCandidate, b: OverlayCandidate): number {
  const at = timeOf(a.appliedAt)
  const bt = timeOf(b.appliedAt)
  if (at !== bt) {
    if (at == null) return -1
    if (bt == null) return 1
    return at - bt
  }
  return a.sortId < b.sortId ? -1 : a.sortId > b.sortId ? 1 : 0
}

function sumNumbers(values: ReadonlyArray<unknown> | null | undefined): number {
  let total = 0
  for (const value of values ?? []) {
    const n = Number(value)
    if (Number.isFinite(n)) total += n
  }
  return total
}

function monthTotal(row: Pick<BranchPipelineRow, "monthlyPayments">, month: string): number {
  const n = Number(row.monthlyPayments?.[month])
  return Number.isFinite(n) ? n : 0
}

// F-17: 원본 시트 행에서 가져오는 분류 필드(자기 스냅샷에 없을 때만).
const CORRECTION_COPY_TEXT_FIELDS = ["status", "dealType", "productVersion", "region", "firstPayment", "importance"] as const

function correctionWithTargetFields(
  row: LedgerRevenueRow,
  snapshot: Record<string, unknown> | null,
  target: LedgerRevenueRow,
): LedgerRevenueRow {
  const patch: Partial<LedgerRevenueRow> = {}
  for (const key of CORRECTION_COPY_TEXT_FIELDS) {
    if (snapshotText(snapshot, key) != null) continue
    const value = target[key]
    if (typeof value === "string" && value.trim()) patch[key] = value
  }
  if (snapshotField(snapshot, "contractTarget") == null && typeof target.contractTarget === "number" && Number.isFinite(target.contractTarget)) {
    patch.contractTarget = target.contractTarget
  }
  if (Object.keys(patch).length === 0) return row
  return { ...row, ...patch }
}

// ── 한 몸통 ─────────────────────────────────────────────────────────────────────────────

interface ResolvedCorrection {
  row: LedgerRevenueRow
  candidate: OverlayCandidate
  target: LedgerRevenueRow
  month: string
}

interface LedgerOverlayPlan {
  sheetRows: LedgerRevenueRow[]
  entryRows: LedgerRevenueRow[]
  fallbackRows: LedgerRevenueRow[]
  absorbedDraftIds: Set<string>
  appliedRows: LedgerRevenueRow[]
  additiveRows: LedgerRevenueRow[]
  replacementRows: LedgerRevenueRow[]
  /** 센 정정(같은 칸 최신) — F-17 보강 뒤 행 */
  resolved: ResolvedCorrection[]
  overrides: Map<string, Set<string>>
  unresolved: LedgerRevenueRow[]
  superseded: LedgerOverlaySuperseded[]
  drift: LedgerOverlayDrift[]
  duplicates: LedgerOverlayDuplicate[]
  candidateByRowId: Map<string, OverlayCandidate>
}

function planLedgerOverlay(sheetRows: LedgerRevenueRow[], sources: LedgerOverlaySources): LedgerOverlayPlan {
  const months = sources.months
  const team = sources.team
  const drafts = sources.drafts ?? []
  const reversedDraftIds = sources.reversedDraftIds ?? new Set<string>()
  // REV 매트릭스는 M/Q 토글과 무관하게 회계연도 12개월 전체를 보여준다 — 적용분도 표시 열(months)로 스코프한다
  // (분기 밖 입력이 행째 사라지던 버그).
  const inScope = (month: string, rowTeam: string | null | undefined) =>
    (!months || months.includes(month)) && (!team || team === "ALL" || rowTeam === team)

  const entryCandidates = sources.ledgerEntries
    .filter((entry) => entry.entryStatus === "active")
    .filter((entry) => inScope(entry.month, entry.team))
    .map(entryCandidate)
  const fallbackCandidates = drafts
    .filter((draft) => draft.status === "applied")
    .filter((draft) => !draft.id.startsWith("local-"))
    // "되돌리기": draft.status는 상쇄 후에도 "applied" 그대로다(감사 추적 보존). reversedDraftIds 없이는 이
    // 안전망(항목 누락 시 applied draft를 대체 표시)이 방금 상쇄된 항목까지 되살린다.
    .filter((draft) => !reversedDraftIds.has(draft.id))
    .filter((draft) => inScope(draft.month, draft.team))
    .map(draftCandidate)

  // REV 시트 쓰기(ADR-011) — 반영 때 '2. REV' 에도 쓴 정정은, 쓴 뒤에 시작한 REV 동기화가 성공하면 시트 행이 이미
  // 그 값을 갖는다. 기준은 서버의 마지막 동기화가 아니라 "가진 시트 행"의 데이터 시각까지 본 것(absorptionCutoff).
  const absorbedDraftIds = sheetAbsorbedDraftIds(
    sources.sheetWrites ?? {},
    absorptionCutoff(sources.lastRevSyncStartedAt ?? null, oldestSyncedAt(sheetRows)),
  )
  const entryDraftIds = new Set(entryCandidates.map((candidate) => candidate.row.draftId).filter(Boolean))
  const appliedCandidates = (entryCandidates.length === 0
    ? fallbackCandidates
    : [...entryCandidates, ...fallbackCandidates.filter((candidate) => !candidate.row.draftId || !entryDraftIds.has(candidate.row.draftId))]
  ).filter((candidate) => !candidate.row.draftId || !absorbedDraftIds.has(candidate.row.draftId))
  const candidateByRowId = new Map(appliedCandidates.map((candidate) => [candidate.row.id, candidate]))

  // 반영값·초안이 만들 때 본 시트 Row ID(시트 쓰기 baseline) — 원본 행을 찾는 1순위 키. 초안 → 항목 순(항목이 이긴다).
  const sheetRowIdByDraftId = new Map<string, string>()
  for (const draft of drafts) {
    const rowId = snapshotSheetRowId(snapshotOf(draft.sourceSnapshot))
    if (rowId) sheetRowIdByDraftId.set(draft.id, rowId)
  }
  for (const entry of sources.ledgerEntries) {
    const rowId = snapshotSheetRowId(snapshotOf(entry.sourceSnapshot))
    if (rowId && entry.draftId) sheetRowIdByDraftId.set(entry.draftId, rowId)
  }
  const corrections = appliedCandidates.filter((candidate) => candidate.row.draftKind === "edit-row").map((candidate) => candidate.row)
  const targets = resolveCorrectionTargets(corrections, sheetRows, (row) =>
    sheetRowIdByDraftId.get(row.draftId ?? "") ?? snapshotSheetRowId(candidateByRowId.get(row.id)?.snapshot ?? null),
  )

  // F-04: 같은 (원본 행, 달)을 가리키는 정정이 여럿이면 가장 늦게 반영한 것만 센다(쌓이지 않는다).
  const groups = new Map<string, ResolvedCorrection[]>()
  for (const item of targets.resolved) {
    const candidate = candidateByRowId.get(item.correction.id)
    if (!candidate) continue
    const key = `${item.target.id}\u0000${item.month}`
    const list = groups.get(key) ?? []
    list.push({ row: item.correction, candidate, target: item.target, month: item.month })
    groups.set(key, list)
  }
  const superseded: LedgerOverlaySuperseded[] = []
  const supersededIds = new Set<string>()
  const winners: ResolvedCorrection[] = []
  const overrides = new Map<string, Set<string>>()
  for (const list of groups.values()) {
    const ordered = [...list].sort((a, b) => compareApplied(a.candidate, b.candidate))
    const winner = ordered[ordered.length - 1]
    for (const loser of ordered.slice(0, -1)) {
      superseded.push({ row: loser.row, targetId: loser.target.id, month: loser.month, winnerId: winner.row.id })
      supersededIds.add(loser.row.id)
    }
    winners.push(winner)
  }
  // overrides 는 정정 순서대로(화면 기존 순서) 만든다.
  for (const item of targets.resolved) {
    if (supersededIds.has(item.correction.id)) continue
    const set = overrides.get(item.target.id) ?? new Set<string>()
    set.add(item.month)
    overrides.set(item.target.id, set)
  }

  // F-17: 센 정정은 자기 스냅샷에 없는 분류 필드를 원본 행에서 가져온다.
  const patchedById = new Map<string, LedgerRevenueRow>()
  const resolved = winners.map((item) => {
    const row = correctionWithTargetFields(item.row, item.candidate.snapshot, item.target)
    if (row !== item.row) patchedById.set(row.id, row)
    return { ...item, row }
  })

  const appliedRows = appliedCandidates
    .filter((candidate) => !supersededIds.has(candidate.row.id))
    .map((candidate) => patchedById.get(candidate.row.id) ?? candidate.row)
  const additiveRows = appliedRows.filter((row) => row.draftKind !== "edit-row" && !row.draftId?.startsWith("local-"))
  const replacementRows = appliedRows.filter((row) => row.draftKind === "edit-row")

  // F-16 drift: 정정을 만들 때 본 그 달 주차 칸 합 ≠ 지금 원본 행의 그 달 주차 칸 합. 지금 시트가 정정 금액과
  // 같으면(시트에 다시 쳐 넣었다) 바뀐 게 아니다. baseline 이 없는 정정(ADR-011 이전)은 판정하지 않는다.
  const drift: LedgerOverlayDrift[] = []
  for (const item of resolved) {
    const baseline = parseSheetBaseline(item.candidate.snapshot?.sheetBaseline)
    if (!baseline || baseline.month !== item.month) continue
    const baselineTotal = sumNumbers(baseline.weeks.map((week) => week.value))
    const currentTotal = sumNumbers(item.target.weeklyPayments?.[item.month])
    if (Math.abs(baselineTotal - currentTotal) <= LEDGER_OVERLAY_AMOUNT_TOLERANCE) continue
    if (Math.abs(currentTotal - item.candidate.amount) <= LEDGER_OVERLAY_AMOUNT_TOLERANCE) continue
    drift.push({
      row: item.row,
      targetId: item.target.id,
      month: item.month,
      baselineTotal,
      currentTotal,
      correctionAmount: item.candidate.amount,
    })
  }

  // F-16 duplicates: 장부 신규 행과 같은 고객·같은 달에 시트 금액(0 아님)이 있다.
  const sheetByAccount = new Map<string, LedgerRevenueRow[]>()
  for (const row of sheetRows) {
    const key = normalizedAccountKey(row.customer)
    if (!key) continue
    const list = sheetByAccount.get(key)
    if (list) list.push(row)
    else sheetByAccount.set(key, [row])
  }
  const duplicates: LedgerOverlayDuplicate[] = []
  for (const row of additiveRows) {
    const month = row.draftMonth
    const accountKey = normalizedAccountKey(row.customer)
    if (!month || !accountKey) continue
    const matches = (sheetByAccount.get(accountKey) ?? []).filter((sheetRow) => monthTotal(sheetRow, month) !== 0)
    if (matches.length === 0) continue
    duplicates.push({
      row,
      month,
      accountKey,
      sheetRowIds: matches.map((sheetRow) => sheetRow.id),
      sheetAmount: matches.reduce((sum, sheetRow) => sum + monthTotal(sheetRow, month), 0),
    })
  }

  return {
    sheetRows,
    entryRows: entryCandidates.map((candidate) => candidate.row),
    fallbackRows: fallbackCandidates.map((candidate) => candidate.row),
    absorbedDraftIds,
    appliedRows,
    additiveRows,
    replacementRows,
    resolved,
    overrides,
    unresolved: targets.unresolved,
    superseded,
    drift,
    duplicates,
    candidateByRowId,
  }
}

// 원본 시트 행 + 적용초안행을 합치되, 수정초안이 가리키는 (딜, 월) 셀은 원본에서 제거한다.
// 안 그러면 원본 금액 + 정정 금액이 그 달의 월·연간·그룹·합계행에 이중 계상된다.
function adjustSheetRows(sheetRows: LedgerRevenueRow[], overrides: Map<string, Set<string>>): LedgerRevenueRow[] {
  if (overrides.size === 0) return sheetRows
  return sheetRows.map((row) => {
    const months = overrides.get(row.id)
    if (!months || months.size === 0) return row
    const monthlyPayments = { ...(row.monthlyPayments ?? {}) }
    const monthlyConfirmed = { ...(row.monthlyConfirmed ?? {}) }
    const monthlyHighConfidence = { ...(row.monthlyHighConfidence ?? {}) }
    const monthlyRed = { ...(row.monthlyRed ?? {}) }
    const weeklyPayments = { ...(row.weeklyPayments ?? {}) }
    for (const month of months) {
      delete monthlyPayments[month]
      delete monthlyConfirmed[month]
      delete monthlyHighConfidence[month]
      delete monthlyRed[month]
      delete weeklyPayments[month]
    }
    return {
      ...row,
      monthlyPayments,
      monthlyConfirmed,
      monthlyHighConfidence,
      monthlyRed,
      weeklyPayments,
      // 색 보유 여부는 오버라이드 삭제 '전' 원본 기준으로 보존 — 색이 그 달에만 있던 행을
      // 지운 뒤 맵으로 재판정하면 남은 과거 월이 무색상 폴백으로 확정 오집계된다.
      confidenceColorHint: ledgerRowHasColor(row),
    }
  })
}

/**
 * 장부 화면 행 = 시트 행 + 적용된 장부 행(D1). 화면(SalesLedgerWorkbench)과 서버가 같은 함수를 쓴다.
 * 확도(확정/고확도/예정)는 여기서 정하지 않는다 — 행의 맵을 캐논(revenue-core.ledgerMonthSplit)이 읽는다.
 */
export function buildLedgerOverlay(input: LedgerOverlayInput): LedgerOverlayResult {
  const sheetRows = input.sheetRows.map(toSheetRow)
  const plan = planLedgerOverlay(sheetRows, input)
  const adjustedSheetRows = adjustSheetRows(sheetRows, plan.overrides)
  return {
    sheetRows,
    entryRows: plan.entryRows,
    fallbackRows: plan.fallbackRows,
    absorbedDraftIds: plan.absorbedDraftIds,
    appliedRows: plan.appliedRows,
    additiveRows: plan.additiveRows,
    replacementRows: plan.replacementRows,
    adjustedSheetRows,
    rows: [...plan.appliedRows, ...adjustedSheetRows],
    overrides: plan.overrides,
    unresolved: plan.unresolved,
    resolved: plan.resolved.map((item) => ({ correction: item.row, target: item.target, month: item.month })),
    superseded: plan.superseded,
    drift: plan.drift,
    duplicates: plan.duplicates,
  }
}

// ── 서버: REV 딜 단위 ───────────────────────────────────────────────────────────────────

export interface LedgerDealMergeInput extends LedgerOverlaySources {
  /**
   * 색 데이터가 없는 딜의 한 달을 제자리에서 정정하면 그 딜이 "색 있음"이 돼 나머지 달의 무색상 폴백이 꺼진다.
   * 그래서 나머지 달의 폴백 결과를 이 날 기준으로 확정 맵에 옮겨 적는다(읽는 시점 평가 — 캐논에 넘기는 것과 같은 값).
   * KST 영업일 'YYYY-MM-DD' 를 권장한다('YYYY-MM' 도 받는다 — rev-confirmed.ts resolveRevReadDate). 없으면 지금의 KST 영업일.
   */
  todayYm?: string
}

export interface LedgerDealMergeResult {
  /** 입력 딜(정정 반영 — 바뀐 딜만 새 객체) + 장부 딜(신규·원본 못 찾은 정정·담당이 다른 정정) */
  deals: BranchRevDeal[]
  unresolved: LedgerRevenueRow[]
  superseded: LedgerOverlaySuperseded[]
  drift: LedgerOverlayDrift[]
  duplicates: LedgerOverlayDuplicate[]
}

function sameOwner(deal: BranchRevDeal, row: LedgerRevenueRow): boolean {
  const a = normalizeBranchMemberName(deal.manager)?.toLowerCase() ?? null
  const b = normalizeBranchMemberName(row.manager)?.toLowerCase() ?? null
  return a === b && (deal.team ?? null) === (row.team ?? null)
}

function recordOf<T>(value: unknown): Record<string, T> | null {
  return isRecord(value) ? (value as Record<string, T>) : null
}

function withoutKey<T>(map: Record<string, T> | null | undefined, key: string): Record<string, T> | null {
  if (!map || !(key in map)) return map ?? null
  const next = { ...map }
  delete next[key]
  return next
}

// 장부 딜(신규·원본 못 찾은 정정·담당이 다른 정정) — 화면의 장부 행과 같은 값. monthly_red 에 그 달 키를 늘 둬
// 무색상 폴백이 타지 않게 한다(장부 행은 확도 맵이 정본 — revenue-core 의 draft 규칙과 같다).
function ledgerDealFromRow(row: LedgerRevenueRow, candidate: OverlayCandidate | undefined, contractTarget: number | null): BranchRevDeal {
  const monthlyRed: Record<string, boolean> = { ...(row.monthlyRed ?? {}) }
  for (const month of Object.keys(row.monthlyPayments ?? {})) monthlyRed[month] = monthlyRed[month] ?? false
  // 입력 때 고른 상품 분류(hardware 등) — 화면(rowProductCategory)처럼 DSH SW/HW 분류(classifyDshDeal)도 저장값을 먼저 본다.
  const productCategory = metadataString(row.draftMetadata, "productCategory")
  return {
    id: row.id,
    sheet_row: row.sheetRow ?? 0,
    customer_name: row.customer,
    branch_contact: null,
    team: row.team,
    manager: row.manager,
    deal_type: row.dealType ?? null,
    status: row.status ?? null,
    first_payment: row.firstPayment ?? null,
    product_version: row.productVersion ?? null,
    region: row.region,
    importance: row.importance ?? null,
    note: row.draftNote || null,
    contract_target: contractTarget,
    monthly_payments: { ...(row.monthlyPayments ?? {}) },
    monthly_red: monthlyRed,
    monthly_confirmed: { ...(row.monthlyConfirmed ?? {}) },
    monthly_high_conf: { ...(row.monthlyHighConfidence ?? {}) },
    raw: {
      weeklyPayments: { ...(row.weeklyPayments ?? {}) },
      ...(productCategory ? { productCategory } : {}),
      // 장부에서 온 딜 표시 — 시트 행이 아니다(sheet_row 는 원본 시트 행 번호 참고값, 없으면 0).
      ledgerDeal: {
        origin: candidate?.entryId ? "entry" : "draft",
        kind: row.draftKind ?? "new-row",
        entryId: candidate?.entryId ?? null,
        draftId: row.draftId ?? null,
        month: row.draftMonth ?? null,
      },
    },
    synced_at: candidate?.appliedAt ?? "",
  }
}

/**
 * REV 딜에 장부 항목을 얹는다(D1, 서버 집계용). buildLedgerOverlay 와 같은 몸통(planLedgerOverlay)을 쓴다 —
 *  - 정정: 원본 딜의 그 달을 금액·확도·색·주차 맵에서 바꿔 쓴다(딜 수·딜 id 유지). 담당·팀이 원본과 다르면
 *    화면처럼 그 달을 원본에서 지우고 장부 딜로 따로 둔다(담당자별 합이 화면과 같게).
 *  - 신규·원본 못 찾은 정정: 장부 딜을 더한다(담당·팀·계약·경로·상품·첫 결제일·지역은 항목 스냅샷).
 * listRevRevenue(결과.deals)의 담당자 × 달 × 확도 합은 buildLedgerOverlay(...).rows 와 같다(tests/branch/ledger-overlay.test.ts).
 */
export function mergeLedgerIntoDeals(deals: ReadonlyArray<BranchRevDeal>, input: LedgerDealMergeInput): LedgerDealMergeResult {
  const sheetRows = listRevRevenue([...deals]).map(toSheetRow)
  const plan = planLedgerOverlay(sheetRows, input)
  const sheetRowById = new Map(sheetRows.map((row) => [row.id, row]))

  // 원본 딜별 제자리 정정 / 떼어 낼 달
  const inPlace = new Map<string, ResolvedCorrection[]>()
  const detached = new Map<string, Set<string>>()
  const ledgerDeals: BranchRevDeal[] = []
  const dealById = new Map(deals.map((deal) => [deal.id, deal]))
  for (const item of plan.resolved) {
    const deal = dealById.get(item.target.id)
    if (!deal) continue
    if (sameOwner(deal, item.row)) {
      const list = inPlace.get(deal.id) ?? []
      list.push(item)
      inPlace.set(deal.id, list)
    } else {
      const set = detached.get(deal.id) ?? new Set<string>()
      set.add(item.month)
      detached.set(deal.id, set)
      ledgerDeals.push(ledgerDealFromRow(item.row, item.candidate, null))
    }
  }

  const mergedDeals = deals.map((deal) => {
    const edits = inPlace.get(deal.id) ?? []
    const removed = detached.get(deal.id) ?? new Set<string>()
    if (edits.length === 0 && removed.size === 0) return deal
    const editedMonths = new Set(edits.map((item) => item.month))
    const hadColor = dealHasColorData(deal)
    const monthlyPayments: Record<string, number> = { ...(deal.monthly_payments ?? {}) }
    const monthlyConfirmed: Record<string, number> = { ...(deal.monthly_confirmed ?? {}) }
    const monthlyHighConf: Record<string, number> = { ...(deal.monthly_high_conf ?? {}) }
    const monthlyRed: Record<string, boolean> = { ...(deal.monthly_red ?? {}) }
    const raw: Record<string, unknown> = { ...(deal.raw ?? {}) }
    // 주차 맵은 raw.weeklyPayments 가 정석. 없으면(재동기화 전 레거시) 파이프라인이 읽던 값으로 채워 둔다.
    let weekly: Record<string, unknown> = recordOf<unknown>(raw.weeklyPayments) ?? { ...(sheetRowById.get(deal.id)?.weeklyPayments ?? {}) }
    let weeklyColors = recordOf<unknown>(raw.weeklyColors)
    let monthlyPending = recordOf<unknown>(raw.monthlyPending)
    let pendingWeeks = recordOf<unknown>(raw.pendingWeeks)
    // 읽는 시점 확도 재료(F-08·F-15) — 정정한 달에 시트의 빨간 예정 칸·월≠주 합 표시가 남으면 정정 값이 잘리거나 올라간다.
    let pendingCells = recordOf<unknown>(raw.pendingCells)
    let monthWeekMismatch = recordOf<unknown>(raw.monthWeekMismatch)

    // 무색상 딜에 제자리 정정이 들어가면 나머지 달의 폴백(과거~이번 달 확정)을 확정 맵으로 옮겨 적는다.
    if (!hadColor && editedMonths.size > 0) {
      for (const [ym, value] of Object.entries(deal.monthly_payments ?? {})) {
        if (editedMonths.has(ym) || removed.has(ym)) continue
        const total = Number(value)
        if (!Number.isFinite(total)) continue
        const confirmed = confirmedMonthAmountWithColor(deal, ym, total, false, input.todayYm)
        monthlyConfirmed[ym] = confirmed
        if (confirmed !== 0 && confirmed === total) monthlyRed[ym] = true
      }
    }

    const touched = new Set([...editedMonths, ...removed])
    for (const month of touched) {
      delete monthlyPayments[month]
      delete monthlyConfirmed[month]
      delete monthlyHighConf[month]
      delete monthlyRed[month]
      weekly = withoutKey(weekly, month) ?? {}
      weeklyColors = withoutKey(weeklyColors, month)
      monthlyPending = withoutKey(monthlyPending, month)
      pendingWeeks = withoutKey(pendingWeeks, month)
      pendingCells = withoutKey(pendingCells, month)
      monthWeekMismatch = withoutKey(monthWeekMismatch, month)
    }
    // 떼어 낸 달: 원본에 색이 있었으면 그 달 키 하나를 남겨 색 보유를 지킨다(화면의 confidenceColorHint 와 같다).
    if (hadColor) for (const month of removed) monthlyRed[month] = false
    // 제자리 정정: 정정 값으로 바꿔 쓴다. 그 달 red 키는 늘 둔다(장부 확도 맵이 정본 — 폴백 금지).
    for (const item of edits) {
      const month = item.month
      monthlyPayments[month] = monthTotal(item.row, month)
      const confirmed = item.row.monthlyConfirmed?.[month]
      if (confirmed != null) monthlyConfirmed[month] = confirmed
      const high = item.row.monthlyHighConfidence?.[month]
      if (high != null) monthlyHighConf[month] = high
      monthlyRed[month] = item.row.monthlyRed?.[month] ?? false
      const weeks = item.row.weeklyPayments?.[month]
      if (weeks) weekly = { ...weekly, [month]: [...weeks] }
    }

    raw.weeklyPayments = weekly
    // 주차 맵이 비면 파이프라인(weeklyPaymentsFromRaw)이 레거시 폴백으로 raw.row(시트 원문 칸)를 다시 읽어 정정한 달에
    // 옛 시트 주차 값을 되살린다 — 그때만 원문 칸을 뺀다(다른 달은 원래도 주차 값이 없던 딜이다).
    if (Object.keys(weekly).length === 0) delete raw.row
    if (weeklyColors) raw.weeklyColors = weeklyColors
    if (monthlyPending) raw.monthlyPending = monthlyPending
    if (pendingWeeks) raw.pendingWeeks = pendingWeeks
    // 빈 맵은 키를 지운다 — parseRev 처럼 값이 있을 때만 싣는다.
    if (pendingCells && Object.keys(pendingCells).length > 0) raw.pendingCells = pendingCells
    else delete raw.pendingCells
    if (monthWeekMismatch && Object.keys(monthWeekMismatch).length > 0) raw.monthWeekMismatch = monthWeekMismatch
    else delete raw.monthWeekMismatch
    raw.ledgerOverlay = {
      correctedMonths: [...editedMonths].sort(),
      detachedMonths: [...removed].sort(),
      materializedFallback: !hadColor && editedMonths.size > 0,
    }
    return {
      ...deal,
      monthly_payments: monthlyPayments,
      monthly_confirmed: monthlyConfirmed,
      monthly_high_conf: monthlyHighConf,
      monthly_red: monthlyRed,
      raw,
    }
  })

  // 신규 행 + 원본 못 찾은 정정 → 장부 딜
  const resolvedIds = new Set(plan.resolved.map((item) => item.row.id))
  for (const row of plan.appliedRows) {
    if (resolvedIds.has(row.id)) continue
    if (row.draftId?.startsWith("local-")) continue
    const candidate = plan.candidateByRowId.get(row.id)
    const contractTarget = snapshotField(candidate?.snapshot ?? null, "contractTarget") != null ? row.contractTarget ?? null : null
    ledgerDeals.push(ledgerDealFromRow(row, candidate, contractTarget))
  }

  return {
    deals: [...mergedDeals, ...ledgerDeals],
    unresolved: plan.unresolved,
    superseded: plan.superseded,
    drift: plan.drift,
    duplicates: plan.duplicates,
  }
}
