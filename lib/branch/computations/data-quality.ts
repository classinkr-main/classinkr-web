import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { dealHasColorData } from "@/lib/branch/computations/rev-confirmed"
import type { DshOutput } from "@/lib/branch/parsers/dsh"
import type { KpiRow } from "@/lib/branch/parsers/kpi"
import type { SegRow } from "@/lib/branch/parsers/seg"
import type { HwInbound, HwOutbound, HwStock } from "@/lib/repositories/branch-hw"

export type Severity = "info" | "warn" | "error"
export interface DqIssue { id: string; severity: Severity; message: string; samples?: unknown[] }

export const DATA_QUALITY_RULE_IDS = ["DQ-2", "DQ-3", "DQ-4", "DQ-7", "DQ-9", "DQ-10", "DQ-11", "DQ-13"] as const
export const DATA_QUALITY_RULE_COUNT = DATA_QUALITY_RULE_IDS.length

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

  return issues
}
