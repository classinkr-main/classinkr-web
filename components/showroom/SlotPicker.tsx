"use client"

import { useEffect, useMemo, useRef, useState } from "react"

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

/** 'HH:mm' → 시(hour). 오전·오후를 가르는 데만 쓴다. */
function hourOf(time: string): number {
  return Number(time.slice(0, 2))
}

/**
 * 오전·오후로 가른 슬롯. 운영 슬롯이 10·11시와 14·15·16시라 그 사이 점심 공백이
 * 있는데, 한 격자에 붙여 그리면 11:00 다음에 14:00 이 바로 와 "빠진 시간"처럼 읽힌다.
 */
function groupByMeridiem(slots: readonly ShowroomSlot[]) {
  const groups: Array<{ label: string; slots: ShowroomSlot[] }> = []

  for (const slot of slots) {
    const label = hourOf(slot.time) < 12 ? "오전" : "오후"
    const last = groups.at(-1)
    if (last?.label === label) last.slots.push(slot)
    else groups.push({ label, slots: [slot] })
  }

  return groups
}

/**
 * 하루치 상담 시간 선택. 날짜 판정(주말·공휴일·리드타임)은 캘린더가 이미 걸렀고,
 * 여기서는 "그 날 남은 시간"만 고른다.
 *
 * `state === "booked"` 는 이미 다른 방문이 잡힌 시간이라 "마감"으로 남긴다 —
 * 목록에서 지워버리면 "원래 없던 시간"인지 "찬 시간"인지 구분이 안 돼, 다른 날짜를
 * 볼지 판단할 근거가 사라진다.
 *
 * ## 키보드
 *
 * `role="radiogroup"` 이면서 방향키 핸들링도 roving tabindex 도 없던 자리다 — 슬롯
 * 다섯 개가 전부 개별 탭 정지점이 되고, 같은 폼 안의 캘린더(DesiredDateCalendar)는
 * roving tabindex 를 제대로 하는데 여기만 어긋나 조작 모델이 둘이었다.
 *
 * 마감 슬롯은 native `disabled` 가 아니라 `aria-disabled` 다. 캘린더가 연휴 구간에서
 * 같은 판단을 한 이유와 같다 — native disabled 는 포커스를 못 받아, 스크린리더
 * 사용자가 "마감"이라는 정보에 아예 도달하지 못한다. 그래서 **포커스는 모든 슬롯을
 * 지나가되 선택은 고를 수 있는 슬롯에서만** 일어난다(라디오 관례에서 의도적으로 비킨
 * 지점이다 — 비활성 라디오를 건너뛰면 그 정보가 사라진다).
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
  const groups = useMemo(() => groupByMeridiem(slots), [slots])
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())
  // 키보드로 옮긴 다음에만 실제 포커스를 옮긴다 — 마운트 시 포커스를 뺏지 않는다.
  const shouldRestoreFocus = useRef(false)

  const firstSelectable = slots.find((slot) => slot.state !== "booked")?.time ?? ""
  const [focusedTime, setFocusedTime] = useState("")

  /**
   * 탭 정지점은 하나다 — 선택된 슬롯, 없으면 마지막으로 포커스한 슬롯, 없으면 첫
   * 선택 가능 슬롯.
   *
   * 날짜를 바꾸면 슬롯 목록이 통째로 갈리므로, 기억해 둔 시각이 지금 목록에 없으면
   * 그냥 흘려보낸다 — effect 로 상태를 되맞추는 대신 렌더에서 판정한다.
   */
  const has = (time: string) => Boolean(time) && slots.some((slot) => slot.time === time)
  const tabStop = (has(value) && value) || (has(focusedTime) && focusedTime) || firstSelectable

  useEffect(() => {
    if (!shouldRestoreFocus.current) return
    shouldRestoreFocus.current = false
    buttonRefs.current.get(focusedTime)?.focus()
  }, [focusedTime])

  function moveFocus(delta: number) {
    if (slots.length === 0) return
    const currentIndex = slots.findIndex((slot) => slot.time === tabStop)
    const from = currentIndex === -1 ? 0 : currentIndex
    const next = Math.min(slots.length - 1, Math.max(0, from + delta))
    const target = slots[next]
    if (!target) return

    shouldRestoreFocus.current = true
    setFocusedTime(target.time)
    // 라디오 관례대로 이동과 선택을 함께 옮기되, 마감 슬롯에서는 포커스만 간다.
    if (target.state !== "booked") onChange(target.time)
  }

  function moveTo(index: number) {
    const target = slots[index]
    if (!target) return
    shouldRestoreFocus.current = true
    setFocusedTime(target.time)
    if (target.state !== "booked") onChange(target.time)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault()
        moveFocus(1)
        break
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault()
        moveFocus(-1)
        break
      case "Home":
        event.preventDefault()
        moveTo(0)
        break
      case "End":
        event.preventDefault()
        moveTo(slots.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledById}
      aria-describedby={describedById}
      className="space-y-3"
    >
      {groups.map((group) => (
        <div key={group.label} className="space-y-1.5">
          {groups.length > 1 ? (
            <p aria-hidden="true" className="text-[11px] font-medium text-[#A39E98]">
              {group.label}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {group.slots.map((slot) => {
              const booked = slot.state === "booked"
              const selected = !booked && value === slot.time

              return (
                <button
                  key={slot.time}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={booked || undefined}
                  tabIndex={slot.time === tabStop ? 0 : -1}
                  ref={(node) => {
                    if (node) buttonRefs.current.set(slot.time, node)
                    else buttonRefs.current.delete(slot.time)
                  }}
                  aria-label={`${group.label} ${slot.time} ${
                    booked ? "마감" : `상담 ${durationMinutes}분`
                  }`}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setFocusedTime(slot.time)}
                  onClick={() => {
                    // 마감은 포커스만 허용하고 선택은 막는다(캘린더의 비활성 날짜와 같은 규약).
                    if (booked) return
                    onChange(slot.time)
                  }}
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
                    className={`mt-0.5 block text-[11px] ${
                      booked ? "text-[#A39E98]" : "text-[#615D59]"
                    }`}
                  >
                    {booked ? "마감" : `${durationMinutes}분`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
