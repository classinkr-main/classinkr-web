// CRM 고객 360 매출 탭 CSV 내보내기 — 기획안 §11.1 M5.
//
// 순수 함수만 둔다(I/O 없음, DOM 없음) — Blob 생성·다운로드 트리거는 호출부
// (components/admin/crm/Customer360DetailMoney.tsx)의 몫이다. 여기서는 문자열만 만든다.
//
// 통화 정책: 품목·타임라인 모두 "통화" 열과 "금액" 열을 분리해서 내보내고, 여러 행을 더한
// 합계 행은 절대 넣지 않는다(₩/$/¥ 합산 금지 — CRM 돈흐름 정책, lib/crm/money-format.ts 참고).
// 금액은 화면 표기(₩1,200만 등 축약)가 아니라 순수 숫자로 내보낸다 — Excel에서 그대로 계산·정렬
// 가능해야 하고, 축약 단위 문자열은 숫자 열에 섞이면 오독을 낳는다.

import type { CrmMoneyLineItem } from "@/lib/crm/money-line-items"
import { MONEY_TIMELINE_KIND_META, moneyTimelineStatusLabel, type MoneyTimelineEntry } from "@/lib/crm/money-timeline"

/** 공용 CSV 이스케이프. 쉼표·따옴표·CR·LF가 섞인 셀만 큰따옴표로 감싸고, 내부 따옴표는 두 배로. */
export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = cell ?? ""
          return /["\r\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
        })
        .join(",")
    )
    .join("\n")
}

export interface MoneyCsvMeta {
  /** 파일 상단 메타 행 "고객"에 그대로 들어간다. */
  customerName: string
  /** 파일 상단 메타 행 "생성 시각"에 그대로 들어간다(포맷은 호출부 책임, 이 함수는 문자열을 그대로 씀). */
  generatedAt: string
}

function toDateKeyOrEmpty(value: string | null): string {
  if (!value) return ""
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return ""
  // UTC 기준 YYYY-MM-DD — 실행 환경 타임존과 무관하게 결정적이어야 테스트·화면이 어긋나지 않는다.
  return new Date(time).toISOString().slice(0, 10)
}

function numberOrEmpty(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "" : String(value)
}

// ── M2 품목별 대수 표 → CSV ──────────────────────────────────────────────
// 라벨 값은 components/admin/crm/Customer360DetailMoney.tsx의 LINE_ITEM_CATEGORY_LABEL 및
// EvidenceBadge 문구와 같은 값을 유지한다. 이 파일은 순수 함수만 두므로(컴포넌트를 import하지
// 않음) 값을 복제한다 — 카테고리·근거 문구를 바꾸면 두 곳을 함께 고친다.
const LINE_ITEM_CATEGORY_LABEL: Record<CrmMoneyLineItem["category"], string> = {
  board: "칠판",
  stand: "스탠드",
  camera: "카메라",
  software: "소프트웨어",
  other: "기타",
}

const LINE_ITEM_EVIDENCE_LABEL: Record<CrmMoneyLineItem["evidence"], string> = {
  confirmed: "확정",
  estimated: "추정",
}

const LINE_ITEM_SOURCE_LABEL: Record<CrmMoneyLineItem["source"], string> = {
  deal_line_items: "딜",
  hw_outbound: "HW 출고",
}

export const MONEY_LINE_ITEMS_CSV_HEADERS = [
  "품목",
  "카테고리",
  "수량",
  "통화",
  "단가",
  "금액",
  "근거",
  "출처",
  "최근 일자",
  "주문번호",
  "시리얼",
] as const

/**
 * 품목별 대수 표(M2)를 CSV 문자열로 만든다. 행 하나 = 품목 그룹 하나(이미 통화·근거·출처별로
 * 분리된 lib/crm/money-line-items.ts의 결과를 그대로 옮긴다 — 여기서 다시 합치지 않는다).
 * 주문번호·시리얼은 그룹 안 여러 건을 세미콜론으로 이어 붙인다.
 */
export function buildMoneyLineItemsCsv(lineItems: CrmMoneyLineItem[], meta: MoneyCsvMeta): string {
  const rows: string[][] = [["고객", meta.customerName], ["생성 시각", meta.generatedAt], [], [...MONEY_LINE_ITEMS_CSV_HEADERS]]
  for (const item of lineItems) {
    const refs = Array.from(new Set(item.details.map((detail) => detail.ref).filter((ref) => ref.length > 0)))
    const serials = item.details.flatMap((detail) => detail.serials).filter((serial) => serial.length > 0)
    rows.push([
      item.product,
      LINE_ITEM_CATEGORY_LABEL[item.category],
      String(item.quantity),
      item.currency ?? "",
      numberOrEmpty(item.unitPrice),
      numberOrEmpty(item.amount),
      LINE_ITEM_EVIDENCE_LABEL[item.evidence],
      LINE_ITEM_SOURCE_LABEL[item.source],
      toDateKeyOrEmpty(item.lastAt),
      refs.join(";"),
      serials.join(";"),
    ])
  }
  return toCsv(rows)
}

// ── M3 주문 타임라인 → CSV ───────────────────────────────────────────────
export const MONEY_TIMELINE_CSV_HEADERS = ["일자", "구분", "제목", "통화", "금액", "상태", "담당자", "출처"] as const

/** 주문 타임라인(M3)을 CSV 문자열로 만든다. 행 하나 = 타임라인 항목(오더/수금/딜) 하나. */
export function buildMoneyTimelineCsv(entries: MoneyTimelineEntry[], meta: MoneyCsvMeta): string {
  const rows: string[][] = [["고객", meta.customerName], ["생성 시각", meta.generatedAt], [], [...MONEY_TIMELINE_CSV_HEADERS]]
  for (const entry of entries) {
    rows.push([
      toDateKeyOrEmpty(entry.occurredAt),
      MONEY_TIMELINE_KIND_META[entry.kind].label,
      entry.title,
      entry.currency,
      numberOrEmpty(entry.amount),
      moneyTimelineStatusLabel(entry) ?? "",
      entry.ownerName ?? "",
      entry.sourceLabel,
    ])
  }
  return toCsv(rows)
}

// ── 파일명 ───────────────────────────────────────────────────────────────
export type MoneyCsvKind = "line-items" | "timeline"

/** 파일명에 못 쓰는 문자(경로 구분자·따옴표·쉼표 등)를 제거하고 공백은 하이픈으로 묶는다. */
function slugifyForFileName(value: string): string {
  const safe = value
    .normalize("NFKC")
    .trim()
    .replace(/[\\/:*?"<>|,]+/g, "")
    .replace(/\s+/g, "-")
  return safe || "customer"
}

/** `money-{kind}-{고객명}-{dateKey}.csv`. dateKey는 호출부가 "YYYY-MM-DD" 형태로 넘긴다. */
export function moneyCsvFileName(kind: MoneyCsvKind, customerName: string, dateKey: string): string {
  return `money-${kind}-${slugifyForFileName(customerName)}-${dateKey}.csv`
}
