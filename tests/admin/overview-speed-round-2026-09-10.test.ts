import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// 2026-09-10 어드민 Overview 속도 라운드의 OverviewClient.tsx 변경 계약.
// 이 파일 전역이 기존 overview-loading-contract.test.ts와 같은 방식(소스 문자열 검사)을
// 쓰는 이유: 이 저장소에 @testing-library/react가 없고, 이 컴포넌트는 실제 렌더보다
// "어떤 URL·어떤 분기를 쓰는가"의 배선이 더 중요한 파일이라 기존 관례를 따른다.
const source = readFileSync(join(process.cwd(), "app/admin/overview/OverviewClient.tsx"), "utf8")

describe("위젯 단위 재시도 — retryOverview와 분리(감사 P2)", () => {
  it("retryOverview는 상단 배너의 전체 재시도로만 남아있다", () => {
    expect(source).toContain("const retryOverview = () => setRefreshKey")
    expect(source).toContain("전체 다시 시도")
    // 상단 배너의 onClick만 여전히 retryOverview를 직접 쓴다.
    expect(source).toContain("onClick={retryOverview}")
  })

  it("retrySource가 여섯 개 OverviewSourceKey 분기를 모두 처리한다", () => {
    expect(source).toContain("const retrySource = useCallback((key: OverviewSourceKey) => {")
    for (const key of ["leads", "visitor", "chatbot", "branch", "leadActions", "os"]) {
      expect(source).toContain(`case "${key}":`)
    }
  })

  it("개별 KPI 카드는 더 이상 onRetry={retryOverview}를 쓰지 않는다 — 전부 retrySource로 옮겼다", () => {
    expect(source).not.toContain("onRetry={retryOverview}")
  })

  it("os 서브타일 다섯 개는 os-summary 하나만 다시 부른다(네트워크 단위 최소 분할)", () => {
    for (const key of ["renewal", "matching", "hw", "content", "events"]) {
      expect(source).toContain(`osSourceError("${key}")`)
    }
    expect(source.match(/onRetry={\(\) => retrySource\("os"\)}/g)?.length).toBe(5)
  })
})

describe("Meta Instagram 지연 로드 — 첫 화면 팬아웃 축소(감사 P2)", () => {
  it("scheduleIdle로 감싸 마운트 즉시 다른 소스와 같은 틱에 쏘지 않는다", () => {
    expect(source).toContain("function scheduleIdle(task: () => void)")
    expect(source).toContain("requestIdleCallback")
    expect(source).toMatch(/scheduleIdle\(\(\) => \{\s*if \(cancelled\) return\s*void fetchJson<InstagramOverviewDashboard>/)
  })
})

describe("branch/summary·chatbot/stats 서버 프리페치 합류(첫 화면 동시 요청 축소)", () => {
  // 2026-09-10 2라운드(스트리밍 전환)로 "prefetched 플래그로 건너뛴다"는 판단이
  // sourceStates 초기 세팅(seededSourceStates)에서 소스별 seedX 콜백(isPrefetchFresh 체크)
  // 으로 옮겨갔다 — 여섯 소스 전부 같은 매커니즘을 쓰므로 branch·chatbot만 따로 볼 이유가
  // 없어졌다(예전엔 이 둘만 새로 합류해 별도로 고정했었다).
  it("두 소스 모두 seedX 콜백이 신선하면 클라이언트 재요청을 건너뛴다(isPrefetchFresh)", () => {
    expect(source).toContain("if (isPrefetchFresh(initialData.branchSummary.generatedAt)) return")
    expect(source).toContain("if (isPrefetchFresh(initialData.chatbotStats.generatedAt)) return")
  })

  it("두 소스 모두 PrefetchSourceBridge로 소스별 독립 Suspense 경계 안에서 소비된다", () => {
    expect(source).toContain(
      '<PrefetchSourceBridge promise={initialData.branchSummary.promise} onSettled={seedBranchSummary} />'
    )
    expect(source).toContain(
      '<PrefetchSourceBridge promise={initialData.chatbotStats.promise} onSettled={seedChatbotStats} />'
    )
  })
})

describe("매출 딥링크 기간 쿼리(감사 P2 — 착지 화면 불일치)", () => {
  it("두 매출 카드 모두 /admin/branch/ledger?period=Y로 착지한다(장부 기본값 Q와 어긋나지 않게)", () => {
    expect(source.match(/href="\/admin\/branch\/ledger\?period=Y"/g)?.length).toBe(2)
    expect(source).not.toContain('href="/admin/branch/ledger"')
  })
})
