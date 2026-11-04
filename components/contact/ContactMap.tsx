"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { ArrowUpRight } from "lucide-react"

import { trackEvent } from "@/lib/analytics"

/**
 * 문의 화면의 목동 쇼룸 일러스트 지도(미니어처 3D 도시, V22-A).
 *
 * 바탕 세 장(땅·나무·건물)은 OpenStreetMap 데이터로 만든 정적 SVG다
 * (scripts/contact-map/generate_mokdong_map.py). 아래 % 위치는 그 스크립트가 출력한 값이다 —
 * 지도를 다시 만들면 같이 바꾼다.
 *
 * 움직임: 화면에 들어오면 도시가 솟고 핀이 떨어져 두 번 튄 뒤 멈춘다(4.8초 안에 끝, 반복 0).
 * 미완 상태의 CSS 는 site-base.css 의 no-preference 블록(⑨)에만 있어서 SSR·JS 없음·동작 줄이기는 완성 상태다.
 */

const ADDRESS_QUERY = "서울 양천구 목동동로 233-1"
const NAVER_MAP_URL = `https://map.naver.com/p/search/${encodeURIComponent(ADDRESS_QUERY)}`
const KAKAO_MAP_URL = `https://map.kakao.com/?q=${encodeURIComponent(ADDRESS_QUERY)}`

const at = (x: number, y: number): CSSProperties => ({ left: `${x}%`, top: `${y}%` })

const OFFICE_ROOF = at(23.38, 38.23)
const SBS_ROOF = at(59.47, 9.67)
const STATION = at(81.02, 90.7)
const PARK = at(50.93, 34.02)
const HYUNDAI_ROOF = at(81.99, 54.81)
const EXITS = [
  { no: 2, style: at(60.84, 67.32), main: true },
  { no: 1, style: at(61.21, 85.52), main: false },
  { no: 8, style: at(57.1, 90.55), main: false },
]
const ROADS = [
  { name: "목동동로", style: at(35.35, 60.96), deg: "rotate-[10.5deg]" },
  { name: "목동서로", style: at(67.29, 40.54), deg: "-rotate-[81deg]" },
  { name: "오목로", style: at(25, 85.3), deg: "rotate-[7.2deg]" },
]
const CLOUDS = [at(57, 55), at(2, 70)]

type Phase = "idle" | "armed" | "play"

function useMapPhase() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [phase, setPhase] = useState<Phase>("idle")

  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === "undefined") return
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let observer: IntersectionObserver | null = null
    // 카드는 framer 등장(투명 → 보임) 전이라 무장해도 깜빡이지 않는다. 동기 setState 를 피해 다음 프레임에 무장한다
    const frame = window.requestAnimationFrame(() => {
      setPhase("armed")
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setPhase("play")
            observer?.disconnect()
          }
        },
        { threshold: 0.35 },
      )
      observer.observe(node)
    })

    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [])

  return { ref, phase }
}

