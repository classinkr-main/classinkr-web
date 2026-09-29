"use client"

import Link from "next/link"

import { adminAiStore, selectPendingOrders, type AdminAiState } from "@/lib/admin-ai/store"
import { OrderCard } from "./cards/OrderCard"

/** 확인 대기 목록 — 다른 화면에서 만들어 둔 오더를 여기서 마저 처리한다. */
export function OrderQueue({ state }: { state: AdminAiState }) {
  const pending = selectPendingOrders(state)

  if (pending.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-10 text-center">
        <b className="text-[13px] font-semibold text-[#111110]">확인을 기다리는 오더가 없습니다</b>
        <p className="text-[12px] text-[#615D59]">
          갈매봇에게 오더를 내리면 실행 전에 여기에 모입니다.
        </p>
        <Link
          href="/admin/ai?tab=orders"
          className="mt-2 text-[12px] font-semibold text-[#084734] hover:underline"
        >
          오더함에서 전체 이력 보기
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {pending.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          now={state.now}
          onAction={(action) => adminAiStore.actOnOrder(order.id, action)}
        />
      ))}
      <p className="text-[12px] text-[#A39E98]">
        확인하지 않은 오더는 15분 뒤 자동으로 만료됩니다.
      </p>
    </div>
  )
}
