import "server-only"

// Home 연락 인덱스 로더 — 대상 키(lead:·neo:·customer:)별 마지막 사람 연락(원천·채널·작성자).
// 통합 고객 목록(crm-unified-customers)·오늘 연락(홈)·세그먼트 평가가 같은 정의를 쓰도록 한 곳에 둔다.
// 판정 규칙(무엇을 연락으로 치는가)은 lib/crm/last-contact.ts 가 정본이고, 이 파일은 읽기만 한다.

import {
  HOME_CONTACT_EVENT_SOURCE_TYPES,
  buildHomeContactIndex,
  type HomeContactEventRow,
  type HomeContactLogRow,
  type LastContactFact,
} from "@/lib/crm/last-contact"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { fetchSupabasePages } from "@/lib/supabase/pagination"

// Home 원천 두 테이블(lead_contact_logs · crm_customer_events 중 접촉 종류)을 세부(원천·채널·작성자)까지
// 읽는다. 시각만 필요한 기존 getCrmCustomerContactMaps(lib/repositories/crm-events.ts)는 최초 응답
// 판정의 정본이라 그대로 두고, 이 조회가 실패하면 그 시각 지도를 "Home 기록" 폴백으로 쓴다.
// 운영 실측(2026-09-24) 두 테이블 모두 수 행 규모라 이중 조회 비용은 작다.
const HOME_CONTACT_SCAN_MAX_ROWS = 20_000

export async function loadHomeContactIndex(): Promise<Map<string, LastContactFact>> {
  const sb = createSupabaseAdminClient()
  const [logs, events] = await Promise.all([
    fetchSupabasePages<HomeContactLogRow>({
      maxRows: HOME_CONTACT_SCAN_MAX_ROWS,
      fetchPage: (from, to) =>
        sb
          .from("lead_contact_logs")
          .select("id, lead_id, type, contacted_at, contacted_by", from === 0 ? { count: "exact" } : undefined)
          .order("contacted_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    }),
    fetchSupabasePages<HomeContactEventRow>({
      maxRows: HOME_CONTACT_SCAN_MAX_ROWS,
      fetchPage: (from, to) =>
        sb
          .from("crm_customer_events")
          .select(
            "id, target_type, target_id, source_type, occurred_at, created_by, owner_name",
            from === 0 ? { count: "exact" } : undefined
          )
          .in("source_type", [...HOME_CONTACT_EVENT_SOURCE_TYPES])
          .order("occurred_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    }),
  ])
  if (logs.error) throw new Error(`리드 연락 로그 조회 실패: ${logs.error.message ?? "unknown"}`)
  if (events.error) throw new Error(`CRM 연락 기록 조회 실패: ${events.error.message ?? "unknown"}`)
  // 상한에서 잘린 반쪽 결과로 "마지막 연락"을 만들지 않는다 — 호출부가 시각 지도 폴백으로 내린다.
  if (logs.truncated || events.truncated) throw new Error("연락 기록 스캔이 상한에 닿았습니다.")
  return buildHomeContactIndex(logs.data, events.data)
}
