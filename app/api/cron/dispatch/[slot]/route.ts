import { NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/server/cron-auth"

import {
  NOTIFICATION_SCHEDULE_JOB_KEYS,
  utcSlotToKstHour,
  type NotificationSchedule,
  type NotificationScheduleJobKey,
  type LeadDailySchedule,
} from "@/lib/notifications/schedule"
import { CRM_SEGMENT_DAILY_UTC_SLOT, segmentDailyTimeBudgetMs } from "@/lib/crm/saved-segments"
import { HARDWARE_PROCESS_ALERT_UTC_SLOT } from "@/lib/hardware/process-alerts"
import { getResolvedSettings } from "@/lib/repositories/settings"
import { previewLeadMorningBrief, sendLeadMorningBrief } from "@/lib/server/lead-morning-brief"

export const maxDuration = 60

/**
 * 시간 슬롯 크론 — vercel.json 이 UTC 시간대마다 이 경로를 하루 한 번씩 깨운다
 * (`/api/cron/dispatch/02` = `0 2 * * *`). 어떤 잡을 실제로 돌릴지는 여기서
 * site_settings 의 스케줄을 읽어 정한다. 그래서 발송 시각을 바꿀 때 배포가 필요없다.
 *
 * Vercel Hobby 는 크론 경로당 하루 1회만 허용하고 트리거 정확도가 ±59분이다.
 * 그래서 슬롯이 "시" 단위이고, 분은 예약할 수 없다.
 *
 * 인증은 `Authorization: Bearer ${CRON_SECRET}` 하나뿐이다 — Vercel 이 크론에
 * 붙이는 게 그 헤더이지 x-vercel-cron 이 아니다(AGENTS.md 배포/Cron 안전 규칙).
 *
 * 중복 발송은 각 잡이 자기 원장으로 막는다. 아침 카드는 lead_digest_runs 의
 * 창(window) 단위 claim 이라 같은 슬롯이 재시도돼도 한 번만 나간다.
 *
 * 고정 슬롯 잡(설정과 무관하게 정해진 시각): UTC 21(= KST 06시)에 저장 세그먼트 매일 평가 + 자동 태그
 * (crmSegmentsDaily, 세그먼트 허브 C안 ② 2026-09-25)가 알림 잡 뒤에 순차로 돈다 — 새 크론·vercel.json 변경 없이
 * 편승한다. 다른 슬롯에서는 그 모듈을 불러오지도 않는다(동적 import). 멱등(일별 PK upsert·그룹 키 중복 skip·
 * 마커 행만 떼기)이라 재시도돼도 같은 결과로 수렴한다.
 *  - 잡별 격리: 세그먼트 잡은 알림 설정(site_settings)을 쓰지 않는다. 그래서 슬롯 21 에서 설정 읽기가 실패해도
 *    알림 잡만 건너뛰고(ran 에 notificationSettings failed — 응답 500) 세그먼트 잡은 돈다. 다른 슬롯은 예전처럼 503.
 *    dryRun 도 같다(알림 미리보기가 실패해도 segmentsPreview 는 싣는다).
 *  - 시간 예산: 세그먼트 잡에는 요청 시작 기준 남은 시간(segmentDailyTimeBudgetMs — 앞선 아침 카드 시간을 뺀다)을
 *    넘겨, 같은 슬롯의 앞 잡이 오래 걸려도 maxDuration(60초) 안에서 뒤쪽 쓰기(일별 기록·last_*)까지 끝나게 한다.
 *
 * 고정 슬롯 잡 둘째: UTC 23(= KST 08시)에 하드웨어 일일 알림(hardwareProcessAlerts — 배송 예정 30일 경과·샘플 반납
 * 예정일 지남, 담당자별 한 통, docs/active/hardware-inventory-process-gap-2026-10-28.md §6 D9). 세그먼트 잡과 같은
 * 격리 규칙(설정 실패와 묶지 않음·동적 import·dryRun 은 hardwareAlertsPreview)을 따른다. 같은 날 두 번 보내지 않는다
 * (lib/server/hardware-process-alerts.ts — 그날 발송 성공 기록이 있으면 already_sent).
 */

type DispatchJobKey =
  | NotificationScheduleJobKey
  | "crmSegmentsDaily"
  | "hardwareProcessAlerts"
  | "notificationSettings"

const SETTINGS_UNAVAILABLE_ERROR = "Notification settings unavailable."
const PREVIEW_UNAVAILABLE_ERROR = "Report preview unavailable."

interface JobRunResult {
  job: DispatchJobKey
  status: string
  error?: string
  detail?: unknown
}

function parseSlot(raw: string) {
  if (!/^\d{1,2}$/.test(raw)) return null
  const slot = Number(raw)
  return slot >= 0 && slot <= 23 ? slot : null
}

async function runLeadDaily(schedule: LeadDailySchedule): Promise<JobRunResult> {
  try {
    const report = await sendLeadMorningBrief(new Date(), schedule)
    return { job: "leadDaily", status: report.status, detail: report }
  } catch (error) {
    // 외부 오류에 웹훅 주소가 포함되어도 응답·로그로 노출하지 않는다.
    console.error("[cron/dispatch] leadDaily failed:", error instanceof Error ? error.name : "Error")
    return { job: "leadDaily", status: "failed", error: "Lead daily report failed." }
  }
}

const JOB_RUNNERS: Record<NotificationScheduleJobKey, (schedule: LeadDailySchedule) => Promise<JobRunResult>> = {
  leadDaily: runLeadDaily,
}

/**
 * 저장 세그먼트 매일 평가 + 자동 태그. 표 미적용·세그먼트 없음은 skipped(실패 아님), 평가가 던지면 failed.
 * 응답에는 요약만 싣는다(세그먼트 이름·건수·상태 — 회원 키·연락처 없음). 오류는 이름만 로그로 남긴다.
 */
async function runCrmSegmentsDailyJob(dryRun: boolean, requestStartedAt: number): Promise<JobRunResult> {
  try {
    const { runCrmSegmentDaily } = await import("@/lib/server/crm-segment-daily")
    const report = await runCrmSegmentDaily({
      trigger: "cron",
      dryRun,
      timeBudgetMs: segmentDailyTimeBudgetMs(Date.now() - requestStartedAt),
    })
    return {
      job: "crmSegmentsDaily",
      status: report.status,
      detail: {
        reason: report.reason ?? null,
        dryRun: report.dryRun,
        snapshotDate: report.snapshotDate,
        daily: report.daily,
        durationMs: report.durationMs,
        segments: report.segments.map((segment) => ({
          id: segment.id,
          name: segment.name,
          total: segment.total,
          flags: segment.flags,
          autoTagStatus: segment.autoTagStatus,
          tagged: segment.tagged,
          untagged: segment.untagged,
          failed: segment.failed,
          blockedUntag: segment.blockedUntag ?? false,
        })),
      },
    }
  } catch (error) {
    console.error("[cron/dispatch] crmSegmentsDaily failed:", error instanceof Error ? error.name : "Error")
    return { job: "crmSegmentsDaily", status: "failed", error: "CRM segments daily job failed." }
  }
}

/**
 * 하드웨어 일일 알림. 보낼 건이 없으면 empty, 그날 이미 나갔으면 already_sent(둘 다 실패 아님).
 * 응답에는 건수·담당자별 건수만 싣는다(dryRun 은 보낼 메시지 미리보기 포함). 오류는 이름만 로그로 남긴다.
 */
async function runHardwareProcessAlertsJob(dryRun: boolean): Promise<JobRunResult> {
  try {
    const { runHardwareProcessAlerts } = await import("@/lib/server/hardware-process-alerts")
    const report = await runHardwareProcessAlerts({ dryRun })
    return { job: "hardwareProcessAlerts", status: report.status, detail: report }
  } catch (error) {
    console.error("[cron/dispatch] hardwareProcessAlerts failed:", error instanceof Error ? error.name : "Error")
    return { job: "hardwareProcessAlerts", status: "failed", error: "Hardware process alerts failed." }
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slot: string }> }
) {
  // 세그먼트 잡의 시간 예산은 요청 시작 기준(maxDuration 은 요청 전체에 걸린다).
  const requestStartedAt = Date.now()
  // 비교는 lib/server/cron-auth 의 timing-safe 헬퍼로 한다(다른 크론 라우트와 같은 판정).
  const authResult = checkCronAuth(request)
  if (authResult === "missing_secret") {
    return NextResponse.json(
      { error: "CRON_SECRET 환경변수가 설정되지 않았습니다." },
      { status: 401 }
    )
  }
  if (authResult !== "ok") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { slot: rawSlot } = await context.params
  const slot = parseSlot(rawSlot)
  if (slot === null) {
    return NextResponse.json(
      { error: `슬롯은 00-23 사이여야 합니다: "${rawSlot}"` },
      { status: 400 }
    )
  }

  const kstHour = utcSlotToKstHour(slot)
  const runsSegments = slot === CRM_SEGMENT_DAILY_UTC_SLOT
  const runsHardwareAlerts = slot === HARDWARE_PROCESS_ALERT_UTC_SLOT
  // 고정 슬롯 잡이 있는 슬롯 — 알림 설정이 없어도 고정 잡은 돈다.
  const runsFixedJobs = runsSegments || runsHardwareAlerts

  // 알림 설정 — 알림 잡만 쓴다. 고정 슬롯 잡(세그먼트)은 설정과 무관하므로 설정 실패에 묶지 않는다.
  let notificationSchedule: NotificationSchedule | null = null
  try {
    ;({ notificationSchedule } = await getResolvedSettings())
  } catch {
    notificationSchedule = null
  }
  if (!notificationSchedule && !runsFixedJobs) {
    return NextResponse.json({ ok: false, error: SETTINGS_UNAVAILABLE_ERROR }, { status: 503 })
  }

  const schedule = notificationSchedule
  const due = schedule
    ? NOTIFICATION_SCHEDULE_JOB_KEYS.filter((job) => schedule[job].deliveryHourKst === kstHour)
    : []

  if (request.nextUrl.searchParams.get("dryRun") === "true") {
    let preview: Awaited<ReturnType<typeof previewLeadMorningBrief>> | null = null
    let previewError: string | null = schedule ? null : SETTINGS_UNAVAILABLE_ERROR
    if (schedule && due.length) {
      try {
        preview = await previewLeadMorningBrief(new Date(), schedule.leadDaily)
      } catch {
        previewError = PREVIEW_UNAVAILABLE_ERROR
      }
    }
    if (previewError && !runsFixedJobs) {
      return NextResponse.json({ ok: false, error: previewError }, { status: 503 })
    }
    // 세그먼트 자동 태그 미리보기(쓰기 0) — 서로 막지 않는다: 알림 미리보기가 실패해도 싣고, 세그먼트 미리보기
    // 실패는 잡 결과에 failed 로만.
    const segmentsPreview = runsSegments ? await runCrmSegmentsDailyJob(true, requestStartedAt) : undefined
    const hardwareAlertsPreview = runsHardwareAlerts ? await runHardwareProcessAlertsJob(true) : undefined
    return NextResponse.json(
      {
        ok: !previewError,
        dryRun: true,
        slot,
        kstHour,
        due,
        preview,
        ...(previewError ? { error: previewError } : {}),
        ...(segmentsPreview ? { segmentsPreview } : {}),
        ...(hardwareAlertsPreview ? { hardwareAlertsPreview } : {}),
        ran: [],
      },
      { status: previewError ? 503 : 200 }
    )
  }

  // 순차 실행이다. 같은 슬롯의 잡이 늘어나도 하나가 느려서 다른 잡의 예산을
  // 먹는 편이, 병렬로 몰아 외부 웹훅 rate limit 을 건드리는 것보다 낫다.
  const ran: JobRunResult[] = []
  if (schedule) {
    for (const job of due) {
      ran.push(await JOB_RUNNERS[job](schedule[job]))
    }
  } else {
    // 고정 잡 슬롯(21·23)에서만 여기 온다 — 알림 잡은 어떤 게 오늘 차례인지 몰라 건너뛰고 실패로 남긴다(응답 500).
    ran.push({ job: "notificationSettings", status: "failed", error: SETTINGS_UNAVAILABLE_ERROR })
  }
  // 고정 슬롯 잡 — 알림 잡 뒤에(각자 try/catch 로 격리). 예산은 요청 시작 기준 남은 시간.
  if (runsSegments) ran.push(await runCrmSegmentsDailyJob(false, requestStartedAt))
  if (runsHardwareAlerts) ran.push(await runHardwareProcessAlertsJob(false))

  const ok = ran.every((result) => result.status !== "failed")

  return NextResponse.json({ ok, slot, kstHour, ran }, { status: ok ? 200 : 500 })
}
