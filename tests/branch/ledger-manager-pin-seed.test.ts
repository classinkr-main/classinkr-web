import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { isPinSeedEligible } from "@/components/admin/branch/SalesLedgerWorkbench"

// 라운드 3 P3 — "내 딜" 담당자 프리셋 핀. 매출 장부(SalesLedgerWorkbench)의 담당자 MultiSelect가
// KR Team 개요(BranchDashboardClient)와 같은 저장 키(PIPELINE_MANAGER_DEFAULT_STORAGE_KEY)를
// 공유해 사람 단위 개인화를 화면 간에 이어준다. 장부의 URL 복원 effect는(개요와 달리) 반응형
// 절대 계약이라 — 파라미터 생략은 "기본값 복귀"를 뜻하고, 내비게이션·self-echo에서도 재실행된다 —
// 개요의 "마운트 1회" 복원과 동일한 결과를 내려면 별도 게이트가 필요하다: (a) 마운트 후 첫
// 실행이고 (b) URL 파라미터가 하나도 없을 때(pristine 진입)에만 핀 값을 managerFilter 시드로
// 넣는다. 파라미터가 하나라도 있으면(딥링크 — 예: ?lens=rev&q=349) 절대 개입하지 않는다 —
// 핀이 딥링크로 검색된 행(다른 담당자 소유일 수 있다)을 가리면 안 되기 때문이다.
//
// 이 스위트는 (1) 게이트 판정 순수 함수(isPinSeedEligible)를 직접 구동하고, (2) 소스 스캔으로
// 담당자 MultiSelect의 storageKey 공유·복원 effect의 배선 순서를 확인한다(CRLF \r\n 정규화
// read 헬퍼 관례 — tests/branch/pipeline-manager-default-pin.test.ts와 동일).

const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")

function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n")
}

describe("isPinSeedEligible — pristine 1회 시드 판정 순수 함수", () => {
  it("마운트 후 첫 실행 + URL 파라미터 0개(pristine 진입)면 true다", () => {
    expect(isPinSeedEligible(false, "")).toBe(true)
  })

  it("이미 판정을 소비했다면(alreadyAttempted=true) 파라미터가 이번엔 우연히 비어 있어도 false다 — " +
    "내비게이션·self-echo로 되돌아온 빈 파라미터는 재시드 대상이 아니다(1회 제한)", () => {
    expect(isPinSeedEligible(true, "")).toBe(false)
  })

  it("첫 실행이라도 URL 파라미터가 하나라도 있으면(딥링크) false다 — " +
    "핀이 딥링크로 검색된 행의 담당자를 가리면 안 된다", () => {
    expect(isPinSeedEligible(false, "lens=rev&q=349")).toBe(false)
    expect(isPinSeedEligible(false, "mgr=%EA%B9%80%EC%A7%80%EC%82%AC")).toBe(false)
  })

  it("이미 판정을 소비했고 파라미터도 있으면 당연히 false다", () => {
    expect(isPinSeedEligible(true, "lens=rev&q=349")).toBe(false)
  })
})

describe("접속자 개인 기본값과 명시적 전체 선택", () => {
  it("장부는 서버 담당자와 URL을 사용하며 공유 브라우저 핀을 복원하지 않는다", () => {
    const source = read(workbenchPath)
    expect(source).toContain("initialBranchManager(params, defaultManager)")
    expect(source).toContain('branchManagerMatches(Array.from(managerFilter)[0], defaultManager) ? "__me" : mgrParam ?? ""')
    expect(source).not.toContain("pinSeedAttemptedRef")
    expect(source).not.toContain("PIPELINE_MANAGER_DEFAULT_STORAGE_KEY")
  })
  it("담당자를 해석하기 전에는 전사 시드나 네트워크 조회를 열지 않는다", () => {
    const source = read(workbenchPath)
    expect(source).toContain("urlReady && pipelineSeedLive")
    expect(source).toContain("pipelineUrl === initialPipeline.url")
    expect(source).toContain("enabled: urlReady && (pipelineSeed == null || !pipelineSeedFresh)")
  })
})
