"use client"

// REV 매트릭스 순수 로직 분리(품질 감사 2026-09-10 — #2 번들 다이어트).
// ledger/RevMatrix.tsx(2,158줄)는 JSX 프레젠테이션(행/셀/팝오버/붙여넣기 다이얼로그)과 순수
// 좌표·잠금·pending·붙여넣기계획 로직 + useMatrixEditor 훅이 한 파일에 섞여 있었다. 기본 렌즈
// (REV)에서도 SalesLedgerWorkbench가 그 파일을 "정적" import(컴포넌트 5종 + 순수 함수 다수를
// 같은 import 문으로)해, 컴포넌트만 다시 next/dynamic으로 감싸도 이 로직들이 같은 모듈에 남아
// 있으면 정적 import 엣지가 그대로 남아 전체 파일이 결국 메인 청크에 딸려 들어간다 — 분리 자체가
// 무효화된다. 그래서 "JSX가 없는 것"(순수 함수·상수·타입 + useMatrixEditor — 훅은 JSX를 반환하지
// 않아 .ts로 옮겨도 무방하고, SalesLedgerWorkbench 최상위에서 무조건 호출되는 훅이라 애초에
// dynamic() 대상이 될 수 없다)을 전부 이 파일로 물리 이동했다. 로직 자체는 문자 그대로 무변경 —
// RevMatrix.tsx는 이 파일에서 다시 import해 자기 컴포넌트 내부에서 그대로 쓰고, 기존 표면 유지를
// 위해 재수출도 한다. 회귀 테스트(tests/branch/rail-lock-precheck 등)는 SalesLedgerWorkbench의
// 재수출 경로로 import하므로 이 물리 이동만으로는 영향받지 않는다(직접 실행 검증, 소스 스캔 아님).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { normalizedAccountKey } from "@/lib/branch/account-key"

import { confidenceFromShortcut } from "./confidence-shortcuts"
// 라운드 4 P1-5 — buildPasteNewRowInputs가 만드는 초안의 타입. 이 파일은 순수 로직만 담아
// useLedgerDraftQueue(훅)를 값으로 import하지 않으므로 type-only만 가져온다(순환 없음 —
// useLedgerDraftQueue.ts는 rev-matrix-logic을 import하지 않는다).
import type { LedgerDraftInput } from "./useLedgerDraftQueue"

import {
  draftConfidenceFromMetadata,
  isDraftConfidence,
  mapNumberValue,
  mergedWeeklyFromMetadata,
  metadataString,
  rowMonthAmount,
  rowProductCategory,
  rowWeeklySplit,
  weeklyConfidenceFromMetadata,
  type DraftConfidence,
  type LedgerDraft,
  type LedgerRevenueRow,
  type RevMonthlyBucket,
  type RevProductCategory,
} from "./shared"

// 매트릭스 1개 열(회계월) = 필터 반영 그랜드토탈 + 해당 월 목표(DSH 시리즈, 없으면 null).
export interface RevMatrixColumn extends RevMonthlyBucket {
  month: string
  label: string
  current: boolean
  goal: number | null
}

// 다중월 밀도 매트릭스 열 폭(px). 요약 셀 12칸×64 + 고객 200 + 상품 56 + 연간 96 ≈ 1120.
export const MATRIX_CUSTOMER_W = 200
export const MATRIX_PRODUCT_W = 56
export const MATRIX_MONTH_W = 64
export const MATRIX_WEEK_W = 52 // 월 확장(상세시트) 시 w1~w5 각 칸 — 금액 가독성 위해 넓게(가로 스크롤 허용)
export const MATRIX_ANNUAL_W = 96

// 매트릭스 행 밀도(표시만 — 셀 폭·편집 로직 불변). localStorage에 저장해 재방문 시 복원.
export type MatrixDensity = "condensed" | "regular" | "relaxed"
export const MATRIX_DENSITY_STORAGE_KEY = "classin:rev-matrix-density"
export const MATRIX_DENSITY_OPTIONS: Array<{ id: MatrixDensity; label: string; title: string }> = [
  { id: "condensed", label: "좁게", title: "행 높이를 좁혀 더 많은 행을 한 화면에 봅니다" },
  { id: "regular", label: "보통", title: "기본 행 높이" },
  { id: "relaxed", label: "넓게", title: "행 높이를 넓혀 여유 있게 봅니다" },
]
export function isMatrixDensity(value: unknown): value is MatrixDensity {
  return value === "condensed" || value === "regular" || value === "relaxed"
}

// 셀 좌표 = 행 id + 회계월. 편집가능 셀 순회(방향키/Tab)의 단위.
export interface MatrixCellCoord {
  rowId: string
  month: string
  week?: number // 0~4 = 확장된 월의 w1~w5 주차 칸. 없으면 월 요약 셀.
}

// 셀 좌표 → 안정 키. 월 셀은 `rowId::month`(Phase 2와 동일), 주차 셀은 `rowId::month::wN`.
// 월 셀 키를 그대로 유지해 기존 순회/pending 매칭 회귀를 막는다.
export function matrixCoordKey(coord: MatrixCellCoord): string {
  return coord.week == null ? `${coord.rowId}::${coord.month}` : `${coord.rowId}::${coord.month}::w${coord.week + 1}`
}

// 두 좌표가 같은 세로 열(같은 월·같은 주차)인지 — 아래/위 이동·fill-down 소스 판정용.
function matrixSameColumn(a: MatrixCellCoord, b: MatrixCellCoord): boolean {
  return a.month === b.month && (a.week ?? -1) === (b.week ?? -1)
}

// 좌표 → 그 셀에 걸린 미검수 초안(있으면). 주차 좌표면 주차 키 우선, 없으면 월 키로 폴백
// (월 단위로만 걸린 초안도 주차 칸 재편집 시 "이미 이 달에 초안이 있다"는 신호로 쓴다).
// matrixCellValue(재편집 시작값)·matrixCellConfidence·onCommitCell(PATCH-vs-POST 타겟)이 공유.
export function lookupMatrixPending(pendingByCell: Map<string, MatrixPendingDraft>, coord: MatrixCellCoord): MatrixPendingDraft | null {
  const weekKey = coord.week != null ? matrixCoordKey(coord) : null
  return (weekKey ? pendingByCell.get(weekKey) : null) ?? pendingByCell.get(matrixCoordKey({ rowId: coord.rowId, month: coord.month })) ?? null
}

// metadata.week 문자열("w1".."w5") → 0~4 인덱스. "month"/그 외/누락이면 null.
export function weekIndexFromToken(token: string | null | undefined): number | null {
  if (!token) return null
  const match = /^w([1-5])$/.exec(token)
  return match ? Number(match[1]) - 1 : null
}

// 적용된 초안행의 weeklyPayments 구성. draft metadata.week가 wN이면 그 주차에 금액을 얹어
// { [month]: [.., amount, ..] }를 만든다(주차 합==월합이라 rowWeeklyMismatch 오탐 없음).
// week가 "month"/누락이면 주차 정보 없음 → {} (기존 동작 유지, month-only로 렌더).
function weeklyPaymentsFromWeekToken(month: string, amount: number, weekToken: string | null | undefined): Record<string, number[]> {
  const weekIdx = weekIndexFromToken(weekToken)
  if (weekIdx == null) return {}
  const weeks = Array.from({ length: 5 }, (_, index) => (index === weekIdx ? amount : 0))
  return { [month]: weeks }
}

