"use client"

// SalesLedgerWorkbench에서 물리 이동(웨이브 7 2단 F5 — 기계적 분할, 로직 무변경): REV 다중월
// 밀도 매트릭스 클러스터 — 셀 좌표/pending·dedup·잠금·붙여넣기 계획 순수 로직 + 인라인 편집
// 인프라(useMatrixEditor·팝오버) + 행/셀/푸터 프레젠테이션(memo) 일체. 순수 함수 표면은
// 워크벤치가 재수출해 기존 테스트 import 경로를 유지한다.

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronRight, Link2Off, Lock } from "lucide-react"

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { useDialogFocus } from "../../use-dialog-focus"
import {
  DRAFT_CONFIDENCE_OPTIONS,
  draftConfidenceFromMetadata,
  formatMoney,
  formatMonthLabel,
  formatPercent,
  formatWeekAmount,
  isDraftConfidence,
  mapNumberValue,
  mergedWeeklyFromMetadata,
  weeklyConfidenceFromMetadata,
  metadataString,
  productCategoryMeta,
  ProductCategoryPill,
  rowMonthAmount,
  rowProductCategory,
  rowWeeklyMismatch,
  rowWeeklySplit,
  type DraftConfidence,
  type LedgerDraft,
  type LedgerRevenueRow,
  type RevCustomerGroup,
  type RevMonthlyBucket,
  type RevProductCategory,
  type RevRowView,
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
// 그룹 소계행(기본 h-8)·딜행(기본 h-7) 높이 클래스. 셀 내부 폰트 크기·패딩·sticky 배경은 그대로 둔다.
const MATRIX_GROUP_ROW_HEIGHT: Record<MatrixDensity, string> = {
  condensed: "h-6",
  regular: "h-8",
  relaxed: "h-9",
}
const MATRIX_DEAL_ROW_HEIGHT: Record<MatrixDensity, string> = {
  condensed: "h-6",
  regular: "h-7",
  relaxed: "h-9",
}
export function isMatrixDensity(value: unknown): value is MatrixDensity {
  return value === "condensed" || value === "regular" || value === "relaxed"
}

// 확도 = 글자색(배경 아님). 셀 배경은 흰색 고정, 확정/고확도/불일치는 bold.
// 확도 3색은 CONFIDENCE_TOKENS SSOT 소비 — 리터럴 재정의 금지(불일치·빈 셀은 확도 아님).
const MATRIX_TONE = {
  confirmed: `font-bold ${CONFIDENCE_TOKENS.confirmed.textClass}`,
  high: `font-bold ${CONFIDENCE_TOKENS["high-confidence"].textClass}`,
  open: `font-semibold ${CONFIDENCE_TOKENS.expected.textClass}`,
  mixed: `font-semibold ${CONFIDENCE_TOKENS.expected.textClass}`,
  mismatch: "font-bold text-[#B43E3E]",
  empty: "text-[#DDD9D3]",
} as const

// 셀 단일 금액의 지배 확도로 글자색을 고른다. 혼재(여러 확도 합산)면 예정 톤(월합계 요약 성격).
function matrixBucketTone(bucket: RevMonthlyBucket): keyof typeof MATRIX_TONE {
  if (bucket.total <= 0) return "empty"
  if (bucket.confirmed === bucket.total) return "confirmed"
  if (bucket.confirmed === 0 && bucket.high === bucket.total) return "high"
  if (bucket.confirmed === 0 && bucket.high === 0) return "open"
  return "mixed"
}

// 매트릭스 확도 색 레전드. 셀 글자색(MATRIX_TONE)과 1:1 대응 — 값 자체는 바꾸지 않는다.
// tint가 있는 항목은 셀에도 같은 배경이 깔린다는 뜻 — 범례 스와치를 그 틴트 위에 얹어 대응을 보여준다.
const MATRIX_TONE_LEGEND_ITEMS: Array<{ label: string; color: string; tint?: string }> = [
  { label: CONFIDENCE_TOKENS.confirmed.label, color: CONFIDENCE_TOKENS.confirmed.color },
  {
    label: CONFIDENCE_TOKENS["high-confidence"].label,
    color: CONFIDENCE_TOKENS["high-confidence"].color,
    tint: CONFIDENCE_TOKENS["high-confidence"].tintBg,
  },
  { label: CONFIDENCE_TOKENS.expected.label, color: CONFIDENCE_TOKENS.expected.color },
  { label: "불일치", color: "#B43E3E" },
]
export function MatrixToneLegend() {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[#615D59]">
      {MATRIX_TONE_LEGEND_ITEMS.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1">
          {item.tint ? (
            <span
              aria-hidden
              className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px]"
              style={{ backgroundColor: item.tint }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
            </span>
          ) : (
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
          )}
          {item.label}
        </span>
      ))}
      <span>· 잠금=시트확정/장부반영</span>
      <span className="hidden lg:inline">· 합산 셀 주황=확도 혼합 포함</span>
      {/* 13인치(lg~xl) 랩탑에서도 단축키 힌트가 보이도록 xl→lg 하향. 편집 진입 시엔 팝오버가 셀 인근 힌트를 재노출한다. */}
      <span className="hidden text-[#A39E98] lg:inline">· Enter 편집 · Tab 이동 · Ctrl+D 아래 복사 · Ctrl+V 엑셀 붙여넣기 · Esc 취소</span>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 다중월 밀도 매트릭스 (REV Phase 1 읽기 전용 → Phase 2 딜행 월 셀 인라인 편집)
// 열: [고객 200 sticky-left] [상품 56] [월 12칸×64 요약 / 확장 시 5×34] [연간 96 sticky-right]
// sticky 3방향(좌·우·하단 합계행) — 각 상태별 불투명 배경으로 비침 방지.
// ─────────────────────────────────────────────────────────────────────────

// ── Phase 2: 인라인 편집 인프라 ─────────────────────────────────────────────
// 편집은 "딜행(sourceDealId 보유) × 비확정 월" 셀만. 그룹 소계·주차 확장 칸·시트 확정 셀은 잠금.
// 커밋 1건 = createDraft 1건(새 저장경로 없음). 낙관적 표시는 drafts 배열에서 파생.

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

interface MatrixPasteCellPlan {
  rowId: string
  customer: string
  productCategory: Exclude<RevProductCategory, "all">
  month: string
  current: number
  next: number
  status: "apply" | "locked" | "unchanged"
}

export interface MatrixPastePlan {
  anchorCustomer: string
  cells: MatrixPasteCellPlan[]
  applyCount: number
  lockedCount: number
  unchangedCount: number
  nonNumericCount: number
  outOfRangeCount: number
}

// 오조작(전체 시트 복사 등) 방어 상한 — 12개월 × 50행. 넘치는 칸은 범위 밖으로 집계만 한다.
const MATRIX_PASTE_MAX_CELLS = 600

function parseTsvGrid(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop()
  return lines.map((line) => line.split("\t"))
}

export function buildMatrixPastePlan(
  text: string,
  anchor: MatrixCellCoord,
  dealRows: LedgerRevenueRow[],
  months: string[],
  // 품질 웨이브 4 — 항목 1: 정정 적용으로 재잠긴 (딜, 월) 칸을 붙여넣기 계획에서도 locked로
  // 판정하기 위한 dealId → 대체된 월 집합(editRowOverrideMonths).
  overrideMonthsByRow: Map<string, Set<string>>,
): MatrixPastePlan | null {
  const grid = parseTsvGrid(text)
  if (grid.length === 0) return null
  const rowStart = dealRows.findIndex((row) => row.id === anchor.rowId)
  const colStart = months.indexOf(anchor.month)
  if (rowStart < 0 || colStart < 0) return null

  const plan: MatrixPastePlan = {
    anchorCustomer: dealRows[rowStart].customer,
    cells: [],
    applyCount: 0,
    lockedCount: 0,
    unchangedCount: 0,
    nonNumericCount: 0,
    outOfRangeCount: 0,
  }
  let cellBudget = MATRIX_PASTE_MAX_CELLS
  for (let r = 0; r < grid.length; r += 1) {
    const row = dealRows[rowStart + r]
    for (let c = 0; c < grid[r].length; c += 1) {
      const raw = grid[r][c].trim()
      if (raw === "") continue // 빈 칸은 건드리지 않는다(엑셀 부분 범위 복사 관용)
      // 전체가 숫자형(통화기호·콤마·공백·부호 허용)일 때만 금액으로 인정 —
      // "Q4 2026"·"2026-04" 같은 숫자 섞인 라벨을 금액으로 오독(42026·0 덮어쓰기)하지 않는다.
      if (!/^[\s¥₩$,.\-+]*\d[\d\s¥₩$,.\-+]*$/.test(raw) || !Number.isFinite(Number(raw.replace(/[^\d.-]/g, "")))) {
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
  if (plan.cells.length === 0 && plan.nonNumericCount === 0 && plan.outOfRangeCount === 0) return null
  return plan
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

// 셀 아래 붙는 3버튼 확도 팝오버 + 커밋/취소. input은 부모 셀이 렌더(포커스 관리), 여기는 확도만.
// warning: 주차 셀 편집처럼 커밋 결과가 파괴적일 때 팝오버 안에 한 줄 경고를 붙인다.
const RevMatrixEditPopover = memo(function RevMatrixEditPopover({
  confidence,
  onPickConfidence,
  warning,
}: {
  confidence: DraftConfidence
  onPickConfidence: (next: DraftConfidence) => void
  warning?: string
}) {
  return (
    <div
      className="absolute left-0 top-full z-40 mt-0.5 flex flex-col gap-0.5 rounded-md border border-[rgba(0,0,0,0.12)] bg-white p-0.5 shadow-lg"
      onMouseDown={(event) => event.preventDefault()} // input 포커스 유지(blur 커밋 방지)
    >
      <div className="flex items-center gap-0.5">
        {DRAFT_CONFIDENCE_OPTIONS.map((option) => {
          const activeColor = CONFIDENCE_TOKENS[option.id].color
          const active = option.id === confidence
          return (
            <button
              key={option.id}
              type="button"
              title={`확도: ${option.label}`}
              onClick={() => onPickConfidence(option.id)}
              className="rounded px-1.5 py-0.5 text-[10px] font-bold leading-none transition"
              style={
                active
                  ? { backgroundColor: activeColor, color: "#FFFFFF" }
                  : { color: activeColor, backgroundColor: "transparent" }
              }
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {/* 편집 진입 시 셀 인근 단축키 힌트 — 치트시트가 안 보이는 좁은 화면에서도 조작법이 손끝에 남게. */}
      <p className="px-1 pb-0.5 text-left text-[9px] font-semibold leading-none text-[#A39E98]">
        Enter 저장 · Tab 다음 칸 · Esc 취소
      </p>
      {warning && (
        <p className="max-w-[168px] whitespace-normal rounded bg-[#FBF1E0] px-1.5 py-1 text-left text-[9px] font-bold leading-snug text-[#7A520F]">
          {warning}
        </p>
      )}
    </div>
  )
})

// 매트릭스 셀 편집 상태기계. 셀렉트/편집버퍼/키보드/fill-down/편집가능 셀 순회.
// 커밋은 부모가 주입한 onCommitCell(rowId, month, amount, confidence) 호출 — 저장 로직은 부모 소유.
export function useMatrixEditor({
  editableCells,
  cellValue,
  cellConfidence,
  onCommitCell,
  onAmountClamped,
}: {
  editableCells: MatrixCellCoord[] // 렌더 순서(행 위→아래, 월 좌→우, 확장월은 w1→w5)로 정렬된 편집가능 셀
  cellValue: (coord: MatrixCellCoord) => number // 커밋 기준값(원 단위) — fill-down 소스
  cellConfidence: (coord: MatrixCellCoord) => DraftConfidence // 셀 우세 확도(팝오버 기본값)
  onCommitCell: (rowId: string, month: string, amount: number, confidence: DraftConfidence, week?: number) => void
  // 음수 입력이 0으로 클램프될 때 호출(커밋 결과와 무관 — 무입력 취급되는 경우도 포함). 항목 3.
  onAmountClamped?: () => void
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
      onCommitCell(coord.rowId, coord.month, amount, confidence, coord.week)
      return true
    },
    [cellConfidence, cellValue, onAmountClamped, onCommitCell],
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
    [cancelEdit, commitBuffer, moveWithinRowOrNext],
  )

  // 셀렉트(비편집) keydown. 방향키=이동, Enter/F2/숫자=편집 진입, Ctrl/Cmd+D=위 값 채우기.
  const onSelectedKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTableCellElement>, coord: MatrixCellCoord) => {
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
    [beginEdit, cellConfidence, cellValue, editableCells, indexByKey, moveSelection, moveWithinRowOrNext, onCommitCell],
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

type MatrixEditor = ReturnType<typeof useMatrixEditor>
type MatrixEditorActions = MatrixEditor["actions"]

// 매트릭스 셀 본문 숫자. ¥ 없이 축약(formatWeekAmount) — 밀도 우선, 툴팁에 정확 금액.
// Phase 2: edit* props가 오면 딜행 편집 셀(잠금/미검수/셀렉트/편집 4상태). 없으면(그룹 소계) 읽기전용.
const RevMatrixMonthCell = memo(function RevMatrixMonthCell({
  bucket,
  mismatch = false,
  bgClass,
  month,
  rowId,
  editable = false,
  locked = false,
  lockLabel = "시트 확정",
  pending = null,
  actions = null,
  // 선택/편집/버퍼는 부모(스트립)가 이 셀 기준으로 계산해 원시값으로 내린다 — memo가 셀 단위로
  // 얕은비교되도록. 비편집·비선택 셀은 아래 값들이 상수라 선택·타이핑 리렌더에서 스킵된다.
  selected = false,
  isEditingCell = false,
  editBuffer = "",
  editConfidence = "expected",
  // 웨이브 5 — 항목 1(b): 이 셀의 달이 현재 M/Q 선택 기간에 속하는지. 행 배경(bgClass)은 그대로
  // 두고 좌측 보더만 옅은 그린 accent로 바꿔 세로로 훑었을 때 "이 열들이 선택 기간"임이 읽히게
  // 한다 — bgClass를 덮어쓰지 않아 selected/draft/hover 등 기존 행 상태 표시와 충돌하지 않는다.
  periodHighlighted = false,
}: {
  bucket: RevMonthlyBucket
  mismatch?: boolean
  bgClass: string
  month?: string
  rowId?: string
  editable?: boolean
  locked?: boolean
  lockLabel?: string
  pending?: MatrixPendingDraft | null
  actions?: MatrixEditorActions | null
  selected?: boolean
  isEditingCell?: boolean
  editBuffer?: string
  editConfidence?: DraftConfidence
  periodHighlighted?: boolean
}) {
  const tone = mismatch ? "mismatch" : matrixBucketTone(bucket)
  const interactive = Boolean(actions && month && rowId)
  // 방향키 이동은 selected 상태만 바꾸므로 DOM 포커스를 직접 옮겨야 다음 keydown이 새 셀에서 잡힌다.
  // (클릭은 native focus가 되지만 키보드 이동은 안 됨.) 편집 중이 아닐 때만 셀 자체에 포커스.
  const cellRef = useRef<HTMLTableCellElement | null>(null)
  useEffect(() => {
    if (interactive && editable && selected && !isEditingCell) {
      cellRef.current?.focus()
    }
  }, [interactive, editable, selected, isEditingCell])
  const confidenceLabel = (value: DraftConfidence) =>
    DRAFT_CONFIDENCE_OPTIONS.find((option) => option.id === value)?.label ?? value
  const baseTitle =
    bucket.total > 0
      ? `합계 ${formatMoney(bucket.total)} · 확정 ${formatMoney(bucket.confirmed)} · 고확도 ${formatMoney(bucket.high)} · 예정 ${formatMoney(bucket.open)}${mismatch ? " · 주차·월 불일치(허용오차 ±¥1)" : ""}`
      : "미입력"
  const title = locked
    ? `${baseTitle} · 🔒 ${lockLabel} 값이라 잠금(실수 방지) — 수정은 우측 패널에서 정정 초안으로`
    : pending
      ? `${baseTitle} · 미검수 초안 ${formatMoney(pending.amount)} (${confidenceLabel(pending.confidence)})`
      : editable
        ? `${baseTitle} · 클릭·Enter로 편집`
        : baseTitle

  // 편집 진입 셀: input + 확도 팝오버.
  if (isEditingCell && interactive) {
    return (
      <td
        className={`relative px-0.5 text-right align-middle ${mismatch ? "bg-[#FCE9E9]" : bgClass} ring-2 ring-inset ring-[#084734]/40`}
        style={{ width: MATRIX_MONTH_W, minWidth: MATRIX_MONTH_W, maxWidth: MATRIX_MONTH_W }}
      >
        <input
          autoFocus
          inputMode="numeric"
          value={editBuffer}
          onChange={(event) => actions!.setBuffer(event.target.value)}
          onKeyDown={(event) => actions!.onEditingKeyDown(event, { rowId: rowId!, month: month! })}
          onBlur={() => {
            actions!.commitBuffer({ rowId: rowId!, month: month! }, editConfidence)
            actions!.cancelEdit()
          }}
          aria-label={`${formatMonthLabel(month!)} 금액(원 단위)`}
          className="h-6 w-full bg-transparent px-1 text-right text-[11px] font-bold tabular-nums text-[#111110] outline-none"
        />
        <RevMatrixEditPopover confidence={editConfidence} onPickConfidence={actions!.setEditConfidence} />
      </td>
    )
  }

  // 고확도(90%+ 마감임박) 셀만 은은한 파란 틴트를 깐다 — 확정(그린)·예정(앰버)은 글자색만 유지해
  // "강조는 한 곳만" 위계를 지킨다. 색은 CONFIDENCE_TOKENS['high-confidence'].tintBg(#EFF6FF) SSOT.
  // 불일치(빨강)·미검수 초안은 운영상 더 급한 신호라 틴트보다 우선한다.
  const highTint = !mismatch && !pending && tone === "high"
  const bg = mismatch ? "bg-[#FCE9E9]" : highTint ? "bg-[#EFF6FF]" : bgClass
  const cellClassName = `relative px-1.5 text-right align-middle tabular-nums ${
    mismatch
      ? "border-l-2 border-l-[#B43E3E]"
      : periodHighlighted
        ? "border-l-2 border-l-[#084734]/25"
        : "border-l border-[#F2F1EE]"
  } ${bg} ${interactive && editable ? "cursor-cell" : ""} ${selected ? "ring-2 ring-inset ring-[#084734]/40" : ""} ${
    pending ? "shadow-[inset_0_-2px_0_0_#A8741A]" : ""
  } focus-visible:outline-none`

  const interactiveHandlers = interactive
    ? {
        tabIndex: editable ? 0 : -1,
        role: "gridcell" as const,
        onClick: () => {
          if (editable) actions!.selectCell(rowId!, month!)
        },
        onDoubleClick: () => {
          if (editable) actions!.beginEdit(rowId!, month!)
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLTableCellElement>) => {
          if (!editable) return
          if (!selected) {
            // Tab 포커스만 된 셀도 Enter/F2로 선택 진입 — 마우스 클릭 없이 키보드만으로 편집 가능.
            if (event.key === "Enter" || event.key === "F2") {
              event.preventDefault()
              actions!.selectCell(rowId!, month!)
            }
            return
          }
          actions!.onSelectedKeyDown(event, { rowId: rowId!, month: month! })
        },
      }
    : {}

  return (
    <td
      ref={cellRef}
      title={title}
      aria-label={interactive ? title : undefined}
      className={cellClassName}
      style={{ width: MATRIX_MONTH_W, minWidth: MATRIX_MONTH_W, maxWidth: MATRIX_MONTH_W }}
      {...interactiveHandlers}
    >
      {pending && (
        <span
          aria-hidden
          className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[#A8741A]"
        />
      )}
      {bucket.total > 0 ? (
        <span
          className={`inline-flex items-center justify-end gap-0.5 leading-none ${
            bucket.total < 10000 ? "text-[10px] opacity-75" : "text-[11px]"
          } ${pending ? "font-bold text-[#7A520F]" : MATRIX_TONE[tone]}`}
        >
          {locked && <Lock className="h-2.5 w-2.5 shrink-0 text-[#A39E98]" aria-label={lockLabel} />}
          {mismatch && !locked && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
          {formatWeekAmount(bucket.total)}
        </span>
      ) : (
        <span className={`text-[11px] leading-none ${editable ? "text-[#C9C5BF]" : MATRIX_TONE.empty}`}>·</span>
      )}
    </td>
  )
})

// 확장된 월의 주차(W1~W5) 칸 1개. 34px. editor가 오면(딜행·비잠금) 월 셀과 동일한
// 잠금/미검수/셀렉트/편집 4상태 + 키보드 순회를 지원한다. 없으면(그룹 소계·잠금) 읽기전용.
// display 규약은 기존 읽기전용 버전 계승: explicit=진한 숫자, inferred=회색, month-only는 W5에 금액.
const RevMatrixWeekCell = memo(function RevMatrixWeekCell({
  display,
  isMonthOnly,
  inferred,
  weekIndex,
  bgClass,
  month,
  rowId,
  editable = false,
  locked = false,
  lockLabel = "시트 확정",
  editWarning,
  pending = null,
  actions = null,
  // 월 셀과 동일: 선택/편집/버퍼는 부모(스트립)가 이 칸 기준으로 계산해 원시값으로 내린다.
  selected = false,
  isEditingCell = false,
  editBuffer = "",
  editConfidence = "expected",
  // 웨이브 5 — 항목 1(b): 이 칸이 속한 달이 현재 M/Q 선택 기간이면 월 셀과 동일한 좌측 accent.
  periodHighlighted = false,
}: {
  display: number
  isMonthOnly: boolean
  inferred: boolean
  weekIndex: number
  bgClass: string
  month?: string
  rowId?: string
  editable?: boolean
  locked?: boolean
  lockLabel?: string
  editWarning?: string
  pending?: MatrixPendingDraft | null
  actions?: MatrixEditorActions | null
  selected?: boolean
  isEditingCell?: boolean
  editBuffer?: string
  editConfidence?: DraftConfidence
  periodHighlighted?: boolean
}) {
  const interactive = Boolean(actions && month && rowId)
  const cellRef = useRef<HTMLTableCellElement | null>(null)
  useEffect(() => {
    if (interactive && editable && selected && !isEditingCell) cellRef.current?.focus()
  }, [interactive, editable, selected, isEditingCell])

  const confidenceLabel = (v: DraftConfidence) => DRAFT_CONFIDENCE_OPTIONS.find((option) => option.id === v)?.label ?? v
  const baseTitle = display > 0 ? `W${weekIndex + 1} ${formatMoney(display)}${isMonthOnly ? " · 월합계만" : ""}` : `W${weekIndex + 1} 미입력`
  const title = locked
    ? `${baseTitle} · 🔒 ${lockLabel} 값이라 잠금(실수 방지) — 수정은 우측 패널에서 정정 초안으로`
    : pending
      ? `${baseTitle} · 미검수 초안 ${formatMoney(pending.amount)} (${confidenceLabel(pending.confidence)})`
      : editable
        ? `${baseTitle} · 클릭·Enter로 편집`
        : baseTitle

  // 편집 진입: input + 확도 팝오버. 폭 34px라 px 여백 없이 칸을 꽉 채운다.
  if (isEditingCell && interactive) {
    return (
      <td
        className={`relative px-0 text-right align-middle ${bgClass} ring-2 ring-inset ring-[#084734]/40`}
        style={{ width: MATRIX_WEEK_W, minWidth: MATRIX_WEEK_W, maxWidth: MATRIX_WEEK_W }}
      >
        <input
          autoFocus
          inputMode="numeric"
          value={editBuffer}
          onChange={(event) => actions!.setBuffer(event.target.value)}
          onKeyDown={(event) => actions!.onEditingKeyDown(event, { rowId: rowId!, month: month!, week: weekIndex })}
          onBlur={() => {
            actions!.commitBuffer({ rowId: rowId!, month: month!, week: weekIndex }, editConfidence)
            actions!.cancelEdit()
          }}
          aria-label={`${formatMonthLabel(month!)} W${weekIndex + 1} 금액(원 단위)`}
          className="h-6 w-full bg-transparent px-1 text-right text-[11.5px] font-bold tabular-nums text-[#111110] outline-none"
        />
        <RevMatrixEditPopover
          confidence={editConfidence}
          onPickConfidence={actions!.setEditConfidence}
          warning={editWarning}
        />
      </td>
    )
  }

  const cellClassName = `relative px-1.5 text-right align-middle tabular-nums ${
    periodHighlighted ? "border-l-2 border-l-[#084734]/25" : "border-l border-[#F2F1EE]"
  } ${bgClass} ${
    interactive && editable ? "cursor-cell" : ""
  } ${selected ? "ring-2 ring-inset ring-[#084734]/40" : ""} ${pending ? "shadow-[inset_0_-2px_0_0_#A8741A]" : ""} focus-visible:outline-none`

  const interactiveHandlers = interactive
    ? {
        tabIndex: editable ? 0 : -1,
        role: "gridcell" as const,
        onClick: () => {
          if (editable) actions!.selectCell(rowId!, month!, weekIndex)
        },
        onDoubleClick: () => {
          if (editable) actions!.beginEdit(rowId!, month!, undefined, weekIndex)
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLTableCellElement>) => {
          if (!editable) return
          if (!selected) {
            // Tab 포커스만 된 칸도 Enter/F2로 선택 진입 — 마우스 클릭 없이 키보드만으로 편집 가능.
            if (event.key === "Enter" || event.key === "F2") {
              event.preventDefault()
              actions!.selectCell(rowId!, month!, weekIndex)
            }
            return
          }
          actions!.onSelectedKeyDown(event, { rowId: rowId!, month: month!, week: weekIndex })
        },
      }
    : {}

  return (
    <td
      ref={cellRef}
      title={title}
      aria-label={interactive ? title : undefined}
      className={cellClassName}
      style={{ width: MATRIX_WEEK_W, minWidth: MATRIX_WEEK_W, maxWidth: MATRIX_WEEK_W }}
      {...interactiveHandlers}
    >
      {pending && <span aria-hidden className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[#A8741A]" />}
      {/* 1만 미만(원시 위안) 값은 저대비·소형으로 강등 — 월 셀(RevMatrixMonthCell)과 동일 규약(SL-7). */}
      <span
        className={`inline-flex items-center gap-0.5 leading-none tabular-nums ${
          display > 0 && display < 10000 ? "text-[10px] opacity-75" : "text-[11.5px]"
        } ${
          pending
            ? "font-bold text-[#7A520F]"
            : display > 0
              ? isMonthOnly
                ? "font-semibold text-[#7A520F]"
                : inferred
                  ? "font-semibold text-[#615D59]"
                  : "font-bold text-[#111110]"
              : editable
                ? "text-[#C9C5BF]"
                : "text-[#DDD9D3]"
        }`}
      >
        {locked && display > 0 && <Lock className="h-2.5 w-2.5 shrink-0 text-[#A39E98]" aria-label={lockLabel} />}
        {display > 0 ? formatWeekAmount(display) : "·"}
      </span>
    </td>
  )
})

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

// 확장된 월의 w1~w5 5칸. editContext가 오면(딜행·비잠금월) 각 칸이 편집 셀이 된다.
// month-only 행은 W5에 월합계를 얹어 시트 검수 감각을 유지(기존 읽기전용 규약 계승).
function RevMatrixWeekCells({
  weeks,
  inferred,
  monthOnlyAmount,
  bgClass,
  month,
  editContext = null,
  periodHighlighted = false,
}: {
  weeks: number[]
  inferred: boolean
  monthOnlyAmount: number
  bgClass: string
  month?: string
  editContext?: RevMatrixEditContext | null
  periodHighlighted?: boolean
}) {
  // 월 단위 잠금은 주차 인덱스와 무관(monthLockedOf) — 한 번만 조회해 순수 함수에 넘긴다.
  // 칸별 잠금(빈 칸은 열림)·표시 금액은 computeWeekCellStates가 결정한다(회귀 테스트가 검증하는 그 함수).
  const monthLocked = editContext ? editContext.monthLockedOf(month ?? "") : true
  const cellStates = computeWeekCellStates(weeks, monthOnlyAmount, monthLocked)
  const cells: React.ReactNode[] = []
  for (let index = 0; index < 5; index += 1) {
    const { display, isMonthOnly, locked: cellLocked } = cellStates[index]
    // 잠금 "표시"(🔒 아이콘·"시트 확정 잠금" 툴팁)는 편집 가능한 딜행에만 — 읽기전용 경로(카테고리
    // 합산행 등, editContext 없음)는 애초에 편집 대상이 아니라 잠금 신호가 오표기가 된다(9e8f1fc5
    // 순수 함수화 때 `: false`였던 읽기전용 분기가 `: true` 폴백으로 바뀌며 합산 주차칸마다 🔒가
    // 찍히던 회귀 — 리팩터 이전 렌더로 복원). 편집 판정(weekEditable)은 기존 그대로다.
    const weekLocked = Boolean(editContext) && cellLocked
    const weekEditable = Boolean(editContext) && !cellLocked
    // 선택/편집은 이 칸 기준으로 계산해 원시값으로 내린다 — 비선택·비편집 칸은 memo 스킵.
    const weekSelected = Boolean(editContext) && editContext!.isSelectedCell(month ?? "", index)
    const weekEditing = Boolean(editContext) && editContext!.isEditingCell(month ?? "", index)
    cells.push(
      <RevMatrixWeekCell
        key={index}
        display={display}
        isMonthOnly={isMonthOnly}
        inferred={inferred}
        weekIndex={index}
        bgClass={bgClass}
        month={editContext ? month : undefined}
        rowId={editContext?.rowId}
        editable={weekEditable}
        locked={weekLocked}
        lockLabel={editContext ? editContext.lockLabelOf(month ?? "") : undefined}
        editWarning={editContext ? editContext.weekEditNotice(month ?? "") : undefined}
        pending={editContext ? editContext.weekPendingOf(month ?? "", index) : null}
        actions={editContext?.actions ?? null}
        selected={weekSelected}
        isEditingCell={weekEditing}
        editBuffer={weekEditing ? editContext!.editBuffer : ""}
        editConfidence={weekEditing ? editContext!.editConfidence : "expected"}
        periodHighlighted={periodHighlighted}
      />,
    )
  }
  return <>{cells}</>
}

// 딜행 스트립에만 주입되는 편집 컨텍스트. 그룹 소계행은 이 값을 넘기지 않아 읽기전용 유지.
// 선택/편집 상태는 이 행 스코프로 좁혀(selected/editing 좌표가 이 행일 때만 non-null) 내려온다 —
// 각 셀의 선택·편집 여부는 스트립이 여기서 계산해 memo 셀에 원시 boolean으로 전달한다.
interface RevMatrixEditContext {
  rowId: string
  actions: MatrixEditorActions // identity 안정 — 셀 핸들러(선택/편집 시작/커밋/버퍼)용
  isSelectedCell: (month: string, week?: number) => boolean // 이 행 기준 셀 선택 판정
  isEditingCell: (month: string, week?: number) => boolean // 이 행 기준 셀 편집 판정
  editBuffer: string // 편집 중 버퍼 값(편집 셀에만 의미)
  editConfidence: DraftConfidence // 편집 중 확도(편집 셀에만 의미)
  // 잠금 아이콘·툴팁 라벨(월별) — 시트 원천은 "시트 확정", 적용 초안은 "장부 반영", 정정 적용으로
  // 재잠긴 원본 달은 "장부 반영(정정)"(품질 웨이브 4 — 항목 1: 정정이 셀을 지운 게 아니라 대체했음을
  // 구분해 보여준다 — 재편집을 시도하면 우측 패널 정정 초안으로 유도).
  lockLabelOf: (month: string) => string
  editableOf: (month: string) => boolean
  lockedOf: (month: string) => boolean
  pendingOf: (month: string) => MatrixPendingDraft | null
  // 주차(확장월) 칸의 월 단위 잠금 판정. 시트 확정/장부반영 등으로 그 "달"이 잠겼는지만 본다 —
  // 개별 주차 칸의 잠금(확정액이 찍힌 칸만 잠그고 빈 칸은 열기)은 computeWeekCellStates가 결정하므로
  // week 인자를 받지 않는다(이전 weekLockedOf(month, week)는 week를 무시해 5칸을 통째로 잠그는 함정이었다).
  monthLockedOf: (month: string) => boolean
  weekPendingOf: (month: string, week: number) => MatrixPendingDraft | null
  // 주차 셀 편집 팝오버 고지문 — explicit 행(주차 병합 보존) vs 그 외(월 전체 대체) 구분.
  weekEditNotice: (month: string) => string
}

// 12개월(요약/확장 혼재)에 걸친 월 셀 스트립 — 그룹행·딜행이 공유한다.
// editContext가 오면(딜행) 비확장 월 셀이 편집 셀이 된다. 확장(주차) 칸은 Phase 3 전까지 읽기전용.
function RevMatrixMonthStrip({
  monthlyByRowOrGroup,
  weeklyByMonth,
  months,
  expandedMonths,
  bgClass,
  editContext = null,
  // 웨이브 5 — 항목 1(b): "선택 기간"(M/Q) 달 집합. undefined/빈 Set이면 아무 셀도 강조하지 않는다
  // (period === "Y"거나 아직 계산 전인 초기 렌더 등) — 부모(그룹/딜/카테고리 행)가 안정 참조로 내려준다.
  periodMonths,
}: {
  monthlyByRowOrGroup: Record<string, RevMonthlyBucket>
  weeklyByMonth: (month: string) => { weeks: number[]; inferred: boolean; monthOnlyAmount: number; mismatch: boolean } | null
  months: string[]
  expandedMonths: Set<string>
  bgClass: string
  editContext?: RevMatrixEditContext | null
  periodMonths?: Set<string>
}) {
  return (
    <>
      {months.map((month) => {
        const bucket = monthlyByRowOrGroup[month] ?? EMPTY_BUCKET
        const periodHighlighted = periodMonths?.has(month) ?? false
        if (expandedMonths.has(month)) {
          const weekly = weeklyByMonth(month)
          return (
            <Fragment key={month}>
              <RevMatrixWeekCells
                weeks={weekly?.weeks ?? [0, 0, 0, 0, 0]}
                inferred={weekly?.inferred ?? false}
                monthOnlyAmount={weekly?.monthOnlyAmount ?? 0}
                bgClass={bgClass}
                month={month}
                editContext={editContext}
                periodHighlighted={periodHighlighted}
              />
              {/* 확장 중에도 그 달 총액을 잃지 않도록 주차 5칸 뒤에 읽기전용 월계 셀을 유지한다 */}
              <RevMatrixMonthCell bucket={bucket} mismatch={weekly?.mismatch ?? false} bgClass={bgClass} periodHighlighted={periodHighlighted} />
            </Fragment>
          )
        }
        const monthSelected = Boolean(editContext) && editContext!.isSelectedCell(month)
        const monthEditing = Boolean(editContext) && editContext!.isEditingCell(month)
        return (
          <RevMatrixMonthCell
            key={month}
            bucket={bucket}
            mismatch={weeklyByMonth(month)?.mismatch ?? false}
            bgClass={bgClass}
            month={editContext ? month : undefined}
            rowId={editContext?.rowId}
            editable={editContext ? editContext.editableOf(month) : false}
            locked={editContext ? editContext.lockedOf(month) : false}
            lockLabel={editContext ? editContext.lockLabelOf(month) : undefined}
            pending={editContext ? editContext.pendingOf(month) : null}
            actions={editContext?.actions ?? null}
            selected={monthSelected}
            isEditingCell={monthEditing}
            editBuffer={monthEditing ? editContext!.editBuffer : ""}
            editConfidence={monthEditing ? editContext!.editConfidence : "expected"}
            periodHighlighted={periodHighlighted}
          />
        )
      })}
    </>
  )
}

export const EMPTY_BUCKET: RevMonthlyBucket = { total: 0, confirmed: 0, high: 0, open: 0 }

// SL-4 → 1열 다이어트(2026-07-18): 매트릭스 1열의 미연결 표시는 "직행 링크 칩"에서
// "2단계 공개"로 바꾼다 — 대부분 행이 미연결이라 amber 칩 반복이 소음이었다(운영자 피드백).
// 트리거는 톤 다운된 컴팩트 칩(아이콘+연결), 클릭 시 팝오버(간단 설명 + 매칭 인박스 딥링크).
// open 상태는 부모(워크벤치)가 그룹키/행ID 단위로 1개만 들고 내려준다(동시 다중 열림 금지).
// account-master의 unmatched 판정과 1:1이라 연결됨/드리프트 행에는 렌더되지 않는다(기존 규약 유지).
export function NeedsLinkChip({
  customer,
  open,
  onToggle,
  onClose,
}: {
  customer: string
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  // 외부 클릭·Escape 닫기 — 문서 리스너는 열려 있을 때만 부착한다(MultiSelect 관례).
  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) onClose()
    }
    const onDocKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("mousedown", onDocMouseDown)
    document.addEventListener("keydown", onDocKeyDown)
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown)
      document.removeEventListener("keydown", onDocKeyDown)
    }
  }, [open, onClose])
  return (
    // 행 onClick(그룹 선택/상세 열기)과 분리 — 칩·팝오버 내부 클릭은 행 선택으로 전파하지 않는다.
    <span ref={wrapRef} className="relative inline-flex shrink-0" onClick={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${customer} — CRM 미연결`}
        title={`${customer} — CRM 미연결 · 클릭하면 연결 안내가 열립니다`}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[#A8741A] transition hover:bg-[#FBF1E0] hover:text-[#7A520F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
      >
        <Link2Off className="h-3 w-3 shrink-0" aria-hidden />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`${customer} CRM 연결 안내`}
          className="absolute left-0 top-full z-40 mt-1 w-60 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-2.5 text-left shadow-lg"
        >
          <p className="truncate text-[11.5px] font-bold text-[#111110]">{customer}</p>
          <p className="mt-1 text-[10.5px] font-semibold leading-relaxed text-[#615D59]">
            CRM 미연결 — 매출·활동이 CRM 고객과 이어져 있지 않습니다.
          </p>
          <Link
            href={`/admin/crm/matching?name=${encodeURIComponent(customer)}`}
            className="mt-2 flex items-center justify-center rounded-md border border-[#ECD29C] bg-[#FBF1E0] px-2 py-1 text-[10.5px] font-bold text-[#7A520F] transition hover:bg-[#ECD29C]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
          >
            매칭 인박스에서 연결 ↗
          </Link>
        </div>
      )}
    </span>
  )
}

// SL-4: 미연결(needs link) 행 전용 매칭 인박스 딥링크 — /admin/crm/matching?name= 프리필로 착지.
// 우측 레일(상세 단계) 전용 — 매트릭스 1열은 NeedsLinkChip(2단계 팝오버)을 쓰고, 이미 "상세"인
// 레일에서만 원클릭 직행을 유지한다. 링크 확정은 매칭 인박스에서만 한다(장부=분석·검수, 매칭=링크 확정).
export function NeedsLinkBadge({ customer }: { customer: string }) {
  return (
    <Link
      href={`/admin/crm/matching?name=${encodeURIComponent(customer)}`}
      onClick={(event) => event.stopPropagation()}
      title={`${customer} — CRM 미연결(needs link) · 매칭 인박스에서 연결`}
      className="inline-flex shrink-0 items-center rounded-full border border-[#ECD29C] bg-[#FFFCF5] px-1.5 text-[9px] font-bold leading-4 text-[#7A520F] underline-offset-2 transition hover:bg-[#FBF1E0] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
    >
      매칭 인박스에서 연결 ↗
    </Link>
  )
}

// P0-2(호환성 기획 2026-07-18 §4): 연결 확정(linked) 계정 전용 CRM 진입 링크 — NeedsLinkBadge의
// 대칭짝. href는 커버리지 확장(revAccounts.linkedTargets)의 우세 확정 링크 target을
// lib/crm/rev-sync-health.ts revLinkedTargetHref 규칙으로 만든 값을 그대로 받는다(여기서 재판정
// 없음). 우측 레일 전용 — 매트릭스 1열은 무변경(미연결 NeedsLinkChip/팝오버 현행 유지).
export function CrmLinkedBadge({
  customer,
  link,
  variant = "badge",
}: {
  customer: string
  /** null이면 미렌더(미연결·로딩·deal 등 href 없음) — 호출부가 조회값을 그대로 넘긴다. */
  link: { href: string; label: string } | null
  /** badge=그룹 요약(NeedsLinkBadge 자리 대칭 필), inline=행 상세('하드웨어 ↗'와 같은 톤/크기). */
  variant?: "badge" | "inline"
}) {
  if (!link) return null
  return (
    <Link
      href={link.href}
      onClick={(event) => event.stopPropagation()}
      title={`${customer} — CRM 연결됨(${link.label}) · CRM에서 보기`}
      className={
        variant === "inline"
          ? "shrink-0 text-[10px] font-bold text-[#7A520F] underline-offset-2 transition hover:text-[#A8741A] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
          : "inline-flex shrink-0 items-center rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-1.5 text-[9px] font-bold leading-4 text-[#084734] underline-offset-2 transition hover:bg-[#BDEFD8]/40 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
      }
    >
      CRM ↗
    </Link>
  )
}

// SL-2: 붙여넣기 프리뷰 다이얼로그 — 셀 매핑(고객·상품군·월·현재→새 값)과 일괄 확도를 확인한 뒤에만
// 초안을 만든다. 여기서 만드는 것은 어디까지나 "검토 초안"이며 장부 반영은 체크 큐(2단 게이트)에서만.
const MATRIX_PASTE_PREVIEW_LIMIT = 40

export function RevMatrixPasteDialog({
  plan,
  confidence,
  onPickConfidence,
  onCancel,
  onConfirm,
}: {
  plan: MatrixPastePlan
  confidence: DraftConfidence
  onPickConfidence: (next: DraftConfidence) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const shown = plan.cells.slice(0, MATRIX_PASTE_PREVIEW_LIMIT)
  const hidden = plan.cells.length - shown.length
  // 다이얼로그 포커스 캡처/복귀·Escape 닫기·Tab 트랩 = 공용 훅(use-dialog-focus)에 위임(품질
  // 웨이브 6 — 항목 1). 이 컴포넌트는 부모가 plan이 있을 때만 마운트하므로(조건부 렌더) 마운트
  // = 열림, 언마운트 = 닫힘 — openKey는 "이 마운트 동안 어느 버튼이 기본 포커스인가"를 그대로
  // 나타내는 값("apply"/"review")을 쓴다: 항상 truthy라 열림 판정은 그대로 유지되면서, 기존
  // autoFocus 분기(취소 vs 확인, applyCount 유무)가 바뀌면(이론상) 재포커스도 함께 일어난다.
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const hasApplyCells = plan.applyCount > 0
  useDialogFocus(hasApplyCells ? "apply" : "review", onCancel, hasApplyCells ? confirmButtonRef : cancelButtonRef)
  const statusMeta: Record<MatrixPasteCellPlan["status"], { label: string; className: string }> = {
    apply: { label: "초안 생성", className: "text-[#084734]" },
    locked: { label: "잠금 제외", className: "text-[#A39E98]" },
    unchanged: { label: "동일 값", className: "text-[#A39E98]" },
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="엑셀 붙여넣기 미리보기"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#111110]/40 p-4 sm:items-center"
    >
      <div className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_24px_70px_rgba(17,17,16,0.22)]">
        <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
          <p className="text-[13px] font-bold text-[#111110]">엑셀 붙여넣기 미리보기</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#615D59]">
            {plan.anchorCustomer} 선택 셀 기준 아래·오른쪽으로 매핑됩니다. 확인 시{" "}
            <span className="font-bold text-[#7A520F]">검토 초안 {plan.applyCount.toLocaleString("ko-KR")}건</span>이 생성되고,
            장부 반영은 체크 큐에서 체크 → 적용을 거쳐야만 이뤄집니다.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
            <span className="rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2 py-0.5 text-[#084734]">
              생성 {plan.applyCount.toLocaleString("ko-KR")}
            </span>
            {plan.lockedCount > 0 && (
              <span className="rounded-full border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 py-0.5 text-[#615D59]">
                잠금 제외 {plan.lockedCount.toLocaleString("ko-KR")}
              </span>
            )}
            {plan.unchangedCount > 0 && (
              <span className="rounded-full border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 py-0.5 text-[#615D59]">
                동일 값 {plan.unchangedCount.toLocaleString("ko-KR")}
              </span>
            )}
            {plan.outOfRangeCount > 0 && (
              <span className="rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 text-[#7A520F]">
                범위 밖 {plan.outOfRangeCount.toLocaleString("ko-KR")}
              </span>
            )}
            {plan.nonNumericCount > 0 && (
              <span className="rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 text-[#7A520F]">
                비숫자 제외 {plan.nonNumericCount.toLocaleString("ko-KR")}
              </span>
            )}
          </div>
        </div>
        {/* 일괄 확도 — 커밋 전 3버튼 필수 노출(SL-6과 같은 규약). 붙여넣기 전체에 하나의 확도가 기록된다. */}
        <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-[#615D59]">확도(전체 적용)</span>
            <div className="flex items-center gap-1">
              {DRAFT_CONFIDENCE_OPTIONS.map((option) => {
                const activeColor = CONFIDENCE_TOKENS[option.id].color
                const active = option.id === confidence
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onPickConfidence(option.id)}
                    className="rounded-md px-2.5 py-1 text-[11px] font-bold transition"
                    style={
                      active
                        ? { backgroundColor: activeColor, color: "#FFFFFF" }
                        : { color: activeColor, backgroundColor: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)" }
                    }
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            <span className="text-[10px] font-semibold text-[#A39E98]">확도별로 나눠 넣으려면 범위를 나눠 붙여넣으세요</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead className="text-[9.5px] uppercase tracking-[0.06em] text-[#A39E98]">
              <tr className="border-b border-[rgba(0,0,0,0.08)]">
                <th className="py-1.5 pr-2 font-bold">고객</th>
                <th className="py-1.5 pr-2 font-bold">상품군</th>
                <th className="py-1.5 pr-2 font-bold">월</th>
                <th className="py-1.5 pr-2 text-right font-bold">현재 → 새 값</th>
                <th className="py-1.5 text-right font-bold">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F1EE]">
              {shown.map((cell, index) => (
                <tr key={`${cell.rowId}-${cell.month}-${index}`} className={cell.status === "apply" ? "" : "opacity-60"}>
                  <td className="max-w-[180px] truncate py-1.5 pr-2 font-semibold text-[#111110]">{cell.customer}</td>
                  <td className="py-1.5 pr-2 text-[#615D59]">{productCategoryMeta(cell.productCategory).shortLabel}</td>
                  <td className="py-1.5 pr-2 font-semibold text-[#615D59]">{formatMonthLabel(cell.month)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    <span className="text-[#615D59]">{cell.current > 0 ? formatMoney(cell.current) : "·"}</span>
                    <span className="mx-1 text-[#A39E98]">→</span>
                    <span className="font-bold text-[#111110]">{formatMoney(cell.next)}</span>
                  </td>
                  <td className={`py-1.5 text-right text-[10px] font-bold ${statusMeta[cell.status].className}`}>
                    {cell.status === "locked" && <Lock className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" aria-hidden />}
                    {statusMeta[cell.status].label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hidden > 0 && (
            <p className="py-2 text-center text-[10.5px] font-semibold text-[#A39E98]">외 {hidden.toLocaleString("ko-KR")}칸 — 전체가 동일 규칙으로 처리됩니다</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-3">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            // applyCount=0이면 확인 버튼이 disabled라 취소 버튼이 초기 포커스를 받는다(위 useEffect) —
            // 그러지 않으면 포커스가 모달 뒤 그리드 셀에 남아 숫자 키가 편집을 시작해버린다.
            className="inline-flex h-9 items-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110]"
          >
            취소
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={plan.applyCount === 0}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
          >
            검토 초안 {plan.applyCount.toLocaleString("ko-KR")}건 생성
          </button>
        </div>
      </div>
    </div>
  )
}

// 고객 그룹 소계행(접힘 기본). ▸ 토글은 기존 UX 계승(ChevronRight rotate-90).
export const RevMatrixGroupRow = memo(function RevMatrixGroupRow({
  group,
  months,
  expandedMonths,
  expanded,
  selected,
  needsLink = false,
  linkPopoverOpen = false,
  onLinkPopoverToggle,
  onLinkPopoverClose,
  onSelect,
  onToggle,
  density = "regular",
  periodMonths,
}: {
  group: RevCustomerGroup
  months: string[]
  expandedMonths: Set<string>
  expanded: boolean
  selected: boolean
  needsLink?: boolean // account-master unmatched 판정 — 미연결 고객만 NeedsLinkChip 트리거(SL-4)
  linkPopoverOpen?: boolean // 미연결 팝오버 열림 — 부모가 그룹키 단위 1개만 열어준다
  onLinkPopoverToggle?: (key: string) => void
  onLinkPopoverClose?: () => void
  onSelect: (key: string) => void
  onToggle: (key: string) => void
  density?: MatrixDensity
  periodMonths?: Set<string> // 웨이브 5 — 항목 1(b): 선택 기간 열 accent
}) {
  const rowBg = selected ? "bg-[#ECFDF5]" : "bg-white group-hover:bg-[#FAFAF8]"
  const annual = group.annualTotal
  const annualTone = matrixBucketTone(annual)
  const weeklyByMonth = (month: string) => {
    // 그룹 소계는 주차 상세를 다시 합산하지 않는다(성능). 확장 시 그룹행은 요약만, 하위 딜행에서 주차 노출.
    void month
    return null
  }
  const monthlyByGroup = group.monthlyTotals
  return (
    <tr
      onClick={() => onSelect(group.key)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelect(group.key)
        }
      }}
      tabIndex={0}
      role="row"
      title="클릭: 우측 요약 · ▸ 펼치기: 하위 딜행"
      aria-label={`${group.customer} ${group.rows.length}건 — 우측 요약 열기`}
      className={`group ${MATRIX_GROUP_ROW_HEIGHT[density]} cursor-pointer border-t border-[#EDECE8] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 ${
        selected ? "bg-[#ECFDF5]" : "hover:bg-[#FAFAF8]"
      }`}
    >
      {/* 1열 다이어트(Ledger-1a): 항상 보이는 것 = 셰브론 + 고객명 + 서브라인 + 미연결 트리거뿐.
          건수·장부 필·불일치 아이콘은 1열에서 뺀다 — 건수·불일치는 우측 레일 그룹 요약이, 불일치는
          펼친 딜행 월 셀(빨강 배경+삼각형)이 이미 보여준다. 팝오버가 열린 셀만 z-30으로 승격해
          sticky 1열(z-10)·sticky 푸터(z-20) 위에 뜨게 한다(헤더 코너 z-40 아래). */}
      <td
        className={`sticky left-0 ${linkPopoverOpen ? "z-30" : "z-10"} border-r border-[rgba(0,0,0,0.08)] px-2 ${rowBg}`}
        style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggle(group.key)
            }}
            aria-expanded={expanded}
            aria-label={`${group.customer} 하위 ${group.rows.length}건 ${expanded ? "접기" : "펼치기"}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#615D59] transition hover:bg-[#F0F0EC] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-bold text-[#111110]">{group.customer}</span>
            {(group.managers.length > 0 || group.regions.length > 0) && (
              <span
                title={[group.managers.join(", "), group.teams.join(", "), group.regions.join(", ")].filter(Boolean).join(" · ")}
                className="block truncate text-[9.5px] font-semibold text-[#A39E98]"
              >
                {[group.managers.join("·"), group.regions.join("·")].filter(Boolean).join(" · ") || "-"}
              </span>
            )}
          </div>
          {/* 칩을 이름 옆이 아니라 행 우측 끝에 고정 — 이름 길이와 무관하게 열 우측 정렬(단독 딜행과 동일 규약). */}
          {needsLink && onLinkPopoverToggle && onLinkPopoverClose && (
            <NeedsLinkChip
              customer={group.customer}
              open={linkPopoverOpen}
              onToggle={() => onLinkPopoverToggle(group.key)}
              onClose={onLinkPopoverClose}
            />
          )}
        </div>
      </td>
      <td className="border-l border-[#F2F1EE] px-1.5 text-right" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }}>
        <div className="flex flex-wrap items-center justify-end gap-x-1">
          {/* 접힌 고객 헤더에는 링크를 걸지 않는다 — ▸로 펼친 뒤 카테고리/품목 행에서 하드웨어로 이동. */}
          {group.categories.map((category) => (
            <span
              key={category}
              title={`${productCategoryMeta(category).label} ${formatMoney(group.categoryTotals[category])}`}
              className={`text-[10px] font-semibold ${category === "hardware" ? "text-[#7A520F]" : "text-[#615D59]"}`}
            >
              {productCategoryMeta(category).shortLabel}
            </span>
          ))}
        </div>
      </td>
      <RevMatrixMonthStrip
        monthlyByRowOrGroup={monthlyByGroup}
        weeklyByMonth={weeklyByMonth}
        months={months}
        expandedMonths={expandedMonths}
        bgClass={rowBg}
        periodMonths={periodMonths}
      />
      <td
        className={`sticky right-0 z-10 border-l border-[rgba(0,0,0,0.08)] px-2 text-right align-middle tabular-nums ${rowBg}`}
        style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
      >
        {annual.total > 0 ? (
          <>
            <span className={`block text-[11.5px] leading-tight ${MATRIX_TONE[annualTone]}`}>{formatWeekAmount(annual.total)}</span>
            {annual.confirmed > 0 && (
              <span className="block text-[9px] font-semibold leading-tight text-[#084734]">확정 {formatWeekAmount(annual.confirmed)}</span>
            )}
          </>
        ) : (
          <span className="text-[11px] font-semibold text-[#C9C5BF]">–</span>
        )}
      </td>
    </tr>
  )
})

// 개별 딜행. 고객명 아래 서브라인에 담당자/팀/지역 이관. 확장된 달만 주차 5칸.
export const RevMatrixDealRow = memo(function RevMatrixDealRow({
  view,
  grouped,
  nested = false,
  needsLink = false,
  linkPopoverOpen = false,
  onLinkPopoverToggle,
  onLinkPopoverClose,
  months,
  expandedMonths,
  active,
  selectedMonth,
  onOpen,
  actions = null,
  // 선택/편집 좌표는 이 행 스코프로 좁혀서 온다(다른 행 선택이면 null) — 부모가 행별로 계산.
  // 덕분에 memo가 이 행이 선택/편집에 관여할 때만 리렌더되고, 나머지 행은 스킵된다.
  selectedCoord = null,
  editingCoord = null,
  editBuffer = "",
  editConfidence = "expected",
  pendingByCell = null,
  density = "regular",
  periodMonths,
}: {
  view: RevRowView
  grouped: boolean
  nested?: boolean // 카테고리(HW/SW) 합산행 아래 품목 잎 행 — 한 단계 더 들여쓰기
  needsLink?: boolean // account-master unmatched 판정 — 단독 딜행(비그룹)에만 NeedsLinkChip 트리거(SL-4)
  linkPopoverOpen?: boolean // 미연결 팝오버 열림 — 부모가 행ID 단위 1개만 열어준다
  onLinkPopoverToggle?: (key: string) => void
  onLinkPopoverClose?: () => void
  months: string[]
  expandedMonths: Set<string>
  active: boolean
  selectedMonth: string
  onOpen: (row: LedgerRevenueRow) => void
  actions?: MatrixEditorActions | null
  selectedCoord?: MatrixCellCoord | null
  editingCoord?: MatrixCellCoord | null
  editBuffer?: string
  editConfidence?: DraftConfidence
  pendingByCell?: Map<string, MatrixPendingDraft> | null
  density?: MatrixDensity
  periodMonths?: Set<string> // 웨이브 5 — 항목 1(b): 선택 기간 열 accent
}) {
  const { row, draftRow, monthlyByMonth } = view
  const rowBg = active
    ? "bg-[#ECFDF5]"
    : draftRow
      ? "bg-[#FFFCF5] group-hover:bg-[#FBF1E0]"
      : grouped
        ? "bg-[#FBFBFA] group-hover:bg-[#FAFAF8]"
        : "bg-white group-hover:bg-[#FAFAF8]"
  const subLine = draftRow
    ? `${row.draftKind === "edit-row" ? "수정" : "신규"} · ${formatMonthLabel(row.draftMonth ?? selectedMonth)}${row.draftNote ? ` · ${row.draftNote}` : ""}`
    : [row.manager, row.team, row.region].filter(Boolean).join(" · ")
  const annual = view.annual
  const annualTone = matrixBucketTone(annual)
  const weeklyByMonth = (month: string) => {
    const split = rowWeeklySplit(row, month)
    if (split.source === "empty") return null
    return {
      weeks: split.source === "explicit" || split.source === "inferred" ? split.weeks : [0, 0, 0, 0, 0],
      inferred: split.source === "inferred",
      monthOnlyAmount: split.source === "month-only" ? split.total : 0,
      mismatch: rowWeeklyMismatch(row, month) !== null,
    }
  }
  // 편집 컨텍스트는 actions가 주입될 때만(딜행) — 그룹 소계행에는 이 컴포넌트를 쓰지 않으므로 항상 딜행.
  // isSelectedCell/isEditingCell는 행 스코프 좌표(selectedCoord/editingCoord)와 month·week를 비교한다 —
  // 원 isSelected/isEditing 규약과 동일(행 rowId 일치는 좌표가 이미 이 행일 때만 non-null이라 내포).
  const editContext: RevMatrixEditContext | null = actions
    ? {
        rowId: row.id,
        actions,
        isSelectedCell: (month, week) =>
          selectedCoord != null && selectedCoord.month === month && (selectedCoord.week ?? -1) === (week ?? -1),
        isEditingCell: (month, week) =>
          editingCoord != null && editingCoord.month === month && (editingCoord.week ?? -1) === (week ?? -1),
        editBuffer,
        editConfidence,
        // 품질 웨이브 4 — 항목 1: 정정으로 재잠긴 달만 "장부 반영(정정)"으로 구분 — 나머지는 기존 규약.
        lockLabelOf: (month) =>
          view.correctedMonths?.has(month) ? "장부 반영(정정)" : row.ledgerOrigin === "draft" ? "장부 반영" : "시트 확정",
        editableOf: (month) => isMatrixCellEditable(row, month, view.correctedMonths),
        lockedOf: (month) => isMatrixCellLocked(row, month, view.correctedMonths),
        pendingOf: (month) => pendingByCell?.get(`${row.id}::${month}`) ?? null,
        // 월 단위 잠금 = 그 달 시트 확정 여부. 칸별 잠금은 computeWeekCellStates가 display>0로 좁힌다.
        // 주차 pending = `rowId::month::wN` 키.
        monthLockedOf: (month) => isMatrixCellLocked(row, month, view.correctedMonths),
        weekPendingOf: (month, week) => pendingByCell?.get(`${row.id}::${month}::w${week + 1}`) ?? null,
        weekEditNotice: (month) =>
          rowWeeklySplit(row, month).source === "explicit"
            ? "커밋 시 이 달 금액이 주차 합계로 재기재됩니다 (기존 주차 병합 보존)"
            : "적용 시 이 달 전체가 이 값으로 대체됩니다 (주차 분해 없음)",
      }
    : null
  return (
    <tr role="row" className={`group ${MATRIX_DEAL_ROW_HEIGHT[density]} border-t border-[#F2F1EE] transition ${active ? "bg-[#ECFDF5]" : draftRow ? "bg-[#FFFCF5] hover:bg-[#FBF1E0]" : grouped ? "bg-[#FBFBFA] hover:bg-[#FAFAF8]" : "hover:bg-[#FAFAF8]"}`}>
      {/* 1열 다이어트(Ledger-1a): 이름 + 서브라인 + (단독 미연결 행만) 트리거뿐. ⓘ 계보는 우측
          레일 행 상세 헤더 아래 뮤트 라인으로 이동, SW/HW 라벨·HW ↗ 링크는 제거(상품 칼럼이
          SW/HW를 이미 말하고, 하드웨어 ↗는 레일 상세·카테고리 합산행에 있다). 팝오버가 열린
          셀만 z-30 승격 — 그룹 소계행과 동일 규약. */}
      <td
        className={`sticky left-0 ${linkPopoverOpen ? "z-30" : "z-10"} border-r border-[rgba(0,0,0,0.08)] pr-2 ${nested ? "border-l-2 border-l-[#CBD9D2] pl-12" : grouped ? "border-l-2 border-l-[#DDE7E2] pl-7" : "pl-2"} ${rowBg}`}
        style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
      >
        <div className="flex items-center gap-1">
          {/* 단독 딜행(비그룹·비중첩)은 그룹 소계행의 셰브론 폭(h-6 w-6)을 빈 자리로 예약한다 —
              토글 유무로 고객명 시작 위치가 흔들리지 않도록 1열 정렬을 고정한다. */}
          {!grouped && !nested && <span className="h-6 w-6 shrink-0" aria-hidden="true" />}
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => void onOpen(row)}
              title={`${row.customer} 상세 열기`}
              className="block max-w-full truncate text-left text-[11.5px] font-bold text-[#111110] underline-offset-2 hover:text-[#084734] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
              aria-label={`${row.customer} 상세 열기`}
            >
              {grouped ? row.productVersion || row.customer : row.customer}
            </button>
            {subLine && (
              <span title={subLine} className={`block truncate text-[9.5px] font-semibold ${draftRow ? "text-[#7A520F]" : "text-[#A39E98]"}`}>
                {subLine}
              </span>
            )}
          </div>
          {/* 그룹 고객은 그룹 소계행이 트리거를 가진다 — 단독 딜행에만(중복 노출 방지). */}
          {!grouped && needsLink && onLinkPopoverToggle && onLinkPopoverClose && (
            <NeedsLinkChip
              customer={row.customer}
              open={linkPopoverOpen}
              onToggle={() => onLinkPopoverToggle(row.id)}
              onClose={onLinkPopoverClose}
            />
          )}
        </div>
      </td>
      <td className="border-l border-[#F2F1EE] px-1.5 text-right align-middle" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }}>
        {/* 품질 웨이브 4 — 항목 8: "시트/장부" 원천 라벨도 실데이터라 #615D59로 승격. */}
        <span className={`text-[10px] font-semibold ${draftRow ? "text-[#A8741A]" : "text-[#615D59]"}`}>
          {draftRow ? "장부" : "시트"}
        </span>
      </td>
      <RevMatrixMonthStrip
        monthlyByRowOrGroup={monthlyByMonth}
        weeklyByMonth={weeklyByMonth}
        months={months}
        expandedMonths={expandedMonths}
        bgClass={rowBg}
        editContext={editContext}
        periodMonths={periodMonths}
      />
      <td
        className={`sticky right-0 z-10 border-l border-[rgba(0,0,0,0.08)] px-2 text-right align-middle tabular-nums ${rowBg}`}
        style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
      >
        {annual.total > 0 ? (
          <span className={`block text-[11px] leading-tight ${MATRIX_TONE[annualTone]}`}>{formatWeekAmount(annual.total)}</span>
        ) : (
          <span className="text-[11px] font-semibold text-[#C9C5BF]">–</span>
        )}
      </td>
    </tr>
  )
})

// 고객 펼침 시 카테고리(HW/SW) 합산 1행. 그 카테고리 품목들의 12개월 소계를 한 줄로 보여준다.
// 개별 품목행 대신 "HW 쭉 하나로, SW 하나로" 구조 — 품목명은 서브라인에, 상세/편집은 우측 rail에서.
export const RevMatrixCategoryRow = memo(function RevMatrixCategoryRow({
  category,
  customer,
  products,
  monthlyByMonth,
  annual,
  rows,
  months,
  expandedMonths,
  expanded,
  editable,
  hardwareLinked,
  onToggle,
  onOpen,
  density = "regular",
  periodMonths,
}: {
  category: Exclude<RevProductCategory, "all">
  customer: string
  products: string[]
  monthlyByMonth: Record<string, RevMonthlyBucket>
  annual: RevMonthlyBucket
  rows: LedgerRevenueRow[]
  months: string[]
  expandedMonths: Set<string>
  expanded: boolean
  editable: boolean // 이 카테고리에 편집 가능한 품목이 있는지(전부 잠금이면 ▸ 대신 잠금 표시)
  hardwareLinked: boolean // 하드웨어 원장에 출고 이력이 있어 역링크 걸어도 되는 고객인지
  onToggle: () => void
  onOpen: () => void
  density?: MatrixDensity
  periodMonths?: Set<string> // 웨이브 5 — 항목 1(b): 선택 기간 열 accent
}) {
  const rowBg = category === "hardware" ? "bg-[#FFFCF5] group-hover:bg-[#FBF6EC]" : "bg-[#FBFBFA] group-hover:bg-[#FAFAF8]"
  const annualTone = matrixBucketTone(annual)
  const subLine = products.slice(0, 3).join(" · ") + (products.length > 3 ? ` +${products.length - 3}` : "")
  // 확장월 주차 5칸: 이 카테고리 품목들의 주차 분해를 합산한다.
  const weeklyByMonth = (month: string) => {
    const weeks = [0, 0, 0, 0, 0]
    let hasExplicit = false
    let hasInferred = false
    let monthOnlyAmount = 0
    for (const row of rows) {
      const split = rowWeeklySplit(row, month)
      if (split.source === "explicit" || split.source === "inferred") {
        split.weeks.forEach((value, index) => { weeks[index] += value })
        if (split.source === "explicit") hasExplicit = true
        else hasInferred = true
      } else if (split.source === "month-only") {
        monthOnlyAmount += split.total
      }
    }
    if (!weeks.some((value) => value > 0) && monthOnlyAmount === 0) return null
    return { weeks, inferred: !hasExplicit && hasInferred, monthOnlyAmount, mismatch: false }
  }
  return (
    <tr role="row" className={`group ${MATRIX_DEAL_ROW_HEIGHT[density]} border-t border-[#F2F1EE] transition ${
      category === "hardware" ? "bg-[#FFFCF5] hover:bg-[#FBF6EC]" : "bg-[#FBFBFA] hover:bg-[#FAFAF8]"
    }`}>
      <td
        className={`sticky left-0 z-10 border-l-2 border-l-[#DDE7E2] border-r border-[rgba(0,0,0,0.08)] pl-5 pr-2 ${rowBg}`}
        style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            title={expanded ? "품목 접기" : editable ? "품목 펼쳐 엑셀식 편집" : "품목 보기 (전부 확정·잠금)"}
            aria-label={`${productCategoryMeta(category).label} 품목 ${expanded ? "접기" : "펼치기"}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#615D59] transition hover:bg-[#F0F0EC] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
          <button
            type="button"
            onClick={onOpen}
            title={`${productCategoryMeta(category).label} 합산 · ${products.join(", ") || "-"} · 상세 열기`}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/30"
          >
            <ProductCategoryPill category={category} compact />
            <span className="min-w-0 truncate text-[11px] font-semibold text-[#615D59]">{subLine || productCategoryMeta(category).label}</span>
          </button>
        </div>
      </td>
      <td className="border-l border-[#F2F1EE] px-1.5 text-right align-middle" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }}>
        {category === "hardware" && hardwareLinked ? (
          // 펼친 뒤 나오는 HW 합산행 → 하드웨어 원장 역링크(연결된 고객만).
          <Link
            href={`/admin/hardware?customer=${encodeURIComponent(customer)}`}
            title={`${customer} 하드웨어 거래이력 열기`}
            className="text-[10px] font-semibold text-[#7A520F] underline-offset-2 transition hover:text-[#A8741A] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
          >
            HW ↗
          </Link>
        ) : (
          // 품질 웨이브 4 — 항목 8: "합산"도 실데이터 라벨이라 #615D59로 승격.
          <span className="text-[10px] font-semibold text-[#615D59]">합산</span>
        )}
      </td>
      <RevMatrixMonthStrip
        monthlyByRowOrGroup={monthlyByMonth}
        weeklyByMonth={weeklyByMonth}
        months={months}
        expandedMonths={expandedMonths}
        bgClass={rowBg}
        periodMonths={periodMonths}
      />
      <td
        className={`sticky right-0 z-10 border-l border-[rgba(0,0,0,0.08)] px-2 text-right align-middle tabular-nums ${rowBg}`}
        style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
      >
        {annual.total > 0 ? (
          <span className={`block text-[11px] leading-tight ${MATRIX_TONE[annualTone]}`}>{formatWeekAmount(annual.total)}</span>
        ) : (
          <span className="text-[11px] font-semibold text-[#C9C5BF]">–</span>
        )}
      </td>
    </tr>
  )
})

// 하단 sticky 합계행: 월별 확정/고확도/예정 스택 + 월 목표 대비 %.
export const RevMatrixFooter = memo(function RevMatrixFooter({
  columns,
  grand,
  months,
  expandedMonths,
  periodMonths,
}: {
  columns: RevMatrixColumn[]
  grand: RevMonthlyBucket
  months: string[]
  expandedMonths: Set<string>
  periodMonths?: Set<string> // 웨이브 5 — 항목 1(b): 선택 기간 열 accent(본문·헤더와 동일한 시각 언어)
}) {
  const columnByMonth = new Map(columns.map((column) => [column.month, column]))
  const hasAnyGoal = columns.some((column) => column.goal !== null)
  return (
    <tfoot className="sticky bottom-0 z-20">
      {/* 월별 확정/고확도/예정 스택 */}
      <tr role="row" className="h-9 border-t-2 border-[#111110]/15 bg-[#F6F5F4]">
        <td
          className="sticky left-0 z-10 border-r border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 text-[10px] font-bold uppercase tracking-[0.06em] text-[#615D59]"
          style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
        >
          월 합계 (확정·고확도·예정)
        </td>
        <td className="border-l border-[#E7E5E1] bg-[#F6F5F4]" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }} />
        {months.map((month) => {
          const column = columnByMonth.get(month) ?? null
          const bucket = column ?? EMPTY_BUCKET
          const span = expandedMonths.has(month) ? 6 : 1
          const width = span === 6 ? MATRIX_WEEK_W * 5 + MATRIX_MONTH_W : MATRIX_MONTH_W
          const periodHighlighted = periodMonths?.has(month) ?? false
          return (
            <td
              key={month}
              colSpan={span}
              title={column ? `${formatMonthLabel(month)} 합계 ${formatMoney(bucket.total)} · 확정 ${formatMoney(bucket.confirmed)} · 고확도 ${formatMoney(bucket.high)} · 예정 ${formatMoney(bucket.open)}` : undefined}
              className={`px-1.5 py-1 text-right align-middle tabular-nums bg-[#F6F5F4] ${
                periodHighlighted ? "border-l-2 border-l-[#084734]/25" : "border-l border-[#E7E5E1]"
              }`}
              style={{ width, minWidth: width }}
            >
              {bucket.total > 0 ? (
                <span className="flex flex-col items-end leading-none">
                  <span className={`text-[10.5px] font-bold ${CONFIDENCE_TOKENS.confirmed.textClass}`}>{formatWeekAmount(bucket.confirmed)}</span>
                  <span className={`text-[9px] font-semibold ${CONFIDENCE_TOKENS["high-confidence"].textClass}`}>{formatWeekAmount(bucket.high)}</span>
                  <span className={`text-[9px] font-semibold ${CONFIDENCE_TOKENS.expected.textClass}`}>{formatWeekAmount(bucket.open)}</span>
                </span>
              ) : (
                <span className="text-[11px] text-[#DDD9D3]">·</span>
              )}
            </td>
          )
        })}
        <td
          className="sticky right-0 z-10 border-l border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 py-1 text-right align-middle tabular-nums"
          style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
        >
          <span className="flex flex-col items-end leading-none">
            <span className={`text-[11px] font-bold ${CONFIDENCE_TOKENS.confirmed.textClass}`}>{formatWeekAmount(grand.confirmed)}</span>
            <span className={`text-[9px] font-semibold ${CONFIDENCE_TOKENS["high-confidence"].textClass}`}>{formatWeekAmount(grand.high)}</span>
            <span className={`text-[9px] font-semibold ${CONFIDENCE_TOKENS.expected.textClass}`}>{formatWeekAmount(grand.open)}</span>
          </span>
        </td>
      </tr>
      {/* 월 목표 대비 % (DSH 월 목표 시리즈가 있을 때만) */}
      {hasAnyGoal && (
        <tr role="row" className="h-7 border-t border-[#E7E5E1] bg-[#FAFAF8]">
          <td
            className="sticky left-0 z-10 border-r border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 text-[10px] font-bold uppercase tracking-[0.06em] text-[#615D59]"
            style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
          >
            월 목표 대비 (확정)
          </td>
          <td className="border-l border-[#E7E5E1] bg-[#FAFAF8]" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }} />
          {months.map((month) => {
            const column = columnByMonth.get(month) ?? null
            const span = expandedMonths.has(month) ? 6 : 1
            const width = span === 6 ? MATRIX_WEEK_W * 5 + MATRIX_MONTH_W : MATRIX_MONTH_W
            const pct = column && column.goal ? (column.confirmed / column.goal) * 100 : null
            const tone = pct === null ? "text-[#C9C5BF]" : pct >= 100 ? "text-[#084734]" : pct >= 60 ? "text-[#A8741A]" : "text-[#B43E3E]"
            const periodHighlighted = periodMonths?.has(month) ?? false
            return (
              <td
                key={month}
                colSpan={span}
                title={column && column.goal ? `${formatMonthLabel(month)} 목표 ${formatMoney(column.goal)} · 확정 ${formatMoney(column.confirmed)}` : "월 목표 미설정"}
                className={`px-1.5 text-right align-middle tabular-nums bg-[#FAFAF8] ${
                  periodHighlighted ? "border-l-2 border-l-[#084734]/25" : "border-l border-[#E7E5E1]"
                }`}
                style={{ width, minWidth: width }}
              >
                {/* % 자리수는 formatPercent SSOT(최대 1자리) — 보조 분석·레일 KPI 달성률과 동일 규칙. */}
                <span className={`text-[10px] font-bold ${tone}`}>{pct === null ? "·" : formatPercent(pct)}</span>
              </td>
            )
          })}
          <td
            className="sticky right-0 z-10 border-l border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 text-right align-middle tabular-nums"
            style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
          >
            {(() => {
              const goalSum = columns.reduce((sum, column) => sum + (column.goal ?? 0), 0)
              const goalMonths = columns.filter((column) => column.goal !== null).length
              const pct = goalSum > 0 ? (grand.confirmed / goalSum) * 100 : null
              const tone = pct === null ? "text-[#C9C5BF]" : pct >= 100 ? "text-[#084734]" : pct >= 60 ? "text-[#A8741A]" : "text-[#B43E3E]"
              // 분모는 '목표가 설정된 달'만 — 부분 목표일 때 연간 순항으로 오독하지 않게 표기한다.
              return (
                <span
                  title={pct === null ? undefined : `목표 설정 ${goalMonths}/${columns.length}개월 합계 대비 확정${goalMonths < columns.length ? " — 부분 목표 기준" : ""}`}
                  className={`text-[10.5px] font-bold ${tone}`}
                >
                  {pct === null ? "·" : `${formatPercent(pct)}${goalMonths < columns.length ? "*" : ""}`}
                </span>
              )
            })()}
          </td>
        </tr>
      )}
    </tfoot>
  )
})
