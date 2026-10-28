// 하드웨어 입출고 한 줄의 재고관리 프로세스 규칙(갭 문서 §6·§7-2·§7-3) — 순수 함수.
// 저장소(lib/repositories/hardware-inventory.ts)가 필요한 맥락(품목의 물류번호 관리 여부, 도착·출발지 분류,
// CRM 고객 이름, 회수 원 출고, 기존 물류번호)을 읽어 넘기면, 여기서 권한·필수값을 검사하고 저장할 값으로
// 맞춘다. 물류번호 잔여 초과는 잔여를 아는 저장소가 막는다(strictLot 표시만 돌려준다).
//
// 요청자(actor)가 없는 호출은 시스템 경로(오더 승인 배송 예정 등)다 — 검사 없이 새 칸만 그대로 싣는다.
import {
  HARDWARE_INBOUND_CAPABILITY,
  HARDWARE_PROGRESS_STATUS,
  isHardwareOutboundType,
  isPlannedProgressStatus,
  NEW_LOT_PATTERN,
  nextLotNo,
  returnableQuantity,
  type HardwareActor,
  type HardwareOutboundType,
} from "@/lib/hardware/inventory-process"

export type HardwareLocationKind = "warehouse" | "sample" | "office" | "repair" | "customer" | "other"

export type HardwareAdjustDirection = "increase" | "decrease"
export const HARDWARE_ADJUST_DIRECTIONS: readonly HardwareAdjustDirection[] = ["increase", "decrease"]

const WAREHOUSE = "창고"

/** 규칙 위반 — status 는 API 응답 코드. 403 이면 requiredCapability 를 같이 알린다. */
export class MovementRuleError extends Error {
  readonly status: 400 | 403 | 404 | 422
  readonly requiredCapability: string | null

  constructor(message: string, status: 400 | 403 | 404 | 422 = 400, requiredCapability: string | null = null) {
    super(message)
    this.name = "MovementRuleError"
    this.status = status
    this.requiredCapability = requiredCapability
  }
}

function forbidden(message: string) {
  return new MovementRuleError(message, 403, HARDWARE_INBOUND_CAPABILITY)
}

export interface ProcessLineInput {
  itemId?: string
  productName: string
  movementType: "inbound" | "outbound" | "return" | "transfer" | "repair" | "adjust"
  quantity: number
  occurredAt?: string | null
  fromLocation?: string | null
  toLocation?: string | null
  owner?: string | null
  status?: string | null
  lotNo?: string | null
  /** 한 줄을 여러 물류번호로 나눌 때(고객사 출고, 물류번호 관리 품목). 합계 = quantity. */
  lotAllocations?: ReadonlyArray<{ lotNo: string; quantity: number }> | null
  memo?: string | null
  outboundType?: HardwareOutboundType | null
  isFree?: boolean | null
  returnOfMovementId?: string | null
  customerId?: string | null
  ownerUserId?: string | null
  createdByUserId?: string | null
  expectedReturnAt?: string | null
  adjustDirection?: HardwareAdjustDirection | null
}

/** 회수가 가리키는 원 출고 — 저장소가 읽어 넘긴다. */
export interface ReturnOriginal {
  id: string
  item_id: string
  product_name: string
  movement_type: string
  quantity: number
  status: string | null
  voided_at: string | null
  to_location: string | null
  /** 원 출고의 물류번호 키(lot_no, 시트 행은 reference_no). */
  lotKey: string | null
  customer_id: string | null
  /** 원 출고 유형(칸 → 추정). */
  outboundType: HardwareOutboundType | null
  /** 이미 회수된 수량들(취소 제외). */
  returnedQuantities: readonly number[]
}