// 적용된 초안행의 weeklyPayments 복원: 주차 병합 초안(metadata.weekly)이 있으면 그 배열을
// 그대로(단일 주차 토큰보다 우선) 쓴다 — explicit 주차 행의 주차 셀 편집이 나머지 주차를
// 보존(월 금액=주차 합 재기재)하기 위한 경로. 없으면 기존 단일 주차 토큰 규약으로 폴백.
export function weeklyPaymentsFromDraftMetadata(
  month: string,
  amount: number,
  metadata: Record<string, unknown> | null | undefined,
): Record<string, number[]> {
  const merged = mergedWeeklyFromMetadata(metadata)
  if (merged) return { [month]: merged }
  return weeklyPaymentsFromWeekToken(month, amount, metadataString(metadata, "week"))
}

// 셀에 걸린 미검수(draft|checked) 초안 요약. 낙관적 앰버 표시·툴팁용 + 재편집/커밋 타겟 판정용.
// id: PATCH 타겟(같은 셀 재편집 시 새 초안 대신 이 초안을 갱신). weekly: 주차 병합 배열(metadata.weekly) —
// 있으면 주차별 금액 조회에 쓴다(없으면 amount가 곧 그 셀 금액, 주차 단일대체 규약과 동일).
export interface MatrixPendingDraft {
  id: string
  amount: number
  confidence: DraftConfidence
  weekly: number[] | null
  /** 주차별 확도(metadata.weeklyConfidence, 라운드 3 P1) — 주차 셀 팝오버 기본값이 슬롯 상태를
      우선하도록 pending 요약에 동봉한다. 없으면 null(초안 단위 confidence 폴백). */
  weeklyConfidence: (DraftConfidence | null)[] | null
}

// pending 요약에서 좌표(coord) 기준 실제 셀 금액을 뽑는다. 주차 좌표 + weekly 병합 배열이 있으면
// 그 주차 값, 아니면(월 좌표거나 병합 배열이 없는 단일대체 케이스) summary.amount 그대로.
export function pendingCellAmount(pending: MatrixPendingDraft, week?: number): number {
  if (week != null && pending.weekly) return pending.weekly[week] ?? 0
  return pending.amount
}

// 입력 레일 저장 시 이중계상 회피 대상 판정(품질 웨이브 3, 항목 3) — 매트릭스 셀 재편집(onCommitCell)과
// 동일한 lookupMatrixPending 판정을, 레일 폼이 다루는 좌표(딜 행 rowId + 타겟 월/주차)에 그대로 적용한다.
// 있으면 saveDraft가 새 POST(createDraft) 대신 이 초안을 PATCH(updateDraft)로 갱신해 같은 셀에
// 열린 초안이 중복 생성되는 것을 막는다 — 두 초안이 모두 적용되면 같은 셀 매출이 이중 계상된다.
// excludeDraftId: 지금 편집 중인 초안 자신(재저장 시 자기 자신과의 "충돌"로 오탐하지 않게) —
// 신규 저장(saveDraft)에서는 항상 null.
// 기간이동(period-shift)처럼 타겟 월이 실제로 다르면 coord.month가 달라 매칭되지 않으므로,
// 같은 딜이라도 다른 달을 타겟하는 정당한 별건 초안까지 막지 않는다(차단이 아니라 타겟 재지정일 뿐).
export function railDedupTarget(
  pendingByCell: Map<string, MatrixPendingDraft>,
  rowId: string,
  month: string,
  weekToken: string | null | undefined,
  excludeDraftId: string | null,
): MatrixPendingDraft | null {
  const weekIdx = weekIndexFromToken(weekToken)
  const coord: MatrixCellCoord = weekIdx == null ? { rowId, month } : { rowId, month, week: weekIdx }
  const pending = lookupMatrixPending(pendingByCell, coord)
  if (!pending || pending.id === excludeDraftId) return null
  return pending
}

// 품질 웨이브 4 — 항목 2: new-row 저장 전, 같은 고객명·월 조합의 열린(draft|checked) 신규 초안이
// 이미 있는지 검사한다. edit-row의 railDedupTarget(같은 셀 감지 시 자동 PATCH 재지정)과 달리
// new-row는 아직 매트릭스에 대응 행이 없어 "같은 딜"인지 확정할 수 없다 — 그래서 저장을 막거나
// 재지정하지 않고 그대로 새로 저장한 뒤, 사용자가 판단하도록 경고만 낸다.
export function findOpenNewRowDuplicate(
  drafts: LedgerDraft[],
  customer: string,
  month: string,
): LedgerDraft | null {
  const normalizedCustomer = customer.trim().toLowerCase()
  if (!normalizedCustomer) return null
  return (
    drafts.find(
      (draft) =>
        draft.kind === "new-row" &&
        (draft.status === "draft" || draft.status === "checked") &&
        draft.month === month &&
        draft.customer.trim().toLowerCase() === normalizedCustomer,
    ) ?? null
  )
}

// 주차 칸에 보일 대기 초안(라운드 5 R-2·R-W). 정확히 그 주차 키에 걸린 초안이 먼저고, 없으면 같은 달의 주차 병합
// 초안(weekly 배열 — 여러 주차를 연속 편집한 결과)에서 그 주차 값을 꺼낸다. 병합 초안이 그 주차를 바꾸지 않았으면
// (표시값과 같으면) 대기 표시를 하지 않는다 — 달 전체가 대기 중이라도 바뀐 칸만 표시해 소음을 줄인다.
// 월 단위 한 금액 초안(weekly 없음)은 주차별로 나눌 근거가 없어 주차 칸에는 표시하지 않는다(기존 규약).
export function pendingWeekDisplay(
  pendingByCell: Map<string, MatrixPendingDraft> | null | undefined,
  rowId: string,
  month: string,
  week: number,
  display: number,
): { pending: MatrixPendingDraft; amount: number } | null {
  if (!pendingByCell) return null
  const exact = pendingByCell.get(matrixCoordKey({ rowId, month, week }))
  if (exact) return { pending: exact, amount: pendingCellAmount(exact, week) }
  const monthPending = pendingByCell.get(matrixCoordKey({ rowId, month }))
  if (!monthPending?.weekly) return null
  const amount = Math.max(Number(monthPending.weekly[week] ?? 0) || 0, 0)
  if (amount === Math.round(display)) return null
  return { pending: monthPending, amount }
}

// 펼친 달의 주차 칸 입력값(RevMatrixWeekCells props) — 행 표시(RevMatrixDealRow)와 복사(matrixDisplayedCellAmount)가
// 같은 산식을 쓰도록 한 곳에 둔다. 월합계만 있는 행은 주차 배열을 비우고 월합계를 따로 넘긴다(W5에 얹어 보임).
export function matrixWeekInputs(
  row: LedgerRevenueRow,
  month: string,
): { weeks: number[]; inferred: boolean; monthOnlyAmount: number } | null {
  const split = rowWeeklySplit(row, month)
  if (split.source === "empty") return null
  return {
    weeks: split.source === "explicit" || split.source === "inferred" ? split.weeks : [0, 0, 0, 0, 0],
    inferred: split.source === "inferred",
    monthOnlyAmount: split.source === "month-only" ? split.total : 0,
  }
}

