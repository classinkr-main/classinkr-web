// 코덱스 감사 성능 3건(2026-07-24) 회귀 방지 — 렌더 하네스가 없어 소스 스캔 관례를 따른다
// (input-rail-weekly-split.test.ts와 동일 관례).
//  1) 콕핏 2-pane(CockpitDealList·CockpitEditor)·입력 레일(InputRailSection)은 기본 화면
//     (REV 렌즈 + 접힌 레일)에서 렌더되지 않는다 — DshNumericGrid 관례대로 dynamic 지연 로드.
//  2) KPI fetch는 우측 레일 "행 상세"의 담당자 KPI 박스에만 쓰인다 — 레일 열림 + detail +
//     행 선택일 때만 시작한다(마운트 즉시 fetch 금지).
//  3) 1분 상대시간 tick은 visibility-aware 공용 훅(useVisibleInterval) — 백그라운드 탭에서
//     헛도는 setInterval 금지(워크벤치 Source 스트립·SyncStatusBar 공유).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")
const syncBarPath = join(process.cwd(), "components/admin/branch/SyncStatusBar.tsx")
const hookPath = join(process.cwd(), "components/admin/branch/use-visible-interval.ts")

function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n")
}

describe("콕핏·입력 레일 지연 로드(dynamic)", () => {
  it("InputRailSection·CockpitDealList·CockpitEditor는 정적 import가 아니라 dynamic이다", () => {
    const source = read(workbenchPath)
    for (const name of ["InputRailSection", "CockpitDealList", "CockpitEditor"]) {
      expect(source).toContain(`const ${name} = dynamic(() => import("./ledger/${name}").then((m) => m.${name})`)
      expect(source).not.toContain(`import { ${name} } from "./ledger/${name}"`)
    }
    // DshNumericGrid 관례(ssr:false + LoadingPanel) 유지 확인 — 셋 다 같은 블록 안에 있다.
    const blockStart = source.indexOf("const InputRailSection = dynamic")
    const blockEnd = source.indexOf("const DraftQueue = dynamic")
    expect(blockStart).toBeGreaterThan(-1)
    expect(blockEnd).toBeGreaterThan(blockStart)
    const block = source.slice(blockStart, blockEnd)
    expect(block).toContain("ssr: false")
    expect(block).toContain("<LoadingPanel")
  })
})

describe("KPI 요청 지연(레일 상세에서만)", () => {
  it("kpi useBranchJson은 enabled 게이트(레일 열림 + detail + 행 선택, 콕핏 제외)를 받는다", () => {
    const source = read(workbenchPath)
    expect(source).toContain(
      'const kpiNeeded = !sidePanelCollapsed && railView === "detail" && selectedRow != null && lens !== "cockpit"',
    )
    expect(source).toContain("{ enabled: kpiNeeded }")
  })
})

describe("1분 tick visibility 인식(useVisibleInterval 공용 훅)", () => {
  it("워크벤치 Source 스트립·SyncStatusBar 둘 다 공용 훅을 쓰고 생 setInterval tick을 남기지 않는다", () => {
    for (const path of [workbenchPath, syncBarPath]) {
      const source = read(path)
      expect(source).toContain('from "./use-visible-interval"')
      expect(source).toContain("useVisibleInterval(() => ")
      // 1분 상대시간 tick의 생 setInterval 잔존 감지(다른 용도의 interval은 이 두 파일에 없다).
      expect(source).not.toContain("window.setInterval(")
    }
  })

  it("훅은 hidden에서 멈추고 복귀 즉시 1회 따라잡는다(스테일 표기 방지 계약)", () => {
    const source = read(hookPath)
    expect(source).toContain('document.addEventListener("visibilitychange"')
    const onVisible = source.slice(source.indexOf("const onVisibilityChange"), source.indexOf("if (document.visibilityState !== \"hidden\") start()"))
    // hidden → stop, visible → 즉시 1회 실행 후 재개.
    expect(onVisible).toContain("stop()")
    expect(onVisible).toContain("callbackRef.current()")
    expect(onVisible).toContain("start()")
  })
})