export interface ProcessLineContext {
  /** null = 시스템 경로(검사 없음). */
  actor: HardwareActor | null
  /** 품목의 물류번호 관리 여부. null = 칸이 없는 DB(마이그레이션 전) — 예전 동작(FIFO)을 유지한다. */
  lotTracked: boolean | null
  /** 도착지 분류(저장소 classifyDestination). */
  destination: HardwareLocationKind
  /** 출발지 분류. */
  origin: HardwareLocationKind
  /** customerId 로 찾은 CRM 고객 이름. customerId 가 없으면 undefined, 못 찾으면 null. */
  customerName?: string | null
  /** returnOfMovementId 로 찾은 원 출고. 못 찾으면 null. */
  returnOriginal?: ReturnOriginal | null
  /** 지금까지 쓰인 물류번호(대문자 정규화) — 입고 물류번호 순번 검사용. 이 줄이 새 번호를 쓰면 호출부가 더한다. */
  knownLots?: ReadonlySet<string>
}

export interface PreparedProcessLine {
  input: ProcessLineInput
  /** 물류번호 직접 선택 + 잔여 초과 차단을 적용할 줄(고객사로 가는 물류번호 관리 품목 출고). */
  strictLot: boolean
  /** 이 줄이 처음 쓰는 신규 물류번호(입고) — 호출부가 knownLots 에 더한다. */
  newLotNo: string | null
}

function clean(value: string | null | undefined): string | null {
  const text = typeof value === "string" ? value.trim() : ""
  return text ? text : null
}

/** 물류번호 비교 키 — 공백 제거·대문자. */
export function lotCompareKey(value: string | null | undefined): string | null {
  const text = clean(value)
  return text ? text.replace(/\s+/g, "").toUpperCase() : null
}

function isCustomerKind(kind: HardwareLocationKind) {
  return kind === "customer" || kind === "other"
}

/**
 * 마이그레이션(20261028)이 적용된 DB 인가 — 품목 lot_tracked 칸이 보이면 그렇다. 적용 전에는 새 칸을 저장할
 * 수 없으니 새 필수값(유형·출고일·회수 연결·무상 여부)도 요구하지 않는다. 앱을 먼저 배포해도 지금 흐름이 깨지지 않는다.
 */
function isSchemaReady(ctx: ProcessLineContext) {
  return ctx.lotTracked !== null
}

function prepareInbound(input: ProcessLineInput, ctx: ProcessLineContext, actor: HardwareActor): PreparedProcessLine {
  if (!actor.isInventoryManager) throw forbidden("입고 등록은 입고관리 권한자만 할 수 있습니다.")
  const next: ProcessLineInput = { ...input }
  let newLotNo: string | null = null

  if (ctx.lotTracked !== null) {
    if (typeof input.isFree !== "boolean") throw new MovementRuleError(`${input.productName}: 유상/무상을 골라 주세요.`)
  }

  if (ctx.lotTracked === true) {
    const lotKey = lotCompareKey(input.lotNo)
    if (!lotKey) throw new MovementRuleError(`${input.productName}: 물류번호를 입력하세요.`)
    const known = ctx.knownLots ?? new Set<string>()
    if (!known.has(lotKey)) {
      const expected = nextLotNo(Array.from(known))
      if (!NEW_LOT_PATTERN.test(lotKey) || lotKey !== expected.toUpperCase()) {
        throw new MovementRuleError(
          `${input.productName}: 새 물류번호는 ${expected} 차례입니다(입력 ${clean(input.lotNo)}). 기존 번호에 더하려면 그 번호를 그대로 고르세요.`,
          422
        )
      }
      newLotNo = lotKey
    }
    // 신규 형식(C숫자)은 대문자로 맞춘다 — 기존 번호(H8·FY…)는 적힌 그대로 둔다.
    next.lotNo = NEW_LOT_PATTERN.test(lotKey) ? lotKey : clean(input.lotNo)
  } else if (ctx.lotTracked === false) {
    next.lotNo = null
  }

  return { input: next, strictLot: false, newLotNo }
}

