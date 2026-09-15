import "server-only"

// Compass 제출 → public.leads 미러 오케스트레이터(설계 META-RECEIVER-FINAL §4-2 H6a, 설계 B §4-3).
//
// 이 파일은 H5(웹훅 compass 분기)가 after() 로 부를 **호출 계약만** 먼저 둔다. 본문(대상 수집·
// 신원 조회·빌더 조립·meta_lead_mirror_apply·부수효과·건강 경보·심장박동)은 H6a 가 채운다.
// 그 전에는 아무것도 쓰지 않고 not_implemented 를 돌려준다 — compass 모드는 DB 스위치를 사람이
// 바꿔야만 켜지고(기본 admin), 런북 P3 는 H1–H11 을 함께 배포한 뒤에만 shadow·compass 로 간다.

export type MetaLeadMirrorTrigger = "webhook" | "cron" | "admin"

export interface RunMetaLeadMirrorOptions {
  trigger: MetaLeadMirrorTrigger
  /** 이 leadgen 만 본다(webhook after() 경로) */
  leadgenIds?: string[]
  /** 제출 행이 보일 때까지 기다리는 최대 시간(ms) — webhook after() 경로 20초 */
  waitForCompassMs?: number
  /** 쓰기 없이 계산만 */
  dryRun?: boolean
}

export interface MetaLeadMirrorRunResult {
  status: "not_implemented"
  trigger: MetaLeadMirrorTrigger
  requested: number
}

export async function runMetaLeadMirror(options: RunMetaLeadMirrorOptions): Promise<MetaLeadMirrorRunResult> {
  const requested = options.leadgenIds?.length ?? 0
  console.warn(
    `[meta-lead-mirror] 미러 본문 미구현(H6a) — trigger=${options.trigger} requested=${requested}. 크론·폴백이 생기기 전에는 compass 모드로 바꾸지 않는다.`
  )
  return { status: "not_implemented", trigger: options.trigger, requested }
}
