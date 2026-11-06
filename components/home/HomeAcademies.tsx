"use client"

import { useState } from "react"
import { Pause, Play } from "lucide-react"
import { HOME_COPY } from "./home-copy"

const { academies } = HOME_COPY

// 같은 목록 두 벌을 이어 붙이고 트랙을 -50% 옮긴다(globals.css @keyframes marquee). 벌마다 끝에 간격(pr-14)을 넣어
// 두 벌 폭이 정확히 같아야 이음매가 튀지 않는다. 동작 줄이기에서는 흐름을 끄고 한 벌을 여러 줄로 펼친다
const LIST =
  "flex gap-14 pr-14 motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-x-8 motion-reduce:gap-y-2 motion-reduce:px-4"
const NAME = "whitespace-nowrap text-caption font-medium text-fg-muted"

export function HomeAcademies() {
  const [paused, setPaused] = useState(false)

  return (
    <section className="bg-surface-paper pb-16">
      <div className="mx-auto flex max-w-[1040px] items-center justify-center gap-2 px-4 sm:px-6">
        <p className="text-caption text-fg-muted">{academies.caption}</p>
        {/* WCAG 2.2.2 — 5초 넘게 움직이는 내용은 멈출 수 있어야 한다. 이름이 상태를 말하므로 aria-pressed 는 겹쳐 쓰지 않는다 */}
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? academies.playLabel : academies.pauseLabel}
          className="hit-area inline-flex size-6 items-center justify-center text-fg-muted hover:text-fg-ink motion-reduce:hidden"
        >
          {paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
        </button>
      </div>

      <div className="mt-5 overflow-hidden">
        <div
          className="flex w-max animate-[marquee_80s_linear_infinite] motion-reduce:w-auto motion-reduce:animate-none"
          style={{ animationPlayState: paused ? "paused" : "running" }}
        >
          <ul aria-label={academies.listLabel} className={LIST}>
            {academies.names.map((name) => (
              <li key={name} className={NAME}>{name}</li>
            ))}
          </ul>
          <ul aria-hidden="true" className={`${LIST} motion-reduce:hidden`}>
            {academies.names.map((name) => (
              <li key={name} className={NAME}>{name}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
