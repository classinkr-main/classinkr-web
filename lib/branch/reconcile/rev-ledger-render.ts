// REV 시트 ↔ 매출 장부 대조 보고서 그리기 — Markdown(기본)·CSV(Excel 용, 0 아닌 칸만). 순수 모듈.
//
// 금액은 반올림하지 않는다(¥ 정수 + 소수 둘째 자리까지) — 화면의 만 단위 표기(formatMoney)로는 ¥0.5 차이를 볼 수 없다.
// 담당 필터(meta.manager)가 있으면 0절(시트 전체)은 개수만 보인다 — 다른 담당의 고객·행 번호가 새지 않게.

import type {
  ManagerMonthCell,
  ManagerNameNoteKind,
  MoneySplit,
  ReconcileMeasure,
  ReconcileReport,
  RowDiff,
  RowDiffCause,
  SheetColumnCheck,
} from "./rev-ledger-reconcile"

// ── 금액·라벨 ───────────────────────────────────────────────────────────────────────────

const MINUS = "−"

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/** ¥12,345 · −¥30(U+2212) · signed 면 +¥1,000. 소수는 둘째 자리까지(끝 0 은 지운다). */
export function formatYuanExact(n: number, opts?: { signed?: boolean }): string {
  if (!Number.isFinite(n)) return "¥?"
  let rounded = Math.round(n * 100) / 100
  if (Object.is(rounded, -0) || rounded === 0) rounded = 0
  const abs = Math.abs(rounded)
  const [intPart, fracPart = ""] = abs.toFixed(2).split(".")
  const frac = fracPart.replace(/0+$/, "")
  const body = `¥${groupThousands(intPart)}${frac ? `.${frac}` : ""}`
  if (rounded < 0) return `${MINUS}${body}`
  if (opts?.signed && rounded > 0) return `+${body}`
  return body
}

export const MEASURE_LABELS: Record<ReconcileMeasure, string> = {
  total: "합계",
  confirmed: "확정",
  highConfidence: "고확도",
  expected: "예정",
}

export const CAUSE_LABELS: Record<RowDiffCause, string> = {
  ledger_new: "장부 새 행",
  ledger_edit: "장부 정정",
  ledger_edit_unresolved: "정정 대상 못 찾음",
  sheet_changed: "동기화 뒤 시트 변경",
  sheet_only_row: "시트에만 있는 행",
  db_only_row: "장부 DB에만 있는 행",
  manager_changed: "담당자 바뀜",
  pending_rollover: "시간 경과",
  ambiguous_match: "행 짝 모호",
}

const NAME_NOTE_LABELS: Record<ManagerNameNoteKind, string> = {
  alias_applied: "별칭 적용",
  case_variant: "대소문자만 다른 표기 — 화면·서버 모두 한 사람으로 센다",
  unknown: "별칭 표에 없는 이름 — 오타인지 확인",
  whitespace: "앞뒤 공백이 있는 표기",
  empty: "담당자 빈 행·항목",
}

const LIST_LIMIT = 20

function monthLabel(month: string): string {
  return `${Number(month.slice(5, 7))}월`
}

function monthsLabel(months: readonly string[], fiscalYear: number): string {
  if (months.length === 12) return `FY${String(fiscalYear).slice(2)}-${String(fiscalYear + 1).slice(2)} 열두 달`
  return months.join(", ")
}

function fyLabel(fiscalYear: number): string {
  return `FY${String(fiscalYear).slice(2)}-${String(fiscalYear + 1).slice(2)}`
}