function prepareAdjust(input: ProcessLineInput, actor: HardwareActor): PreparedProcessLine {
  if (!actor.isInventoryManager) throw forbidden("재고 조정은 입고관리 권한자만 할 수 있습니다.")
  if (!clean(input.memo)) throw new MovementRuleError(`${input.productName}: 재고 조정은 사유를 적어야 합니다.`)
  const next: ProcessLineInput = { ...input }
  // 조정 방향은 출발·도착 위치로 기록한다(저장소 lotDeltaOf: 출발만 있으면 감소, 그 밖은 증가).
  if (input.adjustDirection === "increase") {
    next.fromLocation = null
    next.toLocation = clean(input.toLocation) ?? WAREHOUSE
  } else if (input.adjustDirection === "decrease") {
    next.fromLocation = clean(input.fromLocation) ?? WAREHOUSE
    next.toLocation = null
  }
  return { input: next, strictLot: false, newLotNo: null }
}

function assertOwnerAssignable(input: ProcessLineInput, actor: HardwareActor) {
  const requested = clean(input.ownerUserId)
  if (requested && requested !== actor.userId && !actor.isInventoryManager) {
    throw forbidden("다른 담당자로 등록하려면 입고관리 권한이 필요합니다.")
  }
}

function prepareOutbound(input: ProcessLineInput, ctx: ProcessLineContext, actor: HardwareActor): PreparedProcessLine {
  assertOwnerAssignable(input, actor)
  const next: ProcessLineInput = {
    ...input,
    ownerUserId: clean(input.ownerUserId) ?? actor.userId,
    owner: clean(input.owner) ?? actor.name,
  }

  const customerId = clean(input.customerId)
  if (customerId) {
    if (!ctx.customerName) throw new MovementRuleError("CRM 고객을 찾을 수 없습니다.", 404)
    next.customerId = customerId
    next.toLocation = clean(input.toLocation) ?? ctx.customerName
  }

  const customerBound = Boolean(customerId) || isCustomerKind(ctx.destination)
  if (!customerBound || !isSchemaReady(ctx)) {
    // 사무실·샘플 풀·수리·창고 이동(또는 마이그레이션 전) — 예전 흐름 그대로(유형·고객·물류번호 선택 없음,
    // 실제 출고는 FIFO).
    if (next.outboundType != null && !isHardwareOutboundType(next.outboundType)) {
      throw new MovementRuleError("출고 유형이 올바르지 않습니다.")
    }
    if (next.outboundType !== "sample") next.expectedReturnAt = null
    return { input: next, strictLot: false, newLotNo: null }
  }

  if (!clean(input.occurredAt)) throw new MovementRuleError(`${input.productName}: 출고일(배송 예정일)을 입력하세요.`)
  if (!isHardwareOutboundType(input.outboundType)) {
    throw new MovementRuleError(`${input.productName}: 출고 유형(세일즈·프로모션·A/S·샘플)을 고르세요.`)
  }
  if (input.outboundType === "sample") {
    if (!clean(input.expectedReturnAt)) throw new MovementRuleError(`${input.productName}: 샘플 출고는 반납 예정일이 필요합니다.`)
  } else {
    next.expectedReturnAt = null
  }
  next.status = isPlannedProgressStatus(input.status) ? HARDWARE_PROGRESS_STATUS.planned : HARDWARE_PROGRESS_STATUS.installed

  if (ctx.lotTracked === true) {
    const allocations = input.lotAllocations ?? []
    if (allocations.length > 0) {
      // 나눠 고른 경우 — 번호·수량 모양과 합계만 본다. 번호별 잔여는 저장소가 막는다.
      const total = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)
      if (allocations.some((allocation) => !clean(allocation.lotNo) || !Number.isInteger(allocation.quantity) || allocation.quantity <= 0)) {
        throw new MovementRuleError(`${input.productName}: 물류번호별 수량이 올바르지 않습니다.`)
      }
      if (total !== input.quantity) {
        throw new MovementRuleError(`${input.productName}: 물류번호별 수량 합계(${total}대)가 출고 수량(${input.quantity}대)과 같아야 합니다.`)
      }
      next.lotNo = null
      next.lotAllocations = allocations.map((allocation) => ({ lotNo: clean(allocation.lotNo) as string, quantity: allocation.quantity }))
      return { input: next, strictLot: true, newLotNo: null }
    }
    if (!clean(input.lotNo)) {
      throw new MovementRuleError(`${input.productName}은(는) 물류번호를 골라야 합니다.`)
    }
    next.lotNo = clean(input.lotNo)
    next.lotAllocations = null
    return { input: next, strictLot: true, newLotNo: null }
  }
  next.lotAllocations = null
  if (ctx.lotTracked === false) next.lotNo = null
  return { input: next, strictLot: false, newLotNo: null }
}

