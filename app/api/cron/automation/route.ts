/**
 * ─────────────────────────────────────────────────────────────
 * /api/cron/automation  —  Vercel Cron: scheduled 규칙 실행
 * ─────────────────────────────────────────────────────────────
 *
 * Vercel Cron이 매일 오전 9시(UTC)에 호출.
 * Authorization: Bearer ${CRON_SECRET} 헤더로 인증.
 *
 * 실행 흐름:
 *   1. trigger_type = 'scheduled' 인 active 규칙 전체 조회
 *   2. 규칙마다 실행 여부 결정
 *      - 규칙의 cron 식이 가리키는 날이 오늘(UTC)이 아니면 건너뜀(매주·매월 규칙)
 *      - 마지막 실행이 23시간 안이면 건너뜀
 *      - 읽지 못하는 식은 실행하지 않고 errors 에 싣는다
 *   3. executeRule(rule.id) 호출 (규칙 단위 오류 격리)
 *   4. { ran, skipped, errors } 반환
 */

import { NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/server/cron-auth"
import { executeRule, executeDelayQueueItem } from "@/lib/automation-engine"
import {
  getActiveRulesByTrigger,
  getAllLogs,
} from "@/lib/repositories/automation"
import {
  claimDelayItem,
  getDueDelayItems,
  updateDelayItemStatus,
} from "@/lib/repositories/automation-delay"
import { matchScheduledDay } from "@/lib/automation-schedule"
import type { AutomationRule } from "@/lib/automation-types"

export const maxDuration = 300

/** 지연 큐에 쓰는 시간 — 넘기면 남은 항목은 pending 으로 두고 다음 실행이 이어 간다. */
const DELAY_QUEUE_BUDGET_MS = 120_000
/** 한 번에 동시에 보내는 지연 발송 수. */
const DELAY_QUEUE_CONCURRENCY = 5

const TWENTY_THREE_HOURS_MS = 23 * 60 * 60 * 1000

/**
 * 규칙이 지금 실행되어야 하는지 판단.
 *  1) 규칙의 cron 식이 가리키는 날이 오늘(UTC)인가 — "매주 월요일"·"매월 1일" 규칙은 그날에만 돈다.
 *  2) 마지막 실행 뒤 23시간이 지났는가 — 같은 날 크론이 두 번 깨도 한 번만 보낸다.
 * 읽지 못하는 식은 보내지 않고 오류로 알린다(예전에는 "매일 09시"가 아닌 식은 무조건 실행해 매일 발송됐다).
 */
async function isDue(rule: AutomationRule, now: Date): Promise<boolean> {
  const triggerConfig = rule.triggerConfig

  // scheduled 타입이 아닌 경우 방어적 skip
  if (triggerConfig.type !== "scheduled") return false

  const dayMatch = matchScheduledDay(triggerConfig.cron, now)
  if (dayMatch === "unsupported") {
    throw new Error(`지원하지 않는 예약 식이라 실행하지 않았습니다: "${triggerConfig.cron}"`)
  }
  if (dayMatch === "not_due") return false

  try {
    const logs = await getAllLogs(rule.id)
    if (logs.length === 0) return true

    // 가장 최근 로그 (getAllLogs는 triggered_at DESC 정렬)
    const lastLog = logs[0]
    const lastRanAt = new Date(lastLog.triggeredAt).getTime()
    const elapsed = now.getTime() - lastRanAt
    return elapsed > TWENTY_THREE_HOURS_MS
  } catch {
    // 로그 조회 실패 시 안전하게 실행
    return true
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── 인증 ──────────────────────────────────────────────────
  // 인증은 아래 CRON_SECRET Bearer 하나뿐이다 — Vercel 이 크론에 붙이는 건 그 헤더이지
  // x-vercel-cron 이 아니다. 근거는 app/api/cron/sync-branch/route.ts 주석 참조. (2026-08-28)
  // 비교는 lib/server/cron-auth 의 timing-safe 헬퍼로 한다.

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

  // ── scheduled 규칙 조회 ───────────────────────────────────
  let rules: AutomationRule[]
  try {
    rules = await getActiveRulesByTrigger("scheduled")
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[cron/automation] 규칙 조회 실패:", message)
    return NextResponse.json(
      { error: "규칙 조회 중 오류가 발생했습니다.", detail: message },
      { status: 500 }
    )
  }

  // ── 규칙별 실행 ───────────────────────────────────────────
  const runStartedAt = new Date()
  let ran = 0
  let skipped = 0
  const errors: string[] = []

  await Promise.allSettled(
    rules.map(async (rule) => {
      try {
        const due = await isDue(rule, runStartedAt)
        if (!due) {
          skipped++
          return
        }

        const result = await executeRule(rule.id)
        ran++

        if (result.status === "failed") {
          errors.push(`[${rule.id}] ${rule.name}: 발송 실패 (logId=${result.logId})`)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push(`[${rule.id}] ${rule.name}: ${message}`)
      }
    })
  )

  console.log(`[cron/automation] scheduled 완료 — ran=${ran}, skipped=${skipped}, errors=${errors.length}`)

  // ── delay 큐 처리 ─────────────────────────────────────────
  let delayProcessed = 0
  let delayFailed = 0
  const delayErrors: string[] = []

  let delaySkipped = 0
  let delayDeferred = 0
  try {
    const dueItems = await getDueDelayItems()
    const delayStartedAt = Date.now()

    for (let index = 0; index < dueItems.length; index += DELAY_QUEUE_CONCURRENCY) {
      if (Date.now() - delayStartedAt > DELAY_QUEUE_BUDGET_MS) {
        delayDeferred = dueItems.length - index
        console.warn(`[cron/automation] delay 큐 시간 예산 초과 — ${delayDeferred}건은 다음 실행으로 넘깁니다`)
        break
      }
      await Promise.allSettled(
        dueItems.slice(index, index + DELAY_QUEUE_CONCURRENCY).map(async (item) => {
          // 보내기 전에 선점한다 — 겹친 실행·재전달이 이미 가져간 항목은 건너뛴다.
          // 선점 자체가 실패하면 상태를 건드리지 않는다(pending 그대로 — 다음 실행이 다시 본다).
          let claimed = false
          try {
            claimed = await claimDelayItem(item.id)
          } catch (err) {
            delayErrors.push(`[${item.id}] ${err instanceof Error ? err.message : String(err)}`)
            return
          }
          if (!claimed) {
            delaySkipped++
            return
          }
          try {
            await executeDelayQueueItem(item.ruleId, item.recipientData)
            await updateDelayItemStatus(item.id, "sent")
            delayProcessed++
            console.log(`[cron/automation] delay 큐 발송 완료 — id=${item.id}`)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            await updateDelayItemStatus(item.id, "failed", message).catch(() => {
              // 상태 업데이트 실패는 무시하고 오류만 기록
            })
            delayFailed++
            delayErrors.push(`[${item.id}] ${message}`)
            console.error(`[cron/automation] delay 큐 발송 실패 — id=${item.id}:`, message)
          }
        })
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[cron/automation] delay 큐 조회 실패:", message)
    delayErrors.push(`delay 큐 조회 오류: ${message}`)
  }

  console.log(
    `[cron/automation] delay 큐 완료 — processed=${delayProcessed}, failed=${delayFailed}`
  )

  return NextResponse.json({
    ran,
    skipped,
    errors,
    delay: { processed: delayProcessed, failed: delayFailed, skipped: delaySkipped, deferred: delayDeferred, errors: delayErrors },
  })
}
