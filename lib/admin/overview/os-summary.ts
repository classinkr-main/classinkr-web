import "server-only"

import { unstable_cache } from "next/cache"

import { getNeoCrmCustomers } from "@/lib/admin-crm-customers-neo"
import { getCrmSourceLinkCoverage } from "@/lib/repositories/crm-source-links"
import { listHwOutbound, type HwOutbound } from "@/lib/repositories/branch-hw"
import { countPublishedPosts } from "@/lib/repositories/blog"
import { countPublicEvents } from "@/lib/repositories/public-events"
import { assertJsonSafeInDev } from "@/lib/server/json-safe"
// CRM 코어 소유 파일(lib/admin/crm/cache-tags.ts)의 상수를 읽기 전용으로 재사용한다 — 문자열을
// 여기 새로 박으면 crm/coverage 라우트와 태그가 조용히 갈라질 수 있다(둘 다 revalidateTag 대상).
import { ADMIN_OS_SUMMARY_CACHE_TAG } from "@/lib/admin/crm/cache-tags"

// /api/admin/os-summary 라우트와 Overview 서버 프리페치가 **같은** 집계를 공유하는 정본.
// 라우트에만 있던 시절에는 프리페치가 이 계산을 부를 수 없어 os 타일만 클라이언트 페치로 남았다.
// 사본을 만들면 캐시 키가 갈라지므로(같은 키를 두 곳에서 정의) 계산부 전체를 여기로 옮겼다.

const HW_BOARD_TARGET = 218
const BLOG_TARGET = 48
const EVENTS_TARGET = 12
const HW_BOARD_PATTERN = /86|IFP/i

// 진척(HW) 불변식: boards86은 "실제 판매 출고"만 집계한다 — 배송예정(planned)과
// Sample/Promotion/A-S 출고를 섞으면 타일이 부풀려진다. 아래 규칙은 재고 원장과 동일
// 규약의 사본이다(새 정규식 발명 금지):
//  - planned: lib/repositories/hardware-inventory.ts isPlannedStatus(:244-247)
//  - 샘플성 텍스트: 같은 파일 isSampleLikeText(:226-228, 시트 임포트가 type/remarks/
//    destination/progress에 적용하는 것과 동일 — :1177)
//  - 유형 토큰(Sales/Sample/Promotion/A/S): components/admin/hardware/
//    HardwareInventoryClient.tsx outboundSaleType과 동일 토큰 판정
const HW_PLANNED_PATTERN = /예정|예약|대기|planned/i
const HW_SAMPLE_LIKE_PATTERN = /샘플|대여|데모|demo|sample/i

type OsSummarySourceKey = "renewal" | "matching" | "hw" | "content" | "events"

interface OsSummarySourceHealth {
  status: "ready" | "error"
  error: string | null
}

const OS_SOURCE_ERROR: Record<OsSummarySourceKey, string> = {
  renewal: "리뉴얼 원천을 확인하지 못했습니다.",
  matching: "매칭 원천을 확인하지 못했습니다.",
  hw: "하드웨어 원천을 확인하지 못했습니다.",
  content: "블로그 원천을 확인하지 못했습니다.",
  events: "행사 원천을 확인하지 못했습니다.",
}

function sourceHealth(ok: boolean, key: OsSummarySourceKey): OsSummarySourceHealth {
  return { status: ok ? "ready" : "error", error: ok ? null : OS_SOURCE_ERROR[key] }
}

function isPlannedOutbound(row: HwOutbound) {
  return HW_PLANNED_PATTERN.test(row.progress ?? "")
}

function isSalesOutbound(row: HwOutbound) {
  const token = (row.type ?? "").trim().toLowerCase()
  if (token === "sample" || token === "promotion" || token === "a/s" || token === "as") return false
  if ([row.type, row.remarks, row.destination, row.progress].some((value) => HW_SAMPLE_LIKE_PATTERN.test(value ?? ""))) {
    return false
  }
  return true
}