// 매트릭스 한 칸에 "보이는" 금액(라운드 5 B1 — 선택 셀 Ctrl+C). 월 칸 = 대기 초안 금액 → 장부 월 금액,
// 주차 칸 = 주차 표시값(월합계만 행은 W5에 월합계) → 그 주차의 대기 초안 값(pendingWeekDisplay).
// 커밋 기준값(워크벤치 matrixCellValue)과는 다를 수 있다 — 월 단위 초안만 걸린 주차 칸은 재편집 시작값이
// 월 초안 금액이지만, 칸에는 주차 표시값이 보이고 복사도 그 값을 낸다.
export function matrixDisplayedCellAmount(
  row: LedgerRevenueRow | null | undefined,
  coord: MatrixCellCoord,
  pendingByCell: Map<string, MatrixPendingDraft> | null | undefined,
): number {
  if (coord.week == null) {
    const pending = pendingByCell?.get(matrixCoordKey({ rowId: coord.rowId, month: coord.month }))
    if (pending) return pending.amount
    return row ? rowMonthAmount(row, coord.month) : 0
  }
  const inputs = row ? matrixWeekInputs(row, coord.month) : null
  const display = inputs
    ? (computeWeekCellStates(inputs.weeks, inputs.monthOnlyAmount, false)[coord.week]?.display ?? 0)
    : 0
  return pendingWeekDisplay(pendingByCell, coord.rowId, coord.month, coord.week, display)?.amount ?? display
}

// 주차 칸 편집의 병합 기준(라운드 5 R-W). explicit 주차가 있는 행의 주차 셀을 고치면 나머지 주차를 보존해
// 5칸 배열(metadata.weekly)로 싣는다. 그 "나머지 주차"의 기준은 같은 달에 이미 대기 중인 초안의 주차 배열이
// 먼저다 — 행 표시값(시트·적용분)을 기준으로 하면 W1을 고친 뒤 W2를 고칠 때 두 번째 저장이 W1을 시트 원값으로
// 되돌린 채 같은 초안을 PATCH해 첫 편집이 사라졌다. 대기 초안이 주차 배열 없이 월 단위 한 금액이면(레일 단일
// 금액 등) 주차별로 나눌 근거가 없으므로 행 표시값으로 돌아간다(기존 규약).
export function mergeWeeklyCellEdit(input: {
  rowWeeks: readonly number[]
  pendingWeekly: readonly number[] | null | undefined
  week: number
  amount: number
  confidence: DraftConfidence
  baseWeeklyConfidence: ReadonlyArray<DraftConfidence | null> | null | undefined
}): { weeks: number[]; total: number; weeklyConfidence: Array<DraftConfidence | null> } {
  const base = input.pendingWeekly && input.pendingWeekly.length > 0 ? input.pendingWeekly : input.rowWeeks
  const weeks = Array.from({ length: 5 }, (_, index) => Math.max(Number(base[index] ?? 0) || 0, 0))
  weeks[input.week] = Math.max(input.amount, 0)
  const weeklyConfidence = weeks.map((value, index) => {
    if (value <= 0) return null
    if (index === input.week) return input.confidence
    return input.baseWeeklyConfidence?.[index] ?? null
  })
  return { weeks, total: weeks.reduce((sum, value) => sum + value, 0), weeklyConfidence }
}

// 미검수(draft|checked) 초안 → 셀 낙관적 표시 + 재편집/커밋 타겟 판정 맵. drafts에서 파생(별도 버퍼 없음).
// 매칭: 초안 sourceDealId == 행 sourceDealId(또는 id) && 초안 month == 셀 month.
// 월 키(`rowId::month`)와 주차 키(`rowId::month::wN`)를 각각 채운다:
//   - 월 키: 그 달에 걸린 최신 초안(주차 초안 포함) → 접힌 월 셀 앰버 점 + 월 단위 재편집 타겟.
//   - 주차 키: metadata.week가 wN인 초안만 → 확장 주차 칸 앰버 점 + 그 주차 재편집 타겟.
// 같은 키에 여러 초안이 있으면 가장 최근(drafts 배열 앞쪽) 것을 표시 — 컴포넌트는 항상 최신순으로 prepend한다.
// 순수 함수로 분리(useMemo 밖) — 컴포넌트 렌더 없이 회귀 테스트(같은 셀 재편집 시 초안 1건 유지) 가능.
export function buildMatrixPendingByCell(
  drafts: LedgerDraft[],
  visibleDealRows: LedgerRevenueRow[],
): Map<string, MatrixPendingDraft> {
  const map = new Map<string, MatrixPendingDraft>()
  const pending = drafts.filter((draft) => draft.status === "draft" || draft.status === "checked")
  for (const row of visibleDealRows) {
    const dealKey = row.sourceDealId ?? row.id
    for (const draft of pending) {
      const draftDealId = draft.sourceDealId ?? metadataString(draft.metadata, "sourceDealId")
      if (draft.kind === "edit-row" ? draftDealId !== dealKey : draft.customer.trim() !== row.customer.trim()) continue
      const summary: MatrixPendingDraft = {
        id: draft.id,
        amount: draft.amount,
        confidence: draftConfidenceFromMetadata(draft.metadata),
        weekly: mergedWeeklyFromMetadata(draft.metadata),
        weeklyConfidence: weeklyConfidenceFromMetadata(draft.metadata),
      }
      const monthKey = matrixCoordKey({ rowId: row.id, month: draft.month })
      if (!map.has(monthKey)) map.set(monthKey, summary) // 월 셀: 첫(=최신) 초안
      const weekIdx = weekIndexFromToken(metadataString(draft.metadata, "week"))
      if (weekIdx != null) {
        const weekKey = matrixCoordKey({ rowId: row.id, month: draft.month, week: weekIdx })
        if (!map.has(weekKey)) map.set(weekKey, summary) // 주차 칸: 그 주차 첫(=최신) 초안
      }
    }
  }
  return map
}

// 편집 input이 받는 문자열 → 원 단위 정수 + 음수 클램프 여부. rail의 safeAmount와 동일 규칙
// (¥·콤마·공백 제거). 만 단위 입력은 지원하지 않는다(rail이 원 단위 String을 쓰므로 단위 고정).
// clamped=true면 파싱값이 음수라 0으로 잘렸다는 뜻 — 호출부가 무경고로 삼키지 않도록 신호를 남긴다.
function parseMatrixAmountResult(value: string): { amount: number; clamped: boolean } {
  const normalized = value.replace(/[^\d.-]/g, "")
  if (!normalized) return { amount: 0, clamped: false }
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric)) return { amount: 0, clamped: false }
  const rounded = Math.round(numeric)
  return { amount: Math.max(rounded, 0), clamped: rounded < 0 }
}

function parseMatrixAmount(value: string): number {
  return parseMatrixAmountResult(value).amount
}

// 딜행 × 월 셀이 확정 잠금(편집 불가)인지. monthlyRed 플래그 또는 확정액이 그 달 금액을 덮으면 잠금.
// 적용된 초안(ledgerOrigin==="draft")은 확도와 무관하게 잠금 — 셀 편집이 만드는 새 초안은 sourceDealId
// 기준이라 장부 반영분과 겹치면 이중계상이 되므로, 적용분 수정·취소는 입력 큐에서만 한다.
//
// correctedMonths(품질 웨이브 4 — 항목 1, 회귀 방지): 이 행(원본 시트 딜)의 이 달이 이미 적용된 수정
// (edit-row) 초안으로 대체됐는지 — editRowOverrideMonths.get(row.id). rows 파생 단계(adjustedSheetRows)가
// 그 달의 원본 금액을 지워 amount<=0으로 만들기 때문에, 이 체크가 없으면 아래 "미입력=편집 가능" 분기로
// 새어 정정 적용 직후 원본 셀이 재편집 가능해진다 — 새 셀 입력이 쌓이면 적용된 정정 + 신규 초안이 같은
// (딜, 월)에 겹쳐 이중계상된다. 그래서 금액 판정보다 먼저, 금액과 무관하게 잠근다.
export function isMatrixCellLocked(row: LedgerRevenueRow, month: string, correctedMonths?: Set<string> | null): boolean {
  if (correctedMonths?.has(month)) return true
  const amount = rowMonthAmount(row, month)
  if (amount <= 0) return false // 미입력 = 편집 가능(예정 추가)
  if (row.ledgerOrigin === "draft" && row.draftMonth === month) return true
  if (row.monthlyRed?.[month]) return true
  const confirmed = mapNumberValue(row.monthlyConfirmed, month)
  return confirmed > 0 && confirmed >= amount
}