function MapLabel({ children, style, className = "" }: { children: ReactNode; style: CSSProperties; className?: string }) {
  return (
    <span
      data-cm="label"
      style={style}
      className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-line-hair bg-surface-sheet/95 px-2 py-0.5 text-label text-fg-body ${className}`}
    >
      {children}
    </span>
  )
}

function Cloud({ style }: { style: CSSProperties }) {
  return (
    <svg data-cm="cloud" style={style} className="absolute h-[60px] w-[74px]" viewBox="0 0 74 60" aria-hidden="true">
      <path className="fill-fg-ink/10" d="M30 50a9 9 0 0 1 3-17 13 13 0 0 1 24-4 9 9 0 0 1 12 8 7 7 0 0 1-2 13Z" />
      <path className="fill-surface-sheet" d="M10 34a9 9 0 0 1 3-17 13 13 0 0 1 24-4 9 9 0 0 1 12 8 7 7 0 0 1-2 13Z" />
    </svg>
  )
}

export function ContactMap() {
  const { ref, phase } = useMapPhase()

  return (
    <div>
      <div className="relative">
        <div
          ref={ref}
          data-moment="contact-map"
          data-cm-phase={phase === "idle" ? undefined : phase}
          role="img"
          aria-label="목동 쇼룸 위치 그림 지도. 현대드림타워(목동동로 233-1)는 오목공원 서쪽, SBS 남서쪽에 있고 오목교역 2번 출구에서 약 350m 거리입니다."
          className="relative isolate aspect-[396/500] w-full overflow-hidden rounded-xl border border-line-hair bg-surface-sunken"
        >
          <div data-cm="ground" className="absolute inset-0 bg-[url(/images/contact/mokdong-map-ground.svg)] bg-cover bg-no-repeat" />
          <div data-cm="trees" className="absolute inset-0 bg-[url(/images/contact/mokdong-map-trees.svg)] bg-cover bg-no-repeat" />
          <div data-cm="buildings" className="absolute inset-0 bg-[url(/images/contact/mokdong-map-buildings.svg)] bg-cover bg-no-repeat" />
          {/* 구름은 라벨 아래 층 */}
          {CLOUDS.map((style, i) => (
            <Cloud key={i} style={style} />
          ))}

          {ROADS.map((road) => (
            <span
              key={road.name}
              data-cm="label"
              style={road.style}
              className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm bg-surface-sheet/85 px-1 text-note text-fg-muted ${road.deg}`}
            >
              {road.name}
            </span>
          ))}
          <MapLabel style={PARK}>오목공원</MapLabel>
          <MapLabel style={HYUNDAI_ROOF}>현대백화점</MapLabel>
          <MapLabel style={SBS_ROOF} className="border-line-ink px-2.5 text-fg-ink">SBS</MapLabel>

          {/* 오목교역: 5호선 선로·역 범위는 바탕(ground)에 있고, 여기서는 역 이름과 가까운 출구 번호를 얹는다 */}
          {EXITS.map((exit) => (
            <span
              key={exit.no}
              data-cm="label"
              style={exit.style}
              className="absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center"
            >
              <svg className="absolute inset-0 size-5" viewBox="0 0 20 20" aria-hidden="true">
                <circle
                  cx="10"
                  cy="10"
                  r="9"
                  className={exit.main ? "fill-fg-ink stroke-surface-sheet" : "fill-surface-sheet stroke-fg-ink"}
                  strokeWidth="1.5"
                />
              </svg>
              <span className={`relative text-note font-semibold ${exit.main ? "text-surface-sheet" : "text-fg-ink"}`}>{exit.no}</span>
            </span>
          ))}
          <span
            data-cm="label"
            style={STATION}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-md border border-line-ink bg-surface-sheet py-1 pl-1 pr-2.5"
          >
            <span className="relative grid size-6 place-items-center">
              <svg className="absolute inset-0 size-6" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="12" className="fill-fg-ink" />
              </svg>
              <span className="relative text-label text-surface-sheet">5</span>
            </span>
            <span className="text-label text-fg-ink">오목교역</span>
          </span>

          {/* 쇼룸: 핀은 현대드림타워 지붕 가운데에 꽂힌다 */}
          <svg data-cm="pin-shadow" style={OFFICE_ROOF} className="absolute h-1.5 w-4 -translate-x-1/2 -translate-y-1/2" viewBox="0 0 16 6" aria-hidden="true">
            <ellipse cx="8" cy="3" rx="8" ry="3" className="fill-fg-ink/35" />
          </svg>
          <svg data-cm="halo" style={OFFICE_ROOF} className="absolute size-6 -translate-x-1/2 -translate-y-1/2 text-fg-accent opacity-0" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          <svg data-cm="pin" style={OFFICE_ROOF} className="absolute h-[39px] w-[31px] -translate-x-1/2 -translate-y-full text-fg-accent" viewBox="0 0 31 39" aria-hidden="true">
            <path
              d="M15.5 37.5S3 25 3 15.5a12.5 12.5 0 0 1 25 0C28 25 15.5 37.5 15.5 37.5Z"
              fill="currentColor"
              className="stroke-surface-sheet"
              strokeWidth="2.2"
            />
            <circle cx="15.5" cy="15.5" r="5" className="fill-surface-sheet" />
          </svg>
          <div
            data-cm="chip"
            style={{ left: "calc(23.38% - 56px)", top: "38.23%" }}
            className="absolute -translate-y-[calc(100%_+_48px)] rounded-md border border-line-strong bg-surface-sheet px-3 py-1.5"
          >
            <p className="whitespace-nowrap text-label text-fg-ink">ClassIn 목동 쇼룸</p>
            <p className="whitespace-nowrap text-note text-fg-muted">현대드림타워 806호</p>
          </div>
        </div>
        {/* 지도 데이터 출처(ODbL). role="img" 안의 링크는 보조기기에 닿지 않아 지도 바깥 형제로 겹쳐 둔다 */}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-1.5 left-2 rounded-sm bg-surface-sheet/85 px-1 text-note text-fg-muted underline-offset-2 hover:underline"
        >
          © OpenStreetMap
        </a>
      </div>

      <p className="mt-3 text-note text-fg-muted">오목교역(5호선) 2번 출구에서 걸어서 약 350m</p>
      <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
        <a
          href={NAVER_MAP_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent("click_cta", { button: "contact_map_naver", page: "/contact" })}
          className="inline-flex items-center gap-1 text-label text-fg-accent underline decoration-line-link underline-offset-4 hover:text-fg-accent-hover"
        >
          네이버 지도에서 열기
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
        <a
          href={KAKAO_MAP_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent("click_cta", { button: "contact_map_kakao", page: "/contact" })}
          className="inline-flex items-center gap-1 text-label text-fg-accent underline decoration-line-link underline-offset-4 hover:text-fg-accent-hover"
        >
          카카오맵에서 열기
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  )
}