// 콜드 미스 실측(2026-09-10, 로컬 dev 8,211ms) 원인 진단 — renewal·matching 두 소스가
// 유력한 지배 요인이다(git log상 이 파일·두 소스 모두 2026-09-04 감사 이후 코드 변경이 없어
// "회귀"가 아니라 "데이터가 늘어난 만큼 느려짐"으로 본다):
//  - renewal(getNeoCrmCustomers → listCrmNeoCustomerSnapshots)은 crm_neo_customer_snapshots를
//    select("*", {count:"exact"})로 최대 10,000행 읽고 risk_level·expire_at·source_synced_at
//    3열로 정렬해 expiringSoonCount 숫자 하나를 뽑는다. 자체 60초 캐시(lib/admin-crm-customers-
//    neo.ts:132)가 있지만 **process-local 변수**라 Vercel Fluid의 새 인스턴스마다 다시
//    처음부터 계산되고, 기존 인덱스(crm_neo_customer_snapshots_risk_due_idx)는 is_stale을
//    선두 컬럼에 두지 않아 리프레시마다 쌓이는 is_stale=true 이력 행이 늘수록 정렬 비용이
//    함께 늘어난다(정황 근거 — EXPLAIN 미실측. supabase/migrations/20260910_*.sql에 부분
//    인덱스 제안을 별도로 작성해 뒀다).
//  - matching(getCrmSourceLinkCoverage)은 crm_source_links·branch_rev_deals·crm_match_aliases
//    세 테이블을 fetchSupabasePages(테이블당 최대 1,000행/왕복, **순차** await)로 읽는다.
//    crm_source_links가 최근 되밀기 작업(hom_v4 CRM 되밀기 커밋들)으로 1,000행 경계를
//    넘어서면 왕복 횟수만큼 지연이 계단식으로 늘고, 이 함수 자체엔 캐시가 전혀 없다 —
//    /admin/crm/matching·/api/admin/crm/coverage 등 다른 소비처가 열릴 때도 매번 이 비용을
//    새로 낸다(coverage 라우트는 자기 몫만 60초 캐시하고 os-summary 몫은 캐시하지 않았다).
//    실제 쿼리·페이징 구조는 CRM 코어 소유라 이 파일에서 고치지 않는다(보고서 위임 요청 참고).
//
// 이 파일에서 할 수 있는 것: 원본 함수는 그대로 두고(재구현·사본 금지 — 판정 로직 드리프트
// 위험), 두 소스만 **아래에서 각각** unstable_cache로 한 번 더 감싸 "60초마다"가 아니라
// "5분마다"만 원가를 낸다. 리뉴얼 D-60 건수·링크 확정률은 분 단위로 요동치지 않는 운영
// 지표라 5분 지연은 안전하고, 매칭 쪽은 소스 링크 확정/해제/생성 뮤테이션이 이미
// ADMIN_OS_SUMMARY_CACHE_TAG를 revalidateTag하므로(app/api/admin/crm/coverage/route.ts 주석
// 참고) 사용자가 직접 바꾼 직후에는 이 캐시도 즉시 무효화된다 — 수동 조작 후 신선도는
// 그대로 유지된다. TTL만 올리는 미봉책과 다른 점은 "값이 실제로 느리게 변하는 두 소스만
// 선택적으로" 분리했다는 것 — 나머지 3소스는 여전히 (바깥 getCachedOsSummary의) 60초 그대로다.
const OS_SUMMARY_SLOW_SOURCE_REVALIDATE_SECONDS = 300

const getCachedRenewalSource = unstable_cache(
  async () => assertJsonSafeInDev("os-summary-renewal", await getNeoCrmCustomers()),
  ["admin-os-summary-renewal-v1"],
  {
    revalidate: OS_SUMMARY_SLOW_SOURCE_REVALIDATE_SECONDS,
    tags: [ADMIN_OS_SUMMARY_CACHE_TAG, "admin-os-summary-renewal"],
  }
)

const getCachedMatchingSource = unstable_cache(
  async () =>
    assertJsonSafeInDev(
      "os-summary-matching",
      // OS health가 DB 오류를 실제 0건으로 오인하지 않도록 이 소비처만 strict 모드로 읽는다.
      await getCrmSourceLinkCoverage({ throwOnError: true })
    ),
  ["admin-os-summary-matching-v1"],
  {
    revalidate: OS_SUMMARY_SLOW_SOURCE_REVALIDATE_SECONDS,
    tags: [ADMIN_OS_SUMMARY_CACHE_TAG, "admin-os-summary-matching"],
  }
)

