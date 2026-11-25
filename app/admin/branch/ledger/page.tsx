import { resolvePersonalBranchManager } from "@/lib/admin/personal-branch"
import { Suspense } from "react"
import AdminRouteLoading from "@/components/admin/AdminRouteLoading"
import SyncHealthBannerServer from "@/components/admin/SyncHealthBannerServer"
import SalesLedgerWorkbench, { type LedgerPipelinePrefetch } from "@/components/admin/branch/SalesLedgerWorkbench"
import { ledgerPipelineUrl } from "@/components/admin/branch/ledger/ledger-business-day"
import type { BranchPipelineResponse } from "@/components/admin/branch/types"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { openPrefetchLane } from "@/lib/admin/prefetch-budget"
import { BRANCH_READ_ADMIN_API_ROLES, hasAdminApiRole } from "@/lib/admin-auth"
import { fiscalYearOfYm, resolvePeriodDate } from "@/lib/branch/fiscal"
import { readBranchPipelineRows } from "@/lib/branch/pipeline-rows"
import { getBusinessDateParts } from "@/lib/business-time"

export const dynamic = "force-dynamic"

// 워크벤치가 첫 렌더에서 부르는 URL — team/period/month 상태 초기값(ALL · Q · month 미포함)이
// 그대로 쿼리가 된다. ?team=BD 같은 딥링크는 마운트 효과가 상태를 바꾼 뒤 별도 요청으로 나가므로
// 서버가 미리 만들어야 하는 조합은 항상 이 기본형 하나다. 시드 URL 은 워크벤치 pipelineUrl 과 같은 함수(ledgerPipelineUrl)로
// 만든다 — 문자 그대로 같아야 시드가 쓰인다. 끝의 fy(화면 회계연도, KST 영업일)가 시드 키에 들어가 4/1 경계에서 서버가 만든
// 지난 회계연도 시드를 새 회계연도의 브라우저가 받아 쓰지 않는다(F-45).
const INITIAL_TEAM = "ALL"
const INITIAL_PERIOD = "Q"

/**
 * 첫 화면 서버 프리페치 — GET /api/admin/branch/pipeline과 같은 검증(BRANCH_READ_ADMIN_API_ROLES)·
 * 같은 조립 함수(readBranchPipelineRows)로 rows를 만든다.
 * 컨텍스트가 없거나 역할이 허용 목록 밖이면 데이터를 만들지 않고 null을 돌려준다 — 그 경우
 * (아래 openPrefetchLane이 감싸는) promise가 null로 settle되고, 화면은 지금까지처럼 클라이언트
 * 페치로 떨어지며 그 요청은 API가 401/403으로 막는다.
 *
 * 횡단 인프라 개편(2026-09-10 스트리밍 전환): 검증(getVerifiedAdminContextForPage)까지 이 함수
 * 안으로 들어왔다 — page.tsx는 이제 아무것도 기다리지 않는다(TTFB 0ms). 요청자 컨텍스트는 매
 * 요청 이 run() 콜백 안에서 새로 평가된다(캐시 밖).
 */
async function prefetchLedgerRows(manager: string): Promise<BranchPipelineResponse | null> {
  const admin = await getVerifiedAdminContextForPage()
  if (!admin || !hasAdminApiRole(admin.role, BRANCH_READ_ADMIN_API_ROLES)) return null

  const rows = await readBranchPipelineRows({
    manager,
    team: INITIAL_TEAM,
    period: INITIAL_PERIOD,
    periodDate: resolvePeriodDate(INITIAL_PERIOD, null),
  })
  return { rows }
}

