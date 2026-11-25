import { NextRequest, NextResponse } from "next/server"

import {
  isInternalCsAssetStorageDeleted,
  listInternalCsAssetsPastRetention,
  purgeInternalCsAssetObject,
} from "@/lib/repositories/internal-cs-chat"
import { checkCronAuth } from "@/lib/server/cron-auth"

export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000
const BATCH_LIMIT = 100

/**
 * 내부 CS 캡처 보관 기간 정리.
 *
 * 기본은 꺼짐이다. INTERNAL_CS_ASSET_RETENTION_DAYS(양의 정수, 일)가 없거나 올바르지 않으면 아무것도 지우지 않는다.
 * 보관 기간은 개인정보처리방침과 맞춰 사람이 정하는 값이다(docs: cs-syn 결정 13).
 * 지우는 것은 원본 이미지 객체뿐이다. 행에는 지운 시각을 남기고 파일 이름·OCR 추출문은 비운다.
 * 등록: vercel.json crons 에 { "path": "/api/cron/internal-cs-retention", "schedule": "…" } 한 줄 — 이 라우트는 등록하지 않는다.
 * 인증은 `Authorization: Bearer ${CRON_SECRET}` 하나뿐이다.
 */
function parseRetentionDays(raw: string | undefined) {
  const value = raw?.trim()
  if (!value || !/^\d{1,5}$/.test(value)) return null
  const days = Number(value)
  return days >= 1 ? days : null
}

export async function GET(req: NextRequest) {
  const authResult = checkCronAuth(req)
  if (authResult === "missing_secret") {
    return NextResponse.json({ error: "CRON_SECRET 환경변수가 설정되지 않았습니다." }, { status: 401 })
  }
  if (authResult !== "ok") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const days = parseRetentionDays(process.env.INTERNAL_CS_ASSET_RETENTION_DAYS)
  if (days == null) {
    return NextResponse.json({ ok: true, enabled: false, deleted: 0 })
  }

  const now = new Date()
  const cutoff = new Date(now.getTime() - days * DAY_MS)
  let deleted = 0
  let failed = 0
  try {
    const candidates = await listInternalCsAssetsPastRetention({ cutoff, limit: BATCH_LIMIT })
    for (const asset of candidates) {
      // 목록 조회가 이미 걸러 주지만, 지우는 동작이라 한 번 더 확인한다.
      if (isInternalCsAssetStorageDeleted(asset)) continue
      if (new Date(asset.created_at).getTime() >= cutoff.getTime()) continue
      try {
        const purged = await purgeInternalCsAssetObject({
          assetId: asset.id,
          conversationId: asset.conversation_id,
          actor: "cron:internal-cs-retention",
          reason: "retention",
          now,
        })
        if (purged) deleted += 1
      } catch (error) {
        failed += 1
        console.error("[cron/internal-cs-retention] purge failed:", error instanceof Error ? error.name : "Error")
      }
    }
    return NextResponse.json({ ok: failed === 0, enabled: true, retentionDays: days, deleted, failed }, { status: failed === 0 ? 200 : 500 })
  } catch (error) {
    console.error("[cron/internal-cs-retention] failed:", error instanceof Error ? error.name : "Error")
    return NextResponse.json({ ok: false, enabled: true, deleted, error: "retention run failed" }, { status: 500 })
  }
}
