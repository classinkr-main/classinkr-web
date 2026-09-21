// R4 — 매칭 인박스 '제외' 되돌리기와 수동 연결 범위 계약(소스 문자열 검사).
// 되돌리기는 stale(재검수)로 보내고, 행별 Set 잠금(pendingLinkIds, 감사 2B.4)을 그대로 쓴다.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const client = readFileSync(
  join(process.cwd(), "components/admin/crm/matching/MatchingInboxClient.tsx"),
  "utf8"
)
const repository = readFileSync(join(process.cwd(), "lib/repositories/crm-source-links.ts"), "utf8")

describe("매칭 인박스 — 제외 되돌리기", () => {
  it("rejected 행도 되돌리기(stale) 액션을 렌더한다", () => {
    expect(client).toContain('(row.linkStatus === "confirmed" || row.linkStatus === "rejected")')
    expect(client).toContain('updateSourceLink(row.linkId as string, "stale")')
    expect(client).toContain("제외를 되돌리고 재검수로 보냅니다")
  })

  it("행별 Set 잠금을 유지한다 — 스칼라 잠금으로 되돌아가지 않는다", () => {
    expect(client).toContain("useState<Set<string>>(() => new Set())")
    expect(client).toContain("disabled={pendingLinkIds.has(row.linkId as string)}")
    expect(client).not.toContain("pendingLinkId ===")
  })

  it("서버 stale 액션은 rejected 에도 상태 가드 없이 적용된다", () => {
    expect(repository).toContain('const status = action === "reject" ? "rejected" : "stale"')
  })

  it("되돌린(stale) 쌍은 제외 목록에서 빠져 자동 확정·후보 판단에 다시 오른다", () => {
    // 제외 쌍 목록은 status === "rejected" 인 행만 모은다 — stale 로 되돌리면 빠진다.
    expect(repository).toContain('if (link.status !== "rejected") continue')
    // 기존 쌍(상태 무관)은 재생성에서 다시 insert 하지 않는다 — 되돌린 행이 재검수 상태로 그대로 인박스에 남는다.
    expect(repository).toContain("!existingCandidateKeys.has(buildCandidateKey(candidate))")
  })
})

describe("매칭 인박스 — 수동 연결 범위", () => {
  it("수동 연결을 REV 시트로만 제한하지 않는다", () => {
    expect(client).not.toContain('row.sourceSystem === "branch_rev_sheet" && row.linkStatus !== "confirmed"')
    expect(client).toContain('const isManualOpen = row.linkStatus !== "confirmed"')
  })

  it("수동 후보 요청에 원천 소스·객체를 함께 보낸다", () => {
    expect(client).toContain("sourceSystem: row.sourceSystem")
    expect(client).toContain("sourceObject: row.sourceObject")
  })

  it("저장소는 리드·Neo CRM 원천도 수동 후보로 받는다", () => {
    expect(repository).toContain("export async function createManualCrmLinkCandidate(")
    expect(repository).toContain('.from("leads")')
    expect(repository).toContain('.from("external_crm_records")')
  })
})
