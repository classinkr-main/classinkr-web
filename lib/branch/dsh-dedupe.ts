// DSH breakdown 중복 제거(최대-annual 채택) — 서버(summary 라우트 deal_mix)와 클라이언트
// (components/admin/branch/ledger/dsh-derive.ts의 모든 파생)가 공유하는 SSOT.
//
// 절대 규칙(3중 계상 방지): 파서 breakdown(lib/branch/parsers/dsh.ts 2차 패스)은 같은
// (kind, category, status_type, channel) 콤보를 스코프별로 반복 방출한다(전사 + 팀/멤버
// 섹션 — 파서가 시트의 모든 섹션을 훑고, 액티브 임포트 소스는 순서까지 뒤섞임). 전사
// 행은 부분 행들의 합이라 annual이 항상 최대이므로, 합산 대신 최대 annual 행 하나를
// 채택한다. breakdown 파생은 어디서든 이 함수를 유일한 진입점으로 쓴다 — raw breakdown을
// 직접 합산하지 말 것(실측 사고: deal_mix 전사 연간 목표 10,000,000 → 30,000,000 3배
// 부풀림 + goal·status 배율이 달라 pct까지 왜곡).

// 파서 DshBreakdownRow(lib/branch/parsers/dsh.ts)와 클라이언트 BranchDshBreakdownRow
// (components/admin/branch/types.ts)를 구조 타입으로 모두 수용한다.
export interface DshDedupeRowLike {
  kind: "goal" | "status"
  category: string
  status_type: string
  channel: string
  annual: number
  months: Record<string, number>
}

export interface DshDedupeResult<T extends DshDedupeRowLike = DshDedupeRowLike> {
  monthKeys: string[]
  goal: Map<string, T>
  status: Map<string, T>
}

export function dedupeDshByKind<T extends DshDedupeRowLike>(breakdown: T[]): DshDedupeResult<T> {
  const keys = new Set<string>()
  for (const row of breakdown) for (const ym of Object.keys(row.months)) keys.add(ym)
  // 회계월 키는 breakdown이 실제로 담고 있는 달의 합집합 — YYYY-MM 문자열 정렬이
  // FY 경계(4월 시작 → 이듬해 3월)를 그대로 보존한다.
  const monthKeys = [...keys].sort()

  const byKind: Record<"goal" | "status", Map<string, T>> = {
    goal: new Map(),
    status: new Map(),
  }
  for (const row of breakdown) {
    const bucket = byKind[row.kind]
    if (!bucket) continue
    const key = `${row.category}|${row.status_type}|${row.channel}`
    const existing = bucket.get(key)
    // 전사 행은 부분 행들의 합이라 annual이 항상 최대 — 합산 대신 최대 행 하나만 채택한다.
    if (!existing || row.annual > existing.annual) bucket.set(key, row)
  }
  return { monthKeys, goal: byKind.goal, status: byKind.status }
}