function prepareReturn(input: ProcessLineInput, ctx: ProcessLineContext, actor: HardwareActor): PreparedProcessLine {
  const returnOf = clean(input.returnOfMovementId)
  if (!returnOf) {
    if (isCustomerKind(ctx.origin) && isSchemaReady(ctx)) {
      throw new MovementRuleError("고객사에서 돌아오는 회수는 원 출고 건을 골라야 합니다.")
    }
    // 사무실·샘플 풀에서 돌아오는 반납 — 예전 흐름 그대로.
    return { input: { ...input, createdByUserId: actor.userId }, strictLot: false, newLotNo: null }
  }

  const original = ctx.returnOriginal
  if (!original) throw new MovementRuleError("회수할 원 출고 건을 찾을 수 없습니다.", 404)
  if (original.voided_at) throw new MovementRuleError("취소된 출고는 회수할 수 없습니다.", 422)
  if (original.movement_type !== "outbound" || isPlannedProgressStatus(original.status)) {
    throw new MovementRuleError("실제 출고(설치 완료)된 건만 회수할 수 있습니다.", 422)
  }
  const returnable = returnableQuantity(original, original.returnedQuantities)
  if (input.quantity > returnable) {
    throw new MovementRuleError(`남은 회수 가능 수량은 ${returnable}대입니다(요청 ${input.quantity}대).`, 422)
  }

  return {
    input: {
      ...input,
      itemId: original.item_id,
      productName: original.product_name,
      returnOfMovementId: original.id,
      lotNo: original.lotKey,
      customerId: original.customer_id,
      outboundType: original.outboundType,
      fromLocation: original.to_location,
      toLocation: clean(input.toLocation) ?? WAREHOUSE,
      status: HARDWARE_PROGRESS_STATUS.returned,
      ownerUserId: actor.userId,
      owner: clean(input.owner) ?? actor.name,
      expectedReturnAt: null,
    },
    strictLot: false,
    newLotNo: null,
  }
}

/**
 * 한 줄을 규칙대로 맞춘다. 위반이면 MovementRuleError 를 던진다.
 * 요청자가 없으면(시스템 경로) 검사 없이 그대로 돌려준다.
 */
export function prepareProcessLine(input: ProcessLineInput, ctx: ProcessLineContext): PreparedProcessLine {
  const actor = ctx.actor
  if (!actor) return { input, strictLot: false, newLotNo: null }

  let prepared: PreparedProcessLine
  switch (input.movementType) {
    case "inbound":
      prepared = prepareInbound(input, ctx, actor)
      break
    case "adjust":
      prepared = prepareAdjust(input, actor)
      break
    case "outbound":
      prepared = prepareOutbound(input, ctx, actor)
      break
    case "return":
      prepared = prepareReturn(input, ctx, actor)
      break
    default:
      prepared = { input: { ...input }, strictLot: false, newLotNo: null }
  }
  if (input.movementType !== "inbound") prepared.input.isFree = null
  if (input.movementType !== "outbound") prepared.input.lotAllocations = null
  if (input.movementType !== "outbound" && input.movementType !== "return") {
    prepared.input.outboundType = null
    prepared.input.expectedReturnAt = null
  }
  prepared.input.createdByUserId = actor.userId
  return prepared
}
