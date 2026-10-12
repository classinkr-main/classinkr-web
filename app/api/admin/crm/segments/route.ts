import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { logAdminAudit } from "@/lib/auth/audit"
import type {
  SavedSegmentListResponse,
  SavedSegmentMutationResponse,
  SavedSegmentScope,
} from "@/lib/crm/saved-segment-api"
import { isSavedSegmentVisibleTo, validateSavedSegmentInput } from "@/lib/crm/saved-segments"
import { createSavedSegment, listSavedSegments } from "@/lib/repositories/crm-saved-segments"

import {
  buildSingleSegmentItem,
  evaluateSegmentsLive,
  loadSegmentDailyPoints,
  readJsonObject,
  segmentActor,
  segmentTrendOf,
  segmentViewer,
  segmentWriteErrorResponse,
  toSegmentListItem,
  todayKst,
} from "./segment-response"

// 세그먼트 허브(C안 ②, 2026-09-25) — 저장 세그먼트 목록·생성.
//
// GET  ?scope=all|team|mine&archived=0|1 — 역할 CRM_STAFF. 보이는 범위 = 팀 공유 + 내 것(남의 "내 것"은 싣지 않는다 —
//      SUPER_ADMIN 포함). 라이브 건수는 통합 스냅샷 캐시 위 일괄 평가, 8주 추이는 일별 기록. 표 미적용이면 200
//      available:false(안내) — 화면은 "조건은 통합 목록 URL 로 공유" 안내를 띄운다.
// POST {name, description?, spec, visibility?, autoTag?} — 역할 CRM_STAFF(자동 태그 켜기는 관리자만). 201 {segment}.
//      400 검증 · 403 자동 태그 권한 · 409 활성 자동 라벨 중복 · 503 미적용.
// 응답 모양: lib/crm/saved-segment-api.ts(고정 계약).

const SCOPES: readonly SavedSegmentScope[] = ["all", "team", "mine"]
const TREND_READ_FAILED_WARNING = "일별 기록을 불러오지 못해 추이가 비어 있습니다. 잠시 뒤 다시 확인해 주세요."

function parseScope(value: string | null): SavedSegmentScope {
  return SCOPES.includes(value as SavedSegmentScope) ? (value as SavedSegmentScope) : "all"
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const url = new URL(req.url)
    const scope = parseScope(url.searchParams.get("scope"))
    const archived = url.searchParams.get("archived") === "1"
    const generatedAt = new Date().toISOString()

    const listed = await listSavedSegments({ archived })
    if (!listed.available) {
      const body: SavedSegmentListResponse = {
        available: false,
        warning: listed.warning,
        generatedAt,
        scopeCounts: { all: 0, team: 0, mine: 0 },
        live: { ok: false, compass: "skipped", neoStale: false, neoLatestSyncedAt: null },
        segments: [],
      }
      return NextResponse.json(body)
    }

    const viewer = segmentViewer(admin)
    const visible = listed.segments.filter((segment) => isSavedSegmentVisibleTo(segment, viewer))
    const scopeCounts = {
      all: visible.length,
      team: visible.filter((segment) => segment.visibility === "team").length,
      mine: visible.filter((segment) => segment.visibility === "mine").length,
    }
    const scoped = scope === "all" ? visible : visible.filter((segment) => segment.visibility === scope)

    const today = todayKst()
    const [live, trends] = await Promise.all([
      evaluateSegmentsLive(scoped),
      // 추이 읽기 실패는 목록을 막지 않는다 — 추이만 비우고 trendWarning 으로 알린다.
      loadSegmentDailyPoints(
        scoped.map((segment) => segment.id),
        today
      ).catch((error: unknown) => {
        console.error("[GET /api/admin/crm/segments] 추이", error instanceof Error ? error.message : error)
        return { available: false, warning: TREND_READ_FAILED_WARNING, pointsById: new Map() }
      }),
    ])

    const body: SavedSegmentListResponse = {
      available: true,
      warning: null,
      trendWarning: trends.available ? null : trends.warning,
      generatedAt,
      scopeCounts,
      live: live.status,
      segments: scoped.map((segment) => {
        const points = trends.pointsById.get(segment.id) ?? []
        return toSegmentListItem(segment, viewer, {
          count: live.results.get(segment.id)?.total ?? null,
          trend: segmentTrendOf(points, segment.specHash, today),
          trendDays: points.length,
        })
      }),
    }
    // 강등된 응답(라이브 평가 실패·원천 미완성 스냅샷·추이 실패)은 브라우저 캐시에 남기지 않는다 — 다음 조회가 바로
    // 다시 시도한다. 미완성 스냅샷의 과소 건수는 evaluateSegmentsLive 가 count=null 로 내린다.
    if (!live.status.ok || !trends.available) {
      return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
    }
    return adminCachedJson(body)
  } catch (error) {
    console.error("[GET /api/admin/crm/segments]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "세그먼트 목록을 불러오지 못했습니다." }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = await readJsonObject(req)
  if (!body) return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 })

  const validated = validateSavedSegmentInput(body, "create")
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

  const viewer = segmentViewer(admin)
  const value = validated.value
  const autoTagEnabled = value.autoTag?.enabled === true
  // 자동 태그 켜기는 관리자(SUPER_ADMIN·ADMIN)만 — 2026-09-25 결정.
  if (autoTagEnabled && !viewer.isStaffAdmin) {
    return NextResponse.json({ error: "자동 태그는 관리자만 켤 수 있습니다." }, { status: 403 })
  }
  const visibility = value.visibility ?? "mine"
  // 로그인 사용자 id 가 없는 세션(레거시·우회)에서 "내 것"을 만들면 누구에게도 보이지 않는다.
  if (visibility === "mine" && !viewer.userId) {
    return NextResponse.json(
      { error: "로그인 사용자 정보가 없어 '내 것' 세그먼트를 만들 수 없습니다. 팀 공유로 저장해 주세요." },
      { status: 400 }
    )
  }

  try {
    const actor = segmentActor(admin)
    const segment = await createSavedSegment({
      name: value.name as string,
      description: value.description ?? null,
      spec: value.spec!,
      visibility,
      ownerUserId: admin.userId ?? null,
      ownerName: admin.name?.trim() || null,
      autoTag: {
        enabled: autoTagEnabled,
        label: value.autoTag?.label ?? null,
        untag: value.autoTag?.untag === true,
      },
      actor,
    })

    await logAdminAudit({
      admin,
      action: autoTagEnabled ? "crm.segments.auto_tag.update" : "crm.segments.create",
      targetType: "crm_saved_segment",
      targetId: segment.id,
      payload: {
        name: segment.name,
        visibility: segment.visibility,
        autoTag: { enabled: segment.autoTagEnabled, label: segment.autoTagLabel, untag: segment.autoUntag },
      },
    })

    const response: SavedSegmentMutationResponse = { segment: await buildSingleSegmentItem(segment, viewer) }
    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    const mapped = segmentWriteErrorResponse(error)
    if (mapped) return mapped
    console.error("[POST /api/admin/crm/segments]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "세그먼트를 저장하지 못했습니다." }, { status: 500 })
  }
}