// 딜행 셀이 편집 가능한지 — 딜행(그룹 소계 제외)이면서 잠금 아님. 미래월 제한은 두지 않는다.
export function isMatrixCellEditable(row: LedgerRevenueRow, month: string, correctedMonths?: Set<string> | null): boolean {
  return !isMatrixCellLocked(row, month, correctedMonths)
}

// 품질 웨이브 7 — 항목 1: 레일 폼(InputRailSection) 저장이 실제로 targeting할 (행, 월)을 찾는다.
// new-row(신규 고객)는 대응 매트릭스 행이 없어 항상 undefined — 잠금 사전검사 대상이 아니다.
// editingDraft가 있으면(레일에서 초안을 편집 중) 그 초안의 딜 정체성(sourceDealId 우선,
// metadata.sourceDealId 폴백 — saveEditedDraft의 dedupRow 판정과 동일 규약)으로 대응 행을 찾고,
// 없으면(방금 선택한 행 기준 새 edit-row 초안을 만드는 중) selectedRow를 그대로 쓴다.
export function resolveDraftEditTargetRow(
  editingDraft: LedgerDraft | null,
  selectedRow: LedgerRevenueRow | null,
  rowByDealKey: Map<string, LedgerRevenueRow>,
): LedgerRevenueRow | undefined {
  if (!editingDraft) return selectedRow ?? undefined
  if (editingDraft.kind !== "edit-row") return undefined
  const dealKey = editingDraft.sourceDealId ?? metadataString(editingDraft.metadata, "sourceDealId")
  return dealKey ? rowByDealKey.get(dealKey) : undefined
}

// 품질 웨이브 7 — 항목 1: 레일 폼이 지금 저장하면 그 (행, 월) 셀이 이미 확정/장부반영 등으로
// 잠긴 상태인지 판정한다. isEditRowTarget이 false면(new-row 저장, 또는 아직 edit-row를 만들 수
// 없는 상태) 애초에 잠길 대상이 없으므로 항상 false — saveDraft(new-row)/신규 입력 버튼은
// 이 사전검사로 절대 막히지 않는다. isMatrixCellLocked(매트릭스 셀 잠금)와 동일 판정을 재사용해
// 제출 전에 서버 PATCH가 409로 튕기는 헛수고를 없앤다.
export function isDraftFormTargetLocked(
  isEditRowTarget: boolean,
  targetRow: LedgerRevenueRow | null | undefined,
  month: string,
  correctedMonths?: Set<string> | null,
): boolean {
  if (!isEditRowTarget || !targetRow) return false
  return isMatrixCellLocked(targetRow, month, correctedMonths)
}

// ── SL-2: 엑셀 클립보드 TSV 붙여넣기 → 초안 큐 벌크 라우팅 ──────────────────────
// 선택된 월 셀을 앵커로 TSV 그리드를 (행: 보이는 딜행 순서 아래로, 열: 회계월 순서 오른쪽으로)
// 투영해 "무엇이 어떤 셀로 가는지" 프리뷰 계획을 만든다. 커밋은 셀 편집과 완전히 같은
// onCommitCell → createDraft(초안 2단 게이트: draft → checked → apply) 경로만 사용한다 —
// 새 저장 경로 없음. 잠금 셀(시트확정/장부반영)은 계획 단계에서 제외되고, 주차 칸은 대상이
// 아니므로 B1 주차 병합 규약과 셀 상태기계는 문자 단위로 불변이다.
//
// 라운드 4 P1-5 — 이름 매칭: 시트에서 복사한 블록의 행 순서가 화면 정렬과 다르면 위치 투영은
// 엉뚱한 행에 값을 꽂는다(프리뷰가 막아 주지만 다시 쳐야 함). 첫 열이 숫자형이 아니면 고객명
// 열로 보고 normalizedAccountKey(SSOT — customer-suggest.ts와 동일 키)로 기존 딜 행에 매칭해
// 행 순서와 무관하게 투영한다. 위치 투영으로는 애초에 대상 행이 없어 붙여넣을 수 없던, 시트에만
// 있는 새 고객은 매칭 실패(unmatched)로 보존해두고, 프리뷰에서 승인한 이름만
// buildPasteNewRowInputs(아래)가 new-row 초안으로 만든다.

export interface MatrixPasteCellPlan {
  rowId: string
  customer: string
  productCategory: Exclude<RevProductCategory, "all">
  month: string
  current: number
  next: number
  status: "apply" | "locked" | "unchanged"
}

// 라운드 4 P1-5 — 매칭되는 딜 행이 없는 이름 한 줄과 그 금액 칸(빈 칸·0 제외 보존). 프리뷰의
// "시트에 없는 고객" 섹션이 그대로 렌더하고, 체크된 이름만 buildPasteNewRowInputs가 소비한다.
export interface MatrixPasteUnmatchedRow {
  name: string
  cells: Array<{ month: string; amount: number }>
}

export interface MatrixPastePlan {
  anchorCustomer: string
  // "positional"(기존) = 앵커 행 기준 위치 투영. "by-name"(P1-5) = 첫 열을 고객명으로 보고
  // normalizedAccountKey로 매칭 — 이 모드에서 앵커 행은 월 열 시작점(colStart) 제공에만 쓰인다.
  mode: "positional" | "by-name"
  cells: MatrixPasteCellPlan[]
  applyCount: number
  lockedCount: number
  unchangedCount: number
  nonNumericCount: number
  outOfRangeCount: number
  // by-name 모드에서 정확히 1개 딜 행에 매칭되어 투영된 행 수(positional 모드는 항상 0).
  matchedRowCount: number
  // 같은 정규화 키의 딜 행이 2개 이상(같은 고객의 상품군별 행 등)이라 어느 행인지 정할 수 없어
  // 셀을 만들지 않고 건너뛴 이름들 — 프리뷰가 "매트릭스에서 직접 입력" 안내로 노출한다.
  ambiguousNames: string[]
  // 매칭되는 딜 행이 0개인 이름과 그 금액 칸 — 프리뷰의 "새 행으로 생성" 체크 대상(승인제).
  unmatched: MatrixPasteUnmatchedRow[]
  // 라운드 5 R-1 — 장부에는 있지만 지금 화면(현재 페이지·펼친 행·필터)에 없는 고객 이름. 셀을 만들지도,
  // "새 행" 후보로 올리지도 않는다(화면 밖 행을 몰래 고치지도, 같은 고객을 중복 행으로 만들지도 않기).
  // 프리뷰가 "필터·페이지를 풀고 다시 붙여넣으세요"로 안내한다.
  outOfViewNames: string[]
}

// 오조작(전체 시트 복사 등) 방어 상한 — 12개월 × 50행. 넘치는 칸은 범위 밖으로 집계만 한다.
// by-name 모드도 매칭 셀 + 미매칭 보존 칸을 합산해 같은 예산 하나를 그대로 쓴다(라운드 4 P1-5).
const MATRIX_PASTE_MAX_CELLS = 600

function parseTsvGrid(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop()
  return lines.map((line) => line.split("\t"))
}

