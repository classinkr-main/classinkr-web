"use client"

// 출고·회수 행의 프로세스 칸 표시 — 유형 배지(outbound_type_resolved), 진행 상태, CRM 고객 링크,
// 샘플 반납 예정일. 원장 목록·예상 출고·상세가 같은 모양을 쓴다.

import Link from "next/link"

import { HARDWARE_OUTBOUND_TYPE_LABELS, type HardwareOutboundType } from "@/lib/hardware/inventory-process"

import { crmCustomerHref } from "./hardware-lookups"
import { elapsedDaysSince, formatDate, SALE_TYPE_META, type HardwareMovement } from "./shared"

/** 서버가 정한 유형 → 칸 값 순서. 시트 행·구응답은 둘 다 없을 수 있다. */
export function movementOutboundType(movement: Pick<HardwareMovement, "movement_type" | "outbound_type" | "outbound_type_resolved">): HardwareOutboundType | null {
  if (movement.movement_type !== "outbound" && movement.movement_type !== "return") return null
  return movement.outbound_type_resolved ?? movement.outbound_type ?? null
}

/** 샘플 반납 예정일이 지났는가 — 오늘 기준. 반납 예정일이 없거나 미래면 false. */
export function isSampleReturnOverdue(movement: Pick<HardwareMovement, "expected_return_at">): boolean {
  const days = elapsedDaysSince(movement.expected_return_at ?? null)
  return days != null && days > 0
}

export function OutboundTypeBadge({ type, size = "sm" }: { type: HardwareOutboundType | null; size?: "sm" | "xs" }) {
  if (!type) return null
  return (
    <span
      className={`inline-flex shrink-0 rounded-full font-bold ${size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"} ${SALE_TYPE_META[type].tone}`}
    >
      {HARDWARE_OUTBOUND_TYPE_LABELS[type]}
    </span>
  )
}

export function SampleReturnBadge({ movement, size = "sm" }: { movement: Pick<HardwareMovement, "expected_return_at" | "outbound_type_resolved" | "outbound_type" | "movement_type">; size?: "sm" | "xs" }) {
  if (movementOutboundType(movement) !== "sample" || !movement.expected_return_at) return null
  const overdue = isSampleReturnOverdue(movement)
  return (
    <span
      title={overdue ? "반납 예정일이 지났습니다" : "샘플 반납 예정일"}
      className={`inline-flex shrink-0 rounded-full font-bold tabular-nums ${size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"} ${
        overdue ? "bg-[#FCE9E9] text-[#8F2C2C]" : "bg-[#F6F5F4] text-[#615D59]"
      }`}
    >
      반납 {formatDate(movement.expected_return_at)}
      {overdue ? " 지남" : ""}
    </span>
  )
}

/** CRM 고객 링크 — customer_id 가 있을 때만. 이름은 to_location(표시 이름). */
export function CrmCustomerLink({ movement, className }: { movement: Pick<HardwareMovement, "customer_id" | "to_location" | "movement_type" | "from_location">; className?: string }) {
  if (!movement.customer_id) return null
  const name = (movement.movement_type === "return" ? movement.from_location : movement.to_location)?.trim()
  if (!name) return null
  return (
    <Link
      href={crmCustomerHref(name)}
      onClick={(event) => event.stopPropagation()}
      className={
        className ??
        "inline-flex shrink-0 items-center rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2 py-0.5 text-[10.5px] font-bold text-[#084734] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
      }
      title="CRM 고객 목록에서 열기"
    >
      CRM 고객 ↗
    </Link>
  )
}
