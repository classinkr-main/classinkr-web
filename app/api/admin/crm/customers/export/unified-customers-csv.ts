// 통합 고객 CSV 열 정의 — GET /api/admin/crm/customers/export 전용(라우트 파일은 핸들러만 export 할 수
// 있어 열 정의를 옆 모듈로 뺐다). 순수 함수라 테스트가 입력·출력으로 고정한다.
//
// 규칙
// - 이스케이프·BOM·수식 주입 방어는 lib/crm/csv.ts(buildCsv) 한 곳.
// - 금액은 통화별 열로만 둔다 — 잔액(¥)·오더($)·계약/미수(₩)를 한 열에 합치거나 더하지 않는다.
// - 개인정보 수준은 리드 보드 CSV 와 같다(연락처 원문 포함). 메모·기록 본문은 싣지 않는다.
// - 날짜는 KST 로 적는다(시트에서 날짜로 바로 읽히게 "YYYY-MM-DD", 연락 시각은 "YYYY-MM-DD HH:mm").

import { buildCsv, type CsvColumn } from "@/lib/crm/csv"
import {
  SEGMENT_BILLING_LABELS,
  SEGMENT_KIND_LABELS,
  SEGMENT_RISK_LABELS,
  daysUntilIso,
  type SegmentBillingMode,
  type SegmentCustomerKind,
  type SegmentRiskLevel,
} from "@/lib/crm/customer-segment-spec"
import { lastContactChannelLabel, lastContactDays } from "@/lib/crm/last-contact"
import type { CrmUnifiedCustomerRow } from "@/lib/crm/unified-view-rules"

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function kstParts(iso: string | null | undefined): string | null {
  if (!iso) return null
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return null
  return new Date(time + KST_OFFSET_MS).toISOString()
}

/** KST 날짜 "YYYY-MM-DD". */
export function kstDate(iso: string | null | undefined): string {
  return kstParts(iso)?.slice(0, 10) ?? ""
}

/** KST 일시 "YYYY-MM-DD HH:mm". */
export function kstDateTime(iso: string | null | undefined): string {
  const parts = kstParts(iso)
  return parts ? `${parts.slice(0, 10)} ${parts.slice(11, 16)}` : ""
}

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null
}

export function unifiedCustomerCsvColumns(nowMs: number): CsvColumn<CrmUnifiedCustomerRow>[] {
  return [
    { header: "고객 키", value: (row) => row.key },
    { header: "구분", value: (row) => SEGMENT_KIND_LABELS[row.source as SegmentCustomerKind] ?? row.source },
    { header: "출처", value: (row) => row.sourceLabel },
    { header: "고객명", value: (row) => row.name },
    { header: "연락처", value: (row) => row.contact },
    { header: "지역", value: (row) => row.regionLabel ?? "" },
    { header: "담당", value: (row) => row.ownerName ?? "" },
    { header: "상태", value: (row) => row.statusLabel },
    { header: "다음 액션", value: (row) => row.nextActionLabel },
    { header: "우선 사유", value: (row) => row.priorityReason },
    { header: "점수", value: (row) => row.score },
    { header: "라벨", value: (row) => row.tags.join(" | ") },
    { header: "마지막 연락일시", value: (row) => kstDateTime(row.lastContactAt) },
    {
      header: "마지막 연락 경과(일)",
      value: (row) => lastContactDays(row.lastContactAt, nowMs),
    },
    {
      header: "마지막 연락 채널",
      value: (row) => (row.lastContactAt ? lastContactChannelLabel(row.lastContactSource ?? null, row.lastContactChannel ?? null) : "기록 없음"),
    },
    { header: "마지막 연락자", value: (row) => row.lastContactActor ?? "" },
    { header: "만료일", value: (row) => kstDate(row.expireAt) },
    {
      header: "만료까지(일)",
      value: (row) => {
        const days = daysUntilIso(row.expireAt, nowMs)
        return days == null ? null : Math.floor(days)
      },
    },
    { header: "소진 예상(일)", value: (row) => finiteOrNull(row.depletionInDays) },
    {
      header: "과금 방식",
      value: (row) => (row.billingMode ? SEGMENT_BILLING_LABELS[row.billingMode as SegmentBillingMode] ?? row.billingMode : ""),
    },
    {
      header: "위험 등급",
      value: (row) => (row.riskLevel ? SEGMENT_RISK_LABELS[row.riskLevel as SegmentRiskLevel] ?? row.riskLevel : ""),
    },
    { header: "위험 사유", value: (row) => (row.riskReasonLabels ?? []).join(" | ") },
    { header: "최근 수업일", value: (row) => kstDate(row.lastClassAt) },
    // 통화별 열 — 합산 금지(플레이북 04-growth-crm). 원천이 없는 통화 칸은 비운다.
    { header: "잔액(CNY ¥)", value: (row) => (row.source === "neo_account" ? finiteOrNull(row.balance) : null) },
    { header: "오더(USD $)", value: (row) => finiteOrNull(row.orderAmountUsd) },
    { header: "계약(KRW ₩)", value: (row) => finiteOrNull(row.contractedKrw) },
    { header: "미수(KRW ₩)", value: (row) => finiteOrNull(row.outstandingKrw) },
    { header: "진행 딜", value: (row) => (row.source === "customer" ? row.activeDealCount ?? 0 : null) },
    { header: "리드 등록일", value: (row) => kstDate(row.createdAt) },
    { header: "최근 업데이트", value: (row) => kstDate(row.updatedAt) },
  ]
}

/** 행 → CSV 본문(BOM·CRLF·수식 주입 방어 포함). */
export function buildUnifiedCustomersCsv(rows: readonly CrmUnifiedCustomerRow[], nowMs: number): string {
  return buildCsv(rows, unifiedCustomerCsvColumns(nowMs))
}
