import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Overview·CRM 홈 스트리밍 전환(2026-09-10 2라운드, tmp/admin-overhaul-2026-09-10/
 * platform.md §2 위임안 반영)의 구조 계약을 소스 텍스트로 고정한다.
 *
 * 이 저장소엔 @testing-library/react가 없어(tests/admin/overview-speed-round-2026-09-10.test.ts
 * 코멘트 참고) 실제 렌더 대신 "await 없는 page.tsx + 소스별 독립 Suspense 경계"라는 구조적
 * 신호로 대신 고정한다 — 이 신호가 깨지면(누군가 openPrefetchLane 결과를 다시 await하거나,
 * 여섯/네 개 경계를 하나로 합치면) 두 페이지 모두 콜드 TTFB가 다시 가장 느린 소스에
 * 종속되거나(§2.0의 이중비용 재발), 스트리밍 이점이 사라진다(가장 느린 소스가 전체를 막음).
 *
 * "TTFB가 실제로 소스를 안 기다린다"는 기능 계약(느린 소스를 mock해도 prefetch()가 끝난다)은
 * tests/admin/overview-prefetch.test.ts·tests/admin/crm-home-prefetch.test.ts가 이미
 * 고정한다 — 이 파일은 그와 별개로 "구조"(await 부재 + 경계 개수)만 본다.
 */
const overviewPage = readFileSync(join(process.cwd(), "app/admin/overview/page.tsx"), "utf8")
const overviewPrefetch = readFileSync(join(process.cwd(), "lib/admin/overview/prefetch.ts"), "utf8")
const overviewClient = readFileSync(join(process.cwd(), "app/admin/overview/OverviewClient.tsx"), "utf8")
const crmPage = readFileSync(join(process.cwd(), "app/admin/crm/page.tsx"), "utf8")
const crmHomePrefetch = readFileSync(join(process.cwd(), "lib/admin/crm/home-prefetch.ts"), "utf8")
const priorityQueuePrefetch = readFileSync(
  join(process.cwd(), "lib/admin/crm/priority-queue-prefetch.ts"),
  "utf8"
)
const crmHomeClient = readFileSync(
  join(process.cwd(), "components/admin/crm/home/CrmHomeClient.tsx"),
  "utf8"
)
const priorityQueuePanel = readFileSync(
  join(process.cwd(), "components/admin/crm/CrmPriorityQueuePanel.tsx"),
  "utf8"
)

// settleWithinBudget import 여부만 본다(호출부·import문 형태) — 두 파일 모두 "왜 이제 이걸
// 안 쓰는지"를 설명하는 산문 주석에서 그 이름 자체를 여러 번 언급하므로, 단순
// `not.toMatch(/settleWithinBudget/)`는 그 주석과 충돌해 오탐한다.
const IMPORTS_SETTLE_WITHIN_BUDGET = /import\s*\{[^}]*\bsettleWithinBudget\b[^}]*\}\s*from/

// JSX 여는 태그로서의 <Suspense만 센다("...형제 <Suspense>로 감싼다" 같은 산문 언급과
// 구분하기 위해 태그 경계(공백 또는 self-closing 불가이므로 항상 속성이 옴)를 요구한다).
const SUSPENSE_OPEN_TAG = /<Suspense[ \n]/g
const SUSPENSE_CLOSE_TAG = /<\/Suspense>/g

