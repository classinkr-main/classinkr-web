export type RevenueSheetLinkStatus = "candidate" | "confirmed" | "rejected" | "stale" | null

export interface AdminCrmRevenueSheetRow {
  id: string
  sheetRow: number
  sourceRecordKey: string
  customerName: string
  branchContact: string | null
  team: string | null
  manager: string | null
  dealType: string | null
  status: string | null
  firstPayment: string | null
  productVersion: string | null
  region: string | null
  importance: string | null
  note: string | null
  contractTarget: number
  scheduledAmount: number
  confirmedAmount: number
  highConfidenceAmount: number
  expectedAmount: number
  /** ADR-0062 확정 예정 — 빨간 글자인데 주차 시작일이 아직 안 온 금액. expectedAmount와 겹치지 않는다. */
  pendingAmount: number
  /** 가장 이른 예정 칸의 주차(1~5, 월 합계 칸 = 0)와 시작일(YYYY-MM-DD) — 예정이 없으면 null. */
  pendingNextWeek: number | null
  pendingNextStart: string | null
  pastUnconfirmedAmount: number
  monthCount: number
  linkId: string | null
  linkStatus: RevenueSheetLinkStatus
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  confidence: number | null
  placeholder: boolean
  syncedAt: string
  /** 장부에서 온 행(D1 — 장부 신규 행·원본과 담당이 다른 정정). sheetRow 는 원본 시트 행 번호 참고값(없으면 0)이고 syncedAt 은 반영 시각이다. */
  ledgerEntry?: boolean
}

export interface AdminCrmRevenueSheetSummary {
  rowCount: number
  activeRowCount: number
  linkedRowCount: number
  candidateRowCount: number
  unmatchedRowCount: number
  contractTargetAmount: number
  scheduledAmount: number
  confirmedAmount: number
  highConfidenceAmount: number
  expectedAmount: number
  pendingAmount: number
  pastUnconfirmedAmount: number
  linkedAmount: number
  unmatchedAmount: number
  latestSyncedAt: string | null
}

export interface AdminCrmRevenueSheetBreakdownRow {
  key: string
  label: string
  rowCount: number
  scheduledAmount: number
  confirmedAmount: number
  highConfidenceAmount: number
  expectedAmount: number
}

export interface AdminCrmRevenueSheetMonthPoint {
  month: string
  scheduledAmount: number
  confirmedAmount: number
  highConfidenceAmount: number
  expectedAmount: number
  pendingAmount: number
  pastUnconfirmedAmount: number
}

// M8 — rev-sheet "Compass 대조" 배지 소스. months는 monthly[].month와 동일한 "YYYY-MM" 키
// 전량(어드민 쪽에 데이터가 있는 달)이며, adminAmount는 그 달들의 scheduledAmount 합(월별 밴드에
// 실제로 표시되는 합계와 같은 기준). down이면 compassAmount/diffAmount는 신뢰할 수 없다(0 고정).
export interface AdminCrmRevenueSheetCompassCompare {
  down: boolean
  months: string[]
  adminAmount: number
  compassAmount: number
  diffAmount: number
}

// 장부 입력 건수(배지). 2026-09-10 에는 이 화면이 장부 입력(branch_sales_ledger_entries, active)을 볼 수 없어 "미반영 N건"을
// 경고했다. D1(2026-11-25)부터 이 화면 매출은 시트 행 + 장부 항목이라(lib/admin-crm-revenue-sheet.ts 장부 오버레이 —
// 장부 화면과 같은 규칙) 같은 수를 "장부 입력 N건 포함" 안내로 보인다. 세는 규칙(시트가 이미 읽은 시트 쓰기 정정 제외)은 그대로다.
export interface AdminCrmRevenueSheetManualLedgerGap {
  /** 장부 입력 건수(신규 + 정정) — 이 화면 매출에 포함돼 있다(D1). 시트가 이미 읽은 시트 쓰기 정정은 뺀다. */
  count: number
  /** 장부 입력 금액 합(시트 통화 ¥ — branch_sales_ledger_entries.currency 기본값 CNY). 정정 건의 대체값까지
      더한 값이라 "더해진 매출"로 읽으면 과대하다 — 화면은 newAmount를 쓴다(라운드 5 S-7). 호환을 위해 남긴다. */
  amount: number
  /** 가장 최근 적용 시각 — count가 0이면 null. */
  latestAppliedAt: string | null
  /** 장부에서 새로 만든 행(entry_type manual-new) — 이 화면에 장부 행으로 더해져 있다. */
  newCount: number
  /** 신규 건 금액 합(¥). */
  newAmount: number
  /** 시트 행의 그 달을 대체한 정정(entry_type manual-edit) — 이 화면은 정정 값을 보인다. */
  editCount: number
}

export interface AdminCrmRevenueSheetWorkspace {
  generatedAt: string
  currentMonth: string
  summary: AdminCrmRevenueSheetSummary
  rows: AdminCrmRevenueSheetRow[]
  teams: AdminCrmRevenueSheetBreakdownRow[]
  managers: AdminCrmRevenueSheetBreakdownRow[]
  statuses: AdminCrmRevenueSheetBreakdownRow[]
  monthly: AdminCrmRevenueSheetMonthPoint[]
  compass: AdminCrmRevenueSheetCompassCompare
  manualLedgerGap: AdminCrmRevenueSheetManualLedgerGap
  warnings: string[]
}
