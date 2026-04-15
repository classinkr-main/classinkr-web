"use client"

import { formatKrw } from "@/lib/billing/plans"

interface Props {
  amountKrw: number | null
  fxRate: number | null
  isStale?: boolean
  loading?: boolean
}

export function KrwConversionNote({ amountKrw, fxRate, isStale, loading }: Props) {
  if (loading) {
    return (
      <p className="text-center text-[12px] text-[#7C8A83]">
        오늘 환율 기준 KRW 환산 금액을 확인하고 있습니다...
      </p>
    )
  }

  if (amountKrw == null || fxRate == null) {
    return (
      <p className="text-center text-[12px] text-[#7C8A83]">
        결제 버튼을 누르면 최종 KRW 승인 금액이 확정됩니다.
      </p>
    )
  }

  return (
    <p className="text-center text-[12px] leading-relaxed text-[#55645C]">
      오늘 환율 기준 약 <span className="font-semibold text-[#084734]">{formatKrw(amountKrw)}</span>
      으로 승인됩니다.
      <span className="mx-1 text-[#B5BEB8]">·</span>
      1 USD ≈ {fxRate.toLocaleString("ko-KR")}원
      {isStale ? <span className="ml-1 text-[#B85C33]">(지연 데이터)</span> : null}
    </p>
  )
}