describe("Overview — 첫 바이트가 소스를 기다리지 않는다", () => {
  it("page.tsx는 settleWithinBudget을 더 이상 쓰지 않는다", () => {
    expect(overviewPage).not.toMatch(IMPORTS_SETTLE_WITHIN_BUDGET)
  })

  it("prefetch.ts의 여섯 소스가 전부 openPrefetchLane(레인만 열기)이다 — settleWithinBudget import 없음", () => {
    expect(overviewPrefetch).not.toMatch(IMPORTS_SETTLE_WITHIN_BUDGET)
    const laneCount = (overviewPrefetch.match(/openPrefetchLane\(/g) ?? []).length
    // getLeadActionStats/buildBranchSummaryPayload/getChatbotStats는 트림 콜백 안에서
    // 한 번씩만 openPrefetchLane에 감싸인다 — 6개 필드 = 최소 6번 호출.
    expect(laneCount).toBeGreaterThanOrEqual(6)
  })

  it("OverviewClient가 여섯 소스를 형제 <Suspense> 경계로 각각 감싼다(하나로 합치지 않는다)", () => {
    const bridgeCount = (overviewClient.match(/<PrefetchSourceBridge/g) ?? []).length
    const suspenseCount = (overviewClient.match(/<Suspense fallback=\{null\}>/g) ?? []).length
    expect(bridgeCount).toBe(6)
    expect(suspenseCount).toBeGreaterThanOrEqual(6)
    for (const key of [
      "leadOverview",
      "visitorStats",
      "chatbotStats",
      "branchSummary",
      "osSummary",
      "leadActionKpis",
    ]) {
      expect(overviewClient).toContain(`promise={initialData.${key}.promise}`)
    }
  })

  it("PrefetchSourceBridge는 화면에 아무것도 그리지 않는다(return null) — 이중 스켈레톤 방지", () => {
    const fnStart = overviewClient.indexOf("function PrefetchSourceBridge<T>(")
    expect(fnStart).toBeGreaterThan(-1)
    // 정의가 짧다(10줄 안팎) — 다음 top-level 선언(SOURCE_STATE_LABEL)이 나오기 전까지만 본다.
    const nextMarker = overviewClient.indexOf("const SOURCE_STATE_LABEL", fnStart)
    expect(nextMarker).toBeGreaterThan(fnStart)
    const fnBody = overviewClient.slice(fnStart, nextMarker)
    expect(fnBody).toContain("return null")
    expect(fnBody).toContain("use(promise)")
  })
})

describe("CRM 홈 — 첫 바이트가 소스를 기다리지 않는다", () => {
  it("page.tsx는 settleWithinBudget을 더 이상 쓰지 않는다", () => {
    expect(crmPage).not.toMatch(IMPORTS_SETTLE_WITHIN_BUDGET)
  })

  it("home-prefetch.ts·priority-queue-prefetch.ts 전부 openPrefetchLane이다", () => {
    expect(crmHomePrefetch).not.toMatch(IMPORTS_SETTLE_WITHIN_BUDGET)
    expect(crmHomePrefetch).toContain("openPrefetchLane")
    expect(priorityQueuePrefetch).not.toMatch(IMPORTS_SETTLE_WITHIN_BUDGET)
    expect(priorityQueuePrefetch).toContain("openPrefetchLane")
  })

  it("CRM 홈의 OVERVIEW_PREFETCH_BUDGET_MS(700ms) 완화책은 제거됐다 — 예산 자체가 없어져 불필요하다", () => {
    // 상수 선언 자체가 없는지만 본다 — JSDoc은 "왜 제거했는지"를 설명하며 이 이름을
    // 그대로 인용하므로, 파일 전체에서 이름 자체를 찾으면 그 산문과 충돌해 오탐한다.
    expect(crmHomePrefetch).not.toMatch(/const OVERVIEW_PREFETCH_BUDGET_MS/)
  })

  it("CrmHomeClient가 세 소스를 형제 <Suspense> 경계로 각각 감싼다", () => {
    const bridgeCount = (crmHomeClient.match(/<PrefetchSourceBridge/g) ?? []).length
    expect(bridgeCount).toBe(3)
    for (const key of ["leadActionKpis", "overview", "compassPipeline"]) {
      expect(crmHomeClient).toContain(`initialData?.${key}.promise ?? RESOLVED_NULL_PROMISE`)
    }
  })

  it("CrmPriorityQueuePanel(네 번째 소스)은 자신이 직접 use()로 소비하고, 호출부가 Suspense로 감싼다", () => {
    expect(priorityQueuePanel).toContain("const prefetchSeed = use(prefetchPromise)")
    expect(crmHomeClient).toContain("<Suspense fallback={<CrmPriorityQueuePanelSkeleton />}>")
  })

  it("화면 전체를 한 Suspense로 감싸는 회귀를 막는다 — 헤더는 어떤 Suspense JSX 태그 안에도 없다", () => {
    // "헤더 — 타이틀만" 주석 앞에는 leadActionKpis·overview·compassPipeline 세 bridge의
    // <Suspense>만 온다(우선순위 큐 패널의 네 번째 경계는 헤더보다 한참 아래, 빠른 실행
    // 바·리드 요약 뒤에 있다) — 열고 닫은 개수가 같아야 한다(열린 채로 헤더까지 넘어가면
    // 헤더까지 첫 소스 settle을 기다리는 회귀다 — 이번 작업이 막으려는 바로 그 안티패턴).
    const headerIdx = crmHomeClient.indexOf("헤더 — 타이틀만")
    expect(headerIdx).toBeGreaterThan(-1)
    const before = crmHomeClient.slice(0, headerIdx)
    const opens = (before.match(SUSPENSE_OPEN_TAG) ?? []).length
    const closes = (before.match(SUSPENSE_CLOSE_TAG) ?? []).length
    expect(opens).toBe(3)
    expect(opens).toBe(closes)
  })
})