async function PersonalSalesLedger() {
  const admin = await getVerifiedAdminContextForPage()
  const defaultManager = await resolvePersonalBranchManager(admin && hasAdminApiRole(admin.role, BRANCH_READ_ADMIN_API_ROLES) ? admin : null)
  // openPrefetchLane은 run()을 기다리지 않고 즉시 {promise, generatedAt}을 돌려준다 —
  // readBranchPipelineRows 콜드 미스가 아무리 느려도 TTFB에 1ms도 얹지 않는다. 예전
  // settleWithinBudget은 1.2초 예산을 다 기다린 뒤에야 null을 반환했고, 그 null을 받은
  // 클라이언트가 다시 같은 데이터를 요청해 "1.2초 낭비 + 클라이언트 왕복"의 이중비용이 났다
  // (tmp/admin-overhaul-2026-09-10/platform.md §2.0). 이제 그 대기 자체가 없다.
  const lane = openPrefetchLane(() => prefetchLedgerRows(defaultManager))
  // 오늘(KST 영업일)을 서버에서 한 번 정해 워크벤치 첫 상태(이번 달 · 회계연도)로 넘긴다 — 서버 렌더와 첫 클라이언트 렌더가 같은 달을
  // 그려 달 경계에서 하이드레이션이 깨지지 않는다(F-45). 그 뒤로는 워크벤치가 1분 틱 · 탭 복귀로 다시 읽는다(F-11).
  const initialBusinessDate = getBusinessDateParts().date
  const initialPipeline: LedgerPipelinePrefetch = {
    url: ledgerPipelineUrl({
      team: INITIAL_TEAM,
      period: INITIAL_PERIOD,
      manager: defaultManager,
      fy: fiscalYearOfYm(initialBusinessDate),
    }),
    promise: lane.promise,
    generatedAt: lane.generatedAt,
  }

  // SalesLedgerWorkbench는 pipelineSeedCandidate(URL이 기본 조합과 일치할 때만)에서만 React
  // use()로 이 promise를 푼다 — 딥링크·필터 변경은 애초에 이 promise를 기다리지 않으므로
  // Suspense가 걸리지 않는다. fallback은 이 라우트의 기존 loading.tsx와 같은 AdminRouteLoading을
  // 재사용해 새 로딩 UI를 만들지 않는다. 장부 RSC 페이로드 비대화(비압축 2.4MB, gzip 21KB —
  // §플랫폼 보고서 2.2(b))는 이 Suspense 경계 도입과 독립적인 이슈라 여기서 함께 손대지
  // 않는다 — 385행 pipeline은 여전히 이 경계 안(promise resolve 값)에 담겨 스트리밍된다.
  //
  // 동기화 건강 띠(2026-09-25) — 장부 상태 줄(LedgerStatusRail)의 동기화 칸은 접혀 있어 "며칠째 멈췄고
  // 화면 값이 언제 것인지"가 첫 화면에 안 보였다. 시트(REV·DSH·KPI) 동기화가 멈췄을 때만 워크벤치 위에
  // 한 줄로 드러낸다. 별도 Suspense(fallback 없음)라 첫 바이트·워크벤치 스트리밍을 기다리게 하지 않는다.
  // 바깥 Suspense(기본 export)는 기본 담당자(로그인 사용자) 해석을 기다리는 경계, 안쪽 Suspense는
  // 프리페치 promise 를 푸는 use() 가 띠까지 붙잡지 않게 나눈 경계다(10월 줄기 + 09-25 띠 병합).
  //
  // 건별 시트(2026-11-23) — 워크벤치가 data-ledger-sheet 를 내면 이 래퍼가 화면 높이를 잡고(데스크톱), 띠가 있으면
  // 띠만큼 줄어든 나머지를 표가 채운다. 표는 그 안에서 스크롤하므로 머리·합계 행이 늘 보인다. 시트가 아닌
  // 렌즈·보기에서는 표식이 없어 지금처럼 본문이 길어지고 셸이 스크롤한다.
  return (
    <div className="flex flex-col lg:has-[[data-ledger-sheet]]:h-dvh">
      <Suspense fallback={null}>
        <SyncHealthBannerServer sources={["sheets"]} className="shrink-0 bg-[#FAFAF8] px-4 pt-3" />
      </Suspense>
      <Suspense fallback={<AdminRouteLoading />}>
        <SalesLedgerWorkbench initialPipeline={initialPipeline} defaultManager={defaultManager} initialBusinessDate={initialBusinessDate} />
      </Suspense>
    </div>
  )
}

export default function BranchSalesLedgerPage() {
  return <Suspense fallback={<AdminRouteLoading />}><PersonalSalesLedger /></Suspense>
}
