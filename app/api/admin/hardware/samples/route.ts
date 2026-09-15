import { NextRequest, NextResponse } from "next/server"

import {
  HardwareApiValidationError,
  readOptionalDate,
  readOptionalString,
  readRequestBody,
  readRequiredEnum,
  readRequiredPositiveInt,
  readRequiredString,
  readStringArray,
  toErrorResponse,
} from "@/app/api/admin/hardware/_validation"
import {
  BRANCH_READ_ADMIN_API_ROLES,
  HARDWARE_EDITOR_ADMIN_API_ROLES,
  requireVerifiedAdminContext,
  verifyAdmin,
} from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { logAdminAudit } from "@/lib/auth/audit"
import {
  listSampleUnitEvents,
  listSampleUnits,
  recordSampleUnitEvents,
  registerSampleUnits,
  SAMPLE_EVENT_TYPES,
  SAMPLE_UNIT_STATUSES,
  SampleUnitRuleError,
  type HardwareSampleUnit,
} from "@/lib/repositories/hardware-samples"

// 샘플 유닛 트래커 — GET: 유닛 목록(+목록 프리뷰용 최신 이벤트) 또는 ?unit= 단일 유닛 타임라인.
// POST: register(채번 등록) / event(대여·반환·전시·사무실 보관·전환·수리·정정·폐기·메모).
// 저장 직후 재조회는 lib/admin-client.ts가 같은 리소스 스코프(/api/admin/hardware)의 GET을
// 60초간 cache:"no-cache"로 우회시키므로, 표준 어드민 캐시 헤더를 달아도 신선도가 깨지지 않는다.

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES)
  if (err) return err

  try {
    const unitId = req.nextUrl.searchParams.get("unit")?.trim()
    if (unitId) {
      const events = await listSampleUnitEvents(unitId)
      return adminCachedJson({ events })
    }
    const { units, latestEvents } = await listSampleUnits()
    return adminCachedJson({ units, latestEvents })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read sample units"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const POST_ACTIONS = ["register", "event"] as const

// assign은 register 전용(채번과 함께만 생성) — event 액션으로는 받지 않는다.
const EVENT_ACTION_TYPES = SAMPLE_EVENT_TYPES.filter((type) => type !== "assign")

// 감사 로그 페이로드에 싣는 유닛 식별자 상한 — 한 번에 최대 60대라 넘칠 일은 없지만 로그 크기를 고정한다.
const AUDIT_UNIT_LIMIT = 60

function auditUnitSummary(units: HardwareSampleUnit[]) {
  const listed = units.slice(0, AUDIT_UNIT_LIMIT)
  return {
    count: units.length,
    unitIds: listed.map((unit) => unit.id),
    assetCodes: listed.map((unit) => unit.asset_code),
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, HARDWARE_EDITOR_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const body = await readRequestBody(req)
    const createdBy = admin.name ?? admin.userId ?? admin.role
    const action = readRequiredEnum(body, "action", "처리 유형", POST_ACTIONS)

    if (action === "register") {
      const statusValue = readOptionalString(body, "status", "초기 상태")
      if (statusValue && statusValue !== "office" && statusValue !== "loaned") {
        throw new HardwareApiValidationError("초기 상태는 office 또는 loaned만 허용됩니다.")
      }
      const status = (statusValue as "office" | "loaned" | undefined) ?? "office"
      const units = await registerSampleUnits({
        itemId: readOptionalString(body, "itemId", "품목 ID") ?? null,
        productName: readRequiredString(body, "productName", "제품명"),
        count: readRequiredPositiveInt(body, "count", "등록 수량"),
        status,
        customer: readOptionalString(body, "customer", "고객명") ?? null,
        owner: readOptionalString(body, "owner", "담당자") ?? null,
        occurredAt: readOptionalDate(body, "occurredAt", "처리일") ?? null,
        memo: readOptionalString(body, "memo", "메모") ?? null,
        movementRef: readOptionalString(body, "movementRef", "원장 참조") ?? null,
        createdBy,
      })
      await logAdminAudit({
        admin,
        action: "hardware.sample.register",
        targetType: "hardware_sample_unit",
        targetId: units.length === 1 ? units[0].id : undefined,
        payload: { productName: units[0]?.product_name ?? null, status, ...auditUnitSummary(units) },
      })
      return NextResponse.json({ units }, { status: 201 })
    }

    const eventType = readRequiredEnum(body, "eventType", "이벤트 유형", EVENT_ACTION_TYPES)
    // 상태 정정(adjust) 전용 — 운영 데이터 정리. 사유 메모 필수 규칙은 저장소가 판정한다(400).
    const nextStatus =
      body.nextStatus == null || body.nextStatus === ""
        ? undefined
        : readRequiredEnum(body, "nextStatus", "정정 상태", SAMPLE_UNIT_STATUSES)
    if (nextStatus && eventType !== "adjust") {
      throw new HardwareApiValidationError("상태 정정(nextStatus)은 정정(adjust) 이벤트에서만 쓸 수 있습니다.")
    }

    const units = await recordSampleUnitEvents({
      unitIds: readStringArray(body, "unitIds", "유닛 ID"),
      eventType,
      occurredAt: readOptionalDate(body, "occurredAt", "처리일") ?? null,
      customer: readOptionalString(body, "customer", "고객명") ?? null,
      owner: readOptionalString(body, "owner", "담당자") ?? null,
      memo: readOptionalString(body, "memo", "메모") ?? null,
      serialNo: readOptionalString(body, "serialNo", "시리얼 번호"),
      expectedReturnAt: readOptionalDate(body, "expectedReturnAt", "회수 예정일"),
      movementRef: readOptionalString(body, "movementRef", "원장 참조") ?? null,
      nextStatus: nextStatus ?? null,
      createdBy,
    })
    // 상태·필드를 바꾸는 이벤트만 감사 대상이다(원장 movements/[id] 라우트와 같은 원칙). 메모는 이벤트 행
    // 자체(created_by 포함)가 기록이라 감사 로그를 따로 남기지 않는다.
    if (eventType !== "memo") {
      await logAdminAudit({
        admin,
        action: `hardware.sample.${eventType}`,
        targetType: "hardware_sample_unit",
        targetId: units.length === 1 ? units[0].id : undefined,
        payload: {
          eventType,
          nextStatus: nextStatus ?? null,
          statuses: Array.from(new Set(units.map((unit) => unit.status))),
          ...auditUnitSummary(units),
        },
      })
    }
    return NextResponse.json({ units }, { status: 201 })
  } catch (error) {
    // 전이 거절·입력 누락·전시 DB 미적용 — 저장소가 정한 상태(400/404/409)와 문구를 그대로 돌려준다.
    if (error instanceof SampleUnitRuleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return toErrorResponse(error, "Failed to update sample units")
  }
}
