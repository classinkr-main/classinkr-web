import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { pipelineUrlForSearchParams } from "@/components/admin/branch/SalesLedgerWorkbench"

// 서버 프리페치 시드(app/admin/branch/ledger/page.tsx가 만드는 ALL·Q rows)의 딥링크 게이트.
// team/period/month 상태는 URL 복원 effect가 마운트 이후에 채우므로, 첫 프레임의 pipelineUrl은
// 항상 기본 조합이다 — 게이트가 없으면 ?team=BD 딥링크에서도 시드 키가 일치해 다른 팀의 행이
// 한 프레임 그려졌다. 이 스위트는 게이트의 URL 정규화가 실제 pipelineUrl 조립과 같은 규칙을
// 쓰는지(어긋나면 시드가 헛돌거나 틀린 데이터를 보여준다) 고정한다.

const DEFAULT_MONTH = "2026-08"
const DEFAULT_URL = "/api/admin/branch/pipeline?team=ALL&period=Q"

describe("pipelineUrlForSearchParams — 딥링크 시드 게이트의 URL 정규화", () => {
  it("파라미터가 없으면 페이지 프리페치가 만든 기본 URL과 같다(시드 적용)", () => {
    expect(pipelineUrlForSearchParams("", DEFAULT_MONTH)).toBe(DEFAULT_URL)
  })

  it("기본값을 명시한 딥링크(?team=ALL&period=Q)도 같은 URL이다 — 시드를 헛되이 버리지 않는다", () => {
    expect(pipelineUrlForSearchParams("team=ALL&period=Q", DEFAULT_MONTH)).toBe(DEFAULT_URL)
  })

  it("팀 딥링크는 다른 URL이 되어 시드가 꺼진다", () => {
    expect(pipelineUrlForSearchParams("team=BD", DEFAULT_MONTH)).toBe(
      "/api/admin/branch/pipeline?team=BD&period=Q",
    )
  })

  it("period=M이면 month를 URL에 싣는다(pipelineUrl의 monthQuery 규칙과 동일)", () => {
    expect(pipelineUrlForSearchParams("team=BD&period=M&month=2026-03", DEFAULT_MONTH)).toBe(
      "/api/admin/branch/pipeline?team=BD&period=M&month=2026-03",
    )
    // period가 M이 아니면 month 파라미터가 있어도 URL에는 들어가지 않는다 — 시드는 여전히 유효.
    expect(pipelineUrlForSearchParams("month=2026-03", DEFAULT_MONTH)).toBe(DEFAULT_URL)
  })

  it("period=M인데 month가 없거나 형식이 틀리면 기본 월로 떨어진다(복원 effect의 정규화와 동일)", () => {
    expect(pipelineUrlForSearchParams("period=M", DEFAULT_MONTH)).toBe(
      `/api/admin/branch/pipeline?team=ALL&period=M&month=${DEFAULT_MONTH}`,
    )
    expect(pipelineUrlForSearchParams("period=M&month=2026-13", DEFAULT_MONTH)).toBe(
      `/api/admin/branch/pipeline?team=ALL&period=M&month=${DEFAULT_MONTH}`,
    )
  })

  it("화이트리스트 밖의 team/period는 기본값으로 떨어진다 — 시드 판정이 임의 문자열에 흔들리지 않는다", () => {
    expect(pipelineUrlForSearchParams("team=XX&period=ZZ", DEFAULT_MONTH)).toBe(DEFAULT_URL)
  })

  it("시드와 무관한 필터 딥링크(?q=·?mgr=)는 URL을 바꾸지 않는다 — 시드는 유효하고 필터만 클라이언트에서 걸린다", () => {
    expect(pipelineUrlForSearchParams("q=349&mgr=%EA%B9%80", DEFAULT_MONTH)).toBe(DEFAULT_URL)
  })
})

describe("SalesLedgerWorkbench 소스 — 시드 초기화가 게이트를 경유한다", () => {
  it("pipelineSeedLive 초기값이 URL 판정 결과와 initialPipeline 존재 여부를 함께 본다", () => {
    const source = readFileSync(
      join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n")
    const declIdx = source.indexOf("const [pipelineSeedLive, setPipelineSeedLive] = useState(")
    expect(declIdx).toBeGreaterThan(-1)
    const decl = source.slice(declIdx, declIdx + 400)
    expect(decl).toContain("initialPipeline != null")
    expect(decl).toContain("pipelineUrlForSearchParams(searchParams.toString(), defaultMonthRef.current)")
    expect(decl).toContain("=== initialPipeline.url")
  })
})
