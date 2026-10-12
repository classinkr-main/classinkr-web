import { NextRequest, NextResponse } from "next/server"

import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { readMetaLeadMirrorHealth } from "@/lib/meta/lead-mirror-health"
import {
  isMetaLeadgenForceAdmin,
  readMetaLeadgenCutover,
  type MetaLeadgenCutover,
} from "@/lib/meta/leadgen-cutover"
import { metaLeadFallbackStep } from "@/lib/server/meta-lead-fallback"
import { runMetaLeadMirrorCycle } from "@/lib/server/meta-lead-mirror"
import { buildMetaLeadParityReport, PARITY_MAX_DAYS } from "@/lib/server/meta-lead-parity"

export const maxDuration = 60

/**
 * Meta 리드애즈 단일 수신 — 관리(SUPER_ADMIN 전용). 설계 META-RECEIVER-FINAL §4-2 H8.
 * 운영 문서: docs/active/meta-leadgen-single-receiver-2026-09.md
 *
 * GET  — 전환 스위치(DB 한 행 + env 비상 스위치)·건강 지표·그림자 대조 보고(`?days=1..45`, 기본 7). 쓰기 없음.
 * POST — `{ "action": "run" | "dryRun" }` 크론과 같은 한 사이클(미러 → 폴백 → 건강 경보 → 심장박동 → 감사).
 *        dryRun 은 건수만 계산한다.
 *
 * 모드 전환(admin·shadow·compass)과 옵션 변경은 v1 에서 **SQL 함수로만** 한다(public.meta_leadgen_set_mode·
 * meta_leadgen_set_options, 서울 SQL Editor). 이 라우트는 그 함수를 부르지 않는다.
 * 응답에는 건수·식별자·시각만 싣는다(이름·전화·이메일 없음).
 */

const ADMIN_ROLES = ["SUPER_ADMIN"] as const
const RUN_BUDGET_MS = 45_000
const RUN_ACTIONS = new Set(["run", "dryRun"])

type SwitchSnapshot = {
  /** 웹훅이 지금 쓰는 모드 — env 비상 스위치가 켜져 있거나 DB 를 못 읽으면 admin */
  webhookMode: MetaLeadgenCutover["mode"]
  /** env META_LEADGEN_FORCE_ADMIN=1 여부(값 자체는 싣지 않는다) */
  forceAdmin: boolean
  cutover: MetaLeadgenCutover | null
  error?: string
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > 200 ? `${message.slice(0, 199)}…` : message
}

async function readSwitchSnapshot(): Promise<SwitchSnapshot> {
  const forceAdmin = isMetaLeadgenForceAdmin()
  try {
    const cutover = await readMetaLeadgenCutover()
    return { webhookMode: forceAdmin ? "admin" : cutover.mode, forceAdmin, cutover }
  } catch (error) {
    return { webhookMode: "admin", forceAdmin, cutover: null, error: errorMessage(error) }
  }
}

/** `?days=` — 없으면 기본(undefined), 1..45 정수가 아니면 null(400) */
function parseDays(raw: string | null): number | undefined | null {
  if (raw == null || raw === "") return undefined
  if (!/^\d{1,3}$/.test(raw)) return null
  const days = Number(raw)
  return days >= 1 && days <= PARITY_MAX_DAYS ? days : null
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, ADMIN_ROLES)
  if (admin instanceof NextResponse) return admin

  const days = parseDays(req.nextUrl.searchParams.get("days"))
  if (days === null) {
    return NextResponse.json({ error: `days must be an integer between 1 and ${PARITY_MAX_DAYS}` }, { status: 400 })
  }

  try {
    const [switchSnapshot, health, parity] = await Promise.all([
      readSwitchSnapshot(),
      readMetaLeadMirrorHealth(),
      buildMetaLeadParityReport(days === undefined ? {} : { days }),
    ])
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      switch: switchSnapshot,
      health: health.ok ? { ok: true, data: health.health } : { ok: false, error: health.error },
      parity,
    })
  } catch (error) {
    console.error("[GET /api/admin/meta-lead-mirror]", error instanceof Error ? error.name : "Error")
    return NextResponse.json({ error: "Failed to load Meta lead mirror status" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, ADMIN_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as { action?: unknown } | null
  const action = typeof body?.action === "string" ? body.action : ""
  if (!RUN_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: 'action must be "run" or "dryRun" (mode changes are SQL-only: public.meta_leadgen_set_mode)' },
      { status: 400 }
    )
  }
  const dryRun = action === "dryRun"

  try {
    const report = await runMetaLeadMirrorCycle({
      trigger: "admin",
      dryRun,
      deadlineAt: Date.now() + RUN_BUDGET_MS,
      fallback: metaLeadFallbackStep,
    })

    if (!dryRun) {
      await logAdminAudit({
        admin,
        action: "meta_lead_mirror.manual_run",
        targetType: "meta_lead_mirror",
        payload: {
          status: report.status,
          mode: report.mode,
          mirrorStatus: report.mirror.status,
          inserted: report.mirror.applied.inserted,
          skipped: report.mirror.applied.skipped,
          fallbackStatus: report.fallback?.status ?? null,
          fallbackChanged: report.fallback?.changed ?? 0,
          alerted: report.health?.alerted ?? [],
        },
      })
    }

    return NextResponse.json({ ok: report.status === "ok" || report.status === "skipped", action, report })
  } catch (error) {
    console.error("[POST /api/admin/meta-lead-mirror]", error instanceof Error ? error.name : "Error")
    return NextResponse.json({ error: "Meta lead mirror run failed" }, { status: 500 })
  }
}
