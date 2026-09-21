// 매출 장부 입력 속도 기획(docs/active/sales-ledger-input-speed-plan-2026-09-20.md) §8.4 DSH 행:
// "입력 진입점이 0개" 대응 — DSH 렌즈 팀 그리드 행에 REV 렌즈(팀 필터 동봉) 진입 링크 1개.
// 소스 스캔(lens-cross-jump.test.ts와 같은 관례) — 렌더 트리 대신 컴포넌트 소스 텍스트를 검사한다.
// CRLF 정규화 read 관례(autocrlf 체크아웃에서 여러 줄 패턴 보호).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const read = (relPath: string) =>
  readFileSync(join(process.cwd(), relPath), "utf8").replace(/\r\n/g, "\n")

describe("DshTeamGrid — REV 렌즈 진입 링크(딥링크 team 필터 동봉)", () => {
  const source = read("components/admin/branch/ledger/DshTeamGrid.tsx")

  it("팀 필터를 동봉한 REV 렌즈 딥링크(lens=rev&team=)를 만든다", () => {
    expect(source).toContain("REV에서 보기")
    expect(source).toContain("lens=rev&team=")
    expect(source).toContain("encodeURIComponent(team)")
  })

  it("행 확장 토글(onToggle)과 충돌하지 않도록 링크 클릭 버블링을 막는다", () => {
    expect(source).toContain("stopPropagation")
  })

  it("ALL과 TEAMS 밖의 팀 표기는 링크를 만들지 않는다(REV team 필터가 받지 않는 값)", () => {
    // TEAMS(REV 매트릭스가 받는 유효 team 값)를 가드에 실제로 참조하는지 확인 — 문자열
    // 리터럴만 늘어놓은 자체 판정("BD"|"MKT"|"CSM" 하드코딩)으로의 회귀를 막는다.
    expect(source).toContain("TEAMS")
    expect(source).toContain('team === "ALL"')
  })
})