function kstLabel(iso: string | null | undefined): string {
  if (!iso) return "없음"
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return iso
  const shifted = new Date(at + 9 * 60 * 60 * 1000).toISOString()
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 16)} KST`
}

function shortRun(id: string | null): string {
  if (!id) return "—"
  return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id
}

/** Markdown 표 칸 — '|'·줄바꿈이 표를 깨지 않게. */
function md(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|")
}

function signed(n: number): string {
  return formatYuanExact(n, { signed: true })
}

function splitText(split: MoneySplit | null): string {
  if (!split) return "—"
  return `${formatYuanExact(split.confirmed)} / ${formatYuanExact(split.highConfidence)} / ${formatYuanExact(split.expected)}`
}

function moreLine(total: number, shown: number): string {
  return total > shown ? ` 외 ${total - shown}건` : ""
}

export function reconcileStatusLine(report: ReconcileReport): string {
  const { meta } = report
  switch (report.status) {
    case "same":
      return "같음 — 차이 없음"
    case "explained":
      return `차이 있음(설명됨) — 담당자 ${meta.managersTotal}명 중 ${meta.managersWithDiff}명 · 칸 ${meta.diffCells}개 · 잠금을 막는 차이 없음`
    case "blocked":
      return `막음 — ${meta.blockReasons.join(" · ")}`
    case "incomplete":
      return `불완전 — ${meta.incompleteReasons.join(" · ")}`
  }
}

// ── Markdown ────────────────────────────────────────────────────────────────────────────

function sheetColumnLabel(column: SheetColumnCheck): string {
  return column.kind === "month" ? `${monthLabel(column.month)} (${column.a1})` : `${monthLabel(column.month)} w${column.week} (${column.a1})`
}

function sheetColumnCause(column: SheetColumnCheck, tolerance: number): string {
  if (column.sheetSum == null) return column.unparsed > 0 ? `1행 합계 칸 없음 · 못 읽은 칸 ${column.unparsed}` : "1행 합계 칸 없음"
  const parts: string[] = []
  if (column.orphanSum !== 0) parts.push(`고객명 빈 행 ${formatYuanExact(column.orphanSum)}`)
  if (column.textSum !== 0) parts.push(`글자 금액 ${formatYuanExact(column.textSum)}(SUM 이 안 더함)`)
  if (column.weekFallbackSum !== 0) parts.push(`월 칸 빈 행의 주 합 ${formatYuanExact(column.weekFallbackSum)}`)
  if (column.residual != null && Math.abs(column.residual) >= tolerance) parts.push(`**설명 안 됨 ${signed(column.residual)}**`)
  if (column.unparsed > 0) parts.push(`**못 읽은 칸 ${column.unparsed}**`)
  return parts.length > 0 ? parts.join(" · ") : "같음"
}

function renderSheetSection(report: ReconcileReport): string[] {
  const { sheetChecks: checks, meta } = report
  const lines = ["## 0. 시트 자체 점검 (시트 전체)"]
  if (meta.manager) {
    lines.push(
      `- 담당자 보기라 건별 내용은 뺐다 — 설명 안 된 차이 ${checks.unexplainedColumns}열 · 고객명 빈 행 ${checks.orphanRows.length}개 · 숫자로 못 읽은 칸 ${checks.unparsedCells.length}개 · 글자로 적힌 금액 ${checks.textAmountCells.length}칸 · 월 칸 ≠ 주 칸 합 ${checks.monthWeekMismatch.length}건`,
    )
    lines.push(`- 머리 ${checks.headerProblem ? `못 알아봄 — ${checks.headerProblem}` : "정상"} · 범위 ${checks.truncatedLikely ? "상한에 닿음(잘렸을 수 있음)" : "잘림 없음"}`)
    return lines
  }
  // 1행 SUM 도 앱도 ¥0 이고 따로 볼 것도 없는 달은 표에서 뺀다(빈 달이 표를 덮지 않게).
  const isEmptyColumn = (column: SheetColumnCheck) =>
    column.sheetSum === 0 && column.appSum === 0 && column.orphanSum === 0 && column.textSum === 0 && column.weekFallbackSum === 0 && column.unparsed === 0
  const shown = checks.columns.filter((column) => !isEmptyColumn(column))
  const hidden = checks.columns.length - shown.length
  lines.push("| 열 | 시트 1행 SUM | 앱이 읽은 합 | 차이 | 원인 |", "|---|---:|---:|---:|---|")
  for (const column of shown) {
    lines.push(
      `| ${sheetColumnLabel(column)} | ${column.sheetSum == null ? "—" : formatYuanExact(column.sheetSum)} | ${formatYuanExact(column.appSum)} | ${column.delta == null ? "—" : signed(column.delta)} | ${sheetColumnCause(column, meta.tolerance)} |`,
    )
  }
  if (hidden > 0) lines.push(`- 금액 없는 열 ${hidden}개(1행 SUM·앱 모두 ¥0)는 표에서 뺐다`)
  const orphans = checks.orphanRows
  lines.push(
    orphans.length === 0
      ? "- 고객명 빈 행에 금액: 0"
      : `- 고객명 빈 행에 금액: ${orphans.length}행 — ${orphans
          .slice(0, LIST_LIMIT)
          .map((row) => `시트 ${row.sheetRow}행 ${row.months.map(monthLabel).join("·")} ${formatYuanExact(row.amount)}`)
          .join(" · ")}${moreLine(orphans.length, Math.min(orphans.length, LIST_LIMIT))} (앱은 이 행을 읽지 않는다 — 잠그기 전에 고객명을 채운다)`,
  )
  const unparsed = checks.unparsedCells
  lines.push(
    unparsed.length === 0
      ? "- 숫자로 못 읽은 칸: 0"
      : `- **숫자로 못 읽은 칸: ${unparsed.length}** — ${unparsed
          .slice(0, LIST_LIMIT)
          .map((cell) => `${cell.a1} '${md(cell.text)}'`)
          .join(" · ")}${moreLine(unparsed.length, Math.min(unparsed.length, LIST_LIMIT))} (시트 SUM 도 앱도 이 금액을 세지 않는다)`,
  )
  const texts = checks.textAmountCells
  if (texts.length > 0) {
    lines.push(
      `- 글자로 적힌 금액: ${texts.length}칸 — ${texts
        .slice(0, LIST_LIMIT)
        .map((cell) => `${cell.a1} '${md(cell.text)}' = ${formatYuanExact(cell.amount)}`)
        .join(" · ")}${moreLine(texts.length, Math.min(texts.length, LIST_LIMIT))} (앱은 읽고 시트 SUM 은 더하지 않는다)`,
    )
  }
  const mismatch = checks.monthWeekMismatch
  lines.push(
    mismatch.length === 0
      ? "- 월 칸 ≠ 주 칸 합: 0"
      : `- 월 칸 ≠ 주 칸 합: ${mismatch.length}건 — ${mismatch
          .slice(0, LIST_LIMIT)
          .map((item) => `${md(item.customer)}(${item.sheetRow}행) ${monthLabel(item.month)} 월 ${formatYuanExact(item.monthValue)} · 주 합 ${formatYuanExact(item.weekSum)}`)
          .join(" · ")}${moreLine(mismatch.length, Math.min(mismatch.length, LIST_LIMIT))} (앱은 월 칸을 합계로, 확정·고확도는 그 안으로 자른다)`,
  )
  const sum = checks.sumColumn
  if (!sum) lines.push("- Sum 열: 머리에 없음")
  else if (sum.delta == null) lines.push(`- Sum 열(${sum.a1}) 1행 = 월 열 1행 합: 판정 못 함(1행 합계 칸 없음)`)
  else if (Math.abs(sum.delta) < meta.tolerance) lines.push(`- Sum 열(${sum.a1}) 1행 = 월 열 1행 합: 같음`)
  else lines.push(`- Sum 열(${sum.a1}) 1행 ${formatYuanExact(sum.sheetValue ?? 0)} ≠ 월 열 1행 합 ${formatYuanExact(sum.monthsSum ?? 0)}(${signed(sum.delta)})`)
  lines.push(`- 범위: 읽은 ${checks.rowsRead}행 · 고객 행 ${checks.customerRows} — ${checks.truncatedLikely ? "**상한에 닿음(아래 행이 잘렸을 수 있음)**" : "잘림 없음"}`)
  lines.push(`- 머리: ${checks.headerProblem ? `**못 알아봄 — ${checks.headerProblem}**` : `정상(월 블록 ${checks.monthBlocks}개)`}`)
  if (checks.missingSumCells > 0) lines.push(`- 1행 합계 칸이 빈 열 ${checks.missingSumCells}개 — 그 열은 판정하지 않았다`)
  return lines
}

function renderSummarySection(report: ReconcileReport): string[] {
  const rows = report.managerSummary
  const hasNegative = rows.some((row) => row.negativeMonths !== 0)
  const lines = ["## 1. 담당자 요약 (고른 달 합)"]
  if (rows.length === 0) {
    lines.push("고른 범위에 금액이 없다.")
    return lines
  }
  lines.push(
    `| 담당자 | 시트 | 장부 | 차이 | 장부 입력 | 동기화 뒤 시트 변경 | 시간 경과 | 차이 칸 |${hasNegative ? " 음수 월 |" : ""}`,
    `|---|---:|---:|---:|---:|---:|---:|---:|${hasNegative ? "---:|" : ""}`,
  )
  const total = { sheet: 0, ledger: 0, delta: 0, deltaEntries: 0, deltaSync: 0, deltaTime: 0, diffCells: 0, negativeMonths: 0 }
  for (const row of rows) {
    total.sheet += row.sheet
    total.ledger += row.ledger
    total.delta += row.delta
    total.deltaEntries += row.deltaEntries
    total.deltaSync += row.deltaSync
    total.deltaTime += row.deltaTime
    total.diffCells += row.diffCells
    total.negativeMonths += row.negativeMonths
    lines.push(
      `| ${md(row.manager)} | ${formatYuanExact(row.sheet)} | ${formatYuanExact(row.ledger)} | ${signed(row.delta)} | ${signed(row.deltaEntries)} | ${signed(row.deltaSync)} | ${signed(row.deltaTime)} | ${row.diffCells} |${hasNegative ? ` ${formatYuanExact(row.negativeMonths)} |` : ""}`,
    )
  }
  if (rows.length > 1) {
    lines.push(
      `| **전체** | ${formatYuanExact(total.sheet)} | ${formatYuanExact(total.ledger)} | ${signed(total.delta)} | ${signed(total.deltaEntries)} | ${signed(total.deltaSync)} | ${signed(total.deltaTime)} | ${total.diffCells} |${hasNegative ? ` ${formatYuanExact(total.negativeMonths)} |` : ""}`,
    )
  }
  lines.push(
    `합계(확도와 무관) 기준. 시간 경과는 합계를 바꾸지 않고 확도만 옮긴다 — 읽는 시점 판정이 맞으면 0이다.${hasNegative ? " 음수 월은 시트의 환불 달 합이고 합계에 들어 있다." : ""}`,
  )
  return lines
}

function cellHasDiff(cell: ManagerMonthCell, tolerance: number): boolean {
  return [cell.delta, cell.deltaEntries, cell.deltaSync, cell.deltaTime].some((value) => Math.abs(value) >= tolerance)
}

function renderCellSection(report: ReconcileReport): string[] {
  const lines = ["## 2. 담당자 × 월 × 확도 — 차이 있는 칸만"]
  const cells = report.totals.filter((cell) => cellHasDiff(cell, report.meta.tolerance))
  if (cells.length === 0) {
    lines.push("차이 있는 칸 없음.")
    return lines
  }
  lines.push("| 담당자 | 월 | 확도 | 시트 | 장부 | 차이 | 장부 입력 | 동기화 뒤 시트 변경 | 시간 경과 |", "|---|---|---|---:|---:|---:|---:|---:|---:|")
  for (const cell of cells) {
    lines.push(
      `| ${md(cell.manager)} | ${cell.month} | ${MEASURE_LABELS[cell.measure]} | ${formatYuanExact(cell.sheet)} | ${formatYuanExact(cell.ledger)} | ${signed(cell.delta)} | ${signed(cell.deltaEntries)} | ${signed(cell.deltaSync)} | ${signed(cell.deltaTime)} |`,
    )
  }
  return lines
}

function renderRowSection(report: ReconcileReport): string[] {
  const lines = ["## 3. 건별 차이"]
  if (report.rowDiffs.length === 0) {
    lines.push("건별 차이 없음.")
    return lines
  }
  lines.push(
    "장부 칸은 원인별로 다르다: 장부 새 행·정정 = 장부 항목 · 동기화 뒤 시트 변경·DB에만 있는 행 = 장부 DB · 시간 경과 = 데이터 날짜로 읽은 시트.",
    "",
    "| 담당자 | 고객 | 시트 행 | 월 | 시트 확정 / 고확도 / 예정 | 장부 확정 / 고확도 / 예정 | 원인 | 근거 |",
    "|---|---|---:|---|---:|---:|---|---|",
  )
  for (const diff of report.rowDiffs) {
    const sheetRow = diff.sheetRow != null && diff.sheetRow > 0 ? String(diff.sheetRow) : "새"
    lines.push(
      `| ${md(diff.manager)} | ${md(diff.customer)} | ${sheetRow} | ${diff.month ?? "—"} | ${splitText(diff.sheet)} | ${splitText(diff.ledger)} | ${CAUSE_LABELS[diff.cause]} | ${md(diff.detail)} |`,
    )
  }
  return lines
}

function byManagerText(items: ReadonlyArray<{ manager: string; value: number }>): string {
  return items.map((item) => `${item.manager} ${formatYuanExact(item.value)}`).join(" · ")
}

function renderChecksSection(report: ReconcileReport): string[] {
  const { checks } = report
  const lines = ["## 4. 잠금 전에 볼 것 (합계 차이와 별개)"]

  const doubles = checks.doubleEntrySuspects
  lines.push(
    doubles.length === 0
      ? "- 이중 입력 의심 0건"
      : `- **이중 입력 의심 ${doubles.length}건** — ${doubles
          .slice(0, LIST_LIMIT)
          .map((item) => `${md(item.customer)} ${item.month} 장부 새 행 ${formatYuanExact(item.amount)} · 같은 고객 시트 ${item.sheetRows.join("·")}행에도 ${formatYuanExact(item.sheetAmount)}${item.exactMatch ? "(금액이 같다)" : ""}`)
          .join(" / ")}${moreLine(doubles.length, Math.min(doubles.length, LIST_LIMIT))}. 둘 다 맞으면 그대로, 한쪽이 중복이면 장부 항목을 되돌린다.`,
  )
  const unresolved = checks.unresolvedCorrections
  lines.push(
    unresolved.length === 0
      ? "- 정정 대상 못 찾음 0건"
      : `- **정정 대상 못 찾음 ${unresolved.length}건** — ${unresolved
          .slice(0, LIST_LIMIT)
          .map((item) => `${md(item.customer)} ${item.month} ${formatYuanExact(item.amount)}(${item.manager})`)
          .join(" · ")}${moreLine(unresolved.length, Math.min(unresolved.length, LIST_LIMIT))} — 원본 시트 행과 정정이 둘 다 더해진다.`,
  )
  if (checks.supersededCorrections.length > 0) {
    lines.push(
      `- 같은 칸 정정 겹침 ${checks.supersededCorrections.length}건 — 늦게 반영한 것만 센다: ${checks.supersededCorrections
        .slice(0, LIST_LIMIT)
        .map((item) => `${md(item.customer)} ${item.month} ${formatYuanExact(item.amount)}`)
        .join(" · ")}`,
    )
  }
  if (checks.driftCorrections.length > 0) {
    lines.push(
      `- 정정 뒤 시트가 바뀐 정정 ${checks.driftCorrections.length}건 — 장부 정정 값이 이긴다: ${checks.driftCorrections
        .slice(0, LIST_LIMIT)
        .map((item) => `${md(item.customer)} ${item.month} 정정 때 시트 ${formatYuanExact(item.baselineTotal)} → 지금 ${formatYuanExact(item.currentTotal)} · 정정 ${formatYuanExact(item.correctionAmount)}`)
        .join(" / ")}`,
    )
  }
  const nonCny = checks.nonCnyEntries
  lines.push(
    nonCny.length === 0
      ? "- CNY 아닌 항목 0건"
      : `- **CNY 아닌 항목 ${nonCny.length}건** — 금액은 그대로 더해졌다: ${nonCny
          .slice(0, LIST_LIMIT)
          .map((item) => `${md(item.customer)} ${item.month} ${item.currency} ${item.amount}`)
          .join(" · ")}`,
  )
  const empty = checks.emptyManagerEntries
  lines.push(
    empty.length === 0
      ? "- 담당자 빈 장부 항목 0건"
      : `- **담당자 빈 장부 항목 ${empty.length}건(${formatYuanExact(empty.reduce((sum, item) => sum + item.amount, 0))})** — '내 담당' 보기에서 안 보인다: ${empty
          .slice(0, LIST_LIMIT)
          .map((item) => `${md(item.customer)} ${item.month} ${formatYuanExact(item.amount)}`)
          .join(" · ")}`,
  )
  const open = checks.openDrafts
  const openCount = open.reduce((sum, item) => sum + item.count, 0)
  lines.push(
    openCount === 0
      ? "- 열린 초안 0건"
      : `- 열린 초안 ${openCount}건(${open.map((item) => `${item.manager} ${item.count}`).join(" · ")}) — 적용 전이라 합계에 없다`,
  )
  const stuck = checks.stuckAfterLock
  const stuckExpected = stuck.byManager.reduce((sum, item) => sum + item.expected, 0)
  const stuckHigh = stuck.byManager.reduce((sum, item) => sum + item.highConfidence, 0)
  if (stuck.rows.length === 0) {
    lines.push("- 잠금 뒤 저절로 확정되지 않는 금액 0")
  } else {
    lines.push(
      `- **잠금 뒤 저절로 확정되지 않는 금액: 예정 ${formatYuanExact(stuckExpected)} · 고확도 ${formatYuanExact(stuckHigh)}** (${stuck.byManager
        .map((item) => `${item.manager} 예정 ${formatYuanExact(item.expected)} · 고확도 ${formatYuanExact(item.highConfidence)}`)
        .join(" / ")}) — 시트가 고정되면 글자색을 바꿀 수 없다. 확정이 되려면 장부에서 확정으로 다시 입력한다.`,
    )
    for (const row of stuck.rows.slice(0, LIST_LIMIT)) {
      lines.push(
        `  - ${md(row.manager)} · ${md(row.customer)}${row.sheetRow ? `(${row.sheetRow}행)` : "(장부 행)"} · ${row.month} · 예정 ${formatYuanExact(row.expected)} · 고확도 ${formatYuanExact(row.highConfidence)}`,
      )
    }
    if (stuck.rows.length > LIST_LIMIT) lines.push(`  - 외 ${stuck.rows.length - LIST_LIMIT}건(CSV 에 전부 있다)`)
  }
  const auto = checks.autoPromote
  if (auto.cells.length > 0) {
    const redCells = auto.cells.filter((cell) => cell.reason === "red_week").length
    const noColorCells = auto.cells.length - redCells
    lines.push(
      `- 시간이 지나면 저절로 확정: ${byManagerText(auto.byManager.map((item) => ({ manager: item.manager, value: item.amount })))} — 빨간 예정 칸 ${redCells}칸(그 주 시작일에) · 색 없는 행 ${noColorCells}칸(그 달이 끝나면). 동기화가 멈춰도 읽는 날 기준으로 바뀐다.`,
    )
  }
  const parity = checks.serverParity
  lines.push(
    parity.ok
      ? "- 화면 식 ↔ 서버 식: 같음"
      : `- **화면 식 ↔ 서버 식: 다른 칸 ${parity.cells.length}개** — ${parity.cells
          .slice(0, LIST_LIMIT)
          .map((cell) => `${md(cell.manager)} ${cell.month} ${MEASURE_LABELS[cell.measure]} 화면 ${formatYuanExact(cell.screen)} · 서버 ${formatYuanExact(cell.server)}`)
          .join(" / ")} — 잠금 뒤 타일과 장부 표가 어긋난다(개발 확인)`,
  )
  if (checks.absorbedDraftIds.length > 0 || checks.fallbackDraftIds.length > 0) {
    lines.push(`- 시트 쓰기로 흡수된 초안 ${checks.absorbedDraftIds.length}건 · 항목 없는 적용 초안 ${checks.fallbackDraftIds.length}건`)
  }
  return lines
}

function quoteRaw(raw: string): string {
  if (!raw) return "빈 칸"
  return raw !== raw.trim() ? `'${raw}'` : raw
}

function renderNamesSection(report: ReconcileReport): string[] {
  const lines = ["## 5. 담당자 이름"]
  if (report.managerNames.length === 0) {
    lines.push("담당자 표기 없음.")
    return lines
  }
  lines.push("| 정규 이름 | 시트 표기(행) | 장부 항목 표기(건) | 메모 |", "|---|---|---|---|")
  for (const note of report.managerNames) {
    const sheet = note.sheetSpellings.map((item) => `${md(quoteRaw(item.raw))}(${item.rows})`).join(" · ") || "—"
    const entries = note.entrySpellings.map((item) => `${md(quoteRaw(item.raw))}(${item.entries})`).join(" · ") || "—"
    const memo = note.notes
      .map((kind) => {
        if (kind !== "alias_applied") return NAME_NOTE_LABELS[kind]
        const aliases = [...note.sheetSpellings.map((item) => item.raw), ...note.entrySpellings.map((item) => item.raw)]
          .map((raw) => raw.trim())
          .filter((raw) => raw && raw !== note.label)
        const unique = [...new Set(aliases)]
        return unique.length > 0 ? `${NAME_NOTE_LABELS[kind]}: ${unique.join(", ")} → ${note.label}` : NAME_NOTE_LABELS[kind]
      })
      .join(" · ")
    lines.push(`| ${md(note.label)} | ${sheet} | ${entries} | ${md(memo) || "—"} |`)
  }
  return lines
}

export function renderReconcileMarkdown(report: ReconcileReport): string {
  const { meta } = report
  const db =
    meta.db.kind === "import"
      ? `액티브 임포트(화면과 같은 원천) · run ${shortRun(meta.db.runId)} · 캡처 ${kstLabel(meta.db.startedAt)}`
      : "시트 미러(화면과 같은 원천 — 액티브 임포트 없음)"
  const head = [
    "# REV 시트 ↔ 매출 장부 대조",
    `- 실행 ${meta.ranAtKst} · ${fyLabel(meta.fiscalYear)} · 월 ${monthsLabel(meta.months, meta.fiscalYear)} · 담당자 ${meta.manager ? md(meta.manager) : "전체"}`,
    `- 시트 ${meta.sheet.range} · 읽은 행 ${meta.sheet.rowsRead} · 고객 행 ${meta.sheet.customerRows} · 읽은 시각 ${kstLabel(meta.sheet.readAt)}`,
    `- 장부 DB ${db} · 행 ${meta.db.rows} · 데이터 날짜 ${meta.dataDate}(KST) · 마지막 REV 동기화 ${kstLabel(meta.db.lastRevSyncStartedAt)}`,
    `- 장부 항목 적용 ${meta.ledger.activeEntries} · 상쇄 ${meta.ledger.reversedEntries}(제외) · 시트 쓰기로 흡수 ${meta.ledger.absorbed} · 항목 없는 적용 초안 ${meta.ledger.fallbackDrafts} · 겹친 정정 ${meta.ledger.superseded}(늦은 것만 셈) · 열린 초안 ${meta.ledger.openDrafts}(합계에 안 들어감)`,
    `- 규칙 확도 = 앱 규칙(rev-confirmed.ts: 빨간 글자 확정 · 파란 글자 고확도 · 빨간 글자라도 그 주 시작 전은 예정 · 색 없는 행은 지난달까지 확정) · 읽는 날 ${meta.asOf}(KST) · 음수(환불) 달 포함(시트 1행 SUM과 같음) · 차이 허용 ${formatYuanExact(meta.tolerance)}`,
    "- 차이 = 장부 입력(장부 − 장부 DB) + 동기화 뒤 시트 변경(장부 DB − 데이터 날짜로 읽은 시트) + 시간 경과(데이터 날짜로 읽은 시트 − 오늘 읽은 시트)",
    `- 결과 **${reconcileStatusLine(report)}**`,
  ]
  const sections = [
    head,
    renderSheetSection(report),
    renderSummarySection(report),
    renderCellSection(report),
    renderRowSection(report),
    renderChecksSection(report),
    renderNamesSection(report),
  ]
  return `${sections.map((lines) => lines.join("\n")).join("\n\n")}\n`
}

// ── CSV ─────────────────────────────────────────────────────────────────────────────────

export const RECONCILE_CSV_HEADER = [
  "kind",
  "manager",
  "month",
  "measure",
  "sheet",
  "ledger",
  "delta",
  "delta_entries",
  "delta_sync",
  "delta_time",
  "customer",
  "sheet_row",
  "row_id",
  "cause",
  "detail",
] as const

type CsvValue = string | number | null | undefined

function csvNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ""
  const rounded = Math.round(value * 100) / 100
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

function csvText(value: string | null | undefined): string {
  if (value == null) return ""
  // 수식으로 읽히지 않게(=·+·-·@ 로 시작하는 글자) 앞에 ' 를 붙인다.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function csvLine(values: Record<(typeof RECONCILE_CSV_HEADER)[number], CsvValue>): string {
  return RECONCILE_CSV_HEADER.map((key) => {
    const value = values[key]
    if (typeof value === "number") return csvNumber(value)
    return csvText(value ?? null)
  }).join(",")
}

function emptyRow(): Record<(typeof RECONCILE_CSV_HEADER)[number], CsvValue> {
  return Object.fromEntries(RECONCILE_CSV_HEADER.map((key) => [key, null])) as Record<(typeof RECONCILE_CSV_HEADER)[number], CsvValue>
}

const ROW_DELTA_COLUMN: Record<RowDiffCause, "delta_entries" | "delta_sync" | "delta_time" | null> = {
  ledger_new: "delta_entries",
  ledger_edit: "delta_entries",
  ledger_edit_unresolved: "delta_entries",
  sheet_changed: "delta_sync",
  sheet_only_row: "delta_sync",
  db_only_row: "delta_sync",
  manager_changed: null,
  pending_rollover: "delta_time",
  ambiguous_match: null,
}

function rowDiffLines(diff: RowDiff): string[] {
  const base = {
    ...emptyRow(),
    kind: "row",
    manager: diff.manager,
    month: diff.month,
    customer: diff.customer,
    sheet_row: diff.sheetRow != null && diff.sheetRow > 0 ? String(diff.sheetRow) : null,
    row_id: diff.rowId,
    cause: diff.cause,
    detail: diff.detail,
  }
  if (!diff.sheet && !diff.ledger) return [csvLine(base)]
  const lines: string[] = []
  const measures: ReconcileMeasure[] = ["total", "confirmed", "highConfidence", "expected"]
  for (const measure of measures) {
    const sheet = diff.sheet ? diff.sheet[measure] : null
    const ledger = diff.ledger ? diff.ledger[measure] : null
    const delta = (ledger ?? 0) - (sheet ?? 0)
    if (Math.round(delta * 100) === 0) continue
    const column = ROW_DELTA_COLUMN[diff.cause]
    lines.push(csvLine({ ...base, measure, sheet, ledger, delta, ...(column ? { [column]: delta } : {}) }))
  }
  return lines
}

function checkLine(values: Partial<Record<(typeof RECONCILE_CSV_HEADER)[number], CsvValue>>): string {
  return csvLine({ ...emptyRow(), kind: "check", ...values })
}

/** Excel 용 CSV — UTF-8 BOM, 숫자는 ¥·천 단위 쉼표 없이, 0 아닌 칸만. */
export function renderReconcileCsv(report: ReconcileReport): string {
  const lines: string[] = [RECONCILE_CSV_HEADER.join(",")]
  for (const cell of report.totals) {
    lines.push(
      csvLine({
        ...emptyRow(),
        kind: "cell",
        manager: cell.manager,
        month: cell.month,
        measure: cell.measure,
        sheet: cell.sheet,
        ledger: cell.ledger,
        delta: cell.delta,
        delta_entries: cell.deltaEntries,
        delta_sync: cell.deltaSync,
        delta_time: cell.deltaTime,
      }),
    )
  }
  for (const diff of report.rowDiffs) lines.push(...rowDiffLines(diff))

  const { sheetChecks: sheet, checks, meta } = report
  if (meta.manager) {
    lines.push(
      checkLine({
        cause: "sheet_self_check",
        detail: `설명 안 된 차이 ${sheet.unexplainedColumns}열 · 고객명 빈 행 ${sheet.orphanRows.length} · 못 읽은 칸 ${sheet.unparsedCells.length} · 글자 금액 ${sheet.textAmountCells.length} · 월≠주 ${sheet.monthWeekMismatch.length}`,
      }),
    )
  } else {
    for (const column of sheet.columns) {
      const residual = column.residual ?? 0
      if (column.delta == null && column.unparsed === 0) continue
      if ((column.delta ?? 0) === 0 && column.unparsed === 0 && residual === 0) continue
      lines.push(
        checkLine({
          month: column.month,
          measure: "total",
          sheet: column.sheetSum,
          ledger: column.appSum,
          delta: column.delta,
          cause: Math.abs(residual) >= meta.tolerance || column.unparsed > 0 ? "sheet_column_unexplained" : "sheet_column_explained",
          detail: `${sheetColumnLabel(column)}: ${sheetColumnCause(column, meta.tolerance).replace(/\*\*/g, "")}`,
        }),
      )
    }
    for (const row of sheet.orphanRows) {
      lines.push(checkLine({ month: row.months.join(" "), sheet: row.amount, sheet_row: String(row.sheetRow), cause: "orphan_amount_row", detail: "고객명 빈 행의 금액 — 앱은 읽지 않는다" }))
    }
    for (const cell of sheet.unparsedCells) {
      lines.push(checkLine({ customer: cell.customer, sheet_row: String(cell.sheetRow), cause: "unparsed_cell", detail: `${cell.a1}: ${cell.text}` }))
    }
    for (const cell of sheet.textAmountCells) {
      lines.push(checkLine({ ledger: cell.amount, sheet_row: String(cell.sheetRow), cause: "text_amount_cell", detail: `${cell.a1}: ${cell.text}` }))
    }
    for (const item of sheet.monthWeekMismatch) {
      lines.push(checkLine({ month: item.month, sheet: item.monthValue, ledger: item.weekSum, customer: item.customer, sheet_row: String(item.sheetRow), cause: "month_week_mismatch", detail: "월 칸 ≠ 주 칸 합" }))
    }
  }
  for (const item of checks.doubleEntrySuspects) {
    lines.push(checkLine({ manager: item.manager, month: item.month, sheet: item.sheetAmount, ledger: item.amount, customer: item.customer, sheet_row: item.sheetRows.join(" "), cause: "double_entry", detail: item.exactMatch ? "금액이 같다" : "같은 고객·달" }))
  }
  for (const item of checks.unresolvedCorrections) {
    lines.push(checkLine({ manager: item.manager, month: item.month, ledger: item.amount, customer: item.customer, sheet_row: item.sheetRow ? String(item.sheetRow) : null, cause: "unresolved_correction", detail: item.entryId ?? item.draftId ?? "" }))
  }
  for (const item of checks.supersededCorrections) {
    lines.push(checkLine({ manager: item.manager, month: item.month, ledger: item.amount, customer: item.customer, cause: "superseded_correction", detail: `늦은 정정 ${item.winnerId}` }))
  }
  for (const item of checks.driftCorrections) {
    lines.push(checkLine({ manager: item.manager, month: item.month, sheet: item.currentTotal, ledger: item.correctionAmount, customer: item.customer, cause: "drift_correction", detail: `정정 때 시트 ${item.baselineTotal}` }))
  }
  for (const item of checks.nonCnyEntries) {
    lines.push(checkLine({ manager: item.manager, month: item.month, ledger: item.amount, customer: item.customer, cause: "non_cny_entry", detail: item.currency }))
  }
  for (const item of checks.emptyManagerEntries) {
    lines.push(checkLine({ month: item.month, ledger: item.amount, customer: item.customer, cause: "empty_manager_entry", detail: item.id }))
  }
  for (const item of checks.openDrafts) {
    lines.push(checkLine({ manager: item.manager, ledger: item.amount, cause: "open_drafts", detail: `${item.count}건` }))
  }
  for (const item of checks.stuckAfterLock.rows) {
    if (item.expected !== 0) {
      lines.push(checkLine({ manager: item.manager, month: item.month, measure: "expected", ledger: item.expected, customer: item.customer, sheet_row: item.sheetRow ? String(item.sheetRow) : null, cause: "stuck_after_lock", detail: item.origin === "ledger" ? "장부 예정 입력" : "시트" }))
    }
    if (item.highConfidence !== 0) {
      lines.push(checkLine({ manager: item.manager, month: item.month, measure: "highConfidence", ledger: item.highConfidence, customer: item.customer, sheet_row: item.sheetRow ? String(item.sheetRow) : null, cause: "stuck_after_lock", detail: item.origin === "ledger" ? "장부 고확도 입력" : "시트" }))
    }
  }
  for (const item of checks.autoPromote.cells) {
    lines.push(checkLine({ manager: item.manager, month: item.month, measure: "confirmed", ledger: item.amount, customer: item.customer, sheet_row: item.sheetRow ? String(item.sheetRow) : null, cause: "auto_promote", detail: `${item.reason === "red_week" ? "빨간 예정 칸" : "색 없는 행"} ${item.when}` }))
  }
  for (const cell of checks.serverParity.cells) {
    lines.push(checkLine({ manager: cell.manager, month: cell.month, measure: cell.measure, sheet: cell.screen, ledger: cell.server, delta: cell.server - cell.screen, cause: "server_parity", detail: "화면 식 ↔ 서버 식" }))
  }
  return `﻿${lines.join("\r\n")}\r\n`
}

/** --format=json — 보고서 객체 그대로. */
export function renderReconcileJson(report: ReconcileReport): string {
  return `${JSON.stringify(report, null, 2)}\n`
}
