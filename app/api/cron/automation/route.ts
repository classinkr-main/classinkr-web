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
 *   2. 각 규칙의 마지막 실행 로그를 확인하여 실행 여부 결정
 *      - 일간 cron("0 9 * * *"): 마지막 실행이 23시간 이전이면 실행
 *      - 기타 cron 또는 로그 없음: 무조건 실행
 *   3. executeRule(rule.id) 호출 (규칙 단위 오류 격리)
 *   4. { ran, skipped, errors } 반환
 */

import { NextRequest, NextResponse } from "next/server"
import { executeRule } from "@/lib/automation-engine"
import {
  getActiveRulesByTrigger,
  getAllLogs,
} from "@/lib/repositories/automation"
import type { AutomationRule } from "@/lib/automation-types"

const DAILY_CRON = "0 9 * * *"
const TWENTY_THREE_HOURS_MS = 23 * 60 * 60 * 1000

/**
 * 규칙이 지금 실행되어야 하는지 판단.
 * 일간 cron 이면 마지막 실행 후 23시간 경과 여부 확인.
 * 그 외 cron 이거나 로그가 전혀 없으면 실행.
 */
async function isDue(rule: AutomationRule): Promise<boolean> {
  const triggerConfig = rule.triggerConfig

  // scheduled 타입이 아닌 경우 방어적 skip
  if (triggerConfig.type !== "scheduled") return false

  const cron = triggerConfig.cron

  // 일간 cron 이 아닌 경우 — 단순히 실행 (복잡한 cron 파싱 없이)
  if (cron !== DAILY_CRON) return true

  // 일간 cron: 마지막 성공 로그 기준 23시간 경과 확인
  try {
    const logs = await getAllLogs(rule.id)
    if (logs.length === 0) return true

    // 가장 최근 로그 (getAllLogs는 triggered_at DESC 정렬)
    const lastLog = logs[0]
    const lastRanAt = new Date(lastLog.triggeredAt).getTime()
    const elapsed = Date.now() - lastRanAt

    return elapsed > TWENTY_THREE_HOURS_MS
  } catch {
    // 로그 조회 실패 시 안전하게 실행
    return true
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── 인증 ──────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET 환경변수가 설정되지 않았습니다." },
      { status: 401 }
    )
  }

  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${cronSecret}`) {
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

  if (rules.length === 0) {
    return NextResponse.json({ ran: 0, skipped: 0, errors: [] })
  }

  // ── 규칙별 실행 ───────────────────────────────────────────
  let ran = 0
  let skipped = 0
  const errors: string[] = []

  await Promise.allSettled(
    rules.map(async (rule) => {
      try {
        const due = await isDue(rule)
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

  console.log(`[cron/automation] 완료 — ran=${ran}, skipped=${skipped}, errors=${errors.length}`)

  return NextResponse.json({ ran, skipped, errors })
}
