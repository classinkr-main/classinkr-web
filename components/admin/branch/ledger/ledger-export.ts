// 매출 장부 출력(라운드 5 B1·B2) — 화면의 표를 CSV·TSV 행으로 조립하는 순수 함수.
//
// 장부는 엑셀 붙여넣기(입력)는 있었지만 꺼내는 길(출력)이 없었다. 드래그 복사는 "123만" 같은 축약 문자열만
// 나오고 단위·기준 시각이 빠졌다. 여기서는 원 단위(¥) 정수 그대로, 머리글과 기준(보기·단위·시각)을 붙여 낸다.
// 텍스트 직렬화(이스케이프·수식 주입 방지)는 lib/export/delimited.ts, 내려받기·클립보드는 lib/export/browser-download.ts.

import type { DelimitedCell } from "@/lib/export/delimited"

import type { LedgerRevenueRow, RevMonthlyBucket } from "./shared"

export interface RevMatrixCsvOptions {
  months: readonly string[]
  monthLabel: (month: string) => string
  /** 행·월 → 확도 분해(워크벤치 rowMonthBucket — 매트릭스 셀과 같은 산식). */
  bucketOf: (row: LedgerRevenueRow, month: string) => RevMonthlyBucket
  productLabel: (row: LedgerRevenueRow) => string
}

function round(value: number): number {
  return Math.round(Number.isFinite(value) ? value : 0)
}

/**
 * REV 매트릭스 "현재 보기" → CSV 행(머리글 포함). 필터·정렬이 반영된 전체 행(페이지 무관) × FY 12개월 월 합계 +
 * 연간 합계와 확도 분해(확정·고확도·예정). 미적용 초안은 넣지 않는다 — 장부에 반영된 값만(매트릭스 합계 행과 같은 기준).
 */
export function buildRevMatrixCsvRows(rows: readonly LedgerRevenueRow[], options: RevMatrixCsvOptions): DelimitedCell[][] {
  const header: DelimitedCell[] = [
    "시트 행",
    "고객",
    "담당",
    "팀",
    "지역",
    "상태",
    "유형",
    "상품",
    "원천",
    ...options.months.map((month) => `${options.monthLabel(month)}(¥)`),
    "연간 합계(¥)",
    "연간 확정(¥)",
    "연간 고확도(¥)",
    "연간 예정(¥)",
  ]
  const body = rows.map((row): DelimitedCell[] => {
    let total = 0
    let confirmed = 0
    let high = 0
    let open = 0
    const monthCells = options.months.map((month) => {
      const bucket = options.bucketOf(row, month)
      total += bucket.total
      confirmed += bucket.confirmed
      high += bucket.high
      open += bucket.open
      return bucket.total > 0 ? round(bucket.total) : null
    })
    return [
      row.sheetRow ?? null,
      row.customer,
      row.manager,
      row.team,
      row.region,
      row.status,
      row.dealType,
      options.productLabel(row),
      row.ledgerOrigin === "draft" ? "장부 입력" : "시트",
      ...monthCells,
      round(total),
      round(confirmed),
      round(high),
      round(open),
    ]
  })
  return [header, ...body]
}

/** 표 → TSV 머리 블록: 첫 줄에 "카드 · 단위 · 기준" 설명, 빈 줄 없이 곧바로 표. 스프레드시트에 그대로 붙는다. */
export function withCaptionRow(caption: string, table: DelimitedCell[][]): DelimitedCell[][] {
  return [[caption], ...table]
}