// 전체가 숫자형(통화기호·콤마·공백·부호 허용)인 칸만 금액으로 인정 — "Q4 2026"·"2026-04" 같은
// 숫자 섞인 라벨을 금액으로 오독(42026·0 덮어쓰기)하지 않는다. 라운드 4 P1-5의 이름 열 판정도
// 같은 기준을 재사용한다(새 숫자형 판정 기준을 만들지 않는다).
function isNumericMatrixToken(raw: string): boolean {
  return /^[\s¥₩$,.\-+]*\d[\d\s¥₩$,.\-+]*$/.test(raw) && Number.isFinite(Number(raw.replace(/[^\d.-]/g, "")))
}

// 라운드 4 P1-5 — 파싱된 그리드의 첫 열이 고객명 열인지 판정: 비어 있지 않은 칸 중 과반이
// 비숫자면 이름 열로 본다. 첫 열이 전부 빈 칸이면 판단 근거가 없어 기존 위치 투영으로 폴백한다.
function detectPasteMode(grid: string[][]): MatrixPastePlan["mode"] {
  let nonEmpty = 0
  let nonNumeric = 0
  for (const row of grid) {
    const raw = (row[0] ?? "").trim()
    if (!raw) continue
    nonEmpty += 1
    if (!isNumericMatrixToken(raw)) nonNumeric += 1
  }
  return nonEmpty > 0 && nonNumeric * 2 > nonEmpty ? "by-name" : "positional"
}

export function buildMatrixPastePlan(
  text: string,
  anchor: MatrixCellCoord,
  dealRows: LedgerRevenueRow[],
  months: string[],
  // 품질 웨이브 4 — 항목 1: 정정 적용으로 재잠긴 (딜, 월) 칸을 붙여넣기 계획에서도 locked로
  // 판정하기 위한 dealId → 대체된 월 집합(editRowOverrideMonths).
  overrideMonthsByRow: Map<string, Set<string>>,
  // 라운드 5 R-1 — 장부 전체 행(페이지·펼침·필터 무관). by-name 모드에서 "보이는 행에 없는 이름"이 장부에
  // 아예 없는 고객인지(새 행 후보), 화면 밖에 있을 뿐인지(건너뜀)를 가른다. 생략하면 예전처럼 보이는 행만 본다.
  allRows?: readonly LedgerRevenueRow[],
): MatrixPastePlan | null {
  const grid = parseTsvGrid(text)
  if (grid.length === 0) return null
  const rowStart = dealRows.findIndex((row) => row.id === anchor.rowId)
  const colStart = months.indexOf(anchor.month)
  if (rowStart < 0 || colStart < 0) return null

  const mode = detectPasteMode(grid)
  const plan: MatrixPastePlan = {
    anchorCustomer: dealRows[rowStart].customer,
    mode,
    cells: [],
    applyCount: 0,
    lockedCount: 0,
    unchangedCount: 0,
    nonNumericCount: 0,
    outOfRangeCount: 0,
    matchedRowCount: 0,
    ambiguousNames: [],
    unmatched: [],
    outOfViewNames: [],
  }
  let cellBudget = MATRIX_PASTE_MAX_CELLS

  if (mode === "by-name") {
    // 이름 → normalizedAccountKey(SSOT) → 같은 키의 딜 행들. 그리드를 화면 순서와 무관하게
    // 그대로 순회한다 — 시트 행 순서가 화면 정렬과 달라도 이름으로 정확히 투영하는 것이 목적.
    const rowsByKey = new Map<string, LedgerRevenueRow[]>()
    for (const dealRow of dealRows) {
      const key = normalizedAccountKey(dealRow.customer)
      const bucket = rowsByKey.get(key)
      if (bucket) bucket.push(dealRow)
      else rowsByKey.set(key, [dealRow])
    }
    const seenAmbiguous = new Set<string>()
    // 화면 밖 존재 판정용 — 정규화 키만 모은다(행 자체는 쓰지 않는다: 보이지 않는 행에는 셀을 만들지 않는다).
    const allKeys = new Set<string>()
    for (const row of allRows ?? []) {
      const key = normalizedAccountKey(row.customer)
      if (key) allKeys.add(key)
    }
    const seenOutOfView = new Set<string>()
    for (let r = 0; r < grid.length; r += 1) {
      const name = (grid[r][0] ?? "").trim()
      if (!name) continue // 이름 없는 행(빈 칸) — 엑셀 부분 범위 복사 관용과 동일 취급
      // 구분 기호뿐인 이름("---" 등)은 정규화 키가 빈 문자열이 되어 서로 무관한 행끼리 거짓
      // 매칭될 수 있다(customer-suggest.ts findCustomerSpellingMatch와 동일 가드) — 의미 있는
      // 키가 없으면 매칭을 시도하지 않고 곧장 미매칭으로 본다.
      const key = normalizedAccountKey(name)
      const matches = key ? (rowsByKey.get(key) ?? []) : []
      if (matches.length > 1) {
        if (!seenAmbiguous.has(name)) {
          seenAmbiguous.add(name)
          plan.ambiguousNames.push(name)
        }
        continue // 스펙: 어느 행인지 정할 수 없으므로 셀을 만들지 않는다
      }
      const matchedRow = matches[0] ?? null
      if (!matchedRow && key && allKeys.has(key)) {
        if (!seenOutOfView.has(name)) {
          seenOutOfView.add(name)
          plan.outOfViewNames.push(name)
        }
        continue
      }
      if (matchedRow) plan.matchedRowCount += 1
      const unmatchedCells: Array<{ month: string; amount: number }> = []
      for (let c = 1; c < grid[r].length; c += 1) {
        const raw = (grid[r][c] ?? "").trim()
        if (raw === "") continue
        if (!isNumericMatrixToken(raw)) {
          plan.nonNumericCount += 1
          continue
        }
        const month = months[colStart + (c - 1)]
        if (!month) {
          plan.outOfRangeCount += 1
          continue
        }
        const next = parseMatrixAmount(raw)
        if (matchedRow) {
          if (cellBudget <= 0) {
            plan.outOfRangeCount += 1
            continue
          }
          cellBudget -= 1
          const current = rowMonthAmount(matchedRow, month)
          const locked = isMatrixCellLocked(matchedRow, month, overrideMonthsByRow.get(matchedRow.id))
          // 동일 금액은 초안을 만들지 않는다(commitBuffer의 중복 커밋 가드와 같은 취지).
          const status: MatrixPasteCellPlan["status"] =
            locked ? "locked" : next === current || (next <= 0 && current <= 0) ? "unchanged" : "apply"
          plan.cells.push({
            rowId: matchedRow.id,
            customer: matchedRow.customer,
            productCategory: rowProductCategory(matchedRow),
            month,
            current,
            next,
            status,
          })
          if (status === "apply") plan.applyCount += 1
          else if (status === "locked") plan.lockedCount += 1
          else plan.unchangedCount += 1
        } else {
          // 미매칭 보존은 빈 칸·0 제외(스펙) — 0은 값 없는 칸과 동일 취급이라 예산도 쓰지 않는다.
          if (next <= 0) continue
          if (cellBudget <= 0) {
            plan.outOfRangeCount += 1
            continue
          }
          cellBudget -= 1
          unmatchedCells.push({ month, amount: next })
        }
      }
      if (!matchedRow && unmatchedCells.length > 0) plan.unmatched.push({ name, cells: unmatchedCells })
    }
  } else {
    for (let r = 0; r < grid.length; r += 1) {
      const row = dealRows[rowStart + r]
      for (let c = 0; c < grid[r].length; c += 1) {
        const raw = grid[r][c].trim()
        if (raw === "") continue // 빈 칸은 건드리지 않는다(엑셀 부분 범위 복사 관용)
        if (!isNumericMatrixToken(raw)) {
          plan.nonNumericCount += 1 // 헤더/라벨 텍스트 등 — 값으로 오독하지 않고 집계만
          continue
        }
        const month = months[colStart + c]
        if (!row || !month) {
          plan.outOfRangeCount += 1
          continue
        }
        if (cellBudget <= 0) {
          plan.outOfRangeCount += 1
          continue
        }
        cellBudget -= 1
        const next = parseMatrixAmount(raw)
        const current = rowMonthAmount(row, month)
        const locked = isMatrixCellLocked(row, month, overrideMonthsByRow.get(row.id))
        // 동일 금액은 초안을 만들지 않는다(commitBuffer의 중복 커밋 가드와 같은 취지).
        const status: MatrixPasteCellPlan["status"] =
          locked ? "locked" : next === current || (next <= 0 && current <= 0) ? "unchanged" : "apply"
        plan.cells.push({
          rowId: row.id,
          customer: row.customer,
          productCategory: rowProductCategory(row),
          month,
          current,
          next,
          status,
        })
        if (status === "apply") plan.applyCount += 1
        else if (status === "locked") plan.lockedCount += 1
        else plan.unchangedCount += 1
      }
    }
  }

  // 이름 열이 있어도 매칭·미매칭 셀이 하나도 없고 비숫자/범위밖 집계도 0이면 기존과 동일하게
  // "붙여넣을 값 없음"으로 본다(positional 모드는 원래 판정 그대로 — unmatched는 늘 비어 있다).
  // ambiguousNames도 본다 — 붙여넣기가 같은 이름의 중복 행뿐이면 셀·미매칭이 전부 0이라도 "건너뜀"
  // 안내를 프리뷰에 띄워야 한다(null이면 호출부가 "숫자 값을 찾지 못했다"고 잘못 말한다).
  if (
    plan.cells.length === 0 &&
    plan.nonNumericCount === 0 &&
    plan.outOfRangeCount === 0 &&
    plan.unmatched.length === 0 &&
    plan.ambiguousNames.length === 0 &&
    plan.outOfViewNames.length === 0
  ) {
    return null
  }
  return plan
}

