// 검색 토큰화 SSOT(품질 웨이브 3, 항목 1) — 공백으로 나뉜 다중 토큰 AND 매칭.
// "김민 BD"처럼 담당자/팀 등 서로 다른 필드에 걸쳐 있어도 매치되게 한다(토큰별로
// 어느 필드에서든 부분일치하면 통과). sections/PipelineTable.tsx가 지역 함수로 갖고
// 있던 로직을 그대로(로직 무변경) 이 파일로 추출한 것이 SSOT다. 소비처: PipelineTable.tsx·
// BranchPipelineKanban.tsx(고객/담당/팀/지역 4필드)·BranchKpiAccordion.tsx(담당자 1필드,
// 품질 웨이브 4 — 항목 3 전환) · SalesLedgerWorkbench.tsx의 매트릭스 본검색
// (revBaseFilteredRows)과 draftMatchesQuery.

export function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

export function matchesTokens(tokens: string[], fields: Array<string | null | undefined>): boolean {
  if (tokens.length === 0) return true
  return tokens.every((token) => fields.some((f) => String(f ?? "").toLowerCase().includes(token)))
}
