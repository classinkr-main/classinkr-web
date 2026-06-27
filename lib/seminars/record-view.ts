import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export interface SeminarViewRecord {
  slug: string
  userId: string | null
  leadId: string | null
  anonymousId: string | null
}

/**
 * 회원 행사 영상 시청을 사용자 연결 감사 로그로 남긴다.
 *
 * 시청은 "다운로드"가 아니므로 material_downloads 에는 쓰지 않는다. 그 테이블은
 * /account "받은 자료", CRM 다운로드 배지(getLeadsActivitySummary), 리드 타임라인의
 * 소스라서 시청 기록을 섞으면 다운로드로 오집계되고, /account 재다운로드 링크
 * (/api/materials/<slug>/download)가 seminar 슬러그에 대해 깨진다.
 *
 * 다운로드 플로우(lib/materials.ts)와 동일한 패턴으로 client_events 에 서버측
 * user_id 연결 행을 남겨 "어떤 회원이 어떤 영상을 봤는지"를 추적한다.
 */
export async function recordSeminarView({
  slug,
  userId,
  leadId,
  anonymousId,
}: SeminarViewRecord): Promise<boolean> {
  const supabase = createSupabaseAdminClient()

  const { error: eventError } = await supabase.from("client_events").insert({
    event_name: "view_demo_video",
    page: "/events/videos",
    params: { source: "seminar", seminar: slug },
    anonymous_id: anonymousId,
    lead_id: leadId,
    user_id: userId,
  })

  if (eventError) {
    console.warn("[seminars] client_events insert failed:", eventError.message)
    return false
  }

  return true
}
