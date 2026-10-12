import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { readStoredSegmentFilter } from "@/lib/crm/customer-segment-filter"
import type { SavedSegmentRunResponse } from "@/lib/crm/saved-segment-api"
import {
  SAVED_SEGMENT_AUTO_TAG_LABEL_MAX,
  canManageSavedSegmentAutoTag,
  isSavedSegmentVisibleTo,
} from "@/lib/crm/saved-segments"
import { normalizeTag } from "@/lib/crm/tag-suggestions"
import { SAVED_SEGMENTS_NOT_READY_MESSAGE, getSavedSegment } from "@/lib/repositories/crm-saved-segments"
import { runCrmSegmentDaily } from "@/lib/server/crm-segment-daily"

import {
  isSegmentId,
  readJsonObject,
  segmentNotFoundResponse,
  segmentViewer,
  segmentWriteErrorResponse,
} from "../../segment-response"

// POST /api/admin/crm/segments/[id]/run — 저장 세그먼트 지금 평가 + 자동 태그(세그먼트 허브, C안 ②, 2026-09-25).
//
// 본문 {dryRun?: boolean, autoTag?: {label?, untag?}}
//  - dryRun(기본 true — 본문에 dryRun:false 가 있어야 적용): 역할 CRM_STAFF. 쓰기 0 — 붙일·뗄 예정 수와 가드 상태만.
//    자동 태그가 꺼져 있어도 켰다고 치고 미리본다("켜기 전 미리보기"). autoTag.label·untag 로 켤 설정을 미리 넘길 수
//    있다(생략하면 저장된 설정).
//  - 적용(dryRun:false): 관리자(SUPER_ADMIN·ADMIN)만, 편집할 수 있는 세그먼트만. 오늘 일별 기록(run_trigger manual)을
//    덮어쓰고, 자동 태그가 켜져 있으면 크론과 같은 가드로 붙이고(뗀다). 감사 로그 crm.segments.auto_tag.run.
// 응답: SavedSegmentRunResponse(lib/crm/saved-segment-api.ts) + blockedUntag(옵셔널) · daily(일별 기록 결과).

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteContext) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  if (!isSegmentId(id)) return NextResponse.json({ error: "세그먼트 id 형식이 올바르지 않습니다." }, { status: 400 })

  const body = (await readJsonObject(req)) ?? {}
  const dryRun = body.dryRun !== false

  // 드라이런 미리보기용 자동 태그 설정(선택).
  let simulate: { label?: string | null; untag?: boolean } | undefined
  if (dryRun) {
    simulate = {}
    const rawAutoTag = body.autoTag
    if (rawAutoTag !== undefined && rawAutoTag !== null) {
      if (typeof rawAutoTag !== "object" || Array.isArray(rawAutoTag)) {
        return NextResponse.json({ error: "자동 태그 설정 형식이 올바르지 않습니다." }, { status: 400 })
      }
      const { label, untag } = rawAutoTag as Record<string, unknown>
      if (label !== undefined && label !== null) {
        if (typeof label !== "string") return NextResponse.json({ error: "자동 태그 라벨 형식이 올바르지 않습니다." }, { status: 400 })
        const trimmed = label.trim().replace(/\s+/g, " ")
        if (trimmed.length > SAVED_SEGMENT_AUTO_TAG_LABEL_MAX) {
          return NextResponse.json(
            { error: `자동 태그 라벨은 ${SAVED_SEGMENT_AUTO_TAG_LABEL_MAX}자 이하로 적어 주세요.` },
            { status: 400 }
          )
        }
        if (trimmed) simulate.label = normalizeTag(trimmed)
      }
      if (untag !== undefined) {
        if (typeof untag !== "boolean") return NextResponse.json({ error: "자동 떼기 값이 올바르지 않습니다." }, { status: 400 })
        simulate.untag = untag
      }
    }
  }

  try {
    const viewer = segmentViewer(admin)
    const segment = await getSavedSegment(id)
    if (!segment || !isSavedSegmentVisibleTo(segment, viewer)) return segmentNotFoundResponse()
    if (segment.archivedAt) {
      return NextResponse.json({ error: "보관된 세그먼트는 실행할 수 없습니다. 먼저 복구해 주세요." }, { status: 409 })
    }
    if (!dryRun && !canManageSavedSegmentAutoTag(segment, viewer)) {
      return NextResponse.json({ error: "자동 태그 적용 실행은 관리자만 할 수 있습니다." }, { status: 403 })
    }
    if (!readStoredSegmentFilter(segment.spec, segment.specVersion).readable) {
      return NextResponse.json(
        { error: "이 세그먼트는 새 판 조건으로 저장돼 이 배포에서 평가할 수 없습니다." },
        { status: 409 }
      )
    }

    const report = await runCrmSegmentDaily({
      trigger: "manual",
      segmentIds: [id],
      dryRun,
      simulateAutoTag: simulate,
    })
    if (report.status === "skipped" && report.reason === "not_ready") {
      return NextResponse.json({ error: SAVED_SEGMENTS_NOT_READY_MESSAGE }, { status: 503 })
    }
    const outcome = report.segments.find((segment) => segment.id === id)
    if (report.status === "failed" || !outcome) {
      return NextResponse.json({ error: "세그먼트를 평가하지 못했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: 500 })
    }

    if (!dryRun) {
      await logAdminAudit({
        admin,
        action: "crm.segments.auto_tag.run",
        targetType: "crm_saved_segment",
        targetId: id,
        payload: {
          name: segment.name,
          total: outcome.total,
          autoTagStatus: outcome.autoTagStatus,
          tagged: outcome.tagged,
          untagged: outcome.untagged,
          failed: outcome.failed,
          flags: outcome.flags,
        },
      })
    }

    const response: SavedSegmentRunResponse & { blockedUntag: boolean; daily: typeof report.daily } = {
      dryRun,
      total: outcome.total ?? 0,
      bySource: outcome.bySource,
      flags: outcome.flags,
      autoTagStatus: outcome.autoTagStatus,
      tagged: outcome.tagged,
      untagged: outcome.untagged,
      failed: outcome.failed,
      invalid: outcome.invalid,
      blockedUntag: outcome.blockedUntag ?? false,
      daily: report.daily,
    }
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const mapped = segmentWriteErrorResponse(error)
    if (mapped) return mapped
    console.error("[POST /api/admin/crm/segments/[id]/run]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "세그먼트를 실행하지 못했습니다." }, { status: 500 })
  }
}