// 라운드 4 P1-5 — 프리뷰에서 승인된 미매칭 이름만 new-row 초안 입력으로 뒤집는 순수 헬퍼.
// 월 1개당 초안 1건(그 이름의 보존된 금액 칸 수만큼). 시트에 없던 행을 새로 만드는 동작이라
// status를 싣지 않는다 — 매트릭스 셀 커밋(buildCellDraftInput)의 자가 체크(P0-2)와 달리, 레일
// new-row(buildDraftInput)와 같은 3단(초안→체크→적용) 게이트를 그대로 유지한다는 결정(D1(a))과
// 동일 이유: 시트를 보며 값을 옮기는 게 아니라 화면에 없던 행을 만드는 것이라 검수 가치가 있다.
export function buildPasteNewRowInputs(
  plan: MatrixPastePlan,
  selectedNames: readonly string[],
  context: {
    team: string
    manager: string
    productCategory: Exclude<RevProductCategory, "all">
    confidence: DraftConfidence
    lens: string
    period: string
  },
): LedgerDraftInput[] {
  const selected = new Set(selectedNames)
  const inputs: LedgerDraftInput[] = []
  for (const row of plan.unmatched) {
    if (!selected.has(row.name)) continue
    for (const cell of row.cells) {
      const input: LedgerDraftInput = {
        kind: "new-row",
        customer: row.name.trim(),
        manager: context.manager,
        team: context.team,
        month: cell.month,
        amount: cell.amount,
        note: "",
        sourceSheetRow: null,
        sourceSnapshot: {
          capturedAt: new Date().toISOString(),
          origin: "rev-matrix-paste",
          selectedMonth: cell.month,
          week: "month",
          row: null,
        },
        metadata: {
          source: "sales-ledger-workbench",
          origin: "rev-matrix-paste",
          lens: context.lens,
          period: context.period,
          team: context.team,
          operation: "forecast-add",
          productCategory: context.productCategory,
          fromMonth: cell.month,
          week: "month",
          weekly: null,
          weeklyConfidence: null,
          confidence: context.confidence,
          quantity: null,
          sourceDealId: null,
        },
      }
      inputs.push(input)
    }
  }
  return inputs
}

// 셀의 우세 확도 → 편집 팝오버 기본 선택값. 확정>고확도>예정 순, 없으면 예정.
export function dominantCellConfidence(bucket: RevMonthlyBucket): DraftConfidence {
  if (bucket.total <= 0) return "expected"
  if (bucket.confirmed >= bucket.high && bucket.confirmed >= bucket.open) return "confirmed"
  if (bucket.high >= bucket.open) return "high-confidence"
  return "expected"
}

// SL-6: 마지막으로 "명시 선택"한 확도 기억(localStorage). 빈 셀 편집 진입의 기본값으로만 쓰여
// 확정 수납액이 기본 '예정' 버킷으로 새는 과소집계를 막는다. 값이 있는 셀은 기존 우세 확도 유지,
// 커밋·집계(A1 확도 분배) 경로는 문자 단위 불변 — 기본 선택값만 바뀐다(팝오버에 항상 노출됨).
const MATRIX_LAST_CONFIDENCE_STORAGE_KEY = "classin:rev-matrix-last-confidence:v1"

export function loadStoredMatrixConfidence(): DraftConfidence | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(MATRIX_LAST_CONFIDENCE_STORAGE_KEY)
    return isDraftConfidence(raw) ? raw : null
  } catch {
    return null
  }
}

export function storeMatrixConfidence(value: DraftConfidence) {
  try {
    window.localStorage.setItem(MATRIX_LAST_CONFIDENCE_STORAGE_KEY, value)
  } catch {
    // 저장 실패(프라이빗 모드 등)는 무해 — 다음 명시 선택이 다시 시도한다.
  }
}

