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

describe("SalesLedgerWorkbench 소스 — 담당자 MultiSelect가 핀 storageKey를 공유한다", () => {
  it("types.ts의 PIPELINE_MANAGER_DEFAULT_STORAGE_KEY를 import한다(개요와 동일 키 — 신규 키 아님)", () => {
    const source = read(workbenchPath)
    const importBlockStart = source.indexOf('from "./types"')
    expect(importBlockStart).toBeGreaterThan(-1)
    const importBlock = source.slice(0, importBlockStart)
    expect(importBlock).toContain("PIPELINE_MANAGER_DEFAULT_STORAGE_KEY")
  })

  it("담당자 MultiSelect 블록이 pinStorageKey={PIPELINE_MANAGER_DEFAULT_STORAGE_KEY}를 넘긴다", () => {
    const source = read(workbenchPath)
    const managerBlockStart = source.indexOf('label="담당자"')
    expect(managerBlockStart).toBeGreaterThan(-1)
    const managerBlockEnd = source.indexOf("/>", managerBlockStart)
    const managerBlock = source.slice(managerBlockStart, managerBlockEnd)
    expect(managerBlock).toContain("pinStorageKey={PIPELINE_MANAGER_DEFAULT_STORAGE_KEY}")
  })

  it("지역 MultiSelect 블록에는 pinStorageKey가 없다(핀은 담당자 필터에만 붙는다 — 스코프 확인)", () => {
    const source = read(workbenchPath)
    const regionBlockStart = source.indexOf('label="지역"')
    expect(regionBlockStart).toBeGreaterThan(-1)
    const regionBlockEnd = source.indexOf("/>", regionBlockStart)
    const regionBlock = source.slice(regionBlockStart, regionBlockEnd)
    expect(regionBlock).not.toContain("pinStorageKey")
  })
})

describe("SalesLedgerWorkbench 소스 — 복원 effect의 시드 게이트 배선", () => {
  it("pinSeedAttemptedRef는 useRef(false)로 선언되어 컴포넌트 생애주기 동안 유지된다", () => {
    const source = read(workbenchPath)
    expect(source).toContain("const pinSeedAttemptedRef = useRef(false)")
  })

  it("self-echo 가드 다음, ref를 소비하기 전에 isPinSeedEligible을 호출한다(갱신 전 값을 읽어야 함)", () => {
    const source = read(workbenchPath)
    const selfEchoGuardIdx = source.indexOf("if (params.toString() === lastWrittenSearchRef.current) return")
    const eligibleCallIdx = source.indexOf(
      "const pinSeedEligible = isPinSeedEligible(pinSeedAttemptedRef.current, params.toString())",
    )
    const refConsumeIdx = source.indexOf("pinSeedAttemptedRef.current = true")
    expect(selfEchoGuardIdx).toBeGreaterThan(-1)
    expect(eligibleCallIdx).toBeGreaterThan(selfEchoGuardIdx)
    expect(refConsumeIdx).toBeGreaterThan(eligibleCallIdx)
  })

  it("ref 소비(pinSeedAttemptedRef.current = true)는 lens 파싱보다 먼저 실행된다 — " +
    "kpi 리다이렉트로 일찍 return하는 분기와 무관하게 이번 실행이 항상 1회로 카운트된다", () => {
    const source = read(workbenchPath)
    const refConsumeIdx = source.indexOf("pinSeedAttemptedRef.current = true")
    const lensParamIdx = source.indexOf('const lensParam = params.get("lens")')
    expect(refConsumeIdx).toBeGreaterThan(-1)
    expect(lensParamIdx).toBeGreaterThan(refConsumeIdx)
  })

  it("핀 시드는 nextManagerFilter를 파싱한 뒤, setManagerFilter로 커밋하기 전에 pinSeedEligible로 게이팅된다", () => {
    const source = read(workbenchPath)
    const parseIdx = source.indexOf('const nextManagerFilter = parseMultiFilterParam(params.get("mgr"))')
    const gateIdx = source.indexOf("if (pinSeedEligible && typeof window !== \"undefined\") {")
    const commitIdx = source.indexOf(
      "setManagerFilter((current) => replaceEquivalentSet(current, nextManagerFilter))",
    )
    expect(parseIdx).toBeGreaterThan(-1)
    expect(gateIdx).toBeGreaterThan(parseIdx)
    expect(commitIdx).toBeGreaterThan(gateIdx)
  })

  it("게이트 안에서 같은 storageKey(PIPELINE_MANAGER_DEFAULT_STORAGE_KEY)로 localStorage를 읽어 " +
    "Set에 그대로 추가한다(현재 managerOptions 소속 여부는 검증하지 않는다)", () => {
    const source = read(workbenchPath)
    const gateIdx = source.indexOf("if (pinSeedEligible && typeof window !== \"undefined\") {")
    expect(gateIdx).toBeGreaterThan(-1)
    const gateBody = source.slice(gateIdx, gateIdx + 300)
    expect(gateBody).toContain("window.localStorage.getItem(PIPELINE_MANAGER_DEFAULT_STORAGE_KEY)")
    expect(gateBody).toContain("nextManagerFilter.add(pinnedManager)")
  })
})
