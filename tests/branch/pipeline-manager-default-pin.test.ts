import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

// 웨이브 7 — Q5(개인화 라이트). 로그인 identity↔매니저 매핑이 없어 "담당" 필터에 사용자가
// 직접 기본값을 저장/해제하는 핀 토글(localStorage)을 붙였다. 파싱 우선순위는 URL > localStorage
// > 없음 — BranchDashboardClient가 마운트 시 URL에 mgr이 없을 때만 복원하고, PipelineTable·
// BranchPipelineKanban의 "담당" MultiSelect가 저장/해제 UI(핀 아이콘)를 갖는다.

const typesPath = join(process.cwd(), "components/admin/branch/types.ts")
const multiSelectPath = join(process.cwd(), "components/admin/branch/MultiSelect.tsx")
const pipelineTablePath = join(process.cwd(), "components/admin/branch/sections/PipelineTable.tsx")
const kanbanPath = join(process.cwd(), "components/admin/branch/sections/BranchPipelineKanban.tsx")
const dashboardClientPath = join(process.cwd(), "components/admin/branch/BranchDashboardClient.tsx")

// CRLF 정규화: autocrlf 체크아웃(Windows)에서도 여러 줄 "\n" 스캔 패턴이 일치하도록
// (tests/db/hardware-sheet-import-inbound-costing-migration.test.ts와 동일 관례).
function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n")
}

describe("웨이브 7 — Q5. 공유 저장 키", () => {
  it("types.ts가 PIPELINE_MANAGER_DEFAULT_STORAGE_KEY를 내보낸다", () => {
    const source = read(typesPath)
    expect(source).toContain('export const PIPELINE_MANAGER_DEFAULT_STORAGE_KEY = "branch-pipeline-manager-default"')
  })
})

describe("웨이브 7 — Q5. MultiSelect 핀 토글", () => {
  it("pinStorageKey prop을 받고, 제공될 때만 핀 버튼을 렌더한다", () => {
    const source = read(multiSelectPath)
    expect(source).toContain("pinStorageKey?: string")
    expect(source).toContain("{pinStorageKey && (")
  })

  it("핀은 첫 번째 선택값만 저장한다(다른 크로스링크 필드와 동일 컨벤션)", () => {
    const source = read(multiSelectPath)
    expect(source).toContain('const firstSelected = Array.from(selected)[0] ?? ""')
    expect(source).toContain("window.localStorage.setItem(pinStorageKey, firstSelected)")
  })

  it("핀이 눌린 상태에서 다시 누르면 저장값을 해제(removeItem)한다", () => {
    const source = read(multiSelectPath)
    const toggleStart = source.indexOf("function togglePin()")
    expect(toggleStart).toBeGreaterThan(-1)
    const toggleBody = source.slice(toggleStart, toggleStart + 400)
    expect(toggleBody).toContain("window.localStorage.removeItem(pinStorageKey)")
  })

  it("localStorage 읽기는 마운트 후 1회만 실행된다(SSR 하이드레이션 불일치 방지)", () => {
    const source = read(multiSelectPath)
    const effectStart = source.indexOf("useEffect(() => {\n    if (!pinStorageKey || typeof window")
    expect(effectStart).toBeGreaterThan(-1)
    const effectEnd = source.indexOf("}, [])", effectStart)
    expect(effectEnd).toBeGreaterThan(effectStart)
  })

  it("핀 버튼도 U5와 동일 규약(모바일 44px → 데스크톱 md:h-8/md:w-8)을 따른다", () => {
    const source = read(multiSelectPath)
    const pinButtonIndex = source.indexOf("onClick={togglePin}")
    expect(pinButtonIndex).toBeGreaterThan(-1)
    const classIndex = source.indexOf("className=", pinButtonIndex)
    const classEnd = source.indexOf("`}", classIndex)
    const pinClass = source.slice(classIndex, classEnd)
    expect(pinClass).toContain("h-11 min-h-11 w-11 min-w-11")
    expect(pinClass).toContain("md:h-8 md:min-h-0 md:w-8 md:min-w-0")
  })
})

describe("계정 기반 파이프라인 기본값", () => {
  it("테이블과 칸반은 공용 브라우저의 담당자 핀을 기본값으로 제안하지 않는다", () => {
    for (const path of [pipelineTablePath, kanbanPath]) {
      expect(read(path)).not.toContain("pinStorageKey={PIPELINE_MANAGER_DEFAULT_STORAGE_KEY}")
      expect(read(path)).toContain("scopeManager")
    }
  })
  it("개요는 검증된 담당자를 기본값으로 사용하고 명시적 전체를 URL에 보존한다", () => {
    const source = read(dashboardClientPath)
    expect(source).toContain("initialBranchManager(searchParams, defaultManager)")
    expect(source).not.toContain("window.localStorage.getItem(PIPELINE_MANAGER_DEFAULT_STORAGE_KEY)")
    expect(source).toContain('url.searchParams.set("mgr", "")')
    expect(source).toContain('aria-label="데이터 범위"')
  })
})
