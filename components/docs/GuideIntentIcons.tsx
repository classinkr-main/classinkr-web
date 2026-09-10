import type { SVGProps } from "react"

/**
 * 가이드 인텐트 아이콘 4종.
 *
 * 같은 화면의 lucide 아이콘과 나란히 놓이므로 좌표계를 그쪽에 맞춘다 — 24×24 viewBox,
 * stroke 2, round cap/join, 색은 currentColor. 네 아이콘의 시각 크기(잉크 박스)는
 * 19.5~20.0 × 18.0~19.5, 중심은 (12,12)에서 0.3 이내로 맞춰 두었다. 좌표를 손볼 때는
 * 이 정렬이 깨지지 않는지 함께 확인한다.
 */

type GuideIconProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "fill" | "stroke">

const BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const

/** 도입 검토 — 자료를 펼쳐 살펴본다 */
export function GuideReviewIcon(props: GuideIconProps) {
  return (
    <svg {...BASE} {...props}>
      <rect x="3.2" y="3.4" width="12" height="15.6" rx="2" />
      <path d="M6.7 7.4h5M6.7 10.9h3" />
      <circle cx="15.7" cy="15.1" r="4.4" />
      <path d="m19 18.4 1.7 1.7" />
    </svg>
  )
}

/** 학원 운영 — 운영 현황을 보는 화면 */
export function GuideOpsIcon(props: GuideIconProps) {
  return (
    <svg {...BASE} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 8.5h18" />
      <path d="M7.5 16.5v-3M12 16.5v-4.5M16.5 16.5v-2" />
    </svg>
  )
}

/** 수업 진행 — 칠판 앞에서 수업을 연다 */
export function GuideTeachIcon(props: GuideIconProps) {
  return (
    <svg {...BASE} {...props}>
      <rect x="3" y="3.3" width="18" height="13.4" rx="2" />
      <path d="M9.5 16.7 7.8 20.8M14.5 16.7l1.7 4.1" />
      {/* 재생 표시는 작은 면으로 둔다 — 같은 크기의 외곽선 삼각형은 20px에서 뭉갠다 */}
      <path d="M10.4 7.85 14.4 10l-4 2.15z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** 수업 참여 — 수업 화면 속 참여자 */
export function GuideJoinIcon(props: GuideIconProps) {
  return (
    <svg {...BASE} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="12" cy="11" r="2.25" />
      <path d="M7.75 17a4.5 4.5 0 0 1 8.5 0" />
    </svg>
  )
}
