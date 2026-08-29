"use client"

import type { ShowroomSlot } from "@/lib/showroom/slots"

interface Props {
  /** 그 날짜의 슬롯 목록. 가용성 API 가 준 순서를 그대로 그린다. */
  slots: readonly ShowroomSlot[]
  /** 선택된 시각('HH:mm'). 미선택은 빈 문자열. */
  value: string
  onChange: (time: string) => void
  /** 1회 상담 소요(분). 슬롯 아래 보조 문구에 쓴다. */
  durationMinutes: number
  /** 필드 에러 하이라이트 */
  invalid?: boolean
  labelledById?: string
  describedById?: string
}

/**
 * 하루치 상담 시간 선택. 날짜 판정(주말·공휴일·리드타임)은 캘린더가 이미 걸렀고,
 * 여기서는 "그 날 남은 시간"만 고른다.
 *
 * `state === "booked"` 는 이미 다른 방문이 잡힌 시간이라 비활성 + "마감"으로 남긴다 —
 * 목록에서 지워버리면 "원래 없던 시간"인지 "찬 시간"인지 구분이 안 돼, 다른 날짜를
 * 볼지 판단할 근거가 사라진다.
 */
export function SlotPicker({
  slots,
  value,
  onChange,
  durationMinutes,
  invalid = false,
  labelledById,
  describedById,
}: Props) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledById}
      aria-describedby={describedById}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      {slots.map((slot) => {
        const booked = slot.state === "booked"
        const selected = !booked && value === slot.time

        return (
          <button
            key={slot.time}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={booked}
            aria-label={`${slot.time} ${booked ? "마감" : `상담 ${durationMinutes}분`}`}
            onClick={() => onChange(slot.time)}
            className={[
              "rounded-lg border px-3 py-2.5 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]",
              booked
                ? "cursor-not-allowed border-black/[0.08] bg-[#F6F5F4]"
                : selected
                  ? "border-[#084734]/60 bg-[#ECFDF5]/60"
                  : invalid
                    ? "border-[#B43E3E] bg-white hover:bg-[#F6F5F4]"
                    : "border-black/[0.08] bg-white hover:bg-[#F6F5F4]",
            ].join(" ")}
          >
            <span
              className={`block text-[14px] font-semibold tabular-nums ${
                booked ? "text-[#A39E98]" : selected ? "text-[#084734]" : "text-[#111110]"
              }`}
            >
              {slot.time}
            </span>
            <span
              className={`mt-0.5 block text-[11px] ${booked ? "text-[#A39E98]" : "text-[#615D59]"}`}
            >
              {booked ? "마감" : `${durationMinutes}분`}
            </span>
          </button>
        )
      })}
    </div>
  )
}