// ── Phase 2 인라인 편집 상태기계(useMatrixEditor) ───────────────────────────
// JSX를 반환하지 않는 훅 — SalesLedgerWorkbench 최상위에서 무조건 호출되므로(Rules of Hooks)
// next/dynamic 대상이 될 수 없다. RevMatrix.tsx의 행/셀 컴포넌트가 이 훅의 반환값(actions 등)을
// prop으로 받아 렌더만 한다.
export function useMatrixEditor({
  editableCells,
  cellValue,
  cellConfidence,
  onCommitCell,
  onAmountClamped,
  onZeroCommitBlocked,
  onCopyCell,
}: {
  editableCells: MatrixCellCoord[] // 렌더 순서(행 위→아래, 월 좌→우, 확장월은 w1→w5)로 정렬된 편집가능 셀
  cellValue: (coord: MatrixCellCoord) => number // 커밋 기준값(원 단위) — fill-down 소스
  cellConfidence: (coord: MatrixCellCoord) => DraftConfidence // 셀 우세 확도(팝오버 기본값)
  onCommitCell: (rowId: string, month: string, amount: number, confidence: DraftConfidence, week?: number) => void
  // 음수 입력이 0으로 클램프될 때 호출(커밋 결과와 무관 — 무입력 취급되는 경우도 포함). 항목 3.
  onAmountClamped?: () => void
  // 라운드 5 R-12 — 값이 있는 칸을 비우거나 0으로 치면 커밋하지 않고 이 콜백으로 알린다. 초안 API는 양수만 받아
  // 예전엔 0을 그대로 보내 서버 400 오류 토스트가 떴다. 감액·취소는 큐의 취소/되돌리기가 맡는다.
  onZeroCommitBlocked?: (coord: MatrixCellCoord) => void
  // 라운드 5 B1 — 선택 셀에서 Ctrl/Cmd+C. 텍스트를 드래그로 골라 둔 상태면 브라우저 기본 복사를 존중한다.
  onCopyCell?: (coord: MatrixCellCoord) => void
}) {
  const [selected, setSelected] = useState<MatrixCellCoord | null>(null)
  const [editing, setEditing] = useState<MatrixCellCoord | null>(null)
  const [buffer, setBuffer] = useState("")
  const [editConfidence, setEditConfidence] = useState<DraftConfidence>("expected")

  // 편집 버퍼·확도의 최신값 미러(latest-ref). commitBuffer/onEditingKeyDown가 이 값을 클로저 대신
  // 여기서 읽어 콜백 identity를 buffer/editConfidence 변화와 무관하게 고정한다 — actions 객체가
  // 매 키입력마다 새로 만들어져 수백 셀 memo를 깨는 문제를 없애기 위함(편집 셀만 리렌더).
  // 두 ref는 커밋 후 effect에서 갱신한다(렌더 중 ref 쓰기 금지 규칙). 읽는 쪽(commitBuffer/
  // onEditingKeyDown)은 전부 사용자 이벤트 핸들러라, 직전 렌더의 effect가 이미 반영된 뒤 실행돼 stale 없음.
  const bufferRef = useRef(buffer)
  const editConfidenceRef = useRef(editConfidence)
  useEffect(() => {
    bufferRef.current = buffer
    editConfidenceRef.current = editConfidence
  }, [buffer, editConfidence])

  // 편집가능 셀 순번 조회 O(1) — 방향키/Tab 이동에 사용. 주차 셀은 `::wN`까지 포함한 키.
  const indexByKey = useMemo(() => {
    const map = new Map<string, number>()
    editableCells.forEach((coord, index) => map.set(matrixCoordKey(coord), index))
    return map
  }, [editableCells])

  const selectCell = useCallback((rowId: string, month: string, week?: number) => {
    setEditing(null)
    setSelected({ rowId, month, week })
  }, [])

  const beginEdit = useCallback(
    (rowId: string, month: string, seed?: string, week?: number) => {
      const coord: MatrixCellCoord = { rowId, month, week }
      setSelected(coord)
      // 기본 확도: 값이 있거나(우세 확도) 미검수 초안이 확도를 남긴 셀은 그대로, 완전 빈 셀만
      // 마지막 명시 선택 확도(localStorage)로 시작한다 — SL-6, A1 확도-분배 로직 회귀 없음.
      const current = cellValue(coord)
      const base = cellConfidence(coord)
      setEditConfidence(current <= 0 && base === "expected" ? (loadStoredMatrixConfidence() ?? base) : base)
      // seed(타이핑 첫 글자)면 그 값으로, 아니면 기존 커밋값(0은 빈칸)으로 시작.
      if (seed != null) {
        setBuffer(seed.replace(/[^\d]/g, ""))
      } else {
        setBuffer(current > 0 ? String(current) : "")
      }
      setEditing(coord)
    },
    [cellConfidence, cellValue],
  )

  const cancelEdit = useCallback(() => {
    setEditing(null)
    setBuffer("")
  }, [])

  // 확도 팝오버의 "명시 선택"만 기억한다 — 기본값으로 흘러간 확도는 기록하지 않아
  // 한 번의 확정 선택이 이후 빈 셀 입력의 기본값이 된다(SL-6 세션 기억).
  const pickEditConfidence = useCallback((next: DraftConfidence) => {
    storeMatrixConfidence(next)
    setEditConfidence(next)
  }, [])

  // 현재 편집 버퍼를 커밋(부모 onCommitCell). 값이 이전과 같으면 스킵(중복 draft 방지).
  // buffer는 latest-ref(bufferRef)로 읽어 콜백 identity를 고정한다(actions 안정화).
  const commitBuffer = useCallback(
    (coord: MatrixCellCoord, confidence: DraftConfidence): boolean => {
      const parsed = parseMatrixAmountResult(bufferRef.current)
      // 클램프 여부는 커밋이 실제로 값을 바꾸는지와 무관하게 신호를 보낸다 — 그래야 "음수를 쳤는데
      // 아무 일도 안 일어났다"는 무경고 0 클램프가 (아래 dup-guard로 조기 return 되더라도) 항상 뜬다.
      if (parsed.clamped) onAmountClamped?.()
      const amount = parsed.amount
      const previous = cellValue(coord)
      const previousConfidence = cellConfidence(coord)
      // 금액·확도 둘 다 그대로면 저장하지 않는다. (주차 셀도 cellValue/cellConfidence가 주차 기준이라 동일 가드 적용)
      if (amount === previous && confidence === previousConfidence) return false
      if (amount <= 0 && previous <= 0) return false
      if (amount <= 0) {
        onZeroCommitBlocked?.(coord)
        return false
      }
      onCommitCell(coord.rowId, coord.month, amount, confidence, coord.week)
      return true
    },
    [cellConfidence, cellValue, onAmountClamped, onCommitCell, onZeroCommitBlocked],
  )

  const moveSelection = useCallback(
    (from: MatrixCellCoord, delta: number) => {
      const index = indexByKey.get(matrixCoordKey(from))
      if (index == null) return
      const nextIndex = index + delta
      if (nextIndex < 0 || nextIndex >= editableCells.length) return
      setEditing(null)
      setSelected(editableCells[nextIndex])
    },
    [editableCells, indexByKey],
  )

  // 같은 행에서 다음 셀(오른쪽 우선). Tab/Shift+Tab·Enter(아래) 커밋 후 이동에 공유.
  const moveWithinRowOrNext = useCallback(
    (from: MatrixCellCoord, direction: "right" | "left" | "down") => {
      const index = indexByKey.get(matrixCoordKey(from))
      if (index == null) return
      if (direction === "down") {
        // 아래 = 같은 세로 열(같은 월·같은 주차)에서 index 뒤쪽 첫 번째 셀.
        for (let i = index + 1; i < editableCells.length; i += 1) {
          if (matrixSameColumn(editableCells[i], from)) {
            setSelected(editableCells[i])
            return
          }
        }
        return
      }
      const delta = direction === "right" ? 1 : -1
      const nextIndex = index + delta
      if (nextIndex < 0 || nextIndex >= editableCells.length) return
      setSelected(editableCells[nextIndex])
    },
    [editableCells, indexByKey],
  )

  // 편집 중 input keydown. Enter=커밋+아래, Tab=커밋+오른쪽, Shift+Tab=커밋+왼쪽, Esc=취소.
  // 방향키는 캐럿 이동(기본 동작) — stopPropagation 없이 통과시킨다.
  const onEditingKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>, coord: MatrixCellCoord) => {
      // E/H/C = 확도 선택(팝오버 클릭과 같은 명시 선택 — 다음 빈 셀 기본값으로도 기억). 금액 버퍼는
      // 숫자만 받으므로 문자 키와 겹치지 않는다. 한글 자판·조합 중 판정은 confidence-shortcuts.ts.
      const shortcut = confidenceFromShortcut({ code: event.code, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, isComposing: event.nativeEvent.isComposing })
      if (shortcut) {
        event.preventDefault()
        pickEditConfidence(shortcut)
        return
      }
      if (event.key === "Enter") {
        event.preventDefault()
        commitBuffer(coord, editConfidenceRef.current)
        setEditing(null)
        moveWithinRowOrNext(coord, "down")
        return
      }
      if (event.key === "Tab") {
        event.preventDefault()
        commitBuffer(coord, editConfidenceRef.current)
        setEditing(null)
        moveWithinRowOrNext(coord, event.shiftKey ? "left" : "right")
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        cancelEdit()
      }
    },
    [cancelEdit, commitBuffer, moveWithinRowOrNext, pickEditConfidence],
  )

  // 셀렉트(비편집) keydown. 방향키=이동, Enter/F2/숫자=편집 진입, Ctrl/Cmd+D=위 값 채우기.
  const onSelectedKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTableCellElement>, coord: MatrixCellCoord) => {
      // Ctrl/Cmd+C — 선택 셀의 원 단위 금액 복사(물리 키 판정이라 한글 자판에서도 동작).
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === "KeyC") {
        if (!onCopyCell) return
        const textSelection = typeof window !== "undefined" ? window.getSelection?.()?.toString() ?? "" : ""
        if (textSelection) return
        event.preventDefault()
        onCopyCell(coord)
        return
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "d" || event.key === "D")) {
        event.preventDefault()
        // 위 셀 = 같은 세로 열(같은 월·같은 주차)에서 index 앞쪽 첫 번째 셀의 커밋값.
        const index = indexByKey.get(matrixCoordKey(coord))
        if (index == null) return
        for (let i = index - 1; i >= 0; i -= 1) {
          if (matrixSameColumn(editableCells[i], coord)) {
            const value = cellValue(editableCells[i])
            if (value > 0) onCommitCell(coord.rowId, coord.month, value, cellConfidence(coord), coord.week)
            return
          }
        }
        return
      }
      // 선택 중 E/H/C = 그 칸 금액은 그대로 두고 확도만 바꾼다(시트에서 글자색만 바꾸는 동작).
      // 빈 칸은 바꿀 금액이 없고, 같은 확도면 초안을 만들지 않는다 — 결과는 기존과 같은 검토 초안 1건.
      const shortcut = confidenceFromShortcut({ code: event.code, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, isComposing: event.nativeEvent.isComposing })
      if (shortcut) {
        event.preventDefault()
        const value = cellValue(coord)
        if (value > 0 && shortcut !== cellConfidence(coord)) onCommitCell(coord.rowId, coord.month, value, shortcut, coord.week)
        return
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        moveSelection(coord, 1)
        return
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        moveSelection(coord, -1)
        return
      }
      if (event.key === "ArrowDown") {
        event.preventDefault()
        moveWithinRowOrNext(coord, "down")
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        const index = indexByKey.get(matrixCoordKey(coord))
        if (index == null) return
        for (let i = index - 1; i >= 0; i -= 1) {
          if (matrixSameColumn(editableCells[i], coord)) {
            setSelected(editableCells[i])
            return
          }
        }
        return
      }
      if (event.key === "Enter" || event.key === "F2") {
        event.preventDefault()
        beginEdit(coord.rowId, coord.month, undefined, coord.week)
        return
      }
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault()
        beginEdit(coord.rowId, coord.month, event.key, coord.week)
      }
    },
    [beginEdit, cellConfidence, cellValue, editableCells, indexByKey, moveSelection, moveWithinRowOrNext, onCommitCell, onCopyCell],
  )

  // 셀 핸들러가 호출하는 액션들 — 전부 identity 안정(콜백 deps가 데이터/펼침에만 반응).
  // selected/editing/buffer/editConfidence 같은 잦은 상태는 여기 넣지 않고 별도 경로로 내려,
  // 이 객체를 prop으로 받는 memo 셀들이 선택·타이핑마다 얕은비교가 깨지지 않게 한다.
  const actions = useMemo(
    () => ({
      setBuffer,
      // 팝오버 선택 = 명시 선택 → localStorage 기억까지 수행(pickEditConfidence). 액션 키 이름은
      // 기존 셀 콜사이트 호환을 위해 유지한다.
      setEditConfidence: pickEditConfidence,
      selectCell,
      beginEdit,
      cancelEdit,
      commitBuffer,
      onEditingKeyDown,
      onSelectedKeyDown,
    }),
    [setBuffer, pickEditConfidence, selectCell, beginEdit, cancelEdit, commitBuffer, onEditingKeyDown, onSelectedKeyDown],
  )

  return {
    selected,
    editing,
    buffer,
    editConfidence,
    actions,
  }
}

