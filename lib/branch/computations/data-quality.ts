import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { dealHasColorData } from "@/lib/branch/computations/rev-confirmed"
import type { DshOutput } from "@/lib/branch/parsers/dsh"
import type { KpiRow } from "@/lib/branch/parsers/kpi"
import type { SegRow } from "@/lib/branch/parsers/seg"
import { REV_RANGE } from "@/lib/branch/parsers/rev"
import { parseRangeLastRow } from "@/lib/branch/sync/range-truncation"
import type { HwInbound, HwOutbound, HwStock } from "@/lib/repositories/branch-hw"

export type Severity = "info" | "warn" | "error"
// sheetRow는 선택 필드다 — 이슈가 특정 REV 시트 행에 닻을 내릴 수 있을 때만(현재 DQ-15)
// 채운다. 소비자(IntegrityStrip)가 "장부에서 열기" 딥링크 노출 여부를 이 필드로 결정한다.
export interface DqIssue { id: string; severity: Severity; message: string; samples?: unknown[]; sheetRow?: number }

export const DATA_QUALITY_RULE_IDS = ["DQ-2", "DQ-3", "DQ-4", "DQ-7", "DQ-9", "DQ-10", "DQ-11", "DQ-13", "DQ-15"] as const
export const DATA_QUALITY_RULE_COUNT = DATA_QUALITY_RULE_IDS.length

// REV_RANGE 상한 사용률 경고 임계값. 90%부터 warning으로 승격해 상한을 늘릴 여유를 준다.
const REV_RANGE_USAGE_WARN_RATIO = 0.9

export interface DqInputs {
  deals: BranchRevDeal[]; dsh: DshOutput; kpi: KpiRow[]; seg: SegRow[]
  hwInbound: HwInbound[]; hwOutbound: HwOutbound[]; hwStock: HwStock[]
}

const HW_PRODUCT_PATTERNS = [/86[""]?\s*IFP/i, /75[""]?\s*IFP/i, /T1\s*카메라|카메라\s*T1/i, /S1\s*카메라|카메라\s*S1/i, /\bOPS\b/i]

export function runDataQuality(inp: DqInputs): DqIssue[] {
  const issues: DqIssue[] = []

  const ghost = inp.deals.filter((d) => d.first_payment && Object.values(d.monthly_payments).every((v) => !v))
  if (ghost.length) issues.push({ id: "DQ-2", severity: "warn", message: `firstPayment 있는데 월별 납부 0인 딜 ${ghost.length}건`, samples: ghost.slice(0, 5).map((d) => d.customer_name) })

  const seen = new Map<string, Set<string>>()
  for (const d of inp.deals) { const m = (d.manager ?? "").trim(); if (!m) continue; const k = m.toLowerCase(); if (!seen.has(k)) seen.set(k, new Set()); seen.get(k)!.add(m) }
  for (const [, variants] of seen) { if (variants.size > 1) issues.push({ id: "DQ-3", severity: "warn", message: "매니저 표기 불일치", samples: [...variants] }) }

  if (inp.deals.length > 0 && inp.deals.every((d) => Object.keys(d.monthly_payments).length === 0)) {
    issues.push({ id: "DQ-4", severity: "error", message: "REV 월 헤더가 정규화되지 않았을 가능성" })
  }

  const teams = new Set(inp.dsh.rows.filter((r) => r.level === "team").map((r) => r.team))
  for (const t of ["BD","MKT","CSM"]) if (!teams.has(t)) issues.push({ id: "DQ-7", severity: "error", message: `DSH 에 ${t} 팀 행 없음` })

  const allHw = [...inp.hwInbound, ...inp.hwOutbound]
  const unknown = allHw.filter((row) => !HW_PRODUCT_PATTERNS.some((p) => p.test(row.product))).map((r) => r.product)
  if (unknown.length) issues.push({ id: "DQ-9", severity: "warn", message: "HW 입출고 제품명 카탈로그 불일치", samples: [...new Set(unknown)].slice(0, 8) })

  // 빨강(확정)·파랑(임박) 어느 색 데이터도 없으면 formatRuns 추출 실패를 의심한다.
  // 파란 글자만 있는 행은 monthly_red가 비어 있어도 정상 추출이므로 제외.
  const noColor = inp.deals.filter((d) => d.first_payment && Object.values(d.monthly_payments).some((v) => v) && !dealHasColorData(d))
  if (noColor.length) issues.push({ id: "DQ-10", severity: "error", message: "색 셀 추출 실패 의심 (formatRuns 비어 있음)", samples: noColor.slice(0,5).map((d) => d.customer_name) })

  const segIdent = inp.seg.filter((s) => s.goal > 0 && s.goal === s.status).map((s) => s.region)
  if (segIdent.length) issues.push({ id: "DQ-11", severity: "info", message: "SEG 의 status==goal 지역 (히트맵 미사용 사유)", samples: segIdent })

  const unmapped = inp.kpi.map((r) => r.member).filter((m) => !inp.dsh.members[m])
  if (unmapped.length) issues.push({ id: "DQ-13", severity: "warn", message: "KPI 멤버 중 DSH 팀 매핑 누락", samples: unmapped })

  // REV_RANGE 상한 사용률 — Sheets API는 선언된 범위를 넘는 행을 에러 없이 조용히 잘라낸다.
  // 파싱된 최댓값(sheet_row)이 REV_RANGE의 마지막 행에 근접/도달했다면 다음 시트 증가분이
  // 잘려 나갈 위험 신호다. 상한은 REV_RANGE 문자열에서 파생하며 하드코딩하지 않는다.
  const revRangeLastRow = parseRangeLastRow(REV_RANGE)
  if (revRangeLastRow != null && inp.deals.length > 0) {
    const maxSheetRow = inp.deals.reduce((max, d) => Math.max(max, d.sheet_row), 0)
    const ratio = maxSheetRow / revRangeLastRow
    const pct = Math.round(ratio * 100)
    if (maxSheetRow >= revRangeLastRow) {
      issues.push({
        id: "DQ-15", severity: "error",
        message: `REV 파싱 ${maxSheetRow}행 — 범위 상한(${revRangeLastRow}행)에 도달 · 범위 절단 의심`,
        samples: [maxSheetRow], sheetRow: maxSheetRow,
      })
    } else if (ratio >= REV_RANGE_USAGE_WARN_RATIO) {
      issues.push({
        id: "DQ-15", severity: "warn",
        message: `REV 행이 범위 상한의 ${pct}%까지 도달 — 상한 증설 검토 (${maxSheetRow}/${revRangeLastRow}행)`,
        samples: [maxSheetRow], sheetRow: maxSheetRow,
      })
    }
  }

  return issues
}
