import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export interface SeminarViewRecord {
  slug: string
  userId: string | null
  leadId: string | null
  anonymousId: string | null
}

/**
 * 회원 행사 영상 시청을 감사 로그로 남긴다.
 * 기존 material_downloads 테이블을 재사용하되 material_slug 를 "seminar:" 네임스페이스로
 * 구분하고 gate_type='login', source='seminar' 로 기록한다.
 */
export async function recordSeminarView({
  slug,
  userId,
  leadId,
  anonymousId,
}: SeminarViewRecord): Promise<boolean> {
  const supabase = createSupabaseAdminClient()

  const { error: downloadError } = await supabase.from("material_downloads").insert({
    material_slug: `seminar:${slug}`,
    user_id: userId,
    lead_id: leadId,
    anonymous_id: anonymousId,
    gate_type: "login",
    source: "seminar",
    post_slug: slug,
  })

  if (downloadError) {
    console.warn("[seminars] material_downloads insert failed:", downloadError.message)
    return false
  }

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
  }

  return true
}