export type MatrixEditor = ReturnType<typeof useMatrixEditor>
export type MatrixEditorActions = MatrixEditor["actions"]

// 주차 5칸(W1~W5)의 표시 금액·월합계만 여부·잠금 상태를 순수 계산한다 — 렌더 없이 테스트 가능하게 분리.
// 버그(2026-07-20) 회귀 방지의 핵심 규칙: 월이 확정으로 잠겨도(monthLocked) 실제 확정액이 찍힌 칸
// (display>0)만 잠그고, 빈 칸은 같은 달이어도 편집 가능하게 둔다 — 아직 안 지난 주차(예: 당월 W5)
// 입력을 월 단위 잠금이 통째로 막던 문제를 잡는다. 이전 구현은 월 단위 잠금(monthLockedOf)과
// isMatrixCellEditable(=!monthLocked)을 AND로 겹쳐 5칸을 통째로 잠갔다. display 산식은 월합계만 행
// (W5에 monthOnlyAmount 얹기)까지 포함해 실제 렌더와 1:1로 맞춘다.
export function computeWeekCellStates(
  weeks: number[],
  monthOnlyAmount: number,
  monthLocked: boolean,
): Array<{ display: number; isMonthOnly: boolean; locked: boolean }> {
  const anyExplicit = weeks.some((w) => w > 0)
  return Array.from({ length: 5 }, (_unused, index) => {
    const value = weeks[index] ?? 0
    // 월합계만 있는 행은 마지막(W5) 칸에 금액을 얹어 시트 검수 감각을 유지한다.
    const display = value > 0 ? value : index === 4 && monthOnlyAmount > 0 && !anyExplicit ? monthOnlyAmount : 0
    const isMonthOnly = display > 0 && value === 0
    return { display, isMonthOnly, locked: monthLocked && display > 0 }
  })
}

// 콕핏/입력 레일의 주차 그리드(W1~W5) 칸별 잠금 마스크 — "확정 주차 읽기전용, 빈 주차 추가만 허용"
// (2026-07-23, 매트릭스 규약과 동일). 확정으로 잠긴 달에서 이미 explicit 주차 금액이 있는 칸만 잠근다:
// 그 칸은 읽기전용으로 두어 실수 덮어쓰기를 막고(저장은 병합이라 확정 주차 보존), 빈 칸에만 아직 안 지난
// 주차를 새로 넣게 한다. explicit 주차가 없으면(월합계만/미입력) 개별로 보존할 주차가 없어 전(全) false를
// 돌려주고 — 그 경우 폼 전체 잠금(단일 금액 경로 가드, isDraftFormTargetLocked)이 확정 달을 그대로 보호한다.
export function weeklyEditLockMask(monthLocked: boolean, hasExplicitWeeks: boolean, weeks: number[]): boolean[] {
  if (!monthLocked || !hasExplicitWeeks) return [false, false, false, false, false]
  return Array.from({ length: 5 }, (_unused, index) => (weeks[index] ?? 0) > 0)
}

export const EMPTY_BUCKET: RevMonthlyBucket = { total: 0, confirmed: 0, high: 0, open: 0 }