// 운영 OS 요약 — 기존에 흩어진 운영 신호(리뉴얼/매칭/HW/콘텐츠/행사)를
// 읽기 전용으로 합성해 어드민 Overview 상단 요약 스트립에 노출한다.
// 한 소스가 실패해도 성공 소스는 살리되, 실패 값은 0이 아닌 null+source health로
// 내려 실제 0건과 구분한다. 전체 라우트를 500으로 묶지 않는 부분 격리 계약이다.
async function computeOsSummary() {
  const [renewalResult, matchingResult, hwResult, contentResult, eventsResult] =
    await Promise.allSettled([
      getCachedRenewalSource(),
      getCachedMatchingSource(),
      listHwOutbound(),
      // 블로그는 발행 수 하나만 쓰므로 전체 목록 로드 대신 count 전용 쿼리(head:true).
      countPublishedPosts(),
      // 행사도 숫자 하나만 쓰므로 긴 본문을 포함한 전체 행 대신 head count만 조회한다.
      countPublicEvents(),
    ])

  // Neo 조회는 네트워크 실패를 reject 대신 { ok:false }로 돌려줄 수 있으므로 둘 다 실패로 본다.
  const renewalOk = renewalResult.status === "fulfilled" && renewalResult.value.ok
  const matchingOk = matchingResult.status === "fulfilled"
  const hwOk = hwResult.status === "fulfilled"
  const contentOk = contentResult.status === "fulfilled"
  const eventsOk = eventsResult.status === "fulfilled"

  const expiringSoonCount = renewalOk ? renewalResult.value.summary.expiringSoonCount : null

  const matching =
    matchingOk
      ? matchingResult.value
      : { total: null, linked: null, needsReview: null, coveragePct: null }

  // boards86 = 실판매(비-planned) 수량 합, plannedBoards86 = 배송예정 판매 수량 합.
  // 샘플/프로모션/A-S 행은 둘 다에서 제외한다.
  const boardSalesRows =
    hwOk
      ? hwResult.value.filter((row) => HW_BOARD_PATTERN.test(row.product ?? "") && isSalesOutbound(row))
      : []
  const boards86 = hwOk
    ? boardSalesRows
        .filter((row) => !isPlannedOutbound(row))
        .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0)
    : null
  const plannedBoards86 = hwOk
    ? boardSalesRows
        .filter((row) => isPlannedOutbound(row))
        .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0)
    : null

  const blogPublished = contentOk ? contentResult.value : null

  const eventsCount = eventsOk ? eventsResult.value : null

  return {
    sources: {
      renewal: sourceHealth(renewalOk, "renewal"),
      matching: sourceHealth(matchingOk, "matching"),
      hw: sourceHealth(hwOk, "hw"),
      content: sourceHealth(contentOk, "content"),
      events: sourceHealth(eventsOk, "events"),
    },
    renewal: { expiringSoonCount },
    matching: {
      coveragePct: matching.coveragePct,
      linked: matching.linked,
      total: matching.total,
      needsReview: matching.needsReview,
    },
    hw: { boards86, plannedBoards86, target: HW_BOARD_TARGET },
    content: { blogPublished, target: BLOG_TARGET },
    events: { count: eventsCount, target: EVENTS_TARGET },
  }
}

/** 라우트 응답과 서버 프리페치가 공유하는 페이로드 계약(클라이언트는 타입만 참조). */
export type OsSummary = Awaited<ReturnType<typeof computeOsSummary>>

// 서버 메모이제이션(7-23 감사 3-A) — adminCachedJson은 브라우저 프라이빗 캐시 헤더만
// 붙이므로 유저마다·콜드미스마다 위 5개 무거운 repo 집계가 전부 재계산됐다.
// unstable_cache(60초)로 계산 결과(숫자 몇 개)를 요청·유저 간 공유한다.
// - createSupabaseAdminClient는 요청 무관(non-cookie) 서비스 롤 클라이언트라
//   unstable_cache 안에서 안전하다(lib/admin-crm-revenue.ts:1534 동일 논리).
// - allSettled 부분 실패(null+source health)도 최대 60초 캐시된 후 재계산된다.
//   장애 중 오염된 0을 표시하지 않고 UI에서 해당 원천을 재시도할 수 있다.
// - renewal·matching은 위 두 개의 내부 5분 캐시가 먼저 받으므로, 이 바깥 60초가 매번 만료돼도
//   그 안에서 실제 원가(수 초)를 내는 빈도는 5분에 한 번으로 줄어든다(2026-09-10). hw·content·
//   events 세 소스만 순수하게 60초마다 재계산된다.
export const getCachedOsSummary = unstable_cache(computeOsSummary, ["admin-os-summary-v3"], {
  revalidate: 60,
  tags: [ADMIN_OS_SUMMARY_CACHE_TAG],
})
