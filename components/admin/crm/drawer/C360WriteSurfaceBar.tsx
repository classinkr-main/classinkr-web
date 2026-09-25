"use client"

// A안(2026-09-25) "기록은 Compass에서" 바 — Compass 에 매칭된 리드의 360 드로어·기록 탭 리드 포커스에서
// Home 컴포저 자리에 놓는다. 상태를 갖지 않는 presentational 컴포넌트다(펼침 상태·dirty 는 부모 소유).
//
//  - 왼쪽: "기록은 Compass에서" + 힌트(콜·문자·미팅은 Compass 에 남기면 마지막 연락·타임라인에 반영).
//  - 오른쪽: (선택) Compass 새 탭 링크 + "Home에 따로 남기기 / 접기" 토글. 토글은 aria-expanded·aria-controls 로
//    접힌 Home 컴포저 영역을 가리킨다. 작성 중(canCollapse=false)이면 접기를 내놓지 않는다 — 초안을 숨기지 않는다.
//  - 이 폴더(drawer/*)는 접근성 소스 계약 테스트가 합쳐 읽는다 — 상태색은 lib/crm/status-tone 토큰만 쓴다.
//  - 모바일: 세로로 쌓고 토글은 전체 폭. 터치 44px 은 드로어 컨테이너 규칙([&_a]/[&_button]:min-h-11)을 상속하고,
//    컨테이너 밖(기록 탭)에서는 min-h-11 sm:min-h-0 을 직접 준다.

import { ChevronDown, StickyNote } from "lucide-react"

import CompassOpenLink from "@/components/admin/compass/CompassOpenLink"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import {
  COMPASS_DOWN_WRITE_CAPTION,
  COMPASS_WRITE_HINT,
  COMPASS_WRITE_TITLE,
  HOME_ONLY_CAPTION,
  HOME_SEPARATE_LOG_LABEL,
} from "@/lib/crm/write-surface"

/** 360 드로어의 접히는 Home 컴포저 영역 id — 토글의 aria-controls 가 가리킨다. */
export const C360_HOME_COMPOSER_ID = "c360-home-composer"

export interface C360WriteSurfaceBarProps {
  /** 대표 Compass 리드 딥링크 — showOpenLink 일 때만 그린다(드로어는 헤더에 주 링크가 이미 있다). */
  compassHref?: string | null
  /** 스크린리더 라벨용 고객 이름 */
  name?: string | null
  /** Home 컴포저가 지금 보이는가 */
  open?: boolean
  /** 없으면 토글을 그리지 않는다(안내만 하는 자리). */
  onToggle?: () => void
  /** 작성 중이면 false — "접기"를 내놓지 않는다. */
  canCollapse?: boolean
  /** 토글이 여닫는 영역 id */
  controlsId?: string
  /** 바 안에 Compass 주 링크를 함께 그린다(헤더에 링크가 없는 자리 — 기록 탭). */
  showOpenLink?: boolean
  /** 드로어 밖(컨테이너 터치 규칙 없음)에서 44px 터치 타깃을 직접 준다. */
  standalone?: boolean
  testId?: string
}

export default function C360WriteSurfaceBar({
  compassHref = null,
  name = null,
  open = false,
  onToggle,
  canCollapse = true,
  controlsId = C360_HOME_COMPOSER_ID,
  showOpenLink = false,
  standalone = false,
  testId = "c360-write-surface-bar",
}: C360WriteSurfaceBarProps) {
  const showToggle = Boolean(onToggle) && !(open && !canCollapse)
  const toggleLabel = open && canCollapse ? "접기" : HOME_SEPARATE_LOG_LABEL
  const touchClass = standalone ? "min-h-11 sm:min-h-0 sm:h-8" : "h-8"
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#111110]">
          <StickyNote aria-hidden className="h-3.5 w-3.5 text-[#084734]" />
          {COMPASS_WRITE_TITLE}
        </p>
        <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">{COMPASS_WRITE_HINT}</p>
      </div>
      {showToggle || (showOpenLink && compassHref) ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {showOpenLink && compassHref ? (
            <CompassOpenLink
              href={compassHref}
              name={name}
              variant="primary"
              className={`w-full sm:w-auto ${touchClass}`}
              testId={`${testId}-open-compass`}
            />
          ) : null}
          {showToggle ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-controls={controlsId}
              className={`inline-flex w-full items-center justify-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#1a1a1a]/60 transition-colors hover:bg-[#fafaf8] hover:text-[#111110] sm:w-auto ${touchClass}`}
            >
              {toggleLabel}
              <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Home 에 따로 남기는 기록이 Compass 에 보이지 않는다는 사실 — 펼친 Home 컴포저 위 한 줄.
 * 상태가 아니라 늘 참인 안내라 신호색 없이 보조 글자색으로 둔다.
 */
export function HomeOnlyCaption({ className = "" }: { className?: string }) {
  return (
    <p data-testid="c360-home-only-caption" className={`text-[11px] text-[#1a1a1a]/45 ${className}`}>
      {HOME_ONLY_CAPTION}
    </p>
  )
}

/** Compass 연결이 끊겨 응대 위치를 확인할 수 없다는 사실 — "매칭 없음"과 구분한다. */
export function CompassDownWriteCaption({ className = "" }: { className?: string }) {
  return (
    <p data-testid="c360-compass-down-write" className={`text-[11px] ${STATUS_TONE_TEXT_CLASS.warning} ${className}`}>
      {COMPASS_DOWN_WRITE_CAPTION}
    </p>
  )
}
