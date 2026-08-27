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
import {
  listSampleUnitEvents,
  listSampleUnits,
  recordSampleUnitEvents,
  registerSampleUnits,
  SAMPLE_EVENT_TYPES,
} from "@/lib/repositories/hardware-samples"

// 샘플 유닛 트래커 — GET: 유닛 목록(+목록 프리뷰용 최신 이벤트) 또는 ?unit= 단일 유닛 타임라인.
// POST: register(채번 등록) / event(대여·반환·전환·수리·정정·폐기·메모).
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
      const units = await registerSampleUnits({
        itemId: readOptionalString(body, "itemId", "품목 ID") ?? null,
        productName: readRequiredString(body, "productName", "제품명"),
        count: readRequiredPositiveInt(body, "count", "등록 수량"),
        status: (statusValue as "office" | "loaned" | undefined) ?? "office",
        customer: readOptionalString(body, "customer", "고객명") ?? null,
        owner: readOptionalString(body, "owner", "담당자") ?? null,
        occurredAt: readOptionalDate(body, "occurredAt", "처리일") ?? null,
        memo: readOptionalString(body, "memo", "메모") ?? null,
        movementRef: readOptionalString(body, "movementRef", "원장 참조") ?? null,
        createdBy,
      })
      return NextResponse.json({ units }, { status: 201 })
    }

    const units = await recordSampleUnitEvents({
      unitIds: readStringArray(body, "unitIds", "유닛 ID"),
      eventType: readRequiredEnum(body, "eventType", "이벤트 유형", EVENT_ACTION_TYPES),
      occurredAt: readOptionalDate(body, "occurredAt", "처리일") ?? null,
      customer: readOptionalString(body, "customer", "고객명") ?? null,
      owner: readOptionalString(body, "owner", "담당자") ?? null,
      memo: readOptionalString(body, "memo", "메모") ?? null,
      serialNo: readOptionalString(body, "serialNo", "시리얼 번호"),
      expectedReturnAt: readOptionalDate(body, "expectedReturnAt", "회수 예정일"),
      movementRef: readOptionalString(body, "movementRef", "원장 참조") ?? null,
      createdBy,
    })
    return NextResponse.json({ units }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error, "Failed to update sample units")
  }
}
