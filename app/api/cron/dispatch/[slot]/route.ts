import { NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/server/cron-auth"

import {
  NOTIFICATION_SCHEDULE_JOB_KEYS,
  utcSlotToKstHour,
  type NotificationScheduleJobKey,
  type LeadDailySchedule,
} from "@/lib/notifications/schedule"
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
 */

interface JobRunResult {
  job: NotificationScheduleJobKey
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slot: string }> }
) {
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
  let notificationSchedule
  try {
    ;({ notificationSchedule } = await getResolvedSettings())
  } catch {
    return NextResponse.json({ ok: false, error: "Notification settings unavailable." }, { status: 503 })
  }

  const due = NOTIFICATION_SCHEDULE_JOB_KEYS.filter(
    (job) => notificationSchedule[job].deliveryHourKst === kstHour
  )

  if (request.nextUrl.searchParams.get("dryRun") === "true") {
    try {
      const preview = due.length
        ? await previewLeadMorningBrief(new Date(), notificationSchedule.leadDaily)
        : null
      return NextResponse.json({ ok: true, dryRun: true, slot, kstHour, due, preview, ran: [] })
    } catch {
      return NextResponse.json({ ok: false, error: "Report preview unavailable." }, { status: 503 })
    }
  }

  // 순차 실행이다. 같은 슬롯의 잡이 늘어나도 하나가 느려서 다른 잡의 예산을
  // 먹는 편이, 병렬로 몰아 외부 웹훅 rate limit 을 건드리는 것보다 낫다.
  const ran: JobRunResult[] = []
  for (const job of due) {
    ran.push(await JOB_RUNNERS[job](notificationSchedule[job]))
  }

  const ok = ran.every((result) => result.status !== "failed")

  return NextResponse.json({ ok, slot, kstHour, ran }, { status: ok ? 200 : 500 })
}
